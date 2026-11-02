/**
 * cadService.js - Servicio geométrico, OSNAP, recortes (Trim), división y estado CAD.
 */
class CADService {
  constructor() {
    this.demoEntities = [];
    this.selectedEntities = [];
    this.selectedSegments = [];
    this.editingEntities = [];
    this.selectedSegments = [];
    this.selectedHandles = [];
    this.hoveredEntity = null;
    this.lastInsertedPoint = null;

    this.history = new CommandHistory();
    this.isSnapMasterEnabled = true;

    this.isSnapMasterEnabled = true;
    this.snapFilters = {
      endpoint: true,
      midpoint: true,
      node: true,
      intersection: true,
      center: true,    // <--- Nuevo filtro
      quadrant: true,  // <--- Nuevo filtro
      grid: false
    };

    this.trimCuttingBoundaries = [];
    this.isTrimCuttingPhase = false;
  }

  executeCommand(command) {
    this.history.execute(command);
    if (window.cadUI && typeof window.cadUI.updateUndoRedoUI === 'function') {
      window.cadUI.updateUndoRedoUI();
    }
  }

  undo() {
    this.history.undo();
    if (window.cadUI && typeof window.cadUI.updateUndoRedoUI === 'function') {
      window.cadUI.updateUndoRedoUI();
    }
  }

  redo() {
    this.history.redo();
    if (window.cadUI && typeof window.cadUI.updateUndoRedoUI === 'function') {
      window.cadUI.updateUndoRedoUI();
    }
  }

  toggleSnapMaster() {
    this.isSnapMasterEnabled = !this.isSnapMasterEnabled;
    return this.isSnapMasterEnabled;
  }

  toggleSnapFilter(filterKey) {
    this.snapFilters[filterKey] = !this.snapFilters[filterKey];
    return this.snapFilters[filterKey];
  }

