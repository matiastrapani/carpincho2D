/**
 * tools/ExtendTool.js - Extensión paramétrica para líneas y curvas Bézier.
 * Soporta modos 'smooth' (M) y 'line' (M), entrada numérica de distancia por consola
 * con memoria de valor por defecto y registro en historial mediante ExtendCommand.
 */

import { BaseTool } from './BaseTool.js';
import { ExtendCommand } from '../services/commands/cadCommands.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';
import {
  extrapolateCubicBezier,
  solveBezierFactorForArcLength,
  computeExtendInfo
} from '../services/engines/ExtendMath.js';

export class ExtendTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    const meta = CAD_CATALOG.tools?.extend;
    this.commandName = 'EXTENDER';
    this.commandAliases = meta?.aliases || ['EXTEND', 'EXT', 'ALARGAR'];
    this.promptText = `${meta?.prompts?.pick || 'Seleccione el extremo a extender'}:`;
    this.extendData = null;
    this.lastCursorPoint = null;
    this.lastExtendDistance = null;
    this.mode = 'smooth';
    this.cursorMode = 'extend';
  }

  onActivate() {
    this.extendData = null;
    this.lastCursorPoint = null;
    this._announceStep();
  }

  _formatDefaultDistance() {
    if (!(this.lastExtendDistance > 0)) return null;
    return String(Number(this.lastExtendDistance.toFixed(4)));
  }

  _getCurrentOptions() {
    const optsMeta = CAD_CATALOG.tools.extend.options;
    const modeOpt = this.mode === 'smooth' ? optsMeta.modeSmooth : optsMeta.modeLine;
    return [{ ...modeOpt, active: true }];
  }

  _announceStep() {
    const prompts = CAD_CATALOG.tools.extend.prompts;
    const basePrompt = this.extendData ? prompts.extend : prompts.pick;
    const stepOpts = { options: this._getCurrentOptions() };
    if (this.extendData) {
      stepOpts.defaultValue = this._formatDefaultDistance();
    }
    this.setStep(basePrompt, stepOpts);
  }

  toggleMode() {
    this.setMode(this.mode === 'smooth' ? 'line' : 'smooth');
  }

  setMode(newMode) {
    if (newMode !== 'smooth' && newMode !== 'line') return;
    if (this.mode === newMode) return;
    this.mode = newMode;
    const modeLabel = this.mode === 'smooth' ? 'Suave' : 'Lineal';
    this.logTagged(CAD_CATALOG.tools.extend.logs.modeChanged({ modeLabel }));
    this._announceStep();

    if (this.extendData && this.lastCursorPoint) {
      this._previewExtendTo(this.lastCursorPoint);
    }
  }

  _isEntityEditable(item) {
    if (!item || !this.service.entities.includes(item) || item.closed) return false;
    if (item.data?.isCircleEntity || item.data?.isPointEntity) return false;
    if (this.utils.layerManager?.isEntityInteractive) {
      return this.utils.layerManager.isEntityInteractive(item);
    }
    const layerId = String(item.data?.layerId || '0');
    const layer = this.utils.layerManager?.layers?.get(layerId);
    return !(layer && (layer.locked || layer.visible === false));
  }

  onMouseDown(event) {
    if (event?.event && event.event.button !== 0) return;

    if (event?.point) {
      this.lastCursorPoint = event.point.clone();
      this.utils.lastMousePoint = event.point.clone();
    }

    if (this.extendData) {
      this.confirm();
      return;
    }

    const p = this.paper;
    const hitEntity = p.project.hitTest(event.point, {
      stroke: true,
      fill: true,
      tolerance: 12 / (p.view.zoom || 1),
      match: (res) => this._isEntityEditable(res.item)
    });

    if (hitEntity?.item) {
      const extendInfo = computeExtendInfo(p, hitEntity.item, event.point);
      if (extendInfo) {
        this.extendData = extendInfo;
        this.service.selectEntity(hitEntity.item, false);
        this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
        this._announceStep();
        p.view.update();
      }
    }
  }

  _getActiveDirection() {
    if (!this.extendData) return null;
    const { isBezier, isSingular, straightDir, tangentVector, dirVector } = this.extendData;
    if (!isBezier) return dirVector;
    if (this.mode === 'line' || isSingular) {
      return isSingular ? straightDir : tangentVector;
    }
    return tangentVector;
  }

  _applyExtensionDistance(projDist, { exactArcLength = false } = {}) {
    if (!this.extendData) return;
    const dist = Math.max(0, projDist);
    const {
      isBezier, isSingular, isStart, path, startPt, endPt,
      straightDir, tangentVector, dirVector, tangentSpeed, initialControls
    } = this.extendData;

    this.restorePathToBackup(path, initialControls.segmentsBackup);

    if (dist <= 1e-6) {
      this.utils.selectionRenderEngine?.renderBezierHandles?.();
      this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
      return;
    }

    if (!isBezier) {
      if (isStart) {
        path.firstSegment.point = startPt.add(dirVector.multiply(dist));
      } else {
        path.lastSegment.point = endPt.add(dirVector.multiply(dist));
      }
    } else if (this.mode === 'line' || isSingular) {
      const vectorToUse = isSingular ? straightDir : tangentVector;
      const newPt = (isStart ? startPt : endPt).add(vectorToUse.multiply(dist));

      if (isStart) {
        path.firstSegment.handleIn = new this.paper.Point(0, 0);
        path.insertSegment(0, new this.paper.Segment(newPt));
      } else {
        path.lastSegment.handleOut = new this.paper.Point(0, 0);
        path.addSegment(new this.paper.Segment(newPt));
      }
    } else {
      const k = exactArcLength
        ? solveBezierFactorForArcLength(this.paper, initialControls, isStart, dist)
        : 1 + (dist / (tangentSpeed || 1));
      this.applyBezierExtension(path, isStart, k, initialControls);
    }

    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
  }

  _previewExtendTo(rawPoint) {
    if (!this.extendData || !rawPoint) return;

    const { isStart, startPt, endPt } = this.extendData;
    const anchorPt = isStart ? startPt : endPt;
    const dir = this._getActiveDirection();
    if (!dir) return;

    const mouseVec = rawPoint.subtract(anchorPt);
    const projDist = Math.max(0, mouseVec.dot(dir));
    this._applyExtensionDistance(projDist);

    const tipPt = anchorPt.add(dir.multiply(projDist));
    this.utils.hud.clear();
    this.utils.hud.updateHUD(tipPt);
    this.utils.hud.updateFeedbackLabels(anchorPt, tipPt);
    this.paper.view.update();
  }

  onMouseMove(event) {
    if (!event?.point) return;
    this.lastCursorPoint = event.point.clone();
    this.utils.lastMousePoint = event.point.clone();

    if (!this.extendData) {
      this.utils.hud.clear();
      this.utils.hud.updateHUD(event.point);
      return;
    }

    this._previewExtendTo(event.point);
  }

  _applyDefaultOrConfirm() {
    if (!this.extendData) return;

    const { isStart, startPt, endPt, path } = this.extendData;
    const anchorBefore = isStart ? startPt : endPt;
    const anchorAfter = isStart ? path.firstSegment.point : path.lastSegment.point;

    if (anchorBefore.getDistance(anchorAfter) <= 1e-6 && this.lastExtendDistance > 0) {
      this.utils.consoleManager?.logStepInput?.(this._formatDefaultDistance());
      this._applyExtensionDistance(this.lastExtendDistance, { exactArcLength: true });
    }
    this.confirm();
  }

  onCommandInput(rawInput) {
    const logs = CAD_CATALOG.tools?.extend?.logs;
    const anchorPt = this.extendData
      ? (this.extendData.isStart ? this.extendData.startPt : this.extendData.endPt)
      : null;

    if (this.extendData && !String(rawInput ?? '').trim()) {
      this._applyDefaultOrConfirm();
      return true;
    }

    const { handled, parsed } = this._parsePointInput(rawInput, {
      options: this._getCurrentOptions(),
      referencePoint: anchorPt,
      numberAsDistance: false,
      acceptDefault: Boolean(this.extendData),
      logs
    });
    if (handled) return true;

    if (parsed.type === 'OPTION') {
      if (parsed.key === 'M') this.toggleMode();
      return true;
    }

    if (parsed.type === 'POINT') {
      if (!this.extendData) {
        this.logTagged(logs?.needTarget || 'Seleccione primero el extremo de una entidad abierta.');
        return true;
      }
      this._previewExtendTo(parsed.point);
      this.confirm();
      return true;
    }

    if (parsed.type === 'NUMBER') {
      if (!this.extendData) {
        this.logTagged(logs?.needTarget || 'Seleccione primero el extremo de una entidad abierta.');
        return true;
      }
      if (Number.isNaN(parsed.value) || parsed.value <= 0.001) {
        this.logTagged(logs?.invalidDistance || 'La distancia de extensión debe ser mayor a cero.');
        return true;
      }
      this.lastExtendDistance = parsed.value;
      this._applyExtensionDistance(parsed.value, { exactArcLength: true });
      this.confirm();
      return true;
    }

    return false;
  }

  onConfirmDefault() {
    if (this.extendData) {
      this._applyDefaultOrConfirm();
    }
  }

  onUndo() {
    if (this.extendData) {
      this.cancel();
      return true;
    }
    if (!this.service.undo()) return false;
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.paper.view.update();
    this.refreshUndoRedoUI();
    this._announceStep();
    return true;
  }

  onKeyDown(event) {
    const key = (event.key || '').toLowerCase();

    if (key === 'm') {
      this.toggleMode();
      return true;
    }
    if (key === 'enter' && this.extendData) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this._applyDefaultOrConfirm();
      return true;
    }
    if (key === 'escape') {
      if (this.extendData) {
        this.cancel();
      } else {
        this.exitToSelect();
      }
      return true;
    }
    return false;
  }

  onContextMenu(event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.event?.preventDefault) event.event.preventDefault();

    if (this.extendData) {
      this._applyDefaultOrConfirm();
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

  restorePathToBackup(path, backup) {
    const p = this.paper;
    while (path.segments.length > backup.length) {
      path.removeSegment(path.segments.length - 1);
    }
    while (path.segments.length < backup.length) {
      path.addSegment(new p.Point(0, 0));
    }
    backup.forEach((b, i) => {
      path.segments[i].point = b.point.clone();
      path.segments[i].handleIn = b.handleIn.clone();
      path.segments[i].handleOut = b.handleOut.clone();
    });
  }

  applyBezierExtension(path, isStart, k, controls) {
    const p = this.paper;
    const totalSegs = path.segments.length;

    if (!isStart) {
      const res = extrapolateCubicBezier(
        controls.P0, controls.P1, controls.P2, controls.P3, k
      );

      const segFixed = path.segments[totalSegs - 2];
      const segMoving = path.segments[totalSegs - 1];

      segFixed.point = new p.Point(res.p0.x, res.p0.y);
      segFixed.handleOut = new p.Point(res.p1.x - res.p0.x, res.p1.y - res.p0.y);

      segMoving.point = new p.Point(res.p3.x, res.p3.y);
      segMoving.handleIn = new p.Point(res.p2.x - res.p3.x, res.p2.y - res.p3.y);
    } else {
      const res = extrapolateCubicBezier(
        controls.P3, controls.P2, controls.P1, controls.P0, k
      );

      const segFixed = path.segments[1];
      const segMoving = path.segments[0];

      segFixed.point = new p.Point(res.p0.x, res.p0.y);
      segFixed.handleIn = new p.Point(res.p1.x - res.p0.x, res.p1.y - res.p0.y);

      segMoving.point = new p.Point(res.p3.x, res.p3.y);
      segMoving.handleOut = new p.Point(res.p2.x - res.p3.x, res.p2.y - res.p3.y);
    }
  }

  confirm() {
    if (!this.extendData) return;

    const { path, isStart, startPt, endPt, initialControls } = this.extendData;
    const anchorBefore = isStart ? startPt : endPt;
    const anchorAfter = isStart ? path.firstSegment.point : path.lastSegment.point;

    if (anchorBefore.getDistance(anchorAfter) <= 1e-6) {
      this.cancel();
      return;
    }

    const finalSegments = path.segments.map((s) => ({
      point: s.point.clone(),
      handleIn: s.handleIn.clone(),
      handleOut: s.handleOut.clone()
    }));

    const extendCmd = new ExtendCommand(this.service, path, initialControls.segmentsBackup, finalSegments);
    this.service.executeCommand(extendCmd);

    this.extendData = null;
    this.lastCursorPoint = null;
    this.service.deselectAllEntities();
    this.utils.hud.clear();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.paper.view.update();
    this.refreshUndoRedoUI();

    this.logTagged(
      CAD_CATALOG.tools?.extend?.logs?.created?.({ name: path.name || 'Entidad' }) ||
      `Extensión aplicada en ${path.name || 'entidad'}.`
    );
    this._announceStep();
  }

  cancel() {
    if (!this.extendData) return;
    const { path, initialControls } = this.extendData;

    this.restorePathToBackup(path, initialControls.segmentsBackup);
    this.extendData = null;
    this.lastCursorPoint = null;
    this.service.deselectAllEntities();
    this.utils.hud.clear();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.paper.view.update();

    this.logTagged(CAD_CATALOG.tools?.extend?.logs?.cancelled || 'Extensión cancelada.');
    this._announceStep();
  }

  cleanup() {
    this.cancel();
    super.cleanup();
  }
}