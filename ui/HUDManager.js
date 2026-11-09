/**
 * ui/HUDManager.js - Gestión de Overlays, Coordenadas y Marcadores Visuales (OSNAP/HUD)
 */

import { CAD_THEME } from '../config/cadTheme.js';

export class HUDManager {
  constructor(cadUtils) {
    this.utils = cadUtils;
    // Soporte para acceso directo por this.cadUtils o this.utils
    this.cadUtils = cadUtils; 

    this.feedbackGroup = null;
    this.feedbackTextDistance = null;
    this.feedbackTextAngle = null;

    this.snapMarkersGroup = null;
    
    this.lastSnapPoint = null;
    this.lastSnapType = null;

    // Referencia guardada para desvincular el listener global
    this._pointerMoveHandler = this._handlePointerMove.bind(this);

    this.initDOM();
  }

  initDOM() {
    this.hudX = document.getElementById('hudX');
    this.hudY = document.getElementById('hudY');
    // Guardar siempre el elemento real bajo el puntero en la pantalla
    this.currentElementUnderCursor = null;

    // Usamos la referencia bindeada
    window.addEventListener('pointermove', this._pointerMoveHandler, { passive: true });
  }

  _handlePointerMove(e) {
    this.currentElementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
  }

  /**
   * Inicializa las instancias de texto dentro de hudLayer
   */
  setupFeedbackLabels() {
    const hudLayer = this.utils?.hudLayer || paper.project?.layers?.['hudLayer'];
    if (hudLayer) hudLayer.activate();

    if (this.feedbackGroup) this.feedbackGroup.remove();
    this.feedbackGroup = new paper.Group();
    this.feedbackGroup.name = 'feedbackGroup';

    this.feedbackTextDistance = new paper.PointText({
      point: [0, 0],
      content: '',
      fillColor: '#00e5ff',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      fontSize: 11
    });

    this.feedbackTextAngle = new paper.PointText({
      point: [0, 0],
      content: '',
      fillColor: '#34d399',
      fontFamily: 'monospace',
      fontSize: 10
    });

    this.feedbackGroup.addChild(this.feedbackTextDistance);
    this.feedbackGroup.addChild(this.feedbackTextAngle);
    this.feedbackGroup.visible = false;

    // Restaurar capa de dibujo
    const drawLayer = this.utils?.drawLayer || paper.project?.layers?.['drawLayer'];
    if (drawLayer) drawLayer.activate();
  }

  /**
   * Actualiza las coordenadas X, Y en la barra de estado inferior
   */
  updateHUD(point) {
    if (!paper || !paper.view) return;

    this._refreshDOMReferences();

    // 1. Zoom: se actualiza SIEMPRE
    if (this.hudZoom) {
      this.hudZoom.innerText = `${Math.round(paper.view.zoom * 100)}%`;
    }

    // Guardar posición cartesiana
    if (point) this.lastPointerPoint = point;
    const targetPoint = point || this.lastPointerPoint;

    // 2. Omitir X/Y solo si el puntero está interactuando fuera del Canvas
    if (point && this.currentElementUnderCursor && this.currentElementUnderCursor.tagName !== 'CANVAS') {
      return;
    }

    // 3. Renderizar Coordenadas X / Y
    if (targetPoint) {
      if (this.hudX) this.hudX.innerText = targetPoint.x.toFixed(2);
      if (this.hudY) this.hudY.innerText = (-targetPoint.y).toFixed(2);
    }
  }
  
