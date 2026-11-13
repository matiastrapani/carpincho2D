/**
 * services/renderers/SelectionRenderEngine.js - Renderizado visual de tiradores Bézier, grips paramétricos y grosores dinámicos
 */
import { CAD_THEME } from '../../config/cadTheme.js';

export class SelectionRenderEngine {
  constructor(cadService) {
    this._cadService = cadService;
    this.controlHandlesGroup = null;
  }

  // Getter dinámico para evitar que `service` quede undefined si cadService se instancia después
  get service() {
    return this._cadService || window.cadService;
  }

  updatePointEntitiesScale() {
    if (!paper || !paper.view) return;
    const zoom = paper.view.zoom;

    const nodeTheme = (typeof CAD_THEME !== 'undefined' && CAD_THEME?.node) ? CAD_THEME.node : {};
    const nodeSelectionTheme = (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.node) ? CAD_THEME.selection.node : {};

    const entities = this.service?.entities || [];
    entities.forEach(ent => {
      if (ent && ent.data && ent.data.isPointEntity && ent.bounds) {
        const isSelected = this.service.selectedEntities?.includes(ent);
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
      }
    });
    if (paper.view) paper.view.update();
  }

  _getSelectionMultiplier(entity) {
    const styleConfig = entity?.data?.isCircleEntity
      ? (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.circle ? CAD_THEME.selection.circle : {})
      : (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.line ? CAD_THEME.selection.line : {});
    return styleConfig.widthMultiplier || 1.5;
  }

  _getResolvedStrokeWidth(entity, mult = 1, zoom = 1) {
    const propertyManager = this.service?.utils?.propertyManager || window.cadUtils?.propertyManager;
    const effectiveBaseWidth = propertyManager
      ? propertyManager.getResolvedStrokeWidth(entity)
      : (entity?.data?.baseStrokeWidth !== undefined ? entity.data.baseStrokeWidth : 0);

    return effectiveBaseWidth === 0 ? (1 * mult) / zoom : effectiveBaseWidth * mult;
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

        this.updatePointEntitiesScale();
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

        const styleConfig = ent.data.isCircleEntity 
          ? (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.circle ? CAD_THEME.selection.circle : {}) 
          : (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.line ? CAD_THEME.selection.line : {});

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
  }

