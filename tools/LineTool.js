/**
 * tools/LineTool.js - Herramienta de dibujado de líneas simples y encadenadas
 */

import { BaseTool } from './BaseTool.js';
import { AddLineCommand } from '../services/commands/cadCommands.js';
import { CommandInputParser } from '../services/input/CommandInputParser.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';

export class LineTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    const meta = CAD_CATALOG.tools.line;
    this.commandName = 'LÍNEA';
    this.commandAliases = meta?.aliases || ['LINEA', 'L'];
    this.promptText = `${meta?.prompts?.start || 'Especifique punto de inicio'}:`;
    this.startPoint = null;
    this.previewLine = null;
    this.sessionVertices = [];
    this.redoVertices = [];
    this.lastCursorPoint = null;
  }

  onActivate() {
    this.resetTool(true);
  }

  _getCurrentOptions() {
    if (this.sessionVertices.length === 0) return [];

    const optsMeta = CAD_CATALOG.tools.line.options;
    const options = [{ ...optsMeta.undo, active: false }];
    if (this.sessionVertices.length >= 2) {
      options.push({ ...optsMeta.finish, active: false });
    }
    return options;
  }

  _announceStep() {
    const prompts = CAD_CATALOG.tools.line.prompts;
    if (!this.startPoint) {
      this.setStep(prompts.start);
      return;
    }
    this.setStep(prompts.next, { options: this._getCurrentOptions() });
  }

  _computeMetrics(fromPt, toPt) {
    const length = fromPt.getDistance(toPt);
    const dx = toPt.x - fromPt.x;
    const dy = -(toPt.y - fromPt.y);
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;
    return { length, angleDeg };
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
    const logs = CAD_CATALOG.tools.line.logs;

    if (!this.startPoint) {
      if (logInput) cm?.logStepInput?.(this.formatCoords(targetPt));
      this.startPoint = targetPt.clone();
      this.sessionVertices = [targetPt.clone()];
      this.redoVertices = [];
      this._announceStep();
      this._refreshPreviewFromMouse();
      this.refreshUndoRedoUI();
      return;
    }

    if (this.startPoint.getDistance(targetPt) < 0.001) {
      this.logTagged(logs.samePoint);
      return;
    }

    if (logInput) cm?.logStepInput?.(this.formatCoords(targetPt));

    const { length, angleDeg } = this._computeMetrics(this.startPoint, targetPt);
    const lineEntity = this.service.createLineEntity(this.startPoint, targetPt, true, 1);

    if (lineEntity) {
      this.commitNewEntity(lineEntity, 'Línea', AddLineCommand);
      this.logTagged(logs.created({
        name: lineEntity.name || 'Línea',
        length: length.toFixed(2),
        angle: angleDeg.toFixed(1)
      }));
    }

    this.startPoint = targetPt.clone();
    this.sessionVertices.push(targetPt.clone());
    this.redoVertices = [];
    this._announceStep();
    this._refreshPreviewFromMouse();
    this.refreshUndoRedoUI();
  }

  onUndo() {
    if (this.sessionVertices.length === 0) return false;
    const logs = CAD_CATALOG.tools.line.logs;

    if (this.sessionVertices.length === 1) {
      const removedPt = this.sessionVertices[0];
      this.redoVertices.push(removedPt.clone());
      this.clearPreviews();
      this.startPoint = null;
      this.sessionVertices = [];
      this.utils.hud.clear();
      this.logTagged(logs.undoStart({ coords: this.formatCoords(removedPt) }));
      this._announceStep();
      this.paper.view.update();
      this.refreshUndoRedoUI();
      return true;
    }

    if (!this.service.undo({ silentLog: true })) return false;

    const undonePt = this.sessionVertices.pop();
    if (undonePt) this.redoVertices.push(undonePt.clone());

    this.startPoint = this.sessionVertices[this.sessionVertices.length - 1].clone();
    this.logTagged(logs.undoSegment({ coords: this.formatCoords(this.startPoint) }));
    this._announceStep();
    this._refreshPreviewFromMouse();
    this.refreshUndoRedoUI();
    return true;
  }

  onRedo() {
    if (this.redoVertices.length === 0) {
      this.logTagged(CAD_CATALOG.commands.redo.logs.empty);
      return true;
    }

    const logs = CAD_CATALOG.tools.line.logs;

    if (!this.startPoint || this.sessionVertices.length === 0) {
      const restoredPt = this.redoVertices.pop();
      this.startPoint = restoredPt.clone();
      this.sessionVertices = [restoredPt.clone()];
      this.logTagged(logs.redoStart({ coords: this.formatCoords(restoredPt) }));
      this._announceStep();
      this._refreshPreviewFromMouse();
      this.refreshUndoRedoUI();
      return true;
    }

    if (!this.service.redo({ silentLog: true })) return false;

    const restoredPt = this.redoVertices.pop();
    this.sessionVertices.push(restoredPt.clone());
    this.startPoint = restoredPt.clone();
    this.logTagged(logs.redoSegment({ coords: this.formatCoords(this.startPoint) }));
    this._announceStep();
    this._refreshPreviewFromMouse();
    this.refreshUndoRedoUI();
    return true;
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

  _finishTool() {
    if (this.startPoint) {
      this.service.suppressOsnapUntilLeave?.(this.startPoint);
    }
    this.logTagged(CAD_CATALOG.tools.line.logs.finished);
    this.exitToSelect();
  }

  onConfirmDefault() {
    if (this.sessionVertices.length >= 2) {
      this._finishTool();
    }
  }

  onCommandInput(rawInput) {
    const logs = CAD_CATALOG.tools.line.logs;
    const parsed = CommandInputParser.parse(rawInput, {
      options: this._getCurrentOptions(),
      referencePoint: this.startPoint,
      paper: this.paper
    });

    switch (parsed.type) {
      case 'ACCEPT_DEFAULT':
        this.onConfirmDefault();
        return true;

      case 'OPTION':
        if (parsed.key === 'D') this.onUndo();
        else if (parsed.key === 'T') this._finishTool();
        return true;

      case 'POINT':
        this._advanceToPoint(parsed.point);
        return true;

      case 'NUMBER': {
        if (!this.startPoint) {
          this.logTagged(logs.needStart);
          return true;
        }
        if (Number.isNaN(parsed.value) || parsed.value <= 0.001) {
          this.logTagged(logs.invalidDistance);
          return true;
        }
        const dir = this._getCursorDirection();
        if (!dir) {
          this.logTagged(logs.needDirection);
          return true;
        }
        this._advanceToPoint(this.startPoint.add(dir.normalize(parsed.value)));
        return true;
      }

      case 'ERROR':
        this.logTagged(parsed.message);
        return true;

      default:
        return false;
    }
  }

  clearPreviews() {
    if (this.previewLine) {
      this.previewLine.remove();
      this.previewLine = null;
    }
  }

  resetTool(announce = false) {
    this.clearPreviews();
    this.startPoint = null;
    this.sessionVertices = [];
    this.redoVertices = [];
    this.lastCursorPoint = null;
    this.utils.hud.clear();
    if (announce) this._announceStep();
    this.paper.view.update();
    this.refreshUndoRedoUI();
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    if (key === 'Enter' && this.sessionVertices.length >= 2) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this._finishTool();
      return true;
    }
    return super.onKeyDown(event);
  }

  onContextMenu(event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.event?.preventDefault) event.event.preventDefault();

    if (this.sessionVertices.length >= 2) {
      this._finishTool();
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

  cancel() {
    if (this.startPoint) {
      this.service.suppressOsnapUntilLeave?.(this.startPoint);
    }
    this.resetTool(false);
  }
}