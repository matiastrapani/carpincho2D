/**
 * services/engines/OsnapGeometryMath.js - Cálculos geométricos puros para OSNAP
 * (Cercano, Perpendicular y Tangente) sin dependencias globales.
 */

const GEOM_EPSILON = 1e-6;
const ORIGIN_SNAP_EPSILON = 0.01;

export function resolveFromPoint(activePath, ignoreContext) {
  if (ignoreContext?.fromPoint instanceof paper.Point) {
    return ignoreContext.fromPoint.clone();
  }
  if (activePath instanceof paper.Path && activePath.segments?.length > 0) {
    return activePath.lastSegment.point.clone();
  }
  return null;
}

export function getNearestCandidate(target, mousePoint, snapRadius, isSelfPoint, isDynamicCurve = null) {
  if (!target) return null;

  if (target instanceof paper.Path && Array.isArray(target.curves) && typeof isDynamicCurve === 'function') {
    let bestLoc = null;
    let minDist = snapRadius;

    target.curves.forEach((curve) => {
      if (!curve || curve.length <= GEOM_EPSILON || isDynamicCurve(curve)) return;
      const loc = curve.getNearestLocation(mousePoint);
      if (!loc?.point || isSelfPoint(loc.point)) return;

      const dist = loc.point.getDistance(mousePoint);
      if (dist <= minDist) {
        minDist = dist;
        bestLoc = loc.point;
      }
    });

    return bestLoc ? { point: bestLoc.clone(), type: 'nearest', dist: minDist, priority: 4 } : null;
  }

  if (typeof target.getNearestLocation !== 'function') return null;

  const loc = target.getNearestLocation(mousePoint);
  if (!loc || !loc.point || isSelfPoint(loc.point)) return null;

  const dist = loc.point.getDistance(mousePoint);
  if (dist > snapRadius) return null;

  return {
    point: loc.point.clone(),
    type: 'nearest',
    dist,
    priority: 4
  };
}

export function getPerpendicularCandidates(target, fromPoint, mousePoint, snapRadius, isSelfPoint, isDynamicCurve = null) {
  if (!target || !fromPoint) return [];
  const results = [];

  if (target.data?.isCircleEntity) {
    const center = target.position;
    const radius = target.data?.radius || (target.bounds.width / 2);
    const vec = fromPoint.subtract(center);

    if (vec.length > GEOM_EPSILON) {
      const unit = vec.normalize();
      [center.add(unit.multiply(radius)), center.subtract(unit.multiply(radius))].forEach((pt) => {
        if (isSelfPoint(pt)) return;
        const dist = pt.getDistance(mousePoint);
        if (dist <= snapRadius) {
          results.push({ point: pt, type: 'perpendicular', dist, priority: 1 });
        }
      });
    }
    return results;
  }

  if (!(target instanceof paper.Path) || !target.curves) return results;

  target.curves.forEach((curve) => {
    if (!curve || curve.length <= GEOM_EPSILON || isDynamicCurve?.(curve)) return;

    if (curve.isLinear()) {
      const p1 = curve.point1;
      const p2 = curve.point2;
      const segVec = p2.subtract(p1);
      const lenSq = segVec.x * segVec.x + segVec.y * segVec.y;
      if (lenSq <= GEOM_EPSILON) return;

      const t = fromPoint.subtract(p1).dot(segVec) / lenSq;
      if (t < -1e-4 || t > 1 + 1e-4) return;

      const clampedT = Math.max(0, Math.min(1, t));
      const foot = p1.add(segVec.multiply(clampedT));
      if (isSelfPoint(foot)) return;

      const dist = foot.getDistance(mousePoint);
      if (dist <= snapRadius) {
        results.push({ point: foot, type: 'perpendicular', dist, priority: 1 });
      }
      return;
    }

    const loc = curve.getNearestLocation(fromPoint);
    if (!loc || !loc.point || isSelfPoint(loc.point)) return;

    const toOrigin = loc.point.subtract(fromPoint);
    const tangent = loc.tangent;
    if (toOrigin.length <= GEOM_EPSILON || !tangent || tangent.length <= GEOM_EPSILON) return;

    const orthoCos = Math.abs(toOrigin.normalize().dot(tangent.normalize()));
    if (orthoCos > 1e-2) return;

    const dist = loc.point.getDistance(mousePoint);
    if (dist <= snapRadius) {
      results.push({ point: loc.point.clone(), type: 'perpendicular', dist, priority: 1 });
    }
  });

  return results;
}

