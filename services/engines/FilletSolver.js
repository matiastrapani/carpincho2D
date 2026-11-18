/**
 * services/engines/FilletSolver.js - Motor geométrico propio para Empalmes (Fillet)
 * Combina:
 *   1. Trigonometría analítica exacta para rectas y vértices rectos de polilínea.
 *   2. Solver numérico Newton-Raphson 2D + subdivisión De Casteljau para curvas (Splines, Béziers, Círculos)
 *      tanto entre entidades distintas como entre segmentos curvos adyacentes de una misma polilínea.
 *   3. Estimación continua de radio desde la posición del cursor para arrastre interactivo.
 */

export class FilletSolver {
  constructor(paperInstance) {
    if (!paperInstance || !paperInstance.Path) {
      throw new Error('FilletSolver requiere una instancia válida de Paper.js.');
    }
    this.paper = paperInstance;
  }

  /**
   * Verifica si dos entidades (o dos tramos adyacentes de la misma entidad) admiten empalme.
   */
  canFillet(entity1, clickPt1, entity2, clickPt2) {
    if (!entity1 || !entity2 || !clickPt1 || !clickPt2) return false;

    if (entity1 === entity2) {
      return Boolean(this._findAdjacentCurves(entity1, clickPt1, clickPt2));
    }

    if (this._isPureLine(entity1) && this._isPureLine(entity2)) {
      return Boolean(this._solveLineLineAnalytic(entity1, clickPt1, entity2, clickPt2, 0));
    }

    return Boolean(entity1.getNearestLocation && entity2.getNearestLocation);
  }

  /**
   * Estima un radio de empalme suave a partir de la posición del cursor (arrastre interactivo).
   */
  estimateRadiusFromPoint(entity1, clickPt1, entity2, clickPt2, cursorPt, zeroSnapThreshold = 0) {
    if (!entity1 || !entity2 || !clickPt1 || !clickPt2 || !cursorPt) return null;

    // Caso 1: Misma polilínea / Bézier multi-segmento
    if (entity1 === entity2) {
      const adj = this._findAdjacentCurves(entity1, clickPt1, clickPt2);
      if (!adj) return null;

      if (adj.isBothStraight) {
        const base = this._solveSamePathStraightCorner(entity1, adj, 0);
        if (!base || !base.analyticMeta) return null;
        return this._radiusFromAnalyticMeta(base.analyticMeta, cursorPt, zeroSnapThreshold);
      }

      const sub1 = this._extractSingleCurvePath(adj.curve1);
      const sub2 = this._extractSingleCurvePath(adj.curve2);
      const p1 = sub1.getNearestPoint(cursorPt);
      const p2 = sub2.getNearestPoint(cursorPt);
      sub1.remove();
      sub2.remove();
      if (!p1 || !p2) return null;

      const estimated = (cursorPt.getDistance(p1) + cursorPt.getDistance(p2)) * 0.5;
      return estimated <= zeroSnapThreshold ? 0 : estimated;
    }

    // Caso 2: Dos rectas puras -> proyección exacta sobre bisectriz
    if (this._isPureLine(entity1) && this._isPureLine(entity2)) {
      const base = this._solveLineLineAnalytic(entity1, clickPt1, entity2, clickPt2, 0);
      if (!base || !base.analyticMeta) return null;
      return this._radiusFromAnalyticMeta(base.analyticMeta, cursorPt, zeroSnapThreshold);
    }

    // Caso 3: Curvas generales / Recta-Curva -> distancia equidistante al cursor
    if (!entity1.getNearestPoint || !entity2.getNearestPoint) return null;
    const p1 = entity1.getNearestPoint(cursorPt);
    const p2 = entity2.getNearestPoint(cursorPt);
    if (!p1 || !p2) return null;

    const estimated = (cursorPt.getDistance(p1) + cursorPt.getDistance(p2)) * 0.5;
    return estimated <= zeroSnapThreshold ? 0 : estimated;
  }

  _radiusFromAnalyticMeta(meta, cursorPt, zeroSnapThreshold) {
    const { V, bisector, sinHalf, maxRadius } = meta;
    const rel = cursorPt.subtract(V);
    const proj = Math.max(0, rel.dot(bisector));
    const rawRadius = proj * sinHalf;

    if (rawRadius <= zeroSnapThreshold) return 0;
    return Math.min(rawRadius, maxRadius);
  }

