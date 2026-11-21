# TOOLS_GUIDELINES.md — Arquitectura y Reglas para Herramientas CAD

## 1. Separación de Responsabilidades (Fábrica vs. Transacción)
- **CADService (Fábrica pura de geometría):** Los métodos `create*Entity()` instancian el `paper.Item` con su geometría y flags estructurales (`isCircleEntity`, `isPointEntity`, `isDynamicStroke`, `baseStrokeWidth`) y lo devuelven sin registrarlo en `this.entities` ni ejecutar comandos en `this.history`. Esto permite reutilizar la misma fábrica tanto en herramientas interactivas como en operaciones por lote (`Divide`, `Array`, importadores DXF/SVG) envueltas en un único paso Undo/Redo.
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
- **`hudLayer`:** Marcadores efímeros de OSNAP (`SnapMarkerRenderer`), etiquetas dinámicas de cotas/ángulos, guías temporales de previsualización (`previewCircle`, `previewRadiusLine`, `dragRubberBand`), recuadros de selección transitorios y marcadores de referencia de herramientas (`DivisionSelectionHandler`, `TrimSelectionHandler`, marcadores de pivote), todos sujetos a limpieza en `cancel()` y `cleanup()`.

## 3. Previsualización Dinámica y Estilos en Vivo
- **Helpers heredados de `BaseTool`:** Todas las herramientas deben acceder a `this.paper`, `this.getHudLayer()`, `this.resolvePreviewStyle()` y `this.syncLineGuide()`, evitando reimplementar `_getPaper()` / `_getHudLayer()` o instanciar líneas de guía manualmente.
- **Estilos dinámicos:** Las guías temporales durante el movimiento del ratón (`previewCircle`, `previewLine`) deben resolver color, grosor y opacidad mediante `resolvePreviewStyle()` (`propertyManager.getResolvedColor()` / `defaultSettings` y la capa activa), nunca con valores hexadecimales fijos.
- **Reutilización de geometría en vivo:** Las guías dinámicas complejas deben instanciarse una única vez en `hudLayer` (con `insert: false`, `guide: true` y `data: { isAuxiliary: true }`) y actualizar sus vértices/segmentos en sitio durante `onMouseMove` o `onMouseDrag`, evitando destruir y recrear nodos de Paper.js en cada evento del puntero.
- **Limpieza obligatoria:** Toda previsualización debe eliminarse en `cancel()` y `cleanup()` para no dejar ítems huérfanos al cambiar de herramienta, revirtiendo cualquier transformación en curso si se cancela antes de despachar el `Command`.

## 4. Interacción, OSNAP, Selección y Cancelación
- **Prioridad de coordenadas:** Evaluar primero `service.calculateOsnap(event.point, ...)` y, solo si no hay snap activo, aplicar `utils.applyOrthoConstraint(anchorPt, event.point, event.event.shiftKey)`.
- **Referencia geométrica real de OSNAP (`Tangent` / `Perpendicular`):** Debe calcularse siempre respecto a la geometría real resultante y nunca contra cuerdas rectas auxiliares (*rubberbands*):
  - **Creación de círculos (`osnapMode: 'circleRadius'`):** `Tangent` apoya el perímetro del círculo contra la entidad destino (pie de perpendicular desde el centro o línea de centros), no la línea radial.
  - **Curvas en creación (`disableFromPoint: true`):** En `SplineTool` (a partir del 2.º tramo) y `BezierTool` (si el vértice previo tiene tiradores activos), se desactiva `fromPoint` para evitar falsos snaps tangentes/perpendiculares sobre la cuerda recta.
  - **Edición de vértices (`MixedDragSession`):** Al arrastrar un único nodo extremo, usar su vértice vecino fijo como `fromPoint`; al arrastrar una manija Bézier, usar su nodo ancla.
- **Renderizado de marcadores OSNAP (`SnapMarkerRenderer`):** Trazar siempre en dos pasadas (primero todos los contornos exteriores oscuros en `bgItems` y luego todos los trazos/rellenos claros en `fgItems`) usando los parámetros de `CAD_THEME.hud` (`snapOutlineWidthPx`, `intersectionWidthMultiplier`), evitando cruces sobre el trazo principal o invasión de huecos interiores.
- **Estándar de selección dentro de herramientas de modificación:** En herramientas con selección previa (`Move`, `Copy`, `Rotate`, `Scale`), la selección de **entidades** es acumulativa (clic o recuadro suma, clic en el vacío conserva la selección y `Shift` resta estrictamente), mientras que la selección de **nodos, aristas y tiradores** en modo edición mantiene siempre el comportamiento convencional (clic reemplaza, clic en el vacío limpia y `Shift` alterna).
- **Botones del ratón y valores por defecto (`<valor>`):** Ignorar clic derecho en `onMouseDown` (`event.event.button !== 0`). En `onContextMenu`:
  - En herramientas multivértice (`PolylineTool`, `SplineTool`, `BezierTool`), iniciar el trazo mediante `_beginActivePath()` y, al confirmar con $\ge 2$ vértices, cerrarlo con `_commitOrDiscardActivePath()` (`commitNewEntity()`); si hay $< 2$, descartar el inicio incompleto.
  - En herramientas con parámetros repetibles (como `lastRadius` en `CircleTool`), mostrar el último valor válido entre `<...>` en el prompt e implementar `onConfirmDefault()` para aplicarlo ante `Enter` vacío o clic derecho en el paso de confirmación; si no existe valor previo, clic derecho cancela el paso actual (`resetTool()`).
  - Si la herramienta está en reposo, clic derecho vuelve a selección (`exitToSelect()`).
- **Tecla Escape:** Delegar en `BaseTool.onKeyDown()` para salir limpiamente a `SelectTool` salvo que la herramienta tenga sub-estados propios (como selección de nodos en `SelectTool`).