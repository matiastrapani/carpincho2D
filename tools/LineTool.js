/**
 * tools/LineTool.js - Herramienta de dibujado de líneas simples y encadenadas
 */

import { BaseTool } from './BaseTool.js';
import { AddLineCommand } from '../services/commands/cadCommands.js';

export class LineTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'LINE. Haz clic en el primer punto.';
    this.startPoint = null;
    this.previewLine = null;
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) {
      return;
    }

    const isShift = event.event ? Boolean(event.event.shiftKey) : false;
    const pt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint: this.startPoint,
      isShift
    });

    if (!this.startPoint) {
      this.startPoint = pt.clone();
      this.setPrompt('Especifique el punto final de la línea:');
      return;
    }

    if (this.startPoint.getDistance(pt) < 0.001) {
      return;
    }

    const lineEntity = this.service.createLineEntity(this.startPoint, pt, true, 1);
    if (lineEntity) {
      this.commitNewEntity(lineEntity, 'Línea', AddLineCommand);
    }

    this.startPoint = pt.clone();
    this.previewLine = this.syncLineGuide(this.previewLine, this.startPoint, pt);
    this.setPrompt('Especifique el punto siguiente o presione ENTER/ESC para finalizar:');
  }

  onMouseMove(event) {
    this.utils.hud.clear();
    const isShift = event.event ? Boolean(event.event.shiftKey) : false;
    const pt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint: this.startPoint,
      isShift
    });

    this.utils.hud.updateHUD(pt);

    if (this.startPoint) {
      this.previewLine = this.syncLineGuide(this.previewLine, this.startPoint, pt);
      this.utils.hud.updateFeedbackLabels(this.startPoint, pt);
    }
  }

  clearPreviews() {
    if (this.previewLine) {
      this.previewLine.remove();
      this.previewLine = null;
    }
  }

  resetTool() {
    this.clearPreviews();
    this.startPoint = null;
    this.utils.hud.clear();
    this.setPrompt(this.promptText);
    this.paper.view.update();
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    if (key === 'Enter' && this.startPoint) {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      this.resetTool();
      return true;
    }
    return super.onKeyDown(event);
  }

  onContextMenu(event) {
    if (this.startPoint) {
      this.resetTool();
    } else {
      this.exitToSelect();
    }
    return true;
  }

  cancel() {
    this.resetTool();
  }
}