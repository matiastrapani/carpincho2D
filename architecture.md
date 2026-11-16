# ARCHITECTURE.md — Reglas Inviolables del Proyecto CAD

## 1. Única Fuente de Verdad (Estado Centralizado)
- **Entidades del dibujo:** `CADService.entities` es la única lista oficial de objetos en el lienzo.
- **Selección y edición:** `SelectionManager` es el único dueño de `selectedEntities`, `selectedSegments`, `editingEntities` y `selectedHandles`.
- **Capas:** `LayerManager` es el único dueño de la estructura y visibilidad/bloqueo de capas.
- **Prohibido en UI:** Ningún panel (`PropertyPanelUI`, `LayerPanelUI`, etc.) puede guardar copias propias de arrays de entidades o selección. Deben leer en vivo mediante getters y suscribirse a cambios (`subscribe` / `refresh`).

## 2. Reglas de Capas y Selección
- **Separación Capa Lógica vs. Capa Visual:** La pertenencia lógica de cualquier entidad (visibilidad, bloqueo, color `BYLAYER` y exportación) se rige exclusivamente por `entity.data.layerId` en `LayerManager`. Las entidades punto (`data.isPointEntity`) residen visualmente en `pointsLayer` (por encima de `nodesLayer`) sin importar su capa lógica; ningún comando (`AddEntityCommand`, `ChangeLayerCommand`, etc.) debe moverlas dentro de `layer.paperGroup`.
- Ninguna entidad perteneciente a una capa **bloqueada** (`locked: true`) u **oculta** (`visible: false`) puede ser seleccionada, editada ni incluida en selección por recuadro.
- Si una capa se oculta o bloquea, el panel de propiedades debe filtrar automáticamente esas entidades sin borrarlas del lienzo.


## 3. Historial Undo / Redo (Patrón Command)
- Toda acción que cree, modifique, mueva, recorte o borre entidades o propiedades debe ejecutarse a través de una clase `Command` (`cadService.executeCommand(cmd)`).
- Al borrar o deshacer (`undo`), los comandos deben limpiar el estado de selección usando los métodos oficiales de `SelectionManager` (`deselectEntity`, `deselectAllEditingEntities`), nunca manipulando arrays directamente con `.splice()` o `.push()`.

## 4. Separación UI / Lógica CAD (Renderizado Visual y DOM)
- Ningún panel HTML (`PropertyPanelUI`, `LayerPanelUI`) ni herramienta de UI puede modificar directamente propiedades geométricas o visuales de Paper.js (`entity.strokeColor = ...`, `entity.position = ...`).
- La UI **solo dispara intenciones** (`cadService.executeCommand(...)` o llamadas a servicios centrales). La modificación real ocurre exclusivamente dentro de los Comandos o Servicios. *(Excepción controlada: previsualización temporal durante un arrastre activo que se revierte o consolida en `onChangeEnd`/`mouseup`)*.

## 5. Higiene de Código, Memoria y Tamaño
- **Cero Listeners Huérfanos:** Todo `addEventListener` global (`window`, `document`) o en elementos persistentes debe guardar su referencia (`bound`) y removerse explícitamente en `cleanup()` / `destroy()`.
- **Sin Encubrimiento de Errores:** Prohibido abusar del encadenamiento opcional (`?.`) para ocultar dependencias rotas. Si un servicio obligatorio falta, debe fallar de forma visible o validarse explícitamente al inicio, no silenciarse.
- **Límite de Tamaño (Anti-Archivos Dios):** Ningún archivo debe superar las **300–350 líneas**. Si un archivo nuevo o modificado supera ese umbral, se debe proponer dividirlo en módulos pequeños con responsabilidad única, desensamblando progresivamente los archivos monolíticos existentes cuando toque intervenirlos.
- **Aislamiento en Módulos Nuevos:** Prohibido usar `window.*` en archivos nuevos; todas las dependencias entran por `constructor`.

## 6. Protocolo de Trabajo IA <-> Usuario
1. **Plan antes de código:** Antes de escribir JS, explicar en español qué archivos y métodos se tocan (máximo 2 archivos), por qué es la solución definitiva y qué puede verse afectado. Esperar aprobación explícita.
2. **Solo Métodos Completos:** Nunca entregar archivos enteros ni fragmentos sueltos de 2 líneas. Entregar siempre **el método completo** desde su firma `nombreMetodo(...) {` hasta su llave de cierre `}`, indicando claramente a qué clase pertenece.
3. **Chats atómicos:** Una tarea por chat. Al terminar y verificar en navegador, hacer `git commit` y abrir chat nuevo adjuntando este `ARCHITECTURE.md`.

## 7. Estándares de Interfaz y Estilo (UI / CSS)
- **Tipografía Única:** Toda la interfaz (incluyendo `<button>`, `<input>`, `<select>`, consola y tooltips) debe usar exclusivamente la familia `'Inter', sans-serif`. Prohibido mezclar `font-mono` o fuentes del sistema en controles de UI.
- **Sistema Único de Tooltips:** Todo tooltip de la aplicación debe implementarse mediante el atributo `data-tooltip="..."` (y clases de alineación como `tooltip-top`, `tooltip-top-left`). Prohibido usar el atributo nativo `title="..."` del navegador.
- **Modularidad CSS:** Al igual que los módulos JS, los archivos CSS deben mantenerse acotados (< 350 líneas) y dividirse por dominio funcional cuando crezcan.

## 8. Extensibilidad de Propiedades por Tipo de Entidad
- **Modelo de Datos Plano (`entity.data`):** Toda propiedad específica de una entidad (`radius`, `width`, `height`, `fontSize`, `dashArray`, etc.) debe almacenarse como dato serializable en `entity.data`. Ningún estado geométrico o estilístico puede residir únicamente en nodos o propiedades internas de Paper.js.
- **Vistas Componibles (Anti-Condicionales Monolíticos):** Prohibido agregar cadenas `if/else` por `entity.type` dentro de `PropertySingleView` o `PropertyBatchView`. Cada dominio de propiedades específicas debe encapsularse en un constructor de sección independiente (`*Section.js` < 250 líneas) registrado por tipo o capacidad de entidad.
- **Contrato Obligatorio de Interacción Continua:** Todo control nuevo con actualización en tiempo real (sliders, scrubs, color pickers) debe usar `PropertyControls.attachScrubInput` (o equivalente estándar) cumpliendo estrictamente las 3 fases:
  1. `onScrubStart`: capturar *snapshot* clonado de `oldState` y activar `_isPreviewing = true`.
  2. `onLiveChange`: previsualizar únicamente mediante `PropertyManager.previewEntitiesProperty(...)` (que actualiza `entity.data` y recalcula la geometría en Paper.js).
  3. `onChange` / cancelación (`Escape` / `pointercancel`): restaurar `_isPreviewing = false` antes de despachar el `Command` o revertir el estado.
- **Evaluación Genérica en Lote (`BatchSelectionAnalyzer`):** En selección múltiple, solo se renderizan las secciones compartidas por el 100% de las entidades seleccionadas. La comparación de valores iguales o mixtos (`?` / `-- Varios --`) debe resolverse mediante descriptores declarativos (`getValue`, `isEqual`), nunca agregando bucles específicos por propiedad.
- **Invariantes Geométricos y Clonado:** La validación de rangos físicos (`radius > 0`, `width >= 0.1`, etc.) y el recálculo de geometría/handles ocurren en el Servicio o Comando, nunca solo en el HTML. Todo *snapshot* de propiedades compuestas (arrays u objetos) debe clonarse por valor, y toda nueva clave de `entity.data` debe soportarse en duplicación, guardado y exportación.