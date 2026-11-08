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
        if (this.utils.selectionRenderEngine.renderBezierHandles) this.utils.selectionRenderEngine.renderBezierHandles();
      }
      return true;
    } 
    
    if (this.utils.hoveredParametricGrip) {
      this.utils.hoveredParametricGrip = null;
      if (this.utils.selectionRenderEngine.renderBezierHandles) this.utils.selectionRenderEngine.renderBezierHandles();
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
    if (!this.activeGripEntity || !this.activeGripId) return false;

    const point = event.point || event;
    const isShiftPressed = event.event?.shiftKey || false;
    const controller = this.activeGripEntity.data?.controller;
    let targetPt = point.clone();

    // OSNAP omitiendo la entidad que se está transformando
    const osnap = this.service.calculateOsnap(
      point,
      (snapPt, type) => this.utils.hud.renderSnapMarker(snapPt, type),
      null,
      { ignoreEntities: [this.activeGripEntity] }
    );

    if (osnap?.type) {
      targetPt = osnap.point;
    }

    if (controller && typeof controller.onGripDrag === 'function') {
      controller.onGripDrag(this.activeGripId, targetPt, this.gripStartPoint, { isShiftPressed });
      if (this.utils.selectionRenderEngine.renderBezierHandles) this.utils.selectionRenderEngine.renderBezierHandles();
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
    }
  }
}