/**
 * tools/LineTool.js - Herramienta de dibujado de líneas simples y encadenadas
 */

import { BaseTool } from './BaseTool.js';
import { AddLineCommand } from '../services/commands/cadCommands.js';

export class LineTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'LINE. Haz clic en el primer punto.';
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) {
      return;
    }

    const isShift = event.event ? event.event.shiftKey : false;
    let pt = event.point;

    const osnap = this.service.calculateOsnap(
      event.point, 
      (snapPt, type) => this.utils.hud.renderSnapMarker(snapPt, type)
    );

    if (osnap && osnap.type) {
      pt = osnap.point;
    } else if (this.utils.activePath) {
      const startPt = this.utils.activePath.firstSegment.point;
      pt = this.utils.applyOrthoConstraint(startPt, event.point, isShift);
    }

    const propMgr = this.utils.propertyManager;

    if (!this.utils.activePath) {
      const draftPath = new paper.Path.Line({
        from: pt,
        to: pt
      });
      draftPath.data = {
        isDynamicStroke: true,
        baseStrokeWidth: 1
      };

      if (propMgr) {
        propMgr.applyDefaultSettings(draftPath);
      }

      this.utils.activePath = draftPath;
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.setPrompt('Especifique el punto final de la línea:');
    } else {
      const startPt = this.utils.activePath.firstSegment.point;
      if (startPt.getDistance(pt) < 0.001) {
        return;
      }

      const confirmedLine = this.utils.activePath;
      confirmedLine.lastSegment.point = pt;
      this.utils.activePath = null;

      this.commitNewEntity(confirmedLine, 'Línea', AddLineCommand);

      const startNextPt = pt.clone();
      const nextDraftPath = new paper.Path.Line({
        from: startNextPt,
        to: startNextPt
      });
      nextDraftPath.data = {
        isDynamicStroke: true,
        baseStrokeWidth: 1
      };

      if (propMgr) {
        propMgr.applyDefaultSettings(nextDraftPath);
      }

      this.utils.activePath = nextDraftPath;
      this.utils.selectionRenderEngine.updateEntitiesStroke();

      if (this.utils.rubberBandLine) {
        this.utils.rubberBandLine.remove();
        this.utils.rubberBandLine = null;
      }

      this.setPrompt('Especifique el punto siguiente o presione ENTER/ESC para finalizar:');
      if (this.utils.selectionRenderEngine.renderBezierHandles) {
        this.utils.selectionRenderEngine.renderBezierHandles();
      }
    }
  }

  onMouseMove(event) {
    const isShift = event.event ? event.event.shiftKey : false;
    let pt = event.point;

    const osnap = this.service.calculateOsnap(
      event.point, 
      (snapPt, type) => this.utils.hud.renderSnapMarker(snapPt, type)
    );

    if (osnap.type) {
      pt = osnap.point;
    } else if (this.utils.activePath) {
      const lastConfirmedPt = this.utils.activePath.firstSegment.point;
      pt = this.utils.applyOrthoConstraint(lastConfirmedPt, event.point, isShift);
    }

    this.utils.hud.updateHUD(pt);

    if (this.utils.activePath) {
      const lastConfirmedPt = this.utils.activePath.firstSegment.point;
      const propMgr = this.utils.propertyManager;
      
      const activeColor = propMgr ? propMgr.getResolvedColor(this.utils.activePath) : '#00e5ff';
      const activeOpacity = propMgr && typeof propMgr.getResolvedOpacity === 'function'
        ? propMgr.getResolvedOpacity(this.utils.activePath)
        : (this.utils.activePath.opacity !== undefined ? this.utils.activePath.opacity : 1);

      if (!this.utils.rubberBandLine) {
        this.utils.rubberBandLine = new paper.Path.Line({
          from: lastConfirmedPt, 
          to: pt,
          strokeColor: activeColor,
          strokeWidth: 1 / paper.view.zoom,
          dashArray: [2 / paper.view.zoom, 2 / paper.view.zoom],
          opacity: activeOpacity
        });
      } else {
        this.utils.rubberBandLine.firstSegment.point = lastConfirmedPt;
        this.utils.rubberBandLine.lastSegment.point = pt;
        this.utils.rubberBandLine.strokeColor = activeColor;
        this.utils.rubberBandLine.opacity = activeOpacity;
      }

      this.utils.hud.updateFeedbackLabels(lastConfirmedPt, pt);
    }
  }

  cancel() {
    this.utils.finishCurrentDrawing();
  }
}