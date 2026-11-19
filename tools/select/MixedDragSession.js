/**
 * tools/select/MixedDragSession.js - Sesión compartida de arrastre mixto, histéresis y MoveCommand
 */

import { MoveCommand } from '../../services/commands/cadCommands.js';

export class MixedDragSession {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.reset();
  }

  reset() {
    this.mouseStartPt = null;
    this.mouseStartClient = null;
    this.mouseDownTime = 0;
    this.isConfirmed = false;
    this.entitiesStart = null;
    this.segmentsStart = null;
    this.handlesStart = null;
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  isPointEntity(ent) {
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
    this.captureState();
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
    const paperInst = this._getPaper();

    this.entitiesStart = (this.service.selectedEntities || []).map((ent) => {
      const isPoint = this.isPointEntity(ent);
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

    this.segmentsStart = (this.service.selectedSegments || [])
      .filter((s) => s && s.path && !this.service.selectedEntities.includes(s.path))
      .map((s) => ({
        segment: s,
        path: s.path,
        segmentIndex: s.index,
        initialPt: s.point.clone(),
        initialHandleIn: s.handleIn.clone(),
        initialHandleOut: s.handleOut.clone()
      }));

    this.handlesStart = (this.service.selectedHandles || [])
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

  getIgnoreContext() {
    const movedEntities = (this.entitiesStart || []).map((i) => i.entity).filter(Boolean);
    const segmentPaths = (this.segmentsStart || []).map((i) => i.path).filter(Boolean);
    const handlePaths = (this.handlesStart || []).map((i) => i.path).filter(Boolean);

    return {
      movedEntities,
      allAffectedEntities: Array.from(new Set([...movedEntities, ...segmentPaths, ...handlePaths])),
      ignoreSegments: (this.segmentsStart || []).map((i) => i.segment).filter(Boolean),
      ignoreHandles: (this.handlesStart || []).map((i) => ({
        segment: i.segment,
        type: i.handleType
      }))
    };
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

    const osnap = this.service.calculateOsnap(
      constrainedTarget,
      (snapPt, type) => {
        const markerPt = type === 'grid' ? projectOrthoGrid(snapPt) : snapPt;
        this.utils.hud.renderSnapMarker(markerPt, type);
      },
      null,
      {
        fromPoint: startPt,
        ignoreEntities: movedEntities,
        ignoreSegments,
        ignoreHandles
      }
    );

    let finalPoint = constrainedTarget;
    if (osnap && osnap.type) {
      finalPoint = osnap.type === 'grid' ? projectOrthoGrid(osnap.point) : osnap.point;
    }

    if (updateHud) {
      this.utils.hud.updateHUD(finalPoint);
      this.utils.hud.updateDragRubberBand(startPt, finalPoint);
    }

    return finalPoint;
  }

  applyDelta(globalDelta) {
    (this.entitiesStart || []).forEach((item) => {
      if (!item.entity) return;
      if (item.isPath && item.initialSegments) {
        item.entity.segments.forEach((seg, idx) => {
          if (item.initialSegments[idx]) {
            seg.point = item.initialSegments[idx].point.add(globalDelta);
          }
        });
      } else if (item.initialPos) {
        item.entity.position = item.initialPos.add(globalDelta);
      }
    });

    (this.segmentsStart || []).forEach((item) => {
      if (item.segment) item.segment.point = item.initialPt.add(globalDelta);
    });

    (this.handlesStart || []).forEach((item) => {
      if (item.segment) item.segment[item.handleType] = item.initialVector.add(globalDelta);
    });
  }

  restoreInitialState() {
    (this.entitiesStart || []).forEach((item) => {
      if (!item.entity) return;
      if (item.isPath && item.initialSegments) {
        item.entity.segments.forEach((seg, idx) => {
          const initSeg = item.initialSegments[idx];
          if (initSeg) {
            seg.point = initSeg.point.clone();
            seg.handleIn = initSeg.handleIn.clone();
            seg.handleOut = initSeg.handleOut.clone();
          }
        });
      } else if (item.initialPos) {
        item.entity.position = item.initialPos.clone();
      }
    });

    (this.segmentsStart || []).forEach((item) => {
      if (!item.segment) return;
      item.segment.point = item.initialPt.clone();
      item.segment.handleIn = item.initialHandleIn.clone();
      item.segment.handleOut = item.initialHandleOut.clone();
    });

    (this.handlesStart || []).forEach((item) => {
      if (item.segment) item.segment[item.handleType] = item.initialVector.clone();
    });
  }

  commitMoveCommand() {
    let hasMoved = false;

    const entitiesData = (this.entitiesStart || [])
      .filter((i) => i.entity)
      .map((item) => {
        const isPath = item.isPath;
        const finalPos = isPath
          ? null
          : this.isPointEntity(item.entity)
            ? item.entity.bounds.center.clone()
            : item.entity.position.clone();
        const finalSegments = isPath
          ? item.entity.segments.map((s) => ({
              point: s.point.clone(),
              handleIn: s.handleIn.clone(),
              handleOut: s.handleOut.clone()
            }))
          : null;

        if (
          isPath &&
          finalSegments.some(
            (s, idx) =>
              !s.point.equals(item.initialSegments[idx].point) ||
              !s.handleIn.equals(item.initialSegments[idx].handleIn) ||
              !s.handleOut.equals(item.initialSegments[idx].handleOut)
          )
        ) {
          hasMoved = true;
        } else if (!isPath && finalPos && item.initialPos && !finalPos.equals(item.initialPos)) {
          hasMoved = true;
        }

        return {
          entity: item.entity,
          isPath,
          initialPos: item.initialPos ? item.initialPos.clone() : null,
          finalPos,
          initialSegments: item.initialSegments,
          finalSegments
        };
      });

    const segmentsData = (this.segmentsStart || [])
      .filter((i) => i.segment && i.path)
      .map((item) => {
        const finalPt = item.segment.point.clone();
        const finalHandleIn = item.segment.handleIn.clone();
        const finalHandleOut = item.segment.handleOut.clone();
        if (!finalPt.equals(item.initialPt)) hasMoved = true;
        return { ...item, finalPt, finalHandleIn, finalHandleOut };
      });

    const handlesData = (this.handlesStart || [])
      .filter((i) => i.segment && i.path)
      .map((item) => {
        const finalVector = item.segment[item.handleType].clone();
        if (!finalVector.equals(item.initialVector)) hasMoved = true;
        return { ...item, finalVector };
      });

    if (hasMoved) {
      this.service.executeCommand(
        new MoveCommand(this.service, {
          type: 'mixed',
          entities: entitiesData,
          segments: segmentsData,
          handles: handlesData
        })
      );
    }

    return hasMoved;
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