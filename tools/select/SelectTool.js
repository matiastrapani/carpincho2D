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
import { EditModeMenuResolver } from './EditModeMenuResolver.js';
import { SelectKeyHandler } from './SelectKeyHandler.js';

export class SelectTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);

    this.boxSelectHandler = new BoxSelectHandler(cadService, cadUtils);
    this.handleModule = new HandleSelectionHandler(cadService, cadUtils);
    this.parametricHandler = new ParametricGripHandler(cadService, cadUtils);
    this.segmentEditHandler = new SegmentEditHandler(cadService, cadUtils);
    this.selectionMenuHandler = new SelectionMenuHandler(cadService, cadUtils);
    this.dragHandler = new SelectionDragHandler(cadService, cadUtils);
    this.editMenuResolver = new EditModeMenuResolver(
      cadService,
      cadUtils,
      this.handleModule,
      this.segmentEditHandler,
      this.selectionMenuHandler
    );
    this.keyHandler = new SelectKeyHandler(this);
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

  _scheduleDelayedMenu(menuData, onChoice) {
    if (!menuData) return;
    this.selectionMenuHandler.scheduleOpen(
      260,
      menuData,
      onChoice,
      () => (
        this.dragHandler.isDragging() ||
        this.segmentEditHandler.isDragging() ||
        Boolean(this.boxSelectHandler.selectionStartPoint)
      )
    );
  }

  _handleOverlappingEntities(hits, event, isShift) {
    if (isShift) {
      const unselectedHits = hits.filter((h) => !this.service.selectedEntities.includes(h.entity));

      if (unselectedHits.length >= 2) {
        const clickPoint = event.point.clone();
        this.selectionMenuHandler.open(event.event, unselectedHits, (chosenHit) => {
          this._applyEntitySelection(chosenHit.entity, clickPoint, true, false);
        });
        return;
      }

      if (unselectedHits.length === 1) {
        this._applyEntitySelection(unselectedHits[0].entity, event.point, true, true, event.event);
        return;
      }

      this._applyEntitySelection(hits[0].entity, event.point, true, false);
      return;
    }

    const alreadySelectedHit = hits.find((h) => this.service.selectedEntities.includes(h.entity));

    if (alreadySelectedHit) {
      this._applyEntitySelection(alreadySelectedHit.entity, event.point, false, true, event.event);
      this.selectionMenuHandler.setPendingMenu(
        {
          hits,
          event: event.event,
          point: event.point.clone(),
          shift: false
        },
        (chosenHit, pt, shift) => this._applyEntitySelection(chosenHit.entity, pt, shift, false)
      );
      return;
    }

    const clickPoint = event.point.clone();
    this.selectionMenuHandler.open(event.event, hits, (chosenHit) => {
      this._applyEntitySelection(chosenHit.entity, clickPoint, false, false);
    });
  }

  onMouseDown(event) {
    if (event.event && (event.event.button === 2 || event.event.which === 3)) {
      return;
    }

    this.selectionMenuHandler.cancelScheduledOpen();
    this.selectionMenuHandler.clearPendingMenu();

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

    const editOutcome = this.editMenuResolver.handleMouseDown(event, isShift, zoom);
    if (editOutcome?.handled) {
      this.activeModule = editOutcome.activeModule || null;
      return;
    }

    const hits = this.selectionMenuHandler.getSortedHits(event.point, 8 / zoom);

    if (hits.length > 0) {
      const alreadySelectedHit = !isShift
        ? hits.find((h) => this.service.selectedEntities.includes(h.entity))
        : null;
      const activeHit = alreadySelectedHit || hits[0];
      const targetItem = activeHit.entity;

      if (this.segmentEditHandler.tryEnterEditModeOnDoubleClick(targetItem, isShift, now)) {
        this.selectionMenuHandler.clearPendingMenu();
        return;
      }

      if (hits.length > 1) {
        this._handleOverlappingEntities(hits, event, isShift);
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
      if (this.activeModule.session?.isConfirmed) {
        this.selectionMenuHandler.clearPendingMenu();
      }
      return;
    }

    const isBoxSelecting = Boolean(this.boxSelectHandler.selectionStartPoint);
    if (!isBoxSelecting && this.segmentEditHandler.onMouseDrag(event)) {
      if (this.segmentEditHandler.isDragging()) {
        this.selectionMenuHandler.clearPendingMenu();
      }
      return;
    }

    if (!isBoxSelecting && this.dragHandler.onMouseDrag(event)) {
      if (this.dragHandler.isDragging()) {
        this.selectionMenuHandler.clearPendingMenu();
      }
      return;
    }

    this.utils.hud.clear();
    if (isBoxSelecting) {
      this.boxSelectHandler.updateBox(event.point);
    }
  }

  onMouseUp(event) {
    if (this.selectionMenuHandler.isOpen()) return;

    const hadConfirmedDrag =
      Boolean(this.activeModule?.session?.isConfirmed) ||
      this.segmentEditHandler.isDragging() ||
      this.dragHandler.isDragging();

    const pendingMenu = this.selectionMenuHandler.consumePendingMenu(hadConfirmedDrag);

    if (this.activeModule) {
      this.activeModule.onMouseUp(event);
      this.activeModule = null;
      if (pendingMenu) {
        this._scheduleDelayedMenu(pendingMenu.menuData, pendingMenu.onSelect);
      }
      return;
    }

    if (this.segmentEditHandler.onMouseUp()) {
      this.cleanBox();
      if (pendingMenu) {
        this._scheduleDelayedMenu(pendingMenu.menuData, pendingMenu.onSelect);
      }
      return;
    }

    this.dragHandler.onMouseUp();

    if (pendingMenu) {
      this.cleanBox();
      this._scheduleDelayedMenu(pendingMenu.menuData, pendingMenu.onSelect);
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
    return this.keyHandler.onContextMenu();
  }

  onKeyDown(event) {
    if (this.keyHandler.onKeyDown(event)) return true;
    if ((event.key || event.code) === 'Escape') {
      return super.onKeyDown(event);
    }
    return false;
  }

  cancel() {
    this.keyHandler.cancel();
  }

  cleanup() {
    this.selectionMenuHandler.cancelScheduledOpen();
    this.selectionMenuHandler.cleanup();
    super.cleanup();
  }
}