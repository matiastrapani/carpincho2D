/**
 * ui/HUDManager.js - Gestión de Overlays, Coordenadas y Marcadores Visuales (OSNAP/HUD)
 */

import { CAD_THEME } from '../config/cadTheme.js';
import { SnapMarkerRenderer } from './SnapMarkerRenderer.js';

export class HUDManager {
  constructor(cadUtils) {
    this.utils = cadUtils;
    this.cadUtils = cadUtils;

    this.feedbackGroup = null;
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
  }

  setupFeedbackLabels() {
    const hudLayer = this.utils?.hudLayer || paper.project?.layers?.['hudLayer'];
    if (hudLayer) hudLayer.activate();

    if (this.feedbackGroup) this.feedbackGroup.remove();
    this.feedbackGroup = new paper.Group();
    this.feedbackGroup.name = 'feedbackGroup';

    this.feedbackTextDistance = new paper.PointText({
      point: [0, 0],
      content: '',
      fillColor: '#00e5ff',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      fontSize: 11
    });

    this.feedbackTextAngle = new paper.PointText({
      point: [0, 0],
      content: '',
      fillColor: '#34d399',
      fontFamily: 'monospace',
      fontSize: 10
    });

    this.feedbackGroup.addChild(this.feedbackTextDistance);
    this.feedbackGroup.addChild(this.feedbackTextAngle);
    this.feedbackGroup.visible = false;

    const drawLayer = this.utils?.drawLayer || paper.project?.layers?.['drawLayer'];
    if (drawLayer) drawLayer.activate();
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

  updateFeedbackLabels(fromPt, toPt) {
    if (!fromPt || !toPt || !this.utils.activePath) {
      if (this.feedbackGroup) this.feedbackGroup.visible = false;
      return;
    }

    if (!this.feedbackGroup) {
      this.setupFeedbackLabels();
    }

    const vector = toPt.subtract(fromPt);
    const distance = vector.length;
    let angle = -vector.angle;
    if (angle < 0) angle += 360;

    const zoom = paper.view.zoom;
    this.feedbackGroup.visible = true;

    const offset = new paper.Point(15 / zoom, -15 / zoom);
    const labelPos = toPt.add(offset);

    this.feedbackTextDistance.position = labelPos;
    this.feedbackTextDistance.fontSize = 11 / zoom;
    this.feedbackTextDistance.content = `L: ${distance.toFixed(2)}`;

    if (this.feedbackTextAngle) {
      this.feedbackTextAngle.position = labelPos.add(new paper.Point(0, 14 / zoom));
      this.feedbackTextAngle.fontSize = 10 / zoom;
      this.feedbackTextAngle.content = `A: ${angle.toFixed(1)}°`;
    }
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
    if (this.feedbackGroup) {
      this.feedbackGroup.visible = false;
    }
  }

  cleanup() {
    window.removeEventListener('pointermove', this._pointerMoveHandler, { passive: true });

    this.clear();
    this.clearDragRubberBand();
    if (this.feedbackGroup) {
      this.feedbackGroup.remove();
      this.feedbackGroup = null;
    }
    if (this.snapMarkersGroup) {
      this.snapMarkersGroup.remove();
      this.snapMarkersGroup = null;
    }

    this.hudX = null;
    this.hudY = null;
    this.hudZoom = null;
    this.currentElementUnderCursor = null;
  }
}