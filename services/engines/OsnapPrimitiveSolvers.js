/**
 * services/engines/OsnapPrimitiveSolvers.js - Solvers geométricos discretos para OSNAP
 * (Círculos, Puntos y Contornos de Rasters) sin dependencias globales.
 */

export function buildRasterContourPath(raster) {
  if (!raster) return null;

  if (raster.width && raster.height && raster.matrix) {
    const halfW = raster.width / 2;
    const halfH = raster.height / 2;
    const m = raster.matrix;
    return new paper.Path({
      segments: [
        m.transform(new paper.Point(-halfW, -halfH)),
        m.transform(new paper.Point(halfW, -halfH)),
        m.transform(new paper.Point(halfW, halfH)),
        m.transform(new paper.Point(-halfW, halfH))
      ],
      closed: true,
      insert: false
    });
  }

  const b = raster.bounds;
  if (b && b.width > 0 && b.height > 0) {
    return new paper.Path({
      segments: [b.topLeft, b.topRight, b.bottomRight, b.bottomLeft],
      closed: true,
      insert: false
    });
  }

  return null;
}

export function collectPrimitiveOsnapCandidates({
  snapFilters,
  circleTargets,
  rasterTargets,
  pointTargets,
  rasterContourMap,
  zoom,
  snapRadius,
  mousePoint,
  isSelfPoint
}) {
  const candidates = [];

  circleTargets.forEach((circle) => {
    const center = circle.position.clone();
    const radius = circle.data?.radius || (circle.bounds.width / 2);

    if (snapFilters.quadrant) {
      [
        center.add(new paper.Point(radius, 0)),
        center.add(new paper.Point(0, -radius)),
        center.add(new paper.Point(-radius, 0)),
        center.add(new paper.Point(0, radius))
      ].forEach((qPt) => {
        const dist = qPt.getDistance(mousePoint);
        if (!isSelfPoint(qPt) && dist <= snapRadius) {
          candidates.push({ point: qPt, type: 'quadrant', dist, priority: 0 });
        }
      });
    }

    if (snapFilters.center && !isSelfPoint(center)) {
      const distToCenter = center.getDistance(mousePoint);
      const distToEdge = Math.abs(distToCenter - radius);
      if (distToCenter <= snapRadius) {
        candidates.push({ point: center.clone(), type: 'center', dist: distToCenter, priority: 0 });
      } else if (distToEdge <= snapRadius) {
        candidates.push({ point: center.clone(), type: 'center', dist: distToEdge + (5 / zoom), priority: 1 });
      }
    }
  });

  rasterTargets.forEach((raster) => {
    const contour = rasterContourMap.get(raster);
    if (!contour) return;

    if (snapFilters.endpoint) {
      contour.segments.forEach((seg) => {
        const dist = seg.point.getDistance(mousePoint);
        if (!isSelfPoint(seg.point) && dist <= snapRadius) {
          candidates.push({ point: seg.point.clone(), type: 'endpoint', dist, priority: 1 });
        }
      });
    }

    if (snapFilters.midpoint) {
      contour.curves.forEach((curve) => {
        const mid = curve?.length > 0 ? curve.getPointAt(curve.length * 0.5) : null;
        if (mid && !isSelfPoint(mid)) {
          const dist = mid.getDistance(mousePoint);
          if (dist <= snapRadius) {
            candidates.push({ point: mid, type: 'midpoint', dist, priority: 2 });
          }
        }
      });
    }

    if (snapFilters.center) {
      const centerPt = contour.bounds?.center || raster.position;
      if (centerPt && !isSelfPoint(centerPt)) {
        const edgePt = contour.getNearestPoint(mousePoint);
        const distToEdge = edgePt ? edgePt.getDistance(mousePoint) : Infinity;
        if (distToEdge <= snapRadius) {
          candidates.push({
            point: centerPt.clone(),
            type: 'center',
            dist: distToEdge,
            priority: 3
          });
        }
      }
    }
  });

  if (snapFilters.node) {
    pointTargets.forEach((ent) => {
      const pt = ent.position;
      const dist = pt.getDistance(mousePoint);
      if (!isSelfPoint(pt) && dist <= snapRadius) {
        candidates.push({ point: new paper.Point(pt.x, pt.y), type: 'node', dist, priority: 0 });
      }
    });
  }

  return candidates;
}