  renderBezierHandles() {
    if (this.controlHandlesGroup) this.controlHandlesGroup.remove();
    this.controlHandlesGroup = new paper.Group({ insert: false });

    const cadUtils = this.service?.utils || window.cadUtils || {};
    const nodesLayer = cadUtils.nodesLayer || paper.project?.layers?.['nodesLayer'];
    if (nodesLayer) {
      nodesLayer.addChild(this.controlHandlesGroup);
    } else if (paper.project?.activeLayer) {
      paper.project.activeLayer.addChild(this.controlHandlesGroup);
    }

    // Sincronizar inmediatamente la referencia con window.cadUtils para que SelectTool y HandleSelectionHandler la encuentren
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

    // Purga de edición para elementos huérfanos o eliminados
    if (service.editingEntities && service.editingEntities.length > 0) {
      service.editingEntities = service.editingEntities.filter(
        ent => ent && ent.parent && service.entities?.includes(ent)
      );

      if (service.editingEntities.length === 0) {
        if (typeof service.deselectAllSegments === 'function') {
          service.deselectAllSegments();
        } else {
          service.selectedSegments = [];
        }
        if (typeof service.deselectAllCurves === 'function') {
          service.deselectAllCurves();
        } else if (Array.isArray(service.selectedCurves)) {
          service.selectedCurves = [];
        }
        if (typeof service.deselectAllHandles === 'function') {
          service.deselectAllHandles();
        } else {
          service.selectedHandles = [];
        }
      }
    }

    const zoom = paper.view.zoom;
    const cfg = (typeof CAD_THEME !== 'undefined' && CAD_THEME?.handles) ? CAD_THEME.handles : {};

    const activeEntities = (service.editingEntities || []).filter(ent => {
      if (!ent || !ent.parent) return false;
      const lId = String(ent.data?.layerId || '0');
      const layer = layerManager?.layers?.get(lId);
      return !layer || !layer.locked;
    });

    // 1. OVERLAY BASE DE ENTIDADES EN MODO EDICIÓN (respeta si la entidad completa sigue seleccionada)
    activeEntities.forEach(entity => {
      if (!entity.visible) return;

      if (entity instanceof paper.Path && entity.segments && entity.segments.length >= 2 && !entity.data?.isPointEntity) {
        const isEntitySelected = Boolean(service.selectedEntities?.includes(entity));
        const styleConfig = entity.data?.isCircleEntity
          ? (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.circle ? CAD_THEME.selection.circle : {})
          : (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.line ? CAD_THEME.selection.line : {});

        const effectiveColor = propertyManager
          ? propertyManager.getResolvedColor(entity)
          : (entity.data?.origStrokeColor || '#00e5ff');

        const highlightMult = this._getSelectionMultiplier(entity);

        const editOverlay = entity.clone({ insert: false });
        editOverlay.data = {};
        editOverlay.guide = true;

        if (isEntitySelected) {
          editOverlay.opacity = 1.0;
          editOverlay.strokeColor = styleConfig.strokeColor || '#ffff00';
          editOverlay.strokeWidth = this._getResolvedStrokeWidth(entity, highlightMult, zoom);
        } else {
          editOverlay.strokeColor = effectiveColor;
          editOverlay.strokeWidth = this._getResolvedStrokeWidth(entity, 1, zoom);
        }

        this.controlHandlesGroup.addChild(editOverlay);
      }
    });

    // 2. RENDERIZADO DE NODOS BÉZIER, SEGMENTOS SELECCIONADOS/HOVER Y VÉRTICES
    activeEntities.forEach(entity => {
      if (!entity.visible) return;

      if (entity instanceof paper.Path && entity.segments && entity.segments.length >= 2 && !entity.data?.isPointEntity) {
        const isEntitySelected = Boolean(service.selectedEntities?.includes(entity));
        const highlightMult = this._getSelectionMultiplier(entity);
        const highlightWidth = this._getResolvedStrokeWidth(entity, highlightMult, zoom);

        const resolvedBaseColor = propertyManager
          ? propertyManager.getResolvedColor(entity)
          : (entity.data?.origStrokeColor || '#00e5ff');

        const handleBaseColor = isEntitySelected
          ? (cfg.anchorStrokeSelected || '#ffff00')
          : resolvedBaseColor;

        if (entity.curves && !isEntitySelected) {
          const selectedChains = [];
          let currentChain = [];

          entity.curves.forEach((curve) => {
            const isCurveSelected = service.selectedSegments?.includes(curve.segment1) && 
                                    service.selectedSegments?.includes(curve.segment2);

            if (isCurveSelected) {
              if (currentChain.length === 0) {
                currentChain.push(curve.segment1, curve.segment2);
              } else {
                if (currentChain[currentChain.length - 1] === curve.segment1) {
                  currentChain.push(curve.segment2);
                } else {
                  selectedChains.push(currentChain);
                  currentChain = [curve.segment1, curve.segment2];
                }
              }
            } else {
              if (currentChain.length > 0) {
                selectedChains.push(currentChain);
                currentChain = [];
              }
            }
          });

          if (currentChain.length > 0) {
            selectedChains.push(currentChain);
          }

          if (entity.closed && selectedChains.length > 1) {
            const firstChain = selectedChains[0];
            const lastChain = selectedChains[selectedChains.length - 1];
            if (lastChain[lastChain.length - 1] === firstChain[0]) {
              selectedChains[0] = lastChain.concat(firstChain.slice(1));
              selectedChains.pop();
            }
          }

          selectedChains.forEach(chainSegments => {
            const strokeColor = cfg.anchorStrokeSelected || '#ffff00';

            let isClosedLoop = false;
            let segmentsToRender = chainSegments;

            if (chainSegments.length > 2 && chainSegments[0] === chainSegments[chainSegments.length - 1]) {
              isClosedLoop = true;
              segmentsToRender = chainSegments.slice(0, chainSegments.length - 1);
            }

            const highlightedPath = new paper.Path({
              segments: segmentsToRender.map(s => new paper.Segment(s.point, s.handleIn, s.handleOut)),
              strokeColor: strokeColor,
              strokeWidth: highlightWidth,
              strokeJoin: entity.strokeJoin || 'miter',
              strokeCap: entity.strokeCap || 'butt',
              miterLimit: entity.miterLimit || 3,
              closed: isClosedLoop,
              insert: false
            });

            highlightedPath.guide = true;
            this.controlHandlesGroup.addChild(highlightedPath);
          });

          if (hoveredCurve && hoveredCurve.path === entity) {
            const c = hoveredCurve;
            const isHoveredSelected = service.selectedSegments?.includes(c.segment1) && 
                                      service.selectedSegments?.includes(c.segment2);

            if (!isHoveredSelected) {
              const hoveredCurvePath = new paper.Path({
                segments: [
                  new paper.Segment(c.segment1.point, c.segment1.handleIn, c.segment1.handleOut),
                  new paper.Segment(c.segment2.point, c.segment2.handleIn, c.segment2.handleOut)
                ],
                strokeColor: resolvedBaseColor,
                strokeWidth: highlightWidth,
                strokeJoin: entity.strokeJoin || 'miter',
                strokeCap: entity.strokeCap || 'butt',
                miterLimit: entity.miterLimit || 3,
                insert: false
              });

              hoveredCurvePath.guide = true;
              this.controlHandlesGroup.addChild(hoveredCurvePath);
            }
          }
        }
        
        entity.segments.forEach(segment => {
          const isSegSelected = !isEntitySelected && service.selectedSegments?.includes(segment);

          ['handleIn', 'handleOut'].forEach(handleType => {
            if (!segment[handleType].isZero()) {
              const handlePt = segment.point.add(segment[handleType]);

              const isHandleSelected = !isEntitySelected && service.isSelectedHandle ? service.isSelectedHandle(segment, handleType) : false;
              const isArmActive = isSegSelected && isHandleSelected;
              const canHover = !isEntitySelected;

              const isHandleHovered = canHover && !isHandleSelected && 
                                      !!(hoveredHandle && 
                                        hoveredHandle.segment === segment && 
                                        hoveredHandle.type === handleType);

              const isArmHovered = canHover && !isArmActive && 
                                   !!(hoveredHandle && 
                                     hoveredHandle.segment === segment && 
                                     hoveredHandle.type === 'arm' && 
                                     hoveredHandle.handleType === handleType);

              const armColor = isArmActive 
                ? (cfg.bezierArmStrokeSelected || '#ffff00') 
                : handleBaseColor;

              let armWidth = cfg.bezierArmStrokeWidthPx || 1.0;
              if (isArmActive) {
                armWidth = cfg.anchorStrokeWidthSelectedPx || 1.5;
              } else if (isArmHovered) {
                armWidth = cfg.bezierArmStrokeWidthHoverPx || 1.8;
              }

              const arm = new paper.Path.Line({
                from: segment.point,
                to: handlePt,
                strokeColor: armColor,
                strokeWidth: armWidth / zoom
              });
              arm.data = { type: 'arm', handleType: handleType, segment: segment };

              const handleStrokeColor = isHandleSelected 
                ? (cfg.bezierHandleStrokeSelected || '#ffff00') 
                : handleBaseColor;

              let handleStrokeWidth = cfg.bezierHandleStrokeWidthPx || 1.0;
              if (isHandleSelected) {
                handleStrokeWidth = cfg.anchorStrokeWidthSelectedPx || 1.5;
              } else if (isHandleHovered) {
                handleStrokeWidth = cfg.bezierHandleStrokeWidthHoverPx || 1.8;
              }

              const sizePx = isHandleSelected 
                ? (cfg.bezierHandleSizePx + 1.0) 
                : (isHandleHovered ? cfg.bezierHandleSizePx + 0.5 : cfg.bezierHandleSizePx);

              const handleSquare = new paper.Path.Rectangle({
                point: [handlePt.x - sizePx / (2 * zoom), handlePt.y - sizePx / (2 * zoom)],
                size: [sizePx / zoom, sizePx / zoom],
                fillColor: cfg.bezierHandleFill || '#10141D',
                strokeColor: handleStrokeColor,
                strokeWidth: handleStrokeWidth / zoom
              });
              handleSquare.data = { type: handleType, segment: segment };

              this.controlHandlesGroup.addChild(arm);
              this.controlHandlesGroup.addChild(handleSquare);
            }
          });

          const isAnchorHovered = !isEntitySelected && !isSegSelected && 
                                  !!(hoveredHandle && 
                                    hoveredHandle.segment === segment && 
                                    hoveredHandle.type === 'anchor');

          const baseSide = isSegSelected 
            ? (cfg.anchorSizeSelectedPx || 7.5) 
            : (isAnchorHovered ? (cfg.anchorSizeNormalPx || 7.0) + 0.5 : (cfg.anchorSizeNormalPx || 7.0));

          let strokeW = isSegSelected 
            ? (cfg.anchorStrokeWidthSelectedPx || 1.5) 
            : (isAnchorHovered ? (cfg.anchorStrokeWidthHoverPx || 1.8) : (cfg.anchorStrokeWidthNormalPx || 1.0));

          const anchorSquare = new paper.Path.Rectangle({
            point: [segment.point.x - (baseSide / zoom) / 2, segment.point.y - (baseSide / zoom) / 2],
            size: [baseSide / zoom, baseSide / zoom],
            fillColor: isSegSelected ? (cfg.anchorFillSelected || '#10141D') : (cfg.anchorFillNormal || '#10141D'),
            strokeColor: isSegSelected ? (cfg.anchorStrokeSelected || '#ffff00') : handleBaseColor,
            strokeWidth: strokeW / zoom
          });
          anchorSquare.data = { type: 'anchor', segment: segment };
          this.controlHandlesGroup.addChild(anchorSquare);
        });
      }
    });

    // 3. OVERLAY DE ENTIDADES EN MODO ENTIDAD, CONTORNOS Y GRIPS PARAMÉTRICOS
    const selectableEntities = (service.selectedEntities || []).filter(ent => {
      if (!ent || !ent.parent) return false;
      const lId = String(ent.data?.layerId || '0');
      const layer = layerManager?.layers?.get(lId);
      return !layer || !layer.locked;
    });

    selectableEntities.forEach(entity => {
      if (!entity.visible) return;

      // Proyección visual de la entidad seleccionada por encima de todas las capas
      if (!activeEntities.includes(entity)) {
        if (entity.data?.isPointEntity) {
          const pointOverlay = entity.clone({ insert: false });
          pointOverlay.data = {};
          pointOverlay.guide = true;
          this.controlHandlesGroup.addChild(pointOverlay);
        } else if (entity instanceof paper.Path || entity instanceof paper.CompoundPath) {
          const styleConfig = entity.data?.isCircleEntity
            ? (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.circle ? CAD_THEME.selection.circle : {})
            : (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.line ? CAD_THEME.selection.line : {});

          const mult = this._getSelectionMultiplier(entity);

          const selOverlay = entity.clone({ insert: false });
          selOverlay.data = {};
          selOverlay.guide = true;
          selOverlay.opacity = 1.0;
          selOverlay.strokeColor = styleConfig.strokeColor || '#ffff00';
          selOverlay.strokeWidth = this._getResolvedStrokeWidth(entity, mult, zoom);
          this.controlHandlesGroup.addChild(selOverlay);
        } else if (entity instanceof paper.Raster) {
          const rasterOutline = new paper.Path.Rectangle({
            rectangle: entity.bounds,
            strokeColor: '#ffff00',
            strokeWidth: 1.5 / zoom,
            insert: false
          });
          rasterOutline.guide = true;
          this.controlHandlesGroup.addChild(rasterOutline);
        }
      }

      if (entity.data && entity.data.controller) {
        const controller = entity.data.controller;
        const { grips, outlineSegments } = controller.getGrips();

        const rawColor = propertyManager 
          ? propertyManager.getResolvedColor(entity)
          : '#00e5ff';

        const entityColor = new paper.Color(rawColor);
        entityColor.alpha = 1.0;

        if (outlineSegments && outlineSegments.length > 1) {
          const boundingOutline = new paper.Path({
            segments: outlineSegments,
            closed: true,
            strokeColor: entityColor,
            strokeWidth: 1 / zoom,
            insert: false
          });
          boundingOutline.guide = true;
          this.controlHandlesGroup.addChild(boundingOutline);
        }

        grips.forEach(grip => {
          const isCenter = grip.id === 'center';
          const isHovered = hoveredParametricGrip && 
                            hoveredParametricGrip.entity === entity && 
                            hoveredParametricGrip.gripId === grip.id;
          
          const isActiveGrip = activeParametricGrip && 
                              activeParametricGrip.entity === entity && 
                              activeParametricGrip.gripId === grip.id;

          const normalSide = isCenter ? 8.0 : (cfg.anchorSizeNormalPx || 7.0);
          const selectedSide = isCenter ? 9.0 : (cfg.anchorSizeSelectedPx || 7.5);

          let sizePx = normalSide;
          let strokeW = cfg.anchorStrokeWidthNormalPx || 1.0;
          let strokeColor = entityColor;
          let fillColor = cfg.anchorFillNormal || '#10141D';

          if (isActiveGrip) {
            sizePx = selectedSide;
            strokeW = cfg.anchorStrokeWidthSelectedPx || 1.5;
          } else if (isHovered) {
            sizePx = normalSide;
            strokeW = cfg.anchorStrokeWidthHoverPx || 1.8;
          }

          const size = sizePx / zoom;

          let gripMarker;
          if (isCenter) {
            gripMarker = new paper.CompoundPath({
              children: [
                new paper.Path.Circle({ center: grip.point, radius: size / 1.5 }),
                new paper.Path.Line(grip.point.subtract([size, 0]), grip.point.add([size, 0])),
                new paper.Path.Line(grip.point.subtract([0, size]), grip.point.add([0, size]))
              ],
              strokeColor: strokeColor,
              strokeWidth: strokeW / zoom,
              fillColor: null
            });
          } else {
            gripMarker = new paper.Path.Rectangle({
              point: [grip.point.x - size / 2, grip.point.y - size / 2],
              size: [size, size],
              fillColor: fillColor,
              strokeColor: strokeColor,
              strokeWidth: strokeW / zoom
            });
          }

          gripMarker.data = { 
            isParametricGrip: true, 
            gripId: grip.id, 
            entity: entity,
            cursor: grip.cursor
          };

          this.controlHandlesGroup.addChild(gripMarker);
        });
      }
    });
  }
}