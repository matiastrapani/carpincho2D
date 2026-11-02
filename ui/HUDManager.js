/**
 * ui/HUDManager.js - Gestión de Overlays, Coordenadas y Marcadores Visuales (OSNAP/HUD)
 */
class HUDManager {
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

    this.initDOM();
  }

  initDOM() {
    this.hudX = document.getElementById('hudX');
    this.hudY = document.getElementById('hudY');
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

    const hudX = document.getElementById('hudX');
    const hudY = document.getElementById('hudY');
    const hudZoom = document.getElementById('hudZoom');

    // 1. Actualización de Coordenadas (Y cartesiano invertido)
    if (point) {
      if (hudX) hudX.innerText = point.x.toFixed(2);
      if (hudY) hudY.innerText = (-point.y).toFixed(2);
    }

    // 2. Actualización Porcentual de Zoom
    if (hudZoom) {
      const zoomPercent = Math.round(paper.view.zoom * 100);
      hudZoom.innerText = `${zoomPercent}%`;
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
    const size = 12 / zoom;
    const strokeWidth = 1.5 / zoom;

    if (type === 'node') {
      const circle = new paper.Path.Circle({
        center: point,
        radius: size * 0.5,
        strokeColor: '#34d399',
        strokeWidth: strokeWidth,
        fillColor: new paper.Color(0.2, 0.8, 0.5, 0.2)
      });
      const innerDot = new paper.Path.Circle({
        center: point,
        radius: size * 0.15,
        fillColor: '#34d399'
      });
      this.snapMarkersGroup.addChild(circle);
      this.snapMarkersGroup.addChild(innerDot);
    } else if (type === 'endpoint') {
      const rect = new paper.Path.Rectangle({
        center: point,
        size: [size, size],
        strokeColor: '#34d399',
        strokeWidth: strokeWidth,
        fillColor: new paper.Color(0.2, 0.8, 0.5, 0.25)
      });
      this.snapMarkersGroup.addChild(rect);
    } else if (type === 'midpoint') {
      const triangle = new paper.Path.RegularPolygon({
        center: point,
        sides: 3,
        radius: size * 0.6,
        strokeColor: '#34d399',
        strokeWidth: strokeWidth,
        fillColor: new paper.Color(0.2, 0.8, 0.5, 0.25)
      });
      this.snapMarkersGroup.addChild(triangle);
    } else if (type === 'intersection') {
      const line1 = new paper.Path.Line(
        point.subtract(new paper.Point(size * 0.5, size * 0.5)),
        point.add(new paper.Point(size * 0.5, size * 0.5))
      );
      const line2 = new paper.Path.Line(
        point.subtract(new paper.Point(-size * 0.5, size * 0.5)),
        point.add(new paper.Point(-size * 0.5, size * 0.5))
      );
      line1.strokeColor = line2.strokeColor = '#34d399';
      line1.strokeWidth = line2.strokeWidth = strokeWidth;
      this.snapMarkersGroup.addChild(line1);
      this.snapMarkersGroup.addChild(line2);
    } else if (type === 'grid') {
      const gridCircle = new paper.Path.Circle({
        center: point,
        radius: size * 0.35,
        fillColor: '#34d399'
      });
      this.snapMarkersGroup.addChild(gridCircle);
    } else if (type === 'center') {
      // Marcador de Centro (+ / Círculo)
      const centerCircle = new paper.Path.Circle({
        center: point,
        radius: size * 0.5,
        strokeColor: '#34d399',
        strokeWidth: strokeWidth,
        fillColor: new paper.Color(0.2, 0.8, 0.5, 0.2)
      });
      this.snapMarkersGroup.addChild(centerCircle);
    } else if (type === 'quadrant') {
      // Marcador de Cuadrante (Diamante / Rombo perfecto)
      const diamond = new paper.Path.RegularPolygon({
        center: point,
        sides: 4,
        radius: size * 0.55,
        strokeColor: '#34d399',
        strokeWidth: strokeWidth,
        fillColor: new paper.Color(0.2, 0.8, 0.5, 0.25)
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
}

window.HUDManager = HUDManager;