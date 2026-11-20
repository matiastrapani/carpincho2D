/**
 * services/renderers/SelectionRenderEngine.js - Renderizado visual de tiradores Bézier, grips paramétricos y grosores dinámicos
 */
import { CAD_THEME } from '../../config/cadTheme.js';
import { BezierHandlesRenderer } from './BezierHandlesRenderer.js';
import { ParametricGripRenderer } from './ParametricGripRenderer.js';
import { PointLayerRenderer } from './PointLayerRenderer.js';

export class SelectionRenderEngine {
  constructor(cadService, cadUtils = null) {
    this._cadService = cadService;
    this._cadUtils = cadUtils;
    this.controlHandlesGroup = null;
    this.bezierHandlesRenderer = new BezierHandlesRenderer();
    this.parametricGripRenderer = new ParametricGripRenderer();
    this.pointLayerRenderer = new PointLayerRenderer(cadService, cadUtils);
    this._lastHoveredParametric = null;
  }

  get service() {
    return this._cadService;
  }

  _getOrCreatePointsLayer() {
    if (!paper || !paper.project) return null;

    const cadUtils = this.service?.utils || window.cadUtils;
    const viewportManager = cadUtils?.viewportManager;

    let pointsLayer = viewportManager?.pointsLayer
      || paper.project.layers.find((l) => l.name === 'pointsLayer');

    if (!pointsLayer) {
      const prevActive = paper.project.activeLayer;
      pointsLayer = new paper.Layer();
      pointsLayer.name = 'pointsLayer';
      if (prevActive && prevActive !== pointsLayer) {
        prevActive.activate();
      }
    }

    if (viewportManager && !viewportManager.pointsLayer) {
      viewportManager.pointsLayer = pointsLayer;
    }

    const drawLayer = viewportManager?.drawLayer || paper.project.layers.find((l) => l.name === 'drawLayer');
    const nodesLayer = viewportManager?.nodesLayer || paper.project.layers.find((l) => l.name === 'nodesLayer');
    const hudLayer = viewportManager?.hudLayer || paper.project.layers.find((l) => l.name === 'hudLayer');

    if (drawLayer) drawLayer.sendToBack();
    if (nodesLayer && drawLayer) nodesLayer.insertAbove(drawLayer);
    if (nodesLayer) {
      pointsLayer.insertAbove(nodesLayer);
    } else if (drawLayer) {
      pointsLayer.insertAbove(drawLayer);
    }
    if (hudLayer) hudLayer.bringToFront();

    return pointsLayer;
  }

