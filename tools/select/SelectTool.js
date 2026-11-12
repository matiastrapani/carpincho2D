/**
 * tools/SelectTool.js - Herramienta de Selección con Estado Encapsulado y Submódulos Delegados
 */
import { BaseTool } from '../BaseTool.js';
import { MoveCommand, TransformEntityCommand } from '../../services/commands/cadCommands.js';
import { HandleSelectionHandler } from './HandleSelectionHandler.js';
import { BoxSelectHandler } from './BoxSelectHandler.js';
import { ParametricGripHandler } from './ParametricGripHandler.js';
import { SegmentEditHandler } from './SegmentEditHandler.js';

export class SelectTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);

    // Control de doble clic
    this.lastClickTime = 0;
    this.lastClickEntity = null;

    this.boxSelectHandler = new BoxSelectHandler(cadService, cadUtils);
    this.handleModule = new HandleSelectionHandler(cadService, cadUtils);
    this.parametricHandler = new ParametricGripHandler(cadService, cadUtils);
    this.segmentEditHandler = new SegmentEditHandler(cadService, cadUtils);
    this.activeModule = null;

    this.resetDragState();
  }

  resetDragState() {
    this.dragState = {
      mouseStartPt: null,
      dragAnchorEntity: null,
      entityStartPositions: null,
      selectionStartPoint: null,
      selectionBoxRect: null,
      pivotPoint: null,
      isPivotFromPoint: false
    };
  }

  onMouseDown(event) {
    if (event.event && (event.event.button === 2 || event.event.which === 3)) {
      return;
    }

    this.utils.hud.clear();
    this.utils.hoveredHandle = null;
    this.utils.hoveredCurve = null;
    if (this.service.hoveredEntity) {
      this.utils.clearHoverHighlight();
    }

    const isShift = event.event.shiftKey;

    const hitGrip = this.parametricHandler.hitTest(event.point);
    if (hitGrip) {
      this.activeModule = this.parametricHandler;
      this.activeModule.onMouseDown(event, hitGrip);
      return;
    }

    const hitHandle = this.handleModule.hitTest(event.point);
    if (hitHandle) {
      const segPath = hitHandle.item?.data?.segment?.path || hitHandle.segment?.path;
      const isPathFullySelected = segPath && this.service.selectedEntities.includes(segPath);

      if (!isPathFullySelected) {
        this.activeModule = this.handleModule;
        this.activeModule.onMouseDown(event, hitHandle);
        return;
      }
    }

    const getRootEntity = (item) => {
      let current = item;
      while (current) {
        if (this.service.demoEntities.includes(current)) return current;
        current = current.parent;
      }
      return item;
    };

    const hitEntity = paper.project.hitTest(event.point, {
      stroke: true, fill: true, pixels: true, tolerance: 8 / paper.view.zoom,
      match: (res) => {
        const root = getRootEntity(res.item);
        if (!this.service.demoEntities.includes(root)) return false;

        const layerId = String(root.data?.layerId || '0');
        const layer = this.utils.layerManager?.layers?.get(layerId);
        if (layer && layer.locked) return false;

        if (root instanceof paper.Raster || res.item instanceof paper.Raster) return true;
        if (root.data?.isPointEntity || res.item.data?.isPointEntity) return true;
        if (res.type === 'stroke') return true;
        if (res.type === 'fill') {
          const fill = res.item.fillColor || root.fillColor;
          return !!(fill && fill.alpha > 0);
        }
        return false;
      }
    });

    if (hitEntity && hitEntity.item) {
      const targetItem = getRootEntity(hitEntity.item);

      const now = Date.now();
      const isDoubleClick = (now - this.lastClickTime) < 300 && this.lastClickEntity === targetItem;
      this.lastClickTime = now;
      this.lastClickEntity = targetItem;

      if (isDoubleClick && (targetItem instanceof paper.Path) && !targetItem.data?.isPointEntity) {
        this.segmentEditHandler.enterEditMode(targetItem);
        this.dragState.dragAnchorEntity = null;
        return;
      }

      if (this.segmentEditHandler.onMouseDown(event, targetItem, hitEntity)) {
        return;
      }

      const isAlreadySelected = this.service.selectedEntities.includes(targetItem);
      if (isShift) {
        if (isAlreadySelected) {
          this.service.deselectEntity(targetItem);
          this.service.editingEntities = this.service.editingEntities.filter((ent) => ent !== targetItem);
        } else {
          this.service.selectEntity(targetItem, true);
          this.service.editingEntities = [];
          this.service.deselectAllSegments();
        }
      } else if (!isAlreadySelected) {
        this.service.selectEntity(targetItem, false);
        this.service.editingEntities = [];
        this.service.deselectAllSegments();
      }

      this.dragState.dragAnchorEntity = targetItem;
      this.dragState.mouseStartPt = event.point.clone();

      const checkIsPoint = (ent) => {
        let current = ent;
        while (current) {
          if (current.data?.isPointEntity || current.data?.isPoint || current.data?.type === 'point' || current.data?.type === 'Point' || current.data?.isPointShape) {
            return true;
          }
          current = current.parent;
        }
        return false;
      };

      let closestVertex = null;
      let minDistance = Infinity;
      const isPivotFromPoint = checkIsPoint(targetItem);

      if (isPivotFromPoint) {
        closestVertex = targetItem.position || targetItem.bounds?.center;
      } else if (targetItem instanceof paper.Raster && targetItem.bounds) {
        const b = targetItem.bounds;
        [b.topLeft, b.topCenter, b.topRight, b.rightCenter, b.bottomRight, b.bottomCenter, b.bottomLeft, b.leftCenter, b.center].forEach((pt) => {
          const dist = pt.getDistance(event.point);
          if (dist < minDistance) {
            minDistance = dist;
            closestVertex = pt.clone();
          }
        });
      } else if (targetItem instanceof paper.Path && targetItem.segments) {
        targetItem.segments.forEach((seg) => {
          const dist = seg.point.getDistance(event.point);
          if (dist < minDistance) {
            minDistance = dist;
            closestVertex = seg.point.clone();
          }
        });
      }

      this.dragState.pivotPoint = closestVertex || event.point.clone();
      this.dragState.isPivotFromPoint = isPivotFromPoint;

      this.dragState.entityStartPositions = this.service.selectedEntities.map((ent) => {
        const isPath = ent instanceof paper.Path && !checkIsPoint(ent);
        return {
          entity: ent,
          isPath,
          initialPos: checkIsPoint(ent) ? (ent.bounds ? ent.bounds.center.clone() : ent.position.clone()) : ent.position.clone(),
          initialSegments: isPath ? ent.segments.map((s) => ({
            point: s.point.clone(),
            handleIn: s.handleIn.clone(),
            handleOut: s.handleOut.clone()
          })) : null
        };
      });

      this.utils.selectionRenderEngine.renderBezierHandles();
      if (this.dragState.pivotPoint && !this.dragState.isPivotFromPoint) {
        this.utils.renderPivotMarker(this.dragState.pivotPoint);
      }
    } else {
      if (!isShift) {
        this.service.deselectAllEntities();
      }
      this.dragState.selectionStartPoint = event.point.clone();
      this.boxSelectHandler.startBox(event.point);
    }
  }

  onMouseDrag(event) {
    if (this.activeModule) {
      this.activeModule.onMouseDrag(event);
      return;
    }

    if (!this.dragState.selectionStartPoint && this.segmentEditHandler.onMouseDrag(event)) {
      return;
    }

    if (this.service.selectedEntities.length > 0 && !this.dragState.selectionStartPoint && this.dragState.mouseStartPt && this.dragState.entityStartPositions) {
      const isShift = event.event ? event.event.shiftKey : false;
      const targetMousePt = this.utils.applyOrthoConstraint(this.dragState.mouseStartPt, event.point, isShift);

      const pivotPoint = this.dragState.pivotPoint || this.dragState.mouseStartPt;
      const grabOffset = pivotPoint.subtract(this.dragState.mouseStartPt);
      const projectedPivot = targetMousePt.add(grabOffset);

      const osnap = this.service.calculateOsnap(
        projectedPivot,
        (pt, type) => this.utils.hud.renderSnapMarker(pt, type),
        null,
        { ignoreEntities: this.service.selectedEntities }
      );

      const finalTargetPivot = (osnap && osnap.type) ? osnap.point : projectedPivot;
      this.utils.hud.updateHUD(finalTargetPivot);
      const globalDelta = finalTargetPivot.subtract(pivotPoint);

      this.dragState.entityStartPositions.forEach((item) => {
        if (!item.entity) return;
        if (item.isPath && item.initialSegments) {
          item.entity.segments.forEach((seg, idx) => {
            if (item.initialSegments[idx]) {
              seg.point = item.initialSegments[idx].point.add(globalDelta);
            }
          });
        } else {
          item.entity.position = item.initialPos.add(globalDelta);
        }
      });

      this.utils.selectionRenderEngine.renderBezierHandles();
      if (!this.dragState.isPivotFromPoint) {
        this.utils.renderPivotMarker(finalTargetPivot);
      }
      return;
    }

    this.utils.hud.clear();
    if (this.dragState.selectionStartPoint) {
      this.boxSelectHandler.updateBox(event.point);
    }
  }

  onMouseUp(event) {
    if (this.activeModule) {
      this.activeModule.onMouseUp(event);
      this.activeModule = null;
      return;
    }

    if (this.segmentEditHandler.onMouseUp()) {
      this.cleanBox();
      return;
    }

    if (this.dragState.entityStartPositions && this.dragState.entityStartPositions.length > 0) {
      const movedEntitiesData = [];
      let hasMoved = false;

      this.dragState.entityStartPositions.forEach((item) => {
        if (!item.entity) return;

        const isPath = item.isPath;
        const finalPos = isPath ? null : (item.entity.data?.isPointEntity ? item.entity.bounds.center.clone() : item.entity.position.clone());
        const finalSegments = isPath ? item.entity.segments.map((s) => ({
          point: s.point.clone(),
          handleIn: s.handleIn.clone(),
          handleOut: s.handleOut.clone()
        })) : null;

        if (isPath) {
          hasMoved = finalSegments.some((s, idx) =>
            !s.point.equals(item.initialSegments[idx].point) ||
            !s.handleIn.equals(item.initialSegments[idx].handleIn) ||
            !s.handleOut.equals(item.initialSegments[idx].handleOut)
          );
        } else if (finalPos && item.initialPos) {
          hasMoved = !finalPos.equals(item.initialPos);
        }

        movedEntitiesData.push({
          entity: item.entity,
          isPath,
          initialPos: item.initialPos ? item.initialPos.clone() : null,
          finalPos,
          initialSegments: item.initialSegments,
          finalSegments
        });
      });

      if (hasMoved) {
        const moveCmd = new MoveCommand(this.service, { type: 'entities', items: movedEntitiesData });
        this.service.executeCommand(moveCmd);
      }
    }

    if (this.dragState.selectionStartPoint) {
      this.boxSelectHandler.finishBox(event.point, event.event.shiftKey);
    }

    this.cleanBox();
  }

  onMouseMove(event) {
    this.utils.hud.clear();

    if (this.dragState.selectionStartPoint || this.dragState.mouseStartPt) {
      return;
    }

    if (this.parametricHandler.handleHover(event.point)) {
      return;
    }

    document.body.style.cursor = 'default';
    const point = event.point;
    const zoom = paper.view.zoom;

    if (this.segmentEditHandler.handleHover(point, zoom)) {
      return;
    }

    const hitEntity = paper.project.hitTest(point, {
      stroke: true, fill: true, tolerance: 6 / zoom,
      match: (res) => {
        let curr = res.item;
        while (curr && !this.service.demoEntities.includes(curr)) curr = curr.parent;
        if (!curr || !this.service.demoEntities.includes(curr)) return false;

        const layerId = String(curr.data?.layerId || '0');
        const layer = this.utils.layerManager?.layers?.get(layerId);
        if (layer && layer.locked) return false;

        if (res.item.data?.isPointEntity || res.item.parent?.data?.isPointEntity) return true;
        if (res.type === 'stroke') return true;
        if (res.type === 'fill') return !!(res.item.fillColor && res.item.fillColor.alpha > 0);
        return false;
      }
    });

    if (hitEntity && hitEntity.item) {
      const targetItem = hitEntity.item;
      const isEditingOrSelected = this.service.editingEntities.includes(targetItem) ||
        this.service.selectedEntities.includes(targetItem);

      if (!isEditingOrSelected) {
        if (this.service.hoveredEntity !== targetItem) {
          this.utils.clearHoverHighlight();
          this.service.hoveredEntity = targetItem;
          this.utils.selectionRenderEngine.updateEntitiesStroke();
        }
      } else if (this.service.hoveredEntity) {
        this.utils.clearHoverHighlight();
      }
    } else if (this.service.hoveredEntity) {
      this.utils.clearHoverHighlight();
    }
  }

  onKeyDown(event) {
    const key = event.key || event.code;

    if (key === 'Escape') {
      // 1. MODO EDICIÓN DE NODOS ACTIVO
      if (this.service.editingEntities && this.service.editingEntities.length > 0) {
        const hasSelectedSegments = this.service.selectedSegments && this.service.selectedSegments.length > 0;
        const hasSelectedHandles = this.service.selectedHandles && this.service.selectedHandles.length > 0;

        // Primer ESC: Si hay nodos o asas seleccionadas, suelta esa selección
        if (hasSelectedSegments || hasSelectedHandles) {
          this.service.deselectAllSegments();
          this.service.deselectAllHandles();
        } else {
          // Segundo ESC (o si no hay nada seleccionado): Sale del modo edición de nodos
          this.service.editingEntities = [];
          this.service.deselectAllSegments();
          this.service.deselectAllHandles();
          this.utils.hoveredHandle = null;
          this.utils.hoveredCurve = null;
          this.utils.setPrompt('Herramienta Selección: selecciona objetos o haz doble clic en un trazo para editar sus nodos.');
        }

        if (this.utils.selectionRenderEngine.renderBezierHandles) this.utils.selectionRenderEngine.renderBezierHandles();
        if (this.utils.selectionRenderEngine.updateEntitiesStroke) this.utils.selectionRenderEngine.updateEntitiesStroke();
        if (paper.view) paper.view.update();
        return true;
      }

      // 2. MODO SELECCIÓN NORMAL (Lienzo con entidades seleccionadas)
      if (this.service.selectedEntities && this.service.selectedEntities.length > 0) {
        this.service.deselectAllEntities();
        this.service.deselectAllSegments();
        this.cleanBox();
        return true;
      }

      return super.onKeyDown(event);
    }

    return false;
  }

  cleanBox() {
    if (this.dragState.selectionBoxRect) {
      this.dragState.selectionBoxRect.remove();
    }
    this.parametricHandler.reset();
    this.segmentEditHandler.reset();
    this.utils.selectedHandle = null;
    this.utils.hoveredHandle = null;
    this.utils.hoveredCurve = null;
    this.utils.clearHoverHighlight();
    this.resetDragState();

    this.utils.selectionRenderEngine.updateEntitiesStroke();
    this.utils.selectionRenderEngine.renderBezierHandles();

    if (paper.view) paper.view.update();
  }

  onContextMenu(event) {
    // Limpiar el estado de hover si existía
    if (this.service.hoveredEntity) {
      this.utils.clearHoverHighlight();
      this.service.hoveredEntity = null;
    }
    
    // 1. Si hay elementos seleccionados, limpia la selección
    if (this.service.selectedEntities && this.service.selectedEntities.length > 0) {
      this.service.deselectAllEntities();
      this.service.editingEntities = [];
      this.service.deselectAllSegments();
      if (this.utils.selectionRenderEngine.renderBezierHandles) this.utils.selectionRenderEngine.renderBezierHandles();
      if (this.utils.selectionRenderEngine.updateEntitiesStroke) this.utils.selectionRenderEngine.updateEntitiesStroke();
      if (window.paper?.view) window.paper.view.update();
      return true; // Cancela selección sin activar repetición
    }

    // 2. Si el lienzo está limpio, retorna false para que cadUtils reactive la última herramienta
    return false;
  }

  cancel() {
    this.cleanBox();
    this.utils.hud.clear();
    this.service.editingEntities = [];
    this.service.deselectAllEntities();
    this.service.deselectAllSegments();


    this.utils.selectionRenderEngine.renderBezierHandles();
    paper.view.update();
  }
}