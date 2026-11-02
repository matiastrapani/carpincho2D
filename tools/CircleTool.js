/**
 * tools/CircleTool.js - Herramienta de Creación de Círculo (Centro y Radio)
 * Incluye previsualización dinámica con línea guía punteada desde el centro al radio.
 */
class CircleTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.centerPoint = null;
    this.previewCircle = null;
    this.previewRadiusLine = null; // Línea guía punteada
  }

  onMouseDown(event) {
    if (event.event.button !== 0) return; // Solo procesar clic izquierdo

    const isShift = event.event ? event.event.shiftKey : false;
    let pt = event.point.clone();

    // 1. Evaluar OSNAP sobre la posición REAL del cursor del ratón
    const osnap = this.service.calculateOsnap(
      event.point, 
      (snapPt, type) => this.utils.renderSnapMarker(snapPt, type)
    );

    if (osnap.type) {
      // Si hay atracción magnética, toma el punto OSNAP exacto
      pt = osnap.point;
    } else if (this.centerPoint && isShift) {
      // 2. Si no hay OSNAP y Shift está presionado, aplica restricción ORTHO respecto al centro
      pt = this.utils.applyOrthoConstraint(this.centerPoint, event.point, true);
    }

    // PASO 1: Fijar el Punto Central
    if (!this.centerPoint) {
      this.centerPoint = pt;
      this.utils.setPrompt('Specify radius or point on circle:');
      return;
    }

    // PASO 2: Fijar el Radio y Confirmar la Entidad
    const radius = this.centerPoint.getDistance(pt);
    if (radius > 0.001) {
      this.service.createCircleEntity(this.centerPoint, radius, true, 1);
    }

    this.resetTool();
  }

  onMouseMove(event) {
    this.utils.clearHUD();
    const isShift = event.event ? event.event.shiftKey : false;
    let pt = event.point.clone();

    // 1. Evaluar OSNAP directamente en el cursor real del ratón
    const osnap = this.service.calculateOsnap(
      event.point, 
      (snapPt, type) => this.utils.renderSnapMarker(snapPt, type)
    );

    if (osnap.type) {
      pt = osnap.point;
    } else if (this.centerPoint && isShift) {
      // 2. Si no hay enganche OSNAP, aplicar restricción ORTHO respecto al centro fijado
      pt = this.utils.applyOrthoConstraint(this.centerPoint, event.point, true);
    }

    // Si el centro ya está definido, renderizamos el círculo y la línea de radio
    if (this.centerPoint) {
      const currentRadius = this.centerPoint.getDistance(pt);
      const zoom = paper.view.zoom;
      const dashStyle = [2 / zoom, 2 / zoom];

      // Limpiar previews anteriores
      this.clearPreviews();

      // 1. Círculo Dinámico Punteado
      this.previewCircle = new paper.Path.Circle({
        center: this.centerPoint,
        radius: currentRadius,
        strokeColor: '#3b82f6',
        strokeWidth: 1 / zoom,
        dashArray: dashStyle
      });

      // 2. Línea Guía de Radio Punteada (Centro -> Cursor)
      this.previewRadiusLine = new paper.Path.Line({
        from: this.centerPoint,
        to: pt,
        strokeColor: '#3b82f6',
        strokeWidth: 1 / zoom,
        dashArray: dashStyle
      });

      // Actualizar información flotante (HUD) de distancia/radio
      this.utils.updateFeedbackLabels(this.centerPoint, pt);
    } else {
      this.utils.updateHUD(pt);
    }
  }

  clearPreviews() {
    if (this.previewCircle) {
      this.previewCircle.remove();
      this.previewCircle = null;
    }
    if (this.previewRadiusLine) {
      this.previewRadiusLine.remove();
      this.previewRadiusLine = null;
    }
  }

  resetTool() {
    this.clearPreviews();
    this.centerPoint = null;
    this.utils.clearHUD();
    this.utils.setPrompt('Command:');
    paper.view.update();
  }

  cancel() {
    this.resetTool();
  }
}

window.CircleTool = CircleTool;