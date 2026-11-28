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

    if (this.moveData.type === 'mixed') {
      this._applyMixedState(useFinal);
    } else if (this.moveData.type === 'segments') {
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

  _applyMixedState(useFinal) {
    (this.moveData.entities || []).forEach((item) => {
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

    (this.moveData.segments || []).forEach((item) => {
      const seg = item.path && item.path.segments ? item.path.segments[item.segmentIndex] : item.segment;
      if (!seg) return;

      const pt = useFinal ? item.finalPt : item.initialPt;
      const hIn = useFinal ? item.finalHandleIn : item.initialHandleIn;
      const hOut = useFinal ? item.finalHandleOut : item.initialHandleOut;

      if (pt) seg.point = pt.clone();
      if (hIn) seg.handleIn = hIn.clone();
      if (hOut) seg.handleOut = hOut.clone();
    });

    (this.moveData.handles || []).forEach((item) => {
      const seg = item.path && item.path.segments ? item.path.segments[item.segmentIndex] : item.segment;
      if (!seg) return;

      const vec = useFinal ? item.finalVector : item.initialVector;
      if (vec && (item.handleType === 'handleIn' || item.handleType === 'handleOut')) {
        seg[item.handleType] = vec.clone();
      }
    });
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

    const utils = this.cadService.utils;
    const layerManager = utils?.layerManager;
    const drawLayer = utils?.drawLayer || paper.project.activeLayer;
    const pointsLayer = utils?.pointsLayer;

    if (this.deleteData.type === 'handle') {
      const { segment, handleType, originalVector } = this.deleteData;
      if (segment && originalVector) {
        if (handleType === 'handleIn') segment.handleIn = originalVector.clone();
        if (handleType === 'handleOut') segment.handleOut = originalVector.clone();
      }
    } else if (this.deleteData.type === 'segments') {
      this.deleteData.pathsAffected.forEach((item) => {
        if (layerManager) {
          const targetLayerId = String(item.path.data?.layerId || layerManager.activeLayerId || '0');
          layerManager.assignEntityToLayer(item.path, targetLayerId);
        } else {
          const fallbackLayer = item.path.data?.isPointEntity ? (pointsLayer || drawLayer) : drawLayer;
          if (!item.path.parent || item.path.layer !== fallbackLayer) {
            fallbackLayer.addChild(item.path);
          }
        }

        if (!this.cadService.entities.includes(item.path)) {
          this.cadService.entities.push(item.path);
        }

        item.path.segments = item.originalSegmentsState.map((s) => new paper.Segment({
          point: s.point.clone(),
          handleIn: s.handleIn.clone(),
          handleOut: s.handleOut.clone()
        }));
      });
    } else if (this.deleteData.type === 'entities') {
      this.deleteData.entities.forEach((ent) => {
        if (layerManager) {
          const targetLayerId = String(ent.data?.layerId || layerManager.activeLayerId || '0');
          layerManager.assignEntityToLayer(ent, targetLayerId);
        } else {
          const fallbackLayer = ent.data?.isPointEntity ? (pointsLayer || drawLayer) : drawLayer;
          if (!ent.parent || ent.layer !== fallbackLayer) {
            fallbackLayer.addChild(ent);
          }
        }

        if (!this.cadService.entities.includes(ent)) {
          this.cadService.entities.push(ent);
        }
      });
    }

    if (layerManager) {
      layerManager.syncZOrder();
    }

    const renderEngine = this.cadService.selectionRenderEngine || utils?.selectionRenderEngine;
    if (renderEngine) {
      renderEngine.updateEntitiesStroke();
      renderEngine.renderBezierHandles();
    }
    if (typeof paper !== 'undefined' && paper.view) {
      paper.view.update();
    }
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

    const controller = this.entity.data?.controller;
    if (controller && typeof controller.applyTransformState === 'function') {
      controller.applyTransformState(state);
    } else if (state.matrix && this.entity.matrix) {
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

    const utils = this.cadService?.utils || null;
    const renderEngine = this.cadService?.selectionRenderEngine || utils?.selectionRenderEngine;
    if (renderEngine) {
      renderEngine.updateEntitiesStroke();
      renderEngine.renderBezierHandles();
    }

    const paperInst = utils?.paper || (typeof paper !== 'undefined' ? paper : null);
    if (paperInst?.view) {
      paperInst.view.update();
    }
  }
}