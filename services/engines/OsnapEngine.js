/**
 * services/engines/OsnapEngine.js - Motor de atracción magnética (OSNAP)
 */

export class OsnapEngine {
  constructor(cadService) {
    this.service = cadService;
  }

  calculateOsnap(mousePoint, renderMarkerFn, activePath = null, ignoreContext = null) {
    if (this.service.isSnapSuspendedByAlt === true) {
      if (renderMarkerFn) renderMarkerFn(null, null);
      return { point: mousePoint, type: null };
    }

    const zoom = paper.view.zoom;
    const snapRadius = 14 / zoom;
    const EPSILON = 0.01;
    let candidatePoints = [];

    if (this.service.isSnapMasterEnabled) {
      const draggedPath = ignoreContext?.path || (ignoreContext instanceof paper.Path ? ignoreContext : null);
      const draggedSegment = ignoreContext?.segment || null;
      const ignoreEntities = ignoreContext?.ignoreEntities || [];
      const ignoreSegments = ignoreContext?.ignoreSegments || [];
      const selectedPointsCoords = ignoreContext?.selectedPointsCoords || [];

      const isSelfPoint = (pt) => {
        if (!pt) return false;
        return selectedPointsCoords.some(startPt => startPt.getDistance(pt) < EPSILON);
      };

      const isValidSnapEntity = (ent) => {
        if (!ent) return false;
        if (ent.visible === false) return false;
        if (ent.clipMask || ent.data?.isClipMask) return false;
        if (ent.data?.isGrid || ent.data?.isAuxiliary || ent.data?.isHandle) return false;

        if (ent.layer && ent.layer.name === 'hudLayer') return false;
        if (window.cadUtils?.gridGroup && (ent === window.cadUtils.gridGroup || ent.isDescendant(window.cadUtils.gridGroup))) return false;

        const isRaster = ent instanceof paper.Raster || ent.className === 'Raster' || ent.data?.isImageEntity;
        if (!isRaster) {
          const hasStroke = ent.strokeColor && ent.strokeColor.alpha > 0;
          const hasFill = ent.fillColor && ent.fillColor.alpha > 0;
          if (!hasStroke && !hasFill) return false;
        }

        return true;
      };

      const snapBox = new paper.Rectangle(
        mousePoint.subtract(new paper.Point(snapRadius, snapRadius)),
        new paper.Size(snapRadius * 2, snapRadius * 2)
      );

      const circleTargets = this.service.entities.filter(ent => {
        if (!isValidSnapEntity(ent) || !ent.data?.isCircleEntity) return false;
        if (draggedPath && ent === draggedPath) return false;
        if (ignoreEntities.includes(ent)) return false;
        return ent.bounds && ent.bounds.intersects(snapBox);
      });

      const snapTargets = this.service.entities.filter(ent => {
        if (!isValidSnapEntity(ent) || !(ent instanceof paper.Path) || ent.data?.isPointEntity || ent.data?.isCircleEntity) return false;
        if (draggedPath && ent === draggedPath) return false;
        if (ignoreEntities.includes(ent)) return false;
        return ent.bounds && ent.bounds.intersects(snapBox);
      });

      const pointTargets = this.service.entities.filter(ent => {
        if (!isValidSnapEntity(ent) || !ent.data?.isPointEntity) return false;
        if (draggedPath && ent === draggedPath) return false;
        if (ignoreEntities.includes(ent)) return false;
        return ent.bounds && ent.bounds.intersects(snapBox);
      });

      const rasterTargets = this.service.entities.filter(ent => {
        if (!isValidSnapEntity(ent) || !(ent instanceof paper.Raster || ent.className === 'Raster')) return false;
        if (ignoreEntities.includes(ent)) return false;
        return ent.bounds && ent.bounds.intersects(snapBox);
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

        if (this.service.snapFilters.quadrant) {
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

        if (this.service.snapFilters.center) {
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

        if (this.service.snapFilters.center) {
          const centerPt = raster.position;
          if (!isSelfPoint(centerPt)) {
            const d = centerPt.getDistance(mousePoint);
            if (d <= snapRadius) {
              candidatePoints.push({ point: centerPt.clone(), type: 'center', dist: d, priority: 0 });
            }
          }
        }

        if (this.service.snapFilters.endpoint) {
          contour.segments.forEach(seg => {
            if (isSelfPoint(seg.point)) return;
            const d = seg.point.getDistance(mousePoint);
            if (d <= snapRadius) {
              candidatePoints.push({ point: seg.point.clone(), type: 'endpoint', dist: d, priority: 1 });
            }
          });
        }

        if (this.service.snapFilters.midpoint) {
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
      if (this.service.snapFilters.node) {
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
      if (this.service.snapFilters.endpoint) {
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
      if (this.service.snapFilters.midpoint) {
        snapTargets.forEach(path => {
          if (path && path.curves) {
            path.curves.forEach(curve => {
              if (path === draggedPath && draggedSegment) {
                if (curve.segment1 === draggedSegment || curve.segment2 === draggedSegment) return;
              }
              if (ignoreSegments.includes(curve.segment1) || ignoreSegments.includes(curve.segment2)) return;

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
        });
      }

      // 6. OSNAP PARA INTERSECCIONES (Auto-intersecciones y cruces entre entidades)
      if (this.service.snapFilters.intersection) {
        // 6a. Auto-intersecciones sobre cada curva/polilínea (incluye activePath en dibujo)
        snapTargets.forEach(path => {
          if (!path || !path.curves || path.curves.length < 1) return;
          if (draggedPath && path === draggedPath) return;

          const totalLen = path.length || 0;
          if (totalLen <= EPSILON) return;

          const selfCrossings = path.getIntersections();
          selfCrossings.forEach(cross => {
            if (!cross || !cross.point || isSelfPoint(cross.point)) return;

            const off1 = cross.offset;
            const off2 = cross.intersection?.offset;
            if (off1 !== undefined && off2 !== undefined) {
              const rawDiff = Math.abs(off1 - off2);
              const arcSep = path.closed ? Math.min(rawDiff, totalLen - rawDiff) : rawDiff;
              if (arcSep < 1e-3) return;
            } else if (path.segments?.some(seg => seg.point.getDistance(cross.point) < 1e-3)) {
              return;
            }

            const d = cross.point.getDistance(mousePoint);
            if (d <= snapRadius) {
              candidatePoints.push({ point: cross.point.clone(), type: 'intersection', dist: d, priority: 0 });
            }
          });
        });

        // 6b. Intersecciones entre pares de entidades distintas
        const intersectionTargets = Array.from(new Set([...snapTargets, ...circleTargets]))
          .filter(ent => ent !== activePath);

        if (intersectionTargets.length > 1) {
          for (let i = 0; i < intersectionTargets.length; i++) {
            for (let j = i + 1; j < intersectionTargets.length; j++) {
              const pathA = intersectionTargets[i];
              const pathB = intersectionTargets[j];

              if (!pathA || !pathB || pathA === pathB) continue;
              if (draggedPath && (pathA === draggedPath || pathB === draggedPath)) continue;
              if (!pathA.bounds.intersects(pathB.bounds)) continue;

              const crossings = pathA.getIntersections(pathB);
              crossings.forEach(cross => {
                if (cross && cross.point && !isSelfPoint(cross.point)) {
                  const d = cross.point.getDistance(mousePoint);
                  if (d <= snapRadius) {
                    candidatePoints.push({ point: cross.point.clone(), type: 'intersection', dist: d, priority: 0 });
                  }
                }
              });
            }
          }
        }
      }

      if (candidatePoints.length > 0) {
        candidatePoints.sort((a, b) => a.priority - b.priority || a.dist - b.dist);
        const best = candidatePoints[0];
        if (renderMarkerFn) renderMarkerFn(best.point, best.type);
        return { point: best.point, type: best.type };
      }
    }

    // 7. SNAP A GRILLA (Independiente de F3 / OSNAP)
    if (this.service.snapFilters.grid === true) {
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