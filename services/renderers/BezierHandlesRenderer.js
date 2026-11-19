/**
 * services/renderers/BezierHandlesRenderer.js - Renderizado visual de nodos, curvas y tiradores Bézier en edición
 */
import { CAD_THEME } from '../../config/cadTheme.js';

export class BezierHandlesRenderer {
  renderEditingEntities(activeEntities, controlHandlesGroup, context) {
    const {
      service,
      zoom,
      cfg,
      propertyManager,
      hoveredCurve,
      hoveredHandle,
      getSelectionMultiplier,
      getResolvedStrokeWidth
    } = context;

    // 1. OVERLAY BASE DE ENTIDADES EN MODO EDICIÓN
    activeEntities.forEach((entity) => {
      if (!entity.visible) return;

      if (entity instanceof paper.Path && entity.segments && entity.segments.length >= 2 && !entity.data?.isPointEntity) {
        const isEntitySelected = Boolean(service.selectedEntities?.includes(entity));
        const styleConfig = entity.data?.isCircleEntity
          ? (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.circle ? CAD_THEME.selection.circle : {})
          : (typeof CAD_THEME !== 'undefined' && CAD_THEME?.selection?.line ? CAD_THEME.selection.line : {});

        const effectiveColor = propertyManager
          ? propertyManager.getResolvedColor(entity)
          : (entity.data?.origStrokeColor || '#00e5ff');

        const highlightMult = getSelectionMultiplier(entity);

        const editOverlay = entity.clone({ insert: false });
        editOverlay.data = {};
        editOverlay.guide = true;

        if (isEntitySelected) {
          editOverlay.opacity = 1.0;
          editOverlay.strokeColor = styleConfig.strokeColor || '#ffff00';
          editOverlay.strokeWidth = getResolvedStrokeWidth(entity, highlightMult, zoom);
        } else {
          editOverlay.strokeColor = effectiveColor;
          editOverlay.strokeWidth = getResolvedStrokeWidth(entity, 1, zoom);
        }

        controlHandlesGroup.addChild(editOverlay);
      }
    });

    // 2. RENDERIZADO DE NODOS BÉZIER, SEGMENTOS SELECCIONADOS/HOVER Y VÉRTICES
    activeEntities.forEach((entity) => {
      if (!entity.visible) return;

      if (entity instanceof paper.Path && entity.segments && entity.segments.length >= 2 && !entity.data?.isPointEntity) {
        const isEntitySelected = Boolean(service.selectedEntities?.includes(entity));
        const highlightMult = getSelectionMultiplier(entity);
        const highlightWidth = getResolvedStrokeWidth(entity, highlightMult, zoom);

        const resolvedBaseColor = propertyManager
          ? propertyManager.getResolvedColor(entity)
          : (entity.data?.origStrokeColor || '#00e5ff');

        const handleBaseColor = isEntitySelected
          ? (cfg.anchorStrokeSelected || '#ffff00')
          : resolvedBaseColor;

        if (entity.curves && !isEntitySelected) {
          this._renderSelectedChains(entity, controlHandlesGroup, {
            service,
            cfg,
            highlightWidth
          });

          this._renderHoveredCurve(entity, controlHandlesGroup, {
            service,
            hoveredCurve,
            resolvedBaseColor,
            highlightWidth
          });
        }

        entity.segments.forEach((segment) => {
          this._renderSegmentControls(segment, controlHandlesGroup, {
            service,
            zoom,
            cfg,
            hoveredHandle,
            isEntitySelected,
            handleBaseColor
          });
        });
      }
    });
  }

