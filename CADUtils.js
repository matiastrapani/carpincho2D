/**
 * CADUtils.js - Orquestador central de la aplicación CAD.
 */

import { LayerManager } from './services/LayerManager.js';
import { PropertyManager } from './services/PropertyManager.js';
import { SelectTool } from './tools/select/SelectTool.js';
import { LineTool } from './tools/LineTool.js';
import { PolylineTool } from './tools/PolylineTool.js';
import { CircleTool } from './tools/CircleTool.js';
import { SplineTool } from './tools/SplineTool.js';
import { BezierTool } from './tools/BezierTool.js';
import { PointTool } from './tools/PointTool.js';

import { TrimTool } from './tools/TrimTool.js';
import { ExtendTool } from './tools/ExtendTool.js';
import { ToolManager } from './tools/ToolManager.js';
import { MoveTool } from './tools/MoveTool.js';
import { DeleteCommand } from './services/commands/cadCommands.js';
import { HUDManager } from './ui/HUDManager.js';
import { CanvasViewportManager } from './services/CanvasViewportManager.js';
import { SelectionRenderEngine } from './services/renderers/SelectionRenderEngine.js';
import { InputDispatcher } from './services/input/InputDispatcher.js';
import { CADIOService } from './services/io/IOService.js';
import { getToolCatalogEntry } from './config/cadCatalog.js';


import { CAD_THEME } from './config/cadTheme.js';


export class CADUtils {
  constructor(canvasId, service) {
    // 1. Referencias al DOM, Paper.js y Servicio Core
    this.canvasElement = document.getElementById(canvasId);
    this.paper = typeof paper !== 'undefined' ? paper : null;
    this.service = service;
    this.service.utils = this;

    // 2. Módulo de Capas y Propiedades (BYLAYER)
    this.layerManager = new LayerManager(this.service, this);
    this.service.layerManager = this.layerManager;

    this.propertyManager = new PropertyManager(this.service, this);
    this.service.propertyManager = this.propertyManager;

    this.selectionRenderEngine = new SelectionRenderEngine(this.service, this);
    this.inputDispatcher = new InputDispatcher(this.service);
    this.ioService = new CADIOService(this.service, this);

    // 3. Estado de Herramientas y Modos de Edición
    this.currentToolMode = 'line';
    this.lastActiveToolMode = 'line';
    this.isChangingTool = false;

    // 4. Estado de Vista y Navegación (Zoom, Pan, Grilla)
    this.viewportManager = new CanvasViewportManager(this);
    this.isPanning = false;
    this.panStartPoint = null;
    this.lastMousePoint = null;
    this.isPointerDown = false;
    this.isShiftPressed = false;

    // 5. Estado de Dibujo Activo y Previsualización Temporal
    this.activePath = null;
    this.bezierHandlePreviewGroup = null;
    this.isDraggingBezierHandle = false;
    this.extendData = null;

    // 6. Estado de Selección, Cuadro Elástico y Grips
    this.selectedHandle = null;
    this.selectionBoxRect = null;
    this.selectionStartPoint = null;

    // 7. Grupos Contenedores Visuales de Paper.js
    this.gridGroup = null;
    this.controlHandlesGroup = null;

    // 8. Sub-Módulos Delegados (UI y Gestor de Herramientas)
    this.hud = new HUDManager(this);
    this.consoleManager = null;
    this.toolManager = new ToolManager(this.service, this);

    // 9. Registro Organizado de Herramientas
    this._registerTools();
  }

  // Getters/Setters de retrocompatibilidad para el Viewport
  get isGridVisible() { return this.viewportManager.isGridVisible; }
  set isGridVisible(val) { this.viewportManager.isGridVisible = val; }

  get gridGroup() { return this.viewportManager.gridGroup; }
  set gridGroup(val) { this.viewportManager.gridGroup = val; }

  get zoomAnimationRequestId() { return this.viewportManager.zoomAnimationRequestId; }
  set zoomAnimationRequestId(val) { this.viewportManager.zoomAnimationRequestId = val; }

  get controlHandlesGroup() {
    return this.selectionRenderEngine?.controlHandlesGroup;
  }

