/**
 * tools/select/SegmentEditHandler.js - Submódulo para edición, selección y arrastre de nodos/tramos
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { MoveCommand } from '../../services/commands/cadCommands.js';

export class SegmentEditHandler {
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
    this.dragAnchorSegment = null;
    this.pivotPoint = null;
    this.mouseStartPt = null;
    this.selectedSegmentsStartData = null;
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

  enterEditMode(targetItem) {
    this.service.editingEntities = [targetItem];
    this.service.selectedEntities = [targetItem];
    this.service.deselectAllSegments();
    this.service.deselectAllHandles();

    this.utils.selectionRenderEngine.renderBezierHandles();
    this.utils.selectionRenderEngine.updateEntitiesStroke();
    this.utils.setPrompt('Modo edición de nodos activo. Presiona Esc para salir.');
  }

  onMouseDown(event, targetItem, hitEntity) {
    const isAlreadyInEditMode = this.service.editingEntities.includes(targetItem);
    const isEntityFullySelected = this.service.selectedEntities.includes(targetItem);

    if (!isAlreadyInEditMode || isEntityFullySelected || !(targetItem instanceof paper.Path) || targetItem.data?.isPointEntity) {
      return false;
    }

    const location = hitEntity.location || targetItem.getNearestLocation(event.point);
    if (!location || !location.curve) return false;

    const seg1 = location.curve.segment1;
    const seg2 = location.curve.segment2;
    const isShift = event.event.shiftKey;

    const isSegmentFullySelected = seg1 && seg2 &&
      this.service.selectedSegments.includes(seg1) &&
      this.service.selectedSegments.includes(seg2);

    if (isShift) {
      if (isSegmentFullySelected) {
        if (seg1) this.service.deselectSegment(seg1);
        if (seg2) this.service.deselectSegment(seg2);
      } else {
        if (seg1) this.service.selectSegment(seg1, true);
        if (seg2) this.service.selectSegment(seg2, true);
      }
      this.utils.selectionRenderEngine.renderBezierHandles();
      return true;
    }

    if (!isSegmentFullySelected) {
      this.service.deselectAllSegments();
      this.service.deselectAllHandles();
      if (seg1) this.service.selectSegment(seg1, true);
      if (seg2) this.service.selectSegment(seg2, true);
    }

    let activePivotSeg = seg1;
    let minDist = seg1 ? seg1.point.getDistance(event.point) : Infinity;

    const poolSegments = this.service.selectedSegments.length > 0
      ? this.service.selectedSegments
      : [seg1, seg2].filter(Boolean);

    poolSegments.forEach((s) => {
      const d = s.point.getDistance(event.point);
      if (d < minDist) {
        minDist = d;
        activePivotSeg = s;
      }
    });

    this.dragAnchorSegment = activePivotSeg;
    this.pivotPoint = activePivotSeg ? activePivotSeg.point.clone() : event.point.clone();
    this.mouseStartPt = event.point.clone();

    this.selectedSegmentsStartData = this.service.selectedSegments.map((s) => ({
      segment: s,
      path: s.path,
      segmentIndex: s.index,
      initialPt: s.point.clone(),
      initialHandleIn: s.handleIn.clone(),
      initialHandleOut: s.handleOut.clone()
    }));

    this.utils.selectionRenderEngine.renderBezierHandles();
    if (this.pivotPoint) {
      this.utils.renderPivotMarker(this.pivotPoint);
    }
    return true;
  }

  onMouseDrag(event) {
    if (!this.service.selectedSegments.length || !this.mouseStartPt || !this.selectedSegmentsStartData) {
      return false;
    }

    const isShift = event.event ? event.event.shiftKey : false;
    const targetMousePt = this.utils.applyOrthoConstraint(this.mouseStartPt, event.point, isShift);

    const pivotSegData = this.selectedSegmentsStartData.find((s) => s.segment === this.dragAnchorSegment)
      || this.selectedSegmentsStartData[0];

    let globalDelta = targetMousePt.subtract(this.mouseStartPt);

    if (pivotSegData && pivotSegData.initialPt) {
      const startPt = pivotSegData.initialPt;
      const projectedPivot = startPt.add(globalDelta);
      const effectiveOrtho = Boolean(this.service?.isOrthoEnabled) !== Boolean(isShift);
      const isHorizontal = Math.abs(event.point.x - this.mouseStartPt.x) >
                           Math.abs(event.point.y - this.mouseStartPt.y);
      const projectOrthoGrid = (pt) => (isHorizontal
        ? new paper.Point(pt.x, startPt.y)
        : new paper.Point(startPt.x, pt.y));

      const activePaths = Array.from(new Set(
        this.selectedSegmentsStartData.map((item) => item.path).filter(Boolean)
      ));
      const activeSegments = this.selectedSegmentsStartData.map((item) => item.segment).filter(Boolean);
      const selectedPointsCoords = this.selectedSegmentsStartData.map((item) => item.initialPt);

      const osnap = this.service.calculateOsnap(
        projectedPivot,
        (pt, type) => {
          const markerPt = (type === 'grid' && effectiveOrtho) ? projectOrthoGrid(pt) : pt;
          this.utils.hud.renderSnapMarker(markerPt, type);
        },
        null,
        {
          fromPoint: startPt,
          path: pivotSegData.path,
          segment: pivotSegData.segment,
          ignoreEntities: activePaths,
          ignoreSegments: activeSegments,
          selectedPointsCoords
        }
      );

      if (osnap && osnap.type) {
        const snappedPt = (osnap.type === 'grid' && effectiveOrtho)
          ? projectOrthoGrid(osnap.point)
          : osnap.point;
        globalDelta = snappedPt.subtract(startPt);
      }

      const currentPivotPos = startPt.add(globalDelta);
      this.utils.hud.updateHUD(currentPivotPos);
      this._updateDragRubberBand(startPt, currentPivotPos);
      this.utils.renderPivotMarker(currentPivotPos);
    }

    this.selectedSegmentsStartData.forEach((item) => {
      if (item.segment) {
        item.segment.point = item.initialPt.add(globalDelta);
      }
    });

    this.utils.selectionRenderEngine.renderBezierHandles();
    return true;
  }

  onMouseUp() {
    if (!this.selectedSegmentsStartData || this.selectedSegmentsStartData.length === 0) {
      return false;
    }

    const movedSegmentsData = [];
    let hasMoved = false;

    this.selectedSegmentsStartData.forEach((item) => {
      if (!item.segment || !item.path) return;

      const currentPt = item.segment.point.clone();
      const currentHandleIn = item.segment.handleIn.clone();
      const currentHandleOut = item.segment.handleOut.clone();

      if (!currentPt.equals(item.initialPt) ||
          !currentHandleIn.equals(item.initialHandleIn) ||
          !currentHandleOut.equals(item.initialHandleOut)) {
        hasMoved = true;
      }

      movedSegmentsData.push({
        segment: item.segment,
        path: item.path,
        segmentIndex: item.segmentIndex,
        initialPt: item.initialPt,
        initialHandleIn: item.initialHandleIn,
        initialHandleOut: item.initialHandleOut,
        finalPt: currentPt,
        finalHandleIn: currentHandleIn,
        finalHandleOut: currentHandleOut
      });
    });

    if (hasMoved) {
      const moveCmd = new MoveCommand(this.service, { type: 'segments', items: movedSegmentsData });
      this.service.executeCommand(moveCmd);
    }

    this.reset();
    return true;
  }

  isDragging() {
    return Boolean(
      this.mouseStartPt &&
      this.selectedSegmentsStartData &&
      this.selectedSegmentsStartData.length > 0
    );
  }

  cancelDrag() {
    if (this.selectedSegmentsStartData && this.selectedSegmentsStartData.length > 0) {
      this.selectedSegmentsStartData.forEach((item) => {
        if (!item.segment) return;
        item.segment.point = item.initialPt.clone();
        item.segment.handleIn = item.initialHandleIn.clone();
        item.segment.handleOut = item.initialHandleOut.clone();
      });
    }

    this.reset();
  }

  handleHover(point, zoom) {
    if (this.service.editingEntities.length === 0) return false;

    const hitHandle = this.utils.controlHandlesGroup ? this.utils.controlHandlesGroup.hitTest(point, {
      fill: true, stroke: true, segments: true, tolerance: 8 / zoom,
      match: (res) => {
        if (!res.item?.data?.segment) return false;
        const parentPath = res.item.data.segment.path;
        return !(parentPath && this.service.selectedEntities.includes(parentPath));
      }
    }) : null;

    if (hitHandle?.item?.data) {
      if (this.service.hoveredEntity) this.utils.clearHoverHighlight();
      const handleData = hitHandle.item.data;
      if (this.utils.hoveredHandle !== handleData) {
        this.utils.hoveredHandle = handleData;
        this.utils.hoveredCurve = null;
        this.utils.selectionRenderEngine.renderBezierHandles();
      }
      return true;
    }

    const mouseBox = new paper.Rectangle(
      point.subtract(new paper.Point(8 / zoom, 8 / zoom)),
      new paper.Size(16 / zoom, 16 / zoom)
    );

    let hitCurve = null;
    for (const ent of this.service.editingEntities) {
      if (ent instanceof paper.Path && ent.curves && !ent.data?.isPointEntity) {
        if (ent.bounds && !ent.bounds.intersects(mouseBox)) continue;
        const loc = ent.getNearestLocation(point);
        if (loc?.point && loc.point.getDistance(point) <= (8 / zoom)) {
          hitCurve = loc.curve;
          break;
        }
      }
    }

    if (hitCurve) {
      if (this.service.hoveredEntity) this.utils.clearHoverHighlight();
      if (this.utils.hoveredCurve !== hitCurve || this.utils.hoveredHandle) {
        this.utils.hoveredHandle = null;
        this.utils.hoveredCurve = hitCurve;
        this.utils.selectionRenderEngine.renderBezierHandles();
      }
      return true;
    }

    if (this.utils.hoveredHandle || this.utils.hoveredCurve) {
      this.utils.hoveredHandle = null;
      this.utils.hoveredCurve = null;
      this.utils.selectionRenderEngine.renderBezierHandles();
    }
    return false;
  }
}