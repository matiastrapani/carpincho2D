/**
 * modules/cadCommands.js - Colección de Comandos Geométricos (Undo / Redo)
 */

// Comando para añadir una entidad de línea al lienzo CAD
class AddLineCommand {
  constructor(cadService, lineEntity) {
    this.cadService = cadService;
    this.lineEntity = lineEntity;
  }

  execute() {
    if (!this.lineEntity.parent) {
      paper.project.activeLayer.addChild(this.lineEntity);
    }
    
    if (!this.cadService.demoEntities.includes(this.lineEntity)) {
      this.cadService.demoEntities.push(this.lineEntity);
    }
  }

  undo() {
    const idx = this.cadService.demoEntities.indexOf(this.lineEntity);
    if (idx !== -1) {
      this.cadService.demoEntities.splice(idx, 1);
    }
    
    const selIdx = this.cadService.selectedEntities.indexOf(this.lineEntity);
    if (selIdx !== -1) {
      this.cadService.selectedEntities.splice(selIdx, 1);
    }

    this.lineEntity.remove();
  }
}
window.AddLineCommand = AddLineCommand;

/**
 * commands/AddPointCommand.js
 * Comando para registrar y deshacer/rehacer la creación de puntos.
 */
class AddPointCommand {
  constructor(service, pointEntity) {
    this.service = service;
    this.pointEntity = pointEntity;
  }

  execute() {
    if (!this.pointEntity) return;

    if (!this.pointEntity.parent) {
      paper.project.activeLayer.addChild(this.pointEntity);
    }
    if (!this.service.demoEntities.includes(this.pointEntity)) {
      this.service.demoEntities.push(this.pointEntity);
    }
    paper.view.update();
  }

  undo() {
    if (!this.pointEntity) return;

    // Removemos de demoEntities
    const idx = this.service.demoEntities.indexOf(this.pointEntity);
    if (idx !== -1) {
      this.service.demoEntities.splice(idx, 1);
    }

    // Removemos de selectedEntities si estaba seleccionado
    if (this.service.selectedEntities) {
      const selIdx = this.service.selectedEntities.indexOf(this.pointEntity);
      if (selIdx !== -1) {
        this.service.selectedEntities.splice(selIdx, 1);
      }
    }

    // Eliminamos del lienzo de Paper.js
    this.pointEntity.remove();
    paper.view.update();
  }
}
window.AddPointCommand = AddPointCommand;

/**
 * commands/MoveCommand.js
 * Comando para Undo/Redo de arrastre de entidades, vértices/nodos múltiples y manejadores,
 * resistente a ciclos de borrado/restauración de segmentos.
 */
class MoveCommand {
  constructor(cadService, moveData) {
    this.cadService = cadService;
    this.moveData = moveData;
  }

  execute() {
    this.applyState(true);
  }

  undo() {
    this.applyState(false);
  }

