/**
 * tools/trim/TrimSelectionHandler.js - Selección por clic y recuadro para límites y corte en Trim
 */

import { BoxSelectHandler } from '../select/BoxSelectHandler.js';

export class TrimSelectionHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.boxHandler = new BoxSelectHandler(cadService, cadUtils);
  }

  get isSelectingBox() {
    return Boolean(this.boxHandler.selectionStartPoint);
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  isEntitySelectable(entity) {
    if (!entity || entity.data?.isPointEntity || entity.visible === false) {
      return false;
    }

    if (typeof this.utils.layerManager?.isEntityInteractive === 'function') {
      return this.utils.layerManager.isEntityInteractive(entity);
    }

    const layerId = String(entity.data?.layerId || '0');
    const layer = this.utils.layerManager?.layers?.get(layerId);
    return !(layer && (layer.locked || layer.visible === false));
  }

  syncBoundariesFromSelection() {
    const valid = (this.service.selectedEntities || []).filter((ent) => this.isEntitySelectable(ent));
    this.service.trimCuttingBoundaries = [...valid];

    this.service.editingEntities = [];
    this.service.deselectAllSegments();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this._getPaper()?.view?.update?.();

    return this.service.trimCuttingBoundaries;
  }

  toggleBoundary(entity) {
    if (!this.isEntitySelectable(entity)) return false;

    const isSelected = this.service.selectedEntities.includes(entity);
    if (isSelected) {
      this.service.deselectEntity(entity);
    } else {
      this.service.selectEntity(entity, true);
    }

    this.syncBoundariesFromSelection();
    return true;
  }

  startBox(point) {
    if (!point) return;
    this.boxHandler.startBox(point);
  }

  updateBox(currPt) {
    if (!this.isSelectingBox || !currPt) return;
    this.boxHandler.updateBox(currPt);
    this._getPaper()?.view?.update?.();
  }

  finishBox(endPt) {
    if (!this.isSelectingBox) return false;

    const boxResult = this.boxHandler.consumeBoxRect(endPt);
    let selectedAny = false;

    if (boxResult) {
      const matches = this.boxHandler.getEntitiesInBox(
        boxResult.boxBounds,
        boxResult.isWindowSelection,
        (ent) => this.isEntitySelectable(ent)
      );

      matches.forEach((entity) => {
        if (!this.service.selectedEntities.includes(entity)) {
          this.service.selectEntity(entity, true);
          selectedAny = true;
        }
      });
    }

    this.syncBoundariesFromSelection();
    return selectedAny;
  }

  consumeBox(endPt) {
    if (!this.isSelectingBox) return null;
    return this.boxHandler.consumeBoxRect(endPt);
  }

  reset() {
    this.boxHandler.clean();
  }
}