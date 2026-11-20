/**
 * tools/MoveTool.js - Herramienta Mover con selección previa o interactiva y punto base explícito
 */

import { BaseTool } from './BaseTool.js';
import { MixedDragSession } from './select/MixedDragSession.js';
import { CommandSelectionHandler } from './select/CommandSelectionHandler.js';

export class MoveTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    if (!cadService || !cadUtils) {
      throw new Error('MoveTool requiere instancias válidas de cadService y cadUtils.');
    }

    this.preservesSelection = 'all';
    this.preservesEditMode = true;
    this.clearsHudOnActivate = true;
    this.highlightGripsOnSelect = true;

    this.session = new MixedDragSession(cadService, cadUtils);
    this.selectionPhase = new CommandSelectionHandler(cadService, cadUtils, {
      commandLabel: 'Mover',
      setPrompt: (text) => this.setPrompt(text),
      onRefresh: () => this._refreshView()
    });
    this.phase = 'SELECT_OBJECTS';
    this.basePoint = null;
    this.promptText = 'Mover — Selecciona objetos y presiona Enter o clic derecho:';
  }

  getCursorMode() {
    return this.phase === 'SELECT_OBJECTS' ? 'select' : 'draw';
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  setPrompt(text) {
    super.setPrompt(text);
    if (typeof this.utils?.setPrompt === 'function') {
      this.utils.setPrompt(text);
    }
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

    if (this._hasValidSelection()) {
      this._enterBasePointPhase();
    } else {
      this.phase = 'SELECT_OBJECTS';
      this._setCanvasCursorMode('select');
      this.selectionPhase.refreshSelectionVisuals();
    }
  }

  _enterBasePointPhase() {
    this._clearVisualGuides();
    this.selectionPhase.reset();
    this.phase = 'PICK_BASE_POINT';
    this.basePoint = null;
    this._setCanvasCursorMode('draw');
    this._refreshView();
    this.setPrompt('Mover — Especifica el punto base:');
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

  _previewMoveTo(rawPoint, isShift = false) {
    if (!rawPoint || !this.basePoint) return;

    const destPoint = this.session.resolveSnappedPoint(this.basePoint, rawPoint, isShift);
    this.session.applyDelta(destPoint.subtract(this.basePoint));

    this._refreshView();
    if (typeof this.utils.renderPivotMarker === 'function') {
      this.utils.renderPivotMarker(destPoint);
    }
  }

  _commitMoveAt(rawPoint, isShift = false) {
    if (!rawPoint || !this.basePoint) return;

    const destPoint = this.session.resolveSnappedPoint(this.basePoint, rawPoint, isShift, {
      updateHud: false
    });

    this.session.applyDelta(destPoint.subtract(this.basePoint));
    this.session.commitMoveCommand();
    this.session.reset();
    this._clearVisualGuides();

    this.basePoint = null;
    this._baseDownPoint = null;
    this.phase = 'SELECT_OBJECTS';
    this._refreshView();
    this.exitToSelect();
  }

  onMouseDown(event) {
    if (!event || (event.event && (event.event.button === 2 || event.event.which === 3 || event.event.button !== 0))) {
      return;
    }

    if (this.phase === 'SELECT_OBJECTS') {
      this.selectionPhase.onMouseDown(event);
      return;
    }

    if (this.phase === 'PICK_BASE_POINT') {
      const pickedBase = this._resolveOsnapPoint(event.point);
      this.basePoint = pickedBase.clone();
      this.session.begin(this.basePoint, event.event || null);

      if (typeof this.utils.renderPivotMarker === 'function') {
        this.utils.renderPivotMarker(this.basePoint);
      }

      this.phase = 'PICK_DEST_POINT';
      this.setPrompt('Mover — Especifica el segundo punto (destino) o arrastra y suelta:');
      return;
    }

    if (this.phase === 'PICK_DEST_POINT' && this.basePoint) {
      const isShift = Boolean(event.event?.shiftKey);
      this._commitMoveAt(event.point, isShift);
    }
  }

  onMouseMove(event) {
    if (!event?.point) return;

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
        this._commitMoveAt(targetPoint, isShift);
        return;
      }

      this.session.isConfirmed = true;
      this.setPrompt('Mover — Especifica el segundo punto (destino):');
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
    const key = event.key || event.code;
    const isConsoleInput = event.target?.id === 'cmdInput' || event.target?.id === 'cmdInputFloating';
    if (isConsoleInput && event.target.value.trim().length > 0) {
      return false;
    }

    if (this.phase === 'SELECT_OBJECTS') {
      const handled = this.selectionPhase.onKeyDown(event, {
        onConfirm: () => this._enterBasePointPhase()
      });
      if (handled) return true;
    }

    if (key === 'Escape') {
      this.cancel();
      this.exitToSelect();
      return true;
    }

    return super.onKeyDown(event);
  }

  onContextMenu(event) {
    if (this.selectionPhase.isMenuOpen()) {
      this.selectionPhase.closeMenu();
      return true;
    }

    if (this.phase === 'SELECT_OBJECTS' && this._hasValidSelection()) {
      this._enterBasePointPhase();
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