  applyState(useFinal) {
    if (!this.moveData) return;

    // A. Movimiento de Vértices / Segmentos
    if (this.moveData.type === 'segments') {
      this.moveData.items.forEach(item => {
        // Buscamos el segmento vivo actualizado en el path mediante su índice
        const seg = item.path && item.path.segments ? item.path.segments[item.segmentIndex] : item.segment;
        if (!seg) return;

        const pt = useFinal ? item.finalPt : item.initialPt;
        const hIn = useFinal ? item.finalHandleIn : item.initialHandleIn;
        const hOut = useFinal ? item.finalHandleOut : item.initialHandleOut;

        if (pt) seg.point = pt.clone();
        if (hIn) seg.handleIn = hIn.clone();
        if (hOut) seg.handleOut = hOut.clone();
      });
    }
    // B. Movimiento de Tirador individual
    else if (this.moveData.type === 'handle') {
      const { path, segmentIndex, handleType, initialPt, finalPt } = this.moveData;
      const seg = path && path.segments ? path.segments[segmentIndex] : this.moveData.segment;
      if (!seg) return;

      const targetPt = useFinal ? finalPt : initialPt;
      if (!targetPt) return;

      if (handleType === 'anchor') {
        seg.point = targetPt.clone();
      } else if (handleType === 'handleIn') {
        seg.handleIn = targetPt.subtract(seg.point);
      } else if (handleType === 'handleOut') {
        seg.handleOut = targetPt.subtract(seg.point);
      }
    } 
    // C. Movimiento de Entidades completas
    else if (this.moveData.type === 'entities') {
      this.moveData.items.forEach(item => {
        if (!item.entity) return;

        if (item.isPath && item.initialSegments && item.finalSegments) {
          const segments = useFinal ? item.finalSegments : item.initialSegments;
          item.entity.segments.forEach((seg, idx) => {
            if (segments[idx]) {
              seg.point = segments[idx].point.clone();
              seg.handleIn = segments[idx].handleIn.clone();
              seg.handleOut = segments[idx].handleOut.clone();
            }
          });
        } else {
          const pos = useFinal ? item.finalPos : item.initialPos;
          if (pos) item.entity.position = pos.clone();
        }
      });
    }

    if (this.cadService.renderBezierHandles) {
      this.cadService.renderBezierHandles();
    }
    paper.view.update();
  }
}
window.MoveCommand = MoveCommand;

/**
 * commands/DeleteCommand.js
 * Soporte de Undo/Redo para borrado de Entidades, Nodos y Tiradores Bézier.
 */
class DeleteCommand {
  constructor(cadService, deleteData) {
    this.cadService = cadService;
    // deleteData: { type: 'entities' | 'handle' | 'segments', data: ... }
    this.deleteData = deleteData;
  }

  execute() {
    this.applyDelete();
  }

  undo() {
    this.restoreDelete();
  }

  applyDelete() {
    if (!this.deleteData) return;

    // A. Tirador Bézier individual (handleIn / handleOut)
    if (this.deleteData.type === 'handle') {
      const { segment, handleType } = this.deleteData;
      if (segment) {
        if (handleType === 'handleIn') segment.handleIn = new paper.Point(0, 0);
        if (handleType === 'handleOut') segment.handleOut = new paper.Point(0, 0);
      }
    }
    // B. Vértices / Segmentos múltiples
    else if (this.deleteData.type === 'segments') {
      this.deleteData.pathsAffected.forEach(item => {
        // Eliminar segmentos según la lista ordenada
        item.indicesToDelete.forEach(idx => {
          if (idx >= 0 && idx < item.path.segments.length) {
            item.path.removeSegment(idx);
          }
        });

        // Aplicar reparación de rectos/curvos sobre los vértices restantes
        item.path.segments.forEach(seg => {
          const origMatch = item.originalSegmentsState.find(o => o.point.getDistance(seg.point) < 0.001);
          if (origMatch) {
            if (origMatch.handleIn.isZero()) seg.handleIn = new paper.Point(0, 0);
            if (origMatch.handleOut.isZero()) seg.handleOut = new paper.Point(0, 0);
          }
        });

        // Si quedó con menos de 2 puntos, quitar del proyecto
        if (item.path.segments.length < 2) {
          const idxInDemo = this.cadService.demoEntities.indexOf(item.path);
          if (idxInDemo !== -1) this.cadService.demoEntities.splice(idxInDemo, 1);
          item.path.remove();
        }
      });
    }
    // C. Entidades completas
    else if (this.deleteData.type === 'entities') {
      this.deleteData.entities.forEach(ent => {
        const idx = this.cadService.demoEntities.indexOf(ent);
        if (idx !== -1) this.cadService.demoEntities.splice(idx, 1);
        ent.remove();
      });
    }

    this.cadService.deselectAllEntities();
    this.cadService.deselectAllSegments();
    if (this.cadService.renderBezierHandles) this.cadService.renderBezierHandles();
    paper.view.update();
  }

