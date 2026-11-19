/**
 * tools/submodules/HandleSelectionHandler.js
 */

import { MixedDragSession } from './MixedDragSession.js';

export class HandleSelectionHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.session = new MixedDragSession(cadService, cadUtils);
    this.reset();
  }

  reset() {
    this.utils?.hud?.clearDragRubberBand?.();
    this.session?.reset();
    this.activeHandleData = null;
    this.handleDragStartPt = null;
    this.grabOffset = null;
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

    this.session.begin(event.point, event.event);
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

    if (!this.session.hasExceededThreshold(event)) {
      return;
    }

    const isShift = event.event ? event.event.shiftKey : false;
    const rawTargetPoint = event.point.add(this.grabOffset);
    const startPt = this.handleDragStartPt;
    const finalPoint = startPt
      ? this.session.resolveSnappedPoint(startPt, rawTargetPoint, isShift)
      : rawTargetPoint;

    this.session.applyDelta(finalPoint.subtract(startPt));
    this.utils.selectionRenderEngine.renderBezierHandles();
  }

  onMouseUp() {
    if (!this.activeHandleData || !this.handleDragStartPt || !this.session.isConfirmed) {
      this.reset();
      return;
    }

    this.session.commitMoveCommand();
    this.reset();
  }

  cancelDrag() {
    this.session.cancel();
    this.reset();
  }
}