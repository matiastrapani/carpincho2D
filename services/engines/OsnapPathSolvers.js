/**
 * services/engines/OsnapPathSolvers.js - Recolectores de candidatos OSNAP
 * sobre trazados (endpoints, midpoints, cuadrantes), intersecciones y tiradores Bézier.
 */

import { getCurveQuadrantCandidates } from './OsnapGeometryMath.js';
import {
  intersectCircleCircle,
  intersectCircleWithPath
} from './CircleIntersectionMath.js';

export function collectPathGeometryCandidates({
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
}) {
  const candidates = [];

  if (snapFilters.endpoint) {
    snapTargets.forEach((path) => {
      if (!path?.segments) return;
      path.segments.forEach((seg, idx) => {
        if (path === activePath && idx === path.segments.length - 1) return;
        if (path === draggedPath && seg === draggedSegment) return;
        if (ignoreSegments.includes(seg) || isSelfPoint(seg.point)) return;

        const dist = seg.point.getDistance(mousePoint);
        if (dist <= snapRadius) {
          candidates.push({ point: seg.point.clone(), type: 'endpoint', entity: path, dist, priority: 1 });
        }
      });
    });
  }

  if (snapFilters.midpoint) {
    snapTargets.forEach((path) => {
      if (!path?.curves) return;
      path.curves.forEach((curve) => {
        if (!curve || curve.length <= 0 || isDynamicCurve(curve)) return;
        const mid = curve.getPointAt(curve.length * 0.5);
        if (mid && !isSelfPoint(mid)) {
          const dist = mid.getDistance(mousePoint);
          if (dist <= snapRadius) {
            candidates.push({ point: mid, type: 'midpoint', entity: path, dist, priority: 2 });
          }
        }
      });
    });
  }

  if (snapFilters.quadrant) {
    snapTargets.forEach((path) => {
      const quadCandidates = getCurveQuadrantCandidates(path, mousePoint, snapRadius, isSelfPoint, isDynamicCurve);
      if (quadCandidates.length > 0) {
        quadCandidates.forEach((c) => {
          candidates.push(c.entity ? c : { ...c, entity: path });
        });
      }
    });
  }

  return candidates;
}

export function collectIntersectionCandidates({
  snapFilters,
  snapTargets,
  circleTargets,
  activePath,
  draggedPath,
  isDynamicCurve,
  isSelfPoint,
  mousePoint,
  snapRadius,
  epsilon
}) {
  if (!snapFilters.intersection) return [];

  const candidates = [];
  const pushUniqueCandidate = (pt, ownerEntity = null) => {
    if (!pt || isSelfPoint(pt)) return;
    const dist = pt.getDistance(mousePoint);
    if (dist > snapRadius) return;

    const alreadyExists = candidates.some((c) => c.point.getDistance(pt) < 1e-4);
    if (!alreadyExists) {
      candidates.push({ point: pt.clone(), type: 'intersection', entity: ownerEntity, dist, priority: 0 });
    }
  };

  snapTargets.forEach((path) => {
    if (!path?.curves || path.curves.length < 1) return;
    if (draggedPath && path === draggedPath) return;

    const totalLen = path.length || 0;
    if (totalLen <= epsilon) return;

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

      pushUniqueCandidate(cross.point, path);
    });
  });

  const intersectionTargets = Array.from(new Set([...snapTargets, ...circleTargets]))
    .filter((ent) => ent !== activePath);

  for (let i = 0; i < intersectionTargets.length; i++) {
    for (let j = i + 1; j < intersectionTargets.length; j++) {
      const entA = intersectionTargets[i];
      const entB = intersectionTargets[j];
      if (!entA || !entB || entA === entB) continue;
      if (draggedPath && (entA === draggedPath || entB === draggedPath)) continue;
      if (!entA.bounds.expand(1e-3).intersects(entB.bounds)) continue;

      const isCircleA = Boolean(entA.data?.isCircleEntity);
      const isCircleB = Boolean(entB.data?.isCircleEntity);

      if (isCircleA && isCircleB) {
        intersectCircleCircle(entA, entB).forEach((pt) => pushUniqueCandidate(pt, entA));
      } else if (isCircleA) {
        intersectCircleWithPath(entA, entB, isDynamicCurve).forEach((pt) => pushUniqueCandidate(pt, entA));
      } else if (isCircleB) {
        intersectCircleWithPath(entB, entA, isDynamicCurve).forEach((pt) => pushUniqueCandidate(pt, entB));
      } else {
        entA.getIntersections(entB).forEach((cross) => {
          if (!cross?.point) return;
          if (isDynamicCurve(cross.curve) || isDynamicCurve(cross.intersection?.curve)) return;
          pushUniqueCandidate(cross.point, entA);
        });
      }
    }
  }

  return candidates;
}

export function collectEditingHandleCandidates({
  snapFilters,
  editingEntities,
  layerManager,
  draggedPath,
  draggedSegment,
  ignoreEntities,
  ignoreSegments,
  ignoreHandles,
  isSelfPoint,
  mousePoint,
  snapRadius
}) {
  if (!snapFilters.node || !editingEntities || editingEntities.length === 0) return [];

  const candidates = [];

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

        const dist = handlePt.getDistance(mousePoint);
        if (dist <= snapRadius) {
          candidates.push({ point: handlePt, type: 'node', entity: ent, dist, priority: 0 });
        }
      });
    });
  });

  return candidates;
}