  restoreDelete() {
    if (!this.deleteData) return;

    const drawLayer = window.cadUtils?.drawLayer || paper.project.activeLayer;
    const nodesLayer = window.cadUtils?.nodesLayer;

    // A. Restaurar Tirador Bézier
    if (this.deleteData.type === 'handle') {
      const { segment, handleType, originalVector } = this.deleteData;
      if (segment && originalVector) {
        if (handleType === 'handleIn') segment.handleIn = originalVector.clone();
        if (handleType === 'handleOut') segment.handleOut = originalVector.clone();
      }
    }
    // B. Restaurar Vértices / Segmentos
    else if (this.deleteData.type === 'segments') {
      this.deleteData.pathsAffected.forEach(item => {
        const targetLayer = item.path.data?.isPointEntity ? (nodesLayer || drawLayer) : drawLayer;
        if (!item.path.parent || item.path.layer !== targetLayer) {
          targetLayer.addChild(item.path);
        }
        if (!this.cadService.demoEntities.includes(item.path)) {
          this.cadService.demoEntities.push(item.path);
        }

        item.path.segments = item.originalSegmentsState.map(s => new paper.Segment({
          point: s.point.clone(),
          handleIn: s.handleIn.clone(),
          handleOut: s.handleOut.clone()
        }));
      });
    }
    // C. Restaurar Entidades completas
    else if (this.deleteData.type === 'entities') {
      this.deleteData.entities.forEach(ent => {
        const isPoint = ent.data?.isPointEntity;
        const targetLayer = isPoint ? (nodesLayer || drawLayer) : drawLayer;

        if (!ent.parent || ent.layer !== targetLayer) {
          targetLayer.addChild(ent);
        }
        if (!this.cadService.demoEntities.includes(ent)) {
          this.cadService.demoEntities.push(ent);
        }
      });
    }

    // MANTENER ORDEN DE CAPAS: Asegurar que los puntos queden por encima de las entidades
    if (nodesLayer && drawLayer) {
      nodesLayer.insertAbove(drawLayer);
    }

    this.cadService.demoEntities.forEach(ent => {
      if (ent && ent.data?.isPointEntity) {
        ent.bringToFront();
      }
    });

    if (window.cadUtils) {
      window.cadUtils.updateEntitiesStroke();
      window.cadUtils.renderBezierHandles();
    }
    paper.view.update();
  }
}
window.DeleteCommand = DeleteCommand;

/**
 * commands/AddEntityCommand.js
 * Comando para registrar y deshacer/rehacer la adición de cualquier entidad
 * (Círculos, Líneas, Puntos, Imágenes o Lotes de Vectores SVG)
 */
/**
 * commands/AddEntityCommand.js
 * Comando para registrar y deshacer/rehacer la adición de cualquier entidad
 * (Círculos, Líneas, Puntos, Imágenes o Lotes de Vectores SVG) - Versión Optimizada O(N)
 */
class AddEntityCommand {
  constructor(cadService, entity) {
    this.cadService = cadService;
    // Si recibe una sola entidad la envuelve en Array; si ya recibe un Array (SVG) lo conserva
    this.entities = Array.isArray(entity) ? entity : [entity];
  }

  // Getter para garantizar compatibilidad exacta si algún método consulta cmd.entity
  get entity() {
    return this.entities[0];
  }

  execute() {
    const drawLayer = window.cadUtils?.drawLayer || paper.project.activeLayer;
    const existingSet = new Set(this.cadService.demoEntities);

    this.entities.forEach(ent => {
      if (!existingSet.has(ent)) {
        this.cadService.demoEntities.push(ent);
      }

      if (!ent.parent || ent.layer !== drawLayer) {
        drawLayer.addChild(ent);
      }

      // Si es una imagen (Raster), mandarla al fondo para no tapar líneas ni puntos
      if (ent instanceof paper.Raster || ent.className === 'Raster') {
        ent.sendToBack();
        if (window.cadUtils?.gridGroup) {
          window.cadUtils.gridGroup.sendToBack();
        }
      }
    });

    if (window.cadUtils) {
      window.cadUtils.updateEntitiesStroke();
      window.cadUtils.renderBezierHandles();
    }
    paper.view.update();
  }

