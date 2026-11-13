Arquitectura y Reglas para Herramientas CAD

1. Separación de Responsabilidades (Fábrica vs. Transacción)

CADService (Fábrica pura de geometría): Los métodos create*Entity() instancian el paper.Item con su geometría y flags estructurales (isCircleEntity, isPointEntity, isDynamicStroke, baseStrokeWidth) y lo devuelven sin registrarlo en this.entities ni ejecutar comandos en this.history. Esto permite reutilizar la misma fábrica tanto en herramientas interactivas como en operaciones por lote (Divide, Array, importadores DXF/SVG) envueltas en un único paso Undo/Redo.

BaseTool (Orquestación transaccional): Toda herramienta que confirma una entidad nueva en el lienzo debe pasar por un único método centralizado (commitNewEntity(entity, baseName, CommandClass)), garantizando el mismo orden de ejecución en todo el sistema:

    Asignar nombre correlativo único (utils.generateNextEntityName(baseName)).
    
    Aplicar propiedades por defecto y capa activa (propertyManager.applyDefaultSettings(entity)).
    
    Ejecutar un solo comando de historial (service.executeCommand(new CommandClass(service, entity))) que inserta la entidad en service.entities y la ubica en el paperGroup de su capa.
    
    Sincronizar el renderizado (selectionRenderEngine.updateEntitiesStroke()).

2. Reglas Estrictas de Capas en Paper.js
    
    Prohibido cambiar paper.project.activeLayer sin restaurarlo ni llamar a bringToFront() sobre entidades del documento.
    
    drawLayer: Únicamente geometría confirmada del documento (organizada dentro de cada layer_group_*) y trazados en curso (activePath, rubberBandLine).
    
    nodesLayer: Proyecciones visuales de selección/edición (controlHandlesGroup) y entidades de tipo punto.
    
    hudLayer: Exclusivamente marcadores efímeros de OSNAP y etiquetas dinámicas de cotas/ángulos.

3. Previsualización Dinámica y Estilos en Vivo
    
    Las guías temporales durante el movimiento del ratón (previewCircle, rubberBandLine) deben resolver color, grosor y opacidad consultando propertyManager.getResolvedColor() / defaultSettings y la capa activa, nunca con valores hexadecimales fijos.
    
    Toda previsualización debe eliminarse en cancel() y cleanup() para no dejar ítems huérfanos al cambiar de herramienta.

4. Interacción, OSNAP y Cancelación
    
    Prioridad de coordenadas: Evaluar primero service.calculateOsnap(event.point, ...) y, solo si no hay snap activo, aplicar utils.applyOrthoConstraint(anchorPt, event.point, event.event.shiftKey).
    
    Botones del ratón: Ignorar clic derecho en onMouseDown (event.event.button !== 0). En onContextMenu, si hay una operación a medio dibujar, cancelar el paso actual (resetTool()); si la herramienta está en reposo, volver a selección (exitToSelect()).
    
    Tecla Escape: Delegar en BaseTool.onKeyDown() para salir limpiamente a SelectTool salvo que la herramienta tenga sub-estados propios (como selección de nodos en SelectTool).   