/**
 * services/engines/GeometryEngine.js - Motor de operaciones geométricas y topológicas (Trim, División)
 */

import { TrimCommand, BatchTrimCommand } from '../commands/cadCommands.js';

export class GeometryEngine {
  constructor(cadService) {
    this.service = cadService;
  }

  performTrim(targetPath, clickPt, renderBezierFn) {
    if (!this.service.trimCuttingBoundaries.length || !(targetPath instanceof paper.Path)) return;

    const layerId = String(targetPath.data?.layerId || '0');
    const layerManager = this.service.layerManager || window.cadUtils?.layerManager;
    const layer = layerManager?.layers?.get(layerId);
    if (layer && (layer.locked || layer.visible === false)) return;

    const clickLoc = targetPath.getNearestLocation(clickPt);
    if (!clickLoc) return;
    const clickTolerance = 15 / paper.view.zoom;
    if (clickLoc.point.getDistance(clickPt) > clickTolerance) return;

    const cuts = this._collectTrimCuts(targetPath);
    if (cuts.length === 0) return;
    if (targetPath.closed && cuts.length < 2) return;

    const wasBoundary = this.service.trimCuttingBoundaries.includes(targetPath);
    const wasSelected = this.service.selectedEntities.includes(targetPath);
    const origData = targetPath.data ? { ...targetPath.data } : {};
    const resolvedOrigColor = this.service.utils?.propertyManager
      ? this.service.utils.propertyManager.getResolvedColor(targetPath)
      : (origData.origStrokeColor || targetPath.strokeColor || '#00e5ff');
    const origStrokeWidth = origData.origStrokeWidth || targetPath.strokeWidth || 2;
    const origIdx = this.service.entities.indexOf(targetPath);

    const remainingPaths = this._extractTrimRemainingPaths(targetPath, cuts, clickLoc.offset);
    if (remainingPaths.length === 0) return;

    remainingPaths.forEach((p) => {
      p.data = { ...origData };
      delete p.data.isCircleEntity;
      p.strokeColor = resolvedOrigColor;
      p.strokeWidth = origStrokeWidth;
      p.closed = false;
    });

    const trimCmd = new TrimCommand(this.service, targetPath, remainingPaths, origIdx);
    this.service.executeCommand(trimCmd);

    if (wasBoundary) {
      const bIdx = this.service.trimCuttingBoundaries.indexOf(targetPath);
      if (bIdx !== -1) {
        this.service.trimCuttingBoundaries.splice(bIdx, 1, ...remainingPaths);
      } else {
        this.service.trimCuttingBoundaries.push(...remainingPaths);
      }
    }

    if (wasSelected) {
      remainingPaths.forEach((p) => {
        this.service.selectEntity(p, true);
      });
      this.service.editingEntities = [];
      this.service.deselectAllSegments();
    }

    this.service.utils?.selectionRenderEngine?.updateEntitiesStroke?.();
    if (renderBezierFn) renderBezierFn();
  }

