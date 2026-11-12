/**
 * cadService.js - Servicio geométrico, OSNAP, recortes (Trim), división y estado CAD.
 */

import { CommandHistory } from './commandHistory.js';
import { AddEntityCommand } from './commands/cadCommands.js';
import { OsnapEngine } from './engines/OsnapEngine.js';
import { GeometryEngine } from './engines/GeometryEngine.js';
import { SelectionManager } from './SelectionManager.js';
import { CAD_THEME } from '../config/cadTheme.js';

export class CADService {
  constructor() {
    this.osnapEngine = new OsnapEngine(this);
    this.geometryEngine = new GeometryEngine(this);
    this.selectionManager = new SelectionManager(this);

    this.entities = [];
    this.hoveredEntity = null;
    this.lastInsertedPoint = null;
    this.utils = null;
    this.onHistoryChange = null;

    this.history = new CommandHistory();
    this.isSnapMasterEnabled = true;
    this.isOrthoEnabled = false;

    this.snapFilters = {
      endpoint: true,
      midpoint: true,
      node: true,
      intersection: true,
      center: true,
      quadrant: true,
      grid: false
    };

    this.trimCuttingBoundaries = [];
    this.isTrimCuttingPhase = false;
  }

  get selectedEntities() { return this.selectionManager.selectedEntities; }
  set selectedEntities(val) { this.selectionManager.selectedEntities = val; }

  get selectedSegments() { return this.selectionManager.selectedSegments; }
  set selectedSegments(val) { this.selectionManager.selectedSegments = val; }

  get editingEntities() { return this.selectionManager.editingEntities; }
  set editingEntities(val) { this.selectionManager.editingEntities = val; }

  get selectedHandles() { return this.selectionManager.selectedHandles; }
  set selectedHandles(val) { this.selectionManager.selectedHandles = val; }

  _notifyHistoryChange() {
    if (typeof this.onHistoryChange === 'function') {
      this.onHistoryChange();
    } else if (this.utils?.uiManager?.updateUndoRedoUI) {
      this.utils.uiManager.updateUndoRedoUI();
    }
  }

  executeCommand(command) {
    this.history.execute(command);
    this._notifyHistoryChange();
  }

  undo() {
    this.history.undo();
    this._notifyHistoryChange();
  }

  redo() {
    this.history.redo();
    this._notifyHistoryChange();
  }

  toggleSnapMaster() {
    this.isSnapMasterEnabled = !this.isSnapMasterEnabled;
    return this.isSnapMasterEnabled;
  }

  toggleSnapFilter(filterKey) {
    this.snapFilters[filterKey] = !this.snapFilters[filterKey];
    return this.snapFilters[filterKey];
  }

  toggleOrtho() {
    this.isOrthoEnabled = !this.isOrthoEnabled;
    return this.isOrthoEnabled;
  }

  calculateOsnap(mousePoint, renderMarkerFn, activePath = null, ignoreContext = null) {
    return this.osnapEngine.calculateOsnap(mousePoint, renderMarkerFn, activePath, ignoreContext);
  }

  // --- SELECCIÓN ---
  selectEntity(entity, addToSelection = false) {
    return this.selectionManager.selectEntity(entity, addToSelection);
  }

  deselectAllEntities() {
    return this.selectionManager.deselectAllEntities();
  }

  selectHandle(segment, type, addToSelection = false) {
    return this.selectionManager.selectHandle(segment, type, addToSelection);
  }

  deselectHandle(segment, type) {
    return this.selectionManager.deselectHandle(segment, type);
  }

  deselectAllHandles() {
    return this.selectionManager.deselectAllHandles();
  }

  isSelectedHandle(segment, type) {
    return this.selectionManager.isSelectedHandle(segment, type);
  }

  deselectEntity(entity) {
    return this.selectionManager.deselectEntity(entity);
  }

  deselectAllEditingEntities() {
    return this.selectionManager.deselectAllEditingEntities();
  }

  selectSegment(segment, addToSelection = false) {
    return this.selectionManager.selectSegment(segment, addToSelection);
  }

  deselectSegment(segment) {
    return this.selectionManager.deselectSegment(segment);
  }

  deselectAllSegments() {
    return this.selectionManager.deselectAllSegments();
  }

  deleteSelectedElements(renderBezierFn) {
    return this.selectionManager.deleteSelectedElements(renderBezierFn);
  }

  // --- GEOMETRÍA ---
  performTrim(targetPath, clickPt, renderBezierFn) {
    return this.geometryEngine.performTrim(targetPath, clickPt, renderBezierFn);
  }