  /**
   * Calcula los datos geométricos del empalme sin mutar las entidades originales.
   */
  solvePreview(entity1, clickPt1, entity2, clickPt2, radius = 0) {
    if (!entity1 || !entity2 || !clickPt1 || !clickPt2) return null;
    if (typeof radius !== 'number' || Number.isNaN(radius) || radius < 0) return null;

    if (entity1 === entity2) {
      return this._solveSamePathCorner(entity1, clickPt1, clickPt2, radius);
    }

    if (this._isPureLine(entity1) && this._isPureLine(entity2)) {
      return this._solveLineLineAnalytic(entity1, clickPt1, entity2, clickPt2, radius);
    }

    return this._solveCurveNewtonRaphson(entity1, clickPt1, entity2, clickPt2, radius);
  }

  /**
   * Resuelve y aplica el empalme mutando las entidades y devolviendo el arco generado,
   * la segunda rama (si se dividió una polilínea/curva abierta) y los estados para Undo/Redo.
   */
  applyFillet(entity1, clickPt1, entity2, clickPt2, radius = 0) {
    const solution = this.solvePreview(entity1, clickPt1, entity2, clickPt2, radius);
    if (!solution) return null;

    const modifications = [];
    let splitEntity = null;

    if (solution.mode === 'polyline_corner') {
      const beforeState = this._capturePathState(entity1);
      splitEntity = this._applyPolylineCornerMutation(entity1, solution);
      const afterState = this._capturePathState(entity1);
      modifications.push({ entity: entity1, beforeState, afterState });
    } else if (solution.mode === 'same_path_bezier') {
      const beforeState = this._capturePathState(entity1);
      splitEntity = this._applySamePathBezierMutation(entity1, solution);
      const afterState = this._capturePathState(entity1);
      modifications.push({ entity: entity1, beforeState, afterState });
    } else {
      if (!entity1.closed) {
        const before1 = this._capturePathState(entity1);
        this._applyOpenPathTrimOrExtend(entity1, solution.trim1);
        const after1 = this._capturePathState(entity1);
        modifications.push({ entity: entity1, beforeState: before1, afterState: after1 });
      }

      if (!entity2.closed) {
        const before2 = this._capturePathState(entity2);
        this._applyOpenPathTrimOrExtend(entity2, solution.trim2);
        const after2 = this._capturePathState(entity2);
        modifications.push({ entity: entity2, beforeState: before2, afterState: after2 });
      }
    }

    let arcEntity = null;
    if (solution.radius > 1e-5 && solution.arcPoints) {
      const { T1, M, T2 } = solution.arcPoints;
      arcEntity = new this.paper.Path.Arc({
        from: T1,
        through: M,
        to: T2,
        insert: false
      });
    }

    return {
      arcEntity,
      splitEntity,
      modifications,
      solution
    };
  }

  // =========================================================================
  // DETECCIÓN DE CURVAS ADYACENTES EN UNA MISMA POLILÍNEA / BÉZIER
  // =========================================================================

  _findAdjacentCurves(poly, clickPt1, clickPt2) {
    if (!poly || !poly.curves || poly.curves.length < 2) return null;
    if (!poly.getNearestLocation) return null;

    const loc1 = poly.getNearestLocation(clickPt1);
    const loc2 = poly.getNearestLocation(clickPt2);
    if (!loc1 || !loc2) return null;

    const idx1 = loc1.index;
    const idx2 = loc2.index;
    if (idx1 === idx2) return null;

    const m = poly.curves.length;
    const n = poly.segments.length;

    let firstCurveIdx = -1;
    let secondCurveIdx = -1;
    let c1 = clickPt1;
    let c2 = clickPt2;

    if (idx1 + 1 === idx2 || (poly.closed && idx1 === m - 1 && idx2 === 0)) {
      firstCurveIdx = idx1;
      secondCurveIdx = idx2;
      c1 = clickPt1;
      c2 = clickPt2;
    } else if (idx2 + 1 === idx1 || (poly.closed && idx2 === m - 1 && idx1 === 0)) {
      firstCurveIdx = idx2;
      secondCurveIdx = idx1;
      c1 = clickPt2;
      c2 = clickPt1;
    } else {
      return null;
    }

    const prevIdx = firstCurveIdx;
    const sharedVertexIdx = secondCurveIdx;
    const nextIdx = (sharedVertexIdx + 1) % n;

    const curve1 = poly.curves[firstCurveIdx];
    const curve2 = poly.curves[secondCurveIdx];
    const isBothStraight = curve1.isStraight() && curve2.isStraight();

    return {
      prevIdx,
      sharedVertexIdx,
      nextIdx,
      curve1,
      curve2,
      c1,
      c2,
      isBothStraight
    };
  }

