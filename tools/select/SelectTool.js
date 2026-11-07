/**
 * tools/SelectTool.js - Herramienta de Selección con Estado Encapsulado y Submódulos Delegados
 */
import { BaseTool } from '../BaseTool.js';
import { HandleSelectionHandler } from './HandleSelectionHandler.js';
import { MoveCommand, TransformEntityCommand } from '../../services/commands/cadCommands.js';
import { BoxSelectHandler } from './BoxSelectHandler.js';
import { ParametricGripHandler } from './ParametricGripHandler.js';

export class SelectTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);

    // Control de doble clic
    this.lastClickTime = 0;
    this.lastClickEntity = null;

    this.boxSelectHandler = new BoxSelectHandler(cadService, cadUtils);
    this.parametricGripHandler = new ParametricGripHandler(cadService, cadUtils);
    this.handleModule = new HandleSelectionHandler(cadService, cadUtils);
    
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
    const hitGrip = this.parametricGripHandler.hitTest(event.point);
    if (hitGrip && hitGrip.item) {
      this.parametricGripHandler.onMouseDown(event.point, hitGrip.item);
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
      this.boxSelectHandler.startBox(event.point);
    }
  }

  onMouseDrag(event) {
    // 0. Arrastre de Grip Paramétrico (Bounding Box de Imagen / Círculo) con OSNAP
    if (this.parametricGripHandler.isActive()) {
      this.parametricGripHandler.onMouseDrag(event.point, event.event.shiftKey);
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
    if (this.dragState.selectionStartPoint) {
      this.boxSelectHandler.updateBox(event.point);
    }
  }

  onMouseUp(event) {
    if (this.parametricGripHandler.onMouseUp()) return;

    if (this.activeModule) {
      this.activeModule.onMouseUp();
      this.activeModule = null;
      return;
    }

    if (this.boxSelectHandler.isSelecting()) {
      this.boxSelectHandler.finishBox(event.point, event.event.shiftKey);
      this.cleanBox();
      return;
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
          this.setPrompt('Herramienta Selección: selecciona objetos o haz doble clic en un trazo para editar sus nodos.');
        }

        if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();
        if (this.utils.updateEntitiesStroke) this.utils.updateEntitiesStroke();
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
    this.boxSelectHandler.clean();
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
    this.parametricGripHandler.reset();
    this.cleanBox();
    this.utils.clearHUD();
    this.service.editingEntities = [];
    this.service.deselectAllEntities();
    this.service.deselectAllSegments();

    if (window.propertyPanelUI) {
      window.propertyPanelUI.setSelectedEntities([]);
    }

    this.utils.renderBezierHandles();
    paper.view.update();
  }
}