  /**
   * Renderiza el indicador de OSNAP
   */
  renderSnapMarker(point, type) {
    // 1. Obtener referencias seguras a las capas
    const hudLayer = this.utils?.hudLayer || paper.project?.layers?.['hudLayer'];
    const drawLayer = this.utils?.drawLayer || paper.project?.layers?.['drawLayer'];

    // Activar capa HUD
    if (hudLayer) hudLayer.activate();

    // 2. Lazy Initialization del grupo dentro de la capa activa (hudLayer)
    if (!this.snapMarkersGroup) {
      this.snapMarkersGroup = new paper.Group();
      this.snapMarkersGroup.name = 'snapMarkersGroup';
    } else {
      this.snapMarkersGroup.removeChildren();
    }

    this.lastSnapPoint = point;
    this.lastSnapType = type;

    // Si no hay punto ni tipo activo, limpia y restaura la capa de dibujo
    if (!point || !type || type === 'none') {
      if (drawLayer) drawLayer.activate();
      return;
    }

    const zoom = paper.view.zoom;
    const { 
      snapStrokeColor, 
      snapFillColor, 
      snapBgColor, 
      snapStrokeWidthPx, 
      snapMarkerSizePx, 
      extensionFactor 
    } = CAD_THEME.hud;

    const size = snapMarkerSizePx / zoom;
    const strokeWidth = snapStrokeWidthPx / zoom;
    const strokeColor = snapStrokeColor;
    const fillColor = snapFillColor;

    if (type === 'node') {
      const circle = new paper.Path.Circle({
        center: point,
        radius: size * 0.5,
        strokeColor: strokeColor,
        strokeWidth: strokeWidth,
        fillColor: fillColor
      });
      const innerDot = new paper.Path.Circle({
        center: point,
        radius: size * 0.15,
        fillColor: strokeColor
      });
      this.snapMarkersGroup.addChild(circle);
      this.snapMarkersGroup.addChild(innerDot);
    } else if (type === 'endpoint') {
      const rect = new paper.Path.Rectangle({
        center: point,
        size: [size, size],
        strokeColor: strokeColor,
        strokeWidth: strokeWidth,
        fillColor: fillColor
      });
      this.snapMarkersGroup.addChild(rect);
    } else if (type === 'midpoint') {
      const triangle = new paper.Path.RegularPolygon({
        center: point,
        sides: 3,
        radius: size * 0.6,
        strokeColor: strokeColor,
        strokeWidth: strokeWidth,
        fillColor: fillColor
      });
      this.snapMarkersGroup.addChild(triangle);
    } else if (type === 'intersection') {
      const half = size * 0.5;
      const bgHalf = half * extensionFactor;

      // 1. Líneas de FONDO (mismo espesor, 20% más largas, en '#10141d')
      const bgLine1 = new paper.Path.Line(
        point.subtract(new paper.Point(bgHalf, bgHalf)),
        point.add(new paper.Point(bgHalf, bgHalf))
      );
      const bgLine2 = new paper.Path.Line(
        point.subtract(new paper.Point(-bgHalf, bgHalf)),
        point.add(new paper.Point(-bgHalf, bgHalf))
      );
      bgLine1.strokeColor = bgLine2.strokeColor = snapBgColor;
      bgLine1.strokeWidth = bgLine2.strokeWidth = strokeWidth;

      // 2. Líneas FRENTE (tamaño normal, color principal)
      const line1 = new paper.Path.Line(
        point.subtract(new paper.Point(half, half)),
        point.add(new paper.Point(half, half))
      );
      const line2 = new paper.Path.Line(
        point.subtract(new paper.Point(-half, half)),
        point.add(new paper.Point(-half, half))
      );
      line1.strokeColor = line2.strokeColor = strokeColor;
      line1.strokeWidth = line2.strokeWidth = strokeWidth * 1.4;

      // 3. Agregar al grupo en orden de apilamiento (Fondo primero, Frente al final)
      this.snapMarkersGroup.addChild(bgLine1);
      this.snapMarkersGroup.addChild(bgLine2);
      this.snapMarkersGroup.addChild(line1);
      this.snapMarkersGroup.addChild(line2);
    } else if (type === 'grid') {
      const gridCircle = new paper.Path.Circle({
        center: point,
        radius: size * 0.35,
        fillColor: strokeColor
      });
      this.snapMarkersGroup.addChild(gridCircle);
    } else if (type === 'center') {
      // Marcador de Centro (+ / Círculo)
      const centerCircle = new paper.Path.Circle({
        center: point,
        radius: size * 0.5,
        strokeColor: strokeColor,
        strokeWidth: strokeWidth,
        fillColor: fillColor
      });
      this.snapMarkersGroup.addChild(centerCircle);
    } else if (type === 'quadrant') {
      // Marcador de Cuadrante (Diamante / Rombo perfecto)
      const diamond = new paper.Path.RegularPolygon({
        center: point,
        sides: 4,
        radius: size * 0.55,
        strokeColor: strokeColor,
        strokeWidth: strokeWidth,
        fillColor: fillColor
      });
      // Rotamos 45 grados para transformarlo en un diamante
      diamond.rotate(45, point);
      this.snapMarkersGroup.addChild(diamond);
    }

    // Traer la capa entera al frente y restaurar capa de dibujo
    if (hudLayer) hudLayer.bringToFront();
    if (drawLayer) drawLayer.activate();
  }