  calculateOsnap(mousePoint, renderMarkerFn, activePath = null, ignoreContext = null) {

    if (!this.isSnapMasterEnabled) {
      if (renderMarkerFn) renderMarkerFn(null, null);
      return { point: mousePoint, type: null };
    }

    const zoom = paper.view.zoom;
    const snapRadius = 14 / zoom;
    const EPSILON = 0.01;
    let candidatePoints = [];

    const draggedPath = ignoreContext?.path || (ignoreContext instanceof paper.Path ? ignoreContext : null);
    const draggedSegment = ignoreContext?.segment || null;
    const ignoreEntities = ignoreContext?.ignoreEntities || [];
    const ignoreSegments = ignoreContext?.ignoreSegments || [];
    const selectedPointsCoords = ignoreContext?.selectedPointsCoords || [];

    const isSelfPoint = (pt) => {
      if (!pt) return false;
      return selectedPointsCoords.some(startPt => startPt.getDistance(pt) < EPSILON);
    };

    // Helper para filtrar estrictamente entidades válidas de dibujo
    const isValidSnapEntity = (ent) => {
      if (!ent) return false;
      if (ent.visible === false) return false;
      if (ent.clipMask || ent.data?.isClipMask) return false;
      if (ent.data?.isGrid || ent.data?.isAuxiliary || ent.data?.isHandle) return false;
      
      if (ent.layer && ent.layer.name === 'hudLayer') return false;
      if (this.gridGroup && (ent === this.gridGroup || ent.isChildOf(this.gridGroup))) return false;

      const hasStroke = ent.strokeColor && ent.strokeColor.alpha > 0;
      const hasFill = ent.fillColor && ent.fillColor.alpha > 0;
      if (!hasStroke && !hasFill) return false;

      return true;
    };

    // =========================================================================
    // OPTIMIZACIÓN AABB: Caja de búsqueda rápida alrededor del ratón
    // =========================================================================
    const snapBox = new paper.Rectangle(
      mousePoint.subtract(new paper.Point(snapRadius, snapRadius)),
      new paper.Size(snapRadius * 2, snapRadius * 2)
    );

    // Separar objetivos de Snap por tipo
    const circleTargets = this.demoEntities.filter(ent => {
      if (!isValidSnapEntity(ent) || !ent.data?.isCircleEntity) return false;
      if (draggedPath && ent === draggedPath) return false;
      if (ignoreEntities.includes(ent)) return false;
      return ent.bounds && ent.bounds.intersects(snapBox); // Filtro espacial
    });

    const snapTargets = this.demoEntities.filter(ent => {
      if (!isValidSnapEntity(ent) || !(ent instanceof paper.Path) || ent.data?.isPointEntity || ent.data?.isCircleEntity) return false;
      if (draggedPath && ent === draggedPath) return false;
      if (ignoreEntities.includes(ent)) return false;
      
      // Guardián seguro de bounds + filtro espacial AABB
      return ent.bounds && ent.bounds.intersects(snapBox);
    });

    const pointTargets = this.demoEntities.filter(ent => {
      if (!isValidSnapEntity(ent) || !ent.data?.isPointEntity) return false;
      if (draggedPath && ent === draggedPath) return false;
      if (ignoreEntities.includes(ent)) return false;
      return ent.bounds && ent.bounds.intersects(snapBox); // Filtro espacial
    });

    const rasterTargets = this.demoEntities.filter(ent => {
      if (!isValidSnapEntity(ent) || !(ent instanceof paper.Raster || ent.className === 'Raster')) return false;
      if (ignoreEntities.includes(ent)) return false;
      return ent.bounds && ent.bounds.intersects(snapBox); // Filtro espacial
    });

    if (activePath && activePath instanceof paper.Path && activePath.segments && activePath.segments.length > 0 && !activePath.data?.isCircleEntity) {
      if (!activePath.clipMask && !snapTargets.includes(activePath)) {
        snapTargets.push(activePath);
      }
    }

    // 1. OSNAP PARA CÍRCULOS (Centro y Cuadrantes)
    circleTargets.forEach(circle => {
      const center = circle.position.clone();
      const radius = circle.data?.radius || (circle.bounds.width / 2);

      if (circle.data) {
        circle.data.centerPt = center.clone();
      }

      const distToCenter = center.getDistance(mousePoint);

      if (this.snapFilters.quadrant) {
        const quadrants = [
          center.add(new paper.Point(radius, 0)),
          center.add(new paper.Point(0, -radius)),
          center.add(new paper.Point(-radius, 0)),
          center.add(new paper.Point(0, radius))
        ];

        quadrants.forEach(qPt => {
          if (isSelfPoint(qPt)) return;
          const d = qPt.getDistance(mousePoint);
          if (d <= snapRadius) {
            candidatePoints.push({ point: qPt, type: 'quadrant', dist: d, priority: 0 });
          }
        });
      }

      if (this.snapFilters.center) {
        if (isSelfPoint(center)) return;
        const distToEdge = Math.abs(distToCenter - radius);

        if (distToCenter <= snapRadius) {
          candidatePoints.push({ point: center.clone(), type: 'center', dist: distToCenter, priority: 0 });
        } else if (distToEdge <= snapRadius) {
          candidatePoints.push({ point: center.clone(), type: 'center', dist: distToEdge + (5 / zoom), priority: 1 });
        }
      }
    });

    // 2. OSNAP PARA IMÁGENES (Centro, Esquinas y Puntos Medios)
    rasterTargets.forEach(raster => {
      const contour = this.getRasterContourPath(raster);
      if (!contour) return;

      if (this.snapFilters.center) {
        const centerPt = raster.position;
        if (!isSelfPoint(centerPt)) {
          const d = centerPt.getDistance(mousePoint);
          if (d <= snapRadius) {
            candidatePoints.push({ point: centerPt.clone(), type: 'center', dist: d, priority: 0 });
          }
        }
      }

      if (this.snapFilters.endpoint) {
        contour.segments.forEach(seg => {
          if (isSelfPoint(seg.point)) return;
          const d = seg.point.getDistance(mousePoint);
          if (d <= snapRadius) {
            candidatePoints.push({ point: seg.point.clone(), type: 'endpoint', dist: d, priority: 1 });
          }
        });
      }

      if (this.snapFilters.midpoint) {
        contour.curves.forEach(curve => {
          if (curve && curve.length > 0) {
            const mid = curve.getPointAt(curve.length * 0.5);
            if (mid && !isSelfPoint(mid)) {
              const d = mid.getDistance(mousePoint);
              if (d <= snapRadius) {
                candidatePoints.push({ point: mid, type: 'midpoint', dist: d, priority: 2 });
              }
            }
          }
        });
      }

      contour.remove();
    });

    // 3. OSNAP PARA NODOS / PUNTOS
    if (this.snapFilters.node) {
      pointTargets.forEach(ent => {
        const pt = ent.position;
        if (isSelfPoint(pt)) return;

        const d = pt.getDistance(mousePoint);
        if (d <= snapRadius) {
          candidatePoints.push({ point: new paper.Point(pt.x, pt.y), type: 'node', dist: d, priority: 0 });
        }
      });
    }

    // 4. OSNAP PARA ENDPOINTS DE LÍNEAS / POLILÍNEAS
    if (this.snapFilters.endpoint) {
      snapTargets.forEach(path => {
        if (path && path.segments) {
          path.segments.forEach((seg, idx) => {
            if (path === activePath && idx === path.segments.length - 1) return;
            if (path === draggedPath && seg === draggedSegment) return;
            if (ignoreSegments.includes(seg)) return;
            
            if (isSelfPoint(seg.point)) return;

            const d = seg.point.getDistance(mousePoint);
            if (d <= snapRadius) {
              candidatePoints.push({ point: seg.point.clone(), type: 'endpoint', dist: d, priority: 1 });
            }
          });
        }
      });
    }

    // 5. OSNAP PARA MIDPOINTS DE LÍNEAS / POLILÍNEAS
    if (this.snapFilters.midpoint) {
      snapTargets.forEach(path => {
        if (path && path.curves) {
          path.curves.forEach(curve => {
            if (path === draggedPath && draggedSegment) {
              if (curve.segment1 === draggedSegment || curve.segment2 === draggedSegment) return;
            }
            if (ignoreSegments.includes(curve.segment1) || ignoreSegments.includes(curve.segment2)) return;

            if (curve && curve.length > 0) {
              const mid = curve.getPointAt(curve.length * 0.5);
              if (mid) {
                if (isSelfPoint(mid)) return;

                const d = mid.getDistance(mousePoint);
                if (d <= snapRadius) {
                  candidatePoints.push({ point: mid, type: 'midpoint', dist: d, priority: 2 });
                }
              }
            }
          });
        }
      });
    }

    // Cambio menor en el bloque 6 (Intersecciones):
    if (this.snapFilters.intersection && snapTargets.length > 1) { // <-- Condición > 1 agregada
      for (let i = 0; i < snapTargets.length; i++) {
        for (let j = i + 1; j < snapTargets.length; j++) {
          const pathA = snapTargets[i];
          const pathB = snapTargets[j];

          if (!pathA || !pathB || pathA === pathB) continue;
          if (draggedPath && (pathA === draggedPath || pathB === draggedPath)) continue;

          // Doble chequeo ultra-rápido de cajas delimitadoras
          if (!pathA.bounds.intersects(pathB.bounds)) continue;

          const crossings = pathA.getIntersections(pathB);
          crossings.forEach(cross => {
            if (cross && cross.point) {
              if (isSelfPoint(cross.point)) return;

              const d = cross.point.getDistance(mousePoint);
              if (d <= snapRadius) {
                candidatePoints.push({ point: cross.point.clone(), type: 'intersection', dist: d, priority: 0 });
              }
            }
          });
        }
      }
    }

    // Ordenar y devolver el candidato más cercano / prioritario
    if (candidatePoints.length > 0) {
      candidatePoints.sort((a, b) => a.priority - b.priority || a.dist - b.dist);
      const best = candidatePoints[0];
      if (renderMarkerFn) renderMarkerFn(best.point, best.type);
      return { point: best.point, type: best.type };
    }

    // 7. SNAP A GRILLA (Fallback)
    if (this.snapFilters.grid === true) {
      let subStep = zoom > 3 ? 4 : (zoom < 0.3 ? 100 : 20);
      const gridSnappedX = Math.round(mousePoint.x / subStep) * subStep;
      const gridSnappedY = Math.round(mousePoint.y / subStep) * subStep;
      const gridPoint = new paper.Point(gridSnappedX, gridSnappedY);

      if (gridPoint.getDistance(mousePoint) <= snapRadius * 0.8) {
        if (renderMarkerFn) renderMarkerFn(gridPoint, 'grid');
        return { point: gridPoint, type: 'grid' };
      }
    }

    if (renderMarkerFn) renderMarkerFn(null, null);
    return { point: mousePoint, type: null };
  }