  undo() {
    // 1. Conjunto para búsquedas e iteración O(1)
    const setToRemove = new Set(this.entities);

    // 2. Filtrado masivo en 1 sola pasada O(N)
    if (Array.isArray(this.cadService.demoEntities)) {
      this.cadService.demoEntities = this.cadService.demoEntities.filter(ent => !setToRemove.has(ent));
    }

    if (Array.isArray(this.cadService.selectedEntities)) {
      this.cadService.selectedEntities = this.cadService.selectedEntities.filter(ent => !setToRemove.has(ent));
    }

    // 3. Remover del lienzo de Paper.js
    this.entities.forEach(ent => {
      if (ent && typeof ent.remove === 'function') {
        ent.remove();
      }
    });

    if (window.cadUtils) {
      window.cadUtils.updateEntitiesStroke();
      window.cadUtils.renderBezierHandles();
    }
    paper.view.update();
  }
}
window.AddEntityCommand = AddEntityCommand;

/**
 * commands/DivideCommand.js
 */
class DivideCommand {
  constructor(cadService, pointsCreated) {
    this.cadService = cadService;
    this.pointsCreated = pointsCreated;
  }

  execute() {
    this.pointsCreated.forEach(pt => {
      if (!this.cadService.demoEntities.includes(pt)) {
        this.cadService.demoEntities.push(pt);
      }
      if (!pt.parent) {
        paper.project.activeLayer.addChild(pt);
      }
    });
    if (this.cadService.renderBezierHandles) {
      this.cadService.renderBezierHandles();
    }
    paper.view.update();
  }

  undo() {
    this.pointsCreated.forEach(pt => {
      const idx = this.cadService.demoEntities.indexOf(pt);
      if (idx !== -1) {
        this.cadService.demoEntities.splice(idx, 1);
      }
      pt.remove();
    });
    this.cadService.deselectAllEntities();
    if (this.cadService.renderBezierHandles) {
      this.cadService.renderBezierHandles();
    }
    paper.view.update();
  }
}
window.DivideCommand = DivideCommand;


/**
 * commands/TrimCommand.js
 * Comando para Undo/Redo del recorte de entidades (Trim).
 */
class TrimCommand {
  constructor(cadService, originalPath, remainingPaths, originalIndex) {
    this.cadService = cadService;
    this.originalPath = originalPath;     // Entidad completa previa al corte
    this.remainingPaths = remainingPaths; // Lista de tramos conservados tras el corte
    this.originalIndex = originalIndex;   // Posición original en demoEntities
    
    // Guardar explícitamente la capa de dibujo a la que pertenece la entidad
    this.targetLayer = (originalPath && originalPath.layer) 
      ? originalPath.layer 
      : (window.cadUtils?.drawLayer || paper.project.activeLayer);
  }

  cleanupEditState() {
    // 1. Salir de modo edición y limpiar selecciones de forma segura
    if (typeof this.cadService.deselectAllEditingEntities === 'function') {
      this.cadService.deselectAllEditingEntities();
    } else {
      this.cadService.selectedEntities = [];
      this.cadService.selectedSegments = [];
      this.cadService.editingEntities = [];
    }

    if (Array.isArray(this.cadService.selectedCurves)) {
      this.cadService.selectedCurves = [];
    }

    // 2. Limpiar referencias de hover en cadUtils
    if (window.cadUtils) {
      window.cadUtils.hoveredCurve = null;
      window.cadUtils.hoveredHandle = null;
      window.cadUtils.clearHoverHighlight();
      window.cadUtils.updateEntitiesStroke();
    }
  }

