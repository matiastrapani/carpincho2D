/**
 * CADService.js - Servicio geométrico, OSNAP, recortes (Trim), división y estado CAD.
 */

import { CommandHistory } from './CommandHistory.js';
import { OsnapEngine } from './engines/OsnapEngine.js';
import { GeometryEngine } from './engines/GeometryEngine.js';
import { SelectionManager } from './SelectionManager.js';
import { CAD_THEME } from '../config/cadTheme.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';

export class CADService {
  constructor() {
    this.osnapEngine = new OsnapEngine(this);
    this.geometryEngine = new GeometryEngine(this);
    this.selectionManager = new SelectionManager(this);

    this.entities = [];
    this.hoveredEntity = null;
    this.utils = null;
    this.onHistoryChange = null;
    this._suppressedExitSnapPoint = null;
    this._suppressTransactionLog = false;

    this.history = new CommandHistory();
    this.history.subscribe((tx) => this._handleHistoryTransaction(tx));
    this.isSnapMasterEnabled = true;
    this.isOrthoEnabled = false;

    this.snapFilters = {
      endpoint: true,
      midpoint: true,
      node: true,
      intersection: true,
      center: true,
      quadrant: true,
      perpendicular: true,
      tangent: false,
      nearest: false,
      grid: false
    };

    this.trimCuttingBoundaries = [];
    this.isTrimCuttingPhase = false;
  }

  _getPaper() {
    const paperInstance = (this.utils && this.utils.paper)
      ? this.utils.paper
      : (typeof paper !== 'undefined' ? paper : null);
    if (!paperInstance) {
      throw new Error('CADService requiere una instancia válida de Paper.js.');
    }
    return paperInstance;
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
    this._suppressedExitSnapPoint = null;
    this.history.execute(command);
  }

  undo(options = {}) {
    const cm = this.utils?.consoleManager;
    const silent = Boolean(options?.silentLog);

    this._suppressTransactionLog = silent;
    let undoneCommand = null;
    try {
      undoneCommand = this.history.undo();
    } finally {
      this._suppressTransactionLog = false;
    }

    if (!undoneCommand && !silent && cm) {
      cm.logSystem(`[DESHACER] ${CAD_CATALOG.commands.undo.logs.empty}`, { grouped: false });
    }

    return Boolean(undoneCommand);
  }

  redo(options = {}) {
    const cm = this.utils?.consoleManager;
    const silent = Boolean(options?.silentLog);

    this._suppressTransactionLog = silent;
    let redoneCommand = null;
    try {
      redoneCommand = this.history.redo();
    } finally {
      this._suppressTransactionLog = false;
    }

    if (!redoneCommand && !silent && cm) {
      cm.logSystem(`[REHACER] ${CAD_CATALOG.commands.redo.logs.empty}`, { grouped: false });
    }

    return Boolean(redoneCommand);
  }

  _handleHistoryTransaction({ type, command }) {
    this._notifyHistoryChange();

    if (this._suppressTransactionLog || !command) return;
    const cm = this.utils?.consoleManager;
    if (!cm) return;

    const info = this._describeCommand(command);
    if (!info?.label) return;

    if (type === 'execute') {
      if (info.skipExecuteLog) return;
      const isGrouped = Boolean(cm.hasActiveCommandGroup?.() || cm.hasActiveCompactBlock?.());
      const text = info.raw ? info.label : (info.tag ? `[${info.tag}] ${info.label}` : info.label);
      cm.logSystem(text, { grouped: isGrouped });
      return;
    }

    const cleanTarget = info.raw
      ? info.label.replace(/^\[CAPA\]\s*/i, 'Capa ')
      : (info.historyLabel || info.label);
    const actionTag = type === 'undo' ? '[DESHACER]' : '[REHACER]';
    cm.logSystem(`${actionTag} ${cleanTarget}`, { grouped: false });
  }

