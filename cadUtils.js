/**
 * cadUtils.js - Orquestador central de la aplicación CAD.
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

import { DeleteCommand, AddLineCommand, AddEntityCommand, ImportSVGCommand } from './services/commands/cadCommands.js';
import { HUDManager } from './ui/HUDManager.js';
import { CommandBarManager } from './ui/CommandBarManager.js';
import { CanvasViewportManager } from './services/CanvasViewportManager.js';
import { SelectionRenderEngine } from './services/renderers/SelectionRenderEngine.js';
import { InputDispatcher } from './services/input/InputDispatcher.js';
import { CADIOService } from './services/io/ioService.js';


import { CAD_THEME } from './config/cadTheme.js';


export class CADUtils {
  constructor(canvasId, service) {
    // 1. Referencias al DOM y Servicio Core
    this.canvasElement = document.getElementById(canvasId);
    this.service = service;

    // 2. Módulo de Capas y Propiedades (BYLAYER)

    this.layerManager = new LayerManager(this.service, this);
    this.service.layerManager = this.layerManager;

    this.propertyManager = new PropertyManager(this.service, this);
    this.service.propertyManager = this.propertyManager;

    this.selectionRenderEngine = new SelectionRenderEngine(window.cadService);
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
    

    // 5. Estado de Dibujo Activo y Previsualización Temporal
    this.activePath = null;
    this.rubberBandLine = null;
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
    this.commandBar = new CommandBarManager(this);
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
    this.toolManager.registerTool('trim', new TrimTool(this.service, this));
    this.toolManager.registerTool('extend', new ExtendTool(this.service, this));
  }

  // --- MÉTODOS PUENTE / DELEGADOS HACIA MÓDULOS ---
  setPrompt(text) {
    this.commandBar.setPrompt(text);
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

  finishCurrentDrawing() {
    if (this.rubberBandLine) {
      this.rubberBandLine.remove();
      this.rubberBandLine = null;
    }
    if (this.bezierHandlePreviewGroup) {
      this.bezierHandlePreviewGroup.remove();
      this.bezierHandlePreviewGroup = null;
    }

    if (this.hud) {
      this.hud.clear();
    }

    if (this.activePath) {
      // 1. Eliminar el último segmento elástico "dinámico" si no se confirmó
      // (Opcional según si usas rubberband en la propia activePath)

      // 2. Registrar usando el guardián de CADService
      const isRegistered = this.service.registerEntity(this.activePath);

      if (isRegistered) {
        // Generar comando para Undo/Redo si aplica
        const cmd = new AddLineCommand(this.service, this.activePath);
        this.service.executeCommand(cmd);
        this.selectionRenderEngine.renderBezierHandles();
      }
      
      this.activePath = null;
    }

    this.setPrompt('Command:');
    // Cambiar automáticamente a 'select' al finalizar el trazo si no estamos en polilínea/spline
    if (!this.isChangingTool && this.currentToolMode !== 'select' && this.currentToolMode !== 'pan') {
      setTimeout(() => this.setTool('select'), 0);
    }
  }

  executeCommandLine() {
    const inputEl = document.getElementById('cmdInput');
    const val = inputEl?.value.trim();
    if (inputEl) inputEl.value = '';

    if (!val) return;
    const upperVal = val.toUpperCase();

    if (upperVal === 'POINT' || upperVal === 'PT') { this.setTool('point'); return; }
    if (upperVal === 'DIVIDE' || upperVal === 'DIV') { this.setTool('divide_count'); return; }
    if (upperVal === 'MEASURE' || upperVal === 'DIST_DIV') { this.setTool('divide_dist'); return; }
    if (upperVal === 'LINE' || upperVal === 'L') { this.setTool('line'); return; }
    if (upperVal === 'POLYLINE' || upperVal === 'PL' || upperVal === 'P') { this.setTool('polyline'); return; }
    if (upperVal === 'SPLINE' || upperVal === 'S') { this.setTool('spline'); return; }
    if (upperVal === 'BEZIER' || upperVal === 'B') { this.setTool('bezier'); return; }
    if (upperVal === 'TRIM' || upperVal === 'TR' || upperVal === 'T') { this.setTool('trim'); return; }
    if (upperVal === 'PAN') { this.setTool('pan'); return; }
    if (upperVal === 'CLEAR') { this.clearCanvas(); return; }
    if (upperVal === 'EXTEND' || upperVal === 'EX') { this.setTool('extend'); return; }
    if (upperVal === 'CIRCLE' || upperVal === 'C') { this.setTool('circle'); return; }

    if (this.activePath && ['line', 'polyline', 'spline', 'bezier'].includes(this.currentToolMode)) {
      const originPt = this.activePath.firstSegment.point;

      if (val.includes(',')) {
        const parts = val.split(',');
        const x = parseFloat(parts[0]);
        const y = -parseFloat(parts[1]);
        
        if (!isNaN(x) && !isNaN(y)) {
          const newPt = new paper.Point(x, y);

          if (this.currentToolMode === 'line') {
            this.activePath.lastSegment.point = newPt;
            
            const cmd = new AddLineCommand(this.service, this.activePath);
            this.service.executeCommand(cmd);

            const startNextPt = newPt.clone();
            this.activePath = new paper.Path.Line({
              from: startNextPt,
              to: startNextPt
            });

            if (!this.activePath.data) this.activePath.data = {};
            this.activePath.data.isDynamicStroke = true;

            if (this.propertyManager) {
              this.propertyManager.applyDefaultSettings(this.activePath);
            }

            this.selectionRenderEngine.updateEntitiesStroke();
          } else {
            this.activePath.add(newPt);
          }
        }
      } else {
        const dist = parseFloat(val);
        if (!isNaN(dist) && this.rubberBandLine) {
          const currentVector = this.rubberBandLine.lastSegment.point.subtract(originPt);
          if (currentVector.length > 0) {
            const constrainedVector = currentVector.normalize(dist);
            const newPt = originPt.add(constrainedVector);

            if (this.currentToolMode === 'line') {
              this.activePath.lastSegment.point = newPt;

              const cmd = new AddLineCommand(this.service, this.activePath);
              this.service.executeCommand(cmd);

              const startNextPt = newPt.clone();
              this.activePath = new paper.Path.Line({
                from: startNextPt,
                to: startNextPt
              });

              if (!this.activePath.data) this.activePath.data = {};
              this.activePath.data.isDynamicStroke = true;

              if (this.propertyManager) {
                this.propertyManager.applyDefaultSettings(this.activePath);
              }

              this.selectionRenderEngine.updateEntitiesStroke();
            } else {
              this.activePath.add(newPt);
            }
          }
        }
      }
    }
  }

  handleGlobalKeydown(e) {
    return this.inputDispatcher.handleGlobalKeydown(e);
  }

  handleGlobalKeyup(e) {
    return this.inputDispatcher.handleGlobalKeyup(e);
  }

  // Selección de herramienta con registro automático en consola
  setTool(toolName) {
    this.isChangingTool = true;
    this.currentToolMode = toolName;
    this.closeAllMenus();

    // 1. RESPALDO INMEDIATO: Guardar selección previa antes de que se limpie por cambio de herramienta
    const isDivisionTool = (toolName === 'divide_count' || toolName === 'divide_dist');
    const preservedEntities = isDivisionTool 
      ? this.service.selectedEntities.filter(ent => ent && !ent.data?.isPointEntity) 
      : [];

    // 2. Limpieza de estados de edición de nodos (sin deseleccionar si es división)
    if (toolName !== 'select' && toolName !== 'pan') {
      this.service.editingEntities = [];
      this.service.deselectAllSegments();
      if (!isDivisionTool) {
        this.service.deselectAllEntities();
      }
    }

    if (toolName !== 'select' && toolName !== 'pan') {
      this.lastActiveToolMode = toolName;
    }

    // 3. Registro en la Consola / Historial
    if (this.commandBar && typeof this.commandBar.logUserCommand === 'function') {
      this.commandBar.logUserCommand(toolName.toUpperCase());
    }

    // 4. Cambiar herramienta en ToolManager (esto ejecuta cancel() de la tool previa)
    this.toolManager.setTool(toolName);

    // 5. RESTAURACIÓN Y TRANSICIÓN DIRECTA: Restaurar selección y saltar al paso de ingreso
    if (isDivisionTool && preservedEntities.length > 0) {
      this.service.selectedEntities = [...preservedEntities];
      this.divisionSelectedEntities = [...preservedEntities];

      const activeTool = this.toolManager.activeTool;
      if (activeTool && typeof activeTool.askForDivisionValue === 'function') {
        activeTool.askForDivisionValue();
      }
    }

    this.isChangingTool = false;
    
    // 6. Actualización de clases visuales en Botones de UI
    const allButtons = document.querySelectorAll('.cad-button');
    allButtons.forEach(btn => btn.classList.remove('active'));
    
    const btnSnap = document.getElementById('btnSnap');
    if (btnSnap && this.service.isSnapMasterEnabled) {
      btnSnap.classList.add('active');
    }

    const btnGrid = document.getElementById('btnGrid');
    if (btnGrid && this.isGridVisible) {
      btnGrid.classList.add('active');
    }

    const toolBtnMap = {
      'select': 'btnSelect',
      'pan': 'btnPan',
      'point': 'btnPointGroup',
      'divide_count': 'btnPointGroup',
      'divide_dist': 'btnPointGroup',
      'line': 'btnLineGroup',
      'polyline': 'btnLineGroup',
      'spline': 'btnCurveGroup',
      'bezier': 'btnCurveGroup',
      'circle': 'btn-circle-tool',
      'trim': 'btnTrim',
      'extend': 'btnExtend'
    };

    const activeBtnId = toolBtnMap[toolName];
    if (activeBtnId) {
      const activeBtn = document.getElementById(activeBtnId);
      if (activeBtn) activeBtn.classList.add('active');
    }

    const canvas = document.getElementById('cadCanvas');
    if (canvas) {
      canvas.className = `tool-${['select', 'pan', 'trim', 'extend'].includes(toolName) ? toolName : 'draw'}`;
    }

    if (['select', 'trim', 'divide_count', 'divide_dist'].includes(toolName)) {
      if (this.hud) this.hud.clear();
    }

    // 7. Actualización del icono y de la herramienta por defecto del botón Flyout
    const iconMap = {
      'point': { btn: 'btnPointGroup', icon: 'currentPointIcon', name: 'custom:dot' },
      'divide_count': { btn: 'btnPointGroup', icon: 'currentPointIcon', name: 'custom:divide' },
      'divide_dist': { btn: 'btnPointGroup', icon: 'currentPointIcon', name: 'custom:dividelength' },
      'line': { btn: 'btnLineGroup', icon: 'currentLineIcon', name: 'custom:line' },
      'polyline': { btn: 'btnLineGroup', icon: 'currentLineIcon', name: 'custom:polyline' },
      'spline': { btn: 'btnCurveGroup', icon: 'currentCurveIcon', name: 'custom:spline' },
      'bezier': { btn: 'btnCurveGroup', icon: 'currentCurveIcon', name: 'fa-solid:bezier-curve' },
      'trim': { btn: 'btnTrim', icon: 'currentModifyIcon', name: 'custom:trim' },
      'extend': { btn: 'btnExtend', icon: 'currentModifyIcon', name: 'custom:extend' }
    };

    const config = iconMap[toolName];
    if (config) {
      const btnEl = document.getElementById(config.btn);
      const iconEl = document.getElementById(config.icon);
      if (btnEl) btnEl.setAttribute('data-default-tool', toolName);
      if (iconEl) {
        iconEl.setAttribute('data-icon', config.name);
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

    const btn = document.getElementById('btnSnap');
    const icon = document.getElementById('btnSnapIcon');
    if (btn) btn.classList.toggle('active', isEnabled);
    if (icon) {
      icon.className = isEnabled 
        ? 'fa-solid fa-magnet text-[10px] text-zinc-100' 
        : 'fa-solid fa-magnet text-[10px] text-zinc-500';
    }

    const chipContainer = document.getElementById('chipEndpoint')?.parentElement;
    if (chipContainer) {
      chipContainer.classList.toggle('snap-chips-disabled', !isEnabled);
    }

    if (!isEnabled && this.hud) {
      this.hud.clear();
    }
  }

  toggleSnapFilter(filterKey) {
    const isActive = this.service.toggleSnapFilter(filterKey);
    const chipMap = {
      endpoint: 'chipEndpoint',
      midpoint: 'chipMidpoint',
      center: 'chipCenter',
      quadrant: 'chipQuadrant',
      node: 'chipNode',
      intersection: 'chipIntersection',
      grid: 'chipGrid'
    };
    const chip = document.getElementById(chipMap[filterKey]);
    if (chip) chip.classList.toggle('active', isActive);
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
    if (this.rubberBandLine) { this.rubberBandLine.remove(); this.rubberBandLine = null; }
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

  applyOrthoConstraint(fromPt, toPt, isShiftPressed) {
    if (!isShiftPressed || !fromPt || !toPt) return toPt;

    const dx = Math.abs(toPt.x - fromPt.x);
    const dy = Math.abs(toPt.y - fromPt.y);

    // Si el desplazamiento horizontal es mayor, mantiene Y fija; de lo contrario mantiene X fija.
    if (dx > dy) {
      return new paper.Point(toPt.x, fromPt.y);
    } else {
      return new paper.Point(fromPt.x, toPt.y);
    }
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
    const entities = this.service?.demoEntities || [];
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

    if (this.commandBarManager && typeof this.commandBarManager.cleanup === 'function') {
      this.commandBarManager.cleanup();
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
    this.rubberBandLine = null;
  }

}
