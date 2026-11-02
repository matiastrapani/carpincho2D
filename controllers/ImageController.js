/**
 * controllers/ImageController.js - Controlador Paramétrico para Imágenes (Bounding Box & Grips)
 */
class ImageController {
  constructor(raster) {
    this.raster = raster;
    this.initialPosition = null;
    this.initialBounds = null;
  }

  // Devuelve las posiciones exactas de los 8 grips + centro + líneas del rectángulo
  getGrips() {
    if (!this.raster || !this.raster.bounds) return { grips: [], outlineSegments: [] };

    const b = this.raster.bounds;

    const corners = {
      nw: b.topLeft,
      ne: b.topRight,
      se: b.bottomRight,
      sw: b.bottomLeft,
      n:  b.topCenter,
      e:  b.rightCenter,
      s:  b.bottomCenter,
      w:  b.leftCenter,
      center: b.center
    };

    const grips = [
      { id: 'nw', point: corners.nw, cursor: 'nwse-resize' },
      { id: 'ne', point: corners.ne, cursor: 'nesw-resize' },
      { id: 'se', point: corners.se, cursor: 'nwse-resize' },
      { id: 'sw', point: corners.sw, cursor: 'nesw-resize' },
      { id: 'n',  point: corners.n,  cursor: 'ns-resize' },
      { id: 'e',  point: corners.e,  cursor: 'ew-resize' },
      { id: 's',  point: corners.s,  cursor: 'ns-resize' },
      { id: 'w',  point: corners.w,  cursor: 'ew-resize' },
      { id: 'center', point: corners.center, cursor: 'move' }
    ];

    const outlineSegments = [corners.nw, corners.ne, corners.se, corners.sw];

    return { grips, outlineSegments };
  }

  // Guardar copia limpia antes de iniciar un arrastre (para Undo/Redo)
  startTransform() {
    this.initialPosition = this.raster.position.clone();
    this.initialBounds = this.raster.bounds.clone();
    this.initialMatrix = this.raster.matrix ? this.raster.matrix.clone() : null;
  }

  // Aplicar escalado/movimiento según el grip seleccionado
  // Ejecutar transformación según el Grip seleccionado
  onGripDrag(gripId, currentPt, startPt, options = {}) {
    if (!this.initialBounds) return;

    const isShift = options.isShiftPressed || false;

    if (gripId === 'center') {
      const delta = currentPt.subtract(startPt);
      this.raster.position = this.initialPosition.add(delta);
      return;
    }

    const b = this.initialBounds;
    const initialCenter = b.center;

    // A. Escalado desde Esquinas
    if (['nw', 'ne', 'se', 'sw'].includes(gripId)) {
      if (isShift) {
        // --- ESCALADO SIMÉTRICO DESDE EL CENTRO ---
        const initialDist = startPt.getDistance(initialCenter);
        const currentDist = currentPt.getDistance(initialCenter);

        if (initialDist < 0.001) return;
        const scaleFactor = Math.max(0.05, currentDist / initialDist);

        this.raster.bounds.width = b.width * scaleFactor;
        this.raster.bounds.height = b.height * scaleFactor;
        this.raster.position = initialCenter; // Mantiene el centro fijo
      } else {
        // --- ESCALADO DESDE ESQUINA OPUESTA (Anchor) ---
        let anchorPt;
        if (gripId === 'se') anchorPt = b.topLeft;
        if (gripId === 'sw') anchorPt = b.topRight;
        if (gripId === 'nw') anchorPt = b.bottomRight;
        if (gripId === 'ne') anchorPt = b.bottomLeft;

        const initialDist = startPt.getDistance(anchorPt);
        const currentDist = currentPt.getDistance(anchorPt);

        if (initialDist < 0.001) return;
        const scaleFactor = Math.max(0.05, currentDist / initialDist);

        this.raster.bounds.width = b.width * scaleFactor;
        this.raster.bounds.height = b.height * scaleFactor;

        if (gripId === 'se') this.raster.bounds.topLeft = anchorPt;
        if (gripId === 'sw') this.raster.bounds.topRight = anchorPt;
        if (gripId === 'nw') this.raster.bounds.bottomRight = anchorPt;
        if (gripId === 'ne') this.raster.bounds.bottomLeft = anchorPt;
      }
    }

    // B. Estiramiento desde Bordes
    else if (['n', 's', 'e', 'w'].includes(gripId)) {
      if (isShift) {
        // --- ESTIRAMIENTO SIMÉTRICO DESDE EL CENTRO ---
        if (gripId === 'e' || gripId === 'w') {
          const distFromCenter = Math.abs(currentPt.x - initialCenter.x);
          this.raster.bounds.width = Math.max(10, distFromCenter * 2);
        } else if (gripId === 's' || gripId === 'n') {
          const distFromCenter = Math.abs(currentPt.y - initialCenter.y);
          this.raster.bounds.height = Math.max(10, distFromCenter * 2);
        }
        this.raster.position = initialCenter; // Mantiene el centro fijo
      } else {
        // --- ESTIRAMIENTO UNIDIRECCIONAL ---
        if (gripId === 'e') {
          this.raster.bounds.width = Math.max(10, currentPt.x - b.left);
          this.raster.bounds.left = b.left;
        } else if (gripId === 'w') {
          this.raster.bounds.width = Math.max(10, b.right - currentPt.x);
          this.raster.bounds.right = b.right;
        } else if (gripId === 's') {
          this.raster.bounds.height = Math.max(10, currentPt.y - b.top);
          this.raster.bounds.top = b.top;
        } else if (gripId === 'n') {
          this.raster.bounds.height = Math.max(10, b.bottom - currentPt.y);
          this.raster.bounds.bottom = b.bottom;
        }
      }
    }
  }
}

window.ImageController = ImageController;