/**
 * tools/SplineTool.js - Herramienta para dibujado de Curvas Suaves (Splines)
 */

import { BaseTool } from './BaseTool.js';

export class SplineTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'SPLINE. Haz clic para colocar el primer punto de la curva suave.';
  }

  onMouseDown(event) {
    // Procesar ÚNICAMENTE el clic izquierdo
    if (event.event && event.event.button !== 0) return;

    const osnap = this.service.calculateOsnap(
      event.point, 
      (snapPt, type) => this.utils.hud.renderSnapMarker(snapPt, type)
    );
    const pt = osnap.point;

    if (!this.utils.activePath) {
      this.utils.activePath = new paper.Path({
        segments: [pt]
      });

      if (!this.utils.activePath.data) this.utils.activePath.data = {};
      this.utils.activePath.data.isSpline = true;

      // Auto-nombrar entidad de forma secuencial ('Spline 1', 'Spline 2', ...)
      const splineName = this.utils.generateNextEntityName ? this.utils.generateNextEntityName('Spline') : 'Spline';
      this.utils.activePath.name = splineName;
      this.utils.activePath.data.name = splineName;

      // Aplicar propiedades por defecto (Capa, Color, Grosor, Opacidad)
      if (this.utils.propertyManager) {
        this.utils.propertyManager.applyDefaultSettings(this.utils.activePath);
      }

      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.setPrompt('Especifique el siguiente punto de la curva o [ENTER / Clic derecho para finalizar]:');
    } else {
      // Validación para evitar puntos duplicados consecutivos
      if (this.utils.activePath.lastSegment) {
        const lastPt = this.utils.activePath.lastSegment.point;
        if (lastPt.getDistance(pt) < 0.001) {
          return;
        }
      }

      this.utils.activePath.add(pt);
      this.utils.activePath.smooth({ type: 'catmull-rom' });
      this.utils.selectionRenderEngine.updateEntitiesStroke();
    }
  }

  onMouseMove(event) {
    const osnap = this.service.calculateOsnap(
      event.point, 
      (pt, type) => this.utils.hud.renderSnapMarker(pt, type)
    );
    const pt = osnap.point;
    this.utils.hud.updateHUD(pt);

    if (this.utils.activePath && this.utils.activePath.segments.length > 0) {
      const lastPt = this.utils.activePath.lastSegment.point;
      const propMgr = this.utils.propertyManager;

      const activeColor = propMgr ? propMgr.getResolvedColor(this.utils.activePath) : '#10b981';
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

  // Desactivación estándar invocada por ToolManager
  cancel() {
    if (this.utils.activePath) {
      this.utils.finishCurrentDrawing();
    }
  }

  // Clic derecho: 1.° finaliza el trazo de la spline, 2.° sale a Selección
  onContextMenu(event) {
    if (this.utils.activePath) {
      this.utils.finishCurrentDrawing();
      this.setPrompt(this.promptText);
    } else {
      this.exitToSelect();
    }
    return true;
  }

  cancelAndExit() {
    if (this.utils.activePath) {
      this.utils.finishCurrentDrawing();
    }
    this.utils.setTool('select');
  }
}