  //SELECTION SECTION
  selectEntity(entity, addToSelection = false) {
    if (!addToSelection) {
      this.deselectAllEntities();
      this.editingEntities = [];
    }

    if (entity && !this.selectedEntities.includes(entity)) {
      if (!entity.data) entity.data = {};
      
      if (!entity.data.origStrokeColor && entity.strokeColor) {
        entity.data.origStrokeColor = entity.strokeColor.toCSS ? entity.strokeColor.toCSS() : entity.strokeColor;
      }
      if (!entity.data.origFillColor && entity.fillColor) {
        entity.data.origFillColor = entity.fillColor.toCSS ? entity.fillColor.toCSS() : entity.fillColor;
      }
      if (!entity.data.origStrokeWidth && entity.strokeWidth) {
        entity.data.origStrokeWidth = entity.strokeWidth;
      }

      this.selectedEntities.push(entity);
      
      if (!this.editingEntities.includes(entity)) {
        this.editingEntities.push(entity);
      }

      if (entity instanceof paper.Path && entity.segments && !entity.data?.isPointEntity) {
        entity.segments.forEach(seg => {
          if (!this.selectedSegments.includes(seg)) {
            this.selectedSegments.push(seg);
          }
        });
      }

      entity.selected = false;
    }

    if (window.cadUtils) {
      window.cadUtils.updateEntitiesStroke();
      window.cadUtils.renderBezierHandles();
    }
  }

