/**
 * tools/MoveTool.js - Herramienta Mover con selección previa o interactiva y punto base explícito
 */

import { BaseTool } from './BaseTool.js';
import { MixedDragSession } from './select/MixedDragSession.js';
import { CommandSelectionHandler } from './select/CommandSelectionHandler.js';
import { CommandInputParser } from '../services/input/CommandInputParser.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';

export class MoveTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    if (!cadService || !cadUtils) {
      throw new Error('MoveTool requiere instancias válidas de cadService y cadUtils.');
    }

    const meta = CAD_CATALOG.tools.move;
    this.commandName = 'MOVER';
    this.commandAliases = meta.aliases;
    this.promptText = `${meta.prompts.select}:`;

    this.preservesSelection = 'all';
    this.preservesEditMode = true;
    this.clearsHudOnActivate = true;
    this.highlightGripsOnSelect = true;

    this.session = new MixedDragSession(cadService, cadUtils);
    this.selectionPhase = new CommandSelectionHandler(cadService, cadUtils, {
      commandLabel: 'Mover',
      setPrompt: (text) => this._setStepFromSelectionPrompt(text),
      onRefresh: () => this._refreshView()
    });
    this.phase = 'SELECT_OBJECTS';
    this.basePoint = null;
    this.lastCursorPoint = null;
  }

  getCursorMode() {
    return this.phase === 'SELECT_OBJECTS' ? 'select' : 'draw';
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  _setStepFromSelectionPrompt(rawText) {
    const clean = String(rawText || '')
      .replace(/^Mover\s*[—:-]\s*/i, '')
      .replace(/:\s*$/, '')
      .trim();
    this.setStep(clean || CAD_CATALOG.tools.move.prompts.select, {
      options: this._getCurrentOptions()
    });
  }

  _getCurrentOptions() {
    const cancelOpt = CAD_CATALOG.tools.move?.options?.cancel || { key: 'C', label: 'Cancelar' };
    return [{ ...cancelOpt, active: false }];
  }

  _announceStep() {
    const { prompts } = CAD_CATALOG.tools.move;
    const options = this._getCurrentOptions();
    if (this.phase === 'SELECT_OBJECTS') {
      this.setStep(prompts.select, { options });
      return;
    }
    if (this.phase === 'PICK_BASE_POINT') {
      this.setStep(prompts.basePoint, { options });
      return;
    }
    this.setStep(prompts.destPoint, { options });
  }

  _setCanvasCursorMode(mode) {
    const canvas = this.utils?.canvasElement || document.getElementById('cadCanvas');
    if (canvas) {
      canvas.className = `tool-${mode}`;
    }
  }

  _refreshView() {
    this.utils.selectionRenderEngine.updateEntitiesStroke();
    this.utils.selectionRenderEngine.renderBezierHandles();
    const paperInst = this._getPaper();
    if (paperInst?.view) {
      paperInst.view.update();
    }
  }

  onActivate() {
    this._clearVisualGuides();
    this.selectionPhase.reset();
    this.session.reset();
    this.basePoint = null;
    this.lastCursorPoint = null;

    if (this._hasValidSelection()) {
      this._enterBasePointPhase();
    } else {
      this.phase = 'SELECT_OBJECTS';
      this._setCanvasCursorMode('select');
      this.selectionPhase.refreshSelectionVisuals();
    }
  }

  _getSelectionSummary() {
    const entities = this.service.selectedEntities || [];
    if (entities.length === 1) {
      return entities[0]?.name || entities[0]?.data?.name || '1 entidad';
    }
    if (entities.length > 1) {
      return `${entities.length} entidades`;
    }

    const segments = this.service.selectedSegments || [];
    if (segments.length > 0) {
      return segments.length === 1 ? '1 nodo' : `${segments.length} nodos`;
    }

    const handles = this.service.selectedHandles || [];
    if (handles.length > 0) {
      return handles.length === 1 ? '1 tirador' : `${handles.length} tiradores`;
    }

    return '1 entidad';
  }

  _enterBasePointPhase() {
    this._clearVisualGuides();
    this.selectionPhase.reset();
    this.phase = 'PICK_BASE_POINT';
    this.basePoint = null;
    this._setCanvasCursorMode('draw');
    this._refreshView();

    const cm = this.utils?.consoleManager;
    if (cm && !cm.hasActiveCommandGroup?.()) {
      cm.beginCommandGroup();
    }
    this.logTagged(this._getSelectionSummary());
    this._announceStep();
  }

  _beginMoveFromBasePoint(pt, pointerEvent = null) {
    this.basePoint = pt.clone();
    this.session.begin(this.basePoint, pointerEvent);

    if (typeof this.utils.renderPivotMarker === 'function') {
      this.utils.renderPivotMarker(this.basePoint);
    }

    this.phase = 'PICK_DEST_POINT';
    this._announceStep();
  }

  _hasValidSelection() {
    return this.selectionPhase.hasValidSelection();
  }

  _resolveOsnapPoint(rawPoint) {
    let snapped = rawPoint;
    const osnap = this.service.calculateOsnap(rawPoint, (snapPt, type) => {
      this.utils.hud.renderSnapMarker(snapPt, type);
    });
    if (osnap && osnap.point) {
      snapped = osnap.point;
    }
    this.utils.hud.updateHUD(snapped);
    return snapped;
  }

  _getCursorDirection() {
    if (!this.basePoint) return null;
    const cursorPt = this.utils.lastMousePoint || this.lastCursorPoint;
    if (!cursorPt) return null;

    const isShift = Boolean(this.utils.isShiftPressed);
    const resolved = this.session.resolveSnappedPoint(this.basePoint, cursorPt, isShift, {
      updateHud: false
    });
    const vec = resolved.subtract(this.basePoint);
    return vec.length >= 0.001 ? vec : null;
  }

  _previewMoveTo(rawPoint, isShift = false) {
    if (!rawPoint || !this.basePoint) return;

    const destPoint = this.session.resolveSnappedPoint(this.basePoint, rawPoint, isShift);
    this.session.applyDelta(destPoint.subtract(this.basePoint));

    this._refreshView();
    if (typeof this.utils.renderPivotMarker === 'function') {
      this.utils.renderPivotMarker(destPoint);
    }
  }

  _commitMoveAt(rawPoint, isShift = false, { snap = true } = {}) {
    if (!rawPoint || !this.basePoint) return;

    const destPoint = snap
      ? this.session.resolveSnappedPoint(this.basePoint, rawPoint, isShift, { updateHud: false })
      : rawPoint;
    const delta = destPoint.subtract(this.basePoint);

    if (delta.length < 0.001) {
      this.logTagged(CAD_CATALOG.tools.move.logs.samePoint);
      return;
    }

    this.session.applyDelta(delta);
    this.session.commitMoveCommand({ skipTargetLog: true });
    this.session.reset();
    this._clearVisualGuides();

    this.basePoint = null;
    this.phase = 'SELECT_OBJECTS';
    this._refreshView();
    this.exitToSelect();
  }

  onUndo() {
    if (this.phase === 'PICK_DEST_POINT') {
      this.session.restoreInitialState();
      this.session.reset();
      this.logTagged(CAD_CATALOG.tools.move.logs.undoBasePoint);
      this._enterBasePointPhase();
      return true;
    }
    return false;
  }

  onConfirmDefault() {
    const { logs } = CAD_CATALOG.tools.move;
    if (this.phase === 'SELECT_OBJECTS') {
      if (this._hasValidSelection()) {
        this._enterBasePointPhase();
      } else {
        this.logTagged(logs.needSelection);
      }
      return;
    }
    if (this.phase === 'PICK_BASE_POINT') {
      this.logTagged(logs.needBasePoint);
      return;
    }
    if (this.phase === 'PICK_DEST_POINT') {
      this.logTagged(logs.samePoint);
    }
  }

  onCommandInput(rawInput) {
    const { logs } = CAD_CATALOG.tools.move;
    const parsed = CommandInputParser.parse(rawInput, {
      options: this._getCurrentOptions(),
      referencePoint: this.basePoint,
      paper: this._getPaper()
    });

    switch (parsed.type) {
      case 'ACCEPT_DEFAULT':
        this.onConfirmDefault();
        return true;

      case 'OPTION':
        if (parsed.key === 'C') {
          if (this.utils.consoleManager) {
            this.utils.consoleManager.handleCancel();
          } else {
            this.cancel();
            this.exitToSelect();
          }
        }
        return true;

      case 'POINT':
        if (this.phase === 'SELECT_OBJECTS') {
          this.logTagged(logs.needSelection);
        } else if (this.phase === 'PICK_BASE_POINT') {
          this._beginMoveFromBasePoint(parsed.point);
        } else if (this.phase === 'PICK_DEST_POINT') {
          this._commitMoveAt(parsed.point, false, { snap: false });
        }
        return true;

      case 'NUMBER': {
        if (this.phase === 'SELECT_OBJECTS') {
          this.logTagged(logs.needSelection);
          return true;
        }
        if (this.phase === 'PICK_BASE_POINT' || !this.basePoint) {
          this.logTagged(logs.needBasePoint);
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
        const targetPt = this.basePoint.add(dir.normalize(parsed.value));
        this._commitMoveAt(targetPt, false, { snap: false });
        return true;
      }

      case 'ERROR':
        this.logTagged(parsed.message);
        return true;

      default:
        return false;
    }
  }

  onMouseDown(event) {
    if (!event || (event.event && (event.event.button === 2 || event.event.which === 3 || event.event.button !== 0))) {
      return;
    }

    if (event.point) {
      this.lastCursorPoint = event.point.clone();
      this.utils.lastMousePoint = event.point.clone();
    }

    if (this.phase === 'SELECT_OBJECTS') {
      this.selectionPhase.onMouseDown(event);
      return;
    }

    if (this.phase === 'PICK_BASE_POINT') {
      const pickedBase = this._resolveOsnapPoint(event.point);
      this.utils.consoleManager?.logStepInput?.(this.formatCoords(pickedBase));
      this._beginMoveFromBasePoint(pickedBase, event.event || null);
      return;
    }

    if (this.phase === 'PICK_DEST_POINT' && this.basePoint) {
      const isShift = Boolean(event.event?.shiftKey);
      const destPt = this.session.resolveSnappedPoint(this.basePoint, event.point, isShift, {
        updateHud: false
      });
      this.utils.consoleManager?.logStepInput?.(this.formatCoords(destPt));
      this._commitMoveAt(destPt, isShift, { snap: false });
    }
  }

  onMouseMove(event) {
    if (!event?.point) return;

    this.lastCursorPoint = event.point.clone();
    this.utils.lastMousePoint = event.point.clone();

    if (this.phase === 'SELECT_OBJECTS') {
      this.selectionPhase.onMouseMove(event);
      return;
    }

    if (this.phase === 'PICK_BASE_POINT') {
      this._resolveOsnapPoint(event.point);
      return;
    }

    if (this.phase === 'PICK_DEST_POINT' && this.basePoint) {
      const isShift = Boolean(event.event?.shiftKey);
      this._previewMoveTo(event.point, isShift);
    }
  }

  onMouseDrag(event) {
    if (!event?.point) return;

    this.lastCursorPoint = event.point.clone();
    this.utils.lastMousePoint = event.point.clone();

    if (this.phase === 'SELECT_OBJECTS') {
      this.selectionPhase.onMouseDrag(event);
      return;
    }

    if (this.phase === 'PICK_DEST_POINT' && this.basePoint) {
      if (!this.session.hasExceededThreshold(event)) {
        return;
      }

      const isShift = Boolean(event.event?.shiftKey);
      this._previewMoveTo(event.point, isShift);
    }
  }

  onMouseUp(event) {
    if (this.phase === 'SELECT_OBJECTS') {
      this.selectionPhase.onMouseUp(event);
      return;
    }

    if (this.phase === 'PICK_DEST_POINT' && this.basePoint) {
      if (event?.event && event.event.button !== undefined && event.event.button !== 0) {
        return;
      }

      if (this.session.isConfirmed) {
        const targetPoint = event?.point || this.utils?.lastMousePoint;
        const isShift = Boolean(event?.event?.shiftKey);
        const destPt = this.session.resolveSnappedPoint(this.basePoint, targetPoint, isShift, {
          updateHud: false
        });
        this.utils.consoleManager?.logStepInput?.(this.formatCoords(destPt));
        this._commitMoveAt(destPt, isShift, { snap: false });
        return;
      }

      this.session.isConfirmed = true;
      this._announceStep();
    }
  }

  _clearVisualGuides() {
    if (typeof this.utils.hud?.clearDragRubberBand === 'function') {
      this.utils.hud.clearDragRubberBand();
    }
    if (typeof this.utils.hud?.clearSnapMarker === 'function') {
      this.utils.hud.clearSnapMarker();
    }
  }

  onKeyDown(event) {
    if (this.phase === 'SELECT_OBJECTS') {
      const handled = this.selectionPhase.onKeyDown(event, {
        onConfirm: () => this._enterBasePointPhase()
      });
      if (handled) return true;
    }

    return super.onKeyDown(event);
  }

  onContextMenu(event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.event?.preventDefault) event.event.preventDefault();

    if (this.selectionPhase.isMenuOpen()) {
      this.selectionPhase.closeMenu();
      return true;
    }

    if (this.phase === 'SELECT_OBJECTS' && this._hasValidSelection()) {
      this._enterBasePointPhase();
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
    this._clearVisualGuides();
    this.selectionPhase.reset();

    if (this.phase === 'PICK_DEST_POINT') {
      this.session.restoreInitialState();
    }
    this.session.reset();
    this.basePoint = null;
    this.phase = 'SELECT_OBJECTS';

    this._refreshView();
  }

  cleanup() {
    this.selectionPhase.cleanup();
    this.cancel();
  }
}