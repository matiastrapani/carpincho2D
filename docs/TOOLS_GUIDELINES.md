# TOOLS_GUIDELINES.md — Arquitectura y Reglas para Herramientas CAD

## 1. Separación de Responsabilidades (Fábrica vs. Transacción)
- **CADService (Fábrica pura de geometría):** Los métodos `create*Entity()` instancian el `paper.Item` con su geometría y flags estructurales (`isCircleEntity`, `isPointEntity`, `isDynamic`, `baseWidth`) y lo devuelven sin registrarlo en `this.entities` ni ejecutar comandos en `this.history`. Esto permite reutilizar la misma fábrica tanto en herramientas interactivas como en operaciones por lote (`Divide`, `Array`, importadores DXF/SVG) envueltas en un único paso Undo/Redo.
- **BaseTool (Orquestación transaccional):** Toda herramienta que confirma una entidad nueva en el lienzo debe pasar por `commitNewEntity(entity, baseName, CommandClass)`, garantizando el mismo orden de ejecución:
  1. Asignar nombre correlativo único (`utils.generateNextEntityName(baseName)`).
  2. Aplicar propiedades por defecto y capa activa (`propertyManager.applyDefaultSettings(entity)`).
  3. Ejecutar un solo comando de historial (`service.executeCommand(new CommandClass(service, entity))`) que inserta la entidad en `service.entities` y la ubica en el `paperGroup` de su capa (salvo entidades punto `data.isPointEntity`, que residen en `pointsLayer`).
  4. Sincronizar el renderizado (`selectionRenderEngine.updateEntitiesStroke()`).

## 2. Reglas Estrictas de Capas en Paper.js
- **Orden jerárquico inviolable (de abajo hacia arriba):** `drawLayer` -> `nodesLayer` -> `pointsLayer` -> `hudLayer`.
- **Prohibiciones:** Prohibido cambiar `paper.project.activeLayer` sin restaurarlo ni llamar a `bringToFront()` sobre trazos o curvas del documento (solo permitido dentro de `SelectionRenderEngine` para ordenar puntos seleccionados dentro de `pointsLayer`).
- **`drawLayer`:** Únicamente geometría de trazos/curvas/rasters confirmados del documento (organizada dentro de cada `layer_group_*`) y trazados activos en construcción (`activePath`).
- **`nodesLayer`:** Proyecciones visuales de selección de trazos, overlays de edición y nodos/tiradores de control (`controlHandlesGroup`). Nunca debe alojar entidades punto ni clonarlas.
- **`pointsLayer`:** Contenedor visual exclusivo para todas las entidades punto (`data.isPointEntity = true`). Al ubicarse por encima de `nodesLayer`, garantiza que el relleno de los puntos tape siempre tanto a las curvas seleccionadas como a los nodos de edición.
- **`hudLayer`:** Marcadores efímeros de OSNAP (`SnapMarkerRenderer`), guías temporales de previsualización (`previewCircle`, `previewRadiusLine`, `previewLine`, `dragRubberBand`), recuadros de selección transitorios y marcadores de referencia de herramientas (`DivisionSelectionHandler`, `TrimSelectionHandler`, marcadores de pivote), todos sujetos a limpieza en `cancel()` y `cleanup()`.
- **Overlays DOM del HUD:** Las etiquetas dinámicas de cotas, radios y ángulos no residen en `hudLayer` ni usan `paper.PointText`; se actualizan mediante `this.utils.hud.updateFeedbackLabels(fromPt, toPt, options)` sobre un overlay DOM (`.hud-feedback-label`) y se ocultan automáticamente en `hud.clear()`.

## 3. Previsualización Dinámica y Estilos en Vivo
- **Helpers heredados de `BaseTool`:** Todas las herramientas deben acceder a `this.paper`, `this.getHudLayer()`, `this.resolvePreviewStyle()` y `this.syncLineGuide()`, evitando reimplementar `_getPaper()` / `_getHudLayer()` o instanciar líneas de guía manualmente.
- **Estilos dinámicos independientes del zoom:** Las guías temporales durante el movimiento del ratón (`previewCircle`, `previewLine`) deben resolver color, grosor (`1 / zoom`), patrón discontinuo (`[2 / zoom, 2 / zoom]`) y opacidad mediante `resolvePreviewStyle()`, nunca con valores hexadecimales ni grosores fijos en unidades de mundo.
- **Reutilización de geometría en vivo:** Las guías dinámicas complejas deben instanciarse una única vez en `hudLayer` (con `insert: false`, `guide: true` y `data: { isAuxiliary: true }`) y actualizar sus vértices/segmentos en sitio durante `onMouseMove` o `onMouseDrag`, evitando destruir y recrear nodos de Paper.js en cada evento del puntero.
- **Refresco inmediato sin mover el ratón (`_refreshPreviewFromMouse`):** Toda herramienta con vista previa dinámica debe implementar `_refreshPreviewFromMouse()` usando `this.utils.lastMousePoint` para recalcular guías y `updateFeedbackLabels()` de inmediato cuando el usuario cambia una opción en consola (`D`/`R`), presiona/suelta `Shift` (`Ortho`) o cambia el zoom.
- **Limpieza obligatoria:** Toda previsualización debe eliminarse en `clearPreviews()`, `cancel()` y `cleanup()` para no dejar ítems huérfanos al cambiar de herramienta, revirtiendo cualquier transformación en curso si se cancela antes de despachar el `Command`.