  _solveSamePathCorner(poly, clickPt1, clickPt2, radius) {
    const adj = this._findAdjacentCurves(poly, clickPt1, clickPt2);
    if (!adj) return null;

    if (adj.isBothStraight) {
      return this._solveSamePathStraightCorner(poly, adj, radius);
    }

    return this._solveSamePathBezierCorner(poly, adj, radius);
  }

  _solveSamePathStraightCorner(poly, adj, radius) {
    const { prevIdx, sharedVertexIdx, nextIdx, c1, c2 } = adj;
    const segPrev = poly.segments[prevIdx];
    const segCorner = poly.segments[sharedVertexIdx];
    const segNext = poly.segments[nextIdx];

    const res = this._computeAnalyticCorner(
      segPrev.point,
      segCorner.point,
      c1,
      segCorner.point,
      segNext.point,
      c2,
      radius
    );
    if (!res) return null;

    return {
      mode: 'polyline_corner',
      radius: res.radius,
      vertex: res.vertex,
      arcPoints: res.arcPoints,
      analyticMeta: res.analyticMeta,
      sharedVertexIdx,
      T1: res.T1,
      T2: res.T2
    };
  }

  _solveSamePathBezierCorner(poly, adj, radius) {
    const { prevIdx, sharedVertexIdx, nextIdx, curve1, curve2, c1, c2 } = adj;
    const cornerPt = poly.segments[sharedVertexIdx].point.clone();

    if (radius <= 1e-5) {
      return {
        mode: 'same_path_bezier',
        radius: 0,
        vertex: cornerPt,
        arcPoints: null,
        prevIdx,
        sharedVertexIdx,
        nextIdx,
        s1: curve1.length,
        s2: 0
      };
    }

    const sub1 = this._extractSingleCurvePath(curve1);
    const sub2 = this._extractSingleCurvePath(curve2);

    const nrSol = this._solveCurveNewtonRaphson(sub1, c1, sub2, c2, radius, {
      forbidExtrapolation: true,
      initialPointHint: cornerPt
    });

    sub1.remove();
    sub2.remove();

    if (!nrSol) return null;

    const s1 = nrSol.trim1.targetOffset;
    const s2 = nrSol.trim2.targetOffset;
    if (s1 <= 1e-4 || s1 >= curve1.length - 1e-4) return null;
    if (s2 <= 1e-4 || s2 >= curve2.length - 1e-4) return null;

    return {
      mode: 'same_path_bezier',
      radius: nrSol.radius,
      vertex: nrSol.vertex,
      arcPoints: nrSol.arcPoints,
      prevIdx,
      sharedVertexIdx,
      nextIdx,
      s1,
      s2
    };
  }

  _extractSingleCurvePath(curve) {
    const s1 = curve.segment1;
    const s2 = curve.segment2;
    return new this.paper.Path({
      segments: [
        new this.paper.Segment(s1.point.clone(), new this.paper.Point(0, 0), s1.handleOut.clone()),
        new this.paper.Segment(s2.point.clone(), s2.handleIn.clone(), new this.paper.Point(0, 0))
      ],
      insert: false
    });
  }

  // =========================================================================
  // RAMA 1: TRIGONOMETRÍA ANALÍTICA EXACTA (RECTAS Y VÉRTICES RECTOS)
  // =========================================================================

  _solveLineLineAnalytic(line1, clickPt1, line2, clickPt2, radius) {
    const p1a = line1.firstSegment.point;
    const p1b = line1.lastSegment.point;
    const p2a = line2.firstSegment.point;
    const p2b = line2.lastSegment.point;

    const res = this._computeAnalyticCorner(p1a, p1b, clickPt1, p2a, p2b, clickPt2, radius);
    if (!res) return null;

    return {
      mode: 'two_entities',
      radius: res.radius,
      vertex: res.vertex,
      arcPoints: res.arcPoints,
      analyticMeta: res.analyticMeta,
      trim1: {
        type: 'line_endpoint',
        replaceStart: res.replaceStart1,
        targetPoint: res.T1
      },
      trim2: {
        type: 'line_endpoint',
        replaceStart: res.replaceStart2,
        targetPoint: res.T2
      }
    };
  }

