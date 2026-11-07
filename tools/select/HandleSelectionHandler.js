/**
 * tools/select/HandleSelectionHandler.js - Gestor de Vértices y Tiradores Bézier
 */
import { MoveCommand } from '../../services/commands/cadCommands.js';

export class HandleSelectionHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;

    this.dragState = {
      activeHandleData: null,
      initialPoint: null,
      initialHandleIn: null,
      initialHandleOut: null,
      selectedSegmentsStartData: null
    };
  }

  hitTest(point) {
    const handlesGroup = this.utils.controlHandlesGroup;
    if (!handlesGroup) return null;

    const zoom = paper.view.zoom;
    return handlesGroup.hitTest(point, {
      fill: true, stroke: true, segments: true, tolerance: 8 / zoom,
      match: (res) => {
        if (!res.item || !res.item.data || !res.item.data.segment) return false;
        const parentPath = res.item.data.segment.path;
        if (parentPath && this.service.selectedEntities.includes(parentPath)) return false;
        return true;
      }
    });
  }

  onMouseDown(event, hitHandle) {
    if (!hitHandle || !hitHandle.item || !hitHandle.item.data) return;

    const data = hitHandle.item.data;
    const seg = data.segment;
    if (!seg) return;

    const isShift = event.event.shiftKey;

    if (data.type === 'anchor') {
      if (isShift) {
        if (this.service.selectedSegments.includes(seg)) {
          this.service.deselectSegment(seg);
        } else {
          this.service.selectSegment(seg, true);
        }
      } else {
        if (!this.service.selectedSegments.includes(seg)) {
          this.service.deselectAllSegments();
          this.service.deselectAllHandles();
          this.service.selectSegment(seg, true);
        }
      }
    } else if (data.type === 'handleIn' || data.type === 'handleOut') {
      this.service.selectHandle(seg, data.type, isShift);
    }

    this.dragState.activeHandleData = data;
    this.dragState.initialPoint = seg.point.clone();
    this.dragState.initialHandleIn = seg.handleIn.clone();
    this.dragState.initialHandleOut = seg.handleOut.clone();

    // Guardar estado inicial de TODOS los nodos seleccionados
    this.dragState.selectedSegmentsStartData = this.service.selectedSegments.map(s => ({
      segment: s,
      path: s.path,
      segmentIndex: s.index,
      initialPt: s.point.clone(),
      initialHandleIn: s.handleIn.clone(),
      initialHandleOut: s.handleOut.clone()
    }));

    if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();
  }

  onMouseDrag(event) {
    if (!this.dragState.activeHandleData) return false;

    const data = this.dragState.activeHandleData;
    const seg = data.segment;
    if (!seg) return false;

    let targetPt = event.point.clone();
    const isShift = event.event.shiftKey;

    if (data.type === 'anchor') {
      if (isShift && this.dragState.initialPoint) {
        const dx = Math.abs(targetPt.x - this.dragState.initialPoint.x);
        const dy = Math.abs(targetPt.y - this.dragState.initialPoint.y);
        if (dx > dy) targetPt.y = this.dragState.initialPoint.y;
        else targetPt.x = this.dragState.initialPoint.x;
      }

      let globalDelta = targetPt.subtract(this.dragState.initialPoint);

      const activePaths = Array.from(new Set(
        (this.dragState.selectedSegmentsStartData || []).map(item => item.path).filter(Boolean)
      ));
      const activeSegments = (this.dragState.selectedSegmentsStartData || []).map(item => item.segment).filter(Boolean);

      const osnap = this.service.calculateOsnap(
        this.dragState.initialPoint.add(globalDelta),
        (pt, type) => this.utils.renderSnapMarker(pt, type),
        null,
        { path: seg.path, segment: seg, ignoreEntities: activePaths, ignoreSegments: activeSegments }
      );

      if (osnap.type) {
        globalDelta = osnap.point.subtract(this.dragState.initialPoint);
      }

      // Mover todo el grupo de nodos seleccionados
      if (this.dragState.selectedSegmentsStartData && this.dragState.selectedSegmentsStartData.length > 0) {
        this.dragState.selectedSegmentsStartData.forEach(item => {
          if (item.segment) {
            item.segment.point = item.initialPt.add(globalDelta);
          }
        });
      } else {
        seg.point = this.dragState.initialPoint.add(globalDelta);
      }
    } else if (data.type === 'handleIn' || data.type === 'handleOut') {
      const deltaVector = targetPt.subtract(seg.point);
      if (data.type === 'handleIn') seg.handleIn = deltaVector;
      else seg.handleOut = deltaVector;
    }

    if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();
    return true;
  }

  onMouseUp() {
    if (!this.dragState.activeHandleData) return false;

    const data = this.dragState.activeHandleData;

    if (data.type === 'anchor' && this.dragState.selectedSegmentsStartData && this.dragState.selectedSegmentsStartData.length > 0) {
      const movedSegmentsData = [];
      let hasMoved = false;

      this.dragState.selectedSegmentsStartData.forEach(item => {
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
    }

    this.reset();
    if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();
    return true;
  }

  reset() {
    this.dragState = {
      activeHandleData: null,
      initialPoint: null,
      initialHandleIn: null,
      initialHandleOut: null,
      selectedSegmentsStartData: null
    };
  }

  isActive() {
    return !!this.dragState.activeHandleData;
  }
}