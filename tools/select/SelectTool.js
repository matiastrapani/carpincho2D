/**
 * tools/select/SelectTool.js - Herramienta de Selección con Submódulos Delegados
 */

import { BaseTool } from '../BaseTool.js';
import { HandleSelectionHandler } from './HandleSelectionHandler.js';
import { BoxSelectHandler } from './BoxSelectHandler.js';
import { ParametricGripHandler } from './ParametricGripHandler.js';
import { SegmentEditHandler } from './SegmentEditHandler.js';
import { SelectionMenuHandler } from './SelectionMenuHandler.js';
import { SelectionDragHandler } from './SelectionDragHandler.js';

export class SelectTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);

    this.boxSelectHandler = new BoxSelectHandler(cadService, cadUtils);
    this.handleModule = new HandleSelectionHandler(cadService, cadUtils);
    this.parametricHandler = new ParametricGripHandler(cadService, cadUtils);
    this.segmentEditHandler = new SegmentEditHandler(cadService, cadUtils);
    this.selectionMenuHandler = new SelectionMenuHandler(cadService, cadUtils);
    this.dragHandler = new SelectionDragHandler(cadService, cadUtils);
    this.activeModule = null;

    this.preservesSelection = 'all';
    this.preservesEditMode = true;
    this.clearsHudOnActivate = true;
    this.cursorMode = 'select';
  }

  _refreshView() {
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    const paperInst = this.utils.paper || paper;
    if (paperInst?.view) paperInst.view.update();
  }

  _applyEntitySelection(targetItem, point, isShift, enableDrag = true, nativeEvent = null) {
    const isAlreadySelected = this.service.selectedEntities.includes(targetItem);

    if (isShift) {
      if (isAlreadySelected) {
        this.service.deselectEntity(targetItem);
      } else {
        this.service.selectEntity(targetItem, true);
      }
    } else if (!isAlreadySelected) {
      this.service.selectEntity(targetItem, false);
    }

    if (enableDrag) {
      this.dragHandler.prepareDrag(targetItem, point, nativeEvent);
    }

    this._refreshView();
  }

  onMouseDown(event) {
    if (event.event && (event.event.button === 2 || event.event.which === 3)) {
      return;
    }

    this.selectionMenuHandler.cancelScheduledOpen();

    const now = Date.now();
    const isShift = Boolean(event.event?.shiftKey);
    const paperInst = this.utils.paper || paper;
    const zoom = paperInst?.view?.zoom || 1;

    if (this.selectionMenuHandler.isOpen() || this.selectionMenuHandler.wasDismissedRecently) {
      this.selectionMenuHandler.close();
      this.selectionMenuHandler.wasDismissedRecently = false;
      this.segmentEditHandler.tryDoubleClickSelected(isShift, now);
      return;
    }

    this.utils.hud.clear();
    this.utils.hoveredHandle = null;
    this.utils.hoveredCurve = null;
    if (this.service.hoveredEntity) {
      this.utils.clearHoverHighlight();
    }

    const hitGrip = this.parametricHandler.hitTest(event.point);
    if (hitGrip) {
      this.activeModule = this.parametricHandler;
      this.activeModule.onMouseDown(event, hitGrip);
      return;
    }

    const hitHandle = this.handleModule.hitTest(event.point);
    if (hitHandle) {
      const segPath = hitHandle.item?.data?.segment?.path || hitHandle.segment?.path;
      if (!(segPath && this.service.selectedEntities.includes(segPath))) {
        this.activeModule = this.handleModule;
        this.activeModule.onMouseDown(event, hitHandle);
        return;
      }
    }

    const hits = this.selectionMenuHandler.getSortedHits(event.point, 8 / zoom);

    if (hits.length > 0) {
      const alreadySelectedHit = !isShift
        ? hits.find((h) => this.service.selectedEntities.includes(h.entity))
        : null;
      const activeHit = alreadySelectedHit || hits[0];
      const targetItem = activeHit.entity;

      if (this.segmentEditHandler.tryEnterEditModeOnDoubleClick(targetItem, isShift, now)) {
        this.dragHandler.clearPendingMenu();
        return;
      }

      if (this.segmentEditHandler.onMouseDown(event, targetItem, activeHit.hitResult)) {
        return;
      }

      if (hits.length > 1) {
        if (alreadySelectedHit) {
          this._applyEntitySelection(alreadySelectedHit.entity, event.point, false, true, event.event);
          this.dragHandler.setPendingMenu({
            hits,
            event: event.event,
            point: event.point.clone(),
            shift: isShift
          });
          return;
        }

        const clickPoint = event.point.clone();
        this.selectionMenuHandler.open(event.event, hits, (chosenHit) => {
          this._applyEntitySelection(chosenHit.entity, clickPoint, isShift, false);
        });
        return;
      }

      this._applyEntitySelection(targetItem, event.point, isShift, true, event.event);
    } else {
      this.segmentEditHandler.resetClickHistory();
      if (!isShift) {
        this.service.deselectAllEntities();
      }
      this.boxSelectHandler.startBox(event.point);
    }
  }

  onMouseDrag(event) {
    if (this.selectionMenuHandler.isOpen()) return;
    this.selectionMenuHandler.cancelScheduledOpen();

    if (this.activeModule) {
      this.activeModule.onMouseDrag(event);
      return;
    }

    const isBoxSelecting = Boolean(this.boxSelectHandler.selectionStartPoint);
    if (!isBoxSelecting && this.segmentEditHandler.onMouseDrag(event)) {
      return;
    }

    if (!isBoxSelecting && this.dragHandler.onMouseDrag(event)) {
      return;
    }

    this.utils.hud.clear();
    if (isBoxSelecting) {
      this.boxSelectHandler.updateBox(event.point);
    }
  }

  onMouseUp(event) {
    if (this.selectionMenuHandler.isOpen()) return;

    if (this.activeModule) {
      this.activeModule.onMouseUp(event);
      this.activeModule = null;
      return;
    }

    if (this.segmentEditHandler.onMouseUp()) {
      this.cleanBox();
      return;
    }

    const dragResult = this.dragHandler.onMouseUp();
    if (dragResult.pendingMenu) {
      this.cleanBox();
      this.selectionMenuHandler.scheduleOpen(
        260,
        dragResult.pendingMenu,
        (chosenHit, point, shift) => this._applyEntitySelection(chosenHit.entity, point, shift, false),
        () => this.dragHandler.isDragging() || Boolean(this.boxSelectHandler.selectionStartPoint)
      );
      return;
    }

    if (this.boxSelectHandler.selectionStartPoint) {
      this.boxSelectHandler.finishBox(event.point, event.event.shiftKey);
    }

    this.cleanBox();
  }

  onMouseMove(event) {
    if (this.selectionMenuHandler.isOpen()) return;

    this.utils.hud.clear();

    if (this.boxSelectHandler.selectionStartPoint || this.dragHandler.isDragging()) {
      return;
    }

    if (this.parametricHandler.handleHover(event.point)) {
      return;
    }

    if (typeof document !== 'undefined' && document.body) {
      document.body.style.cursor = 'default';
    }

    const zoom = (this.utils.paper || paper)?.view?.zoom || 1;
    if (this.segmentEditHandler.handleHover(event.point, zoom)) {
      return;
    }

    this.selectionMenuHandler.handleHover(event.point, zoom);
  }

  cleanBox() {
    this.selectionMenuHandler.close();
    this.boxSelectHandler.clean();
    this.utils.hud.clearDragRubberBand();
    this.handleModule.reset();
    this.parametricHandler.reset();
    this.segmentEditHandler.reset();
    this.dragHandler.reset();

    this.utils.selectedHandle = null;
    this.utils.hoveredHandle = null;
    this.utils.hoveredCurve = null;
    this.utils.clearHoverHighlight();

    this._refreshView();
  }

  onContextMenu() {
    if (this.selectionMenuHandler.isOpen()) {
      this.selectionMenuHandler.close();
      return true;
    }

    if (this.service.hoveredEntity) {
      this.utils.clearHoverHighlight();
    }

    return false;
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    const targetTag = event.target?.tagName;
    const isConsoleInput = event.target?.id === 'cmdInput' || event.target?.id === 'cmdInputFloating';
    const isOtherInputFocused = !isConsoleInput && (
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag) || event.target?.isContentEditable
    );

    if (!isOtherInputFocused && (event.ctrlKey || event.metaKey) && (key.toLowerCase() === 'a' || event.code === 'KeyA')) {
      if (isConsoleInput && event.target.value.length > 0) return false;
      return this.segmentEditHandler.selectAllSegments(event);
    }

    if (key === 'Escape') {
      if (this.selectionMenuHandler.hasScheduledOpen() || this.selectionMenuHandler.isOpen()) {
        this.selectionMenuHandler.close();
        return true;
      }

      if (this._cancelActiveDrag()) {
        return true;
      }

      const hasSelection =
        this.service.selectedEntities?.length > 0 ||
        this.service.selectedSegments?.length > 0 ||
        this.service.selectedHandles?.length > 0;

      if (hasSelection) {
        this.service.deselectAllEntities();
        this.service.deselectAllSegments();
        this.service.deselectAllHandles();
        this.cleanBox();
        return true;
      }

      if (this.service.editingEntities?.length > 0) {
        this.service.selectionManager.exitEditMode();
        this.utils.setPrompt('Herramienta Selección: selecciona objetos o haz doble clic en un trazo para editar sus nodos.');
        return true;
      }

      return super.onKeyDown(event);
    }

    return false;
  }

  _cancelActiveDrag() {
    let cancelled = false;

    if (this.activeModule) {
      if (typeof this.activeModule.cancelDrag === 'function') {
        this.activeModule.cancelDrag();
      } else {
        this.activeModule.reset();
      }
      this.activeModule = null;
      cancelled = true;
    } else if (this.segmentEditHandler.isDragging()) {
      this.segmentEditHandler.cancelDrag();
      cancelled = true;
    } else if (this.dragHandler.cancelDrag() || this.boxSelectHandler.selectionStartPoint) {
      this.cleanBox();
      cancelled = true;
    }

    if (cancelled) {
      this.utils.hud.clear();
      this._refreshView();
    }

    return cancelled;
  }

  cancel() {
    this.cleanBox();
    this.utils.hud.clear();
    this.service.deselectAllEditingEntities();
    const paperInst = this.utils.paper || paper;
    if (paperInst?.view) paperInst.view.update();
  }

  cleanup() {
    this.selectionMenuHandler.cancelScheduledOpen();
    this.selectionMenuHandler.cleanup();
    super.cleanup();
  }
}