  _computeAnalyticCorner(p1a, p1b, clickPt1, p2a, p2b, clickPt2, radius) {
    const v1 = p1b.subtract(p1a);
    const v2 = p2b.subtract(p2a);
    if (v1.length < 1e-7 || v2.length < 1e-7) return null;

    const u1 = v1.normalize();
    const u2 = v2.normalize();

    const denom = u1.x * u2.y - u1.y * u2.x;
    if (Math.abs(denom) < 1e-7) return null;

    const delta = p2a.subtract(p1a);
    const t = (delta.x * u2.y - delta.y * u2.x) / denom;
    const V = p1a.add(u1.multiply(t));

    const e1 = this._resolveRayDirectionFromVertex(V, u1, p1a, p1b, clickPt1);
    const e2 = this._resolveRayDirectionFromVertex(V, u2, p2a, p2b, clickPt2);

    const cosTheta = Math.max(-1, Math.min(1, e1.dot(e2)));
    const theta = Math.acos(cosTheta);
    if (theta < 1e-5 || Math.PI - theta < 1e-5) return null;

    const tanHalf = Math.tan(theta / 2);
    const sinHalf = Math.sin(theta / 2);
    const tangentDist = radius / tanHalf;

    const proj1a = p1a.subtract(V).dot(e1);
    const proj1b = p1b.subtract(V).dot(e1);
    const replaceStart1 = proj1a < proj1b;
    const farDist1 = Math.max(proj1a, proj1b);

    const proj2a = p2a.subtract(V).dot(e2);
    const proj2b = p2b.subtract(V).dot(e2);
    const replaceStart2 = proj2a < proj2b;
    const farDist2 = Math.max(proj2a, proj2b);

    const maxTangent = Math.max(0, Math.min(farDist1, farDist2));
    const maxRadius = maxTangent * tanHalf;

    const bisectorSum = e1.add(e2);
    if (bisectorSum.length < 1e-7) return null;
    const bisector = bisectorSum.normalize();

    const analyticMeta = { V, bisector, sinHalf, tanHalf, maxRadius };

    if (farDist1 < tangentDist - 1e-5 || farDist2 < tangentDist - 1e-5) {
      return null;
    }

    if (radius <= 1e-5) {
      return {
        radius: 0,
        vertex: V,
        T1: V.clone(),
        T2: V.clone(),
        arcPoints: null,
        analyticMeta,
        replaceStart1,
        replaceStart2
      };
    }

    const T1 = V.add(e1.multiply(tangentDist));
    const T2 = V.add(e2.multiply(tangentDist));

    const centerDist = radius / sinHalf;
    const center = V.add(bisector.multiply(centerDist));
    const midPoint = center.subtract(bisector.multiply(radius));

    return {
      radius,
      vertex: V,
      T1,
      T2,
      arcPoints: { T1, M: midPoint, T2, center },
      analyticMeta,
      replaceStart1,
      replaceStart2
    };
  }

  _resolveRayDirectionFromVertex(V, unitDir, segStart, segEnd, clickPt) {
    const projClick = clickPt.subtract(V).dot(unitDir);
    if (Math.abs(projClick) > 1e-4) {
      return projClick > 0 ? unitDir : unitDir.multiply(-1);
    }
    const midPt = segStart.add(segEnd).multiply(0.5);
    const projMid = midPt.subtract(V).dot(unitDir);
    return projMid >= 0 ? unitDir : unitDir.multiply(-1);
  }

  // =========================================================================
  // RAMA 2: SOLVER NEWTON-RAPHSON 2D (CURVAS SPLINE / BÉZIER / CÍRCULO / MIXTO)
  // =========================================================================