  deselectAllEntities() {
    this.selectedEntities = [];
    this.selectedSegments = [];
    this.deselectAllHandles();

    if (window.cadUtils) {
      window.cadUtils.updateEntitiesStroke();
      window.cadUtils.renderBezierHandles();
    }

    if (window.cadUI && typeof window.cadUI.updatePropertyPanel === 'function') {
      window.cadUI.updatePropertyPanel(null);
    }
  }

  selectHandle(segment, type, addToSelection = false) {
    if (!addToSelection) {
      this.deselectAllHandles();
    }
    if (segment && type) {
      const exists = this.selectedHandles.some(h => h.segment === segment && h.type === type);
      if (!exists) {
        this.selectedHandles.push({ segment, type });
      }
    }
    if (window.cadUtils) {
      window.cadUtils.renderBezierHandles();
    }
  }

  deselectHandle(segment, type) {
    this.selectedHandles = this.selectedHandles.filter(h => !(h.segment === segment && h.type === type));
    if (window.cadUtils) {
      window.cadUtils.renderBezierHandles();
    }
  }

  deselectAllHandles() {
    this.selectedHandles = [];
  }

  isSelectedHandle(segment, type) {
    return this.selectedHandles.some(h => h.segment === segment && h.type === type);
  }

  deselectEntity(entity) {
    const index = this.selectedEntities.indexOf(entity);
    if (index !== -1) {
      this.selectedEntities.splice(index, 1);
    }
    
    // Remover también sus segmentos si estaban seleccionados
    if (entity instanceof paper.Path && entity.segments) {
      entity.segments.forEach(seg => this.deselectSegment(seg));
    }

    if (window.cadUtils) {
      window.cadUtils.updateEntitiesStroke();
      window.cadUtils.renderBezierHandles();
    }

    // Refrescar el panel con la entidad restante o limpiarlo si no queda ninguna
    if (window.cadUI && typeof window.cadUI.updatePropertyPanel === 'function') {
      const remaining = this.selectedEntities[this.selectedEntities.length - 1] || null;
      window.cadUI.updatePropertyPanel(remaining);
    }
  }


