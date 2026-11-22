/**
 * tools/CircleTool.js - Herramienta de Creación de Círculo (Centro y Radio/Diámetro)
 */

import { BaseTool } from './BaseTool.js';
import { CommandInputParser } from '../services/input/CommandInputParser.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';

export class CircleTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    const meta = CAD_CATALOG.tools.circle;
    this.commandName = 'CÍRCULO';
    this.commandAliases = meta?.aliases || ['CIRCULO', 'C'];
    this.promptText = `${meta?.prompts?.center || 'Especifique el centro del círculo'}:`;
    this.centerPoint = null;
    this.lastRadius = null;
    this.previewCircle = null;
    this.previewRadiusLine = null;
    this._unitCircleSegments = null;
    this.setToolOption('isDiameterMode', false);
  }

  get isDiameterMode() {
    return Boolean(this.getToolOption('isDiameterMode', false));
  }

  set isDiameterMode(value) {
    this.setToolOption('isDiameterMode', Boolean(value));
  }

  onActivate() {
    this.resetTool(true);
  }

  _getCurrentOptions() {
    if (!this.centerPoint) return [];
    const optsMeta = CAD_CATALOG.tools.circle.options;
    return this.isDiameterMode
      ? [{ ...optsMeta.radius, active: false }]
      : [{ ...optsMeta.diameter, active: false }];
  }

  _announceStep() {
    const prompts = CAD_CATALOG.tools.circle.prompts;
    if (!this.centerPoint) {
      this.setStep(prompts.center);
      return;
    }

    const hasDefault = this.lastRadius !== null && this.lastRadius > 0.001;
    const defaultValue = hasDefault
      ? (this.isDiameterMode ? (this.lastRadius * 2).toFixed(2) : this.lastRadius.toFixed(2))
      : null;
    const instruction = this.isDiameterMode ? prompts.diameter : prompts.radius;

    this.setStep(instruction, { defaultValue, options: this._getCurrentOptions() });
  }

  _ensurePreviewItems() {
    const hudLayer = this.getHudLayer();

    if (!this.previewCircle) {
      this.previewCircle = new this.paper.Path.Circle({
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
      this.previewRadiusLine = new this.paper.Path.Line({
        from: [0, 0],
        to: [0, 0],
        guide: true,
        data: { isAuxiliary: true },
        insert: false
      });
    }

    if (this.previewCircle.parent !== hudLayer) hudLayer.addChild(this.previewCircle);
    if (this.previewRadiusLine.parent !== hudLayer) hudLayer.addChild(this.previewRadiusLine);
  }

  _updatePreview(pt) {
    this._ensurePreviewItems();

    const cx = this.centerPoint.x;
    const cy = this.centerPoint.y;
    const rawDist = this.centerPoint.getDistance(pt);
    const currentRadius = this.isDiameterMode ? rawDist / 2 : rawDist;
    const style = this.resolvePreviewStyle();

    this.previewCircle.visible = currentRadius > 1e-6;
    if (this.previewCircle.visible) {
      this.previewCircle.segments.forEach((seg, idx) => {
        const u = this._unitCircleSegments[idx];
        seg.point.set(cx + u.px * currentRadius, cy + u.py * currentRadius);
        seg.handleIn.set(u.ix * currentRadius, u.iy * currentRadius);
        seg.handleOut.set(u.ox * currentRadius, u.oy * currentRadius);
      });
      this.previewCircle.strokeColor = style.color;
      this.previewCircle.strokeWidth = style.strokeWidth;
      this.previewCircle.dashArray = style.dashArray;
      this.previewCircle.opacity = style.opacity;
    }

    this.previewRadiusLine.visible = true;
    this.previewRadiusLine.segments[0].point.set(cx, cy);
    this.previewRadiusLine.segments[1].point.set(pt.x, pt.y);
    this.previewRadiusLine.strokeColor = style.color;
    this.previewRadiusLine.strokeWidth = style.strokeWidth;
    this.previewRadiusLine.dashArray = style.dashArray;
    this.previewRadiusLine.opacity = style.opacity;
  }

  _refreshPreviewFromMouse() {
    const cursorPt = this.utils?.lastMousePoint;
    if (this.centerPoint && cursorPt) {
      this.utils.hud.clear();
      const pt = this.utils.resolveConstrainedPoint(cursorPt, {
        fromPoint: this.centerPoint,
        isShift: Boolean(this.utils.isShiftPressed),
        osnapMode: 'circleRadius'
      });
      this.utils.hud.updateHUD(pt);
      this._updatePreview(pt);
      this.utils.hud.updateFeedbackLabels(this.centerPoint, pt);
      this.paper.view.update();
    }
  }

  _setCenter(pt, { logInput = false } = {}) {
    if (logInput) {
      this.utils.consoleManager?.logStepInput?.(this.formatCoords(pt));
    }
    this.centerPoint = pt.clone();
    this._announceStep();
    this._refreshPreviewFromMouse();
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) return;
    if (event.point) this.utils.lastMousePoint = event.point.clone();

    const isShift = event.event ? Boolean(event.event.shiftKey) : false;
    const pt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint: this.centerPoint,
      isShift,
      osnapMode: this.centerPoint ? 'circleRadius' : null
    });

    if (!this.centerPoint) {
      this._setCenter(pt, { logInput: true });
      return;
    }

    const dist = this.centerPoint.getDistance(pt);
    const radius = this.isDiameterMode ? dist / 2 : dist;
    this.commitCircle(radius, { logInputValue: this.formatCoords(pt) });
  }

  commitCircle(radius, { logInputValue = null } = {}) {
    const logs = CAD_CATALOG.tools.circle.logs;
    if (!this.centerPoint || Number.isNaN(radius) || radius <= 0.001) {
      this.logTagged(this.isDiameterMode ? logs.invalidDiameter : logs.invalidRadius);
      return;
    }

    if (logInputValue !== null) {
      this.utils.consoleManager?.logStepInput?.(logInputValue);
    }

    this.lastRadius = radius;
    const circleEntity = this.service.createCircleEntity(this.centerPoint, radius, true, 1);
    if (circleEntity) {
      this.commitNewEntity(circleEntity, 'Círculo');
      this.logTagged(logs.created({
        name: circleEntity.name || 'Círculo',
        center: this.formatCoords(this.centerPoint),
        radius: radius.toFixed(2)
      }));
    }

    this.resetTool(false);
    this.exitToSelect();
  }

  commitDefaultRadius() {
    if (!this.centerPoint || this.lastRadius === null || this.lastRadius <= 0.001) {
      return false;
    }
    const defaultStr = this.isDiameterMode
      ? (this.lastRadius * 2).toFixed(2)
      : this.lastRadius.toFixed(2);
    this.commitCircle(this.lastRadius, { logInputValue: defaultStr });
    return true;
  }

  onConfirmDefault() {
    return this.commitDefaultRadius();
  }

  onCommandInput(rawInput) {
    const logs = CAD_CATALOG.tools.circle.logs;
    const parsed = CommandInputParser.parse(rawInput, {
      options: this._getCurrentOptions(),
      referencePoint: this.centerPoint,
      paper: this.paper
    });

    switch (parsed.type) {
      case 'ACCEPT_DEFAULT':
        this.commitDefaultRadius();
        return true;

      case 'OPTION':
        if (parsed.key === 'D') {
          this.isDiameterMode = true;
          this._announceStep();
          this._refreshPreviewFromMouse();
        } else if (parsed.key === 'R') {
          this.isDiameterMode = false;
          this._announceStep();
          this._refreshPreviewFromMouse();
        }
        return true;

      case 'POINT':
        if (!this.centerPoint) {
          this._setCenter(parsed.point);
        } else {
          const dist = this.centerPoint.getDistance(parsed.point);
          this.commitCircle(this.isDiameterMode ? dist / 2 : dist);
        }
        return true;

      case 'NUMBER':
        if (!this.centerPoint) {
          this.logTagged(logs.needCenter);
          return true;
        }
        this.commitCircle(this.isDiameterMode ? parsed.value / 2 : parsed.value);
        return true;

      case 'ERROR':
        this.logTagged(parsed.message);
        return true;

      default:
        return false;
    }
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    if ((key === 'Enter' || key === 'NumpadEnter') && this.centerPoint) {
      if (this.commitDefaultRadius()) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        return true;
      }
    }
    return super.onKeyDown(event);
  }

  onMouseMove(event) {
    if (event.point) this.utils.lastMousePoint = event.point.clone();

    this.utils.hud.clear();
    const isShift = event.event ? Boolean(event.event.shiftKey) : false;
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

  resetTool(announce = false) {
    this.clearPreviews();
    this.centerPoint = null;
    this.utils.hud.clear();
    if (announce) this._announceStep();
    this.paper.view.update();
    this.refreshUndoRedoUI();
  }

  cancel() {
    this.resetTool(false);
  }

  onContextMenu(event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.event?.preventDefault) event.event.preventDefault();

    if (this.centerPoint && this.commitDefaultRadius()) {
      return true;
    }

    if (this.utils.consoleManager) {
      this.utils.consoleManager.handleCancel();
      return true;
    }

    this.cancel();
    this.exitToSelect();
    return true;
  }
}