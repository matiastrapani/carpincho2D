/**
 * services/commands/TransformCommands.js - Comandos de transformación y edición espacial
 */

export class MoveCommand {
  constructor(cadService, moveData) {
    this.cadService = cadService;
    this.moveData = moveData;
  }

  execute() {
    this.applyState(true);
  }

  undo() {
    this.applyState(false);
  }

  applyState(useFinal) {
    if (!this.moveData) return;

    if (this.moveData.type === 'segments') {
      this.moveData.items.forEach(item => {
        const seg = item.path && item.path.segments ? item.path.segments[item.segmentIndex] : item.segment;
        if (!seg) return;

        const pt = useFinal ? item.finalPt : item.initialPt;
        const hIn = useFinal ? item.finalHandleIn : item.initialHandleIn;
        const hOut = useFinal ? item.finalHandleOut : item.initialHandleOut;

        if (pt) seg.point = pt.clone();
        if (hIn) seg.handleIn = hIn.clone();
        if (hOut) seg.handleOut = hOut.clone();
      });
    } else if (this.moveData.type === 'handle') {
      const { path, segmentIndex, handleType, initialPt, finalPt } = this.moveData;
      const seg = path && path.segments ? path.segments[segmentIndex] : this.moveData.segment;
      if (!seg) return;

      const targetPt = useFinal ? finalPt : initialPt;
      if (!targetPt) return;

      if (handleType === 'anchor') {
        seg.point = targetPt.clone();
      } else if (handleType === 'handleIn') {
        seg.handleIn = targetPt.subtract(seg.point);
      } else if (handleType === 'handleOut') {
        seg.handleOut = targetPt.subtract(seg.point);
      }
    } else if (this.moveData.type === 'entities') {
      this.moveData.items.forEach(item => {
        if (!item.entity) return;

        if (item.isPath && item.initialSegments && item.finalSegments) {
          const segments = useFinal ? item.finalSegments : item.initialSegments;
          item.entity.segments.forEach((seg, idx) => {
            if (segments[idx]) {
              seg.point = segments[idx].point.clone();
              seg.handleIn = segments[idx].handleIn.clone();
              seg.handleOut = segments[idx].handleOut.clone();
            }
          });
        } else {
          const pos = useFinal ? item.finalPos : item.initialPos;
          if (pos) item.entity.position = pos.clone();
        }
      });
    }

    if (this.cadService?.selectionRenderEngine?.renderBezierHandles) {
      this.cadService.selectionRenderEngine.renderBezierHandles();
    }
    paper.view.update();
  }
}

export class DeleteCommand {
  constructor(cadService, deleteData) {
    this.cadService = cadService;
    this.deleteData = deleteData;
  }

  execute() {
    this.applyDelete();
  }

  undo() {
    this.restoreDelete();
  }

  applyDelete() {
    if (!this.deleteData) return;

    if (this.deleteData.type === 'handle') {
      const { segment, handleType } = this.deleteData;
      if (segment) {
        if (handleType === 'handleIn') segment.handleIn = new paper.Point(0, 0);
        if (handleType === 'handleOut') segment.handleOut = new paper.Point(0, 0);
      }
    } else if (this.deleteData.type === 'segments') {
      this.deleteData.pathsAffected.forEach(item => {
        item.indicesToDelete.forEach(idx => {
          if (idx >= 0 && idx < item.path.segments.length) {
            item.path.removeSegment(idx);
          }
        });

        item.path.segments.forEach(seg => {
          const origMatch = item.originalSegmentsState.find(o => o.point.getDistance(seg.point) < 0.001);
          if (origMatch) {
            if (origMatch.handleIn.isZero()) seg.handleIn = new paper.Point(0, 0);
            if (origMatch.handleOut.isZero()) seg.handleOut = new paper.Point(0, 0);
          }
        });

        if (item.path.segments.length < 2) {
          const idxInDemo = this.cadService.entities.indexOf(item.path);
          if (idxInDemo !== -1) this.cadService.entities.splice(idxInDemo, 1);
          item.path.remove();
        }
      });
    } else if (this.deleteData.type === 'entities') {
      this.deleteData.entities.forEach(ent => {
        const idx = this.cadService.entities.indexOf(ent);
        if (idx !== -1) this.cadService.entities.splice(idx, 1);
        ent.remove();
      });
    }

    this.cadService.deselectAllEditingEntities();
    if (this.cadService?.selectionRenderEngine?.renderBezierHandles) this.cadService.selectionRenderEngine.renderBezierHandles();
    paper.view.update();
  }

