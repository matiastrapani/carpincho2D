/**
 * cadService.js - Servicio geométrico, OSNAP, recortes (Trim), división y estado CAD.
 */

import { CommandHistory } from './commandHistory.js';
import { DeleteCommand, TrimCommand, AddEntityCommand } from './commands/cadCommands.js';
import { OsnapEngine } from './engines/OsnapEngine.js';
import { GeometryEngine } from './engines/GeometryEngine.js';
import { SelectionManager } from './SelectionManager.js';

export class CADService {
  constructor() {
    this.osnapEngine = new OsnapEngine(this);
    this.geometryEngine = new GeometryEngine(this);
    this.selectionManager = new SelectionManager(this);

    this.demoEntities = [];
    this.selectedEntities = [];
    this.selectedSegments = [];
    this.editingEntities = [];
    this.selectedSegments = [];
    this.selectedHandles = [];
    this.hoveredEntity = null;
    this.lastInsertedPoint = null;

    this.history = new CommandHistory();
    this.isSnapMasterEnabled = true;

    this.isSnapMasterEnabled = true;
    this.snapFilters = {
      endpoint: true,
      midpoint: true,
      node: true,
      intersection: true,
      center: true,    // <--- Nuevo filtro
      quadrant: true,  // <--- Nuevo filtro
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


  executeCommand(command) {
    this.history.execute(command);
    if (window.cadUI && typeof window.cadUI.updateUndoRedoUI === 'function') {
      window.cadUI.updateUndoRedoUI();
    }
  }

  undo() {
    this.history.undo();
    if (window.cadUI && typeof window.cadUI.updateUndoRedoUI === 'function') {
      window.cadUI.updateUndoRedoUI();
    }
  }

  redo() {
    this.history.redo();
    if (window.cadUI && typeof window.cadUI.updateUndoRedoUI === 'function') {
      window.cadUI.updateUndoRedoUI();
    }
  }

  toggleSnapMaster() {
    this.isSnapMasterEnabled = !this.isSnapMasterEnabled;
    return this.isSnapMasterEnabled;
  }

  toggleSnapFilter(filterKey) {
    this.snapFilters[filterKey] = !this.snapFilters[filterKey];
    return this.snapFilters[filterKey];
  }

  calculateOsnap(mousePoint, renderMarkerFn, activePath = null, ignoreContext = null) {
    return this.osnapEngine.calculateOsnap(mousePoint, renderMarkerFn, activePath, ignoreContext);
  }

  //SELECTION SECTION
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
  //SELECTION SECTION


  performTrim(targetPath, clickPt, renderBezierFn) {
    return this.geometryEngine.performTrim(targetPath, clickPt, renderBezierFn);
  }

  clearCanvas(renderBezierFn) {
    this.demoEntities.forEach(ent => ent.remove());
    this.demoEntities = [];
    this.selectedEntities = [];
    this.selectedSegments = [];
    if (renderBezierFn) renderBezierFn();
  }

  createDemoEntities() {
    const rect = new paper.Path.Rectangle({
      point: [-180, -120],
      size: [120, 80],
      strokeColor: '#00e5ff',
      strokeWidth: 2,
    });
    rect.data = { 
      layerId: '0',
      colorByLayer: true,      // <--- Color heredado de la capa '0'
      widthByLayer: false,
      baseStrokeWidth: 2,
      isDynamicStroke: true
    };
    this.demoEntities.push(rect);

    const poly = new paper.Path.RegularPolygon({
      center: [150, -80],
      sides: 6,
      radius: 50,
      strokeColor: '#f59e0b',
      strokeWidth: 2
    });
    poly.data = { 
      layerId: '0',
      colorByLayer: false,
      origStrokeColor: '#f59e0b',
      widthByLayer: false,
      baseStrokeWidth: 2,
      isDynamicStroke: true
    };
    this.demoEntities.push(poly);

    const curve = new paper.Path({
      segments: [
        [new paper.Point(-120, 100), null, new paper.Point(40, -60)],
        [new paper.Point(0, 180), new paper.Point(-40, 0), new paper.Point(40, 0)],
        [new paper.Point(140, 100), new paper.Point(-40, 50), null]
      ],
      strokeColor: '#10b981',
      strokeWidth: 2.5
    });
    curve.data = { 
      layerId: '0',
      colorByLayer: false,
      origStrokeColor: '#10b981',
      widthByLayer: false,
      baseStrokeWidth: 2.5,      // <--- Grosor heredado de la capa '0'
      isDynamicStroke: true
    };
    this.demoEntities.push(curve);

    this.createPointEntity(new paper.Point(-120, -120), { layerId: '0', colorByLayer: true });
    this.createPointEntity(new paper.Point(-60, -120), { layerId: '0', colorByLayer: true });

    if (this.utils?.updateEntitiesStroke) {
      this.utils.updateEntitiesStroke();
    }
  }

  createPointEntity(pt, options = {}) {
    const EPSILON = 0.001;

    if (this.lastInsertedPoint && this.lastInsertedPoint.getDistance(pt) < EPSILON) {
      return null;
    }

    const zoom = paper.view.zoom;
    const opts = options || {};
    const nodeTheme = (window.CAD_THEME && window.CAD_THEME.node) ? window.CAD_THEME.node : {};

    const layerId = String(opts.layerId || this.utils?.layerManager?.activeLayerId || '0');
    const colorByLayer = opts.colorByLayer !== undefined ? opts.colorByLayer : true;

    // Resolver el color directamente de la capa si es BYLAYER
    let strokeColor = opts.strokeColor;
    if (colorByLayer && window.cadUtils?.layerManager) {
      const layer = window.cadUtils.layerManager.layers.get(layerId);
      strokeColor = layer ? layer.color : (nodeTheme.defaultStrokeColor || '#18fcf1');
    } else if (!strokeColor) {
      strokeColor = nodeTheme.defaultStrokeColor || '#18fcf1';
    }

    const fillColor = opts.fillColor || nodeTheme.defaultFillColor || '#10141D';

    if (window.cadUtils && window.cadUtils.nodesLayer) {
      window.cadUtils.nodesLayer.activate();
    }

    const pointMarker = new paper.Path.Circle({
      center: pt,
      radius: (nodeTheme.normalRadiusPx || 3.5) / zoom,
      fillColor: fillColor,
      strokeColor: strokeColor,
      strokeWidth: (nodeTheme.normalWidthPx || 1.0) / zoom
    });

    pointMarker.data = { 
      isPointEntity: true, 
      layerId: layerId,
      colorByLayer: colorByLayer,
      centerPt: pt.clone(),
      origFillColor: fillColor,
      origStrokeColor: colorByLayer ? undefined : strokeColor,
      origStrokeWidth: (nodeTheme.normalWidthPx || 1.0) / zoom 
    };

    if (window.cadUtils && window.cadUtils.drawLayer) {
      window.cadUtils.drawLayer.activate();
    }

    const success = this.registerEntity(pointMarker);
    if (success) {
      this.lastInsertedPoint = pt.clone();
      return pointMarker;
    }
    return null;
  }

  divideEntityByCount(entity, count, renderBezierFn, options = {}) {
    return this.geometryEngine.divideEntityByCount(entity, count, renderBezierFn, options);
  }

  divideEntityByDistance(entity, distance, renderBezierFn, options = {}, customStartPt = null) {
    return this.geometryEngine.divideEntityByDistance(entity, distance, renderBezierFn, options, customStartPt);
  }

  createLineEntity(fromPt, toPt, isDynamic = true, baseWidth = 1) {
    const zoom = paper.view.zoom;
    const initialWidth = isDynamic ? (baseWidth / zoom) : baseWidth;

    const line = new paper.Path.Line({
      from: fromPt,
      to: toPt,
      strokeColor: '#00e5ff',
      strokeWidth: initialWidth
    });

    line.data = {
      isDynamicStroke: isDynamic, // true = cosmético (fijo a pantalla), false = modelo (escala con zoom)
      baseStrokeWidth: baseWidth,  // grosor base (1px si es dinámico, N unidades si es de modelo)
      origStrokeColor: '#00e5ff',
      origStrokeWidth: initialWidth
    };

    const success = this.registerEntity(line);
    if (success) {
      return line;
    }
    return null;
  }

  createCircleEntity(centerPt, radius, isDynamic = true, baseWidth = 1) {
    const zoom = paper.view.zoom;
    const initialWidth = isDynamic ? (baseWidth / zoom) : baseWidth;

    const circlePath = new paper.Path.Circle({
      center: centerPt,
      radius: radius,
      strokeColor: '#3b82f6',
      strokeWidth: initialWidth,
      fillColor: null
    });

    circlePath.data = {
      isCircleEntity: true,
      isDynamicStroke: isDynamic,
      baseStrokeWidth: baseWidth,
      centerPt: centerPt.clone(),
      radius: radius,
      origStrokeWidth: initialWidth,
      origStrokeColor: '#3b82f6',
      origFillColor: null
    };

    const success = this.registerEntity(circlePath);
    if (success) {
      // Instanciar directamente AddEntityCommand importado arriba
      const addCmd = new AddEntityCommand(this, circlePath);
      this.executeCommand(addCmd);
      return circlePath;
    }
    return null;
  }

  registerEntity(entity) {
    const EPSILON = 0.001; // Tolerancia de modelo CAD

    if (!entity) return false;

    // A. Si es una Línea / Camino: prevenir longitud cero
    if (entity instanceof paper.Path && !entity.data?.isPointEntity) {
      if (entity.length < EPSILON) {
        entity.remove();
        return false;
      }
    }

    this.demoEntities.push(entity);
    return true;
  }
}