  set controlHandlesGroup(val) {
    if (this.selectionRenderEngine) {
      this.selectionRenderEngine.controlHandlesGroup = val;
    }
  }

  get drawLayer() { return this.viewportManager?.drawLayer || paper.project?.layers['drawLayer']; }
  get nodesLayer() { return this.viewportManager?.nodesLayer || paper.project?.layers['nodesLayer']; }
  get pointsLayer() { return this.viewportManager?.pointsLayer || paper.project?.layers['pointsLayer']; }
  get hudLayer() { return this.viewportManager?.hudLayer || paper.project?.layers['hudLayer']; }
  
  /**
   * Registro centralizado de herramientas clasificadas por categoría
   */
  _registerTools() {
    // Selección
    this.toolManager.registerTool('select', new SelectTool(this.service, this));

    // Geometría Básica y Líneas
    this.toolManager.registerTool('line', new LineTool(this.service, this));
    this.toolManager.registerTool('polyline', new PolylineTool(this.service, this));
    this.toolManager.registerTool('circle', new CircleTool(this.service, this));

    // Curvas Complejas
    this.toolManager.registerTool('spline', new SplineTool(this.service, this));
    this.toolManager.registerTool('bezier', new BezierTool(this.service, this));

    // Puntos y Herramientas de División
    const pointToolInstance = new PointTool(this.service, this);
    this.toolManager.registerTool('point', pointToolInstance);
    this.toolManager.registerTool('divide_count', pointToolInstance);
    this.toolManager.registerTool('divide_dist', pointToolInstance);

    // Modificación y Edición
    this.toolManager.registerTool('move', new MoveTool(this.service, this));
    this.toolManager.registerTool('trim', new TrimTool(this.service, this));
    this.toolManager.registerTool('extend', new ExtendTool(this.service, this));
  }

  setConsoleManager(consoleManager) {
    this.consoleManager = consoleManager;
  }

  // --- MÉTODOS PUENTE / DELEGADOS HACIA MÓDULOS ---
  setPrompt(text) {
    if (this.consoleManager) {
      this.consoleManager.setPrompt(text);
    }
  }

  clearSelectedHandle() {
    this.selectedHandle = null;
  }

  deleteSelectedHandleOrSegment() {
    if (this.selectedHandle && this.selectedHandle.segment) {
      const seg = this.selectedHandle.segment;
      const parentPath = seg.path;
      const type = this.selectedHandle.type;

      if (type === 'handleIn' || type === 'handleOut') {
        const originalVector = type === 'handleIn' ? seg.handleIn.clone() : seg.handleOut.clone();

        const deleteCmd = new DeleteCommand(this.service, {
          type: 'handle',
          segment: seg,
          handleType: type,
          originalVector: originalVector
        });

        this.service.executeCommand(deleteCmd);
        this.selectedHandle = null;

        if (parentPath && !this.service.selectedEntities.includes(parentPath)) {
          this.service.selectEntity(parentPath, true);
        }

        this.selectionRenderEngine.renderBezierHandles();
        return;
      }
    }

    // Resetear la referencia huérfana ANTES de borrar elementos
    this.selectedHandle = null;
    this.service.deleteSelectedElements(() => this.selectionRenderEngine.renderBezierHandles());
  }

  handleGlobalKeydown(e) {
    return this.inputDispatcher.handleGlobalKeydown(e);
  }

  handleGlobalKeyup(e) {
    return this.inputDispatcher.handleGlobalKeyup(e);
  }

