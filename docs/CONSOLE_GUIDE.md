# CONSOLE_GUIDE.md — Guía de Diseño y Reglas de la Consola (Estilo Rhino 3D)

Este documento define cómo se comporta la consola del CAD (fija y flotante), cómo dialoga con las herramientas y el historial, y qué piezas compartidas deben reutilizarse para evitar duplicar código o criterios.

---

## 1. Filosofía: ¿Qué es (y qué NO es) nuestra consola?

| Lo que SÍ es | Lo que NO es (Errores a evitar) |
| :--- | :--- |
| **Un guía conversacional:** Acompaña cada paso de la herramienta activa indicando qué espera, qué opciones hay y cuál es el valor por defecto. | **Un formato de guardado:** No usamos el texto de la consola para reconstruir planos complejos desde cero ni reemplazar un archivo de proyecto. |
| **Un bus único de acciones:** Toda acción relevante (dibujar, editar, deshacer, cambiar capas o propiedades) pasa por el mismo flujo y deja rastro legible. | **Un grabador de clics del ratón:** No traducimos selecciones con el mouse ni movimientos de sliders a comandos artificiales tipo `SelName` o `-Properties`. |
| **Un ejecutor de comandos y alias:** Permite invocar herramientas o acciones por nombre completo o alias corto (`l`, `pl`, `c`, `m`, `u`) y encadenar entradas por teclado. | **Un cuello de botella para la UI:** Cambiar un color o visibilidad en un panel debe ser inmediato y limpio, sin inundar el historial con ruido técnico. |

---

## 2. Anatomía de un Paso en Consola (Interacción Rhino)

Cada vez que una herramienta está activa y espera datos del usuario (`BaseTool.setStep`), la consola renderiza una línea estructurada en `fixedUI` y `floatingUI`:

> `[CIRCULO] Especifique el radio <25.00> [Diámetro]:`

1. **Tag de herramienta (`[CIRCULO]`):** Se genera automáticamente desde `normalizeCommandKey` (sin tildes y en mayúsculas) para contextualizar qué comando espera el dato.
2. **Instrucción concisa (`Especifique el radio`):** Nombra **únicamente el dato principal** esperado en ese paso. Prohibido agregar aclaraciones redundantes como *"o un punto en el círculo"* o *"o ingrese coordenadas"*, ya que el lector acepta clics y coordenadas de forma universal.
3. **Valor por defecto (`<25.00>`):** Representa el último valor numérico válido confirmado en esa herramienta durante la sesión. Si el usuario presiona `Enter` o `Espacio` con el input vacío, se acepta automáticamente (`ACCEPT_DEFAULT`).
4. **Opciones contextuales (`[Diámetro]`):**
   - Se declaran en `CAD_CATALOG.tools.<id>.options` como `{ key: 'D', label: 'Diámetro' }` y se pasan a `setStep(instruction, { defaultValue, options })`.
   - Se renderizan como botones `.cmd-option[data-cmd="D"]` con la letra activadora subrayada (`[<u>D</u>iámetro]`) y escuchan `mousedown` (con `preventDefault`) para dispararse sin robar ni perder el foco del input.
5. **Entrada flexible:** En un mismo paso, el usuario puede hacer clic en el lienzo, escribir coordenadas absolutas (`100,50`), relativas (`@50,0`), polares (`@50<45`), ingresar un número (`25`) o activar una opción (`d` + `Enter` o clic).

---

## 3. Piezas Reutilizables del Motor (Cero Duplicación entre Herramientas)

Ninguna herramienta puede implementar por su cuenta cómo se parsean entradas de texto ni cómo se definen sus textos y alias:

### A. Catálogo Centralizado (`config/cadCatalog.js` — `CAD_CATALOG`)
Toda herramienta (`CAD_CATALOG.tools.<id>`) y comando global (`CAD_CATALOG.commands.<id>`) registra en un único lugar:
- `displayName` y `aliases` (resueltos por `ToolManager.resolveCommand` y `resolveCatalogEntry`).
- `prompts` (mensajes de cada paso), `options` (`{ key, label }`) y `logs` (plantillas de salida).
- `ui` (`buttonId`, `iconId`, `iconName`) para sincronizar la barra de herramientas desde `CADUtils.setTool`.

