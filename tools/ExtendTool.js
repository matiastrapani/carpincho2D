/**
 * tools/ExtendTool.js - Extensión paramétrica para líneas y curvas Bézier.
 * Soporta modos 'smooth' (S) y 'line' (L), entrada numérica de distancia por consola
 * y registro en historial mediante ExtendCommand.
 */

import { BaseTool } from './BaseTool.js';
import { ExtendCommand } from '../services/commands/cadCommands.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';

export class ExtendTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    const meta = CAD_CATALOG.tools?.extend;
    this.commandName = 'EXTENDER';
    this.commandAliases = meta?.aliases || ['EXTEND', 'EXT', 'ALARGAR'];
    this.promptText = `${meta?.prompts?.pick || 'Seleccione el extremo a extender'}:`;
    this.extendData = null;
    this.lastCursorPoint = null;
    this.mode = 'smooth'; // 'smooth' | 'line'
    this.cursorMode = 'extend';
  }

  onActivate() {
    this.extendData = null;
    this.lastCursorPoint = null;
    this._announceStep();
  }

  _getCurrentOptions() {
    const optsMeta = CAD_CATALOG.tools.extend.options;
    const modeOpt = this.mode === 'smooth' ? optsMeta.modeSmooth : optsMeta.modeLine;
    return [{ ...modeOpt, active: true }];
  }

  _announceStep() {
    const prompts = CAD_CATALOG.tools.extend.prompts;
    const basePrompt = this.extendData ? prompts.extend : prompts.pick;
    this.setStep(basePrompt, { options: this._getCurrentOptions() });
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
      const extendInfo = this.getExtendInfo(hitEntity.item, event.point);
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

  _applyExtensionDistance(projDist) {
    if (!this.extendData) return;
    const dist = Math.max(0, projDist);
    const {
      isBezier, isSingular, isStart, path, startPt, endPt,
      straightDir, tangentVector, dirVector, tangentSpeed, initialControls
    } = this.extendData;

    this.restorePathToBackup(path, initialControls.segmentsBackup);

    // Si la distancia es 0, restauramos al estado original sin insertar nodos duplicados
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
        // El nuevo tramo inicial es recto: su handleOut y el handleIn del nodo previo deben ser nulos
        path.firstSegment.handleIn = new this.paper.Point(0, 0);
        path.insertSegment(0, new this.paper.Segment(newPt));
      } else {
        // El nuevo tramo final es recto: anulamos handleOut del nodo previo para que sea una línea pura
        path.lastSegment.handleOut = new this.paper.Point(0, 0);
        path.addSegment(new this.paper.Segment(newPt));
      }
    } else {
      const deltaT = dist / (tangentSpeed || 1);
      const k = 1 + deltaT;
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

  onCommandInput(rawInput) {
    const logs = CAD_CATALOG.tools?.extend?.logs;
    const anchorPt = this.extendData
      ? (this.extendData.isStart ? this.extendData.startPt : this.extendData.endPt)
      : null;

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
      this._applyExtensionDistance(parsed.value);
      this.confirm();
      return true;
    }

    return false;
  }

  onConfirmDefault() {
    if (this.extendData) {
      this.confirm();
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
      this.confirm();
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
      this.confirm();
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
      const res = ExtendTool.extenderBezierCubica(
        controls.P0, controls.P1, controls.P2, controls.P3, k
      );

      const segFixed = path.segments[totalSegs - 2];
      const segMoving = path.segments[totalSegs - 1];

      segFixed.point = new p.Point(res.p0.x, res.p0.y);
      segFixed.handleOut = new p.Point(res.p1.x - res.p0.x, res.p1.y - res.p0.y);

      segMoving.point = new p.Point(res.p3.x, res.p3.y);
      segMoving.handleIn = new p.Point(res.p2.x - res.p3.x, res.p2.y - res.p3.y);
    } else {
      const res = ExtendTool.extenderBezierCubica(
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

  static extenderBezierCubica(p0, p1, p2, p3, k) {
    const p0_prime = { x: p0.x, y: p0.y };
    const p1_prime = {
      x: p0.x + k * (p1.x - p0.x),
      y: p0.y + k * (p1.y - p0.y)
    };

    const k2 = k * k;
    const k2_mult = 2 * k;

    const p2_prime = {
      x: p0.x + k2_mult * (p1.x - p0.x) + k2 * (p2.x - 2 * p1.x + p0.x),
      y: p0.y + k2_mult * (p1.y - p0.y) + k2 * (p2.y - 2 * p1.y + p0.y)
    };

    const u = 1 - k;
    const u3 = u * u * u;
    const u2 = u * u;
    const k3 = k2 * k;

    const p3_prime = {
      x: (u3 * p0.x) + (3 * u2 * k * p1.x) + (3 * u * k2 * p2.x) + (k3 * p3.x),
      y: (u3 * p0.y) + (3 * u2 * k * p1.y) + (3 * u * k2 * p2.y) + (k3 * p3.y)
    };

    return { p0: p0_prime, p1: p1_prime, p2: p2_prime, p3: p3_prime };
  }

  getExtendInfo(path, clickPt) {
    if (!path || path.closed || !path.segments || path.segments.length < 2) return null;

    // Depurar nodos finales duplicados de longitud 0 si existieran
    while (path.segments.length > 2 && path.segments[0].point.getDistance(path.segments[1].point) <= 1e-6) {
      path.segments[1].handleIn = path.segments[0].handleIn.clone();
      path.removeSegment(0);
    }
    while (
      path.segments.length > 2 &&
      path.segments[path.segments.length - 1].point.getDistance(path.segments[path.segments.length - 2].point) <= 1e-6
    ) {
      const lastIdx = path.segments.length - 1;
      path.segments[lastIdx - 1].handleOut = path.segments[lastIdx].handleOut.clone();
      path.removeSegment(lastIdx);
    }

    const totalSegs = path.segments.length;
    const startPt = path.segments[0].point.clone();
    const endPt = path.segments[totalSegs - 1].point.clone();

    const nearestLoc = path.getNearestLocation(clickPt);
    const isStart = (nearestLoc && path.length > 0)
      ? nearestLoc.offset < (path.length / 2)
      : startPt.getDistance(clickPt) < endPt.getDistance(clickPt);

    const segFixed = isStart ? path.segments[1] : path.segments[totalSegs - 2];
    const segMoving = isStart ? path.segments[0] : path.segments[totalSegs - 1];
    const hasHandles = !segFixed.handleOut.isZero() || !segMoving.handleIn.isZero();

    const chordVec = segMoving.point.subtract(segFixed.point);
    const dirVector = chordVec.length > 1e-6 ? chordVec.normalize() : new this.paper.Point(1, 0);

    let p0, p1, p2, p3;
    let isBezier = hasHandles;
    let isSingular = false;
    let straightDir = null;
    let tangentVector = null;
    let tangentSpeed = 1;

    if (!isStart) {
      p0 = segFixed.point.clone();
      p1 = p0.add(segFixed.handleOut);
      p3 = segMoving.point.clone();
      p2 = p3.add(segMoving.handleIn);

      // Si ambos tiradores del último tramo son nulos, es un segmento recto puro
      if (segFixed.handleOut.isZero() && segMoving.handleIn.isZero()) {
        isBezier = false;
      } else if (p2.getDistance(p3) < 0.001) {
        isSingular = true;
        const refPt = p1.getDistance(p0) > 0.001 ? p1 : p0;
        const rawDir = p3.subtract(refPt);
        straightDir = rawDir.length > 1e-6 ? rawDir.normalize() : dirVector;
      } else {
        const rawTan = p3.subtract(p2);
        tangentSpeed = 3 * rawTan.length;
        tangentVector = rawTan.normalize();
      }
    } else {
      p0 = segMoving.point.clone();
      p1 = p0.add(segMoving.handleOut);
      p3 = segFixed.point.clone();
      p2 = p3.add(segFixed.handleIn);

      if (segMoving.handleOut.isZero() && segFixed.handleIn.isZero()) {
        isBezier = false;
      } else if (p1.getDistance(p0) < 0.001) {
        isSingular = true;
        const refPt = p2.getDistance(p3) > 0.001 ? p2 : p3;
        const rawDir = p0.subtract(refPt);
        straightDir = rawDir.length > 1e-6 ? rawDir.normalize() : dirVector;
      } else {
        const rawTan = p0.subtract(p1);
        tangentSpeed = 3 * rawTan.length;
        tangentVector = rawTan.normalize();
      }
    }

    return {
      path,
      isStart,
      isBezier,
      isSingular,
      startPt,
      endPt,
      straightDir,
      tangentVector,
      dirVector,
      tangentSpeed,
      initialControls: {
        P0: p0, P1: p1, P2: p2, P3: p3,
        segmentsBackup: path.segments.map(s => ({
          point: s.point.clone(),
          handleIn: s.handleIn.clone(),
          handleOut: s.handleOut.clone()
        }))
      }
    };
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

    const finalSegments = path.segments.map(s => ({
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
      `Alargamiento aplicado en ${path.name || 'entidad'}.`
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