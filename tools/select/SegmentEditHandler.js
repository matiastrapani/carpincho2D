/**
 * tools/select/SegmentEditHandler.js - Submódulo para edición, selección y arrastre de nodos/tramos
 */
import { MoveCommand } from '../../services/commands/cadCommands.js';

export class SegmentEditHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.reset();
  }

  reset() {
    this.dragAnchorSegment = null;
    this.pivotPoint = null;
    this.mouseStartPt = null;
    this.selectedSegmentsStartData = null;
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

    let targetMousePt = event.point.clone();
    const isShift = event.event.shiftKey;

    if (isShift) {
      const dx = Math.abs(targetMousePt.x - this.mouseStartPt.x);
      const dy = Math.abs(targetMousePt.y - this.mouseStartPt.y);
      if (dx > dy) targetMousePt.y = this.mouseStartPt.y;
      else targetMousePt.x = this.mouseStartPt.x;
    }

    const pivotSegData = this.selectedSegmentsStartData.find((s) => s.segment === this.dragAnchorSegment)
      || this.selectedSegmentsStartData[0];

    let globalDelta = targetMousePt.subtract(this.mouseStartPt);

    if (pivotSegData && pivotSegData.initialPt) {
      let currentPivotPos = pivotSegData.initialPt.add(globalDelta);

      if (!isShift) {
        const activePaths = Array.from(new Set(
          this.selectedSegmentsStartData.map((item) => item.path).filter(Boolean)
        ));
        const activeSegments = this.selectedSegmentsStartData.map((item) => item.segment).filter(Boolean);
        const selectedPointsCoords = this.selectedSegmentsStartData.map((item) => item.initialPt);

        const osnap = this.service.calculateOsnap(
          currentPivotPos,
          (pt, type) => this.utils.hud.renderSnapMarker(pt, type),
          null,
          {
            path: pivotSegData.path,
            segment: pivotSegData.segment,
            ignoreEntities: activePaths,
            ignoreSegments: activeSegments,
            selectedPointsCoords
          }
        );

        if (osnap.type) {
          globalDelta = osnap.point.subtract(pivotSegData.initialPt);
        }
      } else {
        this.utils.hud.clear();
      }

      currentPivotPos = pivotSegData.initialPt.add(globalDelta);
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