## 4. Interacción, OSNAP, Selección y Consola
- **Resolución unificada de coordenadas (`resolveConstrainedPoint`):** Prohibido invocar manualmente `calculateOsnap` y `applyOrthoConstraint` por separado dentro de una herramienta. Todas las herramientas deben delegar en `this.utils.resolveConstrainedPoint(rawPoint, { fromPoint, isShift, excludeEntity, selectedPointsCoords, osnapMode })`, que aplica automáticamente la jerarquía oficial:
  1. OSNAP de entidad (`endpoint`, `midpoint`, `center`, `intersection`, `perpendicular`, `tangent`, `quadrant`, `node`, `nearest`).
  2. Restricción ortogonal (`F8` o `Shift`) proyectada sobre el snap a grilla si está activo.
  3. Snap a grilla libre o coordenada cruda del cursor.
- **Referencia geométrica real de OSNAP (`Tangent` / `Perpendicular`):** Debe calcularse siempre respecto a la geometría real resultante y nunca contra cuerdas rectas auxiliares (*rubberbands*):
  - **Creación de círculos (`osnapMode: 'circleRadius'`):** `Tangent` apoya el perímetro del círculo contra la entidad destino (pie de perpendicular desde el centro o línea de centros), no la línea radial.
  - **Curvas en creación (`disableFromPoint: true`):** En `SplineTool` (a partir del 2.º tramo) y `BezierTool` (si el vértice previo tiene tiradores activos), se desactiva `fromPoint` para evitar falsos snaps tangentes/perpendiculares sobre la cuerda recta.
  - **Edición de vértices (`MixedDragSession`):** Al arrastrar un único nodo extremo, usar su vértice vecino fijo como `fromPoint`; al arrastrar una manija Bézier, usar su nodo ancla.
- **Renderizado de marcadores OSNAP (`SnapMarkerRenderer`):** Trazar siempre en dos pasadas (primero todos los contornos exteriores oscuros en `bgItems` y luego todos los trazos/rellenos claros en `fgItems`) usando los parámetros de `CAD_THEME.hud` (`snapOutlineWidthPx`, `intersectionWidthMultiplier`), evitando cruces sobre el trazo principal o invasión de huecos interiores.
- **Integración con Consola y `CommandInputParser`:**
  - Todo paso interactivo anuncia su prompt con `this.setStep(instruction, { defaultValue, options })` y sus mensajes con `this.logTagged(msg)` usando plantillas de `CAD_CATALOG`.
  - `onCommandInput(rawInput)` delega el análisis en `CommandInputParser.parse(rawInput, { options: this._getCurrentOptions(), referencePoint, paper: this.paper })`.
  - Cuando el usuario confirma un punto haciendo clic en el lienzo (`onMouseDown`), la herramienta registra la coordenada en el grupo activo mediante `this.utils.consoleManager?.logStepInput?.(this.formatCoords(pt))` (`logInput: true`); cuando el dato proviene de `onCommandInput`, `ConsoleManager` ya lo registró (`logInput: false`).
  - Las herramientas multivértice (`LineTool`, `PolylineTool`, `SplineTool`, `BezierTool`) deben implementar `onUndo()` y `onRedo()` para deshacer/rehacer vértices dentro de la sesión activa sin perder el trazado en curso.
- **Estándar de selección dentro de herramientas de modificación:** En herramientas con selección previa (`Move`, `Copy`, `Rotate`, `Scale`), la selección de **entidades** es acumulativa (clic o recuadro suma, clic en el vacío conserva la selección y `Shift` resta estrictamente), mientras que la selección de **nodos, aristas y tiradores** en modo edición mantiene siempre el comportamiento convencional (clic reemplaza, clic en el vacío limpia y `Shift` alterna).
- **Continuidad de creación, botones del ratón y salida:**
  - Ignorar clic derecho en `onMouseDown` (`event.event.button !== 0`).
  - **Ciclo continuo:** Las herramientas de creación (`PointTool`, `LineTool`, `PolylineTool`, `CircleTool`) permanecen activas tras confirmar cada entidad para encadenar múltiples creaciones en la misma sesión, conservando sus valores por defecto (`lastRadius`, punto de referencia relativo `@`, etc.).
  - **Confirmación vs. salida (`Enter` vacío / `onConfirmDefault` / `onContextMenu`):**
    - Si hay una entidad en construcción con datos válidos (ej. $\ge 2$ vértices en `LineTool`/`PolylineTool`/`SplineTool`/`BezierTool`, o `centerPoint` activo con `lastRadius` en `CircleTool`), `Enter` vacío o clic derecho confirman/cierran la entidad actual.
    - Si hay un paso inicial incompleto (ej. solo 1 vértice o centro sin radio previo), clic derecho cancela el paso actual (`resetTool()` / `handleCancel()`).
    - Si la herramienta está en reposo esperando el primer punto de una nueva entidad (tras haber creado al menos una, o antes de empezar), `Enter` vacío, clic derecho o `Escape` salen limpiamente a `SelectTool` (`exitToSelect()`).
  - **Tecla Escape:** Delegar en `BaseTool.onKeyDown()` para salir limpiamente a `SelectTool` salvo que la herramienta tenga sub-estados propios (como selección de nodos en `SelectTool`).