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

  _isPointEntity(ent) {
    let current = ent;
    while (current) {
      if (
        current.data?.isPointEntity ||
        current.data?.isPoint ||
        current.data?.type === 'point' ||
        current.data?.type === 'Point' ||
        current.data?.isPointShape
      ) {
        return true;
      }
      current = current.parent;
    }
    return false;
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

  _hasExceededDragThreshold(event) {
    if (this.isDragConfirmed) return true;
    if (!this.mouseStartPt) return false;

    const nativeEvt = event?.event;
    let screenDistPx = null;

    if (this.mouseStartClient && nativeEvt && typeof nativeEvt.clientX === 'number') {
      screenDistPx = Math.hypot(
        nativeEvt.clientX - this.mouseStartClient.x,
        nativeEvt.clientY - this.mouseStartClient.y
      );
    } else if (event?.point) {
      const zoom = this._getPaper()?.view?.zoom || 1;
      screenDistPx = this.mouseStartPt.getDistance(event.point) * zoom;
    }

    if (screenDistPx === null) return false;

    const elapsedMs = Date.now() - this.mouseDownTime;
    const isNormalDrag = screenDistPx >= 5;
    const isDeliberateMicroDrag = elapsedMs >= 180 && screenDistPx >= 2;

    if (isNormalDrag || isDeliberateMicroDrag) {
      this.isDragConfirmed = true;
      return true;
    }

    return false;
  }

  _captureMixedSelectionStartState() {
    const paperInst = this._getPaper();

    this.entityStartPositions = (this.service.selectedEntities || []).map((ent) => {
      const isPoint = this._isPointEntity(ent);
      const isPath = Boolean(paperInst && ent instanceof paperInst.Path && !isPoint);
      return {
        entity: ent,
        isPath,
        initialPos: isPoint
          ? (ent.bounds ? ent.bounds.center.clone() : ent.position.clone())
          : ent.position.clone(),
        initialSegments: isPath
          ? ent.segments.map((s) => ({
              point: s.point.clone(),
              handleIn: s.handleIn.clone(),
              handleOut: s.handleOut.clone()
            }))
          : null
      };
    });

    this.segmentStartPositions = (this.service.selectedSegments || [])
      .filter((s) => s && s.path && !this.service.selectedEntities.includes(s.path))
      .map((s) => ({
        segment: s,
        path: s.path,
        segmentIndex: s.index,
        initialPt: s.point.clone(),
        initialHandleIn: s.handleIn.clone(),
        initialHandleOut: s.handleOut.clone()
      }));

    this.handleStartPositions = (this.service.selectedHandles || [])
      .filter(
        (h) =>
          h &&
          h.segment &&
          h.segment.path &&
          !this.service.selectedEntities.includes(h.segment.path) &&
          !this.service.selectedSegments.includes(h.segment)
      )
      .map((h) => ({
        segment: h.segment,
        path: h.segment.path,
        segmentIndex: h.segment.index,
        handleType: h.type,
        initialVector: h.segment[h.type].clone()
      }));
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