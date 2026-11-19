/**
 * tools/SelectTool.js - Herramienta de Selección con Estado Encapsulado y Submódulos Delegados
 */

import { CAD_THEME } from '../../config/cadTheme.js';
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
      segmentStartPositions: null,
      handleStartPositions: null,
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

  _updateDragRubberBand(fromPt, toPt) {
    if (!fromPt || !toPt) return;

    const hudLayer = this.utils.hudLayer || paper.project?.layers?.['hudLayer'];
    if (!hudLayer) return;

    const zoom = paper.view.zoom || 1;
    const strokeWidth = (CAD_THEME.rubberBand?.strokeWidthPx ?? 1) / zoom;
    const dashArray = (CAD_THEME.rubberBand?.dashArrayPx || [6, 4]).map((v) => v / zoom);

    if (!this.dragState.dragRubberBand) {
      const line = new paper.Path.Line({
        from: fromPt,
        to: toPt,
        strokeColor: CAD_THEME.selection.line.strokeColor,
        strokeWidth,
        dashArray,
        data: { isAuxiliary: true },
        insert: false
      });
      hudLayer.addChild(line);
      this.dragState.dragRubberBand = line;
    } else {
      this.dragState.dragRubberBand.segments[0].point = fromPt;
      this.dragState.dragRubberBand.segments[1].point = toPt;
      this.dragState.dragRubberBand.strokeWidth = strokeWidth;
      this.dragState.dragRubberBand.dashArray = dashArray;
    }
  }

  _applyEntitySelection(targetItem, point, isShift, enableDrag = true) {
    const isAlreadySelected = this.service.selectedEntities.includes(targetItem);

    if (isShift) {
      if (isAlreadySelected) {
        this.service.deselectEntity(targetItem);
      } else {
        this.service.selectEntity(targetItem, true);
      }
    } else if (!isAlreadySelected) {
      this.service.selectEntity(targetItem, false);
    }

    if (enableDrag) {
      this._prepareEntityDrag(targetItem, point);
    }

    this.utils.selectionRenderEngine.updateEntitiesStroke();
    this.utils.selectionRenderEngine.renderBezierHandles();
    if (paper.view) paper.view.update();
  }

  _captureMixedSelectionStartState() {
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

    this.dragState.segmentStartPositions = this.service.selectedSegments
      .filter((s) => s && s.path && !this.service.selectedEntities.includes(s.path))
      .map((s) => ({
        segment: s,
        path: s.path,
        segmentIndex: s.index,
        initialPt: s.point.clone(),
        initialHandleIn: s.handleIn.clone(),
        initialHandleOut: s.handleOut.clone()
      }));

    this.dragState.handleStartPositions = this.service.selectedHandles
      .filter((h) => h && h.segment && h.segment.path &&
        !this.service.selectedEntities.includes(h.segment.path) &&
        !this.service.selectedSegments.includes(h.segment))
      .map((h) => ({
        segment: h.segment,
        path: h.segment.path,
        segmentIndex: h.segment.index,
        handleType: h.type,
        initialVector: h.segment[h.type].clone()
      }));
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
        const isTargetInSelection = this.service.selectedEntities.includes(targetItem);
        const targetsToEdit = isTargetInSelection
          ? [...this.service.selectedEntities]
          : [targetItem];
        const append = isShift && this.service.editingEntities.length > 0;

        if (!isTargetInSelection && !isShift) {
          this.service.deselectAllEntities();
        }
        this.segmentEditHandler.enterEditMode(targetsToEdit, { append });
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
    if (this.selectionMenuHandler.isOpen()) return;
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
      const projectedPivot = targetMousePt.add(pivotPoint.subtract(this.dragState.mouseStartPt));
      const effectiveOrtho = Boolean(this.service?.isOrthoEnabled) !== Boolean(isShift);
      const isHorizontal = Math.abs(event.point.x - this.dragState.mouseStartPt.x) >
                           Math.abs(event.point.y - this.dragState.mouseStartPt.y);

      const ignoreEntities = Array.from(new Set([
        ...this.service.selectedEntities,
        ...(this.dragState.segmentStartPositions || []).map((i) => i.path),
        ...(this.dragState.handleStartPositions || []).map((i) => i.path)
      ].filter(Boolean)));

      const osnap = this.service.calculateOsnap(
        projectedPivot,
        (pt, type) => {
          const markerPt = (type === 'grid' && effectiveOrtho)
            ? (isHorizontal ? new paper.Point(pt.x, pivotPoint.y) : new paper.Point(pivotPoint.x, pt.y))
            : pt;
          this.utils.hud.renderSnapMarker(markerPt, type);
        },
        null,
        { fromPoint: pivotPoint, ignoreEntities }
      );

      let finalTargetPivot = projectedPivot;
      if (osnap && osnap.type) {
        finalTargetPivot = (osnap.type === 'grid' && effectiveOrtho)
          ? (isHorizontal ? new paper.Point(osnap.point.x, pivotPoint.y) : new paper.Point(pivotPoint.x, osnap.point.y))
          : osnap.point;
      }

      this.utils.hud.updateHUD(finalTargetPivot);
      this.utils.hud.updateDragRubberBand(pivotPoint, finalTargetPivot);
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

      (this.dragState.segmentStartPositions || []).forEach((item) => {
        if (item.segment) item.segment.point = item.initialPt.add(globalDelta);
      });

      (this.dragState.handleStartPositions || []).forEach((item) => {
        if (item.segment) item.segment[item.handleType] = item.initialVector.add(globalDelta);
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
    if (this.selectionMenuHandler.isOpen()) return;

    if (this.activeModule) {
      this.activeModule.onMouseUp(event);
      this.activeModule = null;
      return;
    }

    if (this.segmentEditHandler.onMouseUp()) {
      this.cleanBox();
      return;
    }

    const { pendingMenuHits, pendingMenuEvent, pendingMenuPoint, pendingMenuShift } = this.dragState;

    if (this.dragState.entityStartPositions && this.dragState.entityStartPositions.length > 0) {
      let hasMoved = false;

      const entitiesData = this.dragState.entityStartPositions.filter((i) => i.entity).map((item) => {
        const isPath = item.isPath;
        const finalPos = isPath ? null : (item.entity.data?.isPointEntity ? item.entity.bounds.center.clone() : item.entity.position.clone());
        const finalSegments = isPath ? item.entity.segments.map((s) => ({
          point: s.point.clone(),
          handleIn: s.handleIn.clone(),
          handleOut: s.handleOut.clone()
        })) : null;

        if (isPath && finalSegments.some((s, idx) =>
          !s.point.equals(item.initialSegments[idx].point) ||
          !s.handleIn.equals(item.initialSegments[idx].handleIn) ||
          !s.handleOut.equals(item.initialSegments[idx].handleOut))) {
          hasMoved = true;
        } else if (!isPath && finalPos && item.initialPos && !finalPos.equals(item.initialPos)) {
          hasMoved = true;
        }

        return {
          entity: item.entity,
          isPath,
          initialPos: item.initialPos ? item.initialPos.clone() : null,
          finalPos,
          initialSegments: item.initialSegments,
          finalSegments
        };
      });

      const segmentsData = (this.dragState.segmentStartPositions || []).filter((i) => i.segment && i.path).map((item) => {
        const finalPt = item.segment.point.clone();
        const finalHandleIn = item.segment.handleIn.clone();
        const finalHandleOut = item.segment.handleOut.clone();
        if (!finalPt.equals(item.initialPt)) hasMoved = true;
        return { ...item, finalPt, finalHandleIn, finalHandleOut };
      });

      const handlesData = (this.dragState.handleStartPositions || []).filter((i) => i.segment && i.path).map((item) => {
        const finalVector = item.segment[item.handleType].clone();
        if (!finalVector.equals(item.initialVector)) hasMoved = true;
        return { ...item, finalVector };
      });

      if (hasMoved) {
        this.service.executeCommand(new MoveCommand(this.service, {
          type: 'mixed',
          entities: entitiesData,
          segments: segmentsData,
          handles: handlesData
        }));
      } else if (pendingMenuHits && pendingMenuHits.length > 1) {
        this.cleanBox();
        this.selectionMenuHandler.open(pendingMenuEvent, pendingMenuHits, (chosenHit) => {
          this._applyEntitySelection(chosenHit.entity, pendingMenuPoint, pendingMenuShift, false);
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

  cleanBox() {
    this.selectionMenuHandler.close();

    if (this.dragState.selectionBoxRect) {
      this.dragState.selectionBoxRect.remove();
    }
    this.utils.hud.clearDragRubberBand();
    this.handleModule.reset();
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
      return this._handleSelectAll(event);
    }

    if (key === 'Escape') {
      if (this.selectionMenuHandler.isOpen()) {
        this.selectionMenuHandler.close();
        return true;
      }

      // 1er ESC: Cancela el arrastre activo sin perder selección ni modo edición
      if (this._cancelActiveDrag()) {
        return true;
      }

      // 2do ESC: Quita cualquier selección activa (entidades, nodos o tiradores) sin salir del modo edición
      const hasSelectedEntities = this.service.selectedEntities && this.service.selectedEntities.length > 0;
      const hasSelectedSegments = this.service.selectedSegments && this.service.selectedSegments.length > 0;
      const hasSelectedHandles = this.service.selectedHandles && this.service.selectedHandles.length > 0;

      if (hasSelectedEntities || hasSelectedSegments || hasSelectedHandles) {
        if (hasSelectedEntities) this.service.deselectAllEntities();
        if (hasSelectedSegments) this.service.deselectAllSegments();
        if (hasSelectedHandles) this.service.deselectAllHandles();
        this.cleanBox();
        return true;
      }

      // 3er ESC: Sale del modo edición de nodos
      if (this.service.editingEntities && this.service.editingEntities.length > 0) {
        this.service.selectionManager.exitEditMode();
        this.utils.setPrompt('Herramienta Selección: selecciona objetos o haz doble clic en un trazo para editar sus nodos.');
        return true;
      }

      return super.onKeyDown(event);
    }

    return false;
  }

  _handleSelectAll(event) {
    if (!this.service.editingEntities || this.service.editingEntities.length === 0) {
      return false;
    }

    event.preventDefault();
    this.service.deselectAllHandles();
    this.service.deselectAllSegments();

    this.service.editingEntities.forEach((entity) => {
      if (!entity || entity.visible === false) return;

      const layerId = String(entity.data?.layerId || '0');
      const layer = this.utils.layerManager?.layers?.get(layerId);
      if (layer && (layer.locked || layer.visible === false)) return;

      if (entity instanceof paper.Path && !entity.data?.isPointEntity) {
        entity.segments.forEach((seg) => this.service.selectSegment(seg, true));
      } else if (entity instanceof paper.CompoundPath && entity.children) {
        entity.children.forEach((child) => {
          if (child instanceof paper.Path && child.segments) {
            child.segments.forEach((seg) => this.service.selectSegment(seg, true));
          }
        });
      }
    });

    this.utils.selectionRenderEngine.renderBezierHandles();
    this.utils.selectionRenderEngine.updateEntitiesStroke();
    if (paper.view) paper.view.update();
    return true;
  }

  _prepareEntityDrag(targetItem, point) {
    this.dragState.dragAnchorEntity = targetItem;
    this.dragState.mouseStartPt = point.clone();

    const isPivotFromPoint = Boolean(targetItem.data?.isPointEntity);
    let closestVertex = null;
    let minDistance = Infinity;

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
    this._captureMixedSelectionStartState();
  }

  _cancelActiveDrag() {
    if (this.activeModule) {
      if (typeof this.activeModule.cancelDrag === 'function') {
        this.activeModule.cancelDrag();
      } else {
        this.activeModule.reset();
      }
      this.activeModule = null;
      this.utils.hud.clear();
      this.utils.selectionRenderEngine.renderBezierHandles();
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      if (paper.view) paper.view.update();
      return true;
    }

    if (this.segmentEditHandler.isDragging()) {
      this.segmentEditHandler.cancelDrag();
      this.utils.hud.clear();
      this.utils.selectionRenderEngine.renderBezierHandles();
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      if (paper.view) paper.view.update();
      return true;
    }

    if (this.dragState.mouseStartPt || this.dragState.entityStartPositions) {
      (this.dragState.entityStartPositions || []).forEach((item) => {
        if (!item.entity) return;
        if (item.isPath && item.initialSegments) {
          item.entity.segments.forEach((seg, idx) => {
            const initSeg = item.initialSegments[idx];
            if (initSeg) {
              seg.point = initSeg.point.clone();
              seg.handleIn = initSeg.handleIn.clone();
              seg.handleOut = initSeg.handleOut.clone();
            }
          });
        } else if (item.initialPos) {
          item.entity.position = item.initialPos.clone();
        }
      });

      (this.dragState.segmentStartPositions || []).forEach((item) => {
        if (!item.segment) return;
        item.segment.point = item.initialPt.clone();
        item.segment.handleIn = item.initialHandleIn.clone();
        item.segment.handleOut = item.initialHandleOut.clone();
      });

      (this.dragState.handleStartPositions || []).forEach((item) => {
        if (item.segment) item.segment[item.handleType] = item.initialVector.clone();
      });

      this.utils.hud.clear();
      this.cleanBox();
      return true;
    }

    if (this.dragState.selectionStartPoint) {
      this.utils.hud.clear();
      this.cleanBox();
      return true;
    }

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