  // Selección de herramienta con registro automático en consola
  setTool(toolName) {
    const previousTool = this.currentToolMode;
    this.isChangingTool = true;
    this.currentToolMode = toolName;
    this.closeAllMenus();

    const targetTool = this.toolManager.tools[toolName] || null;
    const isPanMode = toolName === 'pan';
    const selectionMode = isPanMode
      ? 'all'
      : (targetTool?.getSelectionPreserveMode?.(toolName) ?? targetTool?.preservesSelection ?? false);
    const preservesEditMode = isPanMode ||
      Boolean(targetTool?.shouldPreserveEditMode?.(toolName) ?? targetTool?.preservesEditMode);
    const clearsHud = Boolean(targetTool?.shouldClearHudOnActivate?.(toolName) ?? targetTool?.clearsHudOnActivate);

    if (!preservesEditMode) {
      this.service.editingEntities = [];
      this.service.deselectAllSegments();
      if (!selectionMode) {
        this.service.deselectAllEntities();
      }
    }

    if (toolName !== 'select' && !isPanMode) {
      this.lastActiveToolMode = toolName;
    }

    if (this.consoleManager) {
      if (toolName === 'select' || isPanMode) {
        this.consoleManager.endCommandGroup?.();
        this.consoleManager.setPrompt('Comando:');
      } else {
        if (previousTool !== toolName) {
          this.consoleManager.endCommandGroup?.();
          if (!this.consoleManager._skipNextToolEcho) {
            const rawLabel = this.toolManager?.getToolDisplayName(toolName) || toolName;
            const cmdLabel = typeof this.consoleManager.formatCommandName === 'function'
              ? this.consoleManager.formatCommandName(rawLabel)
              : String(rawLabel).trim().charAt(0).toUpperCase() + String(rawLabel).trim().slice(1).toLowerCase();
            this.consoleManager.logUser(cmdLabel, 'Comando: ', { grouped: false });
          }
          this.consoleManager.beginCommandGroup?.();
        }
        this.consoleManager._skipNextToolEcho = false;
        this.consoleManager.state = 'COMMAND_ACTIVE';
      }
    }

    this.toolManager.setTool(toolName);

    if (this.consoleManager && toolName !== 'select' && !isPanMode) {
      this.consoleManager.focusInput?.();
    }

    this.isChangingTool = false;

    document.querySelectorAll('.cad-button').forEach((btn) => btn.classList.remove('active'));
    document.getElementById('btnSnap')?.classList.toggle('active', Boolean(this.service.isSnapMasterEnabled));
    document.getElementById('btnGrid')?.classList.toggle('active', Boolean(this.isGridVisible));
    document.getElementById('btnOrtho')?.classList.toggle('active', Boolean(this.service.isOrthoEnabled));

    const uiMeta = getToolCatalogEntry(toolName)?.ui;
    if (uiMeta?.buttonId) {
      document.getElementById(uiMeta.buttonId)?.classList.add('active');
    }

    const canvas = this.canvasElement || document.getElementById('cadCanvas');
    if (canvas) {
      const cursorMode = isPanMode ? 'pan' : (targetTool?.getCursorMode?.(toolName) || 'draw');
      canvas.className = `tool-${cursorMode}`;
    }

    if (clearsHud && this.hud) {
      this.hud.clear();
    }

    if (uiMeta?.iconId && uiMeta?.iconName) {
      const btnEl = uiMeta.buttonId ? document.getElementById(uiMeta.buttonId) : null;
      const iconEl = document.getElementById(uiMeta.iconId);
      if (btnEl) btnEl.setAttribute('data-default-tool', toolName);
      if (iconEl) {
        iconEl.setAttribute('data-icon', uiMeta.iconName);
        if (window.Iconify) window.Iconify.scan(iconEl.parentElement);
      }
    }
  }

  clearHoverHighlight() {
    if (this.service.hoveredEntity) {
      this.service.hoveredEntity = null;
      this.selectionRenderEngine.updateEntitiesStroke();
    }
  }

  toggleSnapMaster() {
    const isEnabled = this.service.toggleSnapMaster();
    const btnSnap = document.getElementById('btnSnap');
    if (btnSnap) btnSnap.classList.toggle('active', isEnabled);

    const osnapFilters = [
      'endpoint',
      'nearest',
      'node',
      'midpoint',
      'center',
      'intersection',
      'perpendicular',
      'tangent',
      'quadrant'
    ];
    osnapFilters.forEach(filter => {
      const chip = document.getElementById(`chip${filter.charAt(0).toUpperCase() + filter.slice(1)}`);
      if (!chip) return;
      chip.classList.toggle('disabled', !isEnabled);
      chip.classList.toggle('active', Boolean(this.service.snapFilters[filter]));
    });
  }

