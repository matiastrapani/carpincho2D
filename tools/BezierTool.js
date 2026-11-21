/**
 * tools/BezierTool.js - Herramienta para dibujado de Curvas Bézier interactivas
 */

import { BaseTool } from './BaseTool.js';

export class BezierTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'BÉZIER. Haz clic y arrastra para colocar puntos y manijas. Clic derecho o ENTER para finalizar.';
    this.previewLine = null;
    this._handleGuides = null;
  }

  _resolveNextPoint(rawPoint, isShift) {
    const activePath = this.utils.activePath;
    const lastSeg = (activePath && activePath.lastSegment) ? activePath.lastSegment : null;
    const fromPoint = lastSeg ? lastSeg.point : null;
    const disableFromPoint = Boolean(lastSeg && !lastSeg.handleOut.isZero());

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
      this._beginActivePath(pt, 'Especifique el siguiente punto o [ENTER / Clic derecho para finalizar]:');
    } else {
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

  onMouseDrag(event) {
    if (!this.utils.activePath || !this.utils.activePath.lastSegment) {
      return;
    }

    const isShift = event.event ? Boolean(event.event.shiftKey) : false;
    const lastSeg = this.utils.activePath.lastSegment;

    const dragPt = this.utils.resolveConstrainedPoint(event.point, {
      fromPoint: lastSeg.point,
      isShift,
      excludeEntity: this.utils.activePath
    });

    this.utils.hud.clear();
    this.utils.hud.updateHUD(dragPt);

    const handleVec = dragPt.subtract(lastSeg.point);
    lastSeg.handleOut = handleVec;
    lastSeg.handleIn = handleVec.multiply(-1);

    this.renderBezierPreview();
    if (typeof this.utils.selectionRenderEngine.updateEntitiesStroke === 'function') {
      this.utils.selectionRenderEngine.updateEntitiesStroke();
    }
  }

  onMouseMove(event) {
    this.utils.hud.clear();
    const isShift = event.event ? Boolean(event.event.shiftKey) : false;
    const pt = this._resolveNextPoint(event.point, isShift);

    this.utils.hud.updateHUD(pt);

    if (this.utils.activePath && this.utils.activePath.segments.length > 0) {
      const lastConfirmedPt = this.utils.activePath.lastSegment.point;
      this.previewLine = this.syncLineGuide(this.previewLine, lastConfirmedPt, pt);
      this.utils.hud.updateFeedbackLabels(lastConfirmedPt, pt);
    }
  }

  onMouseUp(event) {
    this.clearHandlePreview();
  }

  _ensureHandlePreviewItems() {
    const hudLayer = this.getHudLayer();

    if (!this._handleGuides) {
      const lineOut = new this.paper.Path.Line({
        from: [0, 0],
        to: [0, 0],
        guide: true,
        data: { isAuxiliary: true },
        insert: false
      });
      const lineIn = new this.paper.Path.Line({
        from: [0, 0],
        to: [0, 0],
        guide: true,
        data: { isAuxiliary: true },
        insert: false
      });
      const circleOut = new this.paper.Path.Circle({
        center: [0, 0],
        radius: 1,
        guide: true,
        data: { isAuxiliary: true },
        insert: false
      });
      const circleIn = new this.paper.Path.Circle({
        center: [0, 0],
        radius: 1,
        guide: true,
        data: { isAuxiliary: true },
        insert: false
      });

      this._handleGuides = { lineOut, lineIn, circleOut, circleIn };
    }

    const { lineOut, lineIn, circleOut, circleIn } = this._handleGuides;
    [lineOut, lineIn, circleOut, circleIn].forEach((item) => {
      if (item.parent !== hudLayer) {
        hudLayer.addChild(item);
      }
    });
  }

  renderBezierPreview() {
    const activePath = this.utils.activePath;
    const seg = (activePath && activePath.lastSegment) ? activePath.lastSegment : null;
    if (!seg || seg.handleOut.isZero()) {
      this.clearHandlePreview();
      return;
    }

    this._ensureHandlePreviewItems();

    const zoom = this.paper.view.zoom || 1;
    const style = this.resolvePreviewStyle();
    const outPt = seg.point.add(seg.handleOut);
    const inPt = seg.point.add(seg.handleIn);
    const handleRadius = 3.5 / zoom;

    const { lineOut, lineIn, circleOut, circleIn } = this._handleGuides;

    lineOut.segments[0].point.set(seg.point.x, seg.point.y);
    lineOut.segments[1].point.set(outPt.x, outPt.y);
    lineOut.strokeColor = style.color;
    lineOut.strokeWidth = style.strokeWidth;
    lineOut.dashArray = style.dashArray;
    lineOut.opacity = style.opacity;

    lineIn.segments[0].point.set(seg.point.x, seg.point.y);
    lineIn.segments[1].point.set(inPt.x, inPt.y);
    lineIn.strokeColor = style.color;
    lineIn.strokeWidth = style.strokeWidth;
    lineIn.dashArray = style.dashArray;
    lineIn.opacity = style.opacity;

    circleOut.position.set(outPt.x, outPt.y);
    circleOut.bounds.width = handleRadius * 2;
    circleOut.bounds.height = handleRadius * 2;
    circleOut.fillColor = style.color;
    circleOut.opacity = style.opacity;

    circleIn.position.set(inPt.x, inPt.y);
    circleIn.bounds.width = handleRadius * 2;
    circleIn.bounds.height = handleRadius * 2;
    circleIn.fillColor = style.color;
    circleIn.opacity = style.opacity;
  }

  clearHandlePreview() {
    if (!this._handleGuides) return;
    const { lineOut, lineIn, circleOut, circleIn } = this._handleGuides;
    lineOut.remove();
    lineIn.remove();
    circleOut.remove();
    circleIn.remove();
    this._handleGuides = null;
  }

  clearPreviews() {
    this.clearHandlePreview();
    if (this.previewLine) {
      this.previewLine.remove();
      this.previewLine = null;
    }
  }

  _finishActivePath() {
    this.clearPreviews();
    this._commitOrDiscardActivePath('Curva');
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    if ((key === 'Enter' || key === 'NumpadEnter') && this.utils.activePath) {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      this._finishActivePath();
      return true;
    }
    return super.onKeyDown(event);
  }

  // Limpieza al cambiar o desactivar la herramienta
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

  cancelAndExit() {
    this.cancel();
    this.exitToSelect();
  }
}