  _extractTrimRemainingPaths(targetPath, cuts, clickOffset) {
    const currentPath = targetPath.clone({ insert: false });
    const nextCutIdx = cuts.findIndex((c) => clickOffset < c.offset);

    // 1. ENTIDAD CERRADA (círculo, spline o polilínea cerrada):
    // Quitar un arco de un bucle cerrado deja siempre UNA sola curva abierta continua.
    if (currentPath.closed) {
      const startCut = (nextCutIdx === -1 || nextCutIdx === 0)
        ? cuts[cuts.length - 1]
        : cuts[nextCutIdx - 1];
      const endCut = (nextCutIdx === -1 || nextCutIdx === 0)
        ? cuts[0]
        : cuts[nextCutIdx];

      const totalLen = currentPath.length;
      const openLoc = currentPath.getLocationAt(Math.min(endCut.offset, totalLen));
      if (!openLoc) {
        currentPath.remove();
        return [];
      }

      currentPath.splitAt(openLoc);
      if (currentPath.closed) {
        currentPath.closed = false;
        currentPath.add(currentPath.firstSegment.clone());
      }

      const exactEndPt = this._resolveExactCutPoint(endCut, targetPath);
      if (exactEndPt) {
        currentPath.firstSegment.point = exactEndPt.clone();
        currentPath.lastSegment.point = exactEndPt.clone();
      }

      let remOffset = startCut.offset - endCut.offset;
      if (remOffset <= 0) remOffset += totalLen;

      const cutLoc = currentPath.getLocationAt(Math.min(remOffset, currentPath.length));
      if (!cutLoc) {
        currentPath.remove();
        return [];
      }

      const discardedArc = currentPath.splitAt(cutLoc);
      if (discardedArc) discardedArc.remove();

      const exactStartPt = this._resolveExactCutPoint(startCut, targetPath);
      if (exactStartPt) {
        currentPath.lastSegment.point = exactStartPt.clone();
      }

      return [currentPath];
    }

    // 2. ENTIDAD ABIERTA — Punta inicial [0, cuts[0]]:
    // Solo corta en cuts[0] y conserva intacto todo el resto [cuts[0], L].
    if (nextCutIdx === 0) {
      const firstCut = cuts[0];
      const loc = currentPath.getLocationAt(firstCut.offset);
      if (!loc) {
        currentPath.remove();
        return [];
      }

      const keptRight = currentPath.splitAt(loc);
      currentPath.remove();
      if (!keptRight) return [];

      const exactPt = this._resolveExactCutPoint(firstCut, targetPath);
      if (exactPt) keptRight.firstSegment.point = exactPt;
      return [keptRight];
    }

    // 3. ENTIDAD ABIERTA — Punta final [cuts[last], L]:
    // Solo corta en cuts[last] y conserva intacto todo el tramo anterior [0, cuts[last]].
    if (nextCutIdx === -1) {
      const lastCut = cuts[cuts.length - 1];
      const loc = currentPath.getLocationAt(lastCut.offset);
      if (!loc) {
        currentPath.remove();
        return [];
      }

      const discardedRight = currentPath.splitAt(loc);
      if (discardedRight) discardedRight.remove();

      const exactPt = this._resolveExactCutPoint(lastCut, targetPath);
      if (exactPt) currentPath.lastSegment.point = exactPt;
      return [currentPath];
    }

    // 4. ENTIDAD ABIERTA — Puente intermedio [cuts[idx - 1], cuts[idx]]:
    // Corta únicamente en los dos bordes del segmento clicado, conservando ambos lados intactos.
    const leftCut = cuts[nextCutIdx - 1];
    const rightCut = cuts[nextCutIdx];

    const rightLoc = currentPath.getLocationAt(rightCut.offset);
    if (!rightLoc) {
      currentPath.remove();
      return [];
    }
    const keptRight = currentPath.splitAt(rightLoc);
    const exactRightPt = this._resolveExactCutPoint(rightCut, targetPath);
    if (exactRightPt && keptRight) {
      keptRight.firstSegment.point = exactRightPt.clone();
    }

    const leftLoc = currentPath.getLocationAt(leftCut.offset);
    if (!leftLoc) {
      currentPath.remove();
      if (keptRight) keptRight.remove();
      return [];
    }
    const discardedMiddle = currentPath.splitAt(leftLoc);
    if (discardedMiddle) discardedMiddle.remove();

    const exactLeftPt = this._resolveExactCutPoint(leftCut, targetPath);
    if (exactLeftPt) {
      currentPath.lastSegment.point = exactLeftPt.clone();
    }

    const result = [currentPath];
    if (keptRight) result.push(keptRight);
    return result;
  }