  toggleSnapFilter(filterKey) {
    if (filterKey !== 'grid' && !this.service.isSnapMasterEnabled) return;
    const isActive = this.service.toggleSnapFilter(filterKey);
    const chip = document.getElementById(`chip${filterKey.charAt(0).toUpperCase() + filterKey.slice(1)}`);
    if (chip) chip.classList.toggle('active', isActive);
  }

  toggleGrid() {
    if (!this.viewportManager?.toggleGrid) return;
    this.viewportManager.toggleGrid();
    const btnGrid = document.getElementById('btnGrid');
    if (btnGrid) btnGrid.classList.toggle('active', this.isGridVisible);
  }

  toggleOrtho() {
    const isEnabled = this.service.toggleOrtho();
    const btnOrtho = document.getElementById('btnOrtho');
    if (btnOrtho) btnOrtho.classList.toggle('active', isEnabled);
    this.refreshActivePreview();
  }

  refreshActivePreview(shiftOverride = null) {
    if (typeof shiftOverride === 'boolean') {
      this.isShiftPressed = shiftOverride;
    }

    const activeTool = this.toolManager?.activeTool;
    if (!activeTool || !this.lastMousePoint) return;

    const mockEvent = {
      point: this.lastMousePoint.clone(),
      event: { shiftKey: Boolean(this.isShiftPressed), button: 0 }
    };

    if (this.isPointerDown && typeof activeTool.onMouseDrag === 'function') {
      activeTool.onMouseDrag(mockEvent);
    } else if (typeof activeTool.onMouseMove === 'function') {
      activeTool.onMouseMove(mockEvent);
    }

    if (window.paper?.view) {
      paper.view.update();
    }
  }

  closeAllMenus() {
    // Ajusta las clases CSS al nombre exacto que use tu barra de herramientas HTML
    document.querySelectorAll('.dropdown-menu, .toolbar-dropdown, .submenu, .menu-open').forEach(el => {
      el.classList.remove('show', 'open', 'active');
    });
  }
  
  clearCanvas() {
    this.service.clearCanvas(() => this.selectionRenderEngine.renderBezierHandles());
    if (this.activePath) { this.activePath.remove(); this.activePath = null; }
    if (this.hud) this.hud.clear();
  }

  importImageToCanvas(imageSrc, dropPosition = null) {
    return this.ioService.importImageToCanvas(imageSrc, dropPosition);
  }

  importSVGToCanvas(svgString, dropPosition) {
    return this.ioService.importSVGToCanvas(svgString, dropPosition);
  }

  setupDragAndDrop(canvasElement) {
    return this.ioService.setupDragAndDrop(canvasElement || this.canvasElement);
  }

  applyOrthoConstraint(fromPt, toPt, isShiftPressed = false) {
    const effectiveOrtho = Boolean(this.service?.isOrthoEnabled) !== Boolean(isShiftPressed);
    if (!effectiveOrtho || !fromPt || !toPt) return toPt;

    const dx = Math.abs(toPt.x - fromPt.x);
    const dy = Math.abs(toPt.y - fromPt.y);

    if (dx > dy) {
      return new paper.Point(toPt.x, fromPt.y);
    } else {
      return new paper.Point(fromPt.x, toPt.y);
    }
  }

