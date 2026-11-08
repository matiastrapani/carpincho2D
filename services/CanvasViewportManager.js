/**
 * services/CanvasViewportManager.js - Gestor de Vista, Zoom, Pan y Grilla
 */

export class CanvasViewportManager {
  constructor(utils) {
    this.utils = utils;
    this.isGridVisible = true;
    this.gridGroup = null;
    this.zoomAnimationRequestId = null;
  }

  drawGrid() {
    if (this.gridGroup) this.gridGroup.remove();
    if (!this.isGridVisible) return;

    this.gridGroup = new paper.Group();
    this.gridGroup.sendToBack();

    const bounds = paper.view.bounds;
    const zoom = paper.view.zoom;

    let mainStep = zoom > 3 ? 20 : (zoom < 0.3 ? 500 : 100);
    let subStep = zoom > 3 ? 4 : (zoom < 0.3 ? 100 : 20);

    const startX = Math.floor(bounds.left / subStep) * subStep;
    const endX = Math.ceil(bounds.right / subStep) * subStep;
    const startY = Math.floor(bounds.top / subStep) * subStep;
    const endY = Math.ceil(bounds.bottom / subStep) * subStep;

    // Líneas Verticales (Eje X)
    for (let x = startX; x <= endX; x += subStep) {
      const roundedX = Math.round(x);
      const isMain = Math.abs(roundedX) % mainStep === 0;

      const line = new paper.Path.Line(new paper.Point(x, bounds.top), new paper.Point(x, bounds.bottom));
      line.strokeColor = isMain ? new paper.Color(1, 1, 1, 0.08) : new paper.Color(1, 1, 1, 0.03);
      line.strokeWidth = (isMain ? 1.2 : 1.0) / zoom;
      this.gridGroup.addChild(line);
    }

    // Líneas Horizontales (Eje Y)
    for (let y = startY; y <= endY; y += subStep) {
      const roundedY = Math.round(y);
      const isMain = Math.abs(roundedY) % mainStep === 0;

      const line = new paper.Path.Line(new paper.Point(bounds.left, y), new paper.Point(bounds.right, y));
      line.strokeColor = isMain ? new paper.Color(1, 1, 1, 0.08) : new paper.Color(1, 1, 1, 0.03);
      line.strokeWidth = (isMain ? 1.2 : 1.0) / zoom;
      this.gridGroup.addChild(line);
    }

    // Ejes Principales X e Y (Origen 0,0)
    const axisX = new paper.Path.Line(new paper.Point(bounds.left, 0), new paper.Point(bounds.right, 0));
    axisX.strokeColor = new paper.Color(0.71, 0.85, 1, 0.2);
    axisX.strokeWidth = 1.5 / zoom;
    this.gridGroup.addChild(axisX);

    const axisY = new paper.Path.Line(new paper.Point(0, bounds.top), new paper.Point(0, bounds.bottom));
    axisY.strokeColor = new paper.Color(0.71, 0.85, 1, 0.2);
    axisY.strokeWidth = 1.5 / zoom;
    this.gridGroup.addChild(axisY);
  }

  handleCanvasResize() {
    if (!paper || !paper.view) return;

    const viewportEl = document.getElementById('mainViewport');
    if (!viewportEl) return;

    const newWidth = viewportEl.clientWidth;
    const newHeight = viewportEl.clientHeight;
    if (newWidth === 0 || newHeight === 0) return;

    const currentCenter = paper.view.center.clone();
    const currentZoom = paper.view.zoom;

    paper.view.viewSize = new paper.Size(newWidth, newHeight);
    paper.view.center = currentCenter;
    paper.view.zoom = currentZoom;

    this.drawGrid();
    if (typeof this.utils.selectionRenderEngine.updatePointEntitiesScale === 'function') {
      this.utils.selectionRenderEngine.updatePointEntitiesScale();
    }
    if (typeof this.utils.selectionRenderEngine.renderBezierHandles === 'function') {
      this.utils.selectionRenderEngine.renderBezierHandles();
    }
    paper.view.requestUpdate();
  }

  handleMagicMouseWheel(e) {
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
      this.utils.rubberBandLine.strokeWidth = activeWidth === 0 ? (1 / view.zoom) : activeWidth;
      this.utils.rubberBandLine.dashArray = [2 / view.zoom, 2 / view.zoom];
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

  resetView() {
    if (this.zoomAnimationRequestId) {
      cancelAnimationFrame(this.zoomAnimationRequestId);
      this.zoomAnimationRequestId = null;
    }

    let targetCenter = new paper.Point(0, 0);
    let targetZoom = 1;

    const validEntities = (this.utils.service?.demoEntities || []).filter(
      ent => ent && ent.bounds && ent.bounds.width > 0 && ent.bounds.height > 0
    );

    if (validEntities.length > 0) {
      let combinedBounds = validEntities[0].strokeBounds 
        ? validEntities[0].strokeBounds.clone() 
        : validEntities[0].bounds.clone();

      for (let i = 1; i < validEntities.length; i++) {
        const b = validEntities[i].strokeBounds || validEntities[i].bounds;
        combinedBounds = combinedBounds.unite(b);
      }

      if (combinedBounds && combinedBounds.width > 0 && combinedBounds.height > 0) {
        const viewSizePx = paper.view.element.getBoundingClientRect();

        const bottomBarEl = document.querySelector('#app-ui-container > div');
        const bottomInset = bottomBarEl ? bottomBarEl.getBoundingClientRect().height : 90;
        const topInset = 20;
        const horizontalPadding = 80;

        const visibleWidth = Math.max(viewSizePx.width - horizontalPadding, 100);
        const visibleHeight = Math.max(viewSizePx.height - bottomInset - topInset, 100);

        const zoomX = (visibleWidth * 0.85) / combinedBounds.width;
        const zoomY = (visibleHeight * 0.85) / combinedBounds.height;
        targetZoom = Math.max(0.05, Math.min(Math.min(zoomX, zoomY), 50));

        const offsetYPx = (bottomInset - topInset) / 2;
        targetCenter = combinedBounds.center.add(new paper.Point(0, offsetYPx / targetZoom));
      }
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