  performBoxTrim(boxBounds, isWindowSelection, renderBezierFn) {
    if (!this.service.trimCuttingBoundaries.length || !boxBounds) return;

    const boundariesSnapshot = [...this.service.trimCuttingBoundaries];
    const layerManager = this.service.layerManager || window.cadUtils?.layerManager;
    const paddedBox = boxBounds.expand(1e-3);

    const candidates = (this.service.entities || []).filter((ent) => {
      if (!(ent instanceof paper.Path) || ent.data?.isPointEntity || ent.visible === false) return false;
      if (!ent.bounds || (!paddedBox.intersects(ent.bounds) && !paddedBox.contains(ent.bounds))) return false;

      const layerId = String(ent.data?.layerId || '0');
      const layer = layerManager?.layers?.get(layerId);
      return !(layer && (layer.locked || layer.visible === false));
    });

    if (candidates.length === 0) return;

    const batchCommands = [];
    const boundaryReplacements = [];
    const selectionReplacements = [];

    candidates.forEach((targetPath) => {
      const cuts = this._collectTrimCuts(targetPath, boundariesSnapshot);
      if (cuts.length === 0) return;
      if (targetPath.closed && cuts.length < 2) return;

      const remainingPaths = this._extractBoxTrimRemainingPaths(targetPath, cuts, boxBounds, isWindowSelection);
      if (remainingPaths === null) return;

      const wasBoundary = this.service.trimCuttingBoundaries.includes(targetPath);
      const wasSelected = this.service.selectedEntities.includes(targetPath);
      const origData = targetPath.data ? { ...targetPath.data } : {};
      const resolvedOrigColor = this.service.utils?.propertyManager
        ? this.service.utils.propertyManager.getResolvedColor(targetPath)
        : (origData.origStrokeColor || targetPath.strokeColor || '#00e5ff');
      const origStrokeWidth = origData.origStrokeWidth || targetPath.strokeWidth || 2;
      const origIdx = this.service.entities.indexOf(targetPath);

      remainingPaths.forEach((p) => {
        p.data = { ...origData };
        delete p.data.isCircleEntity;
        p.strokeColor = resolvedOrigColor;
        p.strokeWidth = origStrokeWidth;
        p.closed = false;
      });

      batchCommands.push(new TrimCommand(this.service, targetPath, remainingPaths, origIdx));

      if (wasBoundary) {
        boundaryReplacements.push({ oldPath: targetPath, newPaths: remainingPaths });
      }
      if (wasSelected) {
        selectionReplacements.push(...remainingPaths);
      }
    });

    if (batchCommands.length === 0) return;

    this.service.executeCommand(new BatchTrimCommand(batchCommands));

    boundaryReplacements.forEach(({ oldPath, newPaths }) => {
      const bIdx = this.service.trimCuttingBoundaries.indexOf(oldPath);
      if (bIdx !== -1) {
        this.service.trimCuttingBoundaries.splice(bIdx, 1, ...newPaths);
      } else {
        this.service.trimCuttingBoundaries.push(...newPaths);
      }
    });

    if (selectionReplacements.length > 0) {
      selectionReplacements.forEach((p) => {
        this.service.selectEntity(p, true);
      });
      this.service.editingEntities = [];
      this.service.deselectAllSegments();
    }

    this.service.utils?.selectionRenderEngine?.updateEntitiesStroke?.();
    if (renderBezierFn) renderBezierFn();
  }

  _extractBoxTrimRemainingPaths(targetPath, cuts, boxBounds, isWindowSelection) {
    const totalLen = targetPath.length;
    const MIN_SEG = 1e-5;

    // 1. ENTIDAD ABIERTA
    if (!targetPath.closed) {
      const intervals = [];
      for (let i = 0; i <= cuts.length; i++) {
        const startOffset = i === 0 ? 0 : cuts[i - 1].offset;
        const endOffset = i === cuts.length ? totalLen : cuts[i].offset;
        const startCut = i === 0 ? null : cuts[i - 1];
        const endCut = i === cuts.length ? null : cuts[i];

        const discard = (endOffset - startOffset > MIN_SEG)
          ? this._isSubIntervalSelectedByBox(targetPath, startOffset, endOffset, boxBounds, isWindowSelection)
          : false;

        intervals.push({ startOffset, endOffset, startCut, endCut, discard });
      }

      if (!intervals.some((iv) => iv.discard)) return null;
      if (intervals.every((iv) => iv.discard)) return [];

      // Fusionar intervalos conservados contiguos para evitar fragmentación innecesaria
      const keptRuns = [];
      let currentRun = null;
      intervals.forEach((iv) => {
        if (!iv.discard) {
          if (!currentRun) {
            currentRun = { startOffset: iv.startOffset, endOffset: iv.endOffset, startCut: iv.startCut, endCut: iv.endCut };
          } else {
            currentRun.endOffset = iv.endOffset;
            currentRun.endCut = iv.endCut;
          }
        } else if (currentRun) {
          keptRuns.push(currentRun);
          currentRun = null;
        }
      });
      if (currentRun) keptRuns.push(currentRun);

      const remaining = [];
      keptRuns.forEach((run) => {
        const slice = this._extractOpenSlice(targetPath, run.startOffset, run.endOffset, run.startCut, run.endCut);
        if (slice) remaining.push(slice);
      });
      return remaining;
    }

    // 2. ENTIDAD CERRADA (k >= 2 cortes)
    const k = cuts.length;
    const arcs = [];
    for (let i = 0; i < k; i++) {
      const startCut = cuts[i];
      const endCut = cuts[(i + 1) % k];
      const startOffset = startCut.offset;
      const endOffset = (i + 1 < k) ? endCut.offset : (endCut.offset + totalLen);

      const discard = (endOffset - startOffset > MIN_SEG)
        ? this._isSubIntervalSelectedByBox(targetPath, startOffset, endOffset, boxBounds, isWindowSelection)
        : false;

      arcs.push({ startCut, endCut, discard });
    }

    if (!arcs.some((a) => a.discard)) return null;
    if (arcs.every((a) => a.discard)) return [];

    // Iniciar la agrupación desde el primer arco descartado para no partir un bloque conservado que cruce el origen 0/L
    const firstDiscardedIdx = arcs.findIndex((a) => a.discard);
    const keptArcRuns = [];
    let currentArcRun = null;

    for (let step = 0; step < k; step++) {
      const idx = (firstDiscardedIdx + step) % k;
      const arc = arcs[idx];

      if (!arc.discard) {
        if (!currentArcRun) {
          currentArcRun = { startCut: arc.startCut, endCut: arc.endCut };
        } else {
          currentArcRun.endCut = arc.endCut;
        }
      } else if (currentArcRun) {
        keptArcRuns.push(currentArcRun);
        currentArcRun = null;
      }
    }
    if (currentArcRun) keptArcRuns.push(currentArcRun);

    const remaining = [];
    keptArcRuns.forEach((run) => {
      const arcPath = this._extractClosedArc(targetPath, run.startCut, run.endCut);
      if (arcPath) remaining.push(arcPath);
    });
    return remaining;
  }

