/**
 * tools/select/ParametricGripHandler.js - Gestor de interacción y transformaciones con Grips Paramétricos
 */

import { TransformEntityCommand } from '../../services/commands/cadCommands.js';

export class ParametricGripHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.activeGripEntity = null;
    this.activeGripId = null;
    this.gripStartPoint = null;
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  hitTest(point) {
    const handlesGroup = this.utils.controlHandlesGroup;
    if (!handlesGroup) return null;

    const zoom = this._getPaper()?.view?.zoom || 1;
    const tolerance = 8 / zoom;

    const markerHit = handlesGroup.hitTest(point, {
      fill: true,
      stroke: true,
      tolerance,
      match: (res) => Boolean(res.item?.data?.isParametricGrip && !res.item.data.isParametricEdge)
    });
    if (markerHit) return markerHit;

    let closestEdge = null;
    let minDistance = tolerance;

    (handlesGroup.children || []).forEach((item) => {
      if (!item?.data?.isParametricEdge || typeof item.getNearestLocation !== 'function') return;

      const loc = item.getNearestLocation(point);
      if (loc?.point) {
        const dist = loc.point.getDistance(point);
        if (dist <= minDistance) {
          minDistance = dist;
          closestEdge = item;
        }
      }
    });

    return closestEdge ? { item: closestEdge } : null;
  }

  handleHover(point) {
    const hitGrip = this.hitTest(point);
    const paperInst = this._getPaper();

    if (hitGrip && hitGrip.item && hitGrip.item.data) {
      if (this.service.hoveredEntity) {
        this.utils.clearHoverHighlight();
      }
      document.body.style.cursor = hitGrip.item.data.cursor || 'default';
      const newHover = {
        entity: hitGrip.item.data.entity,
        gripId: hitGrip.item.data.gripId
      };

      if (!this.utils.hoveredParametricGrip ||
          this.utils.hoveredParametricGrip.entity !== newHover.entity ||
          this.utils.hoveredParametricGrip.gripId !== newHover.gripId) {
        this.utils.hoveredParametricGrip = newHover;
        if (this.utils.selectionRenderEngine?.renderBezierHandles) {
          this.utils.selectionRenderEngine.renderBezierHandles();
        }
        if (paperInst?.view) {
          paperInst.view.update();
        }
      }
      return true;
    }

    if (this.utils.hoveredParametricGrip) {
      this.utils.hoveredParametricGrip = null;
      if (this.utils.selectionRenderEngine?.renderBezierHandles) {
        this.utils.selectionRenderEngine.renderBezierHandles();
      }
      if (paperInst?.view) {
        paperInst.view.update();
      }
    }
    return false;
  }

  onMouseDown(event, hitGrip) {
    const point = event.point || event;
    const itemData = hitGrip?.item?.data || hitGrip?.data;
    if (!itemData) return;

    this.activeGripEntity = itemData.entity;
    this.activeGripId = itemData.gripId;
    this.gripStartPoint = point.clone();

    this.utils.activeParametricGrip = { entity: itemData.entity, gripId: itemData.gripId };
    if (this.utils.selectionRenderEngine.renderBezierHandles) this.utils.selectionRenderEngine.renderBezierHandles();

    const controller = this.activeGripEntity?.data?.controller;
    if (controller && typeof controller.startTransform === 'function') {
      controller.startTransform();
    }
  }

  onMouseDrag(event) {
    if (!this.activeGripEntity || !this.activeGripId || !this.gripStartPoint) {
      return false;
    }

    const controller = this.activeGripEntity.data?.controller;
    if (!controller || typeof controller.onGripDrag !== 'function') {
      return false;
    }

    this.utils.hud.clear();
    const isShift = event.event ? event.event.shiftKey : false;
    const isCenterGrip = this.activeGripId === 'center';

    // En el grip central se aplica Ortogonal con F8/Shift; en esquinas y bordes Shift queda libre para escalado simétrico
    const targetPt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint: isCenterGrip ? this.gripStartPoint : null,
      isShift: isCenterGrip ? isShift : false,
      excludeEntity: this.activeGripEntity,
      ignoreEntities: [this.activeGripEntity]
    });

    this.utils.hud.updateHUD(targetPt);

    controller.onGripDrag(this.activeGripId, targetPt, this.gripStartPoint, {
      isShiftPressed: isShift
    });

    if (this.utils.selectionRenderEngine?.renderBezierHandles) {
      this.utils.selectionRenderEngine.renderBezierHandles();
    }
    const paperInst = this._getPaper();
    if (paperInst?.view) {
      paperInst.view.update();
    }

    return true;
  }

  onMouseUp() {
    if (!this.activeGripEntity || !this.activeGripId) return false;

    const controller = this.activeGripEntity.data?.controller;
    if (controller) {
      const initialState = {
        position: controller.initialPosition ? controller.initialPosition.clone() : this.activeGripEntity.position.clone(),
        boundsWidth: controller.initialBounds ? controller.initialBounds.width : this.activeGripEntity.bounds.width,
        boundsHeight: controller.initialBounds ? controller.initialBounds.height : this.activeGripEntity.bounds.height,
        matrix: controller.initialMatrix ? controller.initialMatrix.clone() : (this.activeGripEntity.matrix ? this.activeGripEntity.matrix.clone() : null)
      };
      const finalState = {
        position: this.activeGripEntity.position.clone(),
        boundsWidth: this.activeGripEntity.bounds.width,
        boundsHeight: this.activeGripEntity.bounds.height,
        matrix: this.activeGripEntity.matrix ? this.activeGripEntity.matrix.clone() : null
      };

      const cmd = new TransformEntityCommand(this.service, this.activeGripEntity, initialState, finalState);
      this.service.executeCommand(cmd);
    }

    this.reset();
    if (this.utils?.selectionRenderEngine?.renderBezierHandles) this.utils.selectionRenderEngine.renderBezierHandles();
    return true;
  }

  isActive() {
    return !!(this.activeGripEntity && this.activeGripId);
  }

  reset() {
    this.activeGripEntity = null;
    this.activeGripId = null;
    this.gripStartPoint = null;
    if (this.utils) {
      this.utils.activeParametricGrip = null;
      this.utils.hoveredParametricGrip = null;
    }
  }
}