export function getTangentCandidates(target, fromPoint, mousePoint, snapRadius, isSelfPoint, isDynamicCurve = null) {
  if (!target || !fromPoint) return [];
  const results = [];

  if (target.data?.isCircleEntity) {
    const center = target.position;
    const radius = target.data?.radius || (target.bounds.width / 2);
    const vec = fromPoint.subtract(center);
    const distCenter = vec.length;

    if (distCenter <= radius + GEOM_EPSILON) return results;

    const alpha = Math.acos(radius / distCenter);
    const baseAngle = vec.angleInRadians;

    [baseAngle + alpha, baseAngle - alpha].forEach((angle) => {
      const tanPt = center.add(new paper.Point(
        radius * Math.cos(angle),
        radius * Math.sin(angle)
      ));
      if (isSelfPoint(tanPt)) return;

      const dist = tanPt.getDistance(mousePoint);
      if (dist <= snapRadius) {
        results.push({ point: tanPt, type: 'tangent', dist, priority: 1 });
      }
    });

    return results;
  }

  if (!(target instanceof paper.Path) || !target.curves) return results;

  target.curves.forEach((curve) => {
    if (!curve || curve.isLinear() || curve.length <= GEOM_EPSILON || isDynamicCurve?.(curve)) return;

    const crossAt = (t) => {
      const pt = curve.getPointAtTime(t);
      const tan = curve.getTangentAtTime(t);
      if (!pt || !tan) return 0;
      return (pt.x - fromPoint.x) * tan.y - (pt.y - fromPoint.y) * tan.x;
    };

    const steps = 24;
    let prevT = 0;
    let prevVal = crossAt(prevT);

    for (let i = 1; i <= steps; i++) {
      const currT = i / steps;
      const currVal = crossAt(currT);

      if (prevVal === 0 || (prevVal < 0 && currVal > 0) || (prevVal > 0 && currVal < 0)) {
        let lo = prevT;
        let hi = currT;
        let loVal = prevVal;

        for (let iter = 0; iter < 12; iter++) {
          const mid = (lo + hi) * 0.5;
          const midVal = crossAt(mid);
          if ((loVal <= 0 && midVal <= 0) || (loVal >= 0 && midVal >= 0)) {
            lo = mid;
            loVal = midVal;
          } else {
            hi = mid;
          }
        }

        const tanPt = curve.getPointAtTime((lo + hi) * 0.5);
        if (tanPt && tanPt.getDistance(fromPoint) > 1e-4 && !isSelfPoint(tanPt)) {
          const dist = tanPt.getDistance(mousePoint);
          if (dist <= snapRadius) {
            results.push({ point: tanPt.clone(), type: 'tangent', dist, priority: 1 });
          }
        }
      }

      prevT = currT;
      prevVal = currVal;
    }
  });

  return results;
}

