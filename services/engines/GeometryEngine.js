/**
 * services/engines/GeometryEngine.js - Motor de operaciones geométricas y topológicas (Trim, División)
 */
import { TrimCommand } from '../commands/cadCommands.js';

export class GeometryEngine {
  constructor(cadService) {
    this.service = cadService;
  }

  performTrim(targetPath, clickPt, renderBezierFn) {
    if (!this.service.trimCuttingBoundaries.length || !targetPath || this.service.trimCuttingBoundaries.includes(targetPath)) return;

    const layerId = String(targetPath.data?.layerId || '0');
    const layerManager = this.service.layerManager || window.cadUtils?.layerManager;
    const layer = layerManager?.layers?.get(layerId);
    if (layer && layer.locked) return;

    let intersections = [];
    this.service.trimCuttingBoundaries.forEach(boundary => {
      const crossings = targetPath.getIntersections(boundary);
      crossings.forEach(c => {
        if (c && c.offset !== undefined) {
          intersections.push({ offset: c.offset, point: c.point });
        }
      });
    });

    if (intersections.length === 0) return;

    intersections.sort((a, b) => a.offset - b.offset);

    const EPSILON = 0.05;
    const uniqueCutOffsets = [];
    intersections.forEach(item => {
      if (!uniqueCutOffsets.some(existing => Math.abs(existing - item.offset) < EPSILON)) {
        uniqueCutOffsets.push(item.offset);
      }
    });

    if (uniqueCutOffsets.length === 0) return;

    const clickLoc = targetPath.getNearestLocation(clickPt);
    if (!clickLoc) return;
    const tolerance = 15 / paper.view.zoom;
    if (clickLoc.point.getDistance(clickPt) > tolerance) return;

    const origStrokeColor = targetPath.strokeColor || '#00e5ff';
    const origStrokeWidth = targetPath.strokeWidth || 2;
    const origIdx = this.service.entities.indexOf(targetPath);

    let currentPath = targetPath.clone();
    
    if (currentPath.closed) {
      currentPath.splitAt(uniqueCutOffsets[0]);
    }

    let splitLocs = [];
    this.service.trimCuttingBoundaries.forEach(boundary => {
      const crossings = currentPath.getIntersections(boundary);
      crossings.forEach(c => {
        if (c && c.offset !== undefined && c.offset > 0.01 && c.offset < currentPath.length - 0.01) {
          splitLocs.push(c.offset);
        }
      });
    });

    splitLocs.sort((a, b) => b - a);

    let subPaths = [currentPath];
    splitLocs.forEach(off => {
      for (let i = 0; i < subPaths.length; i++) {
        const p = subPaths[i];
        const loc = p.getLocationAt(off);
        if (loc) {
          const remainder = p.splitAt(loc);
          if (remainder) {
            subPaths.push(remainder);
          }
          break;
        }
      }
    });

    let clickedPathIndex = -1;
    let minDistance = Infinity;

    subPaths.forEach((p, idx) => {
      const nearest = p.getNearestLocation(clickPt);
      if (nearest) {
        const dist = nearest.point.getDistance(clickPt);
        if (dist < minDistance) {
          minDistance = dist;
          clickedPathIndex = idx;
        }
      }
    });

    const remainingPaths = [];
    subPaths.forEach((p, idx) => {
      if (idx === clickedPathIndex) {
        p.remove();
      } else {
        p.strokeColor = origStrokeColor;
        p.strokeWidth = origStrokeWidth;
        p.closed = false;
        remainingPaths.push(p);
      }
    });

    const trimCmd = new TrimCommand(this.service, targetPath, remainingPaths, origIdx);
    this.service.executeCommand(trimCmd);

    if (renderBezierFn) renderBezierFn();
  }

  divideEntityByCount(entity, count, renderBezierFn, options = {}) {
    if (!entity || count < 2 || !entity.length) return [];
    const totalLen = entity.length;
    const step = totalLen / count;
    const pointsCreated = [];

    const isClosed = entity.closed || false;
    const maxIndex = isClosed ? (count - 1) : count;

    for (let i = 0; i <= maxIndex; i++) {
      let offset = i * step;
      if (i === count) offset = totalLen;

      const pt = entity.getPointAt(offset);
      if (pt) {
        const pointEntity = this.service.createPointEntity(pt, options);
        if (pointEntity) pointsCreated.push(pointEntity);
      }
    }

    if (renderBezierFn) renderBezierFn();
    return pointsCreated;
  }

  divideEntityByDistance(entity, distance, renderBezierFn, options = {}, customStartPt = null) {
    if (!entity || distance <= 0 || !entity.length) return [];
    const totalLen = entity.length;
    if (distance > totalLen) return [];

    const pointsCreated = [];
    const isClosed = entity.closed || false;

    let startOffset = 0;
    if (customStartPt) {
      const loc = entity.getNearestLocation(customStartPt);
      if (loc) startOffset = loc.offset;
    }

    const startPt = entity.getPointAt(startOffset);
    if (startPt) {
      const pointEntity = this.service.createPointEntity(startPt, options);
      if (pointEntity) pointsCreated.push(pointEntity);
    }

    if (isClosed) {
      const count = Math.floor(totalLen / distance);
      for (let i = 1; i < count; i++) {
        const offset = (startOffset + i * distance) % totalLen;
        const pt = entity.getPointAt(offset);
        if (pt) {
          const pointEntity = this.service.createPointEntity(pt, options);
          if (pointEntity) pointsCreated.push(pointEntity);
        }
      }
    } else {
      let fwdOffset = startOffset + distance;
      while (fwdOffset <= totalLen + 0.001) {
        const pt = entity.getPointAt(Math.min(fwdOffset, totalLen));
        if (pt) {
          const pointEntity = this.service.createPointEntity(pt, options);
          if (pointEntity) pointsCreated.push(pointEntity);
        }
        fwdOffset += distance;
      }

      let bwdOffset = startOffset - distance;
      while (bwdOffset >= -0.001) {
        const pt = entity.getPointAt(Math.max(bwdOffset, 0));
        if (pt) {
          const pointEntity = this.service.createPointEntity(pt, options);
          if (pointEntity) pointsCreated.push(pointEntity);
        }
        bwdOffset -= distance;
      }
    }

    if (renderBezierFn) renderBezierFn();
    return pointsCreated;
  }
}