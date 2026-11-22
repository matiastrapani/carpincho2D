/**
 * services/engines/TangentSolver.js - Resolución dinámica de tangencia
 * Despacho analítico exacto para primitivas circulares y numérico continuo para tramos curvos.
 */

const TWO_PI = Math.PI * 2;

function shortestAngleDiff(a, b) {
  let diff = Math.abs(a - b) % TWO_PI;
  if (diff > Math.PI) diff = TWO_PI - diff;
  return diff;
}

function getCurveOffsetAtTime(curve, t, curveLength) {
  if (t <= 1e-9) return 0;
  if (t >= 1 - 1e-9) return curveLength;
  const part = curve.getPart(0, t);
  return part ? part.length : t * curveLength;
}

function isTrulyCurved(curve) {
  if (!curve) return false;
  const len = curve.length || 0;
  if (len <= 1e-6) return false;

  // 1. Sin tiradores -> segmento recto puro
  if (typeof curve.isLinear === 'function' && curve.isLinear()) return false;

  // 2. Tiradores nulos o despreciables
  const h1 = curve.handle1;
  const h2 = curve.handle2;
  const h1Len = h1 ? Math.hypot(h1.x, h1.y) : 0;
  const h2Len = h2 ? Math.hypot(h2.x, h2.y) : 0;
  if (h1Len <= 1e-6 && h2Len <= 1e-6) return false;

  // 3. Verificación nativa de Paper.js
  if (typeof curve.isStraight === 'function' && curve.isStraight()) return false;

  // 4. Verificación explícita de colinealidad entre cuerda y tiradores (Bézier degenerada a recta)
  const p1 = curve.point1;
  const p2 = curve.point2;
  const cx = p2.x - p1.x;
  const cy = p2.y - p1.y;
  const chordLen = Math.hypot(cx, cy);
  if (chordLen <= 1e-6) return false;

  const ux = cx / chordLen;
  const uy = cy / chordLen;

  if (h1Len > 1e-6) {
    const cross1 = Math.abs(h1.x * uy - h1.y * ux);
    const dot1 = h1.x * ux + h1.y * uy;
    if (cross1 > 1e-5 || dot1 < -1e-5 || dot1 > chordLen + 1e-5) return true;
  }

  if (h2Len > 1e-6) {
    const cross2 = Math.abs(h2.x * uy - h2.y * ux);
    const dot2 = -(h2.x * ux + h2.y * uy);
    if (cross2 > 1e-5 || dot2 < -1e-5 || dot2 > chordLen + 1e-5) return true;
  }

  return false;
}

export class TangentSolver {
  /**
   * Busca una entidad con geometría curva bajo `point` (círculos, splines, Bézier o tramos curvos de polilíneas mixtas).
   * Devuelve la entidad y el punto proyectado sobre su tramo curvo más cercano, o `null` si no aplica.
   */
  static pickCurvedTargetAt(cadService, point, tolerance, layerManager = null) {
    if (!cadService?.entities || !point) return null;

    let bestHit = null;
    let bestDist = tolerance;

    for (const ent of cadService.entities) {
      if (!ent || ent.visible === false || ent.data?.isPointEntity || ent.data?.isAuxiliary) continue;
      if (ent.data?.isLineEntity) continue;
      if (layerManager && !layerManager.isEntityInteractive(ent)) continue;

      if (ent.data?.isCircleEntity) {
        const center = ent.position;
        const radius = ent.data?.radius || (ent.bounds.width / 2);
        if (radius <= 0) continue;

        const vec = point.subtract(center);
        const distFromCenter = vec.length;
        const distToEdge = Math.abs(distFromCenter - radius);

        if (distToEdge <= bestDist) {
          const angle = distFromCenter > 1e-9 ? Math.atan2(vec.y, vec.x) : 0;
          const snapPt = new paper.Point(
            center.x + radius * Math.cos(angle),
            center.y + radius * Math.sin(angle)
          );
          bestDist = distToEdge;
          bestHit = { entity: ent, kind: 'circle', point: snapPt, angle, offset: null };
        }
        continue;
      }

      if ((ent instanceof paper.Path || ent instanceof paper.CompoundPath) && (ent.curves?.length || ent.children?.length)) {
        const { curves } = this._collectCurvedSegments(ent);
        if (curves.length === 0) continue;

        for (const entry of curves) {
          const loc = entry.curve.getNearestLocation(point);
          if (!loc?.point) continue;

          const dist = loc.point.getDistance(point);
          if (dist <= bestDist) {
            const t = loc.time ?? loc.parameter ?? 0;
            bestDist = dist;
            bestHit = {
              entity: ent,
              kind: 'path',
              point: loc.point.clone(),
              angle: null,
              offset: entry.startOffset + getCurveOffsetAtTime(entry.curve, t, entry.length)
            };
          }
        }
      }
    }

    return bestHit;
  }

  static createTrackerFromHit(hit) {
    if (!hit?.entity || !hit?.point) return null;
    return {
      entity: hit.entity,
      kind: hit.kind,
      lastPoint: hit.point.clone(),
      lastAngle: hit.angle ?? null,
      lastOffset: hit.offset ?? null
    };
  }