  _renderSelectedChains(entity, controlHandlesGroup, { service, cfg, highlightWidth }) {
    const selectedChains = [];
    let currentChain = [];

    entity.curves.forEach((curve) => {
      const isCurveSelected =
        service.selectedSegments?.includes(curve.segment1) &&
        service.selectedSegments?.includes(curve.segment2);

      if (isCurveSelected) {
        if (currentChain.length === 0) {
          currentChain.push(curve.segment1, curve.segment2);
        } else if (currentChain[currentChain.length - 1] === curve.segment1) {
          currentChain.push(curve.segment2);
        } else {
          selectedChains.push(currentChain);
          currentChain = [curve.segment1, curve.segment2];
        }
      } else if (currentChain.length > 0) {
        selectedChains.push(currentChain);
        currentChain = [];
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

    const strokeColor = cfg.anchorStrokeSelected || '#ffff00';

    selectedChains.forEach((chainSegments) => {
      let isClosedLoop = false;
      let segmentsToRender = chainSegments;

      if (chainSegments.length > 2 && chainSegments[0] === chainSegments[chainSegments.length - 1]) {
        isClosedLoop = true;
        segmentsToRender = chainSegments.slice(0, chainSegments.length - 1);
      }

      const highlightedPath = new paper.Path({
        segments: segmentsToRender.map((s) => new paper.Segment(s.point, s.handleIn, s.handleOut)),
        strokeColor,
        strokeWidth: highlightWidth,
        strokeJoin: entity.strokeJoin || 'miter',
        strokeCap: entity.strokeCap || 'butt',
        miterLimit: entity.miterLimit || 3,
        closed: isClosedLoop,
        insert: false
      });

      highlightedPath.guide = true;
      controlHandlesGroup.addChild(highlightedPath);
    });
  }

  _renderHoveredCurve(entity, controlHandlesGroup, { service, hoveredCurve, resolvedBaseColor, highlightWidth }) {
    if (!hoveredCurve || hoveredCurve.path !== entity) return;

    const c = hoveredCurve;
    const isHoveredSelected =
      service.selectedSegments?.includes(c.segment1) &&
      service.selectedSegments?.includes(c.segment2);

    if (isHoveredSelected) return;

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
    controlHandlesGroup.addChild(hoveredCurvePath);
  }

  _renderSegmentControls(segment, controlHandlesGroup, { service, zoom, cfg, hoveredHandle, isEntitySelected, handleBaseColor }) {
    const isSegSelected = !isEntitySelected && service.selectedSegments?.includes(segment);

    ['handleIn', 'handleOut'].forEach((handleType) => {
      if (!segment[handleType].isZero()) {
        const handlePt = segment.point.add(segment[handleType]);

        const isHandleSelected = !isEntitySelected && service.isSelectedHandle
          ? service.isSelectedHandle(segment, handleType)
          : false;
        const isArmActive = isSegSelected && isHandleSelected;
        const canHover = !isEntitySelected;

        const isHandleHovered =
          canHover &&
          !isHandleSelected &&
          Boolean(hoveredHandle && hoveredHandle.segment === segment && hoveredHandle.type === handleType);

        const isArmHovered =
          canHover &&
          !isArmActive &&
          Boolean(
            hoveredHandle &&
            hoveredHandle.segment === segment &&
            hoveredHandle.type === 'arm' &&
            hoveredHandle.handleType === handleType
          );

        const armColor = isArmActive
          ? (cfg.bezierArmStrokeSelected || '#ffff00')
          : handleBaseColor;

        let armWidth = cfg.bezierArmStrokeWidthPx ?? 0.5;
        if (isArmActive) {
          armWidth = cfg.bezierArmStrokeWidthSelectedPx ?? cfg.anchorStrokeWidthSelectedPx ?? 1.0;
        } else if (isArmHovered) {
          armWidth = cfg.bezierArmStrokeWidthHoverPx ?? 1.0;
        }

        const arm = new paper.Path.Line({
          from: segment.point,
          to: handlePt,
          strokeColor: armColor,
          strokeWidth: armWidth / zoom
        });
        arm.data = { type: 'arm', handleType, segment };

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
        handleSquare.data = { type: handleType, segment };

        controlHandlesGroup.addChild(arm);
        controlHandlesGroup.addChild(handleSquare);
      }
    });

    const isAnchorHovered =
      !isEntitySelected &&
      !isSegSelected &&
      Boolean(hoveredHandle && hoveredHandle.segment === segment && hoveredHandle.type === 'anchor');

    const baseSide = isSegSelected
      ? (cfg.anchorSizeSelectedPx || 7.5)
      : (isAnchorHovered ? (cfg.anchorSizeNormalPx || 7.0) + 0.5 : (cfg.anchorSizeNormalPx || 7.0));

    const strokeW = isSegSelected
      ? (cfg.anchorStrokeWidthSelectedPx || 1.5)
      : (isAnchorHovered ? (cfg.anchorStrokeWidthHoverPx || 1.8) : (cfg.anchorStrokeWidthNormalPx || 1.0));

    const anchorSquare = new paper.Path.Rectangle({
      point: [segment.point.x - (baseSide / zoom) / 2, segment.point.y - (baseSide / zoom) / 2],
      size: [baseSide / zoom, baseSide / zoom],
      fillColor: isSegSelected ? (cfg.anchorFillSelected || '#10141D') : (cfg.anchorFillNormal || '#10141D'),
      strokeColor: isSegSelected ? (cfg.anchorStrokeSelected || '#ffff00') : handleBaseColor,
      strokeWidth: strokeW / zoom
    });
    anchorSquare.data = { type: 'anchor', segment };
    controlHandlesGroup.addChild(anchorSquare);
  }

  renderSelectionOverlays(selectableEntities, activeEntities, controlHandlesGroup, context) {
    const {
      zoom,
      getSelectionStyleConfig,
      getSelectionMultiplier,
      getResolvedStrokeWidth
    } = context;

    selectableEntities.forEach((entity) => {
      if (!entity.visible || activeEntities.includes(entity) || entity.data?.isPointEntity) {
        return;
      }

      if (entity instanceof paper.Path || entity instanceof paper.CompoundPath) {
        const styleConfig = getSelectionStyleConfig(entity);
        const mult = getSelectionMultiplier(entity);

        const selOverlay = entity.clone({ insert: false });
        selOverlay.data = {};
        selOverlay.guide = true;
        selOverlay.opacity = 1.0;
        selOverlay.strokeColor = styleConfig.strokeColor || '#ffff00';
        selOverlay.strokeWidth = getResolvedStrokeWidth(entity, mult, zoom);
        controlHandlesGroup.addChild(selOverlay);
      } else if (entity instanceof paper.Raster && !entity.data?.controller) {
        const rasterOutline = new paper.Path.Rectangle({
          rectangle: entity.bounds,
          strokeColor: '#ffff00',
          strokeWidth: 1.5 / zoom,
          insert: false
        });
        rasterOutline.guide = true;
        controlHandlesGroup.addChild(rasterOutline);
      }
    });
  }
}