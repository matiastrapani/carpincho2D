/**
 * services/engines/OsnapEngine.js - Motor de atracción magnética (OSNAP)
 */

import {
  resolveFromPoint,
  collectExtendedOsnapCandidates
} from './OsnapGeometryMath.js';

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
    const candidatePoints = [];

    if (this.service.isSnapMasterEnabled) {
      const draggedPath = ignoreContext?.path || (ignoreContext instanceof paper.Path ? ignoreContext : null);
      const draggedSegment = ignoreContext?.segment || null;
      const ignoreEntities = ignoreContext?.ignoreEntities || [];
      const ignoreSegments = ignoreContext?.ignoreSegments || [];
      const ignoreHandles = ignoreContext?.ignoreHandles || [];
      const selectedPointsCoords = ignoreContext?.selectedPointsCoords || [];

      const isSelfPoint = (pt) => Boolean(pt && selectedPointsCoords.some((s) => s.getDistance(pt) < EPSILON));
      const isDynamicCurve = this._createDynamicCurveFilter(draggedPath, draggedSegment, ignoreSegments, ignoreHandles);
      const { circleTargets, snapTargets, pointTargets, rasterTargets } =
        this._collectTargetGroups(mousePoint, snapRadius, activePath, draggedPath, ignoreEntities);

      circleTargets.forEach((circle) => {
        const center = circle.position.clone();
        const radius = circle.data?.radius || (circle.bounds.width / 2);
        if (circle.data) circle.data.centerPt = center.clone();

        if (this.service.snapFilters.quadrant) {
          [
            center.add(new paper.Point(radius, 0)),
            center.add(new paper.Point(0, -radius)),
            center.add(new paper.Point(-radius, 0)),
            center.add(new paper.Point(0, radius))
          ].forEach((qPt) => {
            if (!isSelfPoint(qPt) && qPt.getDistance(mousePoint) <= snapRadius) {
              candidatePoints.push({ point: qPt, type: 'quadrant', dist: qPt.getDistance(mousePoint), priority: 0 });
            }
          });
        }

        if (this.service.snapFilters.center && !isSelfPoint(center)) {
          const distToCenter = center.getDistance(mousePoint);
          const distToEdge = Math.abs(distToCenter - radius);
          if (distToCenter <= snapRadius) {
            candidatePoints.push({ point: center.clone(), type: 'center', dist: distToCenter, priority: 0 });
          } else if (distToEdge <= snapRadius) {
            candidatePoints.push({ point: center.clone(), type: 'center', dist: distToEdge + (5 / zoom), priority: 1 });
          }
        }
      });

      rasterTargets.forEach((raster) => {
        const contour = this.getRasterContourPath(raster);
        if (!contour) return;
        if (this.service.snapFilters.center && !isSelfPoint(raster.position) && raster.position.getDistance(mousePoint) <= snapRadius) {
          candidatePoints.push({ point: raster.position.clone(), type: 'center', dist: raster.position.getDistance(mousePoint), priority: 0 });
        }
        if (this.service.snapFilters.endpoint) {
          contour.segments.forEach((seg) => {
            if (!isSelfPoint(seg.point) && seg.point.getDistance(mousePoint) <= snapRadius) {
              candidatePoints.push({ point: seg.point.clone(), type: 'endpoint', dist: seg.point.getDistance(mousePoint), priority: 1 });
            }
          });
        }
        if (this.service.snapFilters.midpoint) {
          contour.curves.forEach((curve) => {
            const mid = curve?.length > 0 ? curve.getPointAt(curve.length * 0.5) : null;
            if (mid && !isSelfPoint(mid) && mid.getDistance(mousePoint) <= snapRadius) {
              candidatePoints.push({ point: mid, type: 'midpoint', dist: mid.getDistance(mousePoint), priority: 2 });
            }
          });
        }
        contour.remove();
      });

      if (this.service.snapFilters.node) {
        pointTargets.forEach((ent) => {
          const pt = ent.position;
          if (!isSelfPoint(pt) && pt.getDistance(mousePoint) <= snapRadius) {
            candidatePoints.push({ point: new paper.Point(pt.x, pt.y), type: 'node', dist: pt.getDistance(mousePoint), priority: 0 });
          }
        });
      }

      this._collectPathGeometryOsnaps(snapTargets, activePath, draggedPath, draggedSegment, ignoreSegments, isDynamicCurve, isSelfPoint, mousePoint, snapRadius, candidatePoints);
      this._collectEditingHandleOsnaps(draggedPath, draggedSegment, ignoreEntities, ignoreSegments, ignoreHandles, isSelfPoint, mousePoint, snapRadius, candidatePoints);
      this._collectIntersectionOsnaps(snapTargets, circleTargets, activePath, draggedPath, isDynamicCurve, isSelfPoint, mousePoint, snapRadius, EPSILON, candidatePoints);

      const extendedCandidates = collectExtendedOsnapCandidates({
        snapFilters: this.service.snapFilters,
        circleTargets,
        snapTargets,
        rasterTargets,
        mousePoint,
        snapRadius,
        fromPoint: resolveFromPoint(activePath, ignoreContext),
        draggedPath,
        isSelfPoint,
        isDynamicCurve,
        getRasterContourPath: (raster) => this.getRasterContourPath(raster)
      });
      if (extendedCandidates.length > 0) candidatePoints.push(...extendedCandidates);

      if (candidatePoints.length > 0) {
        candidatePoints.sort((a, b) => a.priority - b.priority || a.dist - b.dist);
        const best = candidatePoints[0];
        if (renderMarkerFn) renderMarkerFn(best.point, best.type);
        return { point: best.point, type: best.type };
      }
    }

    if (this.service.snapFilters.grid === true) {
      const subStep = zoom > 3 ? 4 : (zoom < 0.3 ? 100 : 20);
      const gridPoint = new paper.Point(
        Math.round(mousePoint.x / subStep) * subStep,
        Math.round(mousePoint.y / subStep) * subStep
      );
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

  _createDynamicCurveFilter(draggedPath, draggedSegment, ignoreSegments, ignoreHandles) {
    return (curve) => {
      if (!curve) return false;
      const seg1 = curve.segment1;
      const seg2 = curve.segment2;

      if (draggedPath && draggedSegment && (seg1 === draggedSegment || seg2 === draggedSegment)) {
        return true;
      }
      if (ignoreSegments.includes(seg1) || ignoreSegments.includes(seg2)) {
        return true;
      }
      return ignoreHandles.some((h) =>
        (h.segment === seg1 && h.type === 'handleOut') ||
        (h.segment === seg2 && h.type === 'handleIn')
      );
    };
  }

  _collectTargetGroups(mousePoint, snapRadius, activePath, draggedPath, ignoreEntities) {
    const isValidSnapEntity = (ent) => {
      if (!ent || ent.visible === false || ent.clipMask || ent.data?.isClipMask) return false;
      if (ent.data?.isGrid || ent.data?.isAuxiliary || ent.data?.isHandle) return false;
      if (ent.layer && ent.layer.name === 'hudLayer') return false;
      if (window.cadUtils?.gridGroup && (ent === window.cadUtils.gridGroup || ent.isDescendant(window.cadUtils.gridGroup))) {
        return false;
      }
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

    const canEvaluate = (ent) => {
      if (draggedPath && ent === draggedPath) return false;
      if (ignoreEntities.includes(ent)) return false;
      return Boolean(ent.bounds && ent.bounds.intersects(snapBox));
    };

    const circleTargets = this.service.entities.filter((ent) =>
      isValidSnapEntity(ent) && ent.data?.isCircleEntity && canEvaluate(ent)
    );
    const snapTargets = this.service.entities.filter((ent) =>
      isValidSnapEntity(ent) && (ent instanceof paper.Path) && !ent.data?.isPointEntity && !ent.data?.isCircleEntity && canEvaluate(ent)
    );
    const pointTargets = this.service.entities.filter((ent) =>
      isValidSnapEntity(ent) && ent.data?.isPointEntity && canEvaluate(ent)
    );
    const rasterTargets = this.service.entities.filter((ent) =>
      isValidSnapEntity(ent) && (ent instanceof paper.Raster || ent.className === 'Raster') && canEvaluate(ent)
    );

    if (activePath instanceof paper.Path && activePath.segments?.length > 0 && !activePath.data?.isCircleEntity) {
      if (!activePath.clipMask && !snapTargets.includes(activePath)) {
        snapTargets.push(activePath);
      }
    }

    return { circleTargets, snapTargets, pointTargets, rasterTargets };
  }

  _collectPathGeometryOsnaps(snapTargets, activePath, draggedPath, draggedSegment, ignoreSegments, isDynamicCurve, isSelfPoint, mousePoint, snapRadius, candidatePoints) {
    if (this.service.snapFilters.endpoint) {
      snapTargets.forEach((path) => {
        if (!path?.segments) return;
        path.segments.forEach((seg, idx) => {
          if (path === activePath && idx === path.segments.length - 1) return;
          if (path === draggedPath && seg === draggedSegment) return;
          if (ignoreSegments.includes(seg) || isSelfPoint(seg.point)) return;

          const d = seg.point.getDistance(mousePoint);
          if (d <= snapRadius) {
            candidatePoints.push({ point: seg.point.clone(), type: 'endpoint', dist: d, priority: 1 });
          }
        });
      });
    }

    if (this.service.snapFilters.midpoint) {
      snapTargets.forEach((path) => {
        if (!path?.curves) return;
        path.curves.forEach((curve) => {
          if (!curve || curve.length <= 0 || isDynamicCurve(curve)) return;
          const mid = curve.getPointAt(curve.length * 0.5);
          if (mid && !isSelfPoint(mid)) {
            const d = mid.getDistance(mousePoint);
            if (d <= snapRadius) {
              candidatePoints.push({ point: mid, type: 'midpoint', dist: d, priority: 2 });
            }
          }
        });
      });
    }
  }

  _collectIntersectionOsnaps(snapTargets, circleTargets, activePath, draggedPath, isDynamicCurve, isSelfPoint, mousePoint, snapRadius, EPSILON, candidatePoints) {
    if (!this.service.snapFilters.intersection) return;

    snapTargets.forEach((path) => {
      if (!path?.curves || path.curves.length < 1) return;
      if (draggedPath && path === draggedPath) return;

      const totalLen = path.length || 0;
      if (totalLen <= EPSILON) return;

      path.getIntersections().forEach((cross) => {
        if (!cross?.point || isSelfPoint(cross.point)) return;
        if (isDynamicCurve(cross.curve) || isDynamicCurve(cross.intersection?.curve)) return;

        const off1 = cross.offset;
        const off2 = cross.intersection?.offset;
        if (off1 !== undefined && off2 !== undefined) {
          const rawDiff = Math.abs(off1 - off2);
          const arcSep = path.closed ? Math.min(rawDiff, totalLen - rawDiff) : rawDiff;
          if (arcSep < 1e-3) return;
        } else if (path.segments?.some((seg) => seg.point.getDistance(cross.point) < 1e-3)) {
          return;
        }

        const d = cross.point.getDistance(mousePoint);
        if (d <= snapRadius) {
          candidatePoints.push({ point: cross.point.clone(), type: 'intersection', dist: d, priority: 0 });
        }
      });
    });

    const intersectionTargets = Array.from(new Set([...snapTargets, ...circleTargets]))
      .filter((ent) => ent !== activePath);

    for (let i = 0; i < intersectionTargets.length; i++) {
      for (let j = i + 1; j < intersectionTargets.length; j++) {
        const pathA = intersectionTargets[i];
        const pathB = intersectionTargets[j];
        if (!pathA || !pathB || pathA === pathB) continue;
        if (draggedPath && (pathA === draggedPath || pathB === draggedPath)) continue;
        if (!pathA.bounds.intersects(pathB.bounds)) continue;

        pathA.getIntersections(pathB).forEach((cross) => {
          if (!cross?.point || isSelfPoint(cross.point)) return;
          if (isDynamicCurve(cross.curve) || isDynamicCurve(cross.intersection?.curve)) return;

          const d = cross.point.getDistance(mousePoint);
          if (d <= snapRadius) {
            candidatePoints.push({ point: cross.point.clone(), type: 'intersection', dist: d, priority: 0 });
          }
        });
      }
    }
  }

  _collectEditingHandleOsnaps(draggedPath, draggedSegment, ignoreEntities, ignoreSegments, ignoreHandles, isSelfPoint, mousePoint, snapRadius, candidatePoints) {
    if (!this.service.snapFilters.node) return;
    const editingEntities = this.service.editingEntities || [];
    if (editingEntities.length === 0) return;

    const layerManager = this.service.utils?.layerManager || window.cadUtils?.layerManager;

    editingEntities.forEach((ent) => {
      if (!ent || !ent.parent || ent.visible === false) return;
      if (!(ent instanceof paper.Path) || ent.data?.isPointEntity) return;
      if (!ent.segments || ent.segments.length < 2) return;
      if ((draggedPath && ent === draggedPath) || ignoreEntities.includes(ent)) return;

      const layerId = String(ent.data?.layerId || '0');
      const layer = layerManager?.layers?.get(layerId);
      if (layer && (layer.locked || layer.visible === false)) return;

      ent.segments.forEach((seg) => {
        if ((draggedPath && seg === draggedSegment) || ignoreSegments.includes(seg)) return;

        ['handleIn', 'handleOut'].forEach((handleType) => {
          if (!seg[handleType] || seg[handleType].isZero()) return;
          const isIgnored = ignoreHandles.some((h) => h.segment === seg && h.type === handleType);
          if (isIgnored) return;

          const handlePt = seg.point.add(seg[handleType]);
          if (isSelfPoint(handlePt)) return;

          const d = handlePt.getDistance(mousePoint);
          if (d <= snapRadius) {
            candidatePoints.push({ point: handlePt, type: 'node', dist: d, priority: 0 });
          }
        });
      });
    });
  }
}