/**
 * tools/point/DivisionSelectionHandler.js - Selección por clic/recuadro y marcadores de inicio para División
 */

import { CAD_THEME } from '../../config/cadTheme.js';

export class DivisionSelectionHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;

    this.isSelectingBox = false;
    this.boxStartPoint = null;
    this.selectionBoxPath = null;

    this.targetEntities = [];
    this.customStartPoints = new Map();
    this.startPointMarkersGroup = null;
  }

  _getHudLayer() {
    return this.utils.hudLayer || paper.project?.layers?.find((l) => l.name === 'hudLayer') || null;
  }

  _isEntitySelectable(entity) {
    if (!entity || entity.data?.isPointEntity || entity.visible === false) {
      return false;
    }

    const layerId = String(entity.data?.layerId || '0');
    const layer = this.utils.layerManager?.layers?.get(layerId);
    if (layer && (layer.locked || layer.visible === false)) {
      return false;
    }

    return true;
  }

  getTargets() {
    if (this.utils.divisionStep === 'start_point') {
      return (this.targetEntities || []).filter(
        (ent) => ent && ent.parent && this._isEntitySelectable(ent)
      );
    }
    return this.getSelectedTargets();
  }

  beginStartPointStep() {
    this.syncTargetsCache();
    this.utils.divisionStep = 'start_point';
    this.customStartPoints.clear();

    this.service.deselectAllEntities();
    this.service.editingEntities = [];
    this.service.deselectAllSegments();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();

    this.renderStartPointMarkers();
  }

  _resolveSelectedPointStyle() {
    const zoom = paper?.view?.zoom || 1;
    const nodeTheme = (typeof CAD_THEME !== 'undefined' && CAD_THEME?.node) ? CAD_THEME.node : {};
    const nodeSelectionTheme = (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.node)
      ? CAD_THEME.selection.node
      : {};

    const radiusPx = nodeSelectionTheme.selectedRadiusPx || nodeTheme.selectedRadiusPx || 4.0;
    const strokeWidthPx = nodeSelectionTheme.selectedWidthPx || nodeTheme.selectedStrokeWidthPx || 2.0;
    const fillColor = nodeSelectionTheme.fillColor
      || nodeTheme.defaultFillColor
      || CAD_THEME?.canvas?.backgroundColor
      || '#10141D';
    const strokeColor = nodeSelectionTheme.strokeColor || '#ffff00';

    return {
      radius: radiusPx / zoom,
      fillColor,
      strokeColor,
      strokeWidth: strokeWidthPx / zoom
    };
  }

  getSelectedTargets() {
    return (this.service.selectedEntities || []).filter((ent) => this._isEntitySelectable(ent));
  }

  syncTargetsCache() {
    const targets = this.getSelectedTargets();
    this.targetEntities = [...targets];
    this.utils.divisionSelectedEntities = [...targets];
    return this.targetEntities;
  }

  toggleEntitySelection(entity) {
    if (!this._isEntitySelectable(entity)) return false;

    const isSelected = this.service.selectedEntities.includes(entity);
    if (isSelected) {
      this.service.deselectEntity(entity);
    } else {
      this.service.selectEntity(entity, true);
    }

    this.service.editingEntities = [];
    this.service.deselectAllSegments();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    if (paper?.view) paper.view.update();

    this.syncTargetsCache();
    return true;
  }

  startBox(point) {
    this.isSelectingBox = true;
    this.boxStartPoint = point.clone();
  }

  updateBox(currPt) {
    if (!this.isSelectingBox || !this.boxStartPoint) return;

    if (this.selectionBoxPath) {
      this.selectionBoxPath.remove();
      this.selectionBoxPath = null;
    }

    const isWindowSelection = currPt.x >= this.boxStartPoint.x;

    this.selectionBoxPath = new paper.Path.Rectangle({
      from: this.boxStartPoint,
      to: currPt,
      strokeColor: '#008800',
      fillColor: new paper.Color(0, 0.53, 0, 0.15),
      strokeWidth: 1 / paper.view.zoom,
      dashArray: isWindowSelection ? null : [2 / paper.view.zoom, 2 / paper.view.zoom],
      insert: false
    });
    this.selectionBoxPath.guide = true;

    const hudLayer = this._getHudLayer();
    if (hudLayer) {
      hudLayer.addChild(this.selectionBoxPath);
    } else if (paper.project?.activeLayer) {
      paper.project.activeLayer.addChild(this.selectionBoxPath);
    }

    if (paper?.view) paper.view.update();
  }

  finishBox(endPt) {
    if (!this.isSelectingBox) return false;

    let selectedAny = false;

    if (this.selectionBoxPath && this.boxStartPoint) {
      const dragDistance = this.boxStartPoint.getDistance(endPt);

      if (dragDistance >= 3 / paper.view.zoom) {
        const boxBounds = this.selectionBoxPath.bounds;
        const isWindowSelection = endPt.x >= this.boxStartPoint.x;

        const candidates = (this.service.entities || []).filter(
          (ent) => this._isEntitySelectable(ent) && ent.bounds
        );

        candidates.forEach((entity) => {
          const shouldSelect = this._matchesSelectionBox(entity, boxBounds, isWindowSelection);
          if (shouldSelect && !this.service.selectedEntities.includes(entity)) {
            this.service.selectEntity(entity, true);
            selectedAny = true;
          }
        });

        this.service.editingEntities = [];
        this.service.deselectAllSegments();
        this.utils.selectionRenderEngine?.renderBezierHandles?.();
        this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
      }

      this.selectionBoxPath.remove();
      this.selectionBoxPath = null;
    }

    this.isSelectingBox = false;
    this.boxStartPoint = null;
    this.syncTargetsCache();

    if (paper?.view) paper.view.update();
    return selectedAny;
  }

  _matchesSelectionBox(entity, boxBounds, isWindowSelection) {
    if (entity instanceof paper.Path) {
      return this._isPathSelectedByBox(entity, boxBounds, isWindowSelection);
    }
    if (entity instanceof paper.CompoundPath && entity.children) {
      return entity.children.some((child) => this._isPathSelectedByBox(child, boxBounds, isWindowSelection));
    }
    return isWindowSelection
      ? boxBounds.contains(entity.bounds)
      : (boxBounds.contains(entity.bounds) || boxBounds.intersects(entity.bounds));
  }

  _isPathSelectedByBox(path, boxBounds, isWindowSelection) {
    if (!path || !path.bounds) return false;
    if (!boxBounds.intersects(path.bounds) && !boxBounds.contains(path.bounds)) return false;
    if (isWindowSelection) return boxBounds.contains(path.bounds);
    if (boxBounds.contains(path.bounds)) return true;

    const segments = path.segments || [];
    for (let i = 0; i < segments.length; i++) {
      if (boxBounds.contains(segments[i].point)) return true;
    }

    const curves = path.curves || [];
    for (let i = 0; i < curves.length; i++) {
      const c = curves[i];
      if (!boxBounds.intersects(c.bounds)) continue;

      const p0 = c.segment1.point;
      const p1 = c.segment2.point;
      const h1 = c.segment1.handleOut;
      const h2 = c.segment2.handleIn;

      if (h1.isZero() && h2.isZero()) {
        if (this._lineIntersectsBox(p0, p1, boxBounds)) return true;
      } else {
        const c1 = p0.add(h1);
        const c2 = p1.add(h2);
        let prevPt = p0;
        const steps = 4;

        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          const mt = 1 - t;
          const currPt = (k === steps)
            ? p1
            : p0.multiply(mt * mt * mt)
                .add(c1.multiply(3 * mt * mt * t))
                .add(c2.multiply(3 * mt * t * t))
                .add(p1.multiply(t * t * t));

          if (boxBounds.contains(currPt) || this._lineIntersectsBox(prevPt, currPt, boxBounds)) {
            return true;
          }
          prevPt = currPt;
        }
      }
    }

    return false;
  }

  _lineIntersectsBox(p1, p2, rect) {
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);

    if (maxX < rect.left || minX > rect.right || maxY < rect.top || minY > rect.bottom) return false;
    if (rect.contains(p1) || rect.contains(p2)) return true;

    const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    const intersectLines = (a, b, c, d) => (ccw(a, c, d) !== ccw(b, c, d)) && (ccw(a, b, c) !== ccw(a, b, d));

    return intersectLines(p1, p2, rect.topLeft, rect.topRight) ||
           intersectLines(p1, p2, rect.topRight, rect.bottomRight) ||
           intersectLines(p1, p2, rect.bottomRight, rect.bottomLeft) ||
           intersectLines(p1, p2, rect.bottomLeft, rect.topLeft);
  }

  renderStartPointMarkers() {
    this.clearStartPointMarkers();

    const targets = this.getTargets();
    const style = this._resolveSelectedPointStyle();

    this.startPointMarkersGroup = new paper.Group({ insert: false });
    this.startPointMarkersGroup.guide = true;

    targets.forEach((entity) => {
      let pt = this.customStartPoints.get(entity);
      if (!pt) {
        if (typeof entity.getPointAt === 'function') {
          pt = entity.getPointAt(0);
        } else if (entity.children?.[0]?.getPointAt) {
          pt = entity.children[0].getPointAt(0);
        }
      }

      if (pt) {
        const marker = new paper.Path.Circle({
          center: pt,
          radius: style.radius,
          fillColor: style.fillColor,
          strokeColor: style.strokeColor,
          strokeWidth: style.strokeWidth,
          insert: false
        });
        marker.guide = true;
        this.startPointMarkersGroup.addChild(marker);
      }
    });

    const hudLayer = this._getHudLayer();
    if (hudLayer) {
      hudLayer.addChild(this.startPointMarkersGroup);
    } else if (paper.project?.activeLayer) {
      paper.project.activeLayer.addChild(this.startPointMarkersGroup);
    }

    if (paper?.view) paper.view.update();
  }

  clearStartPointMarkers() {
    if (this.startPointMarkersGroup) {
      this.startPointMarkersGroup.remove();
      this.startPointMarkersGroup = null;
    }
  }

  reset() {
    if (this.selectionBoxPath) {
      this.selectionBoxPath.remove();
      this.selectionBoxPath = null;
    }
    this.clearStartPointMarkers();
    this.customStartPoints.clear();
    this.targetEntities = [];
    this.isSelectingBox = false;
    this.boxStartPoint = null;
    this.utils.divisionSelectedEntities = [];
  }
}