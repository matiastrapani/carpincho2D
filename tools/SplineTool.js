/**
 * tools/SplineTool.js - Herramienta para dibujado de Curvas Suaves (Splines)
 */
class SplineTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'Command: SPLINE. Haz clic para colocar puntos de la curva suave.';
  }

  onMouseDown(event) {
    // Clic Derecho -> Finalizar spline actual
    if (event.event.button === 2) {
      if (this.utils.activePath) {
        this.utils.finishCurrentDrawing();
      }
      return;
    }

    if (event.event.button === 0) {
      const osnap = this.service.calculateOsnap(
        event.point, 
        (pt, type) => this.utils.renderSnapMarker(pt, type)
      );
      const pt = osnap.point;

      if (!this.utils.activePath) {
        this.utils.activePath = new paper.Path({
          strokeColor: '#10b981',
          strokeWidth: 2,
          segments: [pt]
        });
        
        // Asignación de metadatos no dinámicos con espesor de 2 unidades
        this.utils.activePath.data = { 
          isSpline: true,
          isDynamicStroke: false,
          baseStrokeWidth: 2,
          origStrokeColor: '#10b981',
          origStrokeWidth: 2
        };
        
        this.setPrompt('Specify next spline point:');
      } else {

        // Validación común al añadir un nuevo vértice en Polyline, Spline o Bezier
        if (this.utils.activePath && this.utils.activePath.lastSegment) {
          const lastPt = this.utils.activePath.lastSegment.point;
          if (lastPt.getDistance(pt) < 0.001) {
            return; // Ignorar clic consecutivo en el mismo punto
          }
        }
        this.utils.activePath.add(pt);
        this.utils.activePath.smooth({ type: 'catmull-rom' });
      }
    }
  }

  onMouseMove(event) {
    const osnap = this.service.calculateOsnap(
      event.point, 
      (pt, type) => this.utils.renderSnapMarker(pt, type)
    );
    const pt = osnap.point;
    this.utils.updateHUD(pt);

    if (this.utils.activePath && this.utils.activePath.segments.length > 0) {
      const lastPt = this.utils.activePath.lastSegment.point;

      if (!this.utils.rubberBandLine) {
        this.utils.rubberBandLine = new paper.Path.Line({
          from: lastPt,
          to: pt,
          strokeColor: '#10b981',
          strokeWidth: 1 / paper.view.zoom,
          dashArray: [2 / paper.view.zoom, 2 / paper.view.zoom]
        });
      } else {
        this.utils.rubberBandLine.firstSegment.point = lastPt;
        this.utils.rubberBandLine.lastSegment.point = pt;
      }

      this.utils.updateFeedbackLabels(lastPt, pt);
    }
  }

  cancel() {
    if (this.utils.activePath) {
      this.utils.finishCurrentDrawing();
    }
  }
}

window.SplineTool = SplineTool;