/**
 * tools/SelectTool.js - Herramienta de Selección con Estado Encapsulado y Submódulos Delegados
 */
import { BaseTool } from '../BaseTool.js';
import { MoveCommand, TransformEntityCommand } from '../../services/commands/cadCommands.js';
import { HandleSelectionHandler } from './HandleSelectionHandler.js';
import { BoxSelectHandler } from './BoxSelectHandler.js';
import { ParametricGripHandler } from './ParametricGripHandler.js';
import { SegmentEditHandler } from './SegmentEditHandler.js';
import { SelectionMenuHandler } from './SelectionMenuHandler.js';

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
    this.selectionMenuHandler = new SelectionMenuHandler(cadService, cadUtils);
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
      isPivotFromPoint: false,
      pendingMenuHits: null,
      pendingMenuEvent: null,
      pendingMenuPoint: null,
      pendingMenuShift: false
    };
  }

  _applyEntitySelection(targetItem, point, isShift, enableDrag = true) {
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

    if (enableDrag) {
      this.dragState.dragAnchorEntity = targetItem;
      this.dragState.mouseStartPt = point.clone();

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
          const dist = pt.getDistance(point);
          if (dist < minDistance) {
            minDistance = dist;
            closestVertex = pt.clone();
          }
        });
      } else if (targetItem instanceof paper.Path && targetItem.segments) {
        targetItem.segments.forEach((seg) => {
          const dist = seg.point.getDistance(point);
          if (dist < minDistance) {
            minDistance = dist;
            closestVertex = seg.point.clone();
          }
        });
      }

      this.dragState.pivotPoint = closestVertex || point.clone();
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
    }

    this.utils.selectionRenderEngine.updateEntitiesStroke();
    this.utils.selectionRenderEngine.renderBezierHandles();
    if (paper.view) paper.view.update();
  }

  onMouseDown(event) {
    if (event.event && (event.event.button === 2 || event.event.which === 3)) {
      return;
    }

    if (this.selectionMenuHandler.isOpen() || this.selectionMenuHandler.wasDismissedRecently) {
      this.selectionMenuHandler.close();
      this.selectionMenuHandler.wasDismissedRecently = false;
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

    const hits = this.selectionMenuHandler.getSortedHits(event.point, 8 / paper.view.zoom);

    if (hits.length > 0) {
      const primaryHit = hits[0];
      const targetItem = primaryHit.entity;

      const now = Date.now();
      const isDoubleClick = (now - this.lastClickTime) < 300 && this.lastClickEntity === targetItem;
      this.lastClickTime = now;
      this.lastClickEntity = targetItem;

      if (isDoubleClick && (targetItem instanceof paper.Path) && !targetItem.data?.isPointEntity) {
        this.segmentEditHandler.enterEditMode(targetItem);
        this.dragState.dragAnchorEntity = null;
        return;
      }

      if (this.segmentEditHandler.onMouseDown(event, targetItem, primaryHit.hitResult)) {
        return;
      }

      if (hits.length > 1) {
        const alreadySelectedHit = !isShift
          ? hits.find((h) => this.service.selectedEntities.includes(h.entity))
          : null;

        if (alreadySelectedHit) {
          this._applyEntitySelection(alreadySelectedHit.entity, event.point, false, true);
          this.dragState.pendingMenuHits = hits;
          this.dragState.pendingMenuEvent = event.event;
          this.dragState.pendingMenuPoint = event.point.clone();
          this.dragState.pendingMenuShift = isShift;
          return;
        }

        const clickPoint = event.point.clone();
        this.selectionMenuHandler.open(event.event, hits, (chosenHit) => {
          this._applyEntitySelection(chosenHit.entity, clickPoint, isShift, false);
        });
        return;
      }

      this._applyEntitySelection(targetItem, event.point, isShift, true);
    } else {
      if (!isShift) {
        this.service.deselectAllEntities();
      }
      this.dragState.selectionStartPoint = event.point.clone();
      this.boxSelectHandler.startBox(event.point);
    }
  }

  onMouseDrag(event) {
    if (this.selectionMenuHandler.isOpen()) {
      return;
    }

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

      if (this.dragState.pendingMenuHits && this.dragState.mouseStartPt.getDistance(event.point) >= 3 / paper.view.zoom) {
        this.dragState.pendingMenuHits = null;
      }

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
    if (this.selectionMenuHandler.isOpen()) {
      return;
    }

    if (this.activeModule) {
      this.activeModule.onMouseUp(event);
      this.activeModule = null;
      return;
    }

    if (this.segmentEditHandler.onMouseUp()) {
      this.cleanBox();
      return;
    }

    const pendingHits = this.dragState.pendingMenuHits;
    const pendingEvent = this.dragState.pendingMenuEvent;
    const pendingPoint = this.dragState.pendingMenuPoint;
    const pendingShift = this.dragState.pendingMenuShift;

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
      } else if (pendingHits && pendingHits.length > 1) {
        this.cleanBox();
        this.selectionMenuHandler.open(pendingEvent, pendingHits, (chosenHit) => {
          this._applyEntitySelection(chosenHit.entity, pendingPoint, pendingShift, false);
        });
        return;
      }
    }

    if (this.dragState.selectionStartPoint) {
      this.boxSelectHandler.finishBox(event.point, event.event.shiftKey);
    }

    this.cleanBox();
  }

  onMouseMove(event) {
    if (this.selectionMenuHandler.isOpen()) {
      return;
    }

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

    const hits = this.selectionMenuHandler.getSortedHits(point, 6 / zoom);
    const targetItem = hits.length > 0 ? hits[0].entity : null;

    if (targetItem) {
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
    const targetTag = event.target?.tagName;
    const targetId = event.target?.id;
    const isConsoleInput = targetId === 'cmdInput' || targetId === 'cmdInputFloating';
    const isOtherInputFocused = !isConsoleInput && (
      targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT' || event.target?.isContentEditable
    );

    if (!isOtherInputFocused && (event.ctrlKey || event.metaKey) && (key.toLowerCase() === 'a' || event.code === 'KeyA')) {
      if (isConsoleInput && event.target.value.length > 0) {
        return false;
      }

      if (this.service.editingEntities && this.service.editingEntities.length > 0) {
        event.preventDefault();

        this.service.deselectAllHandles();
        this.service.deselectAllSegments();

        this.service.editingEntities.forEach((entity) => {
          if (!entity || entity.visible === false) return;

          const layerId = String(entity.data?.layerId || '0');
          const layer = this.utils.layerManager?.layers?.get(layerId);
          if (layer && (layer.locked || layer.visible === false)) return;

          if (entity instanceof paper.Path && !entity.data?.isPointEntity) {
            entity.segments.forEach((seg) => {
              this.service.selectSegment(seg, true);
            });
          } else if (entity instanceof paper.CompoundPath && entity.children) {
            entity.children.forEach((child) => {
              if (child instanceof paper.Path && child.segments) {
                child.segments.forEach((seg) => {
                  this.service.selectSegment(seg, true);
                });
              }
            });
          }
        });

        this.utils.selectionRenderEngine.renderBezierHandles();
        this.utils.selectionRenderEngine.updateEntitiesStroke();
        if (paper.view) paper.view.update();
        return true;
      }

      return false;
    }

    if (key === 'Escape') {
      if (this.selectionMenuHandler.isOpen()) {
        this.selectionMenuHandler.close();
        return true;
      }

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

        this.utils.selectionRenderEngine.renderBezierHandles();
        this.utils.selectionRenderEngine.updateEntitiesStroke();
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
    this.selectionMenuHandler.close();

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
    if (this.selectionMenuHandler.isOpen()) {
      this.selectionMenuHandler.close();
      return true;
    }

    // Limpiar el estado de hover si existía
    if (this.service.hoveredEntity) {
      this.utils.clearHoverHighlight();
      this.service.hoveredEntity = null;
    }

    // Retornar false para repetir la última herramienta activa conservando la selección vigente
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

  cleanup() {
    this.selectionMenuHandler.cleanup();
    super.cleanup();
  }
}