/**
 * tools/SplineTool.js - Herramienta para dibujado de Curvas Suaves (Splines)
 */

import { BaseTool } from './BaseTool.js';
import { CommandInputParser } from '../services/input/CommandInputParser.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';

export class SplineTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    const meta = CAD_CATALOG.tools.spline;
    this.commandName = 'SPLINE';
    this.commandAliases = meta.aliases;
    this.promptText = `${meta.prompts.start}:`;
    this.previewLine = null;
    this.lastCursorPoint = null;
    this.redoVertices = [];
  }

  onActivate() {
    this.clearPreviews();
    this.lastCursorPoint = null;
    this.redoVertices = [];
    this._announceStep();
  }

  _getCurrentOptions() {
    const segCount = this.utils.activePath?.segments?.length || 0;
    if (segCount === 0) return [];
    const { undo, close, finish } = CAD_CATALOG.tools.spline.options;

    const options = [{ ...undo, active: false }];
    if (segCount >= 3) options.push({ ...close, active: false });
    if (segCount >= 2) options.push({ ...finish, active: false });
    return options;
  }

  _announceStep() {
    const { prompts } = CAD_CATALOG.tools.spline;
    const segCount = this.utils.activePath?.segments?.length || 0;
    if (segCount === 0) {
      this.setStep(prompts.start);
      return;
    }
    this.setStep(prompts.next, { options: this._getCurrentOptions() });
  }

  _resolveNextPoint(rawPoint, isShift) {
    const activePath = this.utils.activePath;
    const fromPoint = activePath?.lastSegment ? activePath.lastSegment.point : null;
    const disableFromPoint = Boolean(activePath && activePath.segments.length >= 2);

    return this.utils.resolveConstrainedPoint(rawPoint, {
      fromPoint,
      isShift,
      excludeEntity: activePath,
      disableFromPoint
    });
  }

  _recomputeSpline({ closed = false } = {}) {
    const path = this.utils.activePath;
    if (!path) return;
    path.closed = Boolean(closed);
    path.segments.forEach((seg) => {
      seg.handleIn.set(0, 0);
      seg.handleOut.set(0, 0);
    });
    if (path.segments.length >= 2) {
      path.smooth({ type: 'catmull-rom' });
    }
  }

  _refreshPreviewFromMouse(shiftOverride = null) {
    const path = this.utils.activePath;
    const cursorPt = this.utils.lastMousePoint || this.lastCursorPoint;
    const isShift = shiftOverride !== null ? shiftOverride : Boolean(this.utils.isShiftPressed);
    this.utils.hud.clear();

    if (path && path.segments.length > 0 && cursorPt) {
      const lastPt = path.lastSegment.point;
      const pt = this._resolveNextPoint(cursorPt, isShift);
      this.utils.hud.updateHUD(pt);
      this.previewLine = this.syncLineGuide(this.previewLine, lastPt, pt);
      this.utils.hud.updateFeedbackLabels(lastPt, pt);
    } else {
      if (cursorPt) {
        this.utils.hud.updateHUD(this._resolveNextPoint(cursorPt, isShift));
      }
      if (this.previewLine) {
        this.previewLine.remove();
        this.previewLine = null;
      }
    }
    this.paper.view.update();
  }

  _getCursorDirection() {
    const path = this.utils.activePath;
    if (!path?.lastSegment) return null;
    const lastPt = path.lastSegment.point;

    if (this.previewLine?.lastSegment) {
      const vec = this.previewLine.lastSegment.point.subtract(lastPt);
      if (vec.length >= 0.001) return vec;
    }

    const cursorPt = this.utils.lastMousePoint || this.lastCursorPoint;
    if (cursorPt) {
      const pt = this._resolveNextPoint(cursorPt, Boolean(this.utils.isShiftPressed));
      const vec = pt.subtract(lastPt);
      if (vec.length >= 0.001) return vec;
    }
    return null;
  }

  _addVertex(pt, { logInput = false } = {}) {
    const cm = this.utils.consoleManager;
    const path = this.utils.activePath;
    const { logs } = CAD_CATALOG.tools.spline;

    if (!path) {
      if (logInput) cm?.logStepInput?.(this.formatCoords(pt));
      this._beginActivePath(pt, null, { isSpline: true });
      this.redoVertices = [];
      this._announceStep();
      this._refreshPreviewFromMouse();
      this.refreshUndoRedoUI();
      return;
    }

    if (path.lastSegment && path.lastSegment.point.getDistance(pt) < 0.001) {
      this.logTagged(logs.samePoint);
      return;
    }

    if (logInput) cm?.logStepInput?.(this.formatCoords(pt));
    path.add(pt);
    this._recomputeSpline({ closed: false });
    this.redoVertices = [];
    this.utils.selectionRenderEngine.updateEntitiesStroke();
    this._announceStep();
    this._refreshPreviewFromMouse();
    this.refreshUndoRedoUI();
  }

  onUndo() {
    const path = this.utils.activePath;
    if (!path?.segments?.length) return false;

    const { logs } = CAD_CATALOG.tools.spline;

    if (path.segments.length === 1) {
      const removedPt = path.firstSegment.point.clone();
      this.redoVertices.push(removedPt.clone());
      path.remove();
      this.utils.activePath = null;
      this.clearPreviews();
      this.utils.hud.clear();
      this.logTagged(logs.undoStart({ coords: this.formatCoords(removedPt) }));
    } else {
      const undonePt = path.lastSegment.point.clone();
      this.redoVertices.push(undonePt);
      path.removeSegment(path.segments.length - 1);
      this._recomputeSpline({ closed: false });
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.logTagged(logs.undoVertex({ coords: this.formatCoords(path.lastSegment.point) }));
    }

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

    const { logs } = CAD_CATALOG.tools.spline;
    const restoredPt = this.redoVertices.pop();
    const path = this.utils.activePath;

    if (!path?.segments?.length) {
      this._beginActivePath(restoredPt, null, { isSpline: true });
      this.logTagged(logs.redoStart({ coords: this.formatCoords(restoredPt) }));
    } else {
      path.add(restoredPt);
      this._recomputeSpline({ closed: false });
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.logTagged(logs.redoVertex({ coords: this.formatCoords(restoredPt) }));
    }

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

    const isShift = Boolean(event.event?.shiftKey);
    const pt = this._resolveNextPoint(event.point, isShift);
    this._addVertex(pt, { logInput: true });
  }

  onMouseMove(event) {
    if (event.point) {
      this.lastCursorPoint = event.point.clone();
      this.utils.lastMousePoint = event.point.clone();
    }
    this._refreshPreviewFromMouse(Boolean(event.event?.shiftKey));
  }

  clearPreviews() {
    if (this.previewLine) {
      this.previewLine.remove();
      this.previewLine = null;
    }
  }

  _finishActivePath({ closed = false } = {}) {
    this.clearPreviews();
    this.redoVertices = [];
    const { logs } = CAD_CATALOG.tools.spline;
    const path = this.utils.activePath;

    if (path && path.segments && path.segments.length >= 2 && path.length >= 0.001) {
      if (closed) {
        this._recomputeSpline({ closed: true });
      }
      this.utils.activePath = null;
      this.commitNewEntity(path, 'Spline');
      this.logTagged(logs.created({
        name: path.name || 'Spline',
        vertexCount: path.segments.length,
        totalLength: path.length.toFixed(2),
        closed
      }));
    } else {
      this.utils.activePath = null;
      if (path) path.remove();
      this.logTagged(logs.discarded);
    }

    this.utils.hud.clear();
    this.paper.view.update();
    this.exitToSelect();
  }

  onConfirmDefault() {
    if ((this.utils.activePath?.segments?.length || 0) >= 2) {
      this._finishActivePath();
      return;
    }
    if (!this.utils.activePath) {
      this.exitToSelect();
    }
  }

  onCommandInput(rawInput) {
    const { logs } = CAD_CATALOG.tools.spline;
    const fromPoint = this.utils.activePath?.lastSegment?.point || null;
    const parsed = CommandInputParser.parse(rawInput, {
      options: this._getCurrentOptions(),
      referencePoint: fromPoint,
      paper: this.paper
    });

    switch (parsed.type) {
      case 'ACCEPT_DEFAULT':
        this.onConfirmDefault();
        return true;

      case 'OPTION':
        if (parsed.key === 'D') this.onUndo();
        else if (parsed.key === 'C') this._finishActivePath({ closed: true });
        else if (parsed.key === 'T') this._finishActivePath();
        return true;

      case 'POINT':
        this._addVertex(parsed.point);
        return true;

      case 'NUMBER': {
        if (!fromPoint) {
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
        this._addVertex(fromPoint.add(dir.normalize(parsed.value)));
        return true;
      }

      case 'ERROR':
        this.logTagged(parsed.message);
        return true;

      default:
        return false;
    }
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    if ((key === 'Enter' || key === 'NumpadEnter') && (this.utils.activePath?.segments?.length || 0) >= 2) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this._finishActivePath();
      return true;
    }
    return super.onKeyDown(event);
  }

  cancel() {
    this.clearPreviews();
    this.redoVertices = [];
    if (this.utils.activePath) {
      this.utils.activePath.remove();
      this.utils.activePath = null;
    }
    this.utils.hud.clear();
  }

  onContextMenu(event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.event?.preventDefault) event.event.preventDefault();

    if (this.utils.activePath) {
      this._finishActivePath();
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