# ARCHITECTURE.md — Reglas Inviolables del Proyecto CAD

## Guías Especializadas (Consultar según la tarea)
- **`TOOLS_GUIDELINES.md`**: Leer antes de crear o modificar herramientas interactivas, reglas de capas en Paper.js, previsualizaciones geométricas en `hudLayer` o cálculos/renderizado de OSNAP.
- **`CONSOLE_GUIDE.md`**: Leer antes de modificar `ConsoleManager`, `InputDispatcher`, `CommandInputParser`, `config/cadCatalog.js` o los pasos, opciones y logs de cualquier herramienta.
- **`UI_GUIDELINES.md`**: Leer antes de crear o modificar paneles HTML, hojas CSS, tooltips, popovers con vista previa, overlays DOM del HUD o controles de edición continua.

## 1. Única Fuente de Verdad (Estado Centralizado)
- **Entidades del dibujo:** `CADService.entities` es la única lista oficial de objetos en el lienzo.
- **Selección y edición:** `SelectionManager` es el único dueño de `selectedEntities`, `selectedSegments`, `editingEntities` y `selectedHandles`.
- **Capas:** `LayerManager` es el único dueño de la estructura y visibilidad/bloqueo de capas.
- **Catálogo y consola:** `CAD_CATALOG` (`config/cadCatalog.js`) es la única fuente de nombres, alias, prompts, opciones y mensajes de comandos/herramientas; `ConsoleManager` es el único dueño del estado del prompt y la agrupación del historial.
- **Prohibido en UI:** Ningún panel (`PropertyPanelUI`, `LayerPanelUI`, etc.) puede guardar copias propias de arrays de entidades o selección. Deben leer en vivo mediante getters y suscribirse a cambios (`subscribe` / `refresh`).

## 2. Reglas de Capas y Selección
- **Separación Capa Lógica vs. Capa Visual:** La pertenencia lógica de cualquier entidad (visibilidad, bloqueo, color `BYLAYER` y exportación) se rige exclusivamente por `entity.data.layerId` en `LayerManager`. Las entidades punto (`data.isPointEntity`) residen visualmente en `pointsLayer` (por encima de `nodesLayer`) sin importar su capa lógica; ningún comando debe moverlas dentro de `layer.paperGroup`.
- Ninguna entidad perteneciente a una capa **bloqueada** (`locked: true`) u **oculta** (`visible: false`) puede ser seleccionada, editada ni incluida en selección por recuadro.
- Si una capa se oculta o bloquea, los paneles deben filtrar automáticamente esas entidades sin borrarlas del lienzo.

## 3. Historial Undo / Redo (Patrón Command)
- Toda acción que cree, modifique, mueva, recorte o borre entidades o propiedades debe ejecutarse a través de una clase `Command` (`cadService.executeCommand(cmd)`).
- Todo `Command` debe estar soportado en `CADService._describeCommand(command)` para que `_handleHistoryTransaction` registre automáticamente su ejecución, `undo` (`[DESHACER]`) y `redo` (`[REHACER]`) en consola, respetando la agrupación activa por herramienta.
- Al borrar o deshacer (`undo`), los comandos deben limpiar el estado de selección usando los métodos oficiales de `SelectionManager` (`deselectEntity`, `deselectAllEditingEntities`), nunca manipulando arrays directamente.
- Todo popover o diálogo con vista previa en vivo debe aislar su propio historial local (`Ctrl+Z` / `Ctrl+Y`), despachar **un único `Command` compuesto** al confirmar/cerrar y revertir al *snapshot* inicial con `Escape` sin ensuciar el historial global.

## 4. Separación UI / Lógica CAD
- Ningún panel HTML ni herramienta de UI puede modificar directamente propiedades geométricas o visuales de Paper.js (`entity.strokeColor = ...`, `entity.position = ...`).
- La UI **solo dispara intenciones** (`cadService.executeCommand(...)` o llamadas a servicios centrales). La modificación real ocurre exclusivamente dentro de los Comandos o Servicios *(excepción: previsualización temporal durante un arrastre activo)*.
- Las etiquetas dinámicas de cotas/ángulos sobre el lienzo se renderizan como overlays DOM (`HUDManager` / `.hud-feedback-label`) y nunca como `paper.PointText`.

## 5. Higiene de Código, Memoria y Tamaño
- **Cero Listeners Huérfanos:** Todo `addEventListener` global (`window`, `document`) o en elementos persistentes debe guardar su referencia (`bound`) y removerse explícitamente en `cleanup()` / `destroy()`.
- **Sin Encubrimiento de Errores:** Prohibido abusar del encadenamiento opcional (`?.`) para ocultar dependencias rotas. Si un servicio obligatorio falta, debe fallar de forma visible o validarse al inicio.
- **Límite de Tamaño (Anti-Archivos Dios):** Ningún archivo JS o CSS nuevo debe superar las **300–350 líneas**. Los orquestadores existentes que ya alcanzan ese umbral (`CADUtils.js`, `ConsoleManager.js`, `InputDispatcher.js`) tienen prohibido recibir lógica nueva directa: toda extensión debe delegarse a submódulos o handlers con responsabilidad única.
- **Aislamiento en Módulos Nuevos:** Prohibido invocar `paper` o `window.paper` ni usar `window.*` directamente en módulos nuevos o refactorizados; todas las dependencias entran por `constructor` o `this.utils.paper`.

## 6. Protocolo de Trabajo IA <-> Usuario
1. **Plan antes de código:** Antes de escribir JS, explicar en español qué archivos y métodos se tocan (acotado al mínimo indispensable, idealmente 1–2 archivos por paso), por qué es la solución definitiva y qué puede verse afectado. Esperar aprobación explícita.
2. **Solo Métodos Completos:** Nunca entregar archivos enteros ni fragmentos sueltos de 2 líneas. Entregar siempre **el método completo** desde su firma `nombreMetodo(...) {` hasta su llave de cierre `}`, indicando claramente a qué clase pertenece.
3. **Chats atómicos:** Una tarea por chat. Al terminar y verificar en navegador, hacer `git commit` y abrir chat nuevo adjuntando este `ARCHITECTURE.md`.

## 7. Extensibilidad y Contratos Modulares
- **Datos Planos e Invariantes:** Toda propiedad específica de una entidad (`radius`, `width`, `height`, `dashArray`, etc.) debe almacenarse como dato serializable en `entity.data`. La validación de rangos físicos y el recálculo de geometría/handles ocurren en el Servicio o Comando, nunca en la UI.
- **Vistas Componibles de Propiedades:** Prohibido agregar cadenas `if/else` por tipo de entidad en vistas de propiedades; encapsular cada dominio en secciones independientes (`*Section.js` < 250 líneas) protegidas con `_isPreviewing` durante controles continuos (ver `UI_GUIDELINES.md`).
- **Contrato Declarativo de Herramientas:** Prohibido agregar listas de nombres de herramientas (`if (toolName === '...')`) en `CADUtils`, `ToolManager` o `InputDispatcher`. Toda herramienta declara sus políticas en `BaseTool` (`getSelectionPreserveMode`, `shouldPreserveEditMode`, `shouldClearHudOnActivate`, `getCursorMode`), registra sus textos/opciones en `CAD_CATALOG`, delega el parseo en `CommandInputParser` y reutiliza los handlers oficiales (`BoxSelectHandler`, `SelectionMenuHandler`, `HandleSelectionHandler`, `SegmentEditHandler`, `MixedDragSession`) (ver `TOOLS_GUIDELINES.md` y `CONSOLE_GUIDE.md`).