  _describeCommand(command) {
    if (typeof command.getDescription === 'function') {
      const desc = command.getDescription();
      return typeof desc === 'string' ? { label: desc, raw: true } : desc;
    }

    const typeName = command.constructor?.name || '';
    const entity = command.lineEntity || command.pointEntity || command.entity;

    if (typeName === 'AddLineCommand' || typeName === 'AddPointCommand' || typeName === 'AddEntityCommand') {
      return { label: entity?.name || 'Entidad', skipExecuteLog: true };
    }

    if (typeName === 'TrimCommand') {
      const target = command.originalPath?.name || 'Entidad';
      return { tag: 'RECORTAR', label: `Recorte ${target}` };
    }

    if (typeName === 'BatchTrimCommand') {
      const names = (command.commands || []).map((c) => c.originalPath?.name).filter(Boolean);
      const target = names.length === 1 ? names[0] : `${names.length} entidades`;
      return { tag: 'RECORTAR', label: `Recorte ${target}` };
    }

    if (typeName === 'ExtendCommand') {
      const target = command.path?.name || 'Entidad';
      return { tag: 'EXTENDER', label: `Alargamiento ${target}` };
    }

    if (typeName === 'MoveCommand') {
      const data = command.moveData || {};
      const items = Array.isArray(data)
        ? data
        : (data.entities || (data.entity ? [data.entity] : []));
      const names = items.map((it) => it?.entity?.name || it?.name).filter(Boolean);
      const segCount = data.segments?.length || 0;
      const handleCount = data.handles?.length || 0;
      let target;
      if (names.length === 1) {
        target = names[0];
      } else if (names.length > 1) {
        target = `${names.length} entidades`;
      } else if (segCount > 0) {
        target = segCount === 1 ? '1 nodo' : `${segCount} nodos`;
      } else if (handleCount > 0) {
        target = handleCount === 1 ? '1 tirador' : `${handleCount} tiradores`;
      } else {
        target = '1 entidad';
      }
      return {
        tag: 'MOVER',
        label: target,
        historyLabel: `Desplazamiento ${target}`,
        skipExecuteLog: Boolean(data.skipExecuteLog)
      };
    }

    if (typeName === 'DeleteCommand') {
      return { tag: 'ELIMINAR', label: 'Elementos eliminados' };
    }

    if (typeName === 'DivideCommand') {
      const pts = command.pointsCreated?.length || 0;
      return { tag: 'DIVIDIR', label: `${pts} puntos creados` };
    }

    if (typeName === 'TransformEntityCommand') {
      const target = command.entity?.name || 'Entidad';
      return { tag: 'TRANSFORMAR', label: target };
    }

    if (typeName === 'UpdateEntityPropertyCommand') {
      const count = Array.isArray(command.entities) ? command.entities.length : 1;
      return { tag: 'PROPIEDADES', label: `${count} ${count === 1 ? 'entidad actualizada' : 'entidades actualizadas'}` };
    }

    if (typeName === 'UpdateDefaultSettingsCommand') {
      return { tag: 'PROPIEDADES', label: 'Valores por defecto actualizados' };
    }

    if (typeName === 'EntityVisibilityLockCommand') {
      const count = command.entries?.length || 0;
      const target = count === 1
        ? (command.entries[0]?.entity?.name || '1 entidad')
        : `${count} entidades`;
      const actionMap = {
        hide: { tag: 'OCULTAR', label: `${target} oculta${count === 1 ? '' : 's'}` },
        unhideAll: { tag: 'MOSTRAR', label: `${target} visible${count === 1 ? '' : 's'}` },
        lock: { tag: 'BLOQUEAR', label: `${target} bloqueada${count === 1 ? '' : 's'}` },
        unlockAll: { tag: 'DESBLOQUEAR', label: `${target} desbloqueada${count === 1 ? '' : 's'}` }
      };
      return actionMap[command.action] || { tag: 'ESTADO', label: target };
    }

    if (typeName === 'ImportSVGCommand') {
      const count = (command.entities || command.importedEntities)?.length || 0;
      const label = count === 1 ? 'SVG (1 trazado)' : `SVG (${count} trazados)`;
      return { tag: 'IMPORTAR', label, skipExecuteLog: true };
    }

    return null;
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

  suppressOsnapUntilLeave(pt) {
    this._suppressedExitSnapPoint = pt ? pt.clone() : null;
  }

  calculateOsnap(mousePoint, renderMarkerFn, activePath = null, ignoreContext = null) {
    let effectiveContext = ignoreContext;

    if (this._suppressedExitSnapPoint && mousePoint) {
      const p = this._getPaper();
      const zoom = p.view?.zoom || 1;
      const leaveThreshold = 14 / zoom;

      if (mousePoint.getDistance(this._suppressedExitSnapPoint) <= leaveThreshold) {
        const existingCoords = ignoreContext?.selectedPointsCoords || [];
        effectiveContext = {
          ...(ignoreContext || {}),
          selectedPointsCoords: [...existingCoords, this._suppressedExitSnapPoint]
        };
      } else {
        this._suppressedExitSnapPoint = null;
      }
    }

    return this.osnapEngine.calculateOsnap(mousePoint, renderMarkerFn, activePath, effectiveContext);
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

  resetDocument() {
    const utils = this.utils;
    const activeTool = utils?.toolManager?.activeTool;
    if (activeTool && typeof activeTool.cancel === 'function') {
      activeTool.cancel();
    }

    this.selectionManager.deselectAllEditingEntities();
    this.hoveredEntity = null;
    this.trimCuttingBoundaries = [];
    this.isTrimCuttingPhase = false;
    this._suppressedExitSnapPoint = null;

    this.entities.forEach((ent) => {
      if (ent && typeof ent.remove === 'function') {
        ent.remove();
      }
    });
    this.entities = [];

    if (utils?.activePath) {
      utils.activePath.remove();
      utils.activePath = null;
    }

    this.history.clear();

    const layerManager = this.layerManager || utils?.layerManager;
    if (layerManager && typeof layerManager.resetLayers === 'function') {
      layerManager.resetLayers();
    }

    const propertyManager = this.propertyManager || utils?.propertyManager;
    if (propertyManager && typeof propertyManager.resetDefaultSettings === 'function') {
      propertyManager.resetDefaultSettings();
    }

    if (utils) {
      utils.selectedHandle = null;
      utils.hoveredHandle = null;
      utils.hoveredCurve = null;
      utils.hud?.clear?.();
      if (typeof utils.setTool === 'function') {
        utils.setTool('select');
      }
      utils.viewportManager?.zoomReset?.(false);
    }

    const renderEngine = this.selectionRenderEngine || utils?.selectionRenderEngine;
    renderEngine?.updateEntitiesStroke?.();
    renderEngine?.renderBezierHandles?.();

    const paperInst = this._getPaper();
    if (paperInst?.view) {
      paperInst.view.update();
    }

    if (utils?.consoleManager) {
      utils.consoleManager.clear();
      utils.consoleManager.showWelcomeMessage();
    }

    this._notifyHistoryChange();
  }
  
  createPointEntity(pt, options = {}) {
    if (!pt) return null;

    const p = this._getPaper();
    const zoom = p.view.zoom || 1;
    const opts = options || {};
    const nodeTheme = CAD_THEME.node;
    const activeLayerId = (this.utils && this.utils.layerManager)
      ? this.utils.layerManager.activeLayerId
      : '0';
    const layerId = String(opts.layerId || activeLayerId);
    const colorByLayer = opts.colorByLayer !== undefined ? opts.colorByLayer : true;

    let strokeColor = opts.strokeColor;
    if (colorByLayer && this.utils && this.utils.layerManager) {
      const layer = this.utils.layerManager.layers.get(layerId);
      strokeColor = layer ? layer.color : nodeTheme.defaultStrokeColor;
    } else if (!strokeColor) {
      strokeColor = nodeTheme.defaultStrokeColor;
    }

    const fillColor = opts.fillColor || nodeTheme.defaultFillColor || CAD_THEME.canvas.backgroundColor;
    const strokeWidth = (nodeTheme.strokeWidthPx || 1.0) / zoom;

    const pointMarker = new p.Path.Circle({
      center: pt,
      radius: (nodeTheme.normalRadiusPx || 3.5) / zoom,
      fillColor,
      strokeColor,
      strokeWidth,
      insert: false
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

    return pointMarker;
  }

  createLineEntity(fromPt, toPt, isDynamic = true, baseWidth = 1) {
    const EPSILON = 0.001;
    if (!fromPt || !toPt || fromPt.getDistance(toPt) < EPSILON) {
      return null;
    }

    const p = this._getPaper();
    const zoom = p.view.zoom || 1;
    const initialWidth = isDynamic ? (baseWidth / zoom) : baseWidth;
    const defaultColor = CAD_THEME.properties.customFallbackColor;

    const line = new p.Path.Line({
      from: fromPt,
      to: toPt,
      strokeColor: defaultColor,
      strokeWidth: initialWidth,
      insert: false
    });

    line.data = {
      isDynamicStroke: isDynamic,
      baseStrokeWidth: baseWidth,
      origStrokeColor: defaultColor,
      origStrokeWidth: initialWidth
    };

    return line;
  }

  createCircleEntity(centerPt, radius, isDynamic = true, baseWidth = 1) {
    const EPSILON = 0.001;
    if (!centerPt || isNaN(radius) || radius < EPSILON) {
      return null;
    }

    const p = this._getPaper();
    const zoom = p.view.zoom || 1;
    const initialWidth = isDynamic ? (baseWidth / zoom) : baseWidth;
    const defaultColor = CAD_THEME.properties.customFallbackColor;

    const circlePath = new p.Path.Circle({
      center: centerPt,
      radius,
      strokeColor: defaultColor,
      strokeWidth: initialWidth,
      fillColor: null,
      insert: false
    });

    circlePath.data = {
      isCircleEntity: true,
      isDynamicStroke: isDynamic,
      baseStrokeWidth: baseWidth,
      centerPt: centerPt.clone(),
      radius,
      origStrokeWidth: initialWidth,
      origStrokeColor: defaultColor,
      origFillColor: null
    };

    return circlePath;
  }

  createPathEntity(segments = [], options = {}) {
    const p = this._getPaper();
    const opts = options || {};
    const isDynamic = opts.isDynamic !== undefined ? opts.isDynamic : true;
    const baseWidth = opts.baseWidth !== undefined ? opts.baseWidth : 1;
    const zoom = p.view.zoom || 1;
    const initialWidth = isDynamic ? (baseWidth / zoom) : baseWidth;
    const defaultColor = CAD_THEME.properties.customFallbackColor;

    const path = new p.Path({
      segments,
      closed: Boolean(opts.closed),
      strokeColor: defaultColor,
      strokeWidth: initialWidth,
      fillColor: null,
      insert: false
    });

    path.data = {
      isDynamicStroke: isDynamic,
      baseStrokeWidth: baseWidth,
      origStrokeColor: defaultColor,
      origStrokeWidth: initialWidth
    };

    if (opts.isSpline) {
      path.data.isSpline = true;
    }

    return path;
  }

  registerEntity(entity) {
    const EPSILON = 0.001;
    if (!entity) return false;

    const p = this._getPaper();
    const isPoint = Boolean(entity.data && entity.data.isPointEntity);

    if (entity instanceof p.Path && !isPoint) {
      if (entity.length < EPSILON) {
        entity.remove();
        return false;
      }
    }

    if (isPoint) {
      const pointsLayer = (this.utils && this.utils.pointsLayer)
        ? this.utils.pointsLayer
        : (p.project && p.project.layers ? p.project.layers['pointsLayer'] : null);
      if (pointsLayer && entity.parent !== pointsLayer) {
        pointsLayer.addChild(entity);
      }
    }

    this.entities.push(entity);
    return true;
  }
}