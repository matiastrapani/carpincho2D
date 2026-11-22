/**
 * tools/TangentLineTool.js - Herramienta dedicada para líneas tangentes con origen dinámico
 */

import { BaseTool } from './BaseTool.js';
import { AddLineCommand } from '../services/commands/cadCommands.js';
import { CommandInputParser } from '../services/input/CommandInputParser.js';
import { TangentSolver } from '../services/engines/TangentSolver.js';
import { SnapMarkerRenderer } from '../ui/SnapMarkerRenderer.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';

export class TangentLineTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    const meta = CAD_CATALOG.tools.line_tangent;
    this.commandName = 'LÍNEA TANGENTE';
    this.commandAliases = meta?.aliases || ['LINEATANGENTE', 'LTG'];
    this.promptText = `${meta?.prompts?.pick || 'Seleccione la entidad curva para tangencia inicial'}:`;
    this.step = 'pick'; // 'pick' | 'track'
    this.tangentTracker = null;
    this.previewLine = null;
    this.tangentMarkerGroup = null;
    this.hoveredCurveEntity = null;
    this.lastCursorPoint = null;
  }

  onActivate() {
    if (this.utils.consoleManager) {
      this.utils.consoleManager.lastCommand = this.utils.consoleManager.formatCommandName(
        CAD_CATALOG.tools.line_tangent.displayName
      );
    }
    this.resetTool(true);
  }

  _getCurrentOptions() {
    if (this.step !== 'track') return [];
    const optsMeta = CAD_CATALOG.tools.line_tangent.options;
    return [{ ...optsMeta.changeEntity, active: false }];
  }

  _announceStep() {
    const prompts = CAD_CATALOG.tools.line_tangent.prompts;
    if (this.step === 'track') {
      this.setStep(prompts.end, { options: this._getCurrentOptions() });
      return;
    }
    this.setStep(prompts.pick);
  }

  _computeMetrics(fromPt, toPt) {
    const length = fromPt.getDistance(toPt);
    const dx = toPt.x - fromPt.x;
    const dy = -(toPt.y - fromPt.y);
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;
    return { length, angleDeg };
  }

  _setHoveredCurve(entity) {
    if (this.hoveredCurveEntity === entity) return;
    this.hoveredCurveEntity = entity;
    this.service.hoveredEntity = entity || null;
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
  }

  _syncTangentMarker(point) {
    if (!point) {
      if (this.tangentMarkerGroup) {
        this.tangentMarkerGroup.remove();
        this.tangentMarkerGroup = null;
      }
      return;
    }

    const hudLayer = this.getHudLayer();
    const drawLayer = this.utils?.drawLayer || this.paper.project?.layers?.['drawLayer'];

    hudLayer.activate();
    if (!this.tangentMarkerGroup) {
      this.tangentMarkerGroup = new this.paper.Group({
        name: 'tangentStartMarkerGroup',
        guide: true,
        data: { isAuxiliary: true }
      });
    } else {
      this.tangentMarkerGroup.removeChildren();
    }

    if (this.tangentMarkerGroup.parent !== hudLayer) {
      hudLayer.addChild(this.tangentMarkerGroup);
    }

    SnapMarkerRenderer.render(this.tangentMarkerGroup, point, 'tangent', this.paper.view.zoom || 1);
    this.tangentMarkerGroup.bringToFront();
    hudLayer.bringToFront();
    if (drawLayer) drawLayer.activate();
  }

  _hidePreviewLine() {
    if (this.previewLine) {
      this.previewLine.remove();
      this.previewLine = null;
    }
    this.utils.hud.updateFeedbackLabels(null, null);
  }

  _resolveTangentPair(rawPt, isShift = false) {
    const tracker = this.tangentTracker;
    if (!tracker || !rawPt) return null;

    const snapOpts = (fromPt) => ({
      fromPoint: fromPt,
      isShift,
      excludeEntity: tracker.entity,
      ignoreEntities: [tracker.entity]
    });

    let endPt = rawPt;
    let startPt = tracker.lastPoint;

    for (let i = 0; i < 3; i++) {
      endPt = this.utils.resolveConstrainedPoint(rawPt, snapOpts(startPt));
      const solvedStart = TangentSolver.solveStep(tracker, endPt);
      if (!solvedStart) {
        return {
          valid: false,
          startPt: tracker.lastPoint.clone(),
          endPt
        };
      }
      startPt = solvedStart;
    }

    return { valid: true, startPt, endPt };
  }

  _refreshPreviewFromMouse() {
    const cursorPt = this.utils?.lastMousePoint || this.lastCursorPoint;

    if (this.step === 'pick') {
      this.utils.hud.clear();
      this._hidePreviewLine();
      if (cursorPt) {
        const tol = 14 / (this.paper.view?.zoom || 1);
        const hit = TangentSolver.pickCurvedTargetAt(this.service, cursorPt, tol, this.utils.layerManager);
        this._setHoveredCurve(hit?.entity || null);
        this._syncTangentMarker(hit?.point || null);
        this.utils.hud.updateHUD(hit?.point || cursorPt);
      } else {
        this._setHoveredCurve(null);
        this._syncTangentMarker(null);
      }
      this.paper.view.update();
      return;
    }

    if (this.step === 'track' && this.tangentTracker && cursorPt) {
      this.utils.hud.clear();
      const pair = this._resolveTangentPair(cursorPt, Boolean(this.utils.isShiftPressed));
      if (pair) {
        this.utils.hud.updateHUD(pair.endPt);
        this._syncTangentMarker(pair.startPt);
        if (pair.valid) {
          this.previewLine = this.syncLineGuide(this.previewLine, pair.startPt, pair.endPt);
          this.utils.hud.updateFeedbackLabels(pair.startPt, pair.endPt);
        } else {
          this._hidePreviewLine();
        }
      }
      this.paper.view.update();
      return;
    }

    this.clearPreviews();
    this.utils.hud.clear();
    this.paper.view.update();
  }

  _getCursorDirection() {
    const origin = this.tangentTracker?.lastPoint;
    if (!origin) return null;

    if (this.previewLine?.lastSegment) {
      const vec = this.previewLine.lastSegment.point.subtract(origin);
      if (vec.length >= 0.001) return vec;
    }

    const cursorPt = this.utils?.lastMousePoint || this.lastCursorPoint;
    if (cursorPt) {
      const constrained = this.utils.resolveConstrainedPoint(cursorPt, {
        fromPoint: origin,
        isShift: Boolean(this.utils.isShiftPressed),
        excludeEntity: this.tangentTracker.entity,
        ignoreEntities: [this.tangentTracker.entity]
      });
      const vec = constrained.subtract(origin);
      if (vec.length >= 0.001) return vec;
    }

    return null;
  }

  _consolidateLine(startPt, endPt, { logInput = false } = {}) {
    const cm = this.utils.consoleManager;
    const logs = CAD_CATALOG.tools.line_tangent.logs;

    if (!startPt || !endPt || startPt.getDistance(endPt) < 0.001) {
      this.logTagged(logs.samePoint);
      return;
    }

    const p1 = new this.paper.Point(startPt.x, startPt.y);
    const p2 = new this.paper.Point(endPt.x, endPt.y);

    if (logInput) cm?.logStepInput?.(this.formatCoords(p2));

    const { length, angleDeg } = this._computeMetrics(p1, p2);
    const lineEntity = this.service.createLineEntity(p1, p2, true, 1);

    if (lineEntity) {
      this.commitNewEntity(lineEntity, 'Línea', AddLineCommand);
      this.logTagged(logs.created({
        name: lineEntity.name || 'Línea',
        startCoords: this.formatCoords(p1),
        length: length.toFixed(2),
        angle: angleDeg.toFixed(1)
      }));
    }

    this.service.suppressOsnapUntilLeave?.(p2);
    this.exitToSelect();
  }

  onUndo() {
    if (this.step !== 'track') return false;
    this.logTagged(CAD_CATALOG.tools.line_tangent.logs.undoPick);
    this.resetTool(true);
    return true;
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) return;

    if (event.point) {
      this.lastCursorPoint = event.point.clone();
      this.utils.lastMousePoint = event.point.clone();
    }

    const isShift = event.event ? Boolean(event.event.shiftKey) : false;

    if (this.step === 'pick') {
      const tol = 14 / (this.paper.view?.zoom || 1);
      const hit = TangentSolver.pickCurvedTargetAt(this.service, event.point, tol, this.utils.layerManager);
      if (!hit) {
        this.logTagged(CAD_CATALOG.tools.line_tangent.logs.invalidTarget);
        return;
      }

      this._setHoveredCurve(null);
      this.tangentTracker = TangentSolver.createTrackerFromHit(hit);
      this.step = 'track';
      this.logTagged(CAD_CATALOG.tools.line_tangent.logs.picked({ name: hit.entity.name || 'Curva' }));
      this._announceStep();
      this._refreshPreviewFromMouse();
      this.refreshUndoRedoUI();
      return;
    }

    const pair = this._resolveTangentPair(event.point, isShift);
    if (!pair || !pair.valid) {
      this.logTagged(CAD_CATALOG.tools.line_tangent.logs.noTangent);
      return;
    }

    this._consolidateLine(pair.startPt, pair.endPt, { logInput: true });
  }

  onMouseMove(event) {
    if (event.point) {
      this.lastCursorPoint = event.point.clone();
      this.utils.lastMousePoint = event.point.clone();
    }

    this.utils.hud.clear();
    const isShift = event.event ? Boolean(event.event.shiftKey) : false;

    if (this.step === 'pick') {
      const tol = 14 / (this.paper.view?.zoom || 1);
      const hit = TangentSolver.pickCurvedTargetAt(this.service, event.point, tol, this.utils.layerManager);
      this._setHoveredCurve(hit?.entity || null);
      this._syncTangentMarker(hit?.point || null);
      this.utils.hud.updateHUD(hit?.point || event.point);
      return;
    }

    const pair = this._resolveTangentPair(event.point, isShift);
    if (pair) {
      this.utils.hud.updateHUD(pair.endPt);
      this._syncTangentMarker(pair.startPt);
      if (pair.valid) {
        this.previewLine = this.syncLineGuide(this.previewLine, pair.startPt, pair.endPt);
        this.utils.hud.updateFeedbackLabels(pair.startPt, pair.endPt);
      } else {
        this._hidePreviewLine();
      }
    }
  }

  onCommandInput(rawInput) {
    const logs = CAD_CATALOG.tools.line_tangent.logs;
    const refPoint = this.tangentTracker?.lastPoint || null;
    const parsed = CommandInputParser.parse(rawInput, {
      options: this._getCurrentOptions(),
      referencePoint: refPoint,
      paper: this.paper
    });

    switch (parsed.type) {
      case 'OPTION':
        if (parsed.key === 'E' && this.step === 'track') {
          this.resetTool(true);
        }
        return true;

      case 'POINT': {
        if (this.step !== 'track' || !this.tangentTracker) {
          this.logTagged(logs.needTarget);
          return true;
        }
        const startPt = TangentSolver.solveStep(this.tangentTracker, parsed.point);
        if (!startPt) {
          this.logTagged(logs.noTangent);
          return true;
        }
        this._consolidateLine(startPt, parsed.point);
        return true;
      }

      case 'NUMBER': {
        if (this.step !== 'track' || !refPoint) {
          this.logTagged(logs.needTarget);
          return true;
        }
        if (Number.isNaN(parsed.value) || parsed.value <= 0.001) {
          this.logTagged(logs.invalidDistance);
          return true;
        }
        if (!this.previewLine) {
          this.logTagged(logs.noTangent);
          return true;
        }
        const dir = this._getCursorDirection();
        if (!dir) {
          this.logTagged(logs.needDirection);
          return true;
        }
        const endPt = refPoint.add(dir.normalize(parsed.value));
        this._consolidateLine(refPoint, endPt);
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
    this._hidePreviewLine();
    this._syncTangentMarker(null);
    this._setHoveredCurve(null);
  }

  resetTool(announce = false) {
    this.clearPreviews();
    this.step = 'pick';
    this.tangentTracker = null;
    this.lastCursorPoint = null;
    this.utils.hud.clear();
    if (announce) this._announceStep();
    this.paper.view.update();
    this.refreshUndoRedoUI();
  }

  onContextMenu(event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.event?.preventDefault) event.event.preventDefault();

    if (this.utils.consoleManager) {
      this.utils.consoleManager.handleCancel();
      return true;
    }

    this.cancel();
    this.exitToSelect();
    return true;
  }

  cancel() {
    this.resetTool(false);
  }
}