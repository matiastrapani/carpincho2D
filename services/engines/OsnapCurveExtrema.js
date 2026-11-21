/**
 * services/engines/OsnapCurveExtrema.js - Cálculo de cuadrantes (extremos en X/Y) sobre curvas Bézier
 */

const GEOM_EPSILON = 1e-6;
const PARAM_MARGIN = 1e-4;

function solveAxisExtrema(p0, p1, p2, p3, outRoots) {
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
}

export function getCurveQuadrantCandidates(target, mousePoint, snapRadius, isSelfPoint, isDynamicCurve = null) {
  if (!(target instanceof paper.Path) || !Array.isArray(target.curves)) return [];

  const results = [];

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