/**
 * tools/PolylineTool.js - Herramienta para dibujado de Polilíneas continuas
 */

import { BaseTool } from './BaseTool.js';

export class PolylineTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'POLYLINE. Haz clic para colocar el primer punto.';
  }

  onMouseDown(event) {
    // Procesar ÚNICAMENTE el clic izquierdo (ignora clic derecho)
    if (event.event.button !== 0) return;

    const isShift = event.event ? event.event.shiftKey : false;
    let pt = event.point;

    // 1. Evaluar OSNAP sobre el punto REAL del cursor del ratón
    const osnap = this.service.calculateOsnap(
      event.point, 
      (snapPt, type) => this.utils.hud.renderSnapMarker(snapPt, type),
      this.utils.activePath
    );

    if (osnap.type) {
      // Si hay atracción magnética, toma el punto OSNAP exacto
      pt = osnap.point;
    } else if (this.utils.activePath && this.utils.activePath.lastSegment && isShift) {
      // 2. Si no hay OSNAP y Shift está presionado, aplica restricción ORTHO respecto al último vértice
      const lastPt = this.utils.activePath.lastSegment.point;
      pt = this.utils.applyOrthoConstraint(lastPt, event.point, true);
    }

    if (!this.utils.activePath) {
      // Crear polilínea nueva en el primer clic
      this.utils.activePath = new paper.Path({
        segments: [pt]
      });

      if (!this.utils.activePath.data) this.utils.activePath.data = {};

      // Auto-nombrar la polilínea secuencialmente ('Polilínea 1', 'Polilínea 2', ...)
      const polyName = this.utils.generateNextEntityName ? this.utils.generateNextEntityName('Polilínea') : 'Polilínea';
      this.utils.activePath.name = polyName;
      this.utils.activePath.data.name = polyName;

      // Aplicar propiedades por defecto (Capa, Color, Grosor, Opacidad)
      if (this.utils.propertyManager) {
        this.utils.propertyManager.applyDefaultSettings(this.utils.activePath);
      }

      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.setPrompt('Especifique el siguiente punto o [ENTER / Clic derecho para finalizar]:');
    } else {
      const firstPt = this.utils.activePath.firstSegment.point;
      const snapTolerance = 10 / paper.view.zoom;

      // Auto-Cierre: Si hace clic/OSNAP en el primer punto de la polilínea
      if (osnap.type === 'endpoint' && pt.getDistance(firstPt) < snapTolerance) {
        this.utils.activePath.closed = true;
        this.utils.finishCurrentDrawing();
        this.setPrompt(this.promptText);
        return;
      }

      // Evitar duplicar el último punto
      if (this.utils.activePath.lastSegment) {
        const lastPt = this.utils.activePath.lastSegment.point;
        if (lastPt.getDistance(pt) < 0.001) {
          return;
        }
      }

      this.utils.activePath.add(pt);
      this.utils.selectionRenderEngine.updateEntitiesStroke();
    }
  }

  onMouseMove(event) {
    const isShift = event.event ? event.event.shiftKey : false;
    let pt = event.point;

    // 1. Evaluar OSNAP directamente en el cursor real del ratón
    const osnap = this.service.calculateOsnap(
      event.point, 
      (snapPt, type) => this.utils.hud.renderSnapMarker(snapPt, type),
      this.utils.activePath
    );

    if (osnap.type) {
      pt = osnap.point;
    } else if (this.utils.activePath && this.utils.activePath.segments.length > 0 && isShift) {
      // 2. Si no hay enganche OSNAP, aplicar restricción ORTHO respecto al último vértice
      const lastPt = this.utils.activePath.lastSegment.point;
      pt = this.utils.applyOrthoConstraint(lastPt, event.point, true);
    }

    this.utils.hud.updateHUD(pt);

    if (this.utils.activePath && this.utils.activePath.segments.length > 0) {
      const lastPt = this.utils.activePath.lastSegment.point;
      const propMgr = this.utils.propertyManager;

      const activeColor = propMgr ? propMgr.getResolvedColor(this.utils.activePath) : '#00e5ff';
      const activeOpacity = propMgr && typeof propMgr.getResolvedOpacity === 'function'
        ? propMgr.getResolvedOpacity(this.utils.activePath)
        : (this.utils.activePath.opacity !== undefined ? this.utils.activePath.opacity : 1);

      if (!this.utils.rubberBandLine) {
        this.utils.rubberBandLine = new paper.Path.Line({
          from: lastPt,
          to: pt,
          strokeColor: activeColor,
          strokeWidth: 1 / paper.view.zoom,
          dashArray: [2 / paper.view.zoom, 2 / paper.view.zoom],
          opacity: activeOpacity
        });
      } else {
        this.utils.rubberBandLine.firstSegment.point = lastPt;
        this.utils.rubberBandLine.lastSegment.point = pt;
        this.utils.rubberBandLine.strokeColor = activeColor;
        this.utils.rubberBandLine.opacity = activeOpacity;
      }

      this.utils.hud.updateFeedbackLabels(lastPt, pt);
    }
  }

  // Limpieza al cambiar/desactivar la herramienta
  cancel() {
    if (this.utils.activePath) {
      this.utils.finishCurrentDrawing();
    }
  }

  // Clic derecho: 1.° finaliza el trazo activo, 2.° sale a Selección
  onContextMenu(event) {
    if (this.utils.activePath) {
      this.utils.finishCurrentDrawing();
      this.setPrompt(this.promptText);
    } else {
      this.exitToSelect();
    }
    return true;
  }
}