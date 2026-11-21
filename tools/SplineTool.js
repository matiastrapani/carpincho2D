/**
 * tools/SplineTool.js - Herramienta para dibujado de Curvas Suaves (Splines)
 */

import { BaseTool } from './BaseTool.js';

export class SplineTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'SPLINE. Haz clic para colocar el primer punto de la curva suave.';
    this.previewLine = null;
  }

  _resolveNextPoint(rawPoint, isShift) {
    const activePath = this.utils.activePath;
    const fromPoint = (activePath && activePath.lastSegment) ? activePath.lastSegment.point : null;
    const disableFromPoint = Boolean(activePath && activePath.segments.length >= 2);

    return this.utils.resolveConstrainedPoint(rawPoint, {
      fromPoint,
      isShift,
      excludeEntity: activePath,
      disableFromPoint
    });
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) return;

    const isShift = event.event ? Boolean(event.event.shiftKey) : false;
    const pt = this._resolveNextPoint(event.point, isShift);

    if (!this.utils.activePath) {
      this._beginActivePath(
        pt,
        'Especifique el siguiente punto de la curva o [ENTER / Clic derecho para finalizar]:',
        { isSpline: true }
      );
    } else {
      const firstPt = this.utils.activePath.firstSegment.point;
      const snapTolerance = 10 / this.paper.view.zoom;

      if (this.utils.activePath.segments.length >= 2 && pt.getDistance(firstPt) < snapTolerance) {
        this.utils.activePath.closed = true;
        this.utils.activePath.smooth({ type: 'catmull-rom' });
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
      this.utils.activePath.smooth({ type: 'catmull-rom' });
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.previewLine = this.syncLineGuide(this.previewLine, pt, pt);
    }
  }

  onMouseMove(event) {
    this.utils.hud.clear();
    const isShift = event.event ? Boolean(event.event.shiftKey) : false;
    const pt = this._resolveNextPoint(event.point, isShift);

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
    this._commitOrDiscardActivePath('Spline');
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

  // Desactivación estándar invocada por ToolManager
  cancel() {
    this.clearPreviews();
    if (this.utils.activePath) {
      this._finishActivePath();
    }
  }

  // Clic derecho: 1.° finaliza el trazo de la spline, 2.° sale a Selección
  onContextMenu(event) {
    if (this.utils.activePath) {
      this._finishActivePath();
    } else {
      this.exitToSelect();
    }
    return true;
  }

  cancelAndExit() {
    this.cancel();
    this.utils.setTool('select');
  }
}