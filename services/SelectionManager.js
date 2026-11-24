/**
 * services/SelectionManager.js - Gestor del estado de selección de entidades, nodos y tiradores
 */
import { DeleteCommand } from './commands/cadCommands.js';

export class SelectionManager {
  constructor(cadService, cadUtils = null) {
    this.service = cadService;
    this._utils = cadUtils;
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
    this._refreshRender();
    this._notify();
  }

  _getUtils() {
    return this._utils || this.service?.utils || null;
  }

  _getLayerManager() {
    return this._getUtils()?.layerManager || null;
  }

  _getRenderEngine() {
    return this.service?.selectionRenderEngine || this._getUtils()?.selectionRenderEngine || null;
  }

  _getPaper() {
    return this._getUtils()?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  _isLayerEditable(entity) {
    if (!entity) return false;
    const layerId = String(entity.data?.layerId || '0');
    const layer = this._getLayerManager()?.layers?.get(layerId);
    return !layer || (!layer.locked && layer.visible !== false);
  }

  _refreshRender({ stroke = true, handles = true, updateView = false } = {}) {
    const renderEngine = this._getRenderEngine();
    if (renderEngine) {
      if (stroke && typeof renderEngine.updateEntitiesStroke === 'function') {
        renderEngine.updateEntitiesStroke();
      }
      if (handles && typeof renderEngine.renderBezierHandles === 'function') {
        renderEngine.renderBezierHandles();
      }
    }
    if (updateView) {
      const paperInst = this._getPaper();
      if (paperInst?.view) paperInst.view.update();
    }
  }

  _notify() {
    this._listeners.forEach((fn) => fn(this._selectedEntities));
  }

  selectEntity(entity, addToSelection = false) {
    if (!entity) return;

    const viewportManager = this._getUtils()?.canvasViewportManager;
    if (viewportManager) {
      viewportManager.previousViewState = null;
    }

    if (!this._isLayerEditable(entity)) return;

    if (!addToSelection) {
      this._selectedEntities = [];
      this.selectedSegments = [];
      this.deselectAllHandles();
    }

    if (!this._selectedEntities.includes(entity)) {
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

      this._selectedEntities.push(entity);
      entity.selected = false;
    }

    this._refreshRender();
    this._notify();
  }

  selectEntities(entities, addToSelection = false) {
    const list = Array.isArray(entities) ? entities : [];
    const viewportManager = this._getUtils()?.canvasViewportManager;
    if (viewportManager) {
      viewportManager.previousViewState = null;
    }

    if (!addToSelection) {
      this._selectedEntities = [];
      this.selectedSegments = [];
      this.deselectAllHandles();
    }

    const selectedSet = new Set(this._selectedEntities);
    let changed = !addToSelection;

    for (let i = 0; i < list.length; i++) {
      const entity = list[i];
      if (!entity || selectedSet.has(entity) || !this._isLayerEditable(entity)) continue;

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

      this._selectedEntities.push(entity);
      selectedSet.add(entity);
      entity.selected = false;
      changed = true;
    }

    if (changed) {
      this._refreshRender();
      this._notify();
    }
  }

  deselectAllEntities() {
    this._selectedEntities = [];
    this.selectedSegments = [];
    this.deselectAllHandles();

    this._refreshRender();
    this._notify();
  }

  selectHandle(segment, type, addToSelection = false) {
    if (!segment || !segment.path || !type) return;
    if (!this._isLayerEditable(segment.path)) return;

    if (!addToSelection) {
      this._clearSelectedEntitiesOnly(false);
      this.deselectAllHandles();
    }

    const exists = this.selectedHandles.some((h) => h.segment === segment && h.type === type);
    if (!exists) {
      this.selectedHandles.push({ segment, type });
    }

    this._refreshRender({ stroke: false, handles: true });
    this._notify();
  }

  deselectHandle(segment, type) {
    this.selectedHandles = this.selectedHandles.filter((h) => !(h.segment === segment && h.type === type));
    this._refreshRender({ stroke: false, handles: true });
    this._notify();
  }

  deselectAllHandles() {
    this.selectedHandles = [];
  }

  isSelectedHandle(segment, type) {
    return this.selectedHandles.some(h => h.segment === segment && h.type === type);
  }

  deselectEntity(entity) {
    const index = this._selectedEntities.indexOf(entity);
    const viewportManager = this._getUtils()?.canvasViewportManager;
    if (viewportManager) {
      viewportManager.previousViewState = null;
    }
    if (index !== -1) {
      this._selectedEntities.splice(index, 1);
    }

    const paperInst = this._getPaper();
    if (paperInst && entity instanceof paperInst.Path && entity.segments) {
      entity.segments.forEach((seg) => {
        const segIdx = this.selectedSegments.indexOf(seg);
        if (segIdx !== -1) {
          this.selectedSegments.splice(segIdx, 1);
        }
      });
    }

    this._refreshRender();
    this._notify();
  }

  deselectEntities(entities) {
    const list = Array.isArray(entities) ? entities : [];
    if (list.length === 0 || this._selectedEntities.length === 0) return;

    const viewportManager = this._getUtils()?.canvasViewportManager;
    if (viewportManager) {
      viewportManager.previousViewState = null;
    }

    const toRemove = new Set(list);
    const prevLen = this._selectedEntities.length;
    this._selectedEntities = this._selectedEntities.filter((ent) => !toRemove.has(ent));

    const paperInst = this._getPaper();
    if (paperInst && this.selectedSegments.length > 0) {
      this.selectedSegments = this.selectedSegments.filter((seg) => !seg?.path || !toRemove.has(seg.path));
    }

    if (this._selectedEntities.length !== prevLen) {
      this._refreshRender();
      this._notify();
    }
  }  

  deselectAllEditingEntities() {
    this.editingEntities = [];
    this.deselectAllEntities();
  }

  selectSegment(segment, addToSelection = false) {
    if (!segment || !segment.path) return;
    if (!this._isLayerEditable(segment.path)) return;

    if (!addToSelection) {
      this._clearSelectedEntitiesOnly(false);
      this.selectedSegments = [];
    }

    if (!this.selectedSegments.includes(segment)) {
      this.selectedSegments.push(segment);
    }

    this._refreshRender({ stroke: false, handles: true });
    this._notify();
  }

  selectSegments(segments, addToSelection = false) {
    const list = Array.isArray(segments) ? segments : [];

    if (!addToSelection) {
      this._clearSelectedEntitiesOnly(false);
      this.selectedSegments = [];
    }

    const selectedSet = new Set(this.selectedSegments);
    let changed = !addToSelection;

    for (let i = 0; i < list.length; i++) {
      const segment = list[i];
      if (!segment || !segment.path || selectedSet.has(segment)) continue;
      if (!this._isLayerEditable(segment.path)) continue;

      this.selectedSegments.push(segment);
      selectedSet.add(segment);
      changed = true;
    }

    if (changed) {
      this._refreshRender({ stroke: false, handles: true });
      this._notify();
    }
  }

  deselectSegment(segment) {
    const index = this.selectedSegments.indexOf(segment);
    if (index !== -1) {
      this.selectedSegments.splice(index, 1);
    }

    this._refreshRender({ stroke: false, handles: true });
    this._notify();
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
      this._refreshRender();
      this._notify();
    }
  }

