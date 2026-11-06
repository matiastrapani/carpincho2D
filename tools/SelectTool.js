/**
 * tools/SelectTool.js - Herramienta de Selección con Estado Encapsulado y Submódulos Delegados
 */
import { BaseTool } from './BaseTool.js';
import { HandleSelectionHandler } from './HandleSelectionHandler.js';
import { MoveCommand, TransformEntityCommand } from '../services/commands/cadCommands.js';

export class SelectTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);

    // Control de doble clic
    this.lastClickTime = 0;
    this.lastClickEntity = null;

    // Instancia del submódulo exclusivo para Grips/Handles/Arms
    this.handleModule = new HandleSelectionHandler(cadService, cadUtils);
    this.activeModule = null;

    // Estado para Grips Paramétricos
    this.activeGripEntity = null;
    this.activeGripId = null;
    this.gripStartPoint = null;

    this.resetDragState();
  }

  resetDragState() {
    this.dragState = {
      mouseStartPt: null,
      dragAnchorSegment: null,
      anchorSegmentStartPt: null,
      selectedSegmentsStartData: null,
      dragAnchorEntity: null,
      entityStartPositions: null,
      selectionStartPoint: null,
      selectionBoxRect: null,
      pivotPoint: null,          // <--- Agregar
      isPivotFromPoint: false    // <--- Agregar
    };
  }

  onMouseDown(event) {
    this.utils.clearHUD();
    
    // Resetear estados temporales de hover para evitar arrastrar grosores residuales
    this.utils.hoveredHandle = null;
    this.utils.hoveredCurve = null;
    if (this.service.hoveredEntity) {
      this.utils.clearHoverHighlight();
    }

    const isShift = event.event.shiftKey;

    // 0. CLIC EN GRIP PARAMÉTRICO
    const hitGrip = this.utils.controlHandlesGroup ? this.utils.controlHandlesGroup.hitTest(event.point, {
      fill: true, stroke: true, tolerance: 8 / paper.view.zoom,
      match: (res) => res.item.data?.isParametricGrip
    }) : null;

    if (hitGrip && hitGrip.item) {
      const data = hitGrip.item.data;
      this.activeGripEntity = data.entity;
      this.activeGripId = data.gripId;
      this.gripStartPoint = event.point.clone();

      this.utils.activeParametricGrip = { entity: data.entity, gripId: data.gripId };
      this.utils.renderBezierHandles();

      const controller = this.activeGripEntity?.data?.controller;
      if (controller && typeof controller.startTransform === 'function') {
        controller.startTransform();
      }
      return;
    }

    // =========================================================================
    // 1. DELEGACIÓN A SUBMÓDULO: CLIC EN GRIPS / VÉRTICES / HANDLES / ARMS
    // =========================================================================
    const hitHandle = this.handleModule.hitTest(event.point);
    if (hitHandle) {
      // GUARDIÁN: Si la entidad completa ya está seleccionada, ignorar el clic en nodos/handles individuales
      const segPath = hitHandle.item?.data?.segment?.path || hitHandle.segment?.path;
      const isPathFullySelected = segPath && this.service.selectedEntities.includes(segPath);

      if (!isPathFullySelected) {
        this.activeModule = this.handleModule;
        this.activeModule.onMouseDown(event, hitHandle);
        return;
      }
    }

    // =========================================================================
    // 2. CLIC EN ENTIDADES (Modo Edición de Tramos o Selección Rígida)
    // =========================================================================
    const getRootEntity = (item) => {
      let current = item;
      while (current) {
        if (this.service.demoEntities.includes(current)) {
          return current;
        }
        current = current.parent;
      }
      return item;
    };

    const hitEntity = paper.project.hitTest(event.point, {
      stroke: true, fill: true, pixels: true, tolerance: 8 / paper.view.zoom,
      match: (res) => {
        const root = getRootEntity(res.item);
        if (!this.service.demoEntities.includes(root)) return false;

        // ✅ FILTRO DE CAPA BLOQUEADA EN EL MATCH:
        // Si la capa está bloqueada, el hitTest ignora este objeto y busca si hay algo debajo
        const layerId = String(root.data?.layerId || '0');
        const layerManager = this.utils?.layerManager || window.cadUtils?.layerManager;
        const layer = layerManager?.layers?.get(layerId);
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

      // DETECCIÓN DE DOBLE CLIC -> ENTRAR EN MODO EDICIÓN DE NODOS
      const now = Date.now();
      const timeDiff = now - this.lastClickTime;
      const isDoubleClick = timeDiff < 300 && this.lastClickEntity === targetItem;

      this.lastClickTime = now;
      this.lastClickEntity = targetItem;

      if (isDoubleClick && (targetItem instanceof paper.Path) && !targetItem.data?.isPointEntity) {
        this.service.editingEntities = [targetItem];
        this.service.selectedEntities = [targetItem];
        this.service.deselectAllSegments();
        this.service.deselectAllHandles();

        this.utils.renderBezierHandles();
        this.utils.updateEntitiesStroke();
        this.utils.setPrompt('Modo edición de nodos activo. Presiona Esc para salir.');
        
        this.dragState.dragAnchorEntity = null;
        return;
      }

      const isAlreadyInEditMode = this.service.editingEntities.includes(targetItem);
      const isEntityFullySelected = this.service.selectedEntities.includes(targetItem);

      // SOLO entra a edición de tramos/nodos si la entidad NO está seleccionada completa
      if (isAlreadyInEditMode && !isEntityFullySelected && targetItem instanceof paper.Path && !targetItem.data?.isPointEntity) {
        const location = hitEntity.location || targetItem.getNearestLocation(event.point);

        if (location && location.curve) {
          const seg1 = location.curve.segment1;
          const seg2 = location.curve.segment2;

          const isSegmentFullySelected = seg1 && seg2 && 
                                         this.service.selectedSegments.includes(seg1) && 
                                         this.service.selectedSegments.includes(seg2);

          if (isShift) {
            if (isSegmentFullySelected) {
              if (seg1) this.service.deselectSegment(seg1);
              if (seg2) this.service.deselectSegment(seg2);
            } else {
              if (seg1) this.service.selectSegment(seg1, true);
              if (seg2) this.service.selectSegment(seg2, true);
            }
            this.utils.renderBezierHandles();
            return;
          }

          if (!isSegmentFullySelected) {
            this.service.deselectAllSegments();
            this.service.deselectAllHandles();
            if (seg1) this.service.selectSegment(seg1, true);
            if (seg2) this.service.selectSegment(seg2, true);
          }

          let activePivotSeg = seg1;
          let minDist = seg1 ? seg1.point.getDistance(event.point) : Infinity;

          const poolSegments = this.service.selectedSegments.length > 0 
            ? this.service.selectedSegments 
            : [seg1, seg2].filter(Boolean);

          poolSegments.forEach(s => {
            const d = s.point.getDistance(event.point);
            if (d < minDist) {
              minDist = d;
              activePivotSeg = s;
            }
          });

          this.dragState.dragAnchorSegment = activePivotSeg;
          this.dragState.anchorSegmentStartPt = activePivotSeg ? activePivotSeg.point.clone() : null;
          this.dragState.pivotPoint = activePivotSeg ? activePivotSeg.point.clone() : event.point.clone();

          this.dragState.selectedSegmentsStartData = this.service.selectedSegments.map(s => ({
            segment: s,
            path: s.path,
            segmentIndex: s.index,
            initialPt: s.point.clone(),
            initialHandleIn: s.handleIn.clone(),
            initialHandleOut: s.handleOut.clone()
          }));

          this.dragState.mouseStartPt = event.point.clone();
          this.utils.renderBezierHandles();

          if (this.dragState.pivotPoint) {
            this.utils.renderPivotMarker(this.dragState.pivotPoint);
          }
          return;
        }
      }

      // MANEJO DE SELECCIÓN DE ENTIDAD COMPLETA (SI YA ESTÁ SELECCIONADA, PERMITE ARRASTRARLA DE UNA)
      const isAlreadySelected = this.service.selectedEntities.includes(targetItem);

      if (isShift) {
        if (isAlreadySelected) {
          this.service.deselectEntity(targetItem);
          this.service.editingEntities = this.service.editingEntities.filter(ent => ent !== targetItem);
        } else {
          this.service.selectEntity(targetItem, true);
          this.service.editingEntities = [];
          this.service.deselectAllSegments();
        }
      } else {
        if (!isAlreadySelected) {
          this.service.selectEntity(targetItem, false);
          this.service.editingEntities = [];
          this.service.deselectAllSegments();
        }
      }

      if (window.cadUI && typeof window.cadUI.updatePropertyPanel === 'function') {
        if (window.propertyPanelUI) {
          window.propertyPanelUI.setSelectedEntities(this.service.selectedEntities);
        }
      }

      this.dragState.dragAnchorEntity = targetItem;
      this.dragState.mouseStartPt = event.point.clone();

      const checkIsPoint = (ent) => {
        let current = ent;
        while (current) {
          if (
            current.data?.isPointEntity || 
            current.data?.isPoint || 
            current.data?.type === 'point' || 
            current.data?.type === 'Point' ||
            current.data?.isPointShape
          ) {
            return true;
          }
          current = current.parent;
        }
        return false;
      };

      let closestVertex = null;
      let minDistance = Infinity;
      let isPivotFromPoint = checkIsPoint(targetItem);

      if (isPivotFromPoint) {
        closestVertex = targetItem.position || targetItem.bounds?.center;
      } else if (targetItem instanceof paper.Raster && targetItem.bounds) {
        const b = targetItem.bounds;
        const imagePoints = [
          b.topLeft, b.topCenter, b.topRight,
          b.rightCenter, b.bottomRight, b.bottomCenter,
          b.bottomLeft, b.leftCenter, b.center
        ];

        imagePoints.forEach(pt => {
          const dist = pt.getDistance(event.point);
          if (dist < minDistance) {
            minDistance = dist;
            closestVertex = pt.clone();
          }
        });
      } else if (targetItem instanceof paper.Path && targetItem.segments) {
        targetItem.segments.forEach(seg => {
          const dist = seg.point.getDistance(event.point);
          if (dist < minDistance) {
            minDistance = dist;
            closestVertex = seg.point.clone();
          }
        });
      }

      if (!closestVertex && this.service.selectedEntities.length > 0) {
        const tolerancePx = 20 / paper.view.zoom;
        const searchBox = new paper.Rectangle(
          event.point.subtract(new paper.Point(tolerancePx, tolerancePx)),
          new paper.Size(tolerancePx * 2, tolerancePx * 2)
        );

        for (const ent of this.service.selectedEntities) {
          if (checkIsPoint(ent)) {
            const pt = ent.position || ent.bounds?.center;
            if (pt && searchBox.contains(pt)) {
              closestVertex = pt.clone();
              isPivotFromPoint = true;
              break;
            }
          } else if (ent instanceof paper.Path && ent.bounds?.intersects(searchBox)) {
            ent.segments.forEach(seg => {
              if (searchBox.contains(seg.point)) {
                const dist = seg.point.getDistance(event.point);
                if (dist < minDistance) {
                  minDistance = dist;
                  closestVertex = seg.point.clone();
                }
              }
            });
            if (closestVertex) break;
          }
        }
      }

      this.dragState.pivotPoint = closestVertex || event.point.clone();
      this.dragState.isPivotFromPoint = isPivotFromPoint;

      this.dragState.entityStartPositions = this.service.selectedEntities.map(ent => {
        const isPath = ent instanceof paper.Path && !checkIsPoint(ent);
        return {
          entity: ent,
          isPath: isPath,
          initialPos: checkIsPoint(ent) ? (ent.bounds ? ent.bounds.center.clone() : ent.position.clone()) : ent.position.clone(),
          initialSegments: isPath ? ent.segments.map(s => ({
            point: s.point.clone(),
            handleIn: s.handleIn.clone(),
            handleOut: s.handleOut.clone()
          })) : null
        };
      });

      this.utils.renderBezierHandles();

      if (this.dragState.pivotPoint && !this.dragState.isPivotFromPoint) {
        this.utils.renderPivotMarker(this.dragState.pivotPoint);
      }
    } else {
      // 3. CUADRO DE SELECCIÓN
      if (window.cadUI && typeof window.cadUI.updatePropertyPanel === 'function') {
        if (window.propertyPanelUI) {
          window.propertyPanelUI.setSelectedEntities([]);
        }
      }

      if (!isShift) {
        this.service.deselectAllEntities();
      }

      this.dragState.selectionStartPoint = event.point.clone();
      if (this.dragState.selectionBoxRect) this.dragState.selectionBoxRect.remove();
      
      this.dragState.selectionBoxRect = new paper.Path.Rectangle({
        from: this.dragState.selectionStartPoint, 
        to: event.point,
        strokeWidth: 1 / paper.view.zoom, 
        strokeColor: '#008800',
        fillColor: new paper.Color(0, 0.53, 0, 0.15)
      });
    }
  }

  onMouseDrag(event) {
    // 0. Arrastre de Grip Paramétrico (Bounding Box de Imagen / Círculo) con OSNAP
    if (this.activeGripEntity && this.activeGripId) {
      const isShift = event.event.shiftKey;
      const controller = this.activeGripEntity.data?.controller;

      let targetPt = event.point.clone();

      // Calcular OSNAP omitiendo la imagen en transformación
      const osnap = this.service.calculateOsnap(
        event.point,
        (snapPt, type) => this.utils.renderSnapMarker(snapPt, type),
        null,
        { ignoreEntities: [this.activeGripEntity] }
      );

      if (osnap.type) {
        targetPt = osnap.point;
      }

      if (controller && typeof controller.onGripDrag === 'function') {
        controller.onGripDrag(this.activeGripId, targetPt, this.gripStartPoint, { isShiftPressed: isShift });
        this.utils.renderBezierHandles();
        paper.view.update();
      }
      return;
    }

    // 1. Delegar a submódulo activo si existe
    if (this.activeModule) {
      this.activeModule.onMouseDrag(event);
      return;
    }

    // 2. Arrastre Parcial de Tramos / Nodos
    if (this.service.selectedSegments.length > 0 && this.dragState.mouseStartPt && this.dragState.selectedSegmentsStartData && !this.dragState.selectionStartPoint) {
      let targetMousePt = event.point.clone();
      const isShift = event.event.shiftKey;

      if (isShift) {
        const dx = Math.abs(targetMousePt.x - this.dragState.mouseStartPt.x);
        const dy = Math.abs(targetMousePt.y - this.dragState.mouseStartPt.y);
        if (dx > dy) targetMousePt.y = this.dragState.mouseStartPt.y;
        else targetMousePt.x = this.dragState.mouseStartPt.x;
      }

      const pivotSegData = this.dragState.selectedSegmentsStartData.find(s => s.segment === this.dragState.dragAnchorSegment) 
                           || this.dragState.selectedSegmentsStartData[0];

      let globalDelta = targetMousePt.subtract(this.dragState.mouseStartPt);

      if (pivotSegData && pivotSegData.initialPt) {
        let currentPivotPos = pivotSegData.initialPt.add(globalDelta);

        if (!isShift) {
          const activePaths = Array.from(new Set(
            this.dragState.selectedSegmentsStartData.map(item => item.path).filter(Boolean)
          ));
          const activeSegments = this.dragState.selectedSegmentsStartData.map(item => item.segment).filter(Boolean);
          const selectedPointsCoords = this.dragState.selectedSegmentsStartData.map(item => item.initialPt);

          const osnap = this.service.calculateOsnap(
            currentPivotPos,
            (pt, type) => this.utils.renderSnapMarker(pt, type),
            null,
            { 
              path: pivotSegData.path,
              segment: pivotSegData.segment,
              ignoreEntities: activePaths,
              ignoreSegments: activeSegments,
              selectedPointsCoords: selectedPointsCoords
            }
          );

          if (osnap.type) {
            globalDelta = osnap.point.subtract(pivotSegData.initialPt);
          }
        } else {
          this.utils.clearHUD();
        }

        // Mantiene visible el marcador de PIVOT en la posición final ajustada por el OSNAP
        currentPivotPos = pivotSegData.initialPt.add(globalDelta);
        this.utils.renderPivotMarker(currentPivotPos);
      }

      this.dragState.selectedSegmentsStartData.forEach(item => {
        if (item.segment) {
          item.segment.point = item.initialPt.add(globalDelta);
        }
      });

      // Mover Handles independientes seleccionados durante el arrastre de tramos
      if (this.service.selectedHandles.length > 0) {
        this.service.selectedHandles.forEach(h => {
          if (!this.service.selectedSegments.includes(h.segment)) {
            const initialHandleVec = h.type === 'handleIn' ? h.segment.handleIn : h.segment.handleOut;
            // Mantiene el vector relativo
          }
        });
      }

      this.utils.renderBezierHandles();
      return;
    }

    // 3. Arrastre Rígido de Entidades en Modo Objeto
    if (this.service.selectedEntities.length > 0 && !this.dragState.selectionStartPoint && this.dragState.mouseStartPt && this.dragState.entityStartPositions) {
      let targetMousePt = event.point.clone();

      if (event.event.shiftKey) {
        const dx = Math.abs(targetMousePt.x - this.dragState.mouseStartPt.x);
        const dy = Math.abs(targetMousePt.y - this.dragState.mouseStartPt.y);
        if (dx > dy) targetMousePt.y = this.dragState.mouseStartPt.y;
        else targetMousePt.x = this.dragState.mouseStartPt.x;
      }

      // Usar el vértice más cercano detectado en el mousedown como pivote principal
      const pivotPoint = this.dragState.pivotPoint || this.dragState.mouseStartPt;
      const grabOffset = pivotPoint.subtract(this.dragState.mouseStartPt);
      const projectedPivot = targetMousePt.add(grabOffset);

      // El OSNAP calcula la atracción magnética sobre el VÉRTICE MÁS CERCANO
      const osnap = this.service.calculateOsnap(
        projectedPivot, 
        (pt, type) => this.utils.renderSnapMarker(pt, type),
        null,
        { ignoreEntities: this.service.selectedEntities }
      );

      const finalTargetPivot = osnap.type ? osnap.point : projectedPivot;
      const globalDelta = finalTargetPivot.subtract(pivotPoint);

      this.dragState.entityStartPositions.forEach(item => {
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

      this.utils.renderBezierHandles();
      
      // Dibujar pivote SOLO si NO es un punto
      if (!this.dragState.isPivotFromPoint) {
        this.utils.renderPivotMarker(finalTargetPivot);
      }

      return;
    }

    // 4. Selección por Cuadro
    this.utils.clearHUD();

    if (this.dragState.selectionStartPoint && this.dragState.selectionBoxRect) {
      this.dragState.selectionBoxRect.remove();
      const startPt = this.dragState.selectionStartPoint;
      const currPt = event.point;
      const isWindowSelection = currPt.x >= startPt.x;

      this.dragState.selectionBoxRect = new paper.Path.Rectangle({
        from: startPt, 
        to: currPt, 
        strokeWidth: 1 / paper.view.zoom,
        strokeColor: '#008800',
        dashArray: isWindowSelection ? null : [2 / paper.view.zoom, 2 / paper.view.zoom],
        fillColor: new paper.Color(0, 0.53, 0, 0.15)
      });
    }
  }

  onMouseUp(event) {
    // 0. Finalizar Arrastre Paramétrico
    if (this.activeGripEntity && this.activeGripId) {
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
      this.utils.renderBezierHandles();
      return;
    }

    // 1. Finalizar submódulo activo
    if (this.activeModule) {
      this.activeModule.onMouseUp(event);
      this.activeModule = null;
      return;
    }

    // 2. Finalizar Arrastre de Segmentos
    if (this.dragState.selectedSegmentsStartData && this.dragState.selectedSegmentsStartData.length > 0) {
      const movedSegmentsData = [];
      let hasMoved = false;

      this.dragState.selectedSegmentsStartData.forEach(item => {
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
        const moveCmd = new MoveCommand(this.service, { type: 'segments', items: movedSegmentsData });
        this.service.executeCommand(moveCmd);
      }
    }

    // 3. Finalizar Arrastre de Entidades
    if (this.dragState.entityStartPositions && this.dragState.entityStartPositions.length > 0) {
      const movedEntitiesData = [];
      let hasMoved = false;

      this.dragState.entityStartPositions.forEach(item => {
        if (!item.entity) return;

        const isPath = item.isPath;
        const finalPos = isPath ? null : (item.entity.data?.isPointEntity ? item.entity.bounds.center.clone() : item.entity.position.clone());
        const finalSegments = isPath ? item.entity.segments.map(s => ({
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
          isPath: isPath,
          initialPos: item.initialPos ? item.initialPos.clone() : null,
          finalPos: finalPos,
          initialSegments: item.initialSegments,
          finalSegments: finalSegments
        });
      });

      if (hasMoved) {
        const moveCmd = new MoveCommand(this.service, {
          type: 'entities',
          items: movedEntitiesData
        });
        this.service.executeCommand(moveCmd);
      }
    }

    // 4. Finalizar Cuadro de Selección / Clic en Canvas
    if (this.dragState.selectionBoxRect && this.dragState.selectionStartPoint) {
      const startPt = this.dragState.selectionStartPoint;
      const endPt = event.point;
      const dragDistance = startPt.getDistance(endPt);
      const isShift = event.event.shiftKey;

      // CLIC SIMPLE EN CANVAS: deselecciona entidades/segmentos pero MANTIENE editingEntities
      if (dragDistance < 3 / paper.view.zoom) {
        if (!isShift) {
          this.service.deselectAllEntities();
          this.service.deselectAllSegments();
        }
        this.cleanBox();
        return;
      }

      const boxBounds = this.dragState.selectionBoxRect.bounds;
      const isWindowSelection = endPt.x >= startPt.x;
      const hasEditingEntities = this.service.editingEntities.length > 0;

      const lineIntersectsBox = (p1, p2, rect) => {
        const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
        if (maxX < rect.left || minX > rect.right || maxY < rect.top || minY > rect.bottom) return false;
        if (rect.contains(p1) || rect.contains(p2)) return true;

        const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
        const intersectLines = (a, b, c, d) => (ccw(a, c, d) !== ccw(b, c, d)) && (ccw(a, b, c) !== ccw(a, b, d));

        return intersectLines(p1, p2, rect.topLeft, rect.topRight) ||
               intersectLines(p1, p2, rect.topRight, rect.bottomRight) ||
               intersectLines(p1, p2, rect.bottomRight, rect.bottomLeft) ||
               intersectLines(p1, p2, rect.bottomLeft, rect.topLeft);
      };

      const isPathSelectedByBox = (path) => {
        if (!path || !path.bounds) return false;

        if (!boxBounds.intersects(path.bounds) && !boxBounds.contains(path.bounds)) {
          return false;
        }

        if (isWindowSelection) {
          return boxBounds.contains(path.bounds);
        }

        if (boxBounds.contains(path.bounds)) return true;

        const segments = path.segments || [];
        for (let i = 0; i < segments.length; i++) {
          if (boxBounds.contains(segments[i].point)) return true;
        }

        const curves = path.curves || [];
        for (let i = 0; i < curves.length; i++) {
          const c = curves[i];
          if (!boxBounds.intersects(c.bounds)) continue;

          const p0 = c.segment1.point;
          const p1 = c.segment2.point;
          const h1 = c.segment1.handleOut;
          const h2 = c.segment2.handleIn;

          if (h1.isZero() && h2.isZero()) {
            if (lineIntersectsBox(p0, p1, boxBounds)) return true;
          } else {
            const c1 = p0.add(h1);
            const c2 = p1.add(h2);

            const getBezierPt = (t) => {
              const mt = 1 - t;
              return p0.multiply(mt * mt * mt)
                .add(c1.multiply(3 * mt * mt * t))
                .add(c2.multiply(3 * mt * t * t))
                .add(p1.multiply(t * t * t));
            };

            let prevPt = p0;
            const steps = 4;
            for (let k = 1; k <= steps; k++) {
              const currPt = (k === steps) ? p1 : getBezierPt(k / steps);
              if (boxBounds.contains(currPt) || lineIntersectsBox(prevPt, currPt, boxBounds)) {
                return true;
              }
              prevPt = currPt;
            }
          }
        }
        return false;
      };

      const checkIsPoint = (ent) => !!(
        ent.data?.isPointEntity || ent.data?.isPoint || ent.parent?.data?.isPointEntity
      );

      // CUADRO EN MODO EDICIÓN DE NODOS
      if (hasEditingEntities) {
        let segmentsSelectedCount = 0;
        this.service.editingEntities.forEach(entity => {
          if (entity instanceof paper.Path && entity.segments && !entity.data?.isPointEntity) {
            if (entity.bounds && !boxBounds.intersects(entity.bounds)) return;

            entity.segments.forEach(seg => {
              if (boxBounds.contains(seg.point)) {
                this.service.selectSegment(seg, true);
                segmentsSelectedCount++;
              }
            });
          }
        });

        // Al no seleccionar nodos con el cuadro, deselecciona los segmentos sin vaciar editingEntities
        if (segmentsSelectedCount === 0 && !isShift) {
          this.service.deselectAllSegments();
        }
      }

      // CUADRO EN MODO SELECCIÓN DE OBJETOS
      if (this.service.editingEntities.length === 0) {
        const entitiesToSelect = [];
        const demoEntities = this.service.demoEntities;
        const count = demoEntities.length;

        for (let i = 0; i < count; i++) {
          const entity = demoEntities[i];
          if (!entity || !entity.bounds) continue;

          let shouldSelect = false;

          if (checkIsPoint(entity)) {
            shouldSelect = boxBounds.contains(entity.position || entity.bounds.center);
          } else if (entity instanceof paper.Path) {
            shouldSelect = isPathSelectedByBox(entity);
          } else if (entity instanceof paper.CompoundPath) {
            if (entity.children) {
              shouldSelect = entity.children.some(child => isPathSelectedByBox(child));
            }
          } else {
            shouldSelect = isWindowSelection 
              ? boxBounds.contains(entity.bounds) 
              : (boxBounds.contains(entity.bounds) || boxBounds.intersects(entity.bounds));
          }

          if (shouldSelect) {
            const layerId = String(entity.data?.layerId || '0');
            const layerManager = this.utils?.layerManager || window.cadUtils?.layerManager;
            const layer = layerManager?.layers?.get(layerId);

            // Solo seleccionar si la capa está desbloqueada
            if (!layer || !layer.locked) {
              entitiesToSelect.push(entity);
            }
          }
        }

        if (isShift) {
          const currentSet = new Set(this.service.selectedEntities);
          entitiesToSelect.forEach(e => currentSet.add(e));
          this.service.selectedEntities = Array.from(currentSet);
        } else {
          this.service.selectedEntities = entitiesToSelect;
        }
      }

      this.utils.updateEntitiesStroke();
      this.utils.renderBezierHandles();
    }

    this.cleanBox();
  }

  onMouseMove(event) {
    this.utils.clearHUD();

    if (this.dragState.selectionStartPoint || this.dragState.mouseStartPt) {
      return;
    }

    const point = event.point;
    const zoom = paper.view.zoom;

    const hitGrip = this.utils.controlHandlesGroup ? this.utils.controlHandlesGroup.hitTest(point, {
      fill: true, stroke: true, tolerance: 8 / zoom,
      match: (res) => res.item.data?.isParametricGrip
    }) : null;

    if (hitGrip && hitGrip.item && hitGrip.item.data) {
      document.body.style.cursor = hitGrip.item.data.cursor || 'default';
      const newHover = { entity: hitGrip.item.data.entity, gripId: hitGrip.item.data.gripId };
      
      if (!this.utils.hoveredParametricGrip || 
          this.utils.hoveredParametricGrip.entity !== newHover.entity || 
          this.utils.hoveredParametricGrip.gripId !== newHover.gripId) {
        this.utils.hoveredParametricGrip = newHover;
        this.utils.renderBezierHandles();
      }
      return;
    } else if (this.utils.hoveredParametricGrip) {
      this.utils.hoveredParametricGrip = null;
      this.utils.renderBezierHandles();
    }

    document.body.style.cursor = 'default';

    if (this.service.editingEntities.length > 0) {
      const hitHandle = this.utils.controlHandlesGroup ? this.utils.controlHandlesGroup.hitTest(point, {
        fill: true, stroke: true, segments: true, tolerance: 8 / zoom,
        match: (res) => {
          if (!res.item || !res.item.data || !res.item.data.segment) return false;
          
          const parentPath = res.item.data.segment.path;
          if (parentPath && this.service.selectedEntities.includes(parentPath)) {
            return false;
          }
          return true;
        }
      }) : null;

      if (hitHandle && hitHandle.item && hitHandle.item.data) {
        if (this.service.hoveredEntity) {
          this.utils.clearHoverHighlight();
        }

        const handleData = hitHandle.item.data;
        if (this.utils.hoveredHandle !== handleData) {
          this.utils.hoveredHandle = handleData;
          this.utils.hoveredCurve = null;
          this.utils.renderBezierHandles();
        }
        return;
      }

      const mouseBox = new paper.Rectangle(
        point.subtract(new paper.Point(8 / zoom, 8 / zoom)),
        new paper.Size(16 / zoom, 16 / zoom)
      );

      let hitCurve = null;
      for (const ent of this.service.editingEntities) {
        if (ent instanceof paper.Path && ent.curves && !ent.data?.isPointEntity) {
          if (ent.bounds && !ent.bounds.intersects(mouseBox)) continue;

          const loc = ent.getNearestLocation(point);
          if (loc && loc.point && loc.point.getDistance(point) <= (8 / zoom)) {
            hitCurve = loc.curve;
            break;
          }
        }
      }

      if (hitCurve) {
        if (this.service.hoveredEntity) {
          this.utils.clearHoverHighlight();
        }

        if (this.utils.hoveredCurve !== hitCurve || this.utils.hoveredHandle) {
          this.utils.hoveredHandle = null;
          this.utils.hoveredCurve = hitCurve;
          this.utils.renderBezierHandles();
        }
        return;
      }

      if (this.utils.hoveredHandle || this.utils.hoveredCurve) {
        this.utils.hoveredHandle = null;
        this.utils.hoveredCurve = null;
        this.utils.renderBezierHandles();
      }
    }

    const hitEntity = paper.project.hitTest(point, {
      stroke: true, fill: true, tolerance: 6 / zoom,
      match: (res) => {
        const item = res.item;
        const getRootEntity = (i) => {
          let curr = i;
          while (curr) {
            if (this.service.demoEntities.includes(curr)) return curr;
            curr = curr.parent;
          }
          return i;
        };
        const root = getRootEntity(item);
        if (!this.service.demoEntities.includes(root)) return false;

        // IGNORAR HOVER SI LA CAPA ESTÁ BLOQUEADA
        const layerId = String(root.data?.layerId || '0');
        const layerManager = this.utils?.layerManager || window.cadUtils?.layerManager;
        const layer = layerManager?.layers?.get(layerId);
        if (layer && layer.locked) return false;
        if (layer && layer.locked) return false;

        if (item.data?.isPointEntity || item.parent?.data?.isPointEntity) return true;
        if (res.type === 'stroke') return true;

        if (res.type === 'fill') {
          const fill = item.fillColor;
          return !!(fill && fill.alpha > 0);
        }

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
          this.utils.updateEntitiesStroke();
        }
      } else {
        if (this.service.hoveredEntity) {
          this.utils.clearHoverHighlight();
        }
      }
    } else {
      if (this.service.hoveredEntity) {
        this.utils.clearHoverHighlight();
      }
    }
  }

  cleanBox() {
    if (this.dragState.selectionBoxRect) {
      this.dragState.selectionBoxRect.remove();
    }
    this.utils.selectedHandle = null;
    this.utils.hoveredHandle = null;
    this.utils.hoveredCurve = null;
    this.utils.clearHoverHighlight();
    this.resetDragState();

    // Actualizar color de trazos y refrescar pantalla
    this.utils.updateEntitiesStroke();
    this.utils.renderBezierHandles();

    if (window.propertyPanelUI) {
      window.propertyPanelUI.setSelectedEntities(this.service.selectedEntities);
    }

    if (paper.view) paper.view.update();
  }

  onContextMenu(event) {
    // 1. Si hay elementos seleccionados, limpia la selección
    if (this.service.selectedEntities && this.service.selectedEntities.length > 0) {
      this.service.deselectAllEntities();
      this.service.editingEntities = [];
      this.service.deselectAllSegments();
      if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();
      if (this.utils.updateEntitiesStroke) this.utils.updateEntitiesStroke();
      if (window.paper?.view) window.paper.view.update();
      return true; // Cancela selección sin activar repetición
    }

    // 2. Si el lienzo está limpio, retorna false para que cadUtils reactive la última herramienta
    return false;
  }

  cancel() {
    this.cleanBox();
    this.utils.clearHUD();
    this.service.deselectAllEntities();
    this.service.deselectAllSegments();

    if (window.propertyPanelUI) {
      window.propertyPanelUI.setSelectedEntities([]);
    }

    this.utils.renderBezierHandles();
    paper.view.update();
  }
}