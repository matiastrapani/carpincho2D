/**
 * services/engines/OsnapGeometryMath.js - Cálculos geométricos puros para OSNAP
 * (Cercano, Perpendicular y Tangente) sin dependencias globales.
 */

const GEOM_EPSILON = 1e-6;

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
  getRasterContourPath
}) {
  const usePerp = Boolean(snapFilters.perpendicular && fromPoint);
  const useTan = Boolean(snapFilters.tangent && fromPoint);
  const useNear = Boolean(snapFilters.nearest);

  if (!usePerp && !useTan && !useNear) return [];

  const candidates = [];
  const isOriginPoint = (pt) => Boolean(fromPoint && pt && pt.getDistance(fromPoint) < 0.01);

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

  if (typeof getRasterContourPath === 'function') {
    rasterTargets.forEach((raster) => {
      const contour = getRasterContourPath(raster);
      if (!contour) return;
      evaluateTarget(contour);
      contour.remove();
    });
  }

  return candidates;
}