  _solveCurveNewtonRaphson(entity1, clickPt1, entity2, clickPt2, radius, opts = {}) {
    if (!entity1.getNearestLocation || !entity2.getNearestLocation) return null;

    const loc1 = entity1.getNearestLocation(clickPt1);
    const loc2 = entity2.getNearestLocation(clickPt2);
    if (!loc1 || !loc2) return null;

    if (radius <= 1e-5) {
      const intersections = entity1.getIntersections(entity2);
      if (!intersections || intersections.length === 0) return null;

      let bestIx = intersections[0];
      let minDist = bestIx.point.getDistance(clickPt2);
      for (let i = 1; i < intersections.length; i++) {
        const d = intersections[i].point.getDistance(clickPt2);
        if (d < minDist) {
          minDist = d;
          bestIx = intersections[i];
        }
      }

      const s1Star = bestIx.offset;
      const locOn2 = entity2.getNearestLocation(bestIx.point);
      if (!locOn2) return null;
      const s2Star = locOn2.offset;

      return {
        mode: 'two_entities',
        radius: 0,
        vertex: bestIx.point.clone(),
        arcPoints: null,
        trim1: {
          type: 'curve_offset',
          targetOffset: s1Star,
          targetPoint: bestIx.point.clone(),
          keepBefore: loc1.offset <= s1Star
        },
        trim2: {
          type: 'curve_offset',
          targetOffset: s2Star,
          targetPoint: bestIx.point.clone(),
          keepBefore: loc2.offset <= s2Star
        }
      };
    }

    const sign1 = this._resolveNormalSideSign(entity1, loc1.offset, clickPt2);
    const sign2 = this._resolveNormalSideSign(entity2, loc2.offset, clickPt1);

    // Semilla inicial mejorada: intersección cercana al clic (o punto más cercano entre curvas)
    let s1 = loc1.offset;
    let s2 = loc2.offset;

    if (opts.initialPointHint) {
      const h1 = entity1.getNearestLocation(opts.initialPointHint);
      const h2 = entity2.getNearestLocation(opts.initialPointHint);
      if (h1 && h2) {
        s1 = (h1.offset + loc1.offset) * 0.5;
        s2 = (h2.offset + loc2.offset) * 0.5;
      }
    } else {
      const ixs = entity1.getIntersections(entity2);
      if (ixs && ixs.length > 0) {
        let bestIx = ixs[0];
        let bestD = bestIx.point.getDistance(clickPt2);
        for (let i = 1; i < ixs.length; i++) {
          const d = ixs[i].point.getDistance(clickPt2);
          if (d < bestD) {
            bestD = d;
            bestIx = ixs[i];
          }
        }
        const ixLoc2 = entity2.getNearestLocation(bestIx.point);
        if (ixLoc2) {
          s1 = (bestIx.offset + loc1.offset) * 0.5;
          s2 = (ixLoc2.offset + loc2.offset) * 0.5;
        }
      }
    }

    const maxIter = 45;
    const tol = 1e-6;
    const h = 1e-4;
    let converged = false;

    for (let iter = 0; iter < maxIter; iter++) {
      const O1 = this._evalOffsetPoint(entity1, s1, sign1, radius);
      const O2 = this._evalOffsetPoint(entity2, s2, sign2, radius);
      if (!O1 || !O2) return null;

      const fx = O1.x - O2.x;
      const fy = O1.y - O2.y;
      const err = Math.hypot(fx, fy);

      if (err < tol) {
        converged = true;
        break;
      }

      const O1Plus = this._evalOffsetPoint(entity1, s1 + h, sign1, radius);
      const O1Minus = this._evalOffsetPoint(entity1, s1 - h, sign1, radius);
      const O2Plus = this._evalOffsetPoint(entity2, s2 + h, sign2, radius);
      const O2Minus = this._evalOffsetPoint(entity2, s2 - h, sign2, radius);
      if (!O1Plus || !O1Minus || !O2Plus || !O2Minus) return null;

      const j11 = (O1Plus.x - O1Minus.x) / (2 * h);
      const j21 = (O1Plus.y - O1Minus.y) / (2 * h);
      const j12 = -(O2Plus.x - O2Minus.x) / (2 * h);
      const j22 = -(O2Plus.y - O2Minus.y) / (2 * h);

      const det = j11 * j22 - j12 * j21;
      if (Math.abs(det) < 1e-11) return null;

      const ds1 = -(j22 * fx - j12 * fy) / det;
      const ds2 = -(-j21 * fx + j11 * fy) / det;

      const stepNorm = Math.hypot(ds1, ds2);
      const maxStep = Math.max(entity1.length, entity2.length) * 0.35;
      const scale = stepNorm > maxStep ? maxStep / stepNorm : 1;

      s1 += ds1 * scale;
      s2 += ds2 * scale;
    }

    if (!converged) return null;

    if (opts.forbidExtrapolation) {
      if (s1 <= 1e-4 || s1 >= entity1.length - 1e-4) return null;
      if (s2 <= 1e-4 || s2 >= entity2.length - 1e-4) return null;
    } else {
      const extMargin = radius * 2.5;
      if (s1 < -extMargin || s1 > entity1.length + extMargin) return null;
      if (s2 < -extMargin || s2 > entity2.length + extMargin) return null;
    }

    const T1 = this._evalCurvePoint(entity1, s1);
    const T2 = this._evalCurvePoint(entity2, s2);
    const O1Final = this._evalOffsetPoint(entity1, s1, sign1, radius);
    const O2Final = this._evalOffsetPoint(entity2, s2, sign2, radius);
    if (!T1 || !T2 || !O1Final || !O2Final) return null;

    const center = O1Final.add(O2Final).multiply(0.5);
    const v1 = T1.subtract(center);
    const v2 = T2.subtract(center);
    if (v1.length < 1e-6 || v2.length < 1e-6) return null;

    const u1 = v1.normalize();
    const u2 = v2.normalize();
    const sum = u1.add(u2);
    const midDir = sum.length > 1e-5
      ? sum.normalize()
      : new this.paper.Point(-u1.y, u1.x);

    const midPoint = center.add(midDir.multiply(radius));

    return {
      mode: 'two_entities',
      radius,
      vertex: center,
      arcPoints: { T1, M: midPoint, T2, center },
      trim1: {
        type: 'curve_offset',
        targetOffset: s1,
        targetPoint: T1,
        keepBefore: loc1.offset <= s1
      },
      trim2: {
        type: 'curve_offset',
        targetOffset: s2,
        targetPoint: T2,
        keepBefore: loc2.offset <= s2
      }
    };
  }

