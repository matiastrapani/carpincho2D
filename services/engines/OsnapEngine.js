/**
 * services/engines/OsnapEngine.js - Motor de atracción magnética (OSNAP)
 */

import {
  resolveFromPoint,
  collectExtendedOsnapCandidates
} from './OsnapGeometryMath.js';
import {
  buildRasterContourPath,
  collectPrimitiveOsnapCandidates
} from './OsnapPrimitiveSolvers.js';
import {
  collectPathGeometryCandidates,
  collectIntersectionCandidates,
  collectEditingHandleCandidates
} from './OsnapPathSolvers.js';

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
        const snapFilters = this.service.snapFilters;
        const intersectionPathTargets = rasterContourMap.size > 0
          ? [...snapTargets, ...rasterContourMap.values()]
          : snapTargets;

        candidatePoints.push(
          ...collectPrimitiveOsnapCandidates({
            snapFilters,
            circleTargets,
            rasterTargets,
            pointTargets,
            rasterContourMap,
            zoom,
            snapRadius,
            mousePoint,
            isSelfPoint
          }),
          ...collectPathGeometryCandidates({
            snapFilters,
            snapTargets,
            activePath,
            draggedPath,
            draggedSegment,
            ignoreSegments,
            isDynamicCurve,
            isSelfPoint,
            mousePoint,
            snapRadius
          }),
          ...collectEditingHandleCandidates({
            snapFilters,
            editingEntities: this.service.editingEntities || [],
            layerManager: this.service.utils?.layerManager || null,
            draggedPath,
            draggedSegment,
            ignoreEntities,
            ignoreSegments,
            ignoreHandles,
            isSelfPoint,
            mousePoint,
            snapRadius
          }),
          ...collectIntersectionCandidates({
            snapFilters,
            snapTargets: intersectionPathTargets,
            circleTargets,
            activePath,
            draggedPath,
            isDynamicCurve,
            isSelfPoint,
            mousePoint,
            snapRadius,
            epsilon: EPSILON
          }),
          ...collectExtendedOsnapCandidates({
            snapFilters,
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
          })
        );
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
}