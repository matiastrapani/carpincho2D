/**
 * tools/select/SegmentEditHandler.js - Submódulo para edición, selección y arrastre de nodos/tramos
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { MixedDragSession } from './MixedDragSession.js';

export class SegmentEditHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.session = new MixedDragSession(cadService, cadUtils);
    this.lastClickTime = 0;
    this.lastClickEntity = null;
    this.reset();
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  reset() {
    this.utils?.hud?.clearDragRubberBand?.();
    this.session?.reset();
    this.dragAnchorSegment = null;
    this.pivotPoint = null;
  }

  resetClickHistory() {
    this.lastClickTime = 0;
    this.lastClickEntity = null;
  }

  _updateDragRubberBand(fromPt, toPt) {
    if (!fromPt || !toPt) return;

    const paperInst = this._getPaper();
    const hudLayer = this.utils.hudLayer || paperInst?.project?.layers?.['hudLayer'];
    if (!hudLayer || !paperInst) return;

    const zoom = paperInst.view?.zoom || 1;
    const strokeWidth = (CAD_THEME.rubberBand?.strokeWidthPx ?? 1) / zoom;
    const dashArray = (CAD_THEME.rubberBand?.dashArrayPx || [6, 4]).map((v) => v / zoom);

    if (!this.dragRubberBand) {
      const line = new paperInst.Path.Line({
        from: fromPt,
        to: toPt,
        strokeColor: CAD_THEME.selection.line.strokeColor,
        strokeWidth,
        dashArray,
        data: { isAuxiliary: true },
        insert: false
      });
      hudLayer.addChild(line);
      this.dragRubberBand = line;
    } else {
      this.dragRubberBand.segments[0].point = fromPt;
      this.dragRubberBand.segments[1].point = toPt;
      this.dragRubberBand.strokeWidth = strokeWidth;
      this.dragRubberBand.dashArray = dashArray;
    }
  }

  tryEnterEditModeOnDoubleClick(targetEntity, isShift, now) {
    const isDoubleClick = (now - this.lastClickTime) < 350 && this.lastClickEntity === targetEntity;
    this.lastClickTime = now;
    this.lastClickEntity = targetEntity;

    const paperInst = this._getPaper();
    if (!isDoubleClick || !paperInst || !(targetEntity instanceof paperInst.Path) || targetEntity.data?.isPointEntity) {
      return false;
    }

    const isTargetInSelection = this.service.selectedEntities.includes(targetEntity);
    const targetsToEdit = isTargetInSelection
      ? [...this.service.selectedEntities]
      : [targetEntity];
    const append = isShift && this.service.editingEntities.length > 0;

    if (!isTargetInSelection && !isShift) {
      this.service.deselectAllEntities();
    }

    this.enterEditMode(targetsToEdit, { append });
    this.resetClickHistory();
    return true;
  }

  tryDoubleClickSelected(isShift, now) {
    if (!this.lastClickEntity || !this.service.selectedEntities.includes(this.lastClickEntity)) {
      return false;
    }
    return this.tryEnterEditModeOnDoubleClick(this.lastClickEntity, isShift, now);
  }

  selectAllSegments(event) {
    if (!this.service.editingEntities || this.service.editingEntities.length === 0) {
      return false;
    }

    event.preventDefault();
    this.service.deselectAllHandles();
    this.service.deselectAllSegments();

    const paperInst = this._getPaper();

    this.service.editingEntities.forEach((entity) => {
      if (!entity || entity.visible === false) return;

      const layerId = String(entity.data?.layerId || '0');
      const layer = this.utils.layerManager?.layers?.get(layerId);
      if (layer && (layer.locked || layer.visible === false)) return;

      if (paperInst && entity instanceof paperInst.Path && !entity.data?.isPointEntity) {
        entity.segments.forEach((seg) => this.service.selectSegment(seg, true));
      } else if (paperInst && entity instanceof paperInst.CompoundPath && entity.children) {
        entity.children.forEach((child) => {
          if (child instanceof paperInst.Path && child.segments) {
            child.segments.forEach((seg) => this.service.selectSegment(seg, true));
          }
        });
      }
    });

    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    if (paperInst?.view) paperInst.view.update();
    return true;
  }

  enterEditMode(targetOrList, options = {}) {
    const edited = this.service.selectionManager.enterEditMode(targetOrList, options);
    if (edited.length === 0) return false;

    const countLabel = edited.length === 1
      ? '1 entidad'
      : `${edited.length} entidades`;
    this.utils.setPrompt(`Modo edición de nodos activo (${countLabel}). Presiona Esc o F11 para salir.`);
    return true;
  }

  onMouseDown(event, targetItem, hitEntity) {
    const paperInst = this._getPaper();
    const isAlreadyInEditMode = this.service.editingEntities.includes(targetItem);
    const isEntityFullySelected = this.service.selectedEntities.includes(targetItem);

    if (!isAlreadyInEditMode || isEntityFullySelected || !paperInst || !(targetItem instanceof paperInst.Path) || targetItem.data?.isPointEntity) {
      return false;
    }

    const location = hitEntity.location || targetItem.getNearestLocation(event.point);
    if (!location || !location.curve) return false;

    const seg1 = location.curve.segment1;
    const seg2 = location.curve.segment2;
    const pairSegments = [seg1, seg2].filter(Boolean);
    const isShift = event.event.shiftKey;

    const isSegmentFullySelected = seg1 && seg2 &&
      this.service.selectedSegments.includes(seg1) &&
      this.service.selectedSegments.includes(seg2);

    if (isShift) {
      pairSegments.forEach((seg) => {
        if (isSegmentFullySelected) this.service.deselectSegment(seg);
        else this.service.selectSegment(seg, true);
      });
      this.utils.selectionRenderEngine.renderBezierHandles();
      return true;
    }

    if (!isSegmentFullySelected) {
      this.service.deselectAllEntities();
      this.service.deselectAllSegments();
      this.service.deselectAllHandles();
      pairSegments.forEach((seg) => this.service.selectSegment(seg, true));
    }

    let activePivotSeg = seg1;
    let minDist = seg1 ? seg1.point.getDistance(event.point) : Infinity;
    const poolSegments = this.service.selectedSegments.length > 0
      ? this.service.selectedSegments
      : pairSegments;

    poolSegments.forEach((s) => {
      const d = s.point.getDistance(event.point);
      if (d < minDist) {
        minDist = d;
        activePivotSeg = s;
      }
    });

    this.dragAnchorSegment = activePivotSeg;
    this.pivotPoint = activePivotSeg ? activePivotSeg.point.clone() : event.point.clone();

    this.session.begin(event.point, event.event);
    this.utils.selectionRenderEngine.updateEntitiesStroke();
    this.utils.selectionRenderEngine.renderBezierHandles();
    return true;
  }

  onMouseDrag(event) {
    const startMousePt = this.session.mouseStartPt;
    if (!this.service.selectedSegments.length || !startMousePt || !this.session.segmentsStart) {
      return false;
    }

    if (!this.session.hasExceededThreshold(event)) {
      return true;
    }

    const isShift = event.event ? event.event.shiftKey : false;
    const pivotSegData =
      this.session.segmentsStart.find((s) => s.segment === this.dragAnchorSegment) ||
      this.session.segmentsStart[0];

    let globalDelta;
    if (pivotSegData && pivotSegData.initialPt) {
      const startPt = pivotSegData.initialPt;
      const rawTargetPivot = startPt.add(event.point.subtract(startMousePt));
      const currentPivotPos = this.session.resolveSnappedPoint(startPt, rawTargetPivot, isShift);
      globalDelta = currentPivotPos.subtract(startPt);
      this.utils.renderPivotMarker(currentPivotPos);
    } else {
      const targetMousePt = this.utils.applyOrthoConstraint(startMousePt, event.point, isShift);
      globalDelta = targetMousePt.subtract(startMousePt);
    }

    this.session.applyDelta(globalDelta);
    this.utils.selectionRenderEngine.renderBezierHandles();
    return true;
  }

  onMouseUp() {
    if (!this.session.segmentsStart || this.session.segmentsStart.length === 0) {
      return false;
    }

    if (!this.session.isConfirmed) {
      this.reset();
      return true;
    }

    this.session.commitMoveCommand();
    this.reset();
    return true;
  }

  isDragging() {
    return Boolean(this.session?.isConfirmed);
  }

  cancelDrag() {
    this.session.cancel();
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

    const paperInst = this._getPaper();
    if (!paperInst) return false;

    const mouseBox = new paperInst.Rectangle(
      point.subtract(new paperInst.Point(8 / zoom, 8 / zoom)),
      new paperInst.Size(16 / zoom, 16 / zoom)
    );

    let hitCurve = null;
    for (const ent of this.service.editingEntities) {
      if (ent instanceof paperInst.Path && ent.curves && !ent.data?.isPointEntity) {
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