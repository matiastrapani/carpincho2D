/**
 * tools/select/BoxSelectHandler.js - Gestor de Selección por Cuadro Elástico (Window vs Crossing)
 */

export class BoxSelectHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.selectionStartPoint = null;
    this.selectionBoxRect = null;
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  _getHudLayer() {
    const paperInst = this._getPaper();
    return this.utils?.hudLayer || paperInst?.project?.layers?.find((l) => l.name === 'hudLayer') || null;
  }

  _createBoxRect(fromPt, toPt, isWindowSelection = true) {
    const paperInst = this._getPaper();
    const hudLayer = this._getHudLayer();
    if (!paperInst || !hudLayer) return null;

    const zoom = paperInst.view?.zoom || 1;
    const minX = Math.min(fromPt.x, toPt.x);
    const maxX = Math.max(fromPt.x, toPt.x);
    const minY = Math.min(fromPt.y, toPt.y);
    const maxY = Math.max(fromPt.y, toPt.y);

    const rect = new paperInst.Path({
      segments: [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY]
      ],
      closed: true,
      strokeWidth: 1 / zoom,
      strokeColor: '#008800',
      dashArray: isWindowSelection ? [] : [2 / zoom, 2 / zoom],
      fillColor: new paperInst.Color(0, 0.53, 0, 0.15),
      insert: false,
      guide: true,
      data: { isAuxiliary: true }
    });

    hudLayer.addChild(rect);
    return rect;
  }

  _syncBoxRectGeometry(fromPt, toPt, isWindowSelection = true) {
    const paperInst = this._getPaper();
    if (!paperInst || !this.selectionBoxRect) return;

    const zoom = paperInst.view?.zoom || 1;
    const minX = Math.min(fromPt.x, toPt.x);
    const maxX = Math.max(fromPt.x, toPt.x);
    const minY = Math.min(fromPt.y, toPt.y);
    const maxY = Math.max(fromPt.y, toPt.y);

    const segs = this.selectionBoxRect.segments;
    if (segs && segs.length === 4) {
      segs[0].point.set(minX, minY);
      segs[1].point.set(maxX, minY);
      segs[2].point.set(maxX, maxY);
      segs[3].point.set(minX, maxY);
    }

    this.selectionBoxRect.strokeWidth = 1 / zoom;
    this.selectionBoxRect.dashArray = isWindowSelection ? [] : [2 / zoom, 2 / zoom];
  }

  startBox(point) {
    this.selectionStartPoint = point.clone();
    if (!this.selectionBoxRect) {
      this.selectionBoxRect = this._createBoxRect(this.selectionStartPoint, point, true);
    } else {
      this._syncBoxRectGeometry(this.selectionStartPoint, point, true);
    }
  }

  updateBox(currentPoint) {
    if (!this.selectionStartPoint) return;

    const startPt = this.selectionStartPoint;
    const isWindowSelection = currentPoint.x >= startPt.x;

    if (!this.selectionBoxRect) {
      this.selectionBoxRect = this._createBoxRect(startPt, currentPoint, isWindowSelection);
    } else {
      this._syncBoxRectGeometry(startPt, currentPoint, isWindowSelection);
    }
  }

  getEntitiesInBox(boxBounds, isWindowSelection, filterFn = null) {
    const paperInst = this._getPaper();
    const layerManager = this.utils?.layerManager;
    const entities = this.service.entities || [];
    const matched = [];

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (!entity || !entity.bounds || entity.visible === false) continue;

      if (layerManager && !layerManager.isEntityInteractive(entity)) continue;
      if (!layerManager && (entity.data?.isHidden || entity.data?.isLocked)) continue;

      if (typeof filterFn === 'function' && !filterFn(entity)) continue;

      let shouldSelect = false;

      if (this._checkIsPoint(entity)) {
        shouldSelect = boxBounds.contains(entity.position || entity.bounds.center);
      } else if (paperInst && entity instanceof paperInst.Path) {
        shouldSelect = this._isPathSelectedByBox(entity, boxBounds, isWindowSelection);
      } else if (paperInst && entity instanceof paperInst.CompoundPath) {
        if (entity.children) {
          shouldSelect = entity.children.some((child) => this._isPathSelectedByBox(child, boxBounds, isWindowSelection));
        }
      } else {
        shouldSelect = isWindowSelection
          ? boxBounds.contains(entity.bounds)
          : (boxBounds.contains(entity.bounds) || boxBounds.intersects(entity.bounds));
      }

      if (shouldSelect) {
        matched.push(entity);
      }
    }

    return matched;
  }

  finishBox(endPoint, isShift = false, { additive = false } = {}) {
    if (!this.selectionBoxRect || !this.selectionStartPoint) {
      this.clean();
      return;
    }

    const paperInst = this._getPaper();
    const zoom = paperInst?.view?.zoom || 1;
    const startPt = this.selectionStartPoint;
    const dragDistance = startPt.getDistance(endPoint);
    const hasEditingEntities = this.service.editingEntities.length > 0;
    const isAdditiveObjectMode = Boolean(additive) && !hasEditingEntities;

    // Clic simple en canvas (sin arrastre)
    if (dragDistance < 3 / zoom) {
      if (!isAdditiveObjectMode && !isShift) {
        this.service.deselectAllEntities();
        this.service.deselectAllSegments();
      }
      this.clean();
      return;
    }

    const boxBounds = this.selectionBoxRect.bounds;
    const isWindowSelection = endPoint.x >= startPt.x;

    // A. CUADRO EN MODO EDICIÓN DE NODOS (siempre selección convencional)
    if (hasEditingEntities) {
      const segmentsToSelect = [];
      const seenSegments = new Set(isShift ? this.service.selectedSegments : []);

      this.service.editingEntities.forEach((entity) => {
        if (paperInst && entity instanceof paperInst.Path && entity.segments && !entity.data?.isPointEntity) {
          if (entity.bounds && !boxBounds.intersects(entity.bounds)) return;

          entity.segments.forEach((seg) => {
            if (boxBounds.contains(seg.point) && !seenSegments.has(seg)) {
              seenSegments.add(seg);
              segmentsToSelect.push(seg);
            }
          });

          if (!isWindowSelection && entity.curves) {
            entity.curves.forEach((curve) => {
              if (this._curveIntersectsBox(curve, boxBounds)) {
                if (curve.segment1 && !seenSegments.has(curve.segment1)) {
                  seenSegments.add(curve.segment1);
                  segmentsToSelect.push(curve.segment1);
                }
                if (curve.segment2 && !seenSegments.has(curve.segment2)) {
                  seenSegments.add(curve.segment2);
                  segmentsToSelect.push(curve.segment2);
                }
              }
            });
          }
        }
      });

      this.service.selectionManager.selectSegments(segmentsToSelect, isShift);
    }

    // B. CUADRO EN MODO SELECCIÓN DE OBJETOS (aditivo/sustractivo dentro de herramientas)
    if (!hasEditingEntities) {
      const entitiesToSelect = this.getEntitiesInBox(boxBounds, isWindowSelection);

      if (isAdditiveObjectMode && isShift) {
        this.service.selectionManager.deselectEntities(entitiesToSelect);
      } else {
        this.service.selectionManager.selectEntities(entitiesToSelect, isAdditiveObjectMode || isShift);
      }
    }

    this.clean();
  }

  consumeBoxRect(endPoint, minDragPx = 3) {
    if (!this.selectionBoxRect || !this.selectionStartPoint || !endPoint) {
      this.clean();
      return null;
    }

    const paperInst = this._getPaper();
    const zoom = paperInst?.view?.zoom || 1;
    const dragDistance = this.selectionStartPoint.getDistance(endPoint);

    let result = null;
    if (dragDistance >= minDragPx / zoom) {
      result = {
        boxBounds: this.selectionBoxRect.bounds.clone(),
        isWindowSelection: endPoint.x >= this.selectionStartPoint.x
      };
    }

    this.clean();
    paperInst?.view?.update?.();
    return result;
  }

  clean() {
    if (this.selectionBoxRect) {
      this.selectionBoxRect.remove();
      this.selectionBoxRect = null;
    }
    this.selectionStartPoint = null;
  }

  // --- MÉTODOS AUXILIARES DE CÁLCULO ESPACIAL ---

  _checkIsPoint(ent) {
    return !!(ent.data?.isPointEntity || ent.data?.isPoint || ent.parent?.data?.isPointEntity);
  }

  _isPathSelectedByBox(path, boxBounds, isWindowSelection) {
    if (!path || !path.bounds) return false;

    if (!boxBounds.intersects(path.bounds) && !boxBounds.contains(path.bounds)) {
      return false;
    }

    if (isWindowSelection) {
      return boxBounds.contains(path.bounds);
    }

    if (boxBounds.contains(path.bounds)) return true;

    const segments = path.segments || [];
    for (let i = 0; i < segments.length; i++) {
      if (boxBounds.contains(segments[i].point)) return true;
    }

    const curves = path.curves || [];
    for (let i = 0; i < curves.length; i++) {
      if (this._curveIntersectsBox(curves[i], boxBounds)) return true;
    }
    return false;
  }

  _curveIntersectsBox(c, boxBounds) {
    if (!c || !boxBounds) return false;
    if (c.bounds && !boxBounds.intersects(c.bounds)) return false;

    const p0 = c.segment1.point;
    const p1 = c.segment2.point;

    if (boxBounds.contains(p0) || boxBounds.contains(p1)) return true;

    const h1 = c.segment1.handleOut;
    const h2 = c.segment2.handleIn;

    if (h1.isZero() && h2.isZero()) {
      return this._lineIntersectsBox(p0, p1, boxBounds);
    } else {
      const c1 = p0.add(h1);
      const c2 = p1.add(h2);

      const getBezierPt = (t) => {
        const mt = 1 - t;
        return p0.multiply(mt * mt * mt)
          .add(c1.multiply(3 * mt * mt * t))
          .add(c2.multiply(3 * mt * t * t))
          .add(p1.multiply(t * t * t));
      };

      let prevPt = p0;
      const steps = 4;
      for (let k = 1; k <= steps; k++) {
        const currPt = (k === steps) ? p1 : getBezierPt(k / steps);
        if (boxBounds.contains(currPt) || this._lineIntersectsBox(prevPt, currPt, boxBounds)) {
          return true;
        }
        prevPt = currPt;
      }
    }
    return false;
  }

  _lineIntersectsBox(p1, p2, rect) {
    const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
    if (maxX < rect.left || minX > rect.right || maxY < rect.top || minY > rect.bottom) return false;
    if (rect.contains(p1) || rect.contains(p2)) return true;

    const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    const intersectLines = (a, b, c, d) => (ccw(a, c, d) !== ccw(b, c, d)) && (ccw(a, b, c) !== ccw(a, b, d));

    return intersectLines(p1, p2, rect.topLeft, rect.topRight) ||
           intersectLines(p1, p2, rect.topRight, rect.bottomRight) ||
           intersectLines(p1, p2, rect.bottomRight, rect.bottomLeft) ||
           intersectLines(p1, p2, rect.bottomLeft, rect.topLeft);
  }
}