  deselectAllEditingEntities() {
    this.selectedEntities = [];
    this.selectedSegments = [];
    this.editingEntities = [];
    this.deselectAllHandles();

    if (window.cadUtils) {
      window.cadUtils.updateEntitiesStroke();
      window.cadUtils.renderBezierHandles();
    }
  }

  selectSegment(segment, addToSelection = false) {
    if (!addToSelection) {
      this.selectedSegments = [];
    }
    if (segment && !this.selectedSegments.includes(segment)) {
      this.selectedSegments.push(segment);
    }
  }

  deselectSegment(segment) {
    const index = this.selectedSegments.indexOf(segment);
    if (index !== -1) {
      this.selectedSegments.splice(index, 1);
    }

    if (window.cadUtils) {
      window.cadUtils.renderBezierHandles();
    }
  }

  deselectAllSegments() {
    this.selectedSegments = [];
  }
  //SELECTION SECTION


  

  performTrim(targetPath, clickPt, renderBezierFn) {
    if (!this.trimCuttingBoundaries.length || !targetPath || this.trimCuttingBoundaries.includes(targetPath)) return;

    let intersections = [];
    this.trimCuttingBoundaries.forEach(boundary => {
      const crossings = targetPath.getIntersections(boundary);
      crossings.forEach(c => {
        if (c && c.offset !== undefined) {
          intersections.push({ offset: c.offset, point: c.point });
        }
      });
    });

    if (intersections.length === 0) return;

    intersections.sort((a, b) => a.offset - b.offset);

    const EPSILON = 0.05;
    const uniqueCutOffsets = [];
    intersections.forEach(item => {
      if (!uniqueCutOffsets.some(existing => Math.abs(existing - item.offset) < EPSILON)) {
        uniqueCutOffsets.push(item.offset);
      }
    });

    if (uniqueCutOffsets.length === 0) return;

    const clickLoc = targetPath.getNearestLocation(clickPt);
    if (!clickLoc) return;
    const tolerance = 15 / paper.view.zoom;
    if (clickLoc.point.getDistance(clickPt) > tolerance) return;

    const origStrokeColor = targetPath.strokeColor || '#00e5ff';
    const origStrokeWidth = targetPath.strokeWidth || 2;
    const origIdx = this.demoEntities.indexOf(targetPath);

    let currentPath = targetPath.clone();
    
    if (currentPath.closed) {
      currentPath.splitAt(uniqueCutOffsets[0]);
    }

    let splitLocs = [];
    this.trimCuttingBoundaries.forEach(boundary => {
      const crossings = currentPath.getIntersections(boundary);
      crossings.forEach(c => {
        if (c && c.offset !== undefined && c.offset > 0.01 && c.offset < currentPath.length - 0.01) {
          splitLocs.push(c.offset);
        }
      });
    });

    splitLocs.sort((a, b) => b - a);

    let subPaths = [currentPath];
    splitLocs.forEach(off => {
      for (let i = 0; i < subPaths.length; i++) {
        const p = subPaths[i];
        const loc = p.getLocationAt(off);
        if (loc) {
          const remainder = p.splitAt(loc);
          if (remainder) {
            subPaths.push(remainder);
          }
          break;
        }
      }
    });

    let clickedPathIndex = -1;
    let minDistance = Infinity;

    subPaths.forEach((p, idx) => {
      const nearest = p.getNearestLocation(clickPt);
      if (nearest) {
        const dist = nearest.point.getDistance(clickPt);
        if (dist < minDistance) {
          minDistance = dist;
          clickedPathIndex = idx;
        }
      }
    });

    // --- CAMBIO AQUÍ: Coleccionar tramos sin alterar la escena directamente ---
    const remainingPaths = [];
    subPaths.forEach((p, idx) => {
      if (idx === clickedPathIndex) {
        p.remove();
      } else {
        p.strokeColor = origStrokeColor;
        p.strokeWidth = origStrokeWidth;
        p.closed = false;
        remainingPaths.push(p);
      }
    });

    // Delegar ejecución al historial para habilitar Undo/Redo
    if (window.TrimCommand) {
      const trimCmd = new TrimCommand(this, targetPath, remainingPaths, origIdx);
      this.executeCommand(trimCmd);
    }

    if (renderBezierFn) renderBezierFn();
  }