  restoreDelete() {
    if (!this.deleteData) return;

    const drawLayer = window.cadUtils?.drawLayer || paper.project.activeLayer;
    const nodesLayer = window.cadUtils?.nodesLayer;

    if (this.deleteData.type === 'handle') {
      const { segment, handleType, originalVector } = this.deleteData;
      if (segment && originalVector) {
        if (handleType === 'handleIn') segment.handleIn = originalVector.clone();
        if (handleType === 'handleOut') segment.handleOut = originalVector.clone();
      }
    } else if (this.deleteData.type === 'segments') {
      this.deleteData.pathsAffected.forEach(item => {
        const targetLayer = item.path.data?.isPointEntity ? (nodesLayer || drawLayer) : drawLayer;
        if (!item.path.parent || item.path.layer !== targetLayer) {
          targetLayer.addChild(item.path);
        }
        if (!this.cadService.entities.includes(item.path)) {
          this.cadService.entities.push(item.path);
        }

        item.path.segments = item.originalSegmentsState.map(s => new paper.Segment({
          point: s.point.clone(),
          handleIn: s.handleIn.clone(),
          handleOut: s.handleOut.clone()
        }));
      });
    } else if (this.deleteData.type === 'entities') {
      this.deleteData.entities.forEach(ent => {
        const isPoint = ent.data?.isPointEntity;
        const targetLayer = isPoint ? (nodesLayer || drawLayer) : drawLayer;

        if (!ent.parent || ent.layer !== targetLayer) {
          targetLayer.addChild(ent);
        }
        if (!this.cadService.entities.includes(ent)) {
          this.cadService.entities.push(ent);
        }
      });
    }

    if (nodesLayer && drawLayer) {
      nodesLayer.insertAbove(drawLayer);
    }

    this.cadService.entities.forEach(ent => {
      if (ent && ent.data?.isPointEntity) {
        ent.bringToFront();
      }
    });

    if (window.cadUtils) {
      window.cadUtils.selectionRenderEngine.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }
    paper.view.update();
  }
}

export class DivideCommand {
  constructor(cadService, pointsCreated) {
    this.cadService = cadService;
    this.pointsCreated = pointsCreated;
  }

  execute() {
    this.pointsCreated.forEach(pt => {
      if (!this.cadService.entities.includes(pt)) {
        this.cadService.entities.push(pt);
      }
      if (!pt.parent) {
        paper.project.activeLayer.addChild(pt);
      }
    });
    if (this.cadService?.selectionRenderEngine?.renderBezierHandles) {
      this.cadService.selectionRenderEngine.renderBezierHandles();
    }
    paper.view.update();
  }

  undo() {
    this.pointsCreated.forEach(pt => {
      const idx = this.cadService.entities.indexOf(pt);
      if (idx !== -1) {
        this.cadService.entities.splice(idx, 1);
      }
      pt.remove();
    });
    this.cadService.deselectAllEntities();
    if (this.cadService?.selectionRenderEngine?.renderBezierHandles) {
      this.cadService.selectionRenderEngine.renderBezierHandles();
    }
    paper.view.update();
  }
}

export class TrimCommand {
  constructor(cadService, originalPath, remainingPaths, originalIndex) {
    this.cadService = cadService;
    this.originalPath = originalPath;
    this.remainingPaths = remainingPaths;
    this.originalIndex = originalIndex;
    this.targetLayer = (originalPath && originalPath.layer) 
      ? originalPath.layer 
      : (window.cadUtils?.drawLayer || paper.project.activeLayer);
  }

