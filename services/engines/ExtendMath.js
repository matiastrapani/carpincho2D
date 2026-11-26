/**
 * services/engines/ExtendMath.js - Matemática geométrica y extrapolación de curvas Bézier para ExtendTool
 */

export function extrapolateCubicBezier(p0, p1, p2, p3, k) {
  const p0Prime = { x: p0.x, y: p0.y };
  const p1Prime = {
    x: p0.x + k * (p1.x - p0.x),
    y: p0.y + k * (p1.y - p0.y)
  };

  const k2 = k * k;
  const k2Mult = 2 * k;

  const p2Prime = {
    x: p0.x + k2Mult * (p1.x - p0.x) + k2 * (p2.x - 2 * p1.x + p0.x),
    y: p0.y + k2Mult * (p1.y - p0.y) + k2 * (p2.y - 2 * p1.y + p0.y)
  };

  const u = 1 - k;
  const u3 = u * u * u;
  const u2 = u * u;
  const k3 = k2 * k;

  const p3Prime = {
    x: (u3 * p0.x) + (3 * u2 * k * p1.x) + (3 * u * k2 * p2.x) + (k3 * p3.x),
    y: (u3 * p0.y) + (3 * u2 * k * p1.y) + (3 * u * k2 * p2.y) + (k3 * p3.y)
  };

  return { p0: p0Prime, p1: p1Prime, p2: p2Prime, p3: p3Prime };
}

function measureCubicArcLength(paperInst, p0, p1, p2, p3) {
  const curve = new paperInst.Curve(
    new paperInst.Point(p0.x, p0.y),
    new paperInst.Point(p1.x - p0.x, p1.y - p0.y),
    new paperInst.Point(p2.x - p3.x, p2.y - p3.y),
    new paperInst.Point(p3.x, p3.y)
  );
  return curve.length || 0;
}

export function solveBezierFactorForArcLength(paperInst, controls, isStart, targetArcDelta) {
  if (targetArcDelta <= 1e-6) return 1;

  const baseP0 = isStart ? controls.P3 : controls.P0;
  const baseP1 = isStart ? controls.P2 : controls.P1;
  const baseP2 = isStart ? controls.P1 : controls.P2;
  const baseP3 = isStart ? controls.P0 : controls.P3;

  const baseLength = measureCubicArcLength(paperInst, baseP0, baseP1, baseP2, baseP3);
  const deltaForK = (k) => {
    const res = extrapolateCubicBezier(baseP0, baseP1, baseP2, baseP3, k);
    return measureCubicArcLength(paperInst, res.p0, res.p1, res.p2, res.p3) - baseLength;
  };

  let lo = 1;
  let hi = 1 + Math.max(0.25, targetArcDelta / Math.max(baseLength, 1));

  let guard = 0;
  while (deltaForK(hi) < targetArcDelta && guard < 32) {
    lo = hi;
    hi *= 2;
    guard++;
  }

  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) * 0.5;
    if (deltaForK(mid) < targetArcDelta) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) * 0.5;
}

export function computeExtendInfo(paperInst, path, clickPt) {
  if (!path || path.closed || !path.segments || path.segments.length < 2) return null;

  while (path.segments.length > 2 && path.segments[0].point.getDistance(path.segments[1].point) <= 1e-6) {
    path.segments[1].handleIn = path.segments[0].handleIn.clone();
    path.removeSegment(0);
  }
  while (
    path.segments.length > 2 &&
    path.segments[path.segments.length - 1].point.getDistance(path.segments[path.segments.length - 2].point) <= 1e-6
  ) {
    const lastIdx = path.segments.length - 1;
    path.segments[lastIdx - 1].handleOut = path.segments[lastIdx].handleOut.clone();
    path.removeSegment(lastIdx);
  }

  const totalSegs = path.segments.length;
  const startPt = path.segments[0].point.clone();
  const endPt = path.segments[totalSegs - 1].point.clone();

  const nearestLoc = path.getNearestLocation(clickPt);
  const isStart = (nearestLoc && path.length > 0)
    ? nearestLoc.offset < (path.length / 2)
    : startPt.getDistance(clickPt) < endPt.getDistance(clickPt);

  const segFixed = isStart ? path.segments[1] : path.segments[totalSegs - 2];
  const segMoving = isStart ? path.segments[0] : path.segments[totalSegs - 1];
  const hasHandles = !segFixed.handleOut.isZero() || !segMoving.handleIn.isZero();

  const chordVec = segMoving.point.subtract(segFixed.point);
  const dirVector = chordVec.length > 1e-6 ? chordVec.normalize() : new paperInst.Point(1, 0);

  let p0, p1, p2, p3;
  let isBezier = hasHandles;
  let isSingular = false;
  let straightDir = null;
  let tangentVector = null;
  let tangentSpeed = 1;

  if (!isStart) {
    p0 = segFixed.point.clone();
    p1 = p0.add(segFixed.handleOut);
    p3 = segMoving.point.clone();
    p2 = p3.add(segMoving.handleIn);

    if (segFixed.handleOut.isZero() && segMoving.handleIn.isZero()) {
      isBezier = false;
    } else if (p2.getDistance(p3) < 0.001) {
      isSingular = true;
      const refPt = p1.getDistance(p0) > 0.001 ? p1 : p0;
      const rawDir = p3.subtract(refPt);
      straightDir = rawDir.length > 1e-6 ? rawDir.normalize() : dirVector;
    } else {
      const rawTan = p3.subtract(p2);
      tangentSpeed = 3 * rawTan.length;
      tangentVector = rawTan.normalize();
    }
  } else {
    p0 = segMoving.point.clone();
    p1 = p0.add(segMoving.handleOut);
    p3 = segFixed.point.clone();
    p2 = p3.add(segFixed.handleIn);

    if (segMoving.handleOut.isZero() && segFixed.handleIn.isZero()) {
      isBezier = false;
    } else if (p1.getDistance(p0) < 0.001) {
      isSingular = true;
      const refPt = p2.getDistance(p3) > 0.001 ? p2 : p3;
      const rawDir = p0.subtract(refPt);
      straightDir = rawDir.length > 1e-6 ? rawDir.normalize() : dirVector;
    } else {
      const rawTan = p0.subtract(p1);
      tangentSpeed = 3 * rawTan.length;
      tangentVector = rawTan.normalize();
    }
  }

  return {
    path,
    isStart,
    isBezier,
    isSingular,
    startPt,
    endPt,
    straightDir,
    tangentVector,
    dirVector,
    tangentSpeed,
    initialControls: {
      P0: p0,
      P1: p1,
      P2: p2,
      P3: p3,
      segmentsBackup: path.segments.map((s) => ({
        point: s.point.clone(),
        handleIn: s.handleIn.clone(),
        handleOut: s.handleOut.clone()
      }))
    }
  };
}