  _extractOpenSlice(targetPath, startOffset, endOffset, startCut, endCut) {
    const slice = targetPath.clone({ insert: false });

    if (endCut) {
      const rightLoc = slice.getLocationAt(Math.min(endCut.offset, slice.length));
      if (!rightLoc) {
        slice.remove();
        return null;
      }
      const discardedRight = slice.splitAt(rightLoc);
      if (discardedRight) discardedRight.remove();

      const exactEndPt = this._resolveExactCutPoint(endCut, targetPath);
      if (exactEndPt && slice.lastSegment) {
        slice.lastSegment.point = exactEndPt;
      }
    }

    if (startCut) {
      const leftLoc = slice.getLocationAt(Math.min(startCut.offset, slice.length));
      if (!leftLoc) {
        slice.remove();
        return null;
      }
      const keptRight = slice.splitAt(leftLoc);
      slice.remove();
      if (!keptRight) return null;

      const exactStartPt = this._resolveExactCutPoint(startCut, targetPath);
      if (exactStartPt && keptRight.firstSegment) {
        keptRight.firstSegment.point = exactStartPt;
      }
      return keptRight;
    }

    return slice;
  }

  _extractClosedArc(targetPath, startCut, endCut) {
    const arcPath = targetPath.clone({ insert: false });
    const totalLen = arcPath.length;

    const openLoc = arcPath.getLocationAt(Math.min(startCut.offset, totalLen));
    if (!openLoc) {
      arcPath.remove();
      return null;
    }

    arcPath.splitAt(openLoc);
    if (arcPath.closed) {
      arcPath.closed = false;
      arcPath.add(arcPath.firstSegment.clone());
    }

    const exactStartPt = this._resolveExactCutPoint(startCut, targetPath);
    if (exactStartPt) {
      arcPath.firstSegment.point = exactStartPt.clone();
      arcPath.lastSegment.point = exactStartPt.clone();
    }

    let keptLen = endCut.offset - startCut.offset;
    if (keptLen <= 0) keptLen += totalLen;

    const endLoc = arcPath.getLocationAt(Math.min(keptLen, arcPath.length));
    if (!endLoc) {
      arcPath.remove();
      return null;
    }

    const discardedArc = arcPath.splitAt(endLoc);
    if (discardedArc) discardedArc.remove();

    const exactEndPt = this._resolveExactCutPoint(endCut, targetPath);
    if (exactEndPt && arcPath.lastSegment) {
      arcPath.lastSegment.point = exactEndPt.clone();
    }

    return arcPath;
  }