### B. Lector Único de Entradas (`services/input/CommandInputParser.js`)
Centraliza la interpretación de todo texto ingresado mientras una herramienta está activa:
- Cadena vacía (`Enter` / `Espacio`) -> `{ type: 'ACCEPT_DEFAULT' }`
- Letra clave o nombre de opción activa -> `{ type: 'OPTION', key }`
- Valor numérico (`25`, `12.5`) -> `{ type: 'NUMBER', value }`
- Coordenadas absolutas (`100,50`), relativas (`@50,0`) o polares (`@50<45`) -> `{ type: 'POINT', point }`
- Sintaxis inválida -> `{ type: 'ERROR', message }` (mensaje localizado en español listo para `this.logTagged(parsed.message)`).

### C. Selección en Herramientas
Ninguna herramienta debe escribir bucles manuales de `hitTest` dentro de su clase; debe delegar en los handlers compartidos (`DivisionSelectionHandler`, `TrimSelectionHandler`, `BoxSelectHandler`), respetando siempre la exclusión de capas ocultas (`visible: false`) o bloqueadas (`locked: true`).

---

## 4. Flujo de Teclado, Foco y Repetición de Comandos

El flujo entre `InputDispatcher.js` y `ConsoleManager.js` sigue cuatro reglas inviolables:

1. **Redirección estilo Rhino 3D (`InputDispatcher`):**
   - Si el foco está en el lienzo (no en un `<input>` del panel lateral) y el usuario presiona cualquier tecla imprimible sin `Ctrl`/`Alt`, `InputDispatcher` enfoca automáticamente el input activo de consola (`floatingUI.input` si está abierta, o `fixedUI.input`) y escribe el carácter.
   - Las teclas de función (`F2` Consola flotante, `F3` OSNAP, `F4` Zoom Extents, `F7` Grilla, `F8` Ortho, `F9` Grid Snap, `F10`/`F11` Nodos) y `Alt` mantenido (suspensión temporal de OSNAP) se interceptan globalmente.
2. **Aislamiento obligatorio de eventos en consola (`stopPropagation`):**
   - `ConsoleManager._handleInputKeyDown` debe ejecutar `e.preventDefault()` y `e.stopPropagation()` en `Enter`, `Espacio` (`' '`) y `Escape`.
   - **Por qué es crítico:** Si `Enter` burbujea hasta `window`, `InputDispatcher` vuelve a capturarlo en el mismo ciclo de evento y lo interpreta como un segundo `Enter` vacío, confirmando valores por defecto o cerrando la herramienta prematuramente.
3. **Repetición de la última herramienta en `Select`:**
   - Cuando `utils.currentToolMode === 'select'` y el usuario presiona `Enter` o `Espacio` con la consola vacía, `ConsoleManager.handleExecute('')` reactiva `utils.lastActiveToolMode` (igual que el clic derecho en `SelectTool`), funcionando sin importar si la herramienta anterior se activó por botón, atajo o consola.
4. **`Undo` / `Redo` contextual dentro de herramientas:**
   - Al ejecutar `deshacer` (`u`) / `rehacer` o presionar `Ctrl+Z` / `Ctrl+Y` durante un comando activo, `ConsoleManager._runHistoryAction` consulta primero `activeTool.onUndo()` / `activeTool.onRedo()` (por ejemplo, para deshacer el último vértice en `LineTool` o `PolylineTool`). Si la herramienta no lo soporta o no tiene pasos internos, cancela el comando activo y ejecuta el `undo`/`redo` global.

---

## 5. Agrupación Visual y Trazabilidad de `Undo / Redo`

- **Agrupación por sesión de comando (`beginCommandGroup` / `endCommandGroup`):**
  - Al activar una herramienta desde `CADUtils.setTool`, se imprime `Comando: <Nombre>` fuera de grupo (`grouped: false`) y se abre un contenedor `.cad-console-group` tanto en la consola fija como en la flotante.
  - Todas las entradas del usuario (`logStepInput`) y mensajes del sistema (`logTagged` / `logSystem`) ocurridos mientras la herramienta está activa se insertan dentro de ese bloque agrupado (activando `.is-multiline` cuando contiene más de una línea).
  - Al salir a `Seleccionar`, cancelar (`Esc` / clic derecho) o cambiar de herramienta, se cierra el grupo (`endCommandGroup`).
