/**
 * services/renderers/SelectionRenderEngine.js - Renderizado visual de tiradores Bézier, grips paramétricos y grosores dinámicos
 */

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

    const entities = this.service?.demoEntities || [];
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
  }

  updateEntitiesStroke() {
    if (!paper || !paper.view) return;
    const zoom = paper.view.zoom;

    const cadUtils = window.cadUtils;
    const layerManager = this.service?.layerManager || this.service?.utils?.layerManager || cadUtils?.layerManager;
    const propertyManager = cadUtils?.propertyManager;
    const activePath = cadUtils?.activePath;

    const entitiesToUpdate = [...(this.service?.demoEntities || [])];
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

      const isSelected = !isLayerLocked && this.service?.selectedEntities?.includes(ent);
      const isHovered = !isLayerLocked && this.service?.hoveredEntity === ent;

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

        const effectiveBaseWidth = propertyManager 
          ? propertyManager.getResolvedStrokeWidth(ent) 
          : (ent.data.baseStrokeWidth !== undefined ? ent.data.baseStrokeWidth : 0);

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

        let mult = isSelected ? (styleConfig.widthMultiplier || 1.5) : 1;
        if (isHovered && !isSelected) {
          mult *= 1.5;
        }

        if (effectiveBaseWidth === 0) {
          ent.strokeWidth = (1 * mult) / zoom;
        } else {
          ent.strokeWidth = effectiveBaseWidth * mult;
        }
      }
    });
  }

  renderBezierHandles() {
    if (this.controlHandlesGroup) this.controlHandlesGroup.remove();
    this.controlHandlesGroup = new paper.Group();

    // Sincronizar inmediatamente la referencia con window.cadUtils para que SelectTool y HandleSelectionHandler la encuentren
    if (window.cadUtils) {
      window.cadUtils.controlHandlesGroup = this.controlHandlesGroup;
    }

    const cadUtils = window.cadUtils || {};
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
        ent => ent && ent.parent && service.demoEntities?.includes(ent)
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

    // Renderizado de Nodos Bézier y Vértices
    activeEntities.forEach(entity => {
      if (!entity.visible) return;

      if (entity instanceof paper.Path && entity.segments && entity.segments.length >= 2 && !entity.data?.isPointEntity) {
        
        const entityColor = entity.strokeColor 
          ? (entity.strokeColor.toCSS ? entity.strokeColor.toCSS() : entity.strokeColor)
          : (entity.data?.origStrokeColor || '#ffff00');

        if (entity.curves) {
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
            const baseW = entity.data?.baseStrokeWidth || 1.5;
            const mult = 1.8;

            let isClosedLoop = false;
            let segmentsToRender = chainSegments;

            if (chainSegments.length > 2 && chainSegments[0] === chainSegments[chainSegments.length - 1]) {
              isClosedLoop = true;
              segmentsToRender = chainSegments.slice(0, chainSegments.length - 1);
            }

            const highlightedPath = new paper.Path({
              segments: segmentsToRender.map(s => new paper.Segment(s.point, s.handleIn, s.handleOut)),
              strokeColor: strokeColor,
              strokeWidth: (baseW * mult) / (entity.data?.isDynamicStroke !== false ? zoom : 1),
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
              const baseW = entity.data?.baseStrokeWidth || 1.5;
              const mult = 1.4;

              const hoveredCurvePath = new paper.Path({
                segments: [
                  new paper.Segment(c.segment1.point, c.segment1.handleIn, c.segment1.handleOut),
                  new paper.Segment(c.segment2.point, c.segment2.handleIn, c.segment2.handleOut)
                ],
                strokeColor: entityColor,
                strokeWidth: (baseW * mult) / (entity.data?.isDynamicStroke !== false ? zoom : 1),
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
          const isEntitySelected = service.selectedEntities?.includes(entity);
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
                : entityColor;

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
                : entityColor;

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
            strokeColor: isSegSelected ? (cfg.anchorStrokeSelected || '#ffff00') : entityColor,
            strokeWidth: strokeW / zoom
          });
          anchorSquare.data = { type: 'anchor', segment: segment };
          this.controlHandlesGroup.addChild(anchorSquare);
        });
      }
    });

    // Renderizado de Contornos y Grips Paramétricos
    const selectableEntities = (service.selectedEntities || []).filter(ent => {
      const lId = String(ent.data?.layerId || '0');
      const layer = layerManager?.layers?.get(lId);
      return !layer || !layer.locked;
    });

    selectableEntities.forEach(entity => {
      if (!entity.visible) return;

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