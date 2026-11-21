/**
 * ui/SnapMarkerRenderer.js - Renderizado vectorial de marcadores OSNAP con contorno exterior configurable
 */

import { CAD_THEME } from '../config/cadTheme.js';

export class SnapMarkerRenderer {
  static render(group, point, type, zoom) {
    if (!group || !point || !type || type === 'none') return;

    const {
      snapStrokeColor,
      snapFillColor,
      snapBgColor,
      snapStrokeWidthPx,
      snapOutlineWidthPx = 0.8,
      snapMarkerSizePx,
      intersectionWidthMultiplier = 1.4,
      extensionFactor = 1.3
    } = CAD_THEME.hud;

    const px = 1 / zoom;
    const size = snapMarkerSizePx * px;
    const strokeWidth = snapStrokeWidthPx * px;
    const outlinePx = snapOutlineWidthPx * px;

    // Desplazamiento calibrado para que el anillo oscuro quede oculto bajo el trazo verde
    // y sobresalga exactamente `snapOutlineWidthPx` hacia el exterior sin invadir el relleno.
    const bleed = 0.15 * px;
    const outset = strokeWidth * 0.5 + outlinePx * 0.5 - bleed;
    const outerRingWidth = outlinePx + 2 * bleed;
    const openOutlineWidth = strokeWidth + 2 * outlinePx;

    const bgItems = [];
    const fgItems = [];

    const addClosedOutline = (path) => {
      path.strokeColor = snapBgColor;
      path.strokeWidth = outerRingWidth;
      path.fillColor = null;
      bgItems.push(path);
    };

    const addClosedForeground = (path, fill = snapFillColor) => {
      path.strokeColor = snapStrokeColor;
      path.strokeWidth = strokeWidth;
      path.fillColor = fill;
      fgItems.push(path);
    };

    const addOpenLine = (from, to, {
      fgWidth = strokeWidth,
      extraTipPx = outlinePx
    } = {}) => {
      const dir = to.subtract(from);
      const ext = dir.length > 0 ? dir.normalize(extraTipPx) : new paper.Point(0, 0);

      const bgLine = new paper.Path.Line(from.subtract(ext), to.add(ext));
      bgLine.strokeColor = snapBgColor;
      bgLine.strokeWidth = fgWidth + 2 * outlinePx;
      bgLine.strokeCap = 'butt';
      bgItems.push(bgLine);

      const fgLine = new paper.Path.Line(from, to);
      fgLine.strokeColor = snapStrokeColor;
      fgLine.strokeWidth = fgWidth;
      fgLine.strokeCap = 'butt';
      fgItems.push(fgLine);
    };

    if (type === 'node') {
      addClosedOutline(new paper.Path.Circle({ center: point, radius: size * 0.5 + outset }));
      addClosedForeground(new paper.Path.Circle({ center: point, radius: size * 0.5 }));
      fgItems.push(new paper.Path.Circle({
        center: point,
        radius: size * 0.15,
        fillColor: snapStrokeColor
      }));
    } else if (type === 'endpoint') {
      addClosedOutline(new paper.Path.Rectangle({
        center: point,
        size: [size + 2 * outset, size + 2 * outset]
      }));
      addClosedForeground(new paper.Path.Rectangle({
        center: point,
        size: [size, size]
      }));
    } else if (type === 'midpoint') {
      const radius = size * 0.6;
      addClosedOutline(new paper.Path.RegularPolygon({
        center: point,
        sides: 3,
        radius: radius + 2 * outset
      }));
      addClosedForeground(new paper.Path.RegularPolygon({
        center: point,
        sides: 3,
        radius
      }));
    } else if (type === 'intersection') {
      const half = size * 0.5;
      const interWidth = strokeWidth * intersectionWidthMultiplier;
      const tipExt = half * (extensionFactor - 1) + outlinePx;

      addOpenLine(
        point.subtract(new paper.Point(half, half)),
        point.add(new paper.Point(half, half)),
        { fgWidth: interWidth, extraTipPx: tipExt }
      );
      addOpenLine(
        point.subtract(new paper.Point(-half, half)),
        point.add(new paper.Point(-half, half)),
        { fgWidth: interWidth, extraTipPx: tipExt }
      );
    } else if (type === 'grid') {
      const r = size * 0.35;
      bgItems.push(new paper.Path.Circle({ center: point, radius: r + outlinePx, fillColor: snapBgColor }));
      fgItems.push(new paper.Path.Circle({ center: point, radius: r, fillColor: snapStrokeColor }));
    } else if (type === 'center') {
      addClosedOutline(new paper.Path.Circle({ center: point, radius: size * 0.5 + outset }));
      addClosedForeground(new paper.Path.Circle({ center: point, radius: size * 0.5 }));
    } else if (type === 'quadrant') {
      const radius = size * 0.55;
      const outer = new paper.Path.RegularPolygon({
        center: point,
        sides: 4,
        radius: radius + Math.SQRT2 * outset
      });
      outer.rotate(45, point);
      addClosedOutline(outer);

      const inner = new paper.Path.RegularPolygon({ center: point, sides: 4, radius });
      inner.rotate(45, point);
      addClosedForeground(inner);
    } else if (type === 'perpendicular') {
      const half = size * 0.5;
      const silhouette = new paper.Path({
        segments: [
          point.add(new paper.Point(-half - outset, -half - outlinePx)),
          point.add(new paper.Point(-half - outset, half + outset)),
          point.add(new paper.Point(half + outlinePx, half + outset)),
          point.add(new paper.Point(half + outlinePx, half - outset)),
          point.add(new paper.Point(outset, half - outset)),
          point.add(new paper.Point(outset, -outset)),
          point.add(new paper.Point(-half + outset, -outset)),
          point.add(new paper.Point(-half + outset, -half - outlinePx))
        ],
        closed: true
      });
      addClosedOutline(silhouette);

      const innerSquareFill = new paper.Path.Rectangle({
        from: point.add(new paper.Point(-half, 0)),
        to: point.add(new paper.Point(0, half)),
        fillColor: snapFillColor,
        strokeColor: null
      });
      const outerCorner = new paper.Path({
        segments: [
          point.add(new paper.Point(-half, -half)),
          point.add(new paper.Point(-half, half)),
          point.add(new paper.Point(half, half))
        ],
        strokeColor: snapStrokeColor,
        strokeWidth,
        strokeCap: 'butt'
      });
      const innerCorner = new paper.Path({
        segments: [
          point.add(new paper.Point(-half, 0)),
          point,
          point.add(new paper.Point(0, half))
        ],
        strokeColor: snapStrokeColor,
        strokeWidth,
        strokeCap: 'butt'
      });
      fgItems.push(innerSquareFill, outerCorner, innerCorner);
    } else if (type === 'tangent') {
      const radius = size * 0.45;
      addClosedOutline(new paper.Path.Circle({ center: point, radius: radius + outset }));
      addClosedForeground(new paper.Path.Circle({ center: point, radius }));
      addOpenLine(
        point.add(new paper.Point(-size * 0.55, -radius)),
        point.add(new paper.Point(size * 0.55, -radius)),
        { fgWidth: strokeWidth, extraTipPx: outlinePx }
      );
    } else if (type === 'nearest') {
      const half = size * 0.5;
      const diagOutset = Math.SQRT2 * outset;
      const outerX = half + outset + diagOutset;
      const outerY = half + outset;

      const outerBowtie = new paper.Path({
        segments: [
          point.add(new paper.Point(-outerX, -outerY)),
          point.add(new paper.Point(outerX, -outerY)),
          point.add(new paper.Point(diagOutset, 0)),
          point.add(new paper.Point(outerX, outerY)),
          point.add(new paper.Point(-outerX, outerY)),
          point.add(new paper.Point(-diagOutset, 0))
        ],
        closed: true
      });
      addClosedOutline(outerBowtie);

      const innerBowtie = new paper.Path({
        segments: [
          point.add(new paper.Point(-half, -half)),
          point.add(new paper.Point(half, -half)),
          point.add(new paper.Point(-half, half)),
          point.add(new paper.Point(half, half))
        ],
        closed: true
      });
      addClosedForeground(innerBowtie);
    }

    group.addChildren(bgItems);
    group.addChildren(fgItems);
  }
}