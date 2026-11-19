/**
 * services/renderers/SelectionRenderEngine.js - Renderizado visual de tiradores Bézier, grips paramétricos y grosores dinámicos
 */
import { CAD_THEME } from '../../config/cadTheme.js';
import { BezierHandlesRenderer } from './BezierHandlesRenderer.js';
import { ParametricGripRenderer } from './ParametricGripRenderer.js';

export class SelectionRenderEngine {
  constructor(cadService) {
    this._cadService = cadService;
    this.controlHandlesGroup = null;
    this.bezierHandlesRenderer = new BezierHandlesRenderer();
    this.parametricGripRenderer = new ParametricGripRenderer();
  }

  // Getter dinámico para evitar que `service` quede undefined si cadService se instancia después
  get service() {
    return this._cadService || window.cadService;
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

  updatePointEntitiesScale() {
    if (!paper || !paper.view) return;
    const zoom = paper.view.zoom;
    const pointsLayer = this._getOrCreatePointsLayer();

    const nodeTheme = (typeof CAD_THEME !== 'undefined' && CAD_THEME?.node) ? CAD_THEME.node : {};
    const nodeSelectionTheme = (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.node) ? CAD_THEME.selection.node : {};

    const entities = this.service?.entities || [];
    const hoveredPoints = [];
    const selectedPoints = [];

    entities.forEach(ent => {
      if (ent && ent.data && ent.data.isPointEntity && ent.bounds) {
        if (pointsLayer && ent.parent !== pointsLayer) {
          pointsLayer.addChild(ent);
        }

        const isSelected = Boolean(this.service.selectedEntities?.includes(ent));
        const isHovered = this.service.hoveredEntity === ent;

        let radiusPx = isSelected 
          ? (nodeSelectionTheme.selectedRadiusPx || nodeTheme.selectedRadiusPx || 4.0) 
          : (nodeSelectionTheme.normalRadiusPx || nodeTheme.normalRadiusPx || 3.5);

        if (isHovered && !isSelected) {
          radiusPx += 0.5;
        }

        const targetRadius = radiusPx / zoom;
        const center = ent.position.clone();
        ent.bounds.width = targetRadius * 2;
        ent.bounds.height = targetRadius * 2;
        ent.position = center;

        let strokeWidthPx = isSelected 
          ? (nodeSelectionTheme.selectedWidthPx || nodeTheme.selectedStrokeWidthPx || 2.0) 
          : (nodeSelectionTheme.normalWidthPx || nodeTheme.strokeWidthPx || 1.0);

        if (isHovered && !isSelected) {
          strokeWidthPx *= 1.5;
        }

        ent.strokeWidth = strokeWidthPx / zoom;

        if (isSelected) {
          selectedPoints.push(ent);
        } else if (isHovered) {
          hoveredPoints.push(ent);
        }
      }
    });

    hoveredPoints.forEach(ent => ent.bringToFront());
    selectedPoints.forEach(ent => ent.bringToFront());

    if (paper.view) paper.view.update();
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
    if (!paper || !paper.view) return;
    if (this.service?.utils?.canvasViewportManager) {
      this.service.utils.canvasViewportManager.previousViewState = null;
    }

    const zoom = paper.view.zoom;

    const cadUtils = window.cadUtils;
    const layerManager = this.service?.layerManager || this.service?.utils?.layerManager || cadUtils?.layerManager;
    const propertyManager = cadUtils?.propertyManager;
    const activePath = cadUtils?.activePath;

    const entitiesToUpdate = [...(this.service?.entities || [])];
    if (activePath) {
      entitiesToUpdate.push(activePath);
    }

    entitiesToUpdate.forEach(ent => {
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
        const nodeTheme = (typeof CAD_THEME !== 'undefined' && CAD_THEME?.node) ? CAD_THEME.node : {};
        const nodeSelectionTheme = (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.node) ? CAD_THEME.selection.node : {};
        
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

        const strokeColorObj = new paper.Color(strokeHex);
        strokeColorObj.alpha = isSelected ? 1.0 : resolvedOpacity;
        ent.strokeColor = strokeColorObj;
        return;
      }

      // RASTERS / IMÁGENES
      if (ent instanceof paper.Raster) {
        const isByLayer = ent.data?.opacityByLayer !== false;
        const resolvedOpacity = (isByLayer && layer && layer.opacity !== undefined)
          ? layer.opacity
          : (ent.data?.baseOpacity ?? ent.data?.origOpacity ?? ent.opacity ?? 1.0);

        ent.opacity = resolvedOpacity;
        ent.data.baseOpacity = resolvedOpacity;
        return;
      }

      // LÍNEAS Y GEOMETRÍAS
      if (ent instanceof paper.Path || ent instanceof paper.CompoundPath) {
        if (ent instanceof paper.Path) {
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
            const fillCol = new paper.Color(ent.fillColor);
            fillCol.alpha = resolvedOpacity;
            ent.fillColor = fillCol;
          }
        } else {
          ent.opacity = resolvedOpacity;
          ent.strokeColor = effectiveColor;
          if (ent.fillColor) {
            const fillCol = new paper.Color(ent.fillColor);
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
  }

  renderBezierHandles() {
    if (this.controlHandlesGroup) this.controlHandlesGroup.remove();
    this.controlHandlesGroup = new paper.Group({ insert: false });

    const cadUtils = this.service?.utils || window.cadUtils || {};
    const nodesLayer = cadUtils.nodesLayer || paper.project?.layers.find((l) => l.name === 'nodesLayer');
    if (nodesLayer) {
      nodesLayer.addChild(this.controlHandlesGroup);
    } else if (paper.project?.activeLayer) {
      paper.project.activeLayer.addChild(this.controlHandlesGroup);
    }

    if (window.cadUtils) {
      window.cadUtils.controlHandlesGroup = this.controlHandlesGroup;
    }

    const service = this.service;
    if (!service) return;

    const layerManager = service.layerManager || service.utils?.layerManager || cadUtils.layerManager;
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

    const zoom = paper.view.zoom;
    const cfg = (typeof CAD_THEME !== 'undefined' && CAD_THEME?.handles) ? CAD_THEME.handles : {};
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

    selectableEntities.forEach((entity) => {
      if (entity.visible && entity.data?.controller) {
        this.parametricGripRenderer.render(entity, this.controlHandlesGroup, {
          zoom,
          cfg,
          propertyManager,
          hoveredParametricGrip,
          activeParametricGrip
        });
      }
    });

    this._getOrCreatePointsLayer();
  }
}