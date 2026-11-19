/**
 * tools/select/CommandSelectionHandler.js - Fase interactiva de selección CAD para herramientas de modificación
 */

import { BoxSelectHandler } from './BoxSelectHandler.js';
import { SelectionMenuHandler } from './SelectionMenuHandler.js';
import { HandleSelectionHandler } from './HandleSelectionHandler.js';
import { SegmentEditHandler } from './SegmentEditHandler.js';

export class CommandSelectionHandler {
  constructor(cadService, cadUtils, options = {}) {
    if (!cadService || !cadUtils) {
      throw new Error('CommandSelectionHandler requiere instancias válidas de cadService y cadUtils.');
    }

    this.service = cadService;
    this.utils = cadUtils;
    this.commandLabel = options.commandLabel || 'Comando';
    this.setPromptFn = typeof options.setPrompt === 'function' ? options.setPrompt : null;
    this.onRefreshFn = typeof options.onRefresh === 'function' ? options.onRefresh : null;

    this.boxSelectHandler = new BoxSelectHandler(cadService, cadUtils);
    this.selectionMenuHandler = new SelectionMenuHandler(cadService, cadUtils);
    this.handleModule = new HandleSelectionHandler(cadService, cadUtils);
    this.segmentEditHandler = new SegmentEditHandler(cadService, cadUtils);
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  _setPrompt(text) {
    if (this.setPromptFn) {
      this.setPromptFn(text);
    } else if (typeof this.utils?.setPrompt === 'function') {
      this.utils.setPrompt(text);
    }
  }

  _isLayerEditable(entity) {
    if (!entity || !entity.parent) return false;
    const layerId = String(entity.data?.layerId || '0');
    const layer = this.service.layerManager?.layers?.get(layerId);
    return !layer || (!layer.locked && layer.visible !== false);
  }

  hasValidSelection() {
    const hasEntities = (this.service.selectedEntities || []).some((ent) => this._isLayerEditable(ent));
    const hasSegments = (this.service.selectedSegments || []).some((seg) => this._isLayerEditable(seg?.path));
    const hasHandles = (this.service.selectedHandles || []).some((h) => this._isLayerEditable(h?.segment?.path));
    return hasEntities || hasSegments || hasHandles;
  }

  isMenuOpen() {
    return this.selectionMenuHandler.isOpen();
  }

  closeMenu() {
    this.selectionMenuHandler.close();
  }

  refreshSelectionVisuals() {
    if (this.onRefreshFn) {
      this.onRefreshFn();
    }

    const isEditMode = (this.service.editingEntities || []).length > 0;
    const entitiesCount = (this.service.selectedEntities || []).length;
    const segmentsCount = (this.service.selectedSegments || []).length;
    const handlesCount = (this.service.selectedHandles || []).filter(
      (h) => !this.service.selectedSegments?.includes(h.segment)
    ).length;
    const total = entitiesCount + segmentsCount + handlesCount;

    if (total > 0) {
      this._setPrompt(
        isEditMode
          ? `${this.commandLabel} (${total} seleccionado${total === 1 ? '' : 's'}) — Selecciona nodos/tiradores (Shift alterna) o presiona Enter / clic derecho:`
          : `${this.commandLabel} (${total} seleccionado${total === 1 ? '' : 's'}) — Clic/recuadro suma, Shift resta, Enter continúa:`
      );
    } else {
      this._setPrompt(
        isEditMode
          ? `${this.commandLabel} — Selecciona nodos o tiradores (Shift alterna) y presiona Enter / clic derecho:`
          : `${this.commandLabel} — Selecciona objetos (clic/recuadro suma, Shift resta):`
      );
    }
  }

  _selectEditModeEdge(point, targetItem, hitResult, isShift) {
    const paperInst = this._getPaper();
    const isAlreadyInEditMode = this.service.editingEntities.includes(targetItem);
    const isEntityFullySelected = this.service.selectedEntities.includes(targetItem);

    if (
      !isAlreadyInEditMode ||
      isEntityFullySelected ||
      !paperInst ||
      !(targetItem instanceof paperInst.Path) ||
      targetItem.data?.isPointEntity
    ) {
      return false;
    }

    const location = hitResult?.location || targetItem.getNearestLocation(point);
    if (!location || !location.curve) return false;

    const pairSegments = [location.curve.segment1, location.curve.segment2].filter(Boolean);
    if (pairSegments.length === 0) return false;

    const isEdgeFullySelected = pairSegments.every((seg) => this.service.selectedSegments.includes(seg));

    if (isShift) {
      pairSegments.forEach((seg) => {
        if (isEdgeFullySelected) {
          this.service.deselectSegment(seg);
        } else {
          this.service.selectSegment(seg, true);
        }
      });
    } else if (!isEdgeFullySelected) {
      this.service.deselectAllEntities();
      this.service.deselectAllSegments();
      this.service.deselectAllHandles();
      pairSegments.forEach((seg) => this.service.selectSegment(seg, true));
    }

    this.refreshSelectionVisuals();
    return true;
  }

  _toggleOrSelectEntity(target, isShift) {
    if (!target) return;

    if (isShift) {
      if (this.service.selectedEntities.includes(target)) {
        this.service.deselectEntity(target);
      }
    } else if (!this.service.selectedEntities.includes(target)) {
      this.service.selectEntity(target, true);
    }

    this.refreshSelectionVisuals();
  }

  onMouseDown(event) {
    if (!event || (event.event && (event.event.button === 2 || event.event.which === 3 || event.event.button !== 0))) {
      return;
    }

    const now = Date.now();
    const isShift = Boolean(event.event?.shiftKey);

    if (this.selectionMenuHandler.isOpen() || this.selectionMenuHandler.wasDismissedRecently) {
      this.selectionMenuHandler.close();
      this.selectionMenuHandler.wasDismissedRecently = false;
      if (this.segmentEditHandler.tryDoubleClickSelected(isShift, now)) {
        this.refreshSelectionVisuals();
      }
      return;
    }

    if (this.service.hoveredEntity) {
      this.utils.clearHoverHighlight();
    }

    const hitHandle = this.handleModule.hitTest(event.point);
    if (hitHandle) {
      const segPath = hitHandle.item?.data?.segment?.path || hitHandle.segment?.path;
      if (!(segPath && this.service.selectedEntities.includes(segPath))) {
        this.handleModule.onMouseDown(event, hitHandle);
        this.handleModule.reset();
        this.refreshSelectionVisuals();
        return;
      }
    }

    const zoom = this._getPaper()?.view?.zoom || 1;
    const hits = this.selectionMenuHandler.getSortedHits(event.point, 8 / zoom);

    if (hits.length > 0) {
      const targetItem = hits[0].entity;

      if (this.segmentEditHandler.tryEnterEditModeOnDoubleClick(targetItem, isShift, now)) {
        this.refreshSelectionVisuals();
        return;
      }

      const editingHit = hits.find((h) => this.service.editingEntities.includes(h.entity));
      if (editingHit && this._selectEditModeEdge(event.point, editingHit.entity, editingHit.hitResult, isShift)) {
        return;
      }

      if (hits.length > 1) {
        this.selectionMenuHandler.open(event.event, hits, (chosenHit) => {
          this._toggleOrSelectEntity(chosenHit.entity, isShift);
        });
        return;
      }

      this._toggleOrSelectEntity(targetItem, isShift);
      return;
    }

    this.segmentEditHandler.resetClickHistory();
    this.boxSelectHandler.startBox(event.point);
  }

  onMouseMove(event) {
    if (!event?.point || this.selectionMenuHandler.isOpen() || this.boxSelectHandler.selectionStartPoint) {
      return;
    }

    const zoom = this._getPaper()?.view?.zoom || 1;
    if (this.segmentEditHandler.handleHover(event.point, zoom)) {
      return;
    }
    this.selectionMenuHandler.handleHover(event.point, zoom);
  }

  onMouseDrag(event) {
    if (!event?.point || this.selectionMenuHandler.isOpen()) return;

    if (this.boxSelectHandler.selectionStartPoint) {
      this.utils.hud.clear();
      this.boxSelectHandler.updateBox(event.point);
    }
  }

  onMouseUp(event) {
    if (this.selectionMenuHandler.isOpen()) return;

    if (this.boxSelectHandler.selectionStartPoint && event?.point) {
      const startPt = this.boxSelectHandler.selectionStartPoint;
      const isShift = Boolean(event.event?.shiftKey);
      const zoom = this._getPaper()?.view?.zoom || 1;
      const isEmptyClick = startPt.getDistance(event.point) < 3 / zoom;
      const isEditMode = (this.service.editingEntities || []).length > 0;

      this.boxSelectHandler.finishBox(event.point, isShift, { additive: !isEditMode });
      if (isEmptyClick && !isShift && isEditMode) {
        this.service.deselectAllHandles();
      }
      this.refreshSelectionVisuals();
    }
  }

  onKeyDown(event, { onConfirm } = {}) {
    const key = event.key || event.code;

    if ((event.ctrlKey || event.metaKey) && (key.toLowerCase() === 'a' || event.code === 'KeyA')) {
      if (this.segmentEditHandler.selectAllSegments(event)) {
        this.refreshSelectionVisuals();
        return true;
      }
    }

    if (key === 'Enter' || key === ' ') {
      if (this.hasValidSelection()) {
        if (typeof onConfirm === 'function') {
          onConfirm();
        }
      } else {
        this._setPrompt(`${this.commandLabel} — No hay elementos seleccionados. Selecciona objetos o nodos primero:`);
      }
      return true;
    }

    if (key === 'Escape') {
      if (this.selectionMenuHandler.isOpen()) {
        this.selectionMenuHandler.close();
        return true;
      }

      if (this.hasValidSelection()) {
        this.service.deselectAllEntities();
        this.service.deselectAllSegments();
        this.service.deselectAllHandles();
        this.boxSelectHandler.clean();
        this.refreshSelectionVisuals();
        return true;
      }

      if (this.service.editingEntities?.length > 0) {
        this.service.selectionManager.exitEditMode();
        this.refreshSelectionVisuals();
        return true;
      }
    }

    return false;
  }

  reset() {
    this.boxSelectHandler.clean();
    this.selectionMenuHandler.close();
    this.handleModule.reset();
    this.segmentEditHandler.reset();
    this.utils.hoveredHandle = null;
    this.utils.hoveredCurve = null;
    if (this.service.hoveredEntity) {
      this.utils.clearHoverHighlight();
    }
  }

  cleanup() {
    this.selectionMenuHandler.cleanup();
    this.reset();
  }
}