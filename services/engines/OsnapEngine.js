/**
 * services/engines/OsnapEngine.js - Motor de atracción magnética (OSNAP)
 */

import {
  resolveFromPoint,
  getCurveQuadrantCandidates,
  collectExtendedOsnapCandidates
} from './OsnapGeometryMath.js';
import {
  buildRasterContourPath,
  collectPrimitiveOsnapCandidates
} from './OsnapPrimitiveSolvers.js';

export class OsnapEngine {
  constructor(cadService) {
    if (!cadService) {
      throw new Error('OsnapEngine requiere una instancia válida de cadService.');
    }
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

      const rasterContourMap = new Map();
      rasterTargets.forEach((raster) => {
        const contour = buildRasterContourPath(raster);
        if (contour) rasterContourMap.set(raster, contour);
      });

      try {
        candidatePoints.push(
          ...collectPrimitiveOsnapCandidates({
            snapFilters: this.service.snapFilters,
            circleTargets,
            rasterTargets,
            pointTargets,
            rasterContourMap,
            zoom,
            snapRadius,
            mousePoint,
            isSelfPoint
          })
        );

        const intersectionPathTargets = rasterContourMap.size > 0
          ? [...snapTargets, ...rasterContourMap.values()]
          : snapTargets;

        this._collectPathGeometryOsnaps(snapTargets, activePath, draggedPath, draggedSegment, ignoreSegments, isDynamicCurve, isSelfPoint, mousePoint, snapRadius, candidatePoints);
        this._collectEditingHandleOsnaps(draggedPath, draggedSegment, ignoreEntities, ignoreSegments, ignoreHandles, isSelfPoint, mousePoint, snapRadius, candidatePoints);
        this._collectIntersectionOsnaps(intersectionPathTargets, circleTargets, activePath, draggedPath, isDynamicCurve, isSelfPoint, mousePoint, snapRadius, EPSILON, candidatePoints);

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
          rasterContourMap
        });
        if (extendedCandidates.length > 0) candidatePoints.push(...extendedCandidates);
      } finally {
        rasterContourMap.forEach((contour) => contour.remove());
        rasterContourMap.clear();
      }

      if (candidatePoints.length > 0) {
        candidatePoints.sort((a, b) => a.priority - b.priority || a.dist - b.dist);
        const best = candidatePoints[0];
        if (renderMarkerFn) renderMarkerFn(best.point, best.type);
        return { point: best.point, type: best.type };
      }
    }

    const gridSnap = this._resolveGridOsnap(mousePoint, zoom, snapRadius, renderMarkerFn);
    if (gridSnap) return gridSnap;

    if (renderMarkerFn) renderMarkerFn(null, null);
    return { point: mousePoint, type: null };
  }

  _resolveGridOsnap(mousePoint, zoom, snapRadius, renderMarkerFn) {
    if (this.service.snapFilters.grid !== true) return null;

    const subStep = zoom > 3 ? 4 : (zoom < 0.3 ? 100 : 20);
    const gridPoint = new paper.Point(
      Math.round(mousePoint.x / subStep) * subStep,
      Math.round(mousePoint.y / subStep) * subStep
    );

    if (gridPoint.getDistance(mousePoint) <= snapRadius * 0.8) {
      if (renderMarkerFn) renderMarkerFn(gridPoint, 'grid');
      return { point: gridPoint, type: 'grid' };
    }
    return null;
  }

  getRasterContourPath(raster) {
    return buildRasterContourPath(raster);
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
    const gridGroup = this.service.utils?.gridGroup || null;
    const layerManager = this.service.utils?.layerManager || null;

    const isValidSnapEntity = (ent) => {
      if (!ent || ent.visible === false || ent.clipMask || ent.data?.isClipMask) return false;
      if (ent.data?.isGrid || ent.data?.isAuxiliary || ent.data?.isHandle) return false;
      if (ent.layer && ent.layer.name === 'hudLayer') return false;
      if (gridGroup && (ent === gridGroup || ent.isDescendant(gridGroup))) return false;
      if (layerManager && !layerManager.isEntityVisible(ent)) return false;

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

    const circleTargets = [];
    const snapTargets = [];
    const pointTargets = [];
    const rasterTargets = [];

    for (const ent of this.service.entities) {
      if (!isValidSnapEntity(ent) || !canEvaluate(ent)) continue;

      if (ent.data?.isCircleEntity) {
        circleTargets.push(ent);
      } else if (ent.data?.isPointEntity) {
        pointTargets.push(ent);
      } else if (ent instanceof paper.Raster || ent.className === 'Raster' || ent.data?.isImageEntity) {
        rasterTargets.push(ent);
      } else if (ent instanceof paper.Path) {
        snapTargets.push(ent);
      }
    }

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

    if (this.service.snapFilters.quadrant) {
      snapTargets.forEach((path) => {
        const quadCandidates = getCurveQuadrantCandidates(path, mousePoint, snapRadius, isSelfPoint, isDynamicCurve);
        if (quadCandidates.length > 0) {
          candidatePoints.push(...quadCandidates);
        }
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

    const layerManager = this.service.utils?.layerManager || null;

    editingEntities.forEach((ent) => {
      if (!ent || !ent.parent || ent.visible === false) return;
      if (!(ent instanceof paper.Path) || ent.data?.isPointEntity) return;
      if (!ent.segments || ent.segments.length < 2) return;
      if ((draggedPath && ent === draggedPath) || ignoreEntities.includes(ent)) return;
      if (layerManager && !layerManager.isEntityInteractive(ent)) return;

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