  get utils() {
    return this._cadUtils || this.service?.utils || null;
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  updatePointEntitiesScale() {
    this.pointLayerRenderer.updatePointEntitiesScale();
  }

  _getSelectionStyleConfig(entity) {
    if (typeof CAD_THEME === 'undefined' || !CAD_THEME?.selection) return {};
    return entity?.data?.isCircleEntity
      ? (CAD_THEME.selection.circle || {})
      : (CAD_THEME.selection.line || {});
  }

  _getSelectionMultiplier(entity) {
    return this._getSelectionStyleConfig(entity).widthMultiplier || 1.5;
  }

  _getResolvedStrokeWidth(entity, mult = 1, zoom = 1) {
    const propertyManager = this.service?.utils?.propertyManager || window.cadUtils?.propertyManager;
    const effectiveBaseWidth = propertyManager
      ? propertyManager.getResolvedStrokeWidth(entity)
      : (entity?.data?.baseStrokeWidth !== undefined ? entity.data.baseStrokeWidth : 0);

    return effectiveBaseWidth === 0 ? (1 * mult) / zoom : effectiveBaseWidth * mult;
  }

  _filterUnlockedEntities(entities, layerManager) {
    return (entities || []).filter((ent) => {
      if (!ent || !ent.parent) return false;
      const lId = String(ent.data?.layerId || '0');
      const layer = layerManager?.layers?.get(lId);
      return !layer || !layer.locked;
    });
  }

  updateEntitiesStroke() {
    const paperInst = this._getPaper();
    if (!paperInst || !paperInst.view) return;

    const cadUtils = this.utils;
    if (cadUtils?.canvasViewportManager) {
      cadUtils.canvasViewportManager.previousViewState = null;
    }

    const zoom = paperInst.view.zoom;
    const layerManager = this.service?.layerManager || cadUtils?.layerManager;
    const propertyManager = cadUtils?.propertyManager;
    const activePath = cadUtils?.activePath;

    const entitiesToUpdate = [...(this.service?.entities || [])];
    if (activePath) {
      entitiesToUpdate.push(activePath);
    }

    entitiesToUpdate.forEach((ent) => {
      if (!ent) return;
      if (!ent.data) ent.data = {};

      const layerId = ent.data?.layerId || '0';
      const layer = layerManager?.layers?.get(String(layerId));
      const isLayerVisible = layer ? (layer.visible !== false) : true;
      const isLayerLocked = layer ? (layer.locked === true) : false;

      ent.visible = isLayerVisible;
      if (!isLayerVisible) return;

      const layerOpacity = (layer && layer.opacity !== undefined) ? layer.opacity : 1.0;
      const resolvedOpacity = ent.data.opacityByLayer !== false
        ? layerOpacity
        : (ent.data.origOpacity !== undefined ? ent.data.origOpacity : (ent.opacity ?? 1.0));

      const isEditing = Boolean(this.service?.editingEntities?.includes(ent));
      const isSelected = !isLayerLocked && Boolean(this.service?.selectedEntities?.includes(ent));
      const isHovered = !isLayerLocked && !isEditing && (this.service?.hoveredEntity === ent);

      // NODOS / PUNTOS
      if (ent.data.isPointEntity) {
        const nodeTheme = CAD_THEME?.node || {};
        const nodeSelectionTheme = CAD_THEME?.selection?.node || {};

        ent.opacity = 1.0;
        ent.fillColor = isSelected
          ? (nodeSelectionTheme.fillColor || nodeTheme.defaultFillColor || '#10141D')
          : (ent.data.origFillColor || nodeTheme.defaultFillColor || '#10141D');

        const resolvedPointColor = propertyManager
          ? propertyManager.getResolvedColor(ent)
          : (ent.data.origStrokeColor || nodeTheme.defaultStrokeColor || '#18fcf1');

        const strokeHex = isSelected
          ? (nodeSelectionTheme.strokeColor || '#ffff00')
          : resolvedPointColor;

        const strokeColorObj = new paperInst.Color(strokeHex);
        strokeColorObj.alpha = isSelected ? 1.0 : resolvedOpacity;
        ent.strokeColor = strokeColorObj;
        return;
      }

      // RASTERS / IMÁGENES
      if (ent instanceof paperInst.Raster) {
        const isByLayer = ent.data?.opacityByLayer !== false;
        const rasterOpacity = (isByLayer && layer && layer.opacity !== undefined)
          ? layer.opacity
          : (ent.data?.baseOpacity ?? ent.data?.origOpacity ?? ent.opacity ?? 1.0);

        ent.opacity = rasterOpacity;
        ent.data.baseOpacity = rasterOpacity;
        return;
      }

      // LÍNEAS Y GEOMETRÍAS
      if (ent instanceof paperInst.Path || ent instanceof paperInst.CompoundPath) {
        if (ent instanceof paperInst.Path) {
          ent.strokeJoin = 'miter';
          ent.miterLimit = 3;
        }

        if (ent.data.origFillColor !== undefined) {
          ent.fillColor = ent.data.origFillColor;
        }

        const styleConfig = this._getSelectionStyleConfig(ent);

        const effectiveColor = propertyManager
          ? propertyManager.getResolvedColor(ent)
          : (ent.data.origStrokeColor || '#00e5ff');

        if (isSelected) {
          ent.opacity = 1.0;
          ent.strokeColor = styleConfig.strokeColor || '#ffff00';
          if (ent.fillColor) {
            const fillCol = new paperInst.Color(ent.fillColor);
            fillCol.alpha = resolvedOpacity;
            ent.fillColor = fillCol;
          }
        } else {
          ent.opacity = resolvedOpacity;
          ent.strokeColor = effectiveColor;
          if (ent.fillColor) {
            const fillCol = new paperInst.Color(ent.fillColor);
            fillCol.alpha = 1.0;
            ent.fillColor = fillCol;
          }
        }

        const highlightMult = this._getSelectionMultiplier(ent);
        const mult = (isSelected || isHovered) ? highlightMult : 1;
        ent.strokeWidth = this._getResolvedStrokeWidth(ent, mult, zoom);
      }
    });

    this.updatePointEntitiesScale();

    const currentHoveredParametric = (this.service?.hoveredEntity?.data?.controller)
      ? this.service.hoveredEntity
      : null;
    if (this._lastHoveredParametric !== currentHoveredParametric) {
      this._lastHoveredParametric = currentHoveredParametric;
      this.renderBezierHandles();
    }
  }

  renderBezierHandles() {
    const paperInst = this._getPaper();
    if (!paperInst) return;

    if (this.controlHandlesGroup) this.controlHandlesGroup.remove();
    this.controlHandlesGroup = new paperInst.Group({ insert: false });

    const cadUtils = this.utils || {};
    const nodesLayer = cadUtils.nodesLayer || paperInst.project?.layers.find((l) => l.name === 'nodesLayer');
    if (nodesLayer) {
      nodesLayer.addChild(this.controlHandlesGroup);
    } else if (paperInst.project?.activeLayer) {
      paperInst.project.activeLayer.addChild(this.controlHandlesGroup);
    }

    const service = this.service;
    if (!service) return;

    const layerManager = service.layerManager || cadUtils.layerManager;
    const propertyManager = cadUtils.propertyManager;
    const hoveredCurve = cadUtils.hoveredCurve;
    const hoveredHandle = cadUtils.hoveredHandle;
    const hoveredParametricGrip = cadUtils.hoveredParametricGrip;
    const activeParametricGrip = cadUtils.activeParametricGrip;

    if (service.editingEntities && service.editingEntities.length > 0) {
      service.editingEntities = service.editingEntities.filter(
        (ent) => ent && ent.parent && service.entities?.includes(ent)
      );

      if (service.editingEntities.length === 0) {
        if (typeof service.deselectAllSegments === 'function') service.deselectAllSegments();
        else service.selectedSegments = [];

        if (typeof service.deselectAllCurves === 'function') service.deselectAllCurves();
        else if (Array.isArray(service.selectedCurves)) service.selectedCurves = [];

        if (typeof service.deselectAllHandles === 'function') service.deselectAllHandles();
        else service.selectedHandles = [];
      }
    }

    const zoom = paperInst.view?.zoom || 1;
    const cfg = CAD_THEME?.handles || {};
    const activeEntities = this._filterUnlockedEntities(service.editingEntities, layerManager);
    const selectableEntities = this._filterUnlockedEntities(service.selectedEntities, layerManager);

    const styleHelpers = {
      getSelectionStyleConfig: (ent) => this._getSelectionStyleConfig(ent),
      getSelectionMultiplier: (ent) => this._getSelectionMultiplier(ent),
      getResolvedStrokeWidth: (ent, mult, z) => this._getResolvedStrokeWidth(ent, mult, z)
    };

    this.bezierHandlesRenderer.renderEditingEntities(activeEntities, this.controlHandlesGroup, {
      service,
      zoom,
      cfg,
      propertyManager,
      hoveredCurve,
      hoveredHandle,
      ...styleHelpers
    });

    this.bezierHandlesRenderer.renderSelectionOverlays(
      selectableEntities,
      activeEntities,
      this.controlHandlesGroup,
      { zoom, ...styleHelpers }
    );

    const renderedParametric = new Set();

    activeEntities.forEach((entity) => {
      if (entity.visible && entity.data?.controller) {
        renderedParametric.add(entity);
        this.parametricGripRenderer.render(entity, this.controlHandlesGroup, {
          paper: paperInst,
          zoom,
          cfg,
          propertyManager,
          hoveredParametricGrip,
          activeParametricGrip,
          showCornerGrips: true,
          showCenterGrip: true,
          forceActiveHighlight: selectableEntities.includes(entity)
        });
      }
    });

    selectableEntities.forEach((entity) => {
      if (entity.visible && entity.data?.controller && !renderedParametric.has(entity)) {
        renderedParametric.add(entity);
        this.parametricGripRenderer.render(entity, this.controlHandlesGroup, {
          paper: paperInst,
          zoom,
          cfg,
          propertyManager,
          hoveredParametricGrip,
          activeParametricGrip,
          showCornerGrips: false,
          showCenterGrip: true,
          forceActiveHighlight: true
        });
      }
    });

    const hoveredEntity = service.hoveredEntity;
    this._lastHoveredParametric = (hoveredEntity?.data?.controller) ? hoveredEntity : null;

    if (hoveredEntity && hoveredEntity.visible && hoveredEntity.data?.controller && !renderedParametric.has(hoveredEntity)) {
      const unlockedHovered = this._filterUnlockedEntities([hoveredEntity], layerManager);
      if (unlockedHovered.length > 0) {
        this.parametricGripRenderer.render(hoveredEntity, this.controlHandlesGroup, {
          paper: paperInst,
          zoom,
          cfg,
          propertyManager,
          hoveredParametricGrip,
          activeParametricGrip,
          showCornerGrips: false,
          showCenterGrip: false,
          forceActiveHighlight: false
        });
      }
    }

    this.pointLayerRenderer.ensurePointsLayer();
  }
}