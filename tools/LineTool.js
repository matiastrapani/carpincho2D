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
    this.commandName = 'LÍNEA';
    this.commandAliases = ['LINEA', 'L'];
    this.promptText = 'Punto de inicio:';
    this.startPoint = null;
    this.previewLine = null;
    this.sessionVertices = [];
    this.redoVertices = [];
    this.lastCursorPoint = null;
  }

  _isCursorInsideSuppressedSnap(cursorPt) {
    if (!this._suppressSnapAtPoint || !cursorPt) return false;
    const zoom = this.paper.view?.zoom || 1;
    const snapRadius = 15 / zoom;
    return cursorPt.getDistance(this._suppressSnapAtPoint) <= snapRadius;
  }

  _resolvePointForCursor(cursorPt, isShift = false) {
    if (this._isCursorInsideSuppressedSnap(cursorPt)) {
      this.utils.hud.clear();
      return this.startPoint
        ? this.utils.applyOrthoConstraint(this.startPoint, cursorPt, isShift)
        : cursorPt.clone();
    }
    return this.utils.resolveConstrainedPoint(cursorPt, {
      fromPoint: this.startPoint,
      isShift
    });
  }

  onActivate() {
    this.resetTool(true);
  }

  _getCurrentOptions() {
    if (this.sessionVertices.length === 0) return [];

    const options = [];
    if (this.sessionVertices.length >= 1) {
      options.push({ key: 'D', label: 'Deshacer', active: false });
    }
    if (this.sessionVertices.length >= 2) {
      options.push({ key: 'T', label: 'Terminar', active: false });
    }
    return options;
  }

  _announceStep() {
    const cm = this.utils.consoleManager;
    if (!this.startPoint) {
      this.promptText = 'Punto de inicio:';
      if (cm?.setStepPrompt) {
        cm.setStepPrompt('Punto de inicio');
      } else {
        this.setPrompt('Punto de inicio:');
      }
      return;
    }

    const options = this._getCurrentOptions();
    this.promptText = 'Especifique el siguiente punto:';

    if (cm?.setStepPrompt) {
      cm.setStepPrompt('Especifique el siguiente punto', { options });
    } else {
      this.setPrompt('Especifique el siguiente punto:');
    }
  }

  _formatInputCoords(pt) {
    const x = pt.x.toFixed(2);
    const y = (pt.y === 0 ? 0 : -pt.y).toFixed(2);
    return `${x},${y}`;
  }

  _formatCadCoords(pt) {
    return this._formatInputCoords(pt);
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

    if (this.previewLine && this.previewLine.lastSegment) {
      const vec = this.previewLine.lastSegment.point.subtract(this.startPoint);
      if (vec.length >= 0.001) return vec;
    }

    if (this.utils.lastMousePoint) {
      const constrained = this.utils.resolveConstrainedPoint(this.utils.lastMousePoint, {
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

    if (!this.startPoint) {
      if (logInput) {
        cm?.logStepInput?.(this._formatInputCoords(targetPt));
      }
      this.startPoint = targetPt.clone();
      this.sessionVertices = [targetPt.clone()];
      this.redoVertices = [];
      this._announceStep();
      this._refreshPreviewFromMouse();
      (this.utils.cadUI || window.cadUI)?.updateUndoRedoUI?.();
      return;
    }

    if (this.startPoint.getDistance(targetPt) < 0.001) {
      cm?.logSystem('El punto coincide con el origen actual.');
      return;
    }

    if (logInput) {
      cm?.logStepInput?.(this._formatInputCoords(targetPt));
    }

    const { length, angleDeg } = this._computeMetrics(this.startPoint, targetPt);
    const lineEntity = this.service.createLineEntity(this.startPoint, targetPt, true, 1);

    if (lineEntity) {
      this.commitNewEntity(lineEntity, 'Línea', AddLineCommand);
      const entityLabel = lineEntity.name || 'Línea';
      if (cm?.logResult) {
        cm.logResult(
          `${entityLabel} creada`,
          `Longitud = ${length.toFixed(2)}, Ángulo = ${angleDeg.toFixed(1)}°`
        );
      }
    }

    this.startPoint = targetPt.clone();
    this.sessionVertices.push(targetPt.clone());
    this.redoVertices = [];
    this._announceStep();
    this._refreshPreviewFromMouse();
    (this.utils.cadUI || window.cadUI)?.updateUndoRedoUI?.();
  }

  onUndo() {
    const cm = this.utils.consoleManager;

    if (this.sessionVertices.length === 0) {
      return false;
    }

    // Caso 1: Solo se había ingresado el punto inicial -> volver a pedir el primer punto
    if (this.sessionVertices.length === 1) {
      const removedPt = this.sessionVertices[0];
      this.redoVertices.push(removedPt.clone());
      this.clearPreviews();
      this.startPoint = null;
      this.sessionVertices = [];
      this.utils.hud.clear();
      cm?.logSystem(`Deshacer: Punto inicial ${this._formatInputCoords(removedPt)}`);
      this._announceStep();
      this.paper.view.update();
      (this.utils.cadUI || window.cadUI)?.updateUndoRedoUI?.();
      return true;
    }

    // Caso 2: Hay al menos 1 tramo dibujado -> deshacer el último tramo y retroceder startPoint
    if (!this.service.undo({ silentLog: true })) {
      return false;
    }

    const undonePt = this.sessionVertices.pop();
    if (undonePt) {
      this.redoVertices.push(undonePt.clone());
    }

    const prevPt = this.sessionVertices[this.sessionVertices.length - 1];
    this.startPoint = prevPt.clone();

    cm?.logSystem(`Deshacer: Último tramo. Punto actual: ${this._formatInputCoords(this.startPoint)}`);
    this._announceStep();
    this._refreshPreviewFromMouse();
    (this.utils.cadUI || window.cadUI)?.updateUndoRedoUI?.();
    return true;
  }

  onRedo() {
    const cm = this.utils.consoleManager;

    if (this.redoVertices.length === 0) {
      return false;
    }

    // Caso 1: Restaurar el punto inicial deshecho
    if (!this.startPoint || this.sessionVertices.length === 0) {
      const restoredPt = this.redoVertices.pop();
      this.startPoint = restoredPt.clone();
      this.sessionVertices = [restoredPt.clone()];
      cm?.logSystem(`Rehacer: Punto inicial ${this._formatInputCoords(restoredPt)}`);
      this._announceStep();
      this._refreshPreviewFromMouse();
      (this.utils.cadUI || window.cadUI)?.updateUndoRedoUI?.();
      return true;
    }

    // Caso 2: Restaurar el tramo dibujado
    if (!this.service.redo({ silentLog: true })) {
      return false;
    }

    const restoredPt = this.redoVertices.pop();
    this.sessionVertices.push(restoredPt.clone());
    this.startPoint = restoredPt.clone();
    cm?.logSystem(`Rehacer: Último tramo. Punto actual: ${this._formatInputCoords(this.startPoint)}`);
    this._announceStep();
    this._refreshPreviewFromMouse();
    (this.utils.cadUI || window.cadUI)?.updateUndoRedoUI?.();
    return true;
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) {
      return;
    }

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
    this.utils.consoleManager?.logSystem(CAD_CATALOG.tools.line.logs.finished);
    this.exitToSelect();
  }

  onConfirmDefault() {
    if (this.sessionVertices.length >= 2) {
      this._finishTool();
    }
  }

  onCommandInput(rawInput) {
    const cm = this.utils.consoleManager;
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
          cm?.logSystem('Marque primero el punto de inicio o ingrese coordenadas X,Y.');
          return true;
        }
        if (Number.isNaN(parsed.value) || parsed.value <= 0.001) {
          cm?.logSystem('La distancia debe ser mayor a cero.');
          return true;
        }
        const dir = this._getCursorDirection();
        if (!dir) {
          cm?.logSystem('Mueva el cursor sobre el lienzo para indicar la dirección.');
          return true;
        }
        const targetPt = this.startPoint.add(dir.normalize(parsed.value));
        this._advanceToPoint(targetPt);
        return true;
      }

      case 'ERROR':
        cm?.logSystem(parsed.message);
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
    if (announce) {
      this._announceStep();
    }
    this.paper.view.update();
    (this.utils.cadUI || window.cadUI)?.updateUndoRedoUI?.();
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    if (key === 'Enter' && this.sessionVertices.length >= 2) {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      this._finishTool();
      return true;
    }
    return super.onKeyDown(event);
  }

  onContextMenu(event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.event?.preventDefault) event.event.preventDefault();

    if (this.utils.consoleManager) {
      this.utils.consoleManager.handleCancel();
      return;
    }

    this.cancel();
    this.exitToSelect();
  }

  cancel() {
    if (this.startPoint) {
      this.service.suppressOsnapUntilLeave?.(this.startPoint);
    }
    this.resetTool(false);
  }
}