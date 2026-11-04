/**
 * tools/CircleTool.js - Herramienta de Creación de Círculo (Centro y Radio)
 * Incluye previsualización dinámica con línea guía punteada desde el centro al radio,
 * asignación de nombres correlativos ('Círculo 1'), opacidad y propiedades por defecto.
 */
class CircleTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'CIRCLE. Haz clic para especificar el centro del círculo.';
    this.centerPoint = null;
    this.previewCircle = null;
    this.previewRadiusLine = null; // Línea guía punteada
  }

  onMouseDown(event) {
    // Clic derecho -> Cancelar y salir a selección
    if (event.event.button === 2) {
      this.cancelAndExit();
      return;
    }

    if (event.event.button !== 0) return; // Solo procesar clic izquierdo

    const isShift = event.event ? event.event.shiftKey : false;
    let pt = event.point.clone();

    // 1. Evaluar OSNAP sobre la posición REAL del cursor del ratón
    const osnap = this.service.calculateOsnap(
      event.point, 
      (snapPt, type) => this.utils.renderSnapMarker(snapPt, type)
    );

    if (osnap.type) {
      pt = osnap.point;
    } else if (this.centerPoint && isShift) {
      pt = this.utils.applyOrthoConstraint(this.centerPoint, event.point, true);
    }

    // PASO 1: Fijar el Punto Central
    if (!this.centerPoint) {
      this.centerPoint = pt;
      this.setPrompt('Especifica el radio o un punto en el círculo:');
      return;
    }

    // PASO 2: Fijar el Radio y Confirmar la Entidad
    const radius = this.centerPoint.getDistance(pt);
    if (radius > 0.001) {
      const circleEntity = this.service.createCircleEntity(this.centerPoint, radius, true, 1);
      
      if (circleEntity) {
        if (!circleEntity.data) circleEntity.data = {};
        circleEntity.data.isCircleEntity = true;

        // Auto-nombrar entidad de forma secuencial ('Círculo 1', 'Círculo 2', ...)
        const circleName = this.utils.generateNextEntityName ? this.utils.generateNextEntityName('Círculo') : 'Círculo';
        circleEntity.name = circleName;
        circleEntity.data.name = circleName;

        // Aplicar propiedades por defecto (Capa, Color, Grosor, Opacidad)
        if (this.utils.propertyManager) {
          this.utils.propertyManager.applyDefaultSettings(circleEntity);
        }

        if (this.utils.updateEntitiesStroke) {
          this.utils.updateEntitiesStroke();
        }
      }
    }

    this.resetTool();
  }

  onMouseMove(event) {
    this.utils.clearHUD();
    const isShift = event.event ? event.event.shiftKey : false;
    let pt = event.point.clone();

    // 1. Evaluar OSNAP directamente en el cursor real del ratón
    const osnap = this.service.calculateOsnap(
      event.point, 
      (snapPt, type) => this.utils.renderSnapMarker(snapPt, type)
    );

    if (osnap.type) {
      pt = osnap.point;
    } else if (this.centerPoint && isShift) {
      pt = this.utils.applyOrthoConstraint(this.centerPoint, event.point, true);
    }

    // Si el centro ya está definido, renderizamos el círculo y la línea de radio
    if (this.centerPoint) {
      const currentRadius = this.centerPoint.getDistance(pt);
      const zoom = paper.view.zoom;
      const dashStyle = [2 / zoom, 2 / zoom];

      this.clearPreviews();

      const propMgr = this.utils.propertyManager;
      const layerManager = this.utils.layerManager;
      const defaults = propMgr?.defaultSettings || {};
      const activeLayer = layerManager ? layerManager.getActiveLayer() : null;

      const isColorByLayer = defaults.color === 'BYLAYER' || !defaults.color;
      const previewColor = isColorByLayer ? (activeLayer?.color || '#00e5ff') : defaults.color;

      const isOpacityByLayer = defaults.opacity === 'BYLAYER' || defaults.opacity === undefined;
      const previewOpacity = isOpacityByLayer 
        ? (activeLayer?.opacity !== undefined ? activeLayer.opacity : 1) 
        : (typeof defaults.opacity === 'number' ? defaults.opacity : 1);

      // 1. Círculo Dinámico Punteado
      this.previewCircle = new paper.Path.Circle({
        center: this.centerPoint,
        radius: currentRadius,
        strokeColor: previewColor,
        strokeWidth: 1 / zoom,
        dashArray: dashStyle,
        opacity: previewOpacity
      });

      // 2. Línea Guía de Radio Punteada (Centro -> Cursor)
      this.previewRadiusLine = new paper.Path.Line({
        from: this.centerPoint,
        to: pt,
        strokeColor: previewColor,
        strokeWidth: 1 / zoom,
        dashArray: dashStyle,
        opacity: previewOpacity
      });

      this.utils.updateFeedbackLabels(this.centerPoint, pt);
    } else {
      this.utils.updateHUD(pt);
    }
  }

  clearPreviews() {
    if (this.previewCircle) {
      this.previewCircle.remove();
      this.previewCircle = null;
    }
    if (this.previewRadiusLine) {
      this.previewRadiusLine.remove();
      this.previewRadiusLine = null;
    }
  }

  resetTool() {
    this.clearPreviews();
    this.centerPoint = null;
    this.utils.clearHUD();
    this.setPrompt('CIRCLE. Haz clic para especificar el centro del círculo.');
    if (window.paper?.view) {
      paper.view.update();
    }
  }

  // Desactivación estándar invocado por ToolManager (SIN ciclo recursivo)
  cancel() {
    this.resetTool();
  }

  // Clic derecho o cancelación explícita del usuario
  onContextMenu(event) {
    this.cancelAndExit();
    return true;
  }

  cancelAndExit() {
    this.resetTool();
    this.utils.setTool('select');
  }
}

window.CircleTool = CircleTool;