  _resolveNormalSideSign(path, offset, oppositePoint) {
    const clamped = Math.max(0, Math.min(path.length, offset));
    const pt = path.getPointAt(clamped);
    const tan = path.getTangentAt(clamped);
    if (!pt || !tan) return 1;

    const leftNormal = new this.paper.Point(-tan.y, tan.x);
    const toOther = oppositePoint.subtract(pt);
    return toOther.dot(leftNormal) >= 0 ? 1 : -1;
  }

  _evalCurvePoint(path, s) {
    const L = path.length;
    if (s >= 0 && s <= L) {
      return path.getPointAt(s);
    }
    if (path.closed) {
      const wrapped = ((s % L) + L) % L;
      return path.getPointAt(wrapped);
    }
    if (s < 0) {
      const p0 = path.getPointAt(0);
      const t0 = path.getTangentAt(0);
      return p0.add(t0.multiply(s));
    }
    const pL = path.getPointAt(L);
    const tL = path.getTangentAt(L);
    return pL.add(tL.multiply(s - L));
  }

  _evalOffsetPoint(path, s, normalSign, radius) {
    const L = path.length;
    let pt, tan;

    if (s >= 0 && s <= L) {
      pt = path.getPointAt(s);
      tan = path.getTangentAt(s);
    } else if (path.closed) {
      const wrapped = ((s % L) + L) % L;
      pt = path.getPointAt(wrapped);
      tan = path.getTangentAt(wrapped);
    } else if (s < 0) {
      const p0 = path.getPointAt(0);
      tan = path.getTangentAt(0);
      pt = p0.add(tan.multiply(s));
    } else {
      const pL = path.getPointAt(L);
      tan = path.getTangentAt(L);
      pt = pL.add(tan.multiply(s - L));
    }

    if (!pt || !tan) return null;
    const normal = new this.paper.Point(-tan.y * normalSign, tan.x * normalSign);
    return pt.add(normal.multiply(radius));
  }

  // =========================================================================
  // MUTACIONES GEOMÉTRICAS Y CREACIÓN LIMPIA DE RAMA DIVIDIDA
  // =========================================================================