  execute() {
    // 1. Eliminar la entidad original de la lista y del lienzo
    const idx = this.cadService.demoEntities.indexOf(this.originalPath);
    if (idx !== -1) {
      this.cadService.demoEntities.splice(idx, 1);
    }
    this.originalPath.remove();

    // 2. Agregar los tramos resultantes a la capa de dibujo correcta
    this.remainingPaths.forEach(p => {
      if (!p.parent || p.layer !== this.targetLayer) {
        this.targetLayer.addChild(p);
      }
      if (!this.cadService.demoEntities.includes(p)) {
        this.cadService.demoEntities.push(p);
      }
    });

    // 3. Limpiar estado de edición y actualizar vista
    this.cleanupEditState();
    if (window.cadUtils) window.cadUtils.renderBezierHandles();
    paper.view.update();
  }

  undo() {
    // 1. Eliminar todos los tramos resultantes del lienzo y del servicio
    this.remainingPaths.forEach(p => {
      const idx = this.cadService.demoEntities.indexOf(p);
      if (idx !== -1) {
        this.cadService.demoEntities.splice(idx, 1);
      }
      p.remove();
    });

    // 2. Reinsertar la entidad original en su capa de dibujo original y posición exacta
    if (!this.originalPath.parent || this.originalPath.layer !== this.targetLayer) {
      this.targetLayer.addChild(this.originalPath);
    }
    this.originalPath.visible = true;

    if (!this.cadService.demoEntities.includes(this.originalPath)) {
      if (this.originalIndex !== -1 && this.originalIndex <= this.cadService.demoEntities.length) {
        this.cadService.demoEntities.splice(this.originalIndex, 0, this.originalPath);
      } else {
        this.cadService.demoEntities.push(this.originalPath);
      }
    }

    // 3. Limpiar estado de edición, refrescar trazos y redibujar lienzo
    this.cleanupEditState();
    if (window.cadUtils) window.cadUtils.renderBezierHandles();
    paper.view.update();
  }
}
window.TrimCommand = TrimCommand;

/**
 * commands/ExtendCommand.js
 * Comando para Undo/Redo de extensión paramétrica de entidades (Extend).
 */
class ExtendCommand {
  constructor(cadService, path, initialSegments, finalSegments) {
    this.cadService = cadService;
    this.path = path;
    this.initialSegments = initialSegments; // Estado inicial de segmentos
    this.finalSegments = finalSegments;     // Estado tras la extensión
  }

  execute() {
    this.applySegments(this.finalSegments);
  }

  undo() {
    this.applySegments(this.initialSegments);
  }

  applySegments(segmentsData) {
    if (!this.path) return;

    // Ajustar número de segmentos si se insertó o quitó alguno (ej. modo línea)
    while (this.path.segments.length > segmentsData.length) {
      this.path.removeSegment(this.path.segments.length - 1);
    }
    while (this.path.segments.length < segmentsData.length) {
      this.path.addSegment(new paper.Point(0, 0));
    }

    // Restaurar posiciones y vectores de tiradores
    segmentsData.forEach((s, i) => {
      this.path.segments[i].point = s.point.clone();
      this.path.segments[i].handleIn = s.handleIn.clone();
      this.path.segments[i].handleOut = s.handleOut.clone();
    });

    if (window.cadUtils) {
      window.cadUtils.updateEntitiesStroke();
      window.cadUtils.renderBezierHandles();
    }
    paper.view.update();
  }
}
window.ExtendCommand = ExtendCommand;


/**
 * commands/TransformEntityCommand.js
 * Soporte Undo/Redo para transformaciones de Bounding Box (Scale, Move, Stretch)
 */
class TransformEntityCommand {
  constructor(cadService, entity, initialState, finalState) {
    this.cadService = cadService;
    this.entity = entity;
    this.initialState = initialState; // { position, boundsWidth, boundsHeight }
    this.finalState = finalState;     // { position, boundsWidth, boundsHeight }
  }

  execute() {
    this.applyState(this.finalState);
  }

  undo() {
    this.applyState(this.initialState);
  }

