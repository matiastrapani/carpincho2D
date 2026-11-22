/**
 * services/engines/CircleIntersectionMath.js - Intersecciones analíticas exactas
 * para entidades circulares (círculo-círculo, círculo-recta y círculo-Bézier).
 */

function isStraightCurve(curve) {
  if (!curve) return false;
  const h1 = curve.handle1;
  const h2 = curve.handle2;
  const h1Zero = !h1 || (Math.abs(h1.x) <= 1e-12 && Math.abs(h1.y) <= 1e-12);
  const h2Zero = !h2 || (Math.abs(h2.x) <= 1e-12 && Math.abs(h2.y) <= 1e-12);
  return h1Zero && h2Zero;
}

export function intersectCircleCircle(circleA, circleB) {
  const c1 = circleA.position;
  const r1 = circleA.data?.radius || (circleA.bounds.width / 2);
  const c2 = circleB.position;
  const r2 = circleB.data?.radius || (circleB.bounds.width / 2);

  if (r1 <= 0 || r2 <= 0) return [];

  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  const tol = Math.max(1e-12, 1e-6 * Math.max(r1, r2));

  if (d <= tol || d > r1 + r2 + tol || d < Math.abs(r1 - r2) - tol) {
    return [];
  }

  const ux = dx / d;
  const uy = dy / d;

  // Tangencia exterior (d ≈ r1 + r2)
  if (Math.abs(d - (r1 + r2)) <= tol) {
    const distFromC1 = 0.5 * (d + r1 - r2);
    return [new paper.Point(c1.x + ux * distFromC1, c1.y + uy * distFromC1)];
  }

  // Tangencia interior (d ≈ |r1 - r2|)
  if (Math.abs(d - Math.abs(r1 - r2)) <= tol) {
    if (r1 >= r2) {
      const distFromC1 = 0.5 * (d + r1 + r2);
      return [new paper.Point(c1.x + ux * distFromC1, c1.y + uy * distFromC1)];
    }
    const distFromC1 = 0.5 * (r1 + r2 - d);
    return [new paper.Point(c1.x - ux * distFromC1, c1.y - uy * distFromC1)];
  }

  // Secantes: 2 intersecciones exactas
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const px = c1.x + a * ux;
  const py = c1.y + a * uy;

  return [
    new paper.Point(px - h * uy, py + h * ux),
    new paper.Point(px + h * uy, py - h * ux)
  ];
}

function intersectCircleWithBezierCurve(curve, center, radius, tol) {
  const rSq = radius * radius;
  const radialDiffSq = (t) => {
    const pt = curve.getPointAtTime(t);
    if (!pt) return 0;
    const dx = pt.x - center.x;
    const dy = pt.y - center.y;
    return (dx * dx + dy * dy) - rSq;
  };

  const results = [];
  const pushUnique = (t) => {
    const pt = curve.getPointAtTime(t);
    if (!pt) return;
    const exactPt = new paper.Point(pt.x, pt.y);
    if (!results.some((existing) => existing.getDistance(exactPt) <= tol * 10)) {
      results.push(exactPt);
    }
  };

  const steps = 32;
  const samples = new Array(steps + 1);
  for (let i = 0; i <= steps; i++) {
    samples[i] = radialDiffSq(i / steps);
  }

  // Tangencia o contacto en los extremos exactos de la curva (t = 0 y t = 1)
  const endRadSqTol = 2 * radius * tol;
  if (Math.abs(samples[0]) <= endRadSqTol) {
    pushUnique(0);
  }
  if (Math.abs(samples[steps]) <= endRadSqTol) {
    pushUnique(1);
  }

  for (let i = 1; i <= steps; i++) {
    const t0 = (i - 1) / steps;
    const t1 = i / steps;
    const f0 = samples[i - 1];
    const f1 = samples[i];

    // Cruce transversal: cambio de signo de (dist² - R²)
    if (f0 === 0 || f1 === 0 || (f0 < 0 && f1 > 0) || (f0 > 0 && f1 < 0)) {
      let lo = t0;
      let hi = t1;
      let loVal = f0;
      for (let iter = 0; iter < 16; iter++) {
        const mid = 0.5 * (lo + hi);
        const midVal = radialDiffSq(mid);
        if ((loVal <= 0 && midVal <= 0) || (loVal >= 0 && midVal >= 0)) {
          lo = mid;
          loVal = midVal;
        } else {
          hi = mid;
        }
      }
      pushUnique(0.5 * (lo + hi));
      continue;
    }

    // Tangencia pura sin cruce: extremo local cercano a R
    if (i < steps) {
      const f2 = samples[i + 1];
      if ((f1 <= f0 && f1 <= f2) || (f1 >= f0 && f1 >= f2)) {
        let a = t0;
        let b = (i + 1) / steps;
        for (let iter = 0; iter < 16; iter++) {
          const m1 = a + (b - a) / 3;
          const m2 = b - (b - a) / 3;
          if (Math.abs(radialDiffSq(m1)) < Math.abs(radialDiffSq(m2))) {
            b = m2;
          } else {
            a = m1;
          }
        }
        const tStar = 0.5 * (a + b);
        const ptStar = curve.getPointAtTime(tStar);
        if (ptStar && Math.abs(ptStar.getDistance(center) - radius) <= tol) {
          pushUnique(tStar);
        }
      }
    }
  }

  return results;
}

export function intersectCircleWithPath(circle, path, isDynamicCurve = null) {
  if (!circle || !path?.curves) return [];

  const center = circle.position;
  const radius = circle.data?.radius || (circle.bounds.width / 2);
  if (radius <= 0) return [];

  const tol = Math.max(1e-12, 1e-6 * radius);
  const rSq = radius * radius;
  const points = [];

  path.curves.forEach((curve) => {
    if (!curve || curve.length <= 1e-12 || isDynamicCurve?.(curve)) return;

    // Segmentos rectos (tiradores nulos): cuadrática analítica exacta
    if (isStraightCurve(curve)) {
      const p1 = curve.point1;
      const p2 = curve.point2;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen <= 1e-12) return;

      const fx = p1.x - center.x;
      const fy = p1.y - center.y;
      const a = segLen * segLen;
      const b = 2 * (fx * dx + fy * dy);
      const c = fx * fx + fy * fy - rSq;
      const disc = b * b - 4 * a * c;
      const discTol = 8 * a * radius * tol;

      if (disc < -discTol) return;

      const endTol = Math.max(1e-12, 5e-4 * radius);
      const paramTol = Math.max(1e-5, endTol / segLen);

      if (disc <= discTol) {
        const t = -b / (2 * a);
        if (t >= -paramTol && t <= 1 + paramTol) {
          const ct = Math.max(0, Math.min(1, t));
          points.push(new paper.Point(p1.x + ct * dx, p1.y + ct * dy));
        }
        return;
      }

      const sqrtDisc = Math.sqrt(disc);
      const inv2a = 0.5 / a;
      [(-b - sqrtDisc) * inv2a, (-b + sqrtDisc) * inv2a].forEach((t) => {
        if (t >= -paramTol && t <= 1 + paramTol) {
          const ct = Math.max(0, Math.min(1, t));
          points.push(new paper.Point(p1.x + ct * dx, p1.y + ct * dy));
        }
      });
      return;
    }

    // Curvas Bézier cúbicas y splines: evaluación radial exacta sobre el polinomio
    points.push(...intersectCircleWithBezierCurve(curve, center, radius, tol));
  });

  return points;
}