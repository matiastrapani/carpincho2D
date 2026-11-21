/**
 * tools/PolylineTool.js - Herramienta para dibujado de Polilíneas continuas
 */

import { BaseTool } from './BaseTool.js';

export class PolylineTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'POLYLINE. Haz clic para colocar el primer punto.';
    this.previewLine = null;
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) return;

    const isShift = event.event ? Boolean(event.event.shiftKey) : false;
    const fromPoint = (this.utils.activePath && this.utils.activePath.lastSegment)
      ? this.utils.activePath.lastSegment.point
      : null;

    const pt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint,
      isShift,
      excludeEntity: this.utils.activePath
    });

    if (!this.utils.activePath) {
      this._beginActivePath(pt, 'Especifique el siguiente punto o [ENTER / Clic derecho para finalizar]:');
    } else {
      const firstPt = this.utils.activePath.firstSegment.point;
      const snapTolerance = 10 / this.paper.view.zoom;

      if (this.utils.activePath.segments.length >= 2 && pt.getDistance(firstPt) < snapTolerance) {
        this.utils.activePath.closed = true;
        this._finishActivePath();
        return;
      }

      if (this.utils.activePath.lastSegment) {
        const lastPt = this.utils.activePath.lastSegment.point;
        if (lastPt.getDistance(pt) < 0.001) {
          return;
        }
      }

      this.utils.activePath.add(pt);
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.previewLine = this.syncLineGuide(this.previewLine, pt, pt);
    }
  }

  onMouseMove(event) {
    this.utils.hud.clear();
    const isShift = event.event ? Boolean(event.event.shiftKey) : false;
    const fromPoint = (this.utils.activePath && this.utils.activePath.lastSegment)
      ? this.utils.activePath.lastSegment.point
      : null;

    const pt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint,
      isShift,
      excludeEntity: this.utils.activePath
    });

    this.utils.hud.updateHUD(pt);

    if (this.utils.activePath && this.utils.activePath.segments.length > 0) {
      const lastPt = this.utils.activePath.lastSegment.point;
      this.previewLine = this.syncLineGuide(this.previewLine, lastPt, pt);
      this.utils.hud.updateFeedbackLabels(lastPt, pt);
    }
  }

  clearPreviews() {
    if (this.previewLine) {
      this.previewLine.remove();
      this.previewLine = null;
    }
  }

  _finishActivePath() {
    this.clearPreviews();
    this._commitOrDiscardActivePath('Polilínea');
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    if (key === 'Enter' && this.utils.activePath) {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      this._finishActivePath();
      return true;
    }
    return super.onKeyDown(event);
  }

  // Limpieza al cambiar/desactivar la herramienta
  cancel() {
    this.clearPreviews();
    if (this.utils.activePath) {
      this._finishActivePath();
    }
  }

  // Clic derecho: 1.° finaliza el trazo activo, 2.° sale a Selección
  onContextMenu(event) {
    if (this.utils.activePath) {
      this._finishActivePath();
    } else {
      this.exitToSelect();
    }
    return true;
  }
}