  _createCleanSplitPath(sourcePath, segments) {
    const splitEntity = new this.paper.Path({ insert: false });
    splitEntity.addSegments(segments);

    if (sourcePath.strokeColor) {
      splitEntity.strokeColor = sourcePath.strokeColor.clone();
    }
    if (typeof sourcePath.strokeWidth === 'number') {
      splitEntity.strokeWidth = sourcePath.strokeWidth;
    }
    if (typeof sourcePath.opacity === 'number') {
      splitEntity.opacity = sourcePath.opacity;
    }
    if (Array.isArray(sourcePath.dashArray)) {
      splitEntity.dashArray = [...sourcePath.dashArray];
    }
    splitEntity.strokeCap = sourcePath.strokeCap;
    splitEntity.strokeJoin = sourcePath.strokeJoin;

    const srcData = sourcePath.data || {};
    splitEntity.data = {
      layerId: srcData.layerId !== undefined ? String(srcData.layerId) : '0',
      colorByLayer: srcData.colorByLayer !== undefined ? srcData.colorByLayer : true,
      opacityByLayer: srcData.opacityByLayer !== undefined ? srcData.opacityByLayer : true,
      strokeWidthByLayer: srcData.strokeWidthByLayer !== undefined ? srcData.strokeWidthByLayer : true
    };
    if (srcData.origColor !== undefined) splitEntity.data.origColor = srcData.origColor;
    if (srcData.origOpacity !== undefined) splitEntity.data.origOpacity = srcData.origOpacity;
    if (srcData.origStrokeWidth !== undefined) splitEntity.data.origStrokeWidth = srcData.origStrokeWidth;

    return splitEntity;
  }

  _applyOpenPathTrimOrExtend(path, trimSpec) {
    if (!trimSpec) return;

    if (trimSpec.type === 'line_endpoint') {
      if (trimSpec.replaceStart) {
        path.firstSegment.point = trimSpec.targetPoint.clone();
      } else {
        path.lastSegment.point = trimSpec.targetPoint.clone();
      }
      return;
    }

    if (trimSpec.type === 'curve_offset') {
      const s = trimSpec.targetOffset;
      const L = path.length;

      if (s <= 0) {
        path.insert(0, new this.paper.Segment(trimSpec.targetPoint.clone()));
        return;
      }
      if (s >= L) {
        path.add(new this.paper.Segment(trimSpec.targetPoint.clone()));
        return;
      }

      const secondPart = path.splitAt(s);
      if (!secondPart) return;

      if (trimSpec.keepBefore) {
        secondPart.remove();
      } else {
        const keptSegments = secondPart.removeSegments();
        secondPart.remove();
        path.removeSegments();
        path.addSegments(keptSegments);
      }
    }
  }

  _applyPolylineCornerMutation(poly, solution) {
    const idx = solution.sharedVertexIdx;
    const n = poly.segments.length;

    // 1. Polilínea cerrada con R > 0: abrir contorno y reordenar desde T2 hasta T1
    if (poly.closed && solution.radius > 1e-5) {
      const reorderedSegments = [new this.paper.Segment(solution.T2.clone())];

      for (let k = 1; k < n; k++) {
        const seg = poly.segments[(idx + k) % n];
        reorderedSegments.push(
          new this.paper.Segment(
            seg.point.clone(),
            seg.handleIn.clone(),
            seg.handleOut.clone()
          )
        );
      }

      reorderedSegments.push(new this.paper.Segment(solution.T1.clone()));

      poly.closed = false;
      poly.removeSegments();
      poly.addSegments(reorderedSegments);
      return null;
    }

    // 2. Polilínea abierta con R > 0: dividir en dos entidades limpias (0..T1 y T2..n-1)
    if (!poly.closed && solution.radius > 1e-5) {
      const headSegments = [];
      for (let i = 0; i < idx; i++) {
        const seg = poly.segments[i];
        headSegments.push(
          new this.paper.Segment(
            seg.point.clone(),
            seg.handleIn.clone(),
            seg.handleOut.clone()
          )
        );
      }
      headSegments.push(new this.paper.Segment(solution.T1.clone()));

      const tailSegments = [new this.paper.Segment(solution.T2.clone())];
      for (let i = idx + 1; i < n; i++) {
        const seg = poly.segments[i];
        tailSegments.push(
          new this.paper.Segment(
            seg.point.clone(),
            seg.handleIn.clone(),
            seg.handleOut.clone()
          )
        );
      }

      const splitEntity = this._createCleanSplitPath(poly, tailSegments);

      poly.removeSegments();
      poly.addSegments(headSegments);

      return splitEntity;
    }

    // 3. Esquina viva (R = 0): mover el vértice compartido a la intersección
    poly.segments[idx].point = solution.T1.clone();
    return null;
  }

