/**
 * services/SelectionManager.js - Gestor del estado de selección de entidades, nodos y tiradores
 */
import { DeleteCommand } from './commands/cadCommands.js';

export class SelectionManager {
  constructor(cadService) {
    this.service = cadService;
    this._selectedEntities = [];
    this.selectedSegments = [];
    this.editingEntities = [];
    this.selectedHandles = [];
    this._listeners = new Set();
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  get selectedEntities() {
    return this._selectedEntities;
  }

  set selectedEntities(val) {
    this._selectedEntities = Array.isArray(val) ? val : [];
    this._notify();
  }

  _notify() {
    this._listeners.forEach(fn => fn(this._selectedEntities));
    if (window.propertyPanelUI && typeof window.propertyPanelUI.refresh === 'function') {
      window.propertyPanelUI.refresh();
    }
    if (window.cadUI && typeof window.cadUI.updatePropertyPanel === 'function') {
      const last = this._selectedEntities[this._selectedEntities.length - 1] || null;
      window.cadUI.updatePropertyPanel(last);
    }
  }

  selectEntity(entity, addToSelection = false) {
    if (!entity) return;
    if (this.utils?.canvasViewportManager) {
      this.utils.canvasViewportManager.previousViewState = null;
    }
    const layerId = String(entity.data?.layerId || '0');
    const layerManager = this.service.utils?.layerManager || window.cadUtils?.layerManager;
    const layer = layerManager?.layers?.get(layerId);
    if (layer && (layer.locked || layer.visible === false)) return;

    if (!addToSelection) {
      this.deselectAllEntities();
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
      entity.selected = false;
    }

    if (window.cadUtils) {
      window.cadUtils.selectionRenderEngine.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }
    this._notify();
  }

  deselectAllEntities() {
    this.selectedEntities = [];
    this.selectedSegments = [];
    this.deselectAllHandles();

    if (window.cadUtils) {
      window.cadUtils.selectionRenderEngine.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }

  }

  selectHandle(segment, type, addToSelection = false) {
    if (!segment || !segment.path || !type) return;

    const layerId = String(segment.path.data?.layerId || '0');
    const layerManager = this.service.utils?.layerManager || window.cadUtils?.layerManager;
    const layer = layerManager?.layers?.get(layerId);
    if (layer && (layer.locked || layer.visible === false)) return;

    if (!addToSelection) {
      this._clearSelectedEntitiesOnly();
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
    if (this.utils?.canvasViewportManager) {
      this.utils.canvasViewportManager.previousViewState = null;
    }
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

    this._notify();
  }

  deselectAllEditingEntities() {
    this.editingEntities = [];
    this.selectedEntities = [];
    this.selectedSegments = [];
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
    if (layer && (layer.locked || layer.visible === false)) return;

    if (!addToSelection) {
      this._clearSelectedEntitiesOnly();
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

  purgeLayerSelection(layerId) {
    const idStr = String(layerId);
    const isOtherLayer = (ent) => String(ent?.data?.layerId || '0') !== idStr;
    const prevTotal = this._selectedEntities.length + this.editingEntities.length +
      this.selectedSegments.length + this.selectedHandles.length;

    this._selectedEntities = this._selectedEntities.filter(isOtherLayer);
    this.editingEntities = this.editingEntities.filter(isOtherLayer);
    this.selectedSegments = this.selectedSegments.filter((seg) => seg?.path && isOtherLayer(seg.path));
    this.selectedHandles = this.selectedHandles.filter((h) => h?.segment?.path && isOtherLayer(h.segment.path));

    const nextTotal = this._selectedEntities.length + this.editingEntities.length +
      this.selectedSegments.length + this.selectedHandles.length;

    if (prevTotal !== nextTotal) {
      window.cadUtils?.selectionRenderEngine?.updateEntitiesStroke();
      window.cadUtils?.selectionRenderEngine?.renderBezierHandles();
      this._notify();
    }
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

  enterEditMode(entities = null, { append = false } = {}) {
    const sourceList = entities
      ? (Array.isArray(entities) ? entities : [entities])
      : [...this.selectedEntities];

    const layerManager = this.service.utils?.layerManager || window.cadUtils?.layerManager;
    const editable = sourceList.filter((ent) => {
      if (!ent || !ent.parent || !ent.visible) return false;
      if (!(ent instanceof paper.Path) || ent.data?.isPointEntity) return false;
      if (!ent.segments || ent.segments.length < 2) return false;

      const layerId = String(ent.data?.layerId || '0');
      const layer = layerManager?.layers?.get(layerId);
      if (layer && (layer.locked || layer.visible === false)) return false;

      return true;
    });

    if (editable.length === 0) return [];

    if (!append) {
      this.editingEntities = [];
      this.deselectAllSegments();
      this.deselectAllHandles();
    }

    editable.forEach((ent) => {
      if (!this.editingEntities.includes(ent)) {
        this.editingEntities.push(ent);
      }
    });

    // Sacar de selectedEntities las entidades que entran en edición
    // para habilitar la selección y arrastre directo de sus nodos y tramos
    this.selectedEntities = this.selectedEntities.filter((ent) => !editable.includes(ent));

    if (window.cadUtils) {
      window.cadUtils.selectionRenderEngine?.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine?.renderBezierHandles();
    }
    if (window.paper?.view) window.paper.view.update();

    return editable;
  }

  exitEditMode() {
    if (this.editingEntities.length === 0) return false;

    this.editingEntities = [];
    this.deselectAllSegments();
    this.deselectAllHandles();

    if (window.cadUtils) {
      window.cadUtils.hoveredHandle = null;
      window.cadUtils.hoveredCurve = null;
      window.cadUtils.selectionRenderEngine?.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine?.renderBezierHandles();
    }
    if (window.paper?.view) window.paper.view.update();

    return true;
  }

  _clearSelectedEntitiesOnly() {
    if (this.selectedEntities.length === 0) return;

    this.selectedEntities = [];
    if (window.cadUtils) {
      window.cadUtils.selectionRenderEngine?.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine?.renderBezierHandles();
    }
  }
}