  _isSubIntervalSelectedByBox(targetPath, startOffset, endOffset, boxBounds, isWindowSelection) {
    const totalLen = targetPath.length;
    const span = endOffset - startOffset;
    if (span <= 1e-6 || totalLen <= 1e-6) return false;

    // Muestrear puntos exactos a lo largo del sub-tramo [startOffset, endOffset]
    const steps = Math.max(8, Math.min(32, Math.ceil(span / 8)));
    const samplePts = [];

    for (let i = 0; i <= steps; i++) {
      let off = startOffset + (span * i) / steps;
      if (targetPath.closed) {
        off = ((off % totalLen) + totalLen) % totalLen;
      } else {
        off = Math.max(0, Math.min(totalLen, off));
      }
      const pt = targetPath.getPointAt(off);
      if (pt) samplePts.push(pt);
    }

    // Incluir vértices internos propios de la polilínea/curva que caigan dentro del sub-tramo
    if (targetPath.segments) {
      targetPath.segments.forEach((seg) => {
        const loc = seg.location;
        if (!loc) return;
        let segOff = loc.offset;
        if (targetPath.closed && segOff < startOffset) segOff += totalLen;
        if (segOff > startOffset + 1e-5 && segOff < endOffset - 1e-5) {
          samplePts.push(seg.point);
        }
      });
    }

    if (samplePts.length === 0) return false;

    // Ventana (izquierda -> derecha): todo el sub-tramo debe quedar contenido en el recuadro
    if (isWindowSelection) {
      const paddedRect = boxBounds.expand(1e-3);
      return samplePts.every((pt) => paddedRect.contains(pt));
    }

    // Cruce (derecha -> izquierda): basta con que cualquier punto o cuerda toque/entre al recuadro
    if (samplePts.some((pt) => boxBounds.contains(pt))) return true;

    // Reordenar puntos por offset para evaluar las cuerdas consecutivas contra los 4 bordes del recuadro
    const orderedPts = [];
    for (let i = 0; i <= steps; i++) {
      let off = startOffset + (span * i) / steps;
      if (targetPath.closed) {
        off = ((off % totalLen) + totalLen) % totalLen;
      } else {
        off = Math.max(0, Math.min(totalLen, off));
      }
      const pt = targetPath.getPointAt(off);
      if (pt) orderedPts.push(pt);
    }

    const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    const segsIntersect = (a, b, c, d) => (ccw(a, c, d) !== ccw(b, c, d)) && (ccw(a, b, c) !== ccw(a, b, d));
    const lineHitsRect = (p1, p2) => (
      segsIntersect(p1, p2, boxBounds.topLeft, boxBounds.topRight) ||
      segsIntersect(p1, p2, boxBounds.topRight, boxBounds.bottomRight) ||
      segsIntersect(p1, p2, boxBounds.bottomRight, boxBounds.bottomLeft) ||
      segsIntersect(p1, p2, boxBounds.bottomLeft, boxBounds.topLeft)
    );

    for (let i = 0; i < orderedPts.length - 1; i++) {
      if (lineHitsRect(orderedPts[i], orderedPts[i + 1])) return true;
    }

    return false;
  }

