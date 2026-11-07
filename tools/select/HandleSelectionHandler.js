/**
 * tools/submodules/HandleSelectionHandler.js
 */
import { MoveCommand } from '../../services/commands/cadCommands.js';

export class HandleSelectionHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.reset();
  }

  reset() {
    this.activeHandleData = null;
    this.mouseStartPt = null;
    this.handleDragStartPt = null;
    this.grabOffset = null;
    this.selectedSegmentsStartData = null;
    this.selectedEntitiesStartData = null;
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
    this.mouseStartPt = event.point.clone();
    const rawType = handleData.type;

    if (rawType === 'arm') {
      const handleType = handleData.handleType;
      const isAnchorSelected = this.service.selectedSegments.includes(seg);
      const isHandleSelected = this.service.isSelectedHandle(seg, handleType);
      const isArmActive = isAnchorSelected && isHandleSelected;

      if (isShift) {
        if (isArmActive) {
          this.service.deselectSegment(seg);
          this.service.deselectHandle(seg, handleType);
        } else {
          this.service.selectSegment(seg, true);
          this.service.selectHandle(seg, handleType, true);
        }
      } else {
        if (!isArmActive) {
          this.service.deselectAllHandles();
          this.service.deselectAllSegments();
          this.service.deselectAllEntities();
          this.service.selectSegment(seg, true);
          this.service.selectHandle(seg, handleType, true);
        }
      }

      const handlePos = seg.point.clone();
      this.handleDragStartPt = handlePos;
      this.grabOffset = handlePos.subtract(event.point);
      this.activeHandleData = { segment: seg, type: 'anchor' };
    } 
    else if (rawType === 'anchor') {
      const isSelected = this.service.selectedSegments.includes(seg);

      if (isShift) {
        if (isSelected) this.service.deselectSegment(seg);
        else this.service.selectSegment(seg, true);
      } else {
        if (!isSelected) {
          this.service.deselectAllSegments();
          this.service.deselectAllHandles();
          this.service.deselectAllEntities();
          this.service.selectSegment(seg, true);
        }
      }

      const handlePos = seg.point.clone();
      this.handleDragStartPt = handlePos;
      this.grabOffset = handlePos.subtract(event.point);
      this.activeHandleData = { segment: seg, type: rawType };
    } 
    else {
      const isSelected = this.service.isSelectedHandle(seg, rawType);

      if (isShift) {
        if (isSelected) this.service.deselectHandle(seg, rawType);
        else this.service.selectHandle(seg, rawType, true);
      } else {
        if (!isSelected) {
          this.service.deselectAllHandles();
          this.service.deselectAllSegments(); 
          this.service.deselectAllEntities();
          this.service.selectHandle(seg, rawType, false);
        }
      }

      const handlePos = (rawType === 'handleIn')
        ? seg.point.add(seg.handleIn)
        : seg.point.add(seg.handleOut);

      this.handleDragStartPt = handlePos.clone();
      this.grabOffset = handlePos.subtract(event.point);
      this.activeHandleData = { segment: seg, type: rawType };
    }

    // CAPTURA DE ESTADOS INICIALES PARA EL HISTORIAL
    this.selectedSegmentsStartData = this.service.selectedSegments.map(s => ({
      segment: s,
      path: s.path,
      segmentIndex: s.index,
      initialPt: s.point.clone(),
      initialHandleIn: s.handleIn.clone(),
      initialHandleOut: s.handleOut.clone()
    }));

    this.selectedEntitiesStartData = this.service.selectedEntities.map(ent => ({
      entity: ent,
      isPath: ent instanceof paper.Path && !ent.data?.isPointEntity,
      initialPos: ent.data?.isPointEntity ? ent.bounds.center.clone() : ent.position.clone(),
      initialSegments: (ent instanceof paper.Path && !ent.data?.isPointEntity) ? ent.segments.map(s => ({
        point: s.point.clone(),
        handleIn: s.handleIn.clone(),
        handleOut: s.handleOut.clone()
      })) : null
    }));

    this.utils.renderBezierHandles();
  }

  onMouseDrag(event) {
    if (!this.activeHandleData) return;

    const handleData = this.activeHandleData;
    const activeSeg = handleData.segment;
    const handleType = handleData.type;

    if (!activeSeg) {
      this.reset();
      return;
    }

    const isShift = event.event.shiftKey;
    let rawTargetPoint = event.point.add(this.grabOffset);

    if (isShift && this.handleDragStartPt) {
      const dx = Math.abs(rawTargetPoint.x - this.handleDragStartPt.x);
      const dy = Math.abs(rawTargetPoint.y - this.handleDragStartPt.y);
      if (dx > dy) rawTargetPoint.y = this.handleDragStartPt.y;
      else rawTargetPoint.x = this.handleDragStartPt.x;
    }

    let finalPoint = rawTargetPoint;
    if (!isShift) {
      const activePaths = Array.from(new Set(
        (this.selectedSegmentsStartData || []).map(item => item.path).filter(Boolean)
      ));
      const activeSegments = (this.selectedSegmentsStartData || []).map(item => item.segment).filter(Boolean);

      const osnap = this.service.calculateOsnap(
        rawTargetPoint,
        (snapPt, type) => this.utils.renderSnapMarker(snapPt, type),
        null,
        { 
          path: activeSeg.path, 
          segment: activeSeg,
          ignoreEntities: activePaths,
          ignoreSegments: activeSegments
        }
      );
      finalPoint = osnap.point;
    }

    const currentHandlePt = handleType === 'anchor'
      ? activeSeg.point
      : (handleType === 'handleIn'
          ? activeSeg.point.add(activeSeg.handleIn)
          : activeSeg.point.add(activeSeg.handleOut));

    const delta = finalPoint.subtract(currentHandlePt);

    if (this.service.selectedSegments.length > 0) {
      this.service.selectedSegments.forEach(s => {
        s.point = s.point.add(delta);
      });
    } else if (handleType === 'anchor') {
      activeSeg.point = activeSeg.point.add(delta);
    }

    if (this.service.selectedHandles.length > 0) {
      this.service.selectedHandles.forEach(h => {
        if (!this.service.selectedSegments.includes(h.segment)) {
          if (h.type === 'handleIn') {
            h.segment.handleIn = h.segment.handleIn.add(delta);
          } else if (h.type === 'handleOut') {
            h.segment.handleOut = h.segment.handleOut.add(delta);
          }
        }
      });
    } else if (handleType === 'handleIn' || handleType === 'handleOut') {
      const isAnchorSelected = this.service.selectedSegments.includes(activeSeg);
      if (!isAnchorSelected) {
        if (handleType === 'handleIn') {
          activeSeg.handleIn = activeSeg.handleIn.add(delta);
        } else if (handleType === 'handleOut') {
          activeSeg.handleOut = activeSeg.handleOut.add(delta);
        }
      }
    }

    if (this.service.selectedEntities.length > 0) {
      this.service.selectedEntities.forEach(ent => {
        if (!this.service.editingEntities.includes(ent)) {
          ent.position = ent.position.add(delta);
        }
      });
    }

    this.utils.renderBezierHandles();
  }

  onMouseUp(event) {
    if (!this.activeHandleData || !this.handleDragStartPt) {
      this.reset();
      return;
    }

    // 1. REGISTRO DE MOVIMIENTO DE SEGMENTOS MULTIPLES
    if (this.selectedSegmentsStartData && this.selectedSegmentsStartData.length > 0) {
      const movedSegmentsData = [];
      let hasMoved = false;

      this.selectedSegmentsStartData.forEach(item => {
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
        const moveCmd = new MoveCommand(this.service, {
          type: 'segments',
          items: movedSegmentsData
        });
        this.service.executeCommand(moveCmd);
        this.reset();
        return;
      }
    }

    // 2. REGISTRO DE MOVIMIENTO DE HANDLE / ANCHOR INDIVIDUAL
    const seg = this.activeHandleData.segment;
    const type = this.activeHandleData.type;

    let finalPt = null;
    if (type === 'anchor') {
      finalPt = seg.point.clone();
    } else if (type === 'handleIn') {
      finalPt = seg.point.add(seg.handleIn);
    } else if (type === 'handleOut') {
      finalPt = seg.point.add(seg.handleOut);
    }

    if (finalPt && !finalPt.equals(this.handleDragStartPt)) {
      const moveCmd = new MoveCommand(this.service, {
        type: 'handle',
        segment: seg,
        path: seg.path,
        segmentIndex: seg.index,
        handleType: type,
        initialPt: this.handleDragStartPt.clone(),
        finalPt: finalPt
      });
      this.service.executeCommand(moveCmd);
    }

    this.reset();
  }
}
