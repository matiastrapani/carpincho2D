/**
 * tools/DistanceTool.js - Herramienta de consulta de distancia, deltas y ángulo entre dos puntos
 */

import { BaseTool } from './BaseTool.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';

export class DistanceTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    const meta = CAD_CATALOG.tools.distance;
    this.commandName = meta?.displayName || 'DISTANCIA';
    this.commandAliases = meta?.aliases || ['DISTANCIA', 'DIST', 'MEDIR'];
    this.promptText = `${meta?.prompts?.start || 'Especifique primer punto'}:`;
    this.preservesSelection = 'all';
    this.preservesEditMode = true;
    this.startPoint = null;
    this.previewLine = null;
    this.lastCursorPoint = null;
  }

  onActivate() {
    this.resetMeasurement(true);
  }

  _announceStep() {
    const prompts = CAD_CATALOG.tools.distance.prompts;
    this.setStep(this.startPoint ? prompts.end : prompts.start);
  }

  _computeMetrics(fromPt, toPt) {
    const distance = fromPt.getDistance(toPt);
    const dx = toPt.x - fromPt.x;
    const dy = -(toPt.y - fromPt.y);
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;
    return { distance, dx, dy, angleDeg };
  }

  _refreshPreviewFromMouse() {
    const cursorPt = this.utils?.lastMousePoint || this.lastCursorPoint;

    if (this.startPoint && cursorPt) {
      this.utils.hud.clear();
      const pt = this.utils.resolveConstrainedPoint(cursorPt, {
        fromPoint: this.startPoint,
        isShift: Boolean(this.utils.isShiftPressed),
        selectedPointsCoords: [this.startPoint]
      });

      this.utils.hud.updateHUD(pt);
      this.previewLine = this.syncLineGuide(this.previewLine, this.startPoint, pt);
      this.utils.hud.updateFeedbackLabels(this.startPoint, pt);
      this.paper.view.update();
      return;
    }

    this.clearPreviews();
    this.utils.hud.clear();
    this.paper.view.update();
  }

  _getCursorDirection() {
    if (!this.startPoint) return null;

    if (this.previewLine?.lastSegment) {
      const vec = this.previewLine.lastSegment.point.subtract(this.startPoint);
      if (vec.length >= 0.001) return vec;
    }

    const cursorPt = this.utils?.lastMousePoint || this.lastCursorPoint;
    if (cursorPt) {
      const constrained = this.utils.resolveConstrainedPoint(cursorPt, {
        fromPoint: this.startPoint,
        isShift: Boolean(this.utils.isShiftPressed)
      });
      const vec = constrained.subtract(this.startPoint);
      if (vec.length >= 0.001) return vec;
    }

    return null;
  }

  _advanceToPoint(targetPt, { logInput = false } = {}) {
    const cm = this.utils.consoleManager;
    const logs = CAD_CATALOG.tools.distance.logs;

    if (!this.startPoint) {
      if (logInput) cm?.logStepInput?.(this.formatCoords(targetPt));
      this.startPoint = targetPt.clone();
      this._announceStep();
      this._refreshPreviewFromMouse();
      return;
    }

    if (this.startPoint.getDistance(targetPt) < 0.001) {
      this.logTagged(logs.samePoint);
      return;
    }

    if (logInput) cm?.logStepInput?.(this.formatCoords(targetPt));

    const { distance, dx, dy, angleDeg } = this._computeMetrics(this.startPoint, targetPt);
    const cleanDx = dx === 0 ? 0 : dx;
    const cleanDy = dy === 0 ? 0 : dy;

    this.logTaggedResult(logs.measured({
      distance: distance.toFixed(2),
      dx: cleanDx.toFixed(2),
      dy: cleanDy.toFixed(2),
      angle: angleDeg.toFixed(1)
    }));

    this.resetMeasurement(false);
    this.exitToSelect();
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) return;

    if (event.point) {
      this.lastCursorPoint = event.point.clone();
      this.utils.lastMousePoint = event.point.clone();
    }

    const isShift = event.event ? Boolean(event.event.shiftKey) : false;
    const pt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint: this.startPoint,
      isShift,
      selectedPointsCoords: this.startPoint ? [this.startPoint] : null
    });

    this._advanceToPoint(pt, { logInput: true });
  }

  onMouseMove(event) {
    if (event.point) {
      this.lastCursorPoint = event.point.clone();
      this.utils.lastMousePoint = event.point.clone();
    }

    this.utils.hud.clear();
    const isShift = event.event ? Boolean(event.event.shiftKey) : false;
    const pt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint: this.startPoint,
      isShift,
      selectedPointsCoords: this.startPoint ? [this.startPoint] : null
    });

    this.utils.hud.updateHUD(pt);

    if (this.startPoint) {
      this.previewLine = this.syncLineGuide(this.previewLine, this.startPoint, pt);
      this.utils.hud.updateFeedbackLabels(this.startPoint, pt);
    }
  }

  _finishOrCancel() {
    if (this.utils.consoleManager) {
      this.utils.consoleManager.handleCancel();
      return;
    }
    this.resetMeasurement(false);
    this.exitToSelect();
  }

  onConfirmDefault() {
    this._finishOrCancel();
  }

  onCommandInput(rawInput) {
    const logs = CAD_CATALOG.tools.distance.logs;
    const { handled, parsed } = this._parsePointInput(rawInput, {
      referencePoint: this.startPoint,
      direction: () => this._getCursorDirection(),
      numberAsDistance: Boolean(this.startPoint),
      logs
    });
    if (handled) return true;

    if (parsed.type === 'POINT') {
      this._advanceToPoint(parsed.point);
      return true;
    }

    this.logTagged(logs.invalidCoords);
    return true;
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    if (key === 'Enter' || key === 'NumpadEnter') {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this._finishOrCancel();
      return true;
    }
    return super.onKeyDown(event);
  }

  onContextMenu(event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.event?.preventDefault) event.event.preventDefault();
    this._finishOrCancel();
    return true;
  }

  clearPreviews() {
    if (this.previewLine) {
      this.previewLine.remove();
      this.previewLine = null;
    }
  }

  resetMeasurement(announce = false) {
    this.clearPreviews();
    this.startPoint = null;
    this.lastCursorPoint = null;
    this.utils.hud.clear();
    if (announce) this._announceStep();
    this.paper.view.update();
  }

  cancel() {
    this.resetMeasurement(false);
  }
}