  deleteSelectedElements(renderBezierFn) {
    // A. Borrado de PUNTOS DE CONTROL (Vértices/Anclas seleccionados)
    if (this.selectedSegments.length > 0) {
      const pathSegmentMap = new Map();

      this.selectedSegments.forEach((seg) => {
        if (seg && seg.path) {
          if (!pathSegmentMap.has(seg.path)) {
            pathSegmentMap.set(seg.path, []);
          }
          pathSegmentMap.get(seg.path).push(seg);
        }
      });

      const pathsAffected = Array.from(pathSegmentMap.entries()).map(([path, segs]) => ({
        path,
        indicesToDelete: segs
          .map((s) => s.index)
          .filter((idx) => idx !== undefined && idx !== -1)
          .sort((a, b) => b - a),
        originalSegmentsState: path.segments.map((s) => ({
          point: s.point.clone(),
          handleIn: s.handleIn.clone(),
          handleOut: s.handleOut.clone()
        }))
      }));

      this.service.executeCommand(new DeleteCommand(this.service, {
        type: 'segments',
        pathsAffected
      }));
      if (renderBezierFn) renderBezierFn();
      return;
    }

    // B. Borrado de ENTIDAD COMPLETA
    if (this.selectedEntities.length > 0) {
      this.service.executeCommand(new DeleteCommand(this.service, {
        type: 'entities',
        entities: [...this.selectedEntities]
      }));
      if (renderBezierFn) renderBezierFn();
    }
  }

  enterEditMode(entities = null, { append = false } = {}) {
    const sourceList = entities
      ? (Array.isArray(entities) ? entities : [entities])
      : [...this._selectedEntities];

    const paperInst = this._getPaper();
    const editable = sourceList.filter((ent) => {
      if (!ent || !ent.parent || !ent.visible) return false;
      if (!this._isLayerEditable(ent)) return false;

      if (ent.data?.controller) return true;
      if (!paperInst || !(ent instanceof paperInst.Path) || ent.data?.isPointEntity) return false;
      return Boolean(ent.segments && ent.segments.length >= 2);
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

    this._selectedEntities = this._selectedEntities.filter((ent) => !editable.includes(ent));

    this._refreshRender({ updateView: true });
    this._notify();

    return editable;
  }

  exitEditMode() {
    if (this.editingEntities.length === 0) return false;

    this.editingEntities = [];
    this.deselectAllSegments();
    this.deselectAllHandles();

    const utils = this._getUtils();
    if (utils) {
      utils.hoveredHandle = null;
      utils.hoveredCurve = null;
    }

    this._refreshRender({ updateView: true });
    this._notify();

    return true;
  }

  _clearSelectedEntitiesOnly(notify = true) {
    if (this._selectedEntities.length === 0) return;

    this._selectedEntities = [];
    this._refreshRender();
    if (notify) this._notify();
  }
}