  resolveConstrainedPoint(rawPoint, {
    fromPoint = null,
    isShift = false,
    excludeEntity = null,
    ignoreEntities = null,
    selectedPointsCoords = null,
    disableFromPoint = false,
    osnapMode = null
  } = {}) {
    const effectiveOrtho = Boolean(this.service?.isOrthoEnabled) !== Boolean(isShift);
    const hasOrigin = Boolean(fromPoint);

    const osnapOptions = {};
    if (fromPoint) osnapOptions.fromPoint = fromPoint;
    if (ignoreEntities) osnapOptions.ignoreEntities = ignoreEntities;
    if (selectedPointsCoords) osnapOptions.selectedPointsCoords = selectedPointsCoords;
    if (disableFromPoint) osnapOptions.disableFromPoint = true;
    if (osnapMode) osnapOptions.osnapMode = osnapMode;

    const osnap = this.service.calculateOsnap(
      rawPoint,
      (snapPt, type) => {
        if (type === 'grid' && effectiveOrtho && hasOrigin) {
          const isHorizontal = Math.abs(rawPoint.x - fromPoint.x) > Math.abs(rawPoint.y - fromPoint.y);
          const orthoGridPt = isHorizontal
            ? new paper.Point(snapPt.x, fromPoint.y)
            : new paper.Point(fromPoint.x, snapPt.y);
          this.hud.renderSnapMarker(orthoGridPt, type);
        } else {
          this.hud.renderSnapMarker(snapPt, type);
        }
      },
      excludeEntity,
      Object.keys(osnapOptions).length > 0 ? osnapOptions : null
    );

    // 1. Máxima prioridad: OSNAP de entidad (Fin, Medio, Centro, Int, Perp, Tan, Cuad, Punto, Cerca)
    if (osnap && osnap.type && osnap.type !== 'grid') {
      return osnap.point;
    }

    // 2. Segunda prioridad: Ortogonal (F8 o Shift), proyectando el snap a grilla sobre el eje activo
    if (effectiveOrtho && hasOrigin) {
      const isHorizontal = Math.abs(rawPoint.x - fromPoint.x) > Math.abs(rawPoint.y - fromPoint.y);
      if (osnap && osnap.type === 'grid') {
        return isHorizontal
          ? new paper.Point(osnap.point.x, fromPoint.y)
          : new paper.Point(fromPoint.x, osnap.point.y);
      }
      return this.applyOrthoConstraint(fromPoint, rawPoint, isShift);
    }

    // 3. Tercera prioridad: Snap a grilla libre o punto del cursor
    if (osnap && osnap.type === 'grid') {
      return osnap.point;
    }

    return rawPoint;
  }

  renderPivotMarker(point) {
    if (!point) return;

    const zoom = paper.view.zoom;
    const cfg = CAD_THEME.handles;
    const side = (cfg.anchorSizeSelectedPx || 8.5) / zoom;

    const marker = new paper.Path.Rectangle({
      point: [point.x - side / 2, point.y - side / 2],
      size: [side, side],
      fillColor: cfg.anchorFillSelected || '#10141D',
      strokeColor: cfg.anchorStrokeSelected || '#ffff00',
      strokeWidth: (cfg.anchorStrokeWidthSelectedPx || 2.0) / zoom
    });

    const targetGroup = this.hudGroup || this.controlHandlesGroup;
    if (targetGroup) {
      targetGroup.addChild(marker);
    }
  }

  /**
   * Genera el siguiente nombre disponible para una entidad analizando las existentes en el lienzo.
   */
  generateNextEntityName(basePrefix = 'Línea') {
    const entities = this.service?.entities || [];
    let maxNum = 0;
    const regex = new RegExp(`^${basePrefix}\\s+(\\d+)$`, 'i');

    entities.forEach((ent) => {
      const name = ent.name || ent.data?.name || '';
      const match = name.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });

    return `${basePrefix} ${maxNum + 1}`;
  }

  cleanup() {
    if (this.cadUI && typeof this.cadUI.cleanup === 'function') {
      this.cadUI.cleanup();
    }

    if (this.consoleManager && typeof this.consoleManager.cleanup === 'function') {
      this.consoleManager.cleanup();
    }

    if (this.layerPanelUI && typeof this.layerPanelUI.cleanup === 'function') {
      this.layerPanelUI.cleanup();
    }

    if (this.propertyPanelUI && typeof this.propertyPanelUI.cleanup === 'function') {
      this.propertyPanelUI.cleanup();
    }

    if (this.toolManager?.activeTool && typeof this.toolManager.activeTool.cleanup === 'function') {
      this.toolManager.activeTool.cleanup();
    }

    if (this.inputDispatcher && typeof this.inputDispatcher.cleanup === 'function') {
      this.inputDispatcher.cleanup();
    }

    if (this.viewportManager && typeof this.viewportManager.cleanup === 'function') {
      this.viewportManager.cleanup();
    }

    if (this.hud && typeof this.hud.cleanup === 'function') {
      this.hud.cleanup();
    }

    if (this.ioService && typeof this.ioService.cleanup === 'function') {
      this.ioService.cleanup();
    }

    this.activePath = null;
  }
}
