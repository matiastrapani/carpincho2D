/**
 * tools/LineTool.js - Herramienta de dibujado de líneas simples y encadenadas
 */
class LineTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'LINE. Haz clic en el primer punto.';
  }

  onMouseDown(event) {
    // Clic derecho -> Finalizar trazado
    if (event.event.button === 2) {
      this.utils.finishCurrentDrawing();
      return;
    }

    if (event.event.button === 0) {
      const isShift = event.event ? event.event.shiftKey : false;
      let pt = event.point;

      // 1. Evaluar OSNAP sobre el punto REAL del cursor del ratón
      const osnap = this.service.calculateOsnap(
        event.point, 
        (snapPt, type) => this.utils.renderSnapMarker(snapPt, type)
      );

      if (osnap.type) {
        // Si hay atracción magnética, toma el punto OSNAP exacto
        pt = osnap.point;
      } else if (this.utils.activePath && isShift) {
        // 2. Si no hay OSNAP y Shift está presionado, aplica restricción ORTHO
        const startPt = this.utils.activePath.firstSegment.point;
        pt = this.utils.applyOrthoConstraint(startPt, event.point, true);
      }

      const propMgr = this.utils.propertyManager;

      if (!this.utils.activePath) {
        // Primer clic: Iniciar segmento
        this.utils.activePath = new paper.Path.Line({
          from: pt, 
          to: pt
        });

        if (!this.utils.activePath.data) this.utils.activePath.data = {};

        if (propMgr) {
          propMgr.applyDefaultSettings(this.utils.activePath);
        }

        this.utils.updateEntitiesStroke();
        this.setPrompt('Especifique el punto final de la línea:');
      } else {
        // Segundo clic: Confirmar segmento actual
        this.utils.activePath.lastSegment.point = pt;
        
        // Registrar en historial Undo / Redo
        const cmd = new AddLineCommand(this.service, this.utils.activePath);
        this.service.executeCommand(cmd);

        // Encadenar siguiente segmento leyendo los ajustes por defecto ACTUALES
        const startNextPt = pt.clone();
        const nextPath = new paper.Path.Line({
          from: startNextPt,
          to: startNextPt
        });

        if (!nextPath.data) nextPath.data = {};

        if (propMgr) {
          propMgr.applyDefaultSettings(nextPath);
        }

        this.utils.activePath = nextPath;
        this.utils.updateEntitiesStroke();

        if (this.utils.rubberBandLine) {
          this.utils.rubberBandLine.remove();
          this.utils.rubberBandLine = null;
        }

        this.setPrompt('Especifique el punto siguiente o presione ENTER/ESC para finalizar:');
        this.utils.renderBezierHandles();

      }
    }
  }

  onMouseMove(event) {
    const isShift = event.event ? event.event.shiftKey : false;
    let pt = event.point;

    // 1. Evaluar OSNAP directamente en el cursor del ratón
    const osnap = this.service.calculateOsnap(
      event.point, 
      (snapPt, type) => this.utils.renderSnapMarker(snapPt, type)
    );

    if (osnap.type) {
      pt = osnap.point;
    } else if (this.utils.activePath && isShift) {
      // 2. Si no hay enganche OSNAP, aplicar restricción ORTHO sobre la elástica
      const lastConfirmedPt = this.utils.activePath.firstSegment.point;
      pt = this.utils.applyOrthoConstraint(lastConfirmedPt, event.point, true);
    }

    this.utils.updateHUD(pt);

    if (this.utils.activePath) {
      const lastConfirmedPt = this.utils.activePath.firstSegment.point;
      const propMgr = this.utils.propertyManager;
      const activeColor = propMgr ? propMgr.getResolvedColor(this.utils.activePath) : '#00e5ff';

      if (!this.utils.rubberBandLine) {
        this.utils.rubberBandLine = new paper.Path.Line({
          from: lastConfirmedPt, 
          to: pt,
          strokeColor: activeColor,
          strokeWidth: 1 / paper.view.zoom,
          dashArray: [2 / paper.view.zoom, 2 / paper.view.zoom]
        });
      } else {
        this.utils.rubberBandLine.firstSegment.point = lastConfirmedPt;
        this.utils.rubberBandLine.lastSegment.point = pt;
        this.utils.rubberBandLine.strokeColor = activeColor;
      }

      this.utils.updateFeedbackLabels(lastConfirmedPt, pt);
    }
  }

  cancel() {
    this.utils.finishCurrentDrawing();
  }
}

window.LineTool = LineTool;