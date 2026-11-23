/**
 * ui/HUDManager.js - Gestión de Overlays, Coordenadas y Marcadores Visuales (OSNAP/HUD)
 */

import { CAD_THEME } from '../config/cadTheme.js';
import { SnapMarkerRenderer } from './SnapMarkerRenderer.js';

export class HUDManager {
  constructor(cadUtils) {
    this.utils = cadUtils;
    this.cadUtils = cadUtils;

    this.feedbackEl = null;
    this.feedbackTextDistance = null;
    this.feedbackTextAngle = null;

    this.snapMarkersGroup = null;
    this.dragRubberBand = null;

    this.lastSnapPoint = null;
    this.lastSnapType = null;

    this._pointerMoveHandler = this._handlePointerMove.bind(this);
    this.initDOM();
  }

  initDOM() {
    this.hudX = document.getElementById('hudX');
    this.hudY = document.getElementById('hudY');
    this.currentElementUnderCursor = null;

    window.addEventListener('pointermove', this._pointerMoveHandler, { passive: true });
  }

  _handlePointerMove(e) {
    this.currentElementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);

    const paperInstance = this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
    const canvas = this.utils?.canvasElement || document.getElementById('cadCanvas');
    if (paperInstance?.view && canvas && this.utils) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const viewPt = new paperInstance.Point(e.clientX - rect.left, e.clientY - rect.top);
        const projectPt = paperInstance.view.viewToProject(viewPt);
        this.utils.lastMousePoint = projectPt.clone();
      }
    }
  }

  updateHUD(point) {
    if (!paper || !paper.view) return;

    this._refreshDOMReferences();

    if (this.hudZoom) {
      this.hudZoom.innerText = `${Math.round(paper.view.zoom * 100)}%`;
    }

    if (point) this.lastPointerPoint = point;
    const targetPoint = point || this.lastPointerPoint;

    if (point && this.currentElementUnderCursor && this.currentElementUnderCursor.tagName !== 'CANVAS') {
      return;
    }

    if (targetPoint) {
      if (this.hudX) this.hudX.innerText = targetPoint.x.toFixed(2);
      if (this.hudY) this.hudY.innerText = (-targetPoint.y).toFixed(2);
    }
  }


  setupFeedbackLabels() {
    if (this.feedbackGroup) {
      this.feedbackGroup.remove();
      this.feedbackGroup = null;
    }

    if (this.feedbackEl) {
      this.feedbackEl.remove();
    }

    const container = document.getElementById('mainViewport') || document.body;
    const wrapper = document.createElement('div');
    wrapper.className = 'hud-feedback-label';

    const primaryLine = document.createElement('span');
    primaryLine.className = 'hud-feedback-primary';

    const secondaryLine = document.createElement('span');
    secondaryLine.className = 'hud-feedback-secondary';

    wrapper.appendChild(primaryLine);
    wrapper.appendChild(secondaryLine);
    container.appendChild(wrapper);

    this.feedbackEl = wrapper;
    this.feedbackTextDistance = primaryLine;
    this.feedbackTextAngle = secondaryLine;
  }

  _resolveFeedbackColors(explicitColor = null) {
    let rawColor = explicitColor;

    if (!rawColor) {
      const service = this.utils?.service;
      const targetEnt = service?.editingEntities?.[0] || service?.selectedEntities?.[0] || null;

      if (targetEnt) {
        const layerId = String(targetEnt.data?.layerId || '0');
        const layer = this.utils?.layerManager?.layers?.get(layerId);
        const isByLayer = !targetEnt.data?.color || targetEnt.data?.color === 'BYLAYER';
        rawColor = isByLayer
          ? (layer?.color || targetEnt.strokeColor)
          : targetEnt.data.color;
      } else {
        const defaults = this.utils?.propertyManager?.defaultSettings;
        const activeLayer = this.utils?.layerManager?.getActiveLayer?.();
        const isColorByLayer = !defaults?.color || defaults.color === 'BYLAYER';
        rawColor = isColorByLayer
          ? (activeLayer?.color || CAD_THEME.properties.customFallbackColor)
          : defaults.color;
      }
    }

    const primaryColor = new paper.Color(rawColor || CAD_THEME.properties.defaultColor);
    const secondaryColor = primaryColor.clone();

    if (secondaryColor.brightness < 0.45) {
      secondaryColor.brightness = 0.55;
    }
    secondaryColor.alpha = (primaryColor.alpha ?? 1) * 0.8;

    return {
      primaryCss: primaryColor.toCSS(false),
      secondaryCss: secondaryColor.toCSS(false)
    };
  }

  updateFeedbackLabels(fromPt, toPt, options = {}) {
    const activeTool = this.utils?.toolManager?.activeTool;
    const hasActivePreview = Boolean(
      options.force ||
      this.utils?.activePath ||
      activeTool?.previewLine ||
      activeTool?.previewCircle ||
      activeTool?.previewRadiusLine ||
      this.dragRubberBand
    );

    if (!fromPt || !toPt || !hasActivePreview || !paper?.view) {
      if (this.feedbackEl) this.feedbackEl.style.display = 'none';
      return;
    }

    if (!this.feedbackEl || !this.feedbackEl.isConnected) {
      this.setupFeedbackLabels();
    }

    const vector = toPt.subtract(fromPt);
    const primaryLabel = options.primaryLabel || 'L';
    const primaryValue = typeof options.primaryValue === 'number'
      ? options.primaryValue
      : vector.length;

    let angle = -vector.angle;
    if (angle < 0) angle += 360;

    const { primaryCss, secondaryCss } = this._resolveFeedbackColors(options.color || null);

    this.feedbackTextDistance.style.color = primaryCss;
    this.feedbackTextDistance.textContent = `${primaryLabel}: ${primaryValue.toFixed(2)}`;

    this.feedbackTextAngle.style.color = secondaryCss;
    this.feedbackTextAngle.textContent = `A: ${angle.toFixed(1)}°`;

    this.feedbackEl.style.display = 'flex';

    const anchorPt = (this.utils?.lastMousePoint && Number.isFinite(this.utils.lastMousePoint.x))
      ? this.utils.lastMousePoint
      : toPt;
    const viewPx = paper.view.projectToView(anchorPt);
    const viewSize = paper.view.viewSize;

    const gapX = 16;
    const marginX = 10;
    const marginY = 8;
    const boxW = this.feedbackEl.offsetWidth || 64;
    const boxH = this.feedbackEl.offsetHeight || 28;

    let leftPx;
    if (viewPx.x + gapX + boxW <= viewSize.width - marginX) {
      leftPx = viewPx.x + gapX;
      this.feedbackEl.style.alignItems = 'flex-start';
      this.feedbackEl.style.textAlign = 'left';
    } else {
      leftPx = Math.max(marginX, viewPx.x - gapX - boxW);
      this.feedbackEl.style.alignItems = 'flex-end';
      this.feedbackEl.style.textAlign = 'right';
    }

    let topPx = viewPx.y - (boxH / 2);
    topPx = Math.max(marginY, Math.min(viewSize.height - marginY - boxH, topPx));

    this.feedbackEl.style.transform = `translate3d(${Math.round(leftPx)}px, ${Math.round(topPx)}px, 0)`;
  }
  
  hideFeedbackLabels() {
    if (this.feedbackEl) {
      this.feedbackEl.style.display = 'none';
    }
  }

  renderSnapMarker(point, type) {
    const hudLayer = this.utils?.hudLayer || paper.project?.layers?.['hudLayer'];
    const drawLayer = this.utils?.drawLayer || paper.project?.layers?.['drawLayer'];

    if (hudLayer) hudLayer.activate();

    if (!this.snapMarkersGroup) {
      this.snapMarkersGroup = new paper.Group();
      this.snapMarkersGroup.name = 'snapMarkersGroup';
    } else {
      this.snapMarkersGroup.removeChildren();
    }

    if (hudLayer && this.snapMarkersGroup.parent !== hudLayer) {
      hudLayer.addChild(this.snapMarkersGroup);
    }

    this.lastSnapPoint = point;
    this.lastSnapType = type;

    if (!point || !type || type === 'none') {
      if (drawLayer) drawLayer.activate();
      return;
    }

    SnapMarkerRenderer.render(this.snapMarkersGroup, point, type, paper.view.zoom);

    this.snapMarkersGroup.bringToFront();
    if (hudLayer) hudLayer.bringToFront();
    if (drawLayer) drawLayer.activate();
  }

  refreshSnapMarkerScale() {
    if (this.lastSnapPoint && this.lastSnapType) {
      this.renderSnapMarker(this.lastSnapPoint, this.lastSnapType);
    }
  }

  _refreshDOMReferences() {
    if (!this.hudX || !this.hudX.isConnected) this.hudX = document.getElementById('hudX');
    if (!this.hudY || !this.hudY.isConnected) this.hudY = document.getElementById('hudY');
    if (!this.hudZoom || !this.hudZoom.isConnected) this.hudZoom = document.getElementById('hudZoom');
  }

  updateDragRubberBand(fromPt, toPt) {
    if (!fromPt || !toPt) return;

    const hudLayer = this.utils?.hudLayer || paper.project?.layers?.['hudLayer'];
    if (!hudLayer) return;

    const zoom = paper.view.zoom || 1;
    const strokeWidth = (CAD_THEME.rubberBand?.strokeWidthPx ?? 1) / zoom;
    const dashArray = (CAD_THEME.rubberBand?.dashArrayPx || [6, 4]).map((v) => v / zoom);

    if (!this.dragRubberBand) {
      const line = new paper.Path.Line({
        from: fromPt,
        to: toPt,
        strokeColor: CAD_THEME.selection.line.strokeColor,
        strokeWidth,
        dashArray,
        data: { isAuxiliary: true },
        insert: false
      });
      hudLayer.addChild(line);
      this.dragRubberBand = line;
    } else {
      this.dragRubberBand.segments[0].point = fromPt;
      this.dragRubberBand.segments[1].point = toPt;
      this.dragRubberBand.strokeWidth = strokeWidth;
      this.dragRubberBand.dashArray = dashArray;
    }
  }

  clearDragRubberBand() {
    this.hideFeedbackLabels();

    if (this.dragRubberBand) {
      this.dragRubberBand.remove();
      this.dragRubberBand = null;
    }
  }

  clear() {
    if (this.snapMarkersGroup) {
      this.snapMarkersGroup.removeChildren();
    }
    this.lastSnapPoint = null;
    this.lastSnapType = null;
    this.hideFeedbackLabels();
  }

  cleanup() {
    window.removeEventListener('pointermove', this._pointerMoveHandler, { passive: true });

    this.clear();
    this.clearDragRubberBand();
    if (this.feedbackGroup) {
      this.feedbackGroup.remove();
      this.feedbackGroup = null;
    }
    if (this.feedbackEl) {
      this.feedbackEl.remove();
      this.feedbackEl = null;
    }
    this.feedbackTextDistance = null;
    this.feedbackTextAngle = null;

    this.hudX = null;
    this.hudY = null;
    this.hudZoom = null;
    this.currentElementUnderCursor = null;
  }
}