  deleteSelectedElements(renderBezierFn) {
    // A. Borrado de PUNTOS DE CONTROL (Vértices/Anclas seleccionados)
    if (this.selectedSegments.length > 0) {
      const pathSegmentMap = new Map();

      this.selectedSegments.forEach(seg => {
        if (seg && seg.path) {
          if (!pathSegmentMap.has(seg.path)) {
            pathSegmentMap.set(seg.path, []);
          }
          pathSegmentMap.get(seg.path).push(seg);
        }
      });

      const pathsAffected = [];

      pathSegmentMap.forEach((segs, path) => {
        const originalSegmentsState = path.segments.map(s => ({
          point: s.point.clone(),
          handleIn: s.handleIn.clone(),
          handleOut: s.handleOut.clone()
        }));

        const indicesToDelete = segs
          .map(s => s.index)
          .filter(idx => idx !== undefined && idx !== -1)
          .sort((a, b) => b - a);

        pathsAffected.push({
          path: path,
          indicesToDelete: indicesToDelete,
          originalSegmentsState: originalSegmentsState
        });
      });

      const deleteCmd = new DeleteCommand(this, {
        type: 'segments',
        pathsAffected: pathsAffected
      });

      this.executeCommand(deleteCmd);
      if (renderBezierFn) renderBezierFn();
      return;
    }

    // B. Borrado de ENTIDAD COMPLETA
    if (this.selectedEntities.length > 0) {
      const entitiesToDelete = [...this.selectedEntities];

      const deleteCmd = new DeleteCommand(this, {
        type: 'entities',
        entities: entitiesToDelete
      });

      this.executeCommand(deleteCmd);
      if (renderBezierFn) renderBezierFn();
    }
  }

  clearCanvas(renderBezierFn) {
    this.demoEntities.forEach(ent => ent.remove());
    this.demoEntities = [];
    this.selectedEntities = [];
    this.selectedSegments = [];
    if (renderBezierFn) renderBezierFn();
  }





  // POR ESTE BLOQUE:
  createDemoEntities() {
    const rect = new paper.Path.Rectangle({
      point: [-180, -120],
      size: [120, 80],
      strokeColor: '#00e5ff',
      strokeWidth: 2,
    });
    rect.data = { 
      layerId: '0',
      colorByLayer: true,      // <--- Color heredado de la capa '0'
      widthByLayer: false,
      baseStrokeWidth: 2,
      isDynamicStroke: true
    };
    this.demoEntities.push(rect);

    const poly = new paper.Path.RegularPolygon({
      center: [150, -80],
      sides: 6,
      radius: 50,
      strokeColor: '#f59e0b',
      strokeWidth: 2
    });
    poly.data = { 
      layerId: '0',
      colorByLayer: false,
      origStrokeColor: '#f59e0b',
      widthByLayer: false,
      baseStrokeWidth: 2,
      isDynamicStroke: true
    };
    this.demoEntities.push(poly);

    const curve = new paper.Path({
      segments: [
        [new paper.Point(-120, 100), null, new paper.Point(40, -60)],
        [new paper.Point(0, 180), new paper.Point(-40, 0), new paper.Point(40, 0)],
        [new paper.Point(140, 100), new paper.Point(-40, 50), null]
      ],
      strokeColor: '#10b981',
      strokeWidth: 2.5
    });
    curve.data = { 
      layerId: '0',
      colorByLayer: false,
      origStrokeColor: '#10b981',
      widthByLayer: false,
      baseStrokeWidth: 2.5,      // <--- Grosor heredado de la capa '0'
      isDynamicStroke: true
    };
    this.demoEntities.push(curve);

    this.createPointEntity(new paper.Point(-120, -120), { layerId: '0', colorByLayer: true });
    this.createPointEntity(new paper.Point(-60, -120), { layerId: '0', colorByLayer: true });

    if (this.utils?.updateEntitiesStroke) {
      this.utils.updateEntitiesStroke();
    }
  }

