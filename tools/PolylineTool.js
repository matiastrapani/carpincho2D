/**
 * tools/PolylineTool.js - Herramienta para dibujado de Polilíneas continuas
 */

import { BaseTool } from './BaseTool.js';
import { CommandInputParser } from '../services/input/CommandInputParser.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';

export class PolylineTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    const meta = CAD_CATALOG.tools.polyline;
    this.commandName = 'POLILÍNEA';
    this.commandAliases = meta?.aliases || ['POLILINEA', 'PL'];
    this.promptText = `${meta?.prompts?.start || 'Punto de inicio'}:`;
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

    const optsMeta = CAD_CATALOG.tools.polyline?.options || {
      undo: { key: 'D', label: 'Deshacer' },
      close: { key: 'C', label: 'Cerrar' },
      finish: { key: 'T', label: 'Terminar' }
    };

    const options = [{ ...optsMeta.undo, active: false }];
    if (segCount >= 3) {
      options.push({ ...optsMeta.close, active: false });
    }
    if (segCount >= 2) {
      options.push({ ...optsMeta.finish, active: false });
    }
    return options;
  }

  _announceStep() {
    const prompts = CAD_CATALOG.tools.polyline?.prompts || {
      start: 'Punto de inicio',
      next: 'Especifique el siguiente punto'
    };
    const segCount = this.utils.activePath?.segments?.length || 0;
    if (segCount === 0) {
      this.setStep(prompts.start);
      return;
    }
    this.setStep(prompts.next, { options: this._getCurrentOptions() });
  }

  _refreshPreviewFromMouse() {
    const path = this.utils.activePath;
    const cursorPt = this.utils?.lastMousePoint || this.lastCursorPoint;

    if (path && path.segments.length > 0 && cursorPt) {
      const lastPt = path.lastSegment.point;
      this.utils.hud.clear();
      const pt = this.utils.resolveConstrainedPoint(cursorPt, {
        fromPoint: lastPt,
        isShift: Boolean(this.utils.isShiftPressed),
        excludeEntity: path
      });
      this.utils.hud.updateHUD(pt);
      this.previewLine = this.syncLineGuide(this.previewLine, lastPt, pt);
      this.utils.hud.updateFeedbackLabels(lastPt, pt);
      this.paper.view.update();
      return;
    }

    this.clearPreviews();
    this.utils.hud.clear();
    this.paper.view.update();
  }

  _getCursorDirection() {
    const path = this.utils.activePath;
    if (!path || !path.lastSegment) return null;
    const lastPt = path.lastSegment.point;

    if (this.previewLine?.lastSegment) {
      const vec = this.previewLine.lastSegment.point.subtract(lastPt);
      if (vec.length >= 0.001) return vec;
    }

    const cursorPt = this.utils?.lastMousePoint || this.lastCursorPoint;
    if (cursorPt) {
      const constrained = this.utils.resolveConstrainedPoint(cursorPt, {
        fromPoint: lastPt,
        isShift: Boolean(this.utils.isShiftPressed),
        excludeEntity: path
      });
      const vec = constrained.subtract(lastPt);
      if (vec.length >= 0.001) return vec;
    }

    return null;
  }

  _addVertex(pt, { logInput = false } = {}) {
    const cm = this.utils.consoleManager;
    const path = this.utils.activePath;
    const logs = CAD_CATALOG.tools.polyline?.logs;

    if (!path) {
      if (logInput) cm?.logStepInput?.(this.formatCoords(pt));
      this._beginActivePath(pt, null);
      this.redoVertices = [];
      this._announceStep();
      this._refreshPreviewFromMouse();
      this.refreshUndoRedoUI();
      return;
    }

    const firstPt = path.firstSegment.point;
    const snapTolerance = 10 / (this.paper.view.zoom || 1);

    if (path.segments.length >= 3 && pt.getDistance(firstPt) < snapTolerance) {
      if (logInput) cm?.logStepInput?.('Cerrar');
      this._finishActivePath({ closed: true });
      return;
    }

    const lastPt = path.lastSegment?.point;
    if (lastPt && lastPt.getDistance(pt) < 0.001) {
      this.logTagged(logs?.samePoint || 'El punto coincide con el vértice anterior.');
      return;
    }

    if (logInput) cm?.logStepInput?.(this.formatCoords(pt));
    path.add(pt);
    this.redoVertices = [];
    this.utils.selectionRenderEngine.updateEntitiesStroke();
    this._announceStep();
    this._refreshPreviewFromMouse();
    this.refreshUndoRedoUI();
  }

  onUndo() {
    const path = this.utils.activePath;
    if (!path || !path.segments || path.segments.length === 0) {
      return false;
    }

    const logs = CAD_CATALOG.tools.polyline?.logs;

    if (path.segments.length === 1) {
      const removedPt = path.firstSegment.point.clone();
      this.redoVertices.push(removedPt.clone());
      path.remove();
      this.utils.activePath = null;
      this.clearPreviews();
      this.utils.hud.clear();
      this.logTagged(
        logs?.undoStart
          ? logs.undoStart({ coords: this.formatCoords(removedPt) })
          : `Deshacer: Punto inicial ${this.formatCoords(removedPt)}`
      );
      this._announceStep();
      this.paper.view.update();
      this.refreshUndoRedoUI();
      return true;
    }

    const undonePt = path.lastSegment.point.clone();
    this.redoVertices.push(undonePt);
    path.removeSegment(path.segments.length - 1);

    const currentPt = path.lastSegment.point;
    this.utils.selectionRenderEngine.updateEntitiesStroke();
    this.logTagged(
      logs?.undoVertex
        ? logs.undoVertex({ coords: this.formatCoords(currentPt) })
        : `Deshacer: Último vértice. Punto actual: ${this.formatCoords(currentPt)}`
    );
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

    const logs = CAD_CATALOG.tools.polyline?.logs;
    const restoredPt = this.redoVertices.pop();
    const path = this.utils.activePath;

    if (!path || !path.segments || path.segments.length === 0) {
      this._beginActivePath(restoredPt, null);
      this.logTagged(
        logs?.redoStart
          ? logs.redoStart({ coords: this.formatCoords(restoredPt) })
          : `Rehacer: Punto inicial ${this.formatCoords(restoredPt)}`
      );
      this._announceStep();
      this._refreshPreviewFromMouse();
      this.refreshUndoRedoUI();
      return true;
    }

    path.add(restoredPt);
    this.utils.selectionRenderEngine.updateEntitiesStroke();
    this.logTagged(
      logs?.redoVertex
        ? logs.redoVertex({ coords: this.formatCoords(restoredPt) })
        : `Rehacer: Último vértice. Punto actual: ${this.formatCoords(restoredPt)}`
    );
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
    const fromPoint = this.utils.activePath?.lastSegment?.point || null;

    const pt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint,
      isShift,
      excludeEntity: this.utils.activePath
    });

    this._addVertex(pt, { logInput: true });
  }

  onMouseMove(event) {
    if (event.point) {
      this.lastCursorPoint = event.point.clone();
      this.utils.lastMousePoint = event.point.clone();
    }

    this.utils.hud.clear();
    const isShift = event.event ? Boolean(event.event.shiftKey) : false;
    const fromPoint = this.utils.activePath?.lastSegment?.point || null;

    const pt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint,
      isShift,
      excludeEntity: this.utils.activePath
    });

    this.utils.hud.updateHUD(pt);

    if (fromPoint) {
      this.previewLine = this.syncLineGuide(this.previewLine, fromPoint, pt);
      this.utils.hud.updateFeedbackLabels(fromPoint, pt);
    }
  }

  onConfirmDefault() {
    if ((this.utils.activePath?.segments?.length || 0) >= 2) {
      this._finishActivePath();
    }
  }

  onCommandInput(rawInput) {
    const logs = CAD_CATALOG.tools.polyline?.logs;
    const { handled, parsed } = this._parsePointInput(rawInput, {
      options: this._getCurrentOptions(),
      referencePoint: this.utils.activePath?.lastSegment?.point || null,
      direction: () => this._getCursorDirection(),
      logs: {
        needStart: logs?.needStart || 'Marque primero el punto de inicio o ingrese coordenadas X,Y.',
        invalidDistance: logs?.invalidDistance || 'La distancia debe ser mayor a cero.',
        needDirection: logs?.needDirection || 'Mueva el cursor sobre el lienzo para indicar la dirección.'
      }
    });
    if (handled) return true;

    if (parsed.type === 'OPTION') {
      if (parsed.key === 'D') this.onUndo();
      else if (parsed.key === 'C') this._finishActivePath({ closed: true });
      else if (parsed.key === 'T') this._finishActivePath();
      return true;
    }

    if (parsed.type === 'POINT') {
      this._addVertex(parsed.point);
      return true;
    }

    return false;
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
    const logs = CAD_CATALOG.tools.polyline?.logs;
    const path = this.utils.activePath;
    this.utils.activePath = null;

    if (path && path.segments && path.segments.length >= 2 && path.length >= 0.001) {
      if (closed) path.closed = true;
      this.commitNewEntity(path, 'Polilínea');
      const name = path.name || 'Polilínea';
      const vertexCount = path.segments.length;
      const totalLength = path.length.toFixed(2);
      this.logTagged(
        logs?.created
          ? logs.created({ name, vertexCount, totalLength, closed })
          : `${name} creada${closed ? ' (cerrada)' : ''}: Vértices = ${vertexCount}, Longitud = ${totalLength}`
      );
    } else {
      if (path) path.remove();
      this.logTagged(logs?.discarded || 'Trazado de polilínea descartado.');
    }

    this.utils.hud.clear();
    this.paper.view.update();
    this.exitToSelect();
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    if (key === 'Enter' && (this.utils.activePath?.segments?.length || 0) >= 2) {
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

    if ((this.utils.activePath?.segments?.length || 0) >= 2) {
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