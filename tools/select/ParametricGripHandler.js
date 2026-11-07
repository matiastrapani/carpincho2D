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

  hitTest(point) {
    const handlesGroup = this.utils.controlHandlesGroup;
    if (!handlesGroup) return null;

    return handlesGroup.hitTest(point, {
      fill: true,
      stroke: true,
      tolerance: 8 / paper.view.zoom,
      match: (res) => res.item.data?.isParametricGrip
    });
  }

  handleHover(point) {
    const hitGrip = this.hitTest(point);

    if (hitGrip && hitGrip.item && hitGrip.item.data) {
      document.body.style.cursor = hitGrip.item.data.cursor || 'default';
      const newHover = { 
        entity: hitGrip.item.data.entity, 
        gripId: hitGrip.item.data.gripId 
      };

      if (!this.utils.hoveredParametricGrip || 
          this.utils.hoveredParametricGrip.entity !== newHover.entity || 
          this.utils.hoveredParametricGrip.gripId !== newHover.gripId) {
        this.utils.hoveredParametricGrip = newHover;
        if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();
      }
      return true;
    } 
    
    if (this.utils.hoveredParametricGrip) {
      this.utils.hoveredParametricGrip = null;
      if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();
    }
    return false;
  }

  onMouseDown(point, hitGripItem) {
    const data = hitGripItem.data;
    this.activeGripEntity = data.entity;
    this.activeGripId = data.gripId;
    this.gripStartPoint = point.clone();

    this.utils.activeParametricGrip = { entity: data.entity, gripId: data.gripId };
    if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();

    const controller = this.activeGripEntity?.data?.controller;
    if (controller && typeof controller.startTransform === 'function') {
      controller.startTransform();
    }
  }

  onMouseDrag(point, isShiftPressed) {
    if (!this.activeGripEntity || !this.activeGripId) return false;

    const controller = this.activeGripEntity.data?.controller;
    let targetPt = point.clone();

    // Calcular OSNAP omitiendo la entidad que se está transformando
    const osnap = this.service.calculateOsnap(
      point,
      (snapPt, type) => this.utils.renderSnapMarker(snapPt, type),
      null,
      { ignoreEntities: [this.activeGripEntity] }
    );

    if (osnap.type) {
      targetPt = osnap.point;
    }

    if (controller && typeof controller.onGripDrag === 'function') {
      controller.onGripDrag(this.activeGripId, targetPt, this.gripStartPoint, { isShiftPressed });
      if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();
      paper.view.update();
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

    this.activeGripEntity = null;
    this.activeGripId = null;
    this.gripStartPoint = null;
    this.utils.activeParametricGrip = null;
    if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();

    return true;
  }

  reset() {
    this.activeGripEntity = null;
    this.activeGripId = null;
    this.gripStartPoint = null;
    if (this.utils) {
      this.utils.activeParametricGrip = null;
    }
  }

  isActive() {
    return !!(this.activeGripEntity && this.activeGripId);
  }
}