  createPointEntity(pt, options = {}) {
    const EPSILON = 0.001;

    if (this.lastInsertedPoint && this.lastInsertedPoint.getDistance(pt) < EPSILON) {
      return null;
    }

    const zoom = paper.view.zoom;
    const opts = options || {};
    const nodeTheme = (window.CAD_THEME && window.CAD_THEME.node) ? window.CAD_THEME.node : {};

    const layerId = String(opts.layerId || this.utils?.layerManager?.activeLayerId || '0');
    const colorByLayer = opts.colorByLayer !== undefined ? opts.colorByLayer : true;

    // Resolver el color directamente de la capa si es BYLAYER
    let strokeColor = opts.strokeColor;
    if (colorByLayer && window.cadUtils?.layerManager) {
      const layer = window.cadUtils.layerManager.layers.get(layerId);
      strokeColor = layer ? layer.color : (nodeTheme.defaultStrokeColor || '#18fcf1');
    } else if (!strokeColor) {
      strokeColor = nodeTheme.defaultStrokeColor || '#18fcf1';
    }

    const fillColor = opts.fillColor || nodeTheme.defaultFillColor || '#10141D';

    if (window.cadUtils && window.cadUtils.nodesLayer) {
      window.cadUtils.nodesLayer.activate();
    }

    const pointMarker = new paper.Path.Circle({
      center: pt,
      radius: (nodeTheme.normalRadiusPx || 3.5) / zoom,
      fillColor: fillColor,
      strokeColor: strokeColor,
      strokeWidth: (nodeTheme.normalWidthPx || 1.0) / zoom
    });

    pointMarker.data = { 
      isPointEntity: true, 
      layerId: layerId,
      colorByLayer: colorByLayer,
      centerPt: pt.clone(),
      origFillColor: fillColor,
      origStrokeColor: colorByLayer ? undefined : strokeColor,
      origStrokeWidth: (nodeTheme.normalWidthPx || 1.0) / zoom 
    };

    if (window.cadUtils && window.cadUtils.drawLayer) {
      window.cadUtils.drawLayer.activate();
    }

    const success = this.registerEntity(pointMarker);
    if (success) {
      this.lastInsertedPoint = pt.clone();
      return pointMarker;
    }
    return null;
  }

  divideEntityByCount(entity, count, renderBezierFn, options = {}) {
    if (!entity || count < 2 || !entity.length) return [];
    const totalLen = entity.length;
    const step = totalLen / count;
    const pointsCreated = [];

    const isClosed = entity.closed || false;
    const maxIndex = isClosed ? (count - 1) : count;

    for (let i = 0; i <= maxIndex; i++) {
      let offset = i * step;
      if (i === count) offset = totalLen;

      const pt = entity.getPointAt(offset);
      if (pt) {
        const pointEntity = this.createPointEntity(pt, options);
        if (pointEntity) pointsCreated.push(pointEntity);
      }
    }

    if (renderBezierFn) renderBezierFn();
    return pointsCreated;
  }

