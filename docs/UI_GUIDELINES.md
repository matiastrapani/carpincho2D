# UI_GUIDELINES.md — Arquitectura y Estándares de Interfaz (UI / CSS)

## 1. Estándares Visuales, Tipografía, HUD DOM y Consola
- **Tipografía única:** Toda la interfaz (incluyendo `<button>`, `<input>`, `<select>`, consola, tooltips y overlays del HUD) debe usar exclusivamente la familia `'Inter', sans-serif`. Prohibido mezclar `font-mono` o fuentes del sistema en controles de UI.
- **Números tabulares en lecturas dinámicas:** Todo indicador numérico que cambie en tiempo real (coordenadas del HUD, etiquetas de distancia/ángulo/radio e inputs de propiedades) debe aplicar `font-variant-numeric: tabular-nums` para evitar desplazamientos horizontales durante el movimiento del puntero.
- **Tokens visuales centralizados (`CAD_THEME`):** Los colores de selección, grips, guías, marcadores OSNAP y opacidades deben obtenerse de `config/cadTheme.js` o variables CSS del tema. Prohibido hardcodear colores hexadecimales en módulos JS.
- **Overlays DOM del HUD (`.hud-feedback-label`):** Las etiquetas flotantes de cotas, radios y ángulos sobre el lienzo se gestionan exclusivamente en DOM desde `HUDManager` (prohibido usar `paper.PointText`). Deben tener `pointer-events: none`, posicionamiento adaptativo respecto a los bordes del viewport y color sincronizado con la entidad/capa activa (`color.toCSS(false)`), aplicando 70 % de opacidad en las etiquetas de ángulo.
- **Consola fija y flotante (`.cmd-option` / `.cad-console-group`):**
  - Las opciones contextuales (`[<u>D</u>iámetro]`) subrayan su letra activadora (`key`) y escuchan `mousedown` con `e.preventDefault()` para dispararse sin robar el foco del `<input>` activo.
  - Los logs pertenecientes a una misma ejecución de herramienta se agrupan visualmente dentro de `.cad-console-group` (y `.is-multiline` cuando superan una línea) de forma espejada en `FixedConsoleUI` y `FloatingConsoleUI`.
- **Sistema único de tooltips:** Todo tooltip de la aplicación debe implementarse mediante el atributo `data-tooltip="..."` (y clases de alineación como `tooltip-top`, `tooltip-top-left`). Prohibido usar el atributo nativo `title="..."` del navegador.
- **Modularidad CSS:** Al igual que los módulos JS, los archivos CSS deben mantenerse acotados (< 350 líneas) y dividirse por dominio funcional cuando crezcan.

## 2. Arquitectura de Paneles y Propiedades Componibles
- **Lectura en vivo:** Ningún panel (`PropertyPanelUI`, `LayerPanelUI`, etc.) puede almacenar copias propias de arrays de entidades o selección; deben consultar los getters del servicio/gestor y suscribirse a eventos (`subscribe` / `refresh`).
- **Vistas componibles (Anti-condicionales monolíticos):** Prohibido agregar cadenas `if/else` por `entity.type` dentro de `PropertySingleView` o `PropertyBatchView`. Cada dominio de propiedades específicas debe encapsularse en un constructor de sección independiente (`*Section.js` < 250 líneas) registrado por tipo o capacidad de entidad.
- **Evaluación genérica en lote (`BatchSelectionAnalyzer`):** En selección múltiple, solo se renderizan las secciones compartidas por el 100 % de las entidades seleccionadas. La comparación de valores iguales o mixtos (`?` / `-- Varios --`) debe resolverse mediante descriptores declarativos (`getValue`, `isEqual`), nunca agregando bucles específicos por propiedad.
- **Invariantes y clonado:** Todo *snapshot* de propiedades compuestas (arrays u objetos) debe clonarse por valor antes de previsualizar o registrar comandos, y toda nueva clave en `entity.data` debe contemplarse en duplicación, guardado y exportación.

## 3. Contrato Obligatorio de Interacción Continua (Scrubs / Sliders)
Todo panel con controles de actualización en vivo debe proteger su método `refresh()` comenzando con `if (this._isPreviewing) return;` (no basta con filtrar solo en el callback de `subscribe`), evitando destruir el DOM y perder `setPointerCapture` durante el arrastre. Todo control continuo debe usar `PropertyControls.attachScrubInput` (o equivalente estándar) cumpliendo estrictamente las 3 fases:
1. **`onScrubStart`:** Capturar *snapshot* clonado de `oldState` y activar `this._isPreviewing = true`.
2. **`onLiveChange`:** Previsualizar únicamente mediante el método oficial del gestor (`PropertyManager.previewEntitiesProperty(...)` o `LayerManager.previewLayerVisuals(...)`) sin reconstruir la UI.
3. **`onChange` / cancelación (`Escape` / `pointercancel`):** Restaurar `this._isPreviewing = false` antes de despachar el `Command` o revertir el estado.

## 4. Popovers y Diálogos con Vista Previa
Todo selector flotante con actualización en vivo (como `ColorPickerPopover`) debe:
- Aislar su propio historial local (`Ctrl+Z` / `Ctrl+Y`) mientras permanece abierto.
- Despachar **un único `Command` compuesto** al confirmar o cerrar (aunque modifique múltiples propiedades a la vez, como color y opacidad).
- Revertir al *snapshot* inicial al presionar `Escape` sin registrar pasos en el historial global de la aplicación.