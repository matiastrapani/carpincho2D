/**
 * services/SelectionManager.js - Gestor del estado de selección de entidades, nodos y tiradores
 */
import { DeleteCommand } from './commands/cadCommands.js';

export class SelectionManager {
  constructor(cadService) {
    this.service = cadService;
    this.selectedEntities = [];
    this.selectedSegments = [];
    this.editingEntities = [];
    this.selectedHandles = [];
  }

  selectEntity(entity, addToSelection = false) {
    if (!entity) return;

    const layerId = String(entity.data?.layerId || '0');
    const layerManager = this.service.utils?.layerManager || window.cadUtils?.layerManager;
    const layer = layerManager?.layers?.get(layerId);
    if (layer && layer.locked) return;

    if (!addToSelection) {
      this.deselectAllEntities();
      this.editingEntities = [];
    }

    if (!this.selectedEntities.includes(entity)) {
      if (!entity.data) entity.data = {};
      
      if (!entity.data.origStrokeColor && entity.strokeColor) {
        entity.data.origStrokeColor = entity.strokeColor.toCSS ? entity.strokeColor.toCSS() : entity.strokeColor;
      }
      if (!entity.data.origFillColor && entity.fillColor) {
        entity.data.origFillColor = entity.fillColor.toCSS ? entity.fillColor.toCSS() : entity.fillColor;
      }
      if (!entity.data.origStrokeWidth && entity.strokeWidth) {
        entity.data.origStrokeWidth = entity.strokeWidth;
      }

      this.selectedEntities.push(entity);
      
      if (!this.editingEntities.includes(entity)) {
        this.editingEntities.push(entity);
      }

      if (entity instanceof paper.Path && entity.segments && !entity.data?.isPointEntity) {
        entity.segments.forEach(seg => {
          if (!this.selectedSegments.includes(seg)) {
            this.selectedSegments.push(seg);
          }
        });
      }

      entity.selected = false;
    }

    if (window.cadUtils) {
      window.cadUtils.selectionRenderEngine.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }
  }

  deselectAllEntities() {
    this.selectedEntities = [];
    this.selectedSegments = [];
    this.deselectAllHandles();

    if (window.cadUtils) {
      window.cadUtils.selectionRenderEngine.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }

    if (window.cadUI && typeof window.cadUI.updatePropertyPanel === 'function') {
      window.cadUI.updatePropertyPanel(null);
    }
  }

  selectHandle(segment, type, addToSelection = false) {
    if (!segment || !segment.path || !type) return;

    const layerId = String(segment.path.data?.layerId || '0');
    const layerManager = this.service.utils?.layerManager || window.cadUtils?.layerManager;
    const layer = layerManager?.layers?.get(layerId);
    if (layer && layer.locked) return;

    if (!addToSelection) {
      this.deselectAllHandles();
    }
    const exists = this.selectedHandles.some(h => h.segment === segment && h.type === type);
    if (!exists) {
      this.selectedHandles.push({ segment, type });
    }
    if (window.cadUtils) {
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }
  }

  deselectHandle(segment, type) {
    this.selectedHandles = this.selectedHandles.filter(h => !(h.segment === segment && h.type === type));
    if (window.cadUtils) {
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }
  }

  deselectAllHandles() {
    this.selectedHandles = [];
  }

  isSelectedHandle(segment, type) {
    return this.selectedHandles.some(h => h.segment === segment && h.type === type);
  }

  deselectEntity(entity) {
    const index = this.selectedEntities.indexOf(entity);
    if (index !== -1) {
      this.selectedEntities.splice(index, 1);
    }
    
    if (entity instanceof paper.Path && entity.segments) {
      entity.segments.forEach(seg => this.deselectSegment(seg));
    }

    if (window.cadUtils) {
      window.cadUtils.selectionRenderEngine.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }

    if (window.cadUI && typeof window.cadUI.updatePropertyPanel === 'function') {
      const remaining = this.selectedEntities[this.selectedEntities.length - 1] || null;
      window.cadUI.updatePropertyPanel(remaining);
    }
  }

  deselectAllEditingEntities() {
    this.selectedEntities = [];
    this.selectedSegments = [];
    this.editingEntities = [];
    this.deselectAllHandles();

    if (window.cadUtils) {
      window.cadUtils.selectionRenderEngine.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }
  }

  selectSegment(segment, addToSelection = false) {
    if (!segment || !segment.path) return;

    const layerId = String(segment.path.data?.layerId || '0');
    const layerManager = this.service.utils?.layerManager || window.cadUtils?.layerManager;
    const layer = layerManager?.layers?.get(layerId);
    if (layer && layer.locked) return;
    
    if (!addToSelection) {
      this.selectedSegments = [];
    }
    if (!this.selectedSegments.includes(segment)) {
      this.selectedSegments.push(segment);
    }
  }

  deselectSegment(segment) {
    const index = this.selectedSegments.indexOf(segment);
    if (index !== -1) {
      this.selectedSegments.splice(index, 1);
    }

    if (window.cadUtils) {
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }
  }

  deselectAllSegments() {
    this.selectedSegments = [];
  }

  deleteSelectedElements(renderBezierFn) {
    // A. Borrado de PUNTOS DE CONTROL (Vértices/Anclas seleccionados)
    if (this.selectedSegments.length > 0) {
      const pathSegmentMap = new Map();

      this.selectedSegments.forEach(seg => {
        if (seg && seg.path) {
          if (!pathSegmentMap.has(seg.path)) {
            pathSegmentMap.set(seg.path, []);
          }
          pathSegmentMap.get(seg.path).push(seg);
        }
      });

      const pathsAffected = [];

      pathSegmentMap.forEach((segs, path) => {
        const originalSegmentsState = path.segments.map(s => ({
          point: s.point.clone(),
          handleIn: s.handleIn.clone(),
          handleOut: s.handleOut.clone()
        }));

        const indicesToDelete = segs
          .map(s => s.index)
          .filter(idx => idx !== undefined && idx !== -1)
          .sort((a, b) => b - a);

        pathsAffected.push({
          path: path,
          indicesToDelete: indicesToDelete,
          originalSegmentsState: originalSegmentsState
        });
      });

      const deleteCmd = new DeleteCommand(this.service, {
        type: 'segments',
        pathsAffected: pathsAffected
      });

      this.service.executeCommand(deleteCmd);
      if (renderBezierFn) renderBezierFn();
      return;
    }

    // B. Borrado de ENTIDAD COMPLETA
    if (this.selectedEntities.length > 0) {
      const entitiesToDelete = [...this.selectedEntities];

      const deleteCmd = new DeleteCommand(this.service, {
        type: 'entities',
        entities: entitiesToDelete
      });

      this.service.executeCommand(deleteCmd);
      if (renderBezierFn) renderBezierFn();
    }
  }
}