/**
 * tools/CircleTool.js - Herramienta de Creación de Círculo (Centro y Radio)
 */

import { BaseTool } from './BaseTool.js';

export class CircleTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'CIRCLE. Haz clic para especificar el centro del círculo.';
    this.centerPoint = null;
    this.lastRadius = null;
    this.previewCircle = null;
    this.previewRadiusLine = null;
    this._unitCircleSegments = null;
  }

  _getRadiusPrompt() {
    if (this.lastRadius !== null && this.lastRadius > 0.001) {
      return `Especifica el radio o un punto en el círculo <${this.lastRadius.toFixed(2)}>:`;
    }
    return 'Especifica el radio o un punto en el círculo:';
  }

  _resolvePreviewStyle() {
    const propMgr = this.utils.propertyManager;
    const layerManager = this.utils.layerManager;
    const defaults = propMgr?.defaultSettings || {};
    const activeLayer = layerManager ? layerManager.getActiveLayer() : null;

    const isColorByLayer = defaults.color === 'BYLAYER' || !defaults.color;
    const previewColor = isColorByLayer ? (activeLayer?.color || '#00e5ff') : defaults.color;

    const isOpacityByLayer = defaults.opacity === 'BYLAYER' || defaults.opacity === undefined;
    const previewOpacity = isOpacityByLayer
      ? (activeLayer?.opacity !== undefined ? activeLayer.opacity : 1)
      : (typeof defaults.opacity === 'number' ? defaults.opacity : 1);

    return { previewColor, previewOpacity };
  }

  _ensurePreviewItems() {
    const hudLayer = this.utils.hudLayer || paper.project?.layers?.['hudLayer'];

    if (!this.previewCircle) {
      this.previewCircle = new paper.Path.Circle({
        center: [0, 0],
        radius: 1,
        guide: true,
        data: { isAuxiliary: true },
        insert: false
      });

      this._unitCircleSegments = this.previewCircle.segments.map((seg) => ({
        px: seg.point.x,
        py: seg.point.y,
        ix: seg.handleIn.x,
        iy: seg.handleIn.y,
        ox: seg.handleOut.x,
        oy: seg.handleOut.y
      }));
    }

    if (!this.previewRadiusLine) {
      this.previewRadiusLine = new paper.Path.Line({
        from: [0, 0],
        to: [0, 0],
        guide: true,
        data: { isAuxiliary: true },
        insert: false
      });
    }

    if (hudLayer) {
      if (this.previewCircle.parent !== hudLayer) hudLayer.addChild(this.previewCircle);
      if (this.previewRadiusLine.parent !== hudLayer) hudLayer.addChild(this.previewRadiusLine);
    }
  }

  _updatePreview(pt) {
    this._ensurePreviewItems();

    const cx = this.centerPoint.x;
    const cy = this.centerPoint.y;
    const currentRadius = this.centerPoint.getDistance(pt);
    const zoom = paper.view.zoom || 1;
    const strokeWidth = 1 / zoom;
    const dashStyle = [2 / zoom, 2 / zoom];
    const { previewColor, previewOpacity } = this._resolvePreviewStyle();

    this.previewCircle.visible = currentRadius > 1e-6;
    if (this.previewCircle.visible) {
      this.previewCircle.segments.forEach((seg, idx) => {
        const u = this._unitCircleSegments[idx];
        seg.point.set(cx + u.px * currentRadius, cy + u.py * currentRadius);
        seg.handleIn.set(u.ix * currentRadius, u.iy * currentRadius);
        seg.handleOut.set(u.ox * currentRadius, u.oy * currentRadius);
      });
      this.previewCircle.strokeColor = previewColor;
      this.previewCircle.strokeWidth = strokeWidth;
      this.previewCircle.dashArray = dashStyle;
      this.previewCircle.opacity = previewOpacity;
    }

    this.previewRadiusLine.visible = true;
    this.previewRadiusLine.segments[0].point.set(cx, cy);
    this.previewRadiusLine.segments[1].point.set(pt.x, pt.y);
    this.previewRadiusLine.strokeColor = previewColor;
    this.previewRadiusLine.strokeWidth = strokeWidth;
    this.previewRadiusLine.dashArray = dashStyle;
    this.previewRadiusLine.opacity = previewOpacity;
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) return;

    const isShift = event.event ? event.event.shiftKey : false;
    const pt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint: this.centerPoint,
      isShift,
      osnapMode: this.centerPoint ? 'circleRadius' : null
    });

    if (!this.centerPoint) {
      this.centerPoint = pt;
      this.setPrompt(this._getRadiusPrompt());
      return;
    }

    const radius = this.centerPoint.getDistance(pt);
    this.commitCircle(radius);
  }

  commitCircle(radius) {
    if (!this.centerPoint || isNaN(radius) || radius <= 0.001) return;

    this.lastRadius = radius;
    const circleEntity = this.service.createCircleEntity(this.centerPoint, radius, true, 1);
    if (circleEntity) {
      this.commitNewEntity(circleEntity, 'Círculo');
    }

    this.resetTool();
  }

  commitDefaultRadius() {
    if (!this.centerPoint || this.lastRadius === null || this.lastRadius <= 0.001) {
      return false;
    }
    this.commitCircle(this.lastRadius);
    return true;
  }

  onConfirmDefault() {
    return this.commitDefaultRadius();
  }

  onKeyDown(event) {
    if (event?.key === 'Enter' && this.centerPoint) {
      if (this.commitDefaultRadius()) {
        event.preventDefault?.();
        return true;
      }
    }
    return false;
  }

  onMouseMove(event) {
    this.utils.hud.clear();
    const isShift = event.event ? event.event.shiftKey : false;
    const pt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint: this.centerPoint,
      isShift,
      osnapMode: this.centerPoint ? 'circleRadius' : null
    });

    this.utils.hud.updateHUD(pt);

    if (this.centerPoint) {
      this._updatePreview(pt);
      this.utils.hud.updateFeedbackLabels(this.centerPoint, pt);
    }
  }

  clearPreviews() {
    if (this.previewCircle) {
      this.previewCircle.remove();
      this.previewCircle = null;
    }
    if (this.previewRadiusLine) {
      this.previewRadiusLine.remove();
      this.previewRadiusLine = null;
    }
    this._unitCircleSegments = null;
  }

  resetTool() {
    this.clearPreviews();
    this.centerPoint = null;
    this.utils.hud.clear();
    this.setPrompt(this.promptText);
    if (window.paper?.view) {
      paper.view.update();
    }
  }

  cancel() {
    this.resetTool();
  }

  onContextMenu(event) {
    if (this.centerPoint) {
      if (!this.commitDefaultRadius()) {
        this.resetTool();
      }
    } else {
      this.exitToSelect();
    }
    return true;
  }

  cancelAndExit() {
    this.resetTool();
    this.utils.setTool('select');
  }
}