  /**
   * Calcula el punto de tangencia exacto sobre `tracker.entity` hacia `targetPoint`.
   * Si desde `targetPoint` NO existe tangente válida, devuelve `null` y conserva `tracker.lastPoint`.
   */
  static solveStep(tracker, targetPoint) {
    if (!tracker?.entity || !targetPoint) return null;

    if (tracker.kind === 'circle' || tracker.entity.data?.isCircleEntity) {
      return this._solveCircleAnalytic(tracker, targetPoint);
    }

    return this._solvePathNumeric(tracker, targetPoint);
  }

  static _solveCircleAnalytic(tracker, targetPoint) {
    const circle = tracker.entity;
    const center = circle.position;
    const radius = circle.data?.radius || (circle.bounds.width / 2);

    const dx = targetPoint.x - center.x;
    const dy = targetPoint.y - center.y;
    const dist = Math.hypot(dx, dy);

    // Dentro o sobre la circunferencia no existe tangente real
    if (dist <= radius + 1e-6) {
      return null;
    }

    const alpha = Math.acos(Math.min(1, radius / dist));
    const baseAngle = Math.atan2(dy, dx);
    const candidates = [baseAngle + alpha, baseAngle - alpha];

    let chosenAngle = candidates[0];
    if (tracker.lastAngle !== null && tracker.lastAngle !== undefined) {
      const diff0 = shortestAngleDiff(candidates[0], tracker.lastAngle);
      const diff1 = shortestAngleDiff(candidates[1], tracker.lastAngle);
      chosenAngle = diff0 <= diff1 ? candidates[0] : candidates[1];
    }

    const tanPt = new paper.Point(
      center.x + radius * Math.cos(chosenAngle),
      center.y + radius * Math.sin(chosenAngle)
    );

    tracker.lastAngle = chosenAngle;
    tracker.lastPoint = tanPt.clone();
    return tanPt;
  }

  /**
   * Recolecta únicamente los tramos curvos (!isLinear) de la entidad para soportar tanto curvas puras como mixtas.
   */
  static _collectCurvedSegments(entity) {
    const paths = entity.children?.length
      ? entity.children.filter((c) => c.curves?.length)
      : (entity.curves?.length ? [entity] : []);

    const entries = [];
    let accOffset = 0;

    for (const path of paths) {
      for (const curve of path.curves) {
        const len = curve.length || 0;
        if (isTrulyCurved(curve)) {
          entries.push({ curve, startOffset: accOffset, length: len });
        }
        accOffset += len;
      }
    }

    const closed = paths.length === 1 ? Boolean(paths[0].closed) : false;
    return { curves: entries, totalLength: accOffset, closed };
  }

  static _residual(curve, t, targetPoint) {
    const pt = curve.getPointAtTime(t);
    const normal = curve.getNormalAtTime(t);
    if (!pt || !normal) return NaN;

    const dx = targetPoint.x - pt.x;
    const dy = targetPoint.y - pt.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return NaN;

    return (dx * normal.x + dy * normal.y) / dist;
  }

  static _refineRoot(curve, tA, tB, fA, fB, targetPoint) {
    let a = tA;
    let b = tB;
    let fa = fA;
    let fb = fB;

    if (Math.abs(fa) < 1e-9) return a;
    if (Math.abs(fb) < 1e-9) return b;

    for (let i = 0; i < 18; i++) {
      let mid = 0.5 * (a + b);
      if (Math.abs(fb - fa) > 1e-12) {
        const sec = b - fb * ((b - a) / (fb - fa));
        if (sec > a + 0.1 * (b - a) && sec < b - 0.1 * (b - a)) mid = sec;
      }

      const fm = this._residual(curve, mid, targetPoint);
      if (Number.isNaN(fm)) return 0.5 * (a + b);
      if (Math.abs(fm) < 1e-8 || Math.abs(b - a) < 1e-9) return mid;

      if (fa * fm <= 0) {
        b = mid;
        fb = fm;
      } else {
        a = mid;
        fa = fm;
      }
    }

    return 0.5 * (a + b);
  }

  static _solvePathNumeric(tracker, targetPoint) {
    const { curves, totalLength, closed } = this._collectCurvedSegments(tracker.entity);
    if (!curves.length) return null;

    const SAMPLES = 32;
    const candidates = [];

    for (const entry of curves) {
      const { curve, startOffset, length } = entry;
      let prevT = 0;
      let prevF = this._residual(curve, 0, targetPoint);

      for (let s = 1; s <= SAMPLES; s++) {
        const currT = s / SAMPLES;
        const currF = this._residual(curve, currT, targetPoint);

        if (!Number.isNaN(prevF) && !Number.isNaN(currF) && prevF * currF <= 0) {
          const rootT = this._refineRoot(curve, prevT, currT, prevF, currF, targetPoint);
          const rootPt = curve.getPointAtTime(rootT);
          if (rootPt && rootPt.getDistance(targetPoint) > 1e-4) {
            const offset = startOffset + getCurveOffsetAtTime(curve, rootT, length);
            candidates.push({ point: rootPt, offset });
          }
        }

        prevT = currT;
        prevF = currF;
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    let best = candidates[0];
    if (tracker.lastOffset !== null && tracker.lastOffset !== undefined && totalLength > 0) {
      let bestDelta = Infinity;
      for (const cand of candidates) {
        let delta = Math.abs(cand.offset - tracker.lastOffset);
        if (closed) delta = Math.min(delta, totalLength - delta);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = cand;
        }
      }
    }

    tracker.lastOffset = best.offset;
    tracker.lastPoint = best.point.clone();
    return best.point.clone();
  } 
}