  divideEntityByCount(entity, count, renderBezierFn, options = {}) {
    return this.geometryEngine.divideEntityByCount(entity, count, renderBezierFn, options);
  }

  divideEntityByDistance(entity, distance, renderBezierFn, options = {}, customStartPt = null) {
    return this.geometryEngine.divideEntityByDistance(entity, distance, renderBezierFn, options, customStartPt);
  }

  clearCanvas(renderBezierFn) {
    this.entities.forEach(ent => ent.remove());
    this.entities = [];
    this.selectedEntities = [];
    this.selectedSegments = [];
    if (renderBezierFn) renderBezierFn();
  }

  createPointEntity(pt, options = {}) {
    const EPSILON = 0.001;
    if (this.lastInsertedPoint && this.lastInsertedPoint.getDistance(pt) < EPSILON) {
      return null;
    }

    const zoom = paper.view.zoom;
    const opts = options || {};
    const nodeTheme = CAD_THEME?.node || {};
    const layerId = String(opts.layerId || this.utils?.layerManager?.activeLayerId || '0');
    const colorByLayer = opts.colorByLayer !== undefined ? opts.colorByLayer : true;

    let strokeColor = opts.strokeColor;
    if (colorByLayer && this.utils?.layerManager) {
      const layer = this.utils.layerManager.layers.get(layerId);
      strokeColor = layer ? layer.color : (nodeTheme.defaultStrokeColor || '#88ff00');
    } else if (!strokeColor) {
      strokeColor = nodeTheme.defaultStrokeColor || '#88ff00';
    }

    const fillColor = opts.fillColor || nodeTheme.defaultFillColor || CAD_THEME.canvas.backgroundColor;
    const strokeWidth = (nodeTheme.strokeWidthPx || 1.0) / zoom;

    this.utils?.nodesLayer?.activate();

    const pointMarker = new paper.Path.Circle({
      center: pt,
      radius: (nodeTheme.normalRadiusPx || 3.5) / zoom,
      fillColor,
      strokeColor,
      strokeWidth
    });

    pointMarker.data = {
      isPointEntity: true,
      layerId,
      colorByLayer,
      centerPt: pt.clone(),
      origFillColor: fillColor,
      origStrokeColor: colorByLayer ? undefined : strokeColor,
      origStrokeWidth: strokeWidth
    };

    this.utils?.drawLayer?.activate();

    if (this.registerEntity(pointMarker)) {
      this.lastInsertedPoint = pt.clone();
      return pointMarker;
    }
    return null;
  }

  createLineEntity(fromPt, toPt, isDynamic = true, baseWidth = 1) {
    const zoom = paper.view.zoom;
    const initialWidth = isDynamic ? (baseWidth / zoom) : baseWidth;
    const defaultColor = CAD_THEME.properties.customFallbackColor;

    const line = new paper.Path.Line({
      from: fromPt,
      to: toPt,
      strokeColor: defaultColor,
      strokeWidth: initialWidth
    });

    line.data = {
      isDynamicStroke: isDynamic,
      baseStrokeWidth: baseWidth,
      origStrokeColor: defaultColor,
      origStrokeWidth: initialWidth
    };

    return this.registerEntity(line) ? line : null;
  }

  createCircleEntity(centerPt, radius, isDynamic = true, baseWidth = 1) {
    const zoom = paper.view.zoom;
    const initialWidth = isDynamic ? (baseWidth / zoom) : baseWidth;

    const circlePath = new paper.Path.Circle({
      center: centerPt,
      radius,
      strokeColor: '#3b82f6',
      strokeWidth: initialWidth,
      fillColor: null
    });

    circlePath.data = {
      isCircleEntity: true,
      isDynamicStroke: isDynamic,
      baseStrokeWidth: baseWidth,
      centerPt: centerPt.clone(),
      radius,
      origStrokeWidth: initialWidth,
      origStrokeColor: '#3b82f6',
      origFillColor: null
    };

    if (this.registerEntity(circlePath)) {
      this.executeCommand(new AddEntityCommand(this, circlePath));
      return circlePath;
    }
    return null;
  }

  registerEntity(entity) {
    const EPSILON = 0.001;
    if (!entity) return false;

    if (entity instanceof paper.Path && !entity.data?.isPointEntity) {
      if (entity.length < EPSILON) {
        entity.remove();
        return false;
      }
    }

    this.entities.push(entity);
    return true;
  }
}