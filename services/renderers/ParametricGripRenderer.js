/**
 * services/renderers/ParametricGripRenderer.js - Renderizado visual de grips y bordes paramétricos
 */

export class ParametricGripRenderer {
  render(entity, controlHandlesGroup, { zoom, cfg, propertyManager, hoveredParametricGrip, activeParametricGrip }) {
    const controller = entity?.data?.controller;
    if (!controller || !controlHandlesGroup) return;

    const { grips, outlineSegments } = controller.getGrips();

    const rawColor = propertyManager
      ? propertyManager.getResolvedColor(entity)
      : (entity.data?.origStrokeColor || '#00e5ff');

    const entityColor = new paper.Color(rawColor);
    entityColor.alpha = 1.0;
    const activeColor = cfg.anchorStrokeSelected || '#ffff00';

    if (outlineSegments && outlineSegments.length === 4) {
      const [nw, ne, se, sw] = outlineSegments;
      const edges = [
        { id: 'n', from: nw, to: ne, cursor: 'ns-resize' },
        { id: 'e', from: ne, to: se, cursor: 'ew-resize' },
        { id: 's', from: se, to: sw, cursor: 'ns-resize' },
        { id: 'w', from: sw, to: nw, cursor: 'ew-resize' }
      ];

      edges.forEach((edge) => {
        const isEdgeHovered = Boolean(
          hoveredParametricGrip &&
          hoveredParametricGrip.entity === entity &&
          hoveredParametricGrip.gripId === edge.id
        );
        const isEdgeActive = Boolean(
          activeParametricGrip &&
          activeParametricGrip.entity === entity &&
          activeParametricGrip.gripId === edge.id
        );

        const edgeStrokeColor = isEdgeActive ? activeColor : entityColor;
        const edgeStrokeWidthPx = isEdgeActive
          ? (cfg.anchorStrokeWidthSelectedPx || 1.5)
          : (isEdgeHovered ? (cfg.anchorStrokeWidthHoverPx || 1.8) : (cfg.anchorStrokeWidthNormalPx || 1.0));

        const edgeLine = new paper.Path.Line({
          from: edge.from,
          to: edge.to,
          strokeColor: edgeStrokeColor,
          strokeWidth: edgeStrokeWidthPx / zoom,
          insert: false
        });
        edgeLine.guide = true;
        edgeLine.data = {
          isParametricGrip: true,
          isParametricEdge: true,
          gripId: edge.id,
          entity,
          cursor: edge.cursor
        };
        controlHandlesGroup.addChild(edgeLine);
      });
    } else if (outlineSegments && outlineSegments.length > 1) {
      const boundingOutline = new paper.Path({
        segments: outlineSegments,
        closed: true,
        strokeColor: entityColor,
        strokeWidth: (cfg.anchorStrokeWidthNormalPx || 1.0) / zoom,
        insert: false
      });
      boundingOutline.guide = true;
      controlHandlesGroup.addChild(boundingOutline);
    }

    grips.forEach((grip) => {
      const isCenter = grip.id === 'center';
      const isHovered = Boolean(
        hoveredParametricGrip &&
        hoveredParametricGrip.entity === entity &&
        hoveredParametricGrip.gripId === grip.id
      );
      const isActiveGrip = Boolean(
        activeParametricGrip &&
        activeParametricGrip.entity === entity &&
        activeParametricGrip.gripId === grip.id
      );

      const normalSide = isCenter ? 8.0 : (cfg.anchorSizeNormalPx || 7.0);
      const selectedSide = isCenter ? 9.0 : (cfg.anchorSizeSelectedPx || 7.5);

      let sizePx = normalSide;
      let strokeW = cfg.anchorStrokeWidthNormalPx || 1.0;
      let strokeColor = entityColor;
      const fillColor = cfg.anchorFillNormal || '#10141D';

      if (isActiveGrip) {
        sizePx = selectedSide;
        strokeW = cfg.anchorStrokeWidthSelectedPx || 1.5;
        strokeColor = activeColor;
      } else if (isHovered) {
        sizePx = normalSide + 0.5;
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
          strokeColor,
          strokeWidth: strokeW / zoom,
          fillColor: null
        });
      } else {
        gripMarker = new paper.Path.Rectangle({
          point: [grip.point.x - size / 2, grip.point.y - size / 2],
          size: [size, size],
          fillColor,
          strokeColor,
          strokeWidth: strokeW / zoom
        });
      }

      gripMarker.data = {
        isParametricGrip: true,
        gripId: grip.id,
        entity,
        cursor: grip.cursor
      };

      controlHandlesGroup.addChild(gripMarker);
    });
  }
}