  cleanupEditState() {
    if (typeof this.cadService.deselectAllEditingEntities === 'function') {
      this.cadService.deselectAllEditingEntities();
    } else {
      this.cadService.selectedEntities = [];
      this.cadService.selectedSegments = [];
      this.cadService.editingEntities = [];
    }

    if (Array.isArray(this.cadService.selectedCurves)) {
      this.cadService.selectedCurves = [];
    }

    if (window.cadUtils) {
      window.cadUtils.hoveredCurve = null;
      window.cadUtils.hoveredHandle = null;
      window.cadUtils.clearHoverHighlight();
      window.cadUtils.selectionRenderEngine.updateEntitiesStroke();
    }
  }

  execute() {
    const idx = this.cadService.entities.indexOf(this.originalPath);
    if (idx !== -1) {
      this.cadService.entities.splice(idx, 1);
    }
    this.originalPath.remove();

    this.remainingPaths.forEach(p => {
      if (!p.parent || p.layer !== this.targetLayer) {
        this.targetLayer.addChild(p);
      }
      if (!this.cadService.entities.includes(p)) {
        this.cadService.entities.push(p);
      }
    });

    this.cleanupEditState();
    if (window.cadUtils?.selectionRenderEngine) window.cadUtils.selectionRenderEngine.renderBezierHandles();
    paper.view.update();
  }

  undo() {
    this.remainingPaths.forEach(p => {
      const idx = this.cadService.entities.indexOf(p);
      if (idx !== -1) {
        this.cadService.entities.splice(idx, 1);
      }
      p.remove();
    });

    if (!this.originalPath.parent || this.originalPath.layer !== this.targetLayer) {
      this.targetLayer.addChild(this.originalPath);
    }
    this.originalPath.visible = true;

    if (!this.cadService.entities.includes(this.originalPath)) {
      if (this.originalIndex !== -1 && this.originalIndex <= this.cadService.entities.length) {
        this.cadService.entities.splice(this.originalIndex, 0, this.originalPath);
      } else {
        this.cadService.entities.push(this.originalPath);
      }
    }

    this.cleanupEditState();
    if (window.cadUtils?.selectionRenderEngine) window.cadUtils.selectionRenderEngine.renderBezierHandles();
    paper.view.update();
  }
}

export class ExtendCommand {
  constructor(cadService, path, initialSegments, finalSegments) {
    this.cadService = cadService;
    this.path = path;
    this.initialSegments = initialSegments;
    this.finalSegments = finalSegments;
  }

  execute() {
    this.applySegments(this.finalSegments);
  }

  undo() {
    this.applySegments(this.initialSegments);
  }

  applySegments(segmentsData) {
    if (!this.path) return;

    while (this.path.segments.length > segmentsData.length) {
      this.path.removeSegment(this.path.segments.length - 1);
    }
    while (this.path.segments.length < segmentsData.length) {
      this.path.addSegment(new paper.Point(0, 0));
    }

    segmentsData.forEach((s, i) => {
      this.path.segments[i].point = s.point.clone();
      this.path.segments[i].handleIn = s.handleIn.clone();
      this.path.segments[i].handleOut = s.handleOut.clone();
    });

    if (window.cadUtils?.selectionRenderEngine) {
      window.cadUtils.selectionRenderEngine.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }
    paper.view.update();
  }
}

export class TransformEntityCommand {
  constructor(cadService, entity, initialState, finalState) {
    this.cadService = cadService;
    this.entity = entity;
    this.initialState = initialState;
    this.finalState = finalState;
  }

  execute() {
    this.applyState(this.finalState);
  }

  undo() {
    this.applyState(this.initialState);
  }

  applyState(state) {
    if (!this.entity || !state) return;

    if (state.matrix && this.entity.matrix) {
      this.entity.matrix = state.matrix.clone();
    } else {
      if (state.position) {
        this.entity.position = state.position.clone();
      }
      if (this.entity.bounds) {
        if (state.boundsWidth !== undefined) this.entity.bounds.width = state.boundsWidth;
        if (state.boundsHeight !== undefined) this.entity.bounds.height = state.boundsHeight;
        if (state.position) this.entity.position = state.position.clone();
      }
    }

    if (window.cadUtils?.selectionRenderEngine) {
      window.cadUtils.selectionRenderEngine.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }
    paper.view.update();
  }
}