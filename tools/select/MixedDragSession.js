/**
 * tools/select/MixedDragSession.js - Sesión compartida de arrastre mixto, histéresis y resolución OSNAP
 */

import { MixedDragSnapshot, isPointEntityItem } from './MixedDragSnapshot.js';
import { CAD_CATALOG } from '../../config/cadCatalog.js';

export class MixedDragSession {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.snapshot = new MixedDragSnapshot(cadService, () => this._getPaper());
    this.reset();
  }

  get entitiesStart() { return this.snapshot.entitiesStart; }
  get segmentsStart() { return this.snapshot.segmentsStart; }
  get handlesStart() { return this.snapshot.handlesStart; }

  reset() {
    this.mouseStartPt = null;
    this.mouseStartClient = null;
    this.mouseDownTime = 0;
    this.isConfirmed = false;
    this.snapshot?.reset();
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  isPointEntity(ent) {
    return isPointEntityItem(ent);
  }

  begin(point, nativeEvent = null) {
    this.reset();
    if (!point) return;

    this.mouseStartPt = point.clone();
    this.mouseStartClient =
      nativeEvent && typeof nativeEvent.clientX === 'number'
        ? { x: nativeEvent.clientX, y: nativeEvent.clientY }
        : null;
    this.mouseDownTime = Date.now();
    this.isConfirmed = false;
    this.snapshot.capture();
  }

  hasExceededThreshold(event) {
    if (this.isConfirmed) return true;
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
    if (screenDistPx >= 5 || (elapsedMs >= 180 && screenDistPx >= 2)) {
      this.isConfirmed = true;
      return true;
    }

    return false;
  }

  captureState() {
    this.snapshot.capture();
  }

  getIgnoreContext() {
    return this.snapshot.getIgnoreContext();
  }

  _resolveOsnapFromPoint(startPt) {
    const hasEntities = (this.entitiesStart?.length || 0) > 0;
    const segCount = this.segmentsStart?.length || 0;
    const handleCount = this.handlesStart?.length || 0;

    if (!hasEntities && handleCount === 0 && segCount === 1) {
      const seg = this.segmentsStart[0]?.segment;
      if (seg?.path && Array.isArray(seg.path.segments) && seg.path.segments.length >= 2) {
        const neighbors = [];
        if (seg.previous && seg.previous !== seg) neighbors.push(seg.previous);
        if (seg.next && seg.next !== seg && seg.next !== seg.previous) neighbors.push(seg.next);

        if (neighbors.length === 1 && neighbors[0].point) {
          return neighbors[0].point.clone();
        }
      }
    }

    if (!hasEntities && segCount === 0 && handleCount === 1) {
      const seg = this.handlesStart[0]?.segment;
      if (seg?.point) {
        return seg.point.clone();
      }
    }

    return startPt;
  }

  resolveSnappedPoint(startPt, rawTargetPt, isShift = false, { updateHud = true } = {}) {
    if (!startPt || !rawTargetPt) return rawTargetPt;

    const paperInst = this._getPaper();
    const constrainedTarget = this.utils.applyOrthoConstraint(startPt, rawTargetPt, isShift);
    const effectiveOrtho = Boolean(this.service?.isOrthoEnabled) !== Boolean(isShift);
    const isHorizontal =
      Math.abs(rawTargetPt.x - startPt.x) > Math.abs(rawTargetPt.y - startPt.y);

    const projectOrthoGrid = (pt) =>
      effectiveOrtho && paperInst
        ? isHorizontal
          ? new paperInst.Point(pt.x, startPt.y)
          : new paperInst.Point(startPt.x, pt.y)
        : pt;

    const { movedEntities, ignoreSegments, ignoreHandles } = this.getIgnoreContext();
    const osnapFromPoint = this._resolveOsnapFromPoint(startPt);

    const osnap = this.service.calculateOsnap(
      constrainedTarget,
      null,
      {
        fromPoint: osnapFromPoint,
        ignoreEntities: movedEntities,
        ignoreSegments,
        ignoreHandles
      }
    );

    let finalPoint = constrainedTarget;
    if (osnap && osnap.type) {
      finalPoint = osnap.type === 'grid' ? projectOrthoGrid(osnap.point) : osnap.point;
      this.utils.hud.renderSnapMarker(finalPoint, osnap.type);
    } else {
      this.utils.hud.renderSnapMarker(null, null);
    }

    if (updateHud) {
      this.utils.hud.updateHUD(finalPoint);
      this.utils.hud.updateDragRubberBand(startPt, finalPoint);
    }

    return finalPoint;
  }

  applyDelta(globalDelta) {
    this.snapshot.applyDelta(globalDelta);
  }

  restoreInitialState() {
    this.snapshot.restore();
  }

  commitMoveCommand({ skipTargetLog = false } = {}) {
    const cm = this.utils?.consoleManager;
    const useCompactBlock = Boolean(cm && !cm.hasActiveCommandGroup?.());
    if (useCompactBlock) {
      cm.beginCompactBlock();
    }

    try {
      const { hasMoved, delta } = this.snapshot.commitMoveCommand({ skipTargetLog });

      if (hasMoved && delta) {
        const movedText = CAD_CATALOG.tools.move?.logs?.moved?.({
          dx: delta.x.toFixed(2),
          dy: delta.y.toFixed(2),
          distance: delta.length.toFixed(2)
        }) || `Desplazamiento aplicado: ΔX = ${delta.x.toFixed(2)}, ΔY = ${delta.y.toFixed(2)}, Distancia = ${delta.length.toFixed(2)}`;

        cm?.logSystem(`[MOVER] ${movedText}`, { grouped: true });
      }

      return hasMoved;
    } finally {
      if (useCompactBlock) {
        cm.endCompactBlock();
      }
    }
  }

  cancel() {
    if (!this.isConfirmed) {
      this.reset();
      return false;
    }

    this.restoreInitialState();
    this.reset();
    return true;
  }
}