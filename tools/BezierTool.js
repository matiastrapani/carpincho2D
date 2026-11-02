/**
 * tools/BezierTool.js
 */
class BezierTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'Haz clic y arrastra para definir manijas de la curva Bézier.';
    this.previewGroup = null;
  }

  onMouseDown(event) {
    // Ignorar clic derecho o central para que no agregue un nodo extra al salir
    if (event.event.button !== 0) return;

    const osnap = this.service.calculateOsnap(event.point, (pt, type) => this.utils.renderSnapMarker(pt, type));
    const pt = osnap.point;

    if (!this.utils.activePath) {
      this.utils.activePath = new paper.Path({
        strokeColor: '#ec4899',
        strokeWidth: 1 / paper.view.zoom,
        segments: [pt]
      });
    } else {

      // Validación común al añadir un nuevo vértice en Polyline, Spline o Bezier
      if (this.utils.activePath && this.utils.activePath.lastSegment) {
        const lastPt = this.utils.activePath.lastSegment.point;
        if (lastPt.getDistance(pt) < 0.001) {
          return; // Ignorar clic consecutivo en el mismo punto
        }
      }
      this.utils.activePath.add(pt);
    }
  }

  onMouseDrag(event) {
    if (this.utils.activePath && this.utils.activePath.lastSegment) {
      const lastSeg = this.utils.activePath.lastSegment;
      const handleVec = event.point.subtract(lastSeg.point);

      lastSeg.handleOut = handleVec;
      lastSeg.handleIn = handleVec.multiply(-1);

      this.renderBezierPreview();
    }
  }

  onMouseMove(event) {
    const osnap = this.service.calculateOsnap(event.point, (pt, type) => this.utils.renderSnapMarker(pt, type));
    const currentPt = osnap.point;

    this.utils.updateHUD(currentPt);

    if (this.utils.activePath && this.utils.activePath.segments.length > 0) {
      const lastConfirmedPt = this.utils.activePath.lastSegment.point;

      // 1. Actualizar línea elástica rosa
      if (!this.utils.rubberBandLine) {
        this.utils.rubberBandLine = new paper.Path.Line({
          from: lastConfirmedPt,
          to: currentPt,
          strokeColor: '#ec4899',
          strokeWidth: 1 / paper.view.zoom,
          dashArray: [2 / paper.view.zoom, 2 / paper.view.zoom]
        });
      } else {
        this.utils.rubberBandLine.firstSegment.point = lastConfirmedPt;
        this.utils.rubberBandLine.lastSegment.point = currentPt;
      }

      // 2. DISPARAR EL LABEL (pasa el último punto confirmado y la posición actual del cursor)
      this.utils.updateFeedbackLabels(lastConfirmedPt, currentPt);
    }
  }

  onMouseUp(event) {
    this.clearPreview();
  }

  renderBezierPreview() {
    this.clearPreview();
    this.previewGroup = new paper.Group();

    const seg = this.utils.activePath?.lastSegment;
    if (!seg || seg.handleOut.isZero()) return;

    const zoom = paper.view.zoom;
    const outPt = seg.point.add(seg.handleOut);
    const inPt = seg.point.add(seg.handleIn);

    const l1 = new paper.Path.Line({ from: seg.point, to: outPt, strokeColor: '#ec4899', strokeWidth: 1 / zoom, dashArray: [2 / zoom, 2 / zoom] });
    const l2 = new paper.Path.Line({ from: seg.point, to: inPt, strokeColor: '#ec4899', strokeWidth: 1 / zoom, dashArray: [2 / zoom, 2 / zoom] });
    const c1 = new paper.Path.Circle({ center: outPt, radius: 3.5 / zoom, fillColor: '#ec4899' });
    const c2 = new paper.Path.Circle({ center: inPt, radius: 3.5 / zoom, fillColor: '#ec4899' });

    this.previewGroup.addChildren([l1, l2, c1, c2]);
  }

  clearPreview() {
    if (this.previewGroup) {
      this.previewGroup.remove();
      this.previewGroup = null;
    }
  }

  onDeactivate() {
    this.clearPreview();
  }
}

window.BezierTool = BezierTool;