  _applySamePathBezierMutation(poly, solution) {
    if (solution.radius <= 1e-5) {
      return null;
    }

    const { prevIdx, sharedVertexIdx, nextIdx, s1, s2 } = solution;
    const n = poly.segments.length;

    const segA = poly.segments[prevIdx];
    const segV = poly.segments[sharedVertexIdx];
    const segB = poly.segments[nextIdx];

    // Subdividir exactamente ambas curvas Bézier mediante De Casteljau (splitAt)
    const sub1 = new this.paper.Path({
      segments: [
        new this.paper.Segment(segA.point.clone(), new this.paper.Point(0, 0), segA.handleOut.clone()),
        new this.paper.Segment(segV.point.clone(), segV.handleIn.clone(), new this.paper.Point(0, 0))
      ],
      insert: false
    });
    const rem1 = sub1.splitAt(s1);
    if (rem1) rem1.remove();
    const segATrimmed = sub1.segments[0];
    const segT1 = new this.paper.Segment(
      sub1.segments[1].point.clone(),
      sub1.segments[1].handleIn.clone(),
      new this.paper.Point(0, 0)
    );
    const newSegAHandleOut = segATrimmed.handleOut.clone();
    sub1.remove();

    const sub2 = new this.paper.Path({
      segments: [
        new this.paper.Segment(segV.point.clone(), new this.paper.Point(0, 0), segV.handleOut.clone()),
        new this.paper.Segment(segB.point.clone(), segB.handleIn.clone(), new this.paper.Point(0, 0))
      ],
      insert: false
    });
    const tail2 = sub2.splitAt(s2);
    const activeTail2 = tail2 || sub2;
    const segT2 = new this.paper.Segment(
      activeTail2.segments[0].point.clone(),
      new this.paper.Point(0, 0),
      activeTail2.segments[0].handleOut.clone()
    );
    const newSegBHandleIn = activeTail2.segments[1].handleIn.clone();
    if (tail2) tail2.remove();
    sub2.remove();

    // 1. Curva Bézier cerrada: abrir contorno y reordenar desde segT2 hasta segT1
    if (poly.closed) {
      const reordered = [segT2];

      if (n === 2) {
        // Caso especial: óvalo Bézier cerrado de 2 nodos (segA === segB)
        reordered.push(
          new this.paper.Segment(segA.point.clone(), newSegBHandleIn, newSegAHandleOut)
        );
      } else {
        reordered.push(
          new this.paper.Segment(segB.point.clone(), newSegBHandleIn, segB.handleOut.clone())
        );

        for (let step = 2; step <= n - 2; step++) {
          const s = poly.segments[(sharedVertexIdx + step) % n];
          reordered.push(
            new this.paper.Segment(s.point.clone(), s.handleIn.clone(), s.handleOut.clone())
          );
        }

        reordered.push(
          new this.paper.Segment(segA.point.clone(), segA.handleIn.clone(), newSegAHandleOut)
        );
      }

      reordered.push(segT1);

      poly.closed = false;
      poly.removeSegments();
      poly.addSegments(reordered);
      return null;
    }

    // 2. Curva Bézier abierta: dividir en dos entidades independientes
    const headSegments = [];
    for (let i = 0; i < prevIdx; i++) {
      const s = poly.segments[i];
      headSegments.push(
        new this.paper.Segment(s.point.clone(), s.handleIn.clone(), s.handleOut.clone())
      );
    }
    headSegments.push(
      new this.paper.Segment(segA.point.clone(), segA.handleIn.clone(), newSegAHandleOut)
    );
    headSegments.push(segT1);

    const tailSegments = [
      segT2,
      new this.paper.Segment(segB.point.clone(), newSegBHandleIn, segB.handleOut.clone())
    ];
    for (let i = nextIdx + 1; i < n; i++) {
      const s = poly.segments[i];
      tailSegments.push(
        new this.paper.Segment(s.point.clone(), s.handleIn.clone(), s.handleOut.clone())
      );
    }

    const splitEntity = this._createCleanSplitPath(poly, tailSegments);

    poly.removeSegments();
    poly.addSegments(headSegments);

    return splitEntity;
  }

  _isPureLine(entity) {
    if (!entity || entity.closed || !entity.segments || entity.segments.length !== 2) {
      return false;
    }
    return entity.segments[0].handleOut.isZero() && entity.segments[1].handleIn.isZero();
  }

  _capturePathState(path) {
    return {
      closed: Boolean(path.closed),
      segments: path.segments.map((s) => ({
        point: s.point.clone(),
        handleIn: s.handleIn.clone(),
        handleOut: s.handleOut.clone()
      }))
    };
  }
}