- **Logs unificados de transacciones (`CADService._handleHistoryTransaction`):**
  - Los paneles (`LayerPanelUI`, `PropertyPanelUI`) solo despachan comandos (`cadService.executeCommand(...)`).
  - `CADService` escucha cada transacción y emite en consola:
    - Ejecución: `[<TAG>] <Descripción>` (dentro del grupo activo si hay una herramienta corriendo).
    - Deshacer / Rehacer: `[DESHACER] <Entidad o acción>` y `[REHACER] <Entidad o acción>` (siempre fuera de grupo, `grouped: false`).

---

## 6. Ciclo de Vida y Salida de Herramientas (`BaseTool`)

1. **Estados explícitos sin tocar el DOM:** Toda herramienta administra sus pasos mediante `this.setStep(instruction, { defaultValue, options })` y sus mensajes mediante `this.logTagged(msg)`. Prohibido manipular `document.getElementById('cmdInput')` o `commandPrompt` desde subclases.
2. **Continuidad en herramientas de creación:** Las herramientas de dibujo (`PointTool`, `LineTool`, `PolylineTool`, `CircleTool`) permanecen activas tras confirmar cada entidad para permitir crear múltiples objetos consecutivos en la misma sesión, conservando sus valores por defecto (`lastRadius`, punto de referencia relativo `@`, etc.).
3. **Salida limpia unificada:**
   - Si hay una operación en curso (ej. segundo punto de línea, radio de círculo, vértices de polilínea), `Enter` vacío o clic derecho confirman el paso/trazo actual si es válido, o cancelan el paso incompleto.
   - Si la herramienta está en reposo esperando el primer punto de una nueva entidad (tras haber creado al menos una, o antes de empezar), `Enter` vacío, clic derecho o `Escape` salen limpiamente a `SelectTool` (`exitToSelect()` / `handleCancel()`).
4. **Formato estándar de salida (`logTagged`):**
   - `[LINEA] Línea 1 creada: Longitud = 120.50, Ángulo = 30.0°`
   - `[CIRCULO] Círculo 1 creado: Centro = (50.00,0.00), Radio = 25.00`
   - `[PUNTO] Punto 1 creado en (10.00,20.00)`

---

## 7. Checklists de Control (Inicio y Cierre)

### Checklist ANTES de programar una herramienta o flujo de consola
- [ ] **¿Textos y opciones en `CAD_CATALOG`?** ¿Registré `displayName`, `aliases`, `prompts`, `options` (`{ key, label }`) y `logs` en `config/cadCatalog.js` en lugar de hardcodear strings en la herramienta?
- [ ] **¿Uso `CommandInputParser` y `setStep`?** ¿Delego el parseo de coordenadas, números y opciones en `CommandInputParser` y actualizo el prompt exclusivamente con `this.setStep(...)`?
- [ ] **¿Prompts limpios?** ¿La instrucción pide solo el dato principal sin frases redundantes como *"o un punto en..."*?
- [ ] **¿Reutilizo handlers de selección?** Si la herramienta selecciona entidades, ¿uso los handlers compartidos en lugar de escribir un `hitTest` manual?

### Checklist AL FINALIZAR un bloque de programación o herramienta
- [ ] **¿Sin doble disparo de `Enter`?** ¿Ingresar coordenadas o números en consola avanza un único paso sin confirmar por error el paso siguiente ni cerrar la herramienta?
- [ ] **¿Continuidad y salida coherentes?** ¿Puedo encadenar varias creaciones seguidas y salir limpiamente con `Enter` vacío en reposo, clic derecho o `Escape`?
- [ ] **¿Repetición en `Select` y `Undo/Redo` operativos?** ¿Presionar `Enter` en `Select` reactiva la última herramienta usada, y `Ctrl+Z` / `u` deshace pasos internos o el comando completo con `[DESHACER]`?
- [ ] **¿Límites de tamaño respetados?** ¿Los archivos nuevos se mantienen bajo **350 líneas** y no agregué lógica directa en `ConsoleManager.js` ni `InputDispatcher.js`?