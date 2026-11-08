/**
 * controllers/ImageController.js - Controlador Paramétrico para Imágenes (Bounding Box & Grips)
 * Maneja transformaciones geométricas, grips de escalado/estiramiento y sincronización de opacidad/Undo.
 */
export class ImageController {
  constructor(raster) {
    this.raster = raster;
    this._ensureRasterData();
    this.initialPosition = null;
    this.initialBounds = null;
    this.initialMatrix = null;
  }

  _ensureRasterData() {
    if (!this.raster) return;
    if (!this.raster.data) this.raster.data = {};
    if (this.raster.data.baseOpacity === undefined) {
      this.raster.data.baseOpacity = this.raster.opacity !== undefined ? this.raster.opacity : 1.0;
    }
  }

  /**
   * Captura una instantánea limpia del estado actual para revertir/aplicar en comandos Undo/Redo.
   */
  getTransformState() {
    if (!this.raster) return null;
    return {
      position: this.raster.position ? this.raster.position.clone() : null,
      boundsWidth: this.raster.bounds ? this.raster.bounds.width : 0,
      boundsHeight: this.raster.bounds ? this.raster.bounds.height : 0,
      matrix: this.raster.matrix ? this.raster.matrix.clone() : null
    };
  }

  /**
   * Obtiene las posiciones exactas de los 8 grips + centro + contorno de la imagen.
   */
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

  /**
   * Guarda copia del estado inicial antes de iniciar una transformación con el ratón.
   */
  startTransform() {
    if (!this.raster) return;
    this._ensureRasterData();
    this.initialPosition = this.raster.position.clone();
    this.initialBounds = this.raster.bounds.clone();
    this.initialMatrix = this.raster.matrix ? this.raster.matrix.clone() : null;
  }

  /**
   * Ejecuta transformación proporcional o libre según el Grip seleccionado.
   */
  onGripDrag(gripId, currentPt, startPt, options = {}) {
    if (!this.initialBounds || !this.raster) return;

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

        this.raster.bounds.width = Math.max(5, b.width * scaleFactor);
        this.raster.bounds.height = Math.max(5, b.height * scaleFactor);
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

        this.raster.bounds.width = Math.max(5, b.width * scaleFactor);
        this.raster.bounds.height = Math.max(5, b.height * scaleFactor);

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
          this.raster.bounds.width = Math.max(5, distFromCenter * 2);
        } else if (gripId === 's' || gripId === 'n') {
          const distFromCenter = Math.abs(currentPt.y - initialCenter.y);
          this.raster.bounds.height = Math.max(5, distFromCenter * 2);
        }
        this.raster.position = initialCenter; // Mantiene el centro fijo
      } else {
        // --- ESTIRAMIENTO UNIDIRECCIONAL ---
        if (gripId === 'e') {
          this.raster.bounds.width = Math.max(5, currentPt.x - b.left);
          this.raster.bounds.left = b.left;
        } else if (gripId === 'w') {
          this.raster.bounds.width = Math.max(5, b.right - currentPt.x);
          this.raster.bounds.right = b.right;
        } else if (gripId === 's') {
          this.raster.bounds.height = Math.max(5, currentPt.y - b.top);
          this.raster.bounds.top = b.top;
        } else if (gripId === 'n') {
          this.raster.bounds.height = Math.max(5, b.bottom - currentPt.y);
          this.raster.bounds.bottom = b.bottom;
        }
      }
    }
  }

  /**
   * Obtiene la opacidad actual almacenada.
   */
  getOpacity() {
    if (!this.raster) return 1.0;
    this._ensureRasterData();

    const layerId = String(this.raster.data?.layerId || '0');
    const layer = window.cadUtils?.layerManager?.layers?.get(layerId);

    // Si está configurado Por Capa, devuelve la opacidad de la capa
    if (this.raster.data?.opacityByLayer !== false && layer) {
      return layer.opacity !== undefined ? layer.opacity : 1.0;
    }

    return this.raster.data?.baseOpacity ?? this.raster.opacity ?? 1.0;
  }

  /**
   * Aplica opacidad de forma segura sincronizando raster.opacity y raster.data.baseOpacity.
   */
  setOpacity(value, isByLayer = false) {
    if (!this.raster) return;
    this._ensureRasterData();

    const val = Math.max(0, Math.min(1, parseFloat(value) || 0));
    this.raster.data.opacityByLayer = isByLayer;
    this.raster.data.baseOpacity = val;

    // Refresca la opacidad en el lienzo
    if (window.cadUtils?.selectionRenderEngine) {
      window.cadUtils.selectionRenderEngine.updateEntitiesStroke();
      if (window.paper?.view) paper.view.update();
    }
  }
}