/**
 * tools/select/ParametricGripHandler.js - Gestor de interacción y transformaciones con Grips Paramétricos
 */

import { TransformEntityCommand } from '../../services/commands/cadCommands.js';
import { MixedDragSession } from './MixedDragSession.js';

export class ParametricGripHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.session = new MixedDragSession(cadService, cadUtils);
    this.activeGripEntity = null;
    this.activeGripId = null;
    this.gripStartPoint = null;
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  _isEntityEditableByGrips(entity) {
    if (!entity) return false;
    return Boolean(this.service.editingEntities?.includes(entity));
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
      match: (res) => Boolean(
        res.item?.data?.isParametricGrip &&
        !res.item.data.isParametricEdge &&
        this._isEntityEditableByGrips(res.item.data.entity)
      )
    });
    if (markerHit) return markerHit;

    let closestEdge = null;
    let minDistance = tolerance;

    (handlesGroup.children || []).forEach((item) => {
      if (!item?.data?.isParametricEdge || typeof item.getNearestLocation !== 'function') return;
      if (!this._isEntityEditableByGrips(item.data.entity)) return;

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
    this.session.begin(point, event.event || null);

    this.utils.activeParametricGrip = { entity: itemData.entity, gripId: itemData.gripId };
    if (this.utils.selectionRenderEngine?.renderBezierHandles) {
      this.utils.selectionRenderEngine.renderBezierHandles();
    }

    const controller = this.activeGripEntity?.data?.controller;
    if (controller && typeof controller.startTransform === 'function') {
      controller.startTransform();
    }
  }

  onMouseDrag(event) {
    if (!this.activeGripEntity || !this.activeGripId || !this.gripStartPoint) {
      return false;
    }

    if (!this.session.hasExceededThreshold(event)) {
      return true;
    }

    const controller = this.activeGripEntity.data?.controller;
    if (!controller || typeof controller.onGripDrag !== 'function') {
      return false;
    }

    this.utils.hud.clear();
    const isShift = event.event ? event.event.shiftKey : false;
    const isCenterGrip = this.activeGripId === 'center';

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
    if (controller && this.session.isConfirmed) {
      const initialState = typeof controller.getInitialTransformState === 'function'
        ? controller.getInitialTransformState()
        : null;
      const finalState = typeof controller.getTransformState === 'function'
        ? controller.getTransformState()
        : null;

      if (initialState && finalState) {
        const cmd = new TransformEntityCommand(this.service, this.activeGripEntity, initialState, finalState);
        this.service.executeCommand(cmd);
      }
    }

    if (controller && typeof controller.endTransform === 'function') {
      controller.endTransform();
    }

    this.reset();
    if (this.utils?.selectionRenderEngine?.renderBezierHandles) {
      this.utils.selectionRenderEngine.renderBezierHandles();
    }
    return true;
  }

  isActive() {
    return !!(this.activeGripEntity && this.activeGripId);
  }

  cancelDrag() {
    if (!this.activeGripEntity) return false;

    const controller = this.activeGripEntity.data?.controller;
    if (controller && this.session?.isConfirmed && typeof controller.cancelTransform === 'function') {
      controller.cancelTransform();
    }

    this.reset();
    if (this.utils?.selectionRenderEngine?.renderBezierHandles) {
      this.utils.selectionRenderEngine.renderBezierHandles();
    }
    const paperInst = this._getPaper();
    if (paperInst?.view) {
      paperInst.view.update();
    }
    return true;
  }

  reset() {
    const controller = this.activeGripEntity?.data?.controller;
    if (controller && typeof controller.endTransform === 'function') {
      controller.endTransform();
    }

    this.session?.reset();
    this.activeGripEntity = null;
    this.activeGripId = null;
    this.gripStartPoint = null;
    if (this.utils) {
      this.utils.activeParametricGrip = null;
      this.utils.hoveredParametricGrip = null;
    }
  }
}