export function collectExtendedOsnapCandidates({
  snapFilters,
  circleTargets,
  snapTargets,
  rasterTargets,
  mousePoint,
  snapRadius,
  fromPoint,
  draggedPath,
  isSelfPoint,
  isDynamicCurve = null,
  rasterContourMap = null,
  getRasterContourPath = null
}) {
  const usePerp = Boolean(snapFilters.perpendicular && fromPoint);
  const useTan = Boolean(snapFilters.tangent && fromPoint);
  const useNear = Boolean(snapFilters.nearest);

  if (!usePerp && !useTan && !useNear) return [];

  const candidates = [];
  const isOriginPoint = (pt) => Boolean(fromPoint && pt && pt.getDistance(fromPoint) < ORIGIN_SNAP_EPSILON);

  const evaluateTarget = (target, curveFilter = null) => {
    if (usePerp) {
      getPerpendicularCandidates(target, fromPoint, mousePoint, snapRadius, isSelfPoint, curveFilter).forEach((c) => {
        if (!isOriginPoint(c.point)) candidates.push(c);
      });
    }
    if (useTan) {
      getTangentCandidates(target, fromPoint, mousePoint, snapRadius, isSelfPoint, curveFilter).forEach((c) => {
        if (!isOriginPoint(c.point)) candidates.push(c);
      });
    }
    if (useNear) {
      const nearCand = getNearestCandidate(target, mousePoint, snapRadius, isSelfPoint, curveFilter);
      if (nearCand) candidates.push(nearCand);
    }
  };

  circleTargets.forEach((circle) => evaluateTarget(circle));

  snapTargets.forEach((path) => {
    if (draggedPath && path === draggedPath) return;
    evaluateTarget(path, isDynamicCurve);
  });

  rasterTargets.forEach((raster) => {
    const cachedContour = rasterContourMap?.get(raster) || null;
    const contour = cachedContour || (typeof getRasterContourPath === 'function' ? getRasterContourPath(raster) : buildRasterContourPath(raster));
    if (!contour) return;

    evaluateTarget(contour);
    if (!cachedContour) {
      contour.remove();
    }
  });

  return candidates;
}

export function getCurveQuadrantCandidates(target, mousePoint, snapRadius, isSelfPoint, isDynamicCurve = null) {
  if (!(target instanceof paper.Path) || !Array.isArray(target.curves)) return [];

  const results = [];
  const PARAM_MARGIN = 1e-4;

  const solveAxisExtrema = (p0, p1, p2, p3, outRoots) => {
    const d0 = p1 - p0;
    const d1 = p2 - p1;
    const d2 = p3 - p2;

    const a = d0 - 2 * d1 + d2;
    const b = 2 * (d1 - d0);
    const c = d0;

    if (Math.abs(a) <= 1e-9) {
      if (Math.abs(b) > 1e-9) {
        const t = -c / b;
        if (t > PARAM_MARGIN && t < 1 - PARAM_MARGIN) outRoots.push(t);
      }
      return;
    }

    const disc = b * b - 4 * a * c;
    if (disc < 0) return;

    if (disc <= 1e-12) {
      const t = -b / (2 * a);
      if (t > PARAM_MARGIN && t < 1 - PARAM_MARGIN) outRoots.push(t);
      return;
    }

    const sqrtDisc = Math.sqrt(disc);
    const inv2a = 0.5 / a;
    const t1 = (-b - sqrtDisc) * inv2a;
    const t2 = (-b + sqrtDisc) * inv2a;

    if (t1 > PARAM_MARGIN && t1 < 1 - PARAM_MARGIN) outRoots.push(t1);
    if (t2 > PARAM_MARGIN && t2 < 1 - PARAM_MARGIN) outRoots.push(t2);
  };

  target.curves.forEach((curve) => {
    if (!curve || curve.isLinear() || curve.length <= GEOM_EPSILON || isDynamicCurve?.(curve)) return;

    const p0 = curve.point1;
    const p3 = curve.point2;
    const p1x = p0.x + curve.handle1.x;
    const p1y = p0.y + curve.handle1.y;
    const p2x = p3.x + curve.handle2.x;
    const p2y = p3.y + curve.handle2.y;

    const roots = [];
    solveAxisExtrema(p0.x, p1x, p2x, p3.x, roots);
    solveAxisExtrema(p0.y, p1y, p2y, p3.y, roots);

    if (roots.length === 0) return;

    roots.sort((u, v) => u - v);
    let lastT = -1;

    for (const t of roots) {
      if (t - lastT < 1e-5) continue;
      lastT = t;

      const pt = curve.getPointAtTime(t);
      if (!pt || isSelfPoint(pt)) continue;

      const dist = pt.getDistance(mousePoint);
      if (dist <= snapRadius) {
        results.push({ point: pt.clone(), type: 'quadrant', dist, priority: 0 });
      }
    }
  });

  return results;
}