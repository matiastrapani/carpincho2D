/**
 * tools/submodules/HandleSelectionHandler.js
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { MoveCommand } from '../../services/commands/cadCommands.js';

export class HandleSelectionHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.reset();
  }

  reset() {
    if (this.dragRubberBand) {
      this.dragRubberBand.remove();
    }
    this.dragRubberBand = null;
    this.activeHandleData = null;
    this.mouseStartPt = null;
    this.handleDragStartPt = null;
    this.grabOffset = null;
    this.selectedSegmentsStartData = null;
    this.selectedHandlesStartData = null;
    this.selectedEntitiesStartData = null;
  }

  _updateSelectionOnMouseDown(seg, rawType, armHandleType, isShift) {
    if (rawType === 'arm') {
      const isArmActive = this.service.selectedSegments.includes(seg) &&
                          this.service.isSelectedHandle(seg, armHandleType);
      if (isShift) {
        if (isArmActive) {
          this.service.deselectSegment(seg);
          this.service.deselectHandle(seg, armHandleType);
        } else {
          this.service.selectSegment(seg, true);
          this.service.selectHandle(seg, armHandleType, true);
        }
      } else if (!isArmActive) {
        this.service.deselectAllEntities();
        this.service.deselectAllHandles();
        this.service.deselectAllSegments();
        this.service.selectSegment(seg, true);
        this.service.selectHandle(seg, armHandleType, true);
      }
      return;
    }

    if (rawType === 'anchor') {
      const isSelected = this.service.selectedSegments.includes(seg);
      if (isShift) {
        if (isSelected) this.service.deselectSegment(seg);
        else this.service.selectSegment(seg, true);
      } else if (!isSelected) {
        this.service.deselectAllEntities();
        this.service.deselectAllSegments();
        this.service.deselectAllHandles();
        this.service.selectSegment(seg, true);
      }
      return;
    }

    const isSelected = this.service.isSelectedHandle(seg, rawType);
    if (isShift) {
      if (isSelected) this.service.deselectHandle(seg, rawType);
      else this.service.selectHandle(seg, rawType, true);
    } else if (!isSelected) {
      this.service.deselectAllEntities();
      this.service.deselectAllHandles();
      this.service.deselectAllSegments();
      this.service.selectHandle(seg, rawType, false);
    }
  }

  _updateDragRubberBand(fromPt, toPt) {
    if (!fromPt || !toPt) return;

    const hudLayer = this.utils.hudLayer || paper.project?.layers?.['hudLayer'];
    if (!hudLayer) return;

    const strokeWidth = 1 / paper.view.zoom;
    if (!this.dragRubberBand) {
      const line = new paper.Path.Line({
        from: fromPt,
        to: toPt,
        strokeColor: CAD_THEME.selection.line.strokeColor,
        strokeWidth,
        dashArray: CAD_THEME.rubberBand.dashArrayPx,
        data: { isAuxiliary: true },
        insert: false
      });
      hudLayer.addChild(line);
      this.dragRubberBand = line;
    } else {
      this.dragRubberBand.segments[0].point = fromPt;
      this.dragRubberBand.segments[1].point = toPt;
      this.dragRubberBand.strokeWidth = strokeWidth;
    }
  }

  hitTest(point) {
    if (!this.utils.controlHandlesGroup) return null;

    const zoom = paper.view.zoom;
    return this.utils.controlHandlesGroup.hitTest(point, {
      fill: true,
      stroke: true,
      segments: true,
      tolerance: 8 / zoom,
      match: (res) => {
        if (!res.item || !res.item.data || !res.item.data.segment) return false;

        // Ignorar tiradores si la entidad completa ya está seleccionada como objeto
        const parentPath = res.item.data.segment.path;
        if (parentPath && this.service.selectedEntities.includes(parentPath)) {
          return false;
        }

        return true;
      }
    });
  }

  onMouseDown(event, hitResult) {
    const handleData = hitResult.item.data;
    const seg = handleData.segment;
    if (!seg || !seg.path) return;

    const isShift = event.event.shiftKey;
    const rawType = handleData.type;
    this.mouseStartPt = event.point.clone();

    this._updateSelectionOnMouseDown(seg, rawType, handleData.handleType, isShift);

    if (rawType === 'arm' || rawType === 'anchor') {
      this.handleDragStartPt = seg.point.clone();
      this.grabOffset = this.handleDragStartPt.subtract(event.point);
      this.activeHandleData = { segment: seg, type: 'anchor' };
    } else {
      const handlePos = (rawType === 'handleIn')
        ? seg.point.add(seg.handleIn)
        : seg.point.add(seg.handleOut);
      this.handleDragStartPt = handlePos.clone();
      this.grabOffset = handlePos.subtract(event.point);
      this.activeHandleData = { segment: seg, type: rawType };
    }

    this._captureDragStartState();
    this.utils.selectionRenderEngine.updateEntitiesStroke();
    this.utils.selectionRenderEngine.renderBezierHandles();
  }

  onMouseDrag(event) {
    if (!this.activeHandleData) return;

    const { segment: activeSeg } = this.activeHandleData;
    if (!activeSeg) {
      this.reset();
      return;
    }

    const isShift = event.event ? event.event.shiftKey : false;
    const rawTargetPoint = event.point.add(this.grabOffset);
    const startPt = this.handleDragStartPt;
    const constrainedTarget = startPt
      ? this.utils.applyOrthoConstraint(startPt, rawTargetPoint, isShift)
      : rawTargetPoint;

    const effectiveOrtho = Boolean(this.service?.isOrthoEnabled) !== Boolean(isShift);
    const isHorizontal = startPt
      ? Math.abs(rawTargetPoint.x - startPt.x) > Math.abs(rawTargetPoint.y - startPt.y)
      : false;
    const projectOrthoGrid = (pt) => (isHorizontal
      ? new paper.Point(pt.x, startPt.y)
      : new paper.Point(startPt.x, pt.y));

    const movedEntities = (this.selectedEntitiesStartData || []).map((i) => i.entity).filter(Boolean);
    const activeSegments = (this.selectedSegmentsStartData || []).map((item) => item.segment).filter(Boolean);
    const activeHandles = (this.selectedHandlesStartData || []).map((item) => ({
      segment: item.segment,
      type: item.handleType
    }));

    const osnap = this.service.calculateOsnap(
      constrainedTarget,
      (snapPt, type) => {
        const markerPt = (type === 'grid' && effectiveOrtho && startPt) ? projectOrthoGrid(snapPt) : snapPt;
        this.utils.hud.renderSnapMarker(markerPt, type);
      },
      null,
      {
        fromPoint: startPt,
        ignoreEntities: movedEntities,
        ignoreSegments: activeSegments,
        ignoreHandles: activeHandles
      }
    );

    let finalPoint = constrainedTarget;
    if (osnap && osnap.type) {
      finalPoint = (osnap.type === 'grid' && effectiveOrtho && startPt)
        ? projectOrthoGrid(osnap.point)
        : osnap.point;
    }

    this.utils.hud.updateHUD(finalPoint);
    this._updateDragRubberBand(startPt, finalPoint);
    this._applyDeltaToSelection(finalPoint.subtract(startPt));
    this.utils.selectionRenderEngine.renderBezierHandles();
  }

  onMouseUp() {
    if (!this.activeHandleData || !this.handleDragStartPt) {
      this.reset();
      return;
    }

    let hasMoved = false;

    const entitiesData = (this.selectedEntitiesStartData || []).filter((i) => i.entity).map((item) => {
      const isPath = item.isPath;
      const finalPos = isPath ? null : (item.entity.data?.isPointEntity ? item.entity.bounds.center.clone() : item.entity.position.clone());
      const finalSegments = isPath ? item.entity.segments.map((s) => ({
        point: s.point.clone(),
        handleIn: s.handleIn.clone(),
        handleOut: s.handleOut.clone()
      })) : null;

      if (isPath && finalSegments.some((s, idx) =>
        !s.point.equals(item.initialSegments[idx].point) ||
        !s.handleIn.equals(item.initialSegments[idx].handleIn) ||
        !s.handleOut.equals(item.initialSegments[idx].handleOut))) {
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

    const segmentsData = (this.selectedSegmentsStartData || []).filter((i) => i.segment && i.path).map((item) => {
      const finalPt = item.segment.point.clone();
      const finalHandleIn = item.segment.handleIn.clone();
      const finalHandleOut = item.segment.handleOut.clone();
      if (!finalPt.equals(item.initialPt)) hasMoved = true;
      return { ...item, finalPt, finalHandleIn, finalHandleOut };
    });

    const handlesData = (this.selectedHandlesStartData || []).filter((i) => i.segment && i.path).map((item) => {
      const finalVector = item.segment[item.handleType].clone();
      if (!finalVector.equals(item.initialVector)) hasMoved = true;
      return { ...item, finalVector };
    });

    if (hasMoved) {
      this.service.executeCommand(new MoveCommand(this.service, {
        type: 'mixed',
        entities: entitiesData,
        segments: segmentsData,
        handles: handlesData
      }));
    }

    this.reset();
  }

  _applyDeltaToSelection(totalDelta) {
    (this.selectedSegmentsStartData || []).forEach((item) => {
      if (item.segment) {
        item.segment.point = item.initialPt.add(totalDelta);
      }
    });

    (this.selectedHandlesStartData || []).forEach((item) => {
      if (item.segment) {
        item.segment[item.handleType] = item.initialVector.add(totalDelta);
      }
    });

    (this.selectedEntitiesStartData || []).forEach((item) => {
      if (!item.entity) return;
      if (item.isPath && item.initialSegments) {
        item.entity.segments.forEach((seg, idx) => {
          if (item.initialSegments[idx]) {
            seg.point = item.initialSegments[idx].point.add(totalDelta);
          }
        });
      } else if (item.initialPos) {
        item.entity.position = item.initialPos.add(totalDelta);
      }
    });
  }

  _captureDragStartState() {
    this.selectedSegmentsStartData = this.service.selectedSegments
      .filter((s) => s && s.path && !this.service.selectedEntities.includes(s.path))
      .map((s) => ({
        segment: s,
        path: s.path,
        segmentIndex: s.index,
        initialPt: s.point.clone(),
        initialHandleIn: s.handleIn.clone(),
        initialHandleOut: s.handleOut.clone()
      }));

    this.selectedHandlesStartData = this.service.selectedHandles
      .filter((h) => h && h.segment && h.segment.path &&
        !this.service.selectedEntities.includes(h.segment.path) &&
        !this.service.selectedSegments.includes(h.segment))
      .map((h) => ({
        segment: h.segment,
        path: h.segment.path,
        segmentIndex: h.segment.index,
        handleType: h.type,
        initialVector: h.segment[h.type].clone()
      }));

    this.selectedEntitiesStartData = this.service.selectedEntities.map((ent) => ({
      entity: ent,
      isPath: ent instanceof paper.Path && !ent.data?.isPointEntity,
      initialPos: ent.data?.isPointEntity ? ent.bounds.center.clone() : ent.position.clone(),
      initialSegments: (ent instanceof paper.Path && !ent.data?.isPointEntity) ? ent.segments.map((s) => ({
        point: s.point.clone(),
        handleIn: s.handleIn.clone(),
        handleOut: s.handleOut.clone()
      })) : null
    }));
  }

  cancelDrag() {
    (this.selectedSegmentsStartData || []).forEach((item) => {
      if (!item.segment) return;
      item.segment.point = item.initialPt.clone();
      item.segment.handleIn = item.initialHandleIn.clone();
      item.segment.handleOut = item.initialHandleOut.clone();
    });

    (this.selectedHandlesStartData || []).forEach((item) => {
      if (item.segment) item.segment[item.handleType] = item.initialVector.clone();
    });

    (this.selectedEntitiesStartData || []).forEach((item) => {
      if (!item.entity) return;
      if (item.isPath && item.initialSegments) {
        item.entity.segments.forEach((seg, idx) => {
          if (item.initialSegments[idx]) {
            seg.point = item.initialSegments[idx].point.clone();
            seg.handleIn = item.initialSegments[idx].handleIn.clone();
            seg.handleOut = item.initialSegments[idx].handleOut.clone();
          }
        });
      } else if (item.initialPos) {
        item.entity.position = item.initialPos.clone();
      }
    });

    this.reset();
  }
}
