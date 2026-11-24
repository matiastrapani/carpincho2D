/**
 * tools/BezierTool.js - Herramienta para dibujado de Curvas Bézier interactivas
 */

import { BaseTool } from './BaseTool.js';
import { CommandInputParser } from '../services/input/CommandInputParser.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';
import { BezierHandleController } from './curve/BezierHandleController.js';

export class BezierTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    const meta = CAD_CATALOG.tools.bezier;
    this.commandName = 'BÉZIER';
    this.commandAliases = meta.aliases;
    this.promptText = `${meta.prompts.start}:`;
    this.previewLine = null;
    this.lastCursorPoint = null;
    this.redoSegments = [];
    this.handleCtrl = new BezierHandleController(this);
  }

  onActivate() {
    this.resetTool(true);
  }

  _getCurrentOptions() {
    const segCount = this.utils.activePath?.segments?.length || 0;
    if (segCount === 0) return [];
    const { handle, asymmetric, undo, close, finish } = CAD_CATALOG.tools.bezier.options;

    if (this.handleCtrl.isSettingHandle) {
      return [
        { ...asymmetric, active: this.handleCtrl.isAsymmetric },
        { ...undo, active: false }
      ];
    }

    const options = [
      { ...handle, active: false },
      { ...undo, active: false }
    ];
    if (segCount >= 2) {
      options.push({ ...close, active: false });
      options.push({ ...finish, active: false });
    }
    return options;
  }

  _announceStep() {
    const { prompts } = CAD_CATALOG.tools.bezier;
    const segCount = this.utils.activePath?.segments?.length || 0;
    if (segCount === 0) {
      this.setStep(prompts.start);
      return;
    }
    const prompt = this.handleCtrl.isSettingHandle ? prompts.handle : prompts.next;
    this.setStep(prompt, { options: this._getCurrentOptions() });
  }

  _resolveNextPoint(rawPoint, isShift) {
    const activePath = this.utils.activePath;
    const lastSeg = activePath?.lastSegment || null;
    const fromPoint = lastSeg ? lastSeg.point : null;
    const disableFromPoint = Boolean(lastSeg && !lastSeg.handleOut.isZero());

    return this.utils.resolveConstrainedPoint(rawPoint, {
      fromPoint,
      isShift,
      excludeEntity: activePath,
      disableFromPoint
    });
  }

  _refreshPreviewFromMouse(shiftOverride = null) {
    const path = this.utils.activePath;
    const cursorPt = this.utils.lastMousePoint || this.lastCursorPoint;
    const isShift = shiftOverride !== null ? shiftOverride : Boolean(this.utils.isShiftPressed);
    this.utils.hud.clear();

    if (this.handleCtrl.isSettingHandle && path?.lastSegment && cursorPt) {
      const originPt = path.lastSegment.point;
      const pt = this.utils.resolveConstrainedPoint(cursorPt, {
        fromPoint: originPt,
        isShift,
        excludeEntity: path
      });
      this.utils.hud.updateHUD(pt);
      this.handleCtrl.previewTarget(path.lastSegment, pt);
      this.previewLine = this.syncLineGuide(this.previewLine, originPt, pt);
      this.utils.hud.updateFeedbackLabels(originPt, pt);
    } else if (path && path.segments.length > 0 && cursorPt) {
      const lastPt = path.lastSegment.point;
      const pt = this._resolveNextPoint(cursorPt, isShift);
      this.utils.hud.updateHUD(pt);
      this.previewLine = this.syncLineGuide(this.previewLine, lastPt, pt);
      this.utils.hud.updateFeedbackLabels(lastPt, pt);
    } else {
      if (cursorPt) this.utils.hud.updateHUD(this._resolveNextPoint(cursorPt, isShift));
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
      const isShift = Boolean(this.utils.isShiftPressed);
      const pt = this.handleCtrl.isSettingHandle
        ? this.utils.resolveConstrainedPoint(cursorPt, { fromPoint: lastPt, isShift, excludeEntity: path })
        : this._resolveNextPoint(cursorPt, isShift);
      const vec = pt.subtract(lastPt);
      if (vec.length >= 0.001) return vec;
    }
    return null;
  }

  _addVertex(pt, { logInput = false } = {}) {
    const cm = this.utils.consoleManager;
    const path = this.utils.activePath;
    const { logs } = CAD_CATALOG.tools.bezier;

    if (!path) {
      if (logInput) cm?.logStepInput?.(this.formatCoords(pt));
      this._beginActivePath(pt, null);
      this.redoSegments = [];
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
    this.redoSegments = [];
    this.utils.selectionRenderEngine.updateEntitiesStroke();
    this._announceStep();
    this._refreshPreviewFromMouse();
    this.refreshUndoRedoUI();
  }

  onUndo() {
    const path = this.utils.activePath;
    if (this.handleCtrl.isSettingHandle) {
      this.handleCtrl.exit(path?.lastSegment, { restoreBackup: true, logCancel: true });
      this._announceStep();
      this._refreshPreviewFromMouse();
      return true;
    }

    if (!path?.segments?.length) return false;
    const { logs } = CAD_CATALOG.tools.bezier;
    const lastSeg = path.lastSegment;
    const segData = {
      point: lastSeg.point.clone(),
      handleIn: lastSeg.handleIn.clone(),
      handleOut: lastSeg.handleOut.clone()
    };
    this.redoSegments.push(segData);

    if (path.segments.length === 1) {
      path.remove();
      this.utils.activePath = null;
      this.clearPreviews();
      this.utils.hud.clear();
      this.logTagged(logs.undoStart({ coords: this.formatCoords(segData.point) }));
    } else {
      path.removeSegment(path.segments.length - 1);
      this.handleCtrl.clearPreview();
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.logTagged(logs.undoVertex({ coords: this.formatCoords(path.lastSegment.point) }));
    }

    this._announceStep();
    this._refreshPreviewFromMouse();
    this.refreshUndoRedoUI();
    return true;
  }

  onRedo() {
    if (this.handleCtrl.isSettingHandle || this.redoSegments.length === 0) {
      this.logTagged(CAD_CATALOG.commands.redo.logs.empty);
      return true;
    }

    const { logs } = CAD_CATALOG.tools.bezier;
    const segData = this.redoSegments.pop();
    const path = this.utils.activePath;

    if (!path?.segments?.length) {
      this._beginActivePath(segData.point, null);
      const firstSeg = this.utils.activePath.firstSegment;
      firstSeg.handleIn = segData.handleIn;
      firstSeg.handleOut = segData.handleOut;
      this.logTagged(logs.redoStart({ coords: this.formatCoords(segData.point) }));
    } else {
      const addedSeg = path.add(new this.paper.Segment(segData.point, segData.handleIn, segData.handleOut));
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.logTagged(logs.redoVertex({ coords: this.formatCoords(addedSeg.point) }));
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
    const lastSeg = this.utils.activePath?.lastSegment;

    if (this.handleCtrl.isSettingHandle && lastSeg) {
      const pt = this.utils.resolveConstrainedPoint(event.point, {
        fromPoint: lastSeg.point,
        isShift,
        excludeEntity: this.utils.activePath
      });
      this.utils.consoleManager?.logStepInput?.(this.formatCoords(pt));
      this.handleCtrl.commitTarget(lastSeg, pt);
      this._announceStep();
      this._refreshPreviewFromMouse();
      return;
    }

    this.handleCtrl.resetDragFlag();
    const pt = this._resolveNextPoint(event.point, isShift);
    this._addVertex(pt, { logInput: true });
  }

  onMouseDrag(event) {
    const lastSeg = this.utils.activePath?.lastSegment;
    if (this.handleCtrl.isSettingHandle || !lastSeg) return;
    const isShift = Boolean(event.event?.shiftKey);
    const dragPt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint: lastSeg.point,
      isShift,
      excludeEntity: this.utils.activePath
    });

    this.utils.hud.clear();
    this.utils.hud.updateHUD(dragPt);
    this.handleCtrl.onDragSegment(lastSeg, dragPt);
  }

  onMouseMove(event) {
    if (event.point) {
      this.lastCursorPoint = event.point.clone();
      this.utils.lastMousePoint = event.point.clone();
    }
    this._refreshPreviewFromMouse(Boolean(event.event?.shiftKey));
  }

  onMouseUp() {
    if (this.handleCtrl.finishDrag(this.utils.activePath?.lastSegment)) {
      this._refreshPreviewFromMouse();
    }
  }

  clearPreviews() {
    this.handleCtrl.clearPreview();
    if (this.previewLine) {
      this.previewLine.remove();
      this.previewLine = null;
    }
  }

  _finishActivePath({ closed = false } = {}) {
    this.handleCtrl.reset();
    this.clearPreviews();
    this.redoSegments = [];
    const { logs } = CAD_CATALOG.tools.bezier;
    const path = this.utils.activePath;
    this.utils.activePath = null;

    if (path && path.segments && path.segments.length >= 2 && path.length >= 0.001) {
      if (closed) path.closed = true;
      this.commitNewEntity(path, 'Curva');
      this.logTagged(logs.created({
        name: path.name || 'Curva',
        vertexCount: path.segments.length,
        totalLength: path.length.toFixed(2),
        closed
      }));
    } else {
      if (path) path.remove();
      this.logTagged(logs.discarded);
    }

    this.utils.hud.clear();
    this.paper.view.update();
    this.exitToSelect();
  }

  onConfirmDefault() {
    if (this.handleCtrl.isSettingHandle) {
      this.handleCtrl.exit(this.utils.activePath?.lastSegment);
      this._announceStep();
      this._refreshPreviewFromMouse();
      return;
    }
    if ((this.utils.activePath?.segments?.length || 0) >= 2) {
      this._finishActivePath();
      return;
    }
    if (!this.utils.activePath) {
      this.exitToSelect();
    }
  }

  onCommandInput(rawInput) {
    const { logs } = CAD_CATALOG.tools.bezier;
    const lastSeg = this.utils.activePath?.lastSegment || null;
    const fromPoint = lastSeg ? lastSeg.point : null;
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
        if (parsed.key === 'M' && this.handleCtrl.enter(lastSeg)) {
          this._announceStep();
          this._refreshPreviewFromMouse();
        } else if (parsed.key === 'A') {
          this.handleCtrl.toggleAsymmetric();
          this._announceStep();
          this._refreshPreviewFromMouse();
        } else if (parsed.key === 'D') this.onUndo();
        else if (parsed.key === 'C') this._finishActivePath({ closed: true });
        else if (parsed.key === 'T') this._finishActivePath();
        return true;

      case 'POINT':
        if (this.handleCtrl.isSettingHandle) {
          this.handleCtrl.commitTarget(lastSeg, parsed.point);
          this._announceStep();
          this._refreshPreviewFromMouse();
        } else {
          this._addVertex(parsed.point);
        }
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
        const targetPt = fromPoint.add(dir.normalize(parsed.value));
        if (this.handleCtrl.isSettingHandle) {
          this.handleCtrl.commitTarget(lastSeg, targetPt);
          this._announceStep();
          this._refreshPreviewFromMouse();
        } else {
          this._addVertex(targetPt);
        }
        return true;
      }

      case 'ERROR':
        this.logTagged(parsed.message);
        return true;

      default:
        return false;
    }
  }

  resetTool(announce = false) {
    this.handleCtrl.reset();
    this.clearPreviews();
    this.redoSegments = [];
    this.utils.hud.clear();
    if (announce) this._announceStep();
    this.paper.view.update();
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    if (key === 'Enter' || key === 'NumpadEnter') {
      if (this.handleCtrl.isSettingHandle) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        this.onConfirmDefault();
        return true;
      }
      if ((this.utils.activePath?.segments?.length || 0) >= 2) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        this._finishActivePath();
        return true;
      }
    }
    return super.onKeyDown(event);
  }

  cancel() {
    this.handleCtrl.reset();
    this.clearPreviews();
    this.redoSegments = [];
    if (this.utils.activePath) {
      this.utils.activePath.remove();
      this.utils.activePath = null;
    }
    this.utils.hud.clear();
  }

  onContextMenu(event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.event?.preventDefault) event.event.preventDefault();

    if (this.handleCtrl.isSettingHandle) {
      this.handleCtrl.exit(this.utils.activePath?.lastSegment, { restoreBackup: true, logCancel: true });
      this._announceStep();
      this._refreshPreviewFromMouse();
      return true;
    }

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