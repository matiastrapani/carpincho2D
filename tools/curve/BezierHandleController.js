/**
 * tools/curve/BezierHandleController.js - Gestión de tiradores Bézier por mouse y consola
 */

import { CAD_CATALOG } from '../../config/cadCatalog.js';

export class BezierHandleController {
  constructor(tool) {
    if (!tool) {
      throw new Error('BezierHandleController: falta referencia obligatoria a tool.');
    }
    this.tool = tool;
    this.isSettingHandle = false;
    this.isAsymmetric = false;
    this._backup = null;
    this._didDrag = false;
    this._guides = null;
  }

  reset() {
    this.isSettingHandle = false;
    this._backup = null;
    this._didDrag = false;
    this.clearPreview();
  }

  resetDragFlag() {
    this._didDrag = false;
  }

  applyVector(seg, handleVec) {
    if (!seg) return;
    seg.handleOut = handleVec;
    if (!this.isAsymmetric) {
      seg.handleIn = handleVec.multiply(-1);
    }
  }

  logApplied(seg) {
    if (!seg || seg.handleOut.isZero()) return;
    const { logs } = CAD_CATALOG.tools.bezier;
    const outPt = seg.point.add(seg.handleOut);
    this.tool.logTagged(logs.handleSet({
      coords: this.tool.formatCoords(outPt),
      length: seg.handleOut.length.toFixed(2),
      asymmetric: this.isAsymmetric
    }));
  }

  enter(seg) {
    if (!seg) {
      this.tool.logTagged(CAD_CATALOG.tools.bezier.logs.needStart);
      return false;
    }
    this._backup = {
      handleIn: seg.handleIn.clone(),
      handleOut: seg.handleOut.clone()
    };
    this.isSettingHandle = true;
    return true;
  }

  exit(seg, { restoreBackup = false, logCancel = false } = {}) {
    if (restoreBackup && seg && this._backup) {
      seg.handleIn = this._backup.handleIn;
      seg.handleOut = this._backup.handleOut;
      this.tool.utils.selectionRenderEngine.updateEntitiesStroke();
    }
    this.isSettingHandle = false;
    this._backup = null;
    this.clearPreview();
    if (logCancel) {
      this.tool.logTagged(CAD_CATALOG.tools.bezier.logs.handleCancelled);
    }
  }

  toggleAsymmetric() {
    this.isAsymmetric = !this.isAsymmetric;
    this.tool.logTagged(
      CAD_CATALOG.tools.bezier.logs.handleModeChanged({ asymmetric: this.isAsymmetric })
    );
  }

  previewTarget(seg, targetPt) {
    if (!seg) return;
    this.applyVector(seg, targetPt.subtract(seg.point));
    this.renderPreview(seg);
    this.tool.utils.selectionRenderEngine.updateEntitiesStroke();
  }

  commitTarget(seg, targetPt) {
    if (!seg) return;
    this.applyVector(seg, targetPt.subtract(seg.point));
    this.tool.utils.selectionRenderEngine.updateEntitiesStroke();
    this.logApplied(seg);
    this.exit(seg);
  }

  onDragSegment(seg, dragPt) {
    if (!seg) return;
    const handleVec = dragPt.subtract(seg.point);
    if (handleVec.length >= 0.001) {
      this._didDrag = true;
    }
    this.applyVector(seg, handleVec);
    this.renderPreview(seg);
    this.tool.utils.selectionRenderEngine.updateEntitiesStroke();
  }

  finishDrag(seg) {
    this.clearPreview();
    if (!this._didDrag) return false;
    this._didDrag = false;
    if (seg && !seg.handleOut.isZero()) {
      this.logApplied(seg);
      return true;
    }
    return false;
  }

  _ensurePreviewItems() {
    const hudLayer = this.tool.getHudLayer();
    const paperInst = this.tool.paper;
    if (!this._guides) {
      const makeLine = () => new paperInst.Path.Line({
        from: [0, 0], to: [0, 0], guide: true, data: { isAuxiliary: true }, insert: false
      });
      const makeDot = () => new paperInst.Path.Circle({
        center: [0, 0], radius: 1, guide: true, data: { isAuxiliary: true }, insert: false
      });
      this._guides = { lineOut: makeLine(), lineIn: makeLine(), circleOut: makeDot(), circleIn: makeDot() };
    }
    Object.values(this._guides).forEach((item) => {
      if (item.parent !== hudLayer) hudLayer.addChild(item);
    });
  }

  renderPreview(seg) {
    if (!seg || (seg.handleOut.isZero() && seg.handleIn.isZero())) {
      this.clearPreview();
      return;
    }
    this._ensurePreviewItems();
    const zoom = this.tool.paper.view.zoom || 1;
    const style = this.tool.resolvePreviewStyle();
    const outPt = seg.point.add(seg.handleOut);
    const inPt = seg.point.add(seg.handleIn);
    const r = 3.5 / zoom;
    const { lineOut, lineIn, circleOut, circleIn } = this._guides;

    [[lineOut, outPt], [lineIn, inPt]].forEach(([line, endPt]) => {
      line.segments[0].point.set(seg.point.x, seg.point.y);
      line.segments[1].point.set(endPt.x, endPt.y);
      line.strokeColor = style.color;
      line.strokeWidth = style.strokeWidth;
      line.dashArray = style.dashArray;
      line.opacity = style.opacity;
    });

    [[circleOut, outPt], [circleIn, inPt]].forEach(([dot, pt]) => {
      dot.position.set(pt.x, pt.y);
      dot.bounds.width = r * 2;
      dot.bounds.height = r * 2;
      dot.fillColor = style.color;
      dot.opacity = style.opacity;
    });
  }

  clearPreview() {
    if (!this._guides) return;
    Object.values(this._guides).forEach((item) => item.remove());
    this._guides = null;
  }
}