  divideEntityByDistance(entity, distance, renderBezierFn, options = {}, customStartPt = null) {
    if (!entity || distance <= 0 || !entity.length) return [];
    const totalLen = entity.length;
    if (distance > totalLen) return [];

    const pointsCreated = [];
    const isClosed = entity.closed || false;

    // 1. Determinar el offset del punto de inicio elegido
    let startOffset = 0;
    if (customStartPt) {
      const loc = entity.getNearestLocation(customStartPt);
      if (loc) startOffset = loc.offset;
    }

    // 2. Crear punto en la posición de inicio
    const startPt = entity.getPointAt(startOffset);
    if (startPt) {
      const pointEntity = this.createPointEntity(startPt, options);
      if (pointEntity) pointsCreated.push(pointEntity);
    }

    if (isClosed) {
      // Curva cerrada: división circular completa partiendo del offset de inicio
      const count = Math.floor(totalLen / distance);
      for (let i = 1; i < count; i++) {
        const offset = (startOffset + i * distance) % totalLen;
        const pt = entity.getPointAt(offset);
        if (pt) {
          const pointEntity = this.createPointEntity(pt, options);
          if (pointEntity) pointsCreated.push(pointEntity);
        }
      }
    } else {
      // Curva abierta: División hacia adelante (hacia el final de la curva)
      let fwdOffset = startOffset + distance;
      while (fwdOffset <= totalLen + 0.001) {
        const pt = entity.getPointAt(Math.min(fwdOffset, totalLen));
        if (pt) {
          const pointEntity = this.createPointEntity(pt, options);
          if (pointEntity) pointsCreated.push(pointEntity);
        }
        fwdOffset += distance;
      }

      // Curva abierta: División hacia atrás (hacia el inicio de la curva)
      let bwdOffset = startOffset - distance;
      while (bwdOffset >= -0.001) {
        const pt = entity.getPointAt(Math.max(bwdOffset, 0));
        if (pt) {
          const pointEntity = this.createPointEntity(pt, options);
          if (pointEntity) pointsCreated.push(pointEntity);
        }
        bwdOffset -= distance;
      }
    }

    if (renderBezierFn) renderBezierFn();
    return pointsCreated;
  }

  createLineEntity(fromPt, toPt, isDynamic = true, baseWidth = 1) {
    const zoom = paper.view.zoom;
    const initialWidth = isDynamic ? (baseWidth / zoom) : baseWidth;

    const line = new paper.Path.Line({
      from: fromPt,
      to: toPt,
      strokeColor: '#00e5ff',
      strokeWidth: initialWidth
    });

    line.data = {
      isDynamicStroke: isDynamic, // true = cosmético (fijo a pantalla), false = modelo (escala con zoom)
      baseStrokeWidth: baseWidth,  // grosor base (1px si es dinámico, N unidades si es de modelo)
      origStrokeColor: '#00e5ff',
      origStrokeWidth: initialWidth
    };

    const success = this.registerEntity(line);
    if (success) {
      return line;
    }
    return null;
  }

  createCircleEntity(centerPt, radius, isDynamic = true, baseWidth = 1) {
    const zoom = paper.view.zoom;
    const initialWidth = isDynamic ? (baseWidth / zoom) : baseWidth;

    const circlePath = new paper.Path.Circle({
      center: centerPt,
      radius: radius,
      strokeColor: '#3b82f6',
      strokeWidth: initialWidth,
      fillColor: null // Strictly null: interior inerte y transparente
    });

    circlePath.data = {
      isCircleEntity: true,
      isDynamicStroke: isDynamic,
      baseStrokeWidth: baseWidth,
      centerPt: centerPt.clone(),
      radius: radius,
      origStrokeWidth: initialWidth,
      origStrokeColor: '#3b82f6',
      origFillColor: null
    };

    const success = this.registerEntity(circlePath);
    if (success) {
      if (window.AddEntityCommand) {
        const addCmd = new AddEntityCommand(this, circlePath);
        this.executeCommand(addCmd);
      }
      return circlePath;
    }
    return null;
  }

  registerEntity(entity) {
    const EPSILON = 0.001; // Tolerancia de modelo CAD

    if (!entity) return false;

    // A. Si es una Línea / Camino: prevenir longitud cero
    if (entity instanceof paper.Path && !entity.data?.isPointEntity) {
      if (entity.length < EPSILON) {
        entity.remove();
        return false;
      }
    }

    this.demoEntities.push(entity);
    return true;
  }

  getRasterContourPath(raster) {
    if (!raster || !raster.width || !raster.height) return null;

    const halfW = raster.width / 2;
    const halfH = raster.height / 2;
    const m = raster.matrix;

    const corners = [
      m.transform(new paper.Point(-halfW, -halfH)), // Esquina superior izquierda
      m.transform(new paper.Point(halfW, -halfH)),  // Esquina superior derecha
      m.transform(new paper.Point(halfW, halfH)),   // Esquina inferior derecha
      m.transform(new paper.Point(-halfW, halfH))   // Esquina inferior izquierda
    ];

    return new paper.Path({
      segments: corners,
      closed: true,
      insert: false
    });
  }
  
}

window.CADService = CADService;