  // Refresca escala del marcador en zoom/pan
  refreshSnapMarkerScale() {
    if (this.lastSnapPoint && this.lastSnapType) {
      this.renderSnapMarker(this.lastSnapPoint, this.lastSnapType);
    }
  }

  _refreshDOMReferences() {
    if (!this.hudX || !this.hudX.isConnected) this.hudX = document.getElementById('hudX');
    if (!this.hudY || !this.hudY.isConnected) this.hudY = document.getElementById('hudY');
    if (!this.hudZoom || !this.hudZoom.isConnected) this.hudZoom = document.getElementById('hudZoom');
  }

  /**
   * Renderiza las etiquetas flotantes de Distancia y Ángulo durante el trazado
   */
  updateFeedbackLabels(fromPt, toPt) {
    if (!fromPt || !toPt || !this.utils.activePath) {
      if (this.feedbackGroup) this.feedbackGroup.visible = false;
      return;
    }

    if (!this.feedbackGroup) {
      this.setupFeedbackLabels();
    }

    const vector = toPt.subtract(fromPt);
    const distance = vector.length;
    let angle = -vector.angle;
    if (angle < 0) angle += 360;

    const zoom = paper.view.zoom;
    this.feedbackGroup.visible = true;

    const offset = new paper.Point(15 / zoom, -15 / zoom);
    const labelPos = toPt.add(offset);

    this.feedbackTextDistance.position = labelPos;
    this.feedbackTextDistance.fontSize = 11 / zoom;
    this.feedbackTextDistance.content = `L: ${distance.toFixed(2)}`;

    if (this.feedbackTextAngle) {
      this.feedbackTextAngle.position = labelPos.add(new paper.Point(0, 14 / zoom));
      this.feedbackTextAngle.fontSize = 10 / zoom;
      this.feedbackTextAngle.content = `A: ${angle.toFixed(1)}°`;
    }
  }

  clear() {
    if (this.snapMarkersGroup) {
      this.snapMarkersGroup.removeChildren();
    }
    this.lastSnapPoint = null;
    this.lastSnapType = null;
    if (this.feedbackGroup) {
      this.feedbackGroup.visible = false;
    }
  }

  cleanup() {
    // Coincidencia exacta con las opciones de addEventListener
    window.removeEventListener('pointermove', this._pointerMoveHandler, { passive: true });

    this.clear();
    if (this.feedbackGroup) {
      this.feedbackGroup.remove();
      this.feedbackGroup = null;
    }
    if (this.snapMarkersGroup) {
      this.snapMarkersGroup.remove();
      this.snapMarkersGroup = null;
    }

    this.hudX = null;
    this.hudY = null;
    this.hudZoom = null;
    this.currentElementUnderCursor = null;
  }

}