  _collectTrimCuts(targetPath, boundariesList = this.service.trimCuttingBoundaries) {
    const OFFSET_EPSILON = 1e-4;
    const TJUNCTION_TOL = 1e-3;
    const totalLen = targetPath.length;
    const rawCuts = [];

    boundariesList.forEach((boundary) => {
      if (!boundary || !boundary.parent) return;

      if (boundary === targetPath) {
        const selfCrossings = targetPath.getIntersections();
        selfCrossings.forEach((c) => {
          if (!c || c.offset === undefined) return;

          const off1 = c.offset;
          const off2 = c.intersection?.offset;

          // Descartar falsos positivos en vértices compartidos entre tramos contiguos
          if (off2 !== undefined) {
            const rawDiff = Math.abs(off1 - off2);
            const arcSep = targetPath.closed ? Math.min(rawDiff, totalLen - rawDiff) : rawDiff;
            if (arcSep < OFFSET_EPSILON) return;

            rawCuts.push({ offset: off1, point: c.point.clone(), boundary });
            rawCuts.push({ offset: off2, point: c.point.clone(), boundary });
          } else {
            rawCuts.push({ offset: off1, point: c.point.clone(), boundary });
          }
        });

        if (!targetPath.closed) {
          this._collectSelfTJunctions(targetPath, rawCuts, TJUNCTION_TOL);
        }
        return;
      }

      // 1. Cruces transversales estándar entre entidades distintas
      const crossings = targetPath.getIntersections(boundary);
      crossings.forEach((c) => {
        if (c && c.offset !== undefined) {
          rawCuts.push({ offset: c.offset, point: c.point.clone(), boundary });
        }
      });

      // 2. Uniones en "T": extremos de límites abiertos apoyados sobre targetPath
      if (!boundary.closed && boundary.segments && boundary.segments.length >= 2) {
        const endpoints = [boundary.firstSegment.point, boundary.lastSegment.point];
        endpoints.forEach((endPt) => {
          const nearestLoc = targetPath.getNearestLocation(endPt);
          if (nearestLoc && nearestLoc.point.getDistance(endPt) <= TJUNCTION_TOL) {
            rawCuts.push({
              offset: nearestLoc.offset,
              point: endPt.clone(),
              boundary
            });
          }
        });
      }
    });

    rawCuts.sort((a, b) => a.offset - b.offset);

    const uniqueCuts = [];
    rawCuts.forEach((item) => {
      if (!targetPath.closed && (item.offset <= OFFSET_EPSILON || item.offset >= totalLen - OFFSET_EPSILON)) {
        return;
      }
      if (!uniqueCuts.some((existing) => Math.abs(existing.offset - item.offset) < OFFSET_EPSILON)) {
        uniqueCuts.push(item);
      }
    });

    return uniqueCuts;
  }

  _collectSelfTJunctions(targetPath, rawCuts, tol) {
    const curves = targetPath.curves || [];
    const totalLen = targetPath.length;
    const minSep = Math.max(tol * 2, 1e-3);
    if (curves.length === 0 || totalLen <= minSep * 2) return;

    const endpoints = [
      { pt: targetPath.firstSegment.point, selfOffset: 0 },
      { pt: targetPath.lastSegment.point, selfOffset: totalLen }
    ];

    let curveStartOffset = 0;
    curves.forEach((curve) => {
      const curveLen = curve.length;
      const curveEndOffset = curveStartOffset + curveLen;

      if (curveLen > 1e-6) {
        endpoints.forEach(({ pt, selfOffset }) => {
          const touchesStart = Math.abs(selfOffset - curveStartOffset) < 1e-6;
          const touchesEnd = Math.abs(selfOffset - curveEndOffset) < 1e-6;

          if (touchesStart || touchesEnd) {
            if (curve.isLinear() || curveLen <= minSep * 2) return;

            const tStart = touchesStart ? curve.getTimeAt(minSep) : 0;
            const tEnd = touchesEnd ? curve.getTimeAt(curveLen - minSep) : 1;
            if (tStart == null || tEnd == null || tEnd - tStart <= 1e-5) return;

            const subCurve = curve.getPart(tStart, tEnd);
            const loc = subCurve?.getNearestLocation(pt);
            if (!loc || loc.point.getDistance(pt) > tol) return;

            const subTime = loc.time ?? loc.parameter;
            const origTime = tStart + subTime * (tEnd - tStart);
            const pathOffset = curveStartOffset + curve.getOffsetAt(origTime);
            if (Math.abs(pathOffset - selfOffset) <= minSep) return;

            rawCuts.push({
              offset: pathOffset,
              point: pt.clone(),
              boundary: targetPath
            });
            return;
          }

          const loc = curve.getNearestLocation(pt);
          if (!loc || loc.point.getDistance(pt) > tol) return;
          if (Math.abs(loc.offset - selfOffset) <= minSep) return;

          rawCuts.push({
            offset: loc.offset,
            point: pt.clone(),
            boundary: targetPath
          });
        });
      }

      curveStartOffset = curveEndOffset;
    });
  }

  _resolveExactCutPoint(cut, targetPath) {
    if (!cut || !cut.point) return null;
    if (cut.boundary && cut.boundary !== targetPath && typeof cut.boundary.getNearestPoint === 'function') {
      const snapped = cut.boundary.getNearestPoint(cut.point);
      if (snapped && snapped.getDistance(cut.point) < 0.05) {
        return snapped.clone();
      }
    }
    return cut.point.clone();
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