  applyState(state) {
    if (!this.entity || !state) return;

    // Restaurar directamente la Matriz de Paper.js evita el desfase de posición por escalado
    if (state.matrix && this.entity.matrix) {
      this.entity.matrix = state.matrix.clone();
    } else {
      if (state.position) {
        this.entity.position = state.position.clone();
      }
      if (this.entity.bounds) {
        if (state.boundsWidth !== undefined) this.entity.bounds.width = state.boundsWidth;
        if (state.boundsHeight !== undefined) this.entity.bounds.height = state.boundsHeight;
        if (state.position) this.entity.position = state.position.clone();
      }
    }

    if (window.cadUtils) {
      window.cadUtils.updateEntitiesStroke();
      window.cadUtils.renderBezierHandles();
    }
    paper.view.update();
  }
}
window.TransformEntityCommand = TransformEntityCommand;

/**
 * commands/ChangeOpacityCommand.js
 * Soporte Undo/Redo para cambios de opacidad en imágenes / entidades.
 */
class ChangeOpacityCommand {
  constructor(cadService, entity, oldOpacity, newOpacity) {
    this.cadService = cadService;
    this.entity = entity;
    this.oldOpacity = oldOpacity;
    this.newOpacity = newOpacity;
  }

  execute() {
    this.applyOpacity(this.newOpacity);
  }

  undo() {
    this.applyOpacity(this.oldOpacity);
  }

  applyOpacity(val) {
    if (!this.entity) return;
    if (!this.entity.data) this.entity.data = {};

    this.entity.data.baseOpacity = val;
    this.entity.opacity = val;

    // Sincronizar UI del panel si la entidad sigue seleccionada
    if (window.cadUI) {
      const opacityInput = document.getElementById('imageOpacityInput');
      const opacityVal = document.getElementById('opacityVal');
      if (opacityInput && opacityVal) {
        const pct = Math.round(val * 100);
        opacityInput.value = pct;
        opacityVal.innerText = `${pct}%`;
      }
    }
    paper.view.update();
  }
}
window.ChangeOpacityCommand = ChangeOpacityCommand;

/**
 * commands/UpdateEntityPropertyCommand.js
 * Soporte Undo/Redo para cambios de propiedades de entidades (Color, Grosor, Opacidad, Capa, Nombre).
 */
class UpdateEntityPropertyCommand {
  constructor(cadService, entities, oldState, newState, cadUtils) {
    this.service = cadService;
    this.entities = Array.isArray(entities) ? entities : [entities];
    this.oldState = oldState; // Ej: { colorByLayer: true }
    this.newState = newState; // Ej: { colorByLayer: false, origStrokeColor: '#00e5ff' }
    this.utils = cadUtils;
  }

  execute() {
    this._applyState(this.newState);
  }

  undo() {
    this._applyState(this.oldState);
  }

  _applyState(state) {
    if (!this.entities || this.entities.length === 0) return;

    this.entities.forEach((entity) => {
      if (!entity.data) entity.data = {};

      Object.keys(state).forEach((key) => {
        if (state[key] === undefined) {
          delete entity.data[key];
        } else {
          entity.data[key] = state[key];
        }
      });

      // Sincronización de propiedades raíz de Paper.js
      if (state.name !== undefined) entity.name = state.name;
      if (state.opacity !== undefined) entity.opacity = state.opacity;
      if (state.origOpacity !== undefined && !state.opacityByLayer) entity.opacity = state.origOpacity;
    });

    if (this.utils?.updateEntitiesStroke) {
      this.utils.updateEntitiesStroke();
    }
    if (this.utils?.renderBezierHandles) {
      this.utils.renderBezierHandles();
    }
    if (window.paper?.view) {
      window.paper.view.update();
    }
    if (window.propertyPanelUI) {
      window.propertyPanelUI.refresh();
    }
  }
}
window.UpdateEntityPropertyCommand = UpdateEntityPropertyCommand;
