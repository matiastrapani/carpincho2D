/**
 * tools/select/SelectionDragHandler.js - Arrastre mixto (entidades, nodos y tiradores), pivote, snap y MoveCommand
 */


import { MixedDragSession } from './MixedDragSession.js';

export class SelectionDragHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.session = new MixedDragSession(cadService, cadUtils);
    this.reset();
  }

  reset() {
    this.session?.reset();
    this.dragAnchorEntity = null;
    this.pivotPoint = null;
    this.isPivotFromPoint = false;
    this.pendingMenu = null;
  }

  isDragging() {
    return Boolean(this.session?.isConfirmed);
  }

  setPendingMenu(menuData) {
    this.pendingMenu = menuData || null;
  }

  clearPendingMenu() {
    this.pendingMenu = null;
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  prepareDrag(targetItem, point, nativeEvent = null) {
    if (!targetItem || !point) return;

    const paperInst = this._getPaper();
    this.dragAnchorEntity = targetItem;

    const isPivotFromPoint = this.session.isPointEntity(targetItem);
    let closestVertex = null;
    let minDistance = Infinity;

    if (isPivotFromPoint) {
      closestVertex = targetItem.position || targetItem.bounds?.center;
    } else if (paperInst && targetItem instanceof paperInst.Raster && targetItem.bounds) {
      const b = targetItem.bounds;
      [
        b.topLeft, b.topCenter, b.topRight,
        b.rightCenter, b.bottomRight, b.bottomCenter,
        b.bottomLeft, b.leftCenter, b.center
      ].forEach((pt) => {
        const dist = pt.getDistance(point);
        if (dist < minDistance) {
          minDistance = dist;
          closestVertex = pt.clone();
        }
      });
    } else if (paperInst && targetItem instanceof paperInst.Path && targetItem.segments) {
      targetItem.segments.forEach((seg) => {
        const dist = seg.point.getDistance(point);
        if (dist < minDistance) {
          minDistance = dist;
          closestVertex = seg.point.clone();
        }
      });
    }

    this.pivotPoint = closestVertex ? closestVertex.clone() : point.clone();
    this.isPivotFromPoint = isPivotFromPoint;
    this.session.begin(point, nativeEvent);
  }

  onMouseDrag(event) {
    const startPt = this.session.mouseStartPt;
    if (!this.service.selectedEntities?.length || !startPt || !this.session.entitiesStart) {
      return false;
    }

    if (!this.session.hasExceededThreshold(event)) {
      return true;
    }

    this.pendingMenu = null;

    const isShift = event.event ? event.event.shiftKey : false;
    const pivotPoint = this.pivotPoint || startPt;
    const rawTargetPivot = pivotPoint.add(event.point.subtract(startPt));
    const finalTargetPivot = this.session.resolveSnappedPoint(pivotPoint, rawTargetPivot, isShift);

    const globalDelta = finalTargetPivot.subtract(pivotPoint);
    this.session.applyDelta(globalDelta);

    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    if (!this.isPivotFromPoint) {
      this.utils.renderPivotMarker?.(finalTargetPivot);
    }

    return true;
  }

  onMouseUp() {
    if (!this.session.entitiesStart || this.session.entitiesStart.length === 0) {
      return { handled: false, pendingMenu: null };
    }

    const pendingMenu = this.pendingMenu;
    if (!this.session.isConfirmed) {
      if (pendingMenu && pendingMenu.hits?.length > 1) {
        return { handled: true, pendingMenu };
      }
      return { handled: true, pendingMenu: null };
    }

    this.session.commitMoveCommand();
    return { handled: true, pendingMenu: null };
  }

  cancelDrag() {
    const cancelled = this.session.cancel();
    this.reset();
    return cancelled;
  }
}