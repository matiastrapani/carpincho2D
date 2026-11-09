/**
 * services/CanvasViewportManager.js - Gestor de Vista, Zoom, Pan y Grilla
 */

import { CAD_THEME } from '../config/cadTheme.js';

export class CanvasViewportManager {
  constructor(utils) {
    this.utils = utils;
    this.cadUtils = utils;
    this.isGridVisible = true;
    this.gridGroup = null;
    this.zoomAnimationRequestId = null;

    // Estado para la función Toggle de Zoom Extents
    this.previousViewState = null;
  }

  // --- INICIALIZACIÓN DE PAPER.JS Y EVENTOS DEL CANVAS ---
  initPaper() {
    const canvas = document.getElementById('cadCanvas');

    // Inyecta el color de fondo definido en el tema
    if (canvas && CAD_THEME.canvas?.backgroundColor) {
      canvas.style.backgroundColor = CAD_THEME.canvas.backgroundColor;
    }

    paper.setup(canvas);
    paper.view.center = new paper.Point(0, 0);
    paper.view.zoom = 1;

    if (paper.project) paper.project.clear(); // Limpia capas y objetos anteriores

    // 1. Capa para entidades del dibujo
    this.drawLayer = paper.project.activeLayer;
    this.drawLayer.name = 'drawLayer';

    this.nodesLayer = new paper.Layer();
    this.nodesLayer.name = 'nodesLayer';

    // 2. Capa superior para HUD
    this.hudLayer = new paper.Layer();
    this.hudLayer.name = 'hudLayer';

    this.drawLayer.sendToBack();
    this.nodesLayer.insertAbove(this.drawLayer);
    this.hudLayer.bringToFront();

    this.drawLayer.activate();

    //this.drawGrid();
    this.setupPaperTool();
    if (window.cadIO?.setupDragAndDrop) window.cadIO.setupDragAndDrop();

    const viewportEl = document.getElementById('mainViewport');
    if (viewportEl) {
      const resizeObserver = new ResizeObserver(() => this.handleCanvasResize());
      resizeObserver.observe(viewportEl);
    }
    
    window.requestAnimationFrame(() => this.handleCanvasResize());

    canvas.addEventListener('wheel', (e) => this.handleMagicMouseWheel(e), { passive: false });

    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();

      const previousTool = this.utils.currentToolMode;

      if (this.utils.toolManager.activeTool && typeof this.utils.toolManager.activeTool.onContextMenu === 'function') {
        const handled = this.utils.toolManager.activeTool.onContextMenu(e);
        if (handled) return;
      }

      if (this.utils.currentToolMode === 'trim') {
        const activeTool = this.utils.toolManager.activeTool;
        if (activeTool && typeof activeTool.confirmTrimBoundaries === 'function') {
          activeTool.confirmTrimBoundaries();
          return;
        }
      }

      const drawingTools = ['polyline', 'spline', 'bezier', 'line'];
      if (drawingTools.includes(this.utils.currentToolMode) && this.utils.activePath) {
        this.utils.finishCurrentDrawing();
        return;
      }

      if (previousTool === 'select' && this.utils.lastActiveToolMode && this.utils.lastActiveToolMode !== 'select') {
        this.utils.setTool(this.utils.lastActiveToolMode);
      } else {
        this.utils.setTool('select');
      }
    });

    const cmdInput = document.getElementById('cmdInput');
    if (cmdInput) {
      cmdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.utils.executeCommandLine();
      });
    }

    this.utils.hud.clear();

    if (canvas) {
      canvas.focus();
    }
    this.utils.selectionRenderEngine.updateEntitiesStroke();
    paper.view.update();
  }

  setupPaperTool() {
    const tool = new paper.Tool();

    tool.onMouseDown = (event) => {
      if (event.event.button === 1 || this.utils.currentToolMode === 'pan') {
        this.isPanning = true;
        this.panStartPoint = event.event;
        return;
      }

      if (this.utils.toolManager.activeTool) {
        this.utils.toolManager.onMouseDown(event);
      }
    };

    tool.onMouseDrag = (event) => {
      if (this.isPanning) {
        this.previousViewState = null;
        const delta = paper.view.center.subtract(
          paper.view.getEventPoint(event.event).subtract(paper.view.getEventPoint(this.panStartPoint))
        );
        paper.view.center = delta;
        this.panStartPoint = event.event;
        this.drawGrid();
        return;
      }

      if (this.utils.toolManager.activeTool) {
        this.utils.toolManager.onMouseDrag(event);
      }
    };

    tool.onMouseUp = (event) => {
      if (event.event.button === 1 || event.event.button === 2 || this.utils.currentToolMode === 'pan') {
        this.isPanning = false;
      }

      if (this.utils.toolManager.activeTool) {
        this.utils.toolManager.onMouseUp(event);
      }
    };

    tool.onMouseMove = (event) => {
      this.lastMousePoint = event.point.clone();
      this.utils.hud.updateHUD(event.point);

      if (this.utils.toolManager.activeTool) {
        this.utils.toolManager.onMouseMove(event);
      }
    };
  }

  drawGrid() {
    if (this.gridGroup) this.gridGroup.remove();
    if (!this.isGridVisible) return;

    this.gridGroup = new paper.Group();
    this.gridGroup.sendToBack();

    const bounds = paper.view.bounds;
    const zoom = paper.view.zoom;

    const { axisXColor, axisYColor, axisWidthPx } = CAD_THEME.canvas;
    const { majorColor, minorColor, majorWidthPx, minorWidthPx } = CAD_THEME.grid;

    let mainStep = zoom > 3 ? 20 : (zoom < 0.3 ? 500 : 100);
    let subStep = zoom > 3 ? 4 : (zoom < 0.3 ? 100 : 20);

    // Margen extra de 2 celdas alrededor de todo el viewport
    const pad = subStep * 2;
    const minX = bounds.left - pad;
    const maxX = bounds.right + pad;
    const minY = bounds.top - pad;
    const maxY = bounds.bottom + pad;

    const startX = Math.floor(minX / subStep) * subStep;
    const endX = Math.ceil(maxX / subStep) * subStep;
    const startY = Math.floor(minY / subStep) * subStep;
    const endY = Math.ceil(maxY / subStep) * subStep;

    // Líneas Verticales (Eje X) — se dibujan desde minY hasta maxY extendidos
    for (let x = startX; x <= endX; x += subStep) {
      const roundedX = Math.round(x);
      const isMain = Math.abs(roundedX) % mainStep === 0;

      const line = new paper.Path.Line(new paper.Point(x, minY), new paper.Point(x, maxY));
      line.strokeColor = isMain ? majorColor : minorColor;
      line.strokeWidth = (isMain ? majorWidthPx : minorWidthPx) / zoom;
      this.gridGroup.addChild(line);
    }

    // Líneas Horizontales (Eje Y) — se dibujan desde minX hasta maxX extendidos
    for (let y = startY; y <= endY; y += subStep) {
      const roundedY = Math.round(y);
      const isMain = Math.abs(roundedY) % mainStep === 0;

      const line = new paper.Path.Line(new paper.Point(minX, y), new paper.Point(maxX, y));
      line.strokeColor = isMain ? majorColor : minorColor;
      line.strokeWidth = (isMain ? majorWidthPx : minorWidthPx) / zoom;
      this.gridGroup.addChild(line);
    }

    // Ejes Principales X e Y (Origen 0,0) extendidos
    const axisX = new paper.Path.Line(new paper.Point(minX, 0), new paper.Point(maxX, 0));
    axisX.strokeColor = axisXColor;
    axisX.strokeWidth = axisWidthPx / zoom;
    this.gridGroup.addChild(axisX);

    const axisY = new paper.Path.Line(new paper.Point(0, minY), new paper.Point(0, maxY));
    axisY.strokeColor = axisYColor;
    axisY.strokeWidth = axisWidthPx / zoom;
    this.gridGroup.addChild(axisY);
  }

  handleCanvasResize() {
    if (!paper || !paper.view) return;

    const canvas = document.getElementById('cadCanvas');
    const viewportEl = document.getElementById('mainViewport');
    const container = viewportEl || (canvas ? canvas.parentElement : null);
    if (!container) return;

    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;
    if (newWidth === 0 || newHeight === 0) return;

    // Ajustar el estilo CSS para forzar ocupación total del contenedor
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    // Actualizar la dimensión de la vista lógica en Paper.js sin tocar canvas.width/height
    paper.view.viewSize = new paper.Size(newWidth, newHeight);

    // Redibujar la grilla sobre la vista expandida
    this.drawGrid();

    if (typeof this.utils.selectionRenderEngine?.updatePointEntitiesScale === 'function') {
      this.utils.selectionRenderEngine.updatePointEntitiesScale();
    }
    if (typeof this.utils.selectionRenderEngine?.renderBezierHandles === 'function') {
      this.utils.selectionRenderEngine.renderBezierHandles();
    }

    paper.view.update();
  }

  handleMagicMouseWheel(e) {
    this.previousViewState = null;
    e.preventDefault();

    const view = paper.view;
    const mousePosition = view.viewToProject(new paper.Point(e.clientX, e.clientY));
    if (typeof this.utils.hud?.updateHUD === 'function') {
      this.utils.hud.updateHUD(mousePosition);
    }

    const isZoomIntent = e.altKey || e.ctrlKey || e.metaKey || e.pinching;

    if (isZoomIntent) {
      const delta = e.deltaY;
      const zoomFactor = Math.pow(0.997, delta);
      const oldZoom = view.zoom;
      const newZoom = Math.max(0.05, Math.min(oldZoom * zoomFactor, 80));

      view.zoom = newZoom;

      const newMousePosition = view.viewToProject(new paper.Point(e.clientX, e.clientY));
      view.center = view.center.add(mousePosition.subtract(newMousePosition));
    } else {
      const panSensitivity = 1 / view.zoom;
      const deltaX = e.deltaX * panSensitivity;
      const deltaY = e.deltaY * panSensitivity;

      view.center = view.center.add(new paper.Point(deltaX, deltaY));
    }

    this.drawGrid();
    if (typeof this.utils.selectionRenderEngine.updatePointEntitiesScale === 'function') {
      this.utils.selectionRenderEngine.updatePointEntitiesScale();
    }
    if (typeof this.utils.selectionRenderEngine.updateEntitiesStroke === 'function') {
      this.utils.selectionRenderEngine.updateEntitiesStroke();
    }
    if (typeof this.utils.selectionRenderEngine.renderBezierHandles === 'function') {
      this.utils.selectionRenderEngine.renderBezierHandles();
    }
    if (this.utils.hud && typeof this.utils.hud.refreshSnapMarkerScale === 'function') {
      this.utils.hud.refreshSnapMarkerScale();
    }
    if (this.utils.activePath && this.utils.rubberBandLine) {
      const activeWidth = this.utils.propertyManager 
        ? this.utils.propertyManager.getResolvedStrokeWidth(this.utils.activePath) 
        : 0;
      const dashPattern = CAD_THEME.rubberBand.dashArrayPx || [2, 2];
      
      this.utils.rubberBandLine.strokeWidth = activeWidth === 0 ? (1 / view.zoom) : activeWidth;
      this.utils.rubberBandLine.dashArray = dashPattern.map(val => val / view.zoom);
    }
    if (typeof this.utils.hud?.updateHUD === 'function') {
      this.utils.hud.updateHUD(view.viewToProject(new paper.Point(e.clientX, e.clientY)));
    }
  }

  toggleGrid() {
    this.isGridVisible = !this.isGridVisible;
    const btnGrid = document.getElementById('btnGrid');
    if (btnGrid) btnGrid.classList.toggle('active', this.isGridVisible);
    this.drawGrid();
  }

  resetView(animated = true) {
    if (this.zoomAnimationRequestId) {
      cancelAnimationFrame(this.zoomAnimationRequestId);
      this.zoomAnimationRequestId = null;
    }

    const isValidEntity = (ent) => {
      if (!ent || !ent.bounds) return false;
      const b = ent.strokeBounds || ent.bounds;
      return Math.abs(b.width) > 0 || Math.abs(b.height) > 0 || (ent.segments && ent.segments.length > 0);
    };

    const validEntities = (this.utils.service?.demoEntities || []).filter(isValidEntity);
    const selectedEntities = (this.utils.service?.selectedEntities || []).filter(isValidEntity);
    const currentTargets = selectedEntities.length > 0 ? selectedEntities : validEntities;

    const targetsKey = currentTargets.map(e => e.id || e._id || e.guid || e.handle).join(',');

    // TOGGLE DE REGRESO
    if (this.previousViewState && this.previousViewState.targetsKey === targetsKey) {
      const restoreCenter = { x: Number(this.previousViewState.center.x), y: Number(this.previousViewState.center.y) };
      const restoreZoom = Number(this.previousViewState.zoom);

      this.previousViewState = null;

      if (!animated) {
      const viewSize = paper.view.viewSize;
      const viewCenterPx = new paper.Point(viewSize.width / 2, viewSize.height / 2);

      const finalMatrix = new paper.Matrix()
        .translate(viewCenterPx)
        .scale(restoreZoom)
        .translate(new paper.Point(-restoreCenter.x, -restoreCenter.y));

      paper.view.matrix = finalMatrix;
      this.drawGrid();
      return;
    }

      this.animateViewportTo(restoreCenter, restoreZoom);
      return;
    }

    // RESPALDO DE VISTA PREVIA
    const currentViewBackup = {
      center: { x: Number(paper.view.center.x), y: Number(paper.view.center.y) },
      zoom: Number(paper.view.zoom),
      targetsKey: targetsKey
    };

    if (currentTargets.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      currentTargets.forEach(ent => {
        if (ent.segments) {
          ent.segments.forEach(seg => {
            minX = Math.min(minX, seg.point.x);
            maxX = Math.max(maxX, seg.point.x);
            minY = Math.min(minY, seg.point.y);
            maxY = Math.max(maxY, seg.point.y);
          });
        } else {
          const b = ent.strokeBounds || ent.bounds;
          minX = Math.min(minX, b.left, b.right);
          maxX = Math.max(maxX, b.left, b.right);
          minY = Math.min(minY, b.top, b.bottom);
          maxY = Math.max(maxY, b.top, b.bottom);
        }
      });

      if (minX !== Infinity && minY !== Infinity) {
        const width = Math.max(Math.abs(maxX - minX), 1);
        const height = Math.max(Math.abs(maxY - minY), 1);

        // 1. Obtener dimensiones visuales en pantalla
        const viewSize = paper.view.viewSize;
        const padding = 80;
        const availWidth = Math.max(viewSize.width - padding * 2, 100);
        const availHeight = Math.max(viewSize.height - padding * 2, 100);

        // 2. Calcular zoom exacto sin alteración de matriz
        const zoomX = availWidth / width;
        const zoomY = availHeight / height;
        const targetZoom = Math.max(0.05, Math.min(Math.min(zoomX, zoomY), 50));

        // 3. Centro en coordenadas absolutas numéricas
        const targetCenter = {
          x: minX + width / 2,
          y: minY + height / 2
        };

        this.previousViewState = currentViewBackup;

        if (!animated) {
          const viewCenterPx = new paper.Point(viewSize.width / 2, viewSize.height / 2);
          const finalMatrix = new paper.Matrix()
            .translate(viewCenterPx)
            .scale(targetZoom)
            .translate(new paper.Point(-targetCenter.x, -targetCenter.y));

          paper.view.matrix = finalMatrix;
          this.drawGrid();
          return;
        }

        this.animateViewportTo(targetCenter, targetZoom);
      }
    }
  }

  /**
   * Helper privado para la animación fluida de sincronización
   */
  animateViewportTo(targetCenter, targetZoom) {
    if (this.zoomAnimationRequestId) {
      cancelAnimationFrame(this.zoomAnimationRequestId);
      this.zoomAnimationRequestId = null;
    }

    const startMatrix = paper.view.matrix.clone();
    const viewSize = paper.view.viewSize;
    const viewCenterPx = new paper.Point(viewSize.width / 2, viewSize.height / 2);

    const targetMatrix = new paper.Matrix()
      .translate(viewCenterPx)
      .scale(targetZoom)
      .translate(new paper.Point(-targetCenter.x, -targetCenter.y));

    const startTime = performance.now();
    const duration = 300;

    const animateStep = (time) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const currentA = startMatrix.a + (targetMatrix.a - startMatrix.a) * easeOut;
      const currentB = startMatrix.b + (targetMatrix.b - startMatrix.b) * easeOut;
      const currentC = startMatrix.c + (targetMatrix.c - startMatrix.c) * easeOut;
      const currentD = startMatrix.d + (targetMatrix.d - startMatrix.d) * easeOut;
      const currentTx = startMatrix.tx + (targetMatrix.tx - startMatrix.tx) * easeOut;
      const currentTy = startMatrix.ty + (targetMatrix.ty - startMatrix.ty) * easeOut;

      // 1. Aplicación atómica de matriz
      paper.view.matrix.set(currentA, currentB, currentC, currentD, currentTx, currentTy);

      // 2. Ajuste progresivo de trazos en entidades del usuario
      if (typeof this.utils.selectionRenderEngine?.updateEntitiesStroke === 'function') {
        this.utils.selectionRenderEngine.updateEntitiesStroke();
      }

      // 3. Ajuste de trazo de la grilla sin reconstruirla
      if (this.gridGroup && this.gridGroup.children) {
        const currentZoom = paper.view.zoom;
        const gridStrokeWidth = 1 / currentZoom;
        this.gridGroup.children.forEach(child => {
          child.strokeWidth = gridStrokeWidth;
        });
      }

      // 4. Actualizaciones visuales y HUD
      if (typeof this.utils.selectionRenderEngine?.updatePointEntitiesScale === 'function') {
        this.utils.selectionRenderEngine.updatePointEntitiesScale();
      }
      if (typeof this.utils.selectionRenderEngine?.renderBezierHandles === 'function') {
        this.utils.selectionRenderEngine.renderBezierHandles();
      }
      if (typeof this.utils.hud?.updateHUD === 'function') {
        this.utils.hud.updateHUD(this.lastMousePoint || paper.view.center);
      }

      if (progress < 1) {
        this.zoomAnimationRequestId = requestAnimationFrame(animateStep);
      } else {
        this.zoomAnimationRequestId = null;
        // 5. Reconstrucción de grilla y sincronización final estricta
        this.drawGrid();
        if (typeof this.utils.selectionRenderEngine?.updateEntitiesStroke === 'function') {
          this.utils.selectionRenderEngine.updateEntitiesStroke();
        }
        if (typeof this.utils.hud?.refreshSnapMarkerScale === 'function') {
          this.utils.hud.refreshSnapMarkerScale();
        }
      }
    };

    this.zoomAnimationRequestId = requestAnimationFrame(animateStep);
  }

  /**
   * Restablece el zoom al 100% (scale 1.0) y centra la vista en el origen (0,0)
   * utilizando la misma animación fluida que resetView.
   */
  zoomReset(animated = true) {
    this.previousViewState = null;
    if (this.zoomAnimationRequestId) {
      cancelAnimationFrame(this.zoomAnimationRequestId);
      this.zoomAnimationRequestId = null;
    }

    const targetCenter = new paper.Point(0, 0);
    const targetZoom = 1.0;

    if (!animated) {
      paper.view.center = targetCenter;
      paper.view.zoom = targetZoom;
      this.drawGrid();
      if (typeof this.utils.selectionRenderEngine?.updatePointEntitiesScale === 'function') {
        this.utils.selectionRenderEngine.updatePointEntitiesScale();
      }
      if (typeof this.utils.selectionRenderEngine?.updateEntitiesStroke === 'function') {
        this.utils.selectionRenderEngine.updateEntitiesStroke();
      }
      if (typeof this.utils.selectionRenderEngine?.renderBezierHandles === 'function') {
        this.utils.selectionRenderEngine.renderBezierHandles();
      }
      if (typeof this.utils.hud?.updateHUD === 'function') {
        this.utils.hud.updateHUD(paper.view.center);
      }
      return;
    }

    const startCenter = paper.view.center.clone();
    const startZoom = paper.view.zoom;
    const startTime = performance.now();
    const duration = 400;

    const animateZoom = (time) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const currentCenterX = startCenter.x + (targetCenter.x - startCenter.x) * easeOut;
      const currentCenterY = startCenter.y + (targetCenter.y - startCenter.y) * easeOut;
      paper.view.center = new paper.Point(currentCenterX, currentCenterY);

      paper.view.zoom = startZoom + (targetZoom - startZoom) * easeOut;

      // Actualizar grilla, puntos y trazos en tiempo real durante la animación
      this.drawGrid();
      if (typeof this.utils.selectionRenderEngine?.updatePointEntitiesScale === 'function') {
        this.utils.selectionRenderEngine.updatePointEntitiesScale();
      }
      if (typeof this.utils.selectionRenderEngine?.updateEntitiesStroke === 'function') {
        this.utils.selectionRenderEngine.updateEntitiesStroke();
      }
      if (typeof this.utils.selectionRenderEngine?.renderBezierHandles === 'function') {
        this.utils.selectionRenderEngine.renderBezierHandles();
      }
      if (typeof this.utils.hud?.updateHUD === 'function') {
        this.utils.hud.updateHUD(paper.view.center);
      }

      if (progress < 1) {
        this.zoomAnimationRequestId = requestAnimationFrame(animateZoom);
      } else {
        this.zoomAnimationRequestId = null;
      }
    };

    this.zoomAnimationRequestId = requestAnimationFrame(animateZoom);
  }


}