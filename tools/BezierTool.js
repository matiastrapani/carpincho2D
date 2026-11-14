/**
 * tools/BezierTool.js - Herramienta para dibujado de Curvas Bézier interactivas
 */

import { BaseTool } from './BaseTool.js';
import { CAD_THEME } from '../config/cadTheme.js';

export class BezierTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'BÉZIER. Haz clic y arrastra para colocar puntos y manijas. Clic derecho o ENTER para finalizar.';
    this.previewGroup = null;
  }

  onMouseDown(event) {
    // Procesar ÚNICAMENTE el clic izquierdo
    if (event.event && event.event.button !== 0) return;

    const isShift = event.event ? event.event.shiftKey : false;
    let pt = event.point;

    // 1. Evaluar OSNAP incluyendo la curva activa en dibujo
    const osnap = this.service.calculateOsnap(
      event.point,
      (snapPt, type) => this.utils.hud.renderSnapMarker(snapPt, type),
      this.utils.activePath
    );

    if (osnap && osnap.type) {
      pt = osnap.point;
    } else if (this.utils.activePath && this.utils.activePath.lastSegment) {
      const lastPt = this.utils.activePath.lastSegment.point;
      pt = this.utils.applyOrthoConstraint(lastPt, event.point, isShift);
    }

    if (!this.utils.activePath) {
      // Iniciar trazo de curva Bézier
      this.utils.activePath = new paper.Path({
        segments: [pt]
      });

      if (!this.utils.activePath.data) this.utils.activePath.data = {};

      // Auto-nombrar entidad de forma secuencial ('Curva 1', 'Curva 2', ...)
      const curveName = this.utils.generateNextEntityName ? this.utils.generateNextEntityName('Curva') : 'Curva';
      this.utils.activePath.name = curveName;
      this.utils.activePath.data.name = curveName;

      // Aplicar propiedades por defecto (Capa, Color, Grosor, Opacidad)
      if (this.utils.propertyManager) {
        this.utils.propertyManager.applyDefaultSettings(this.utils.activePath);
      }

      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.setPrompt('Especifique el siguiente punto o [ENTER / Clic derecho para finalizar]:');
    } else {
      // Evitar duplicar vértices si se hace clic en la misma posición
      if (this.utils.activePath.lastSegment) {
        const lastPt = this.utils.activePath.lastSegment.point;
        if (lastPt.getDistance(pt) < 0.001) {
          return;
        }
      }

      this.utils.activePath.add(pt);
      this.utils.selectionRenderEngine.updateEntitiesStroke();
    }
  }

  onMouseDrag(event) {
    if (this.utils.activePath && this.utils.activePath.lastSegment) {
      const isShift = event.event ? event.event.shiftKey : false;
      const lastSeg = this.utils.activePath.lastSegment;
      let dragPt = event.point;

      const osnap = this.service.calculateOsnap(
        event.point,
        (snapPt, type) => this.utils.hud.renderSnapMarker(snapPt, type),
        this.utils.activePath
      );

      if (osnap && osnap.type) {
        dragPt = osnap.point;
      } else {
        dragPt = this.utils.applyOrthoConstraint(lastSeg.point, event.point, isShift);
      }

      this.utils.hud.updateHUD(dragPt);

      const handleVec = dragPt.subtract(lastSeg.point);
      lastSeg.handleOut = handleVec;
      lastSeg.handleIn = handleVec.multiply(-1);

      this.renderBezierPreview();
      if (this.utils.selectionRenderEngine.updateEntitiesStroke) {
        this.utils.selectionRenderEngine.updateEntitiesStroke();
      }
    }
  }

  onMouseMove(event) {
    const isShift = event.event ? event.event.shiftKey : false;
    let currentPt = event.point;

    const osnap = this.service.calculateOsnap(
      event.point,
      (snapPt, type) => this.utils.hud.renderSnapMarker(snapPt, type),
      this.utils.activePath
    );

    if (osnap && osnap.type) {
      currentPt = osnap.point;
    } else if (this.utils.activePath && this.utils.activePath.lastSegment) {
      const lastConfirmedPt = this.utils.activePath.lastSegment.point;
      currentPt = this.utils.applyOrthoConstraint(lastConfirmedPt, event.point, isShift);
    }

    this.utils.hud.updateHUD(currentPt);

    if (this.utils.activePath && this.utils.activePath.segments.length > 0) {
      const lastConfirmedPt = this.utils.activePath.lastSegment.point;
      const propMgr = this.utils.propertyManager;

      const activeColor = propMgr ? propMgr.getResolvedColor(this.utils.activePath) : '#00e5ff';
      const activeOpacity = propMgr && typeof propMgr.getResolvedOpacity === 'function'
        ? propMgr.getResolvedOpacity(this.utils.activePath)
        : (this.utils.activePath.opacity !== undefined ? this.utils.activePath.opacity : 1);
      const dashPattern = CAD_THEME?.rubberBand?.dashArrayPx || [2, 2];

      // Previsualización elástica sincronizada en color y opacidad
      if (!this.utils.rubberBandLine) {
        this.utils.rubberBandLine = new paper.Path.Line({
          from: lastConfirmedPt,
          to: currentPt,
          strokeColor: activeColor,
          strokeWidth: 1 / paper.view.zoom,
          dashArray: dashPattern.map((val) => val / paper.view.zoom),
          opacity: activeOpacity
        });
      } else {
        this.utils.rubberBandLine.firstSegment.point = lastConfirmedPt;
        this.utils.rubberBandLine.lastSegment.point = currentPt;
        this.utils.rubberBandLine.strokeColor = activeColor;
        this.utils.rubberBandLine.opacity = activeOpacity;
      }

      this.utils.hud.updateFeedbackLabels(lastConfirmedPt, currentPt);
    }
  }

  onMouseUp(event) {
    this.clearPreview();
  }

  renderBezierPreview() {
    this.clearPreview();

    const seg = this.utils.activePath?.lastSegment;
    if (!seg || seg.handleOut.isZero()) return;

    const zoom = paper.view.zoom;
    const outPt = seg.point.add(seg.handleOut);
    const inPt = seg.point.add(seg.handleIn);

    const propMgr = this.utils.propertyManager;
    const activeColor = propMgr ? propMgr.getResolvedColor(this.utils.activePath) : '#ec4899';

    this.previewGroup = new paper.Group({ insert: false });
    this.previewGroup.guide = true;

    const l1 = new paper.Path.Line({ from: seg.point, to: outPt, strokeColor: activeColor, strokeWidth: 1 / zoom, dashArray: [2 / zoom, 2 / zoom], insert: false });
    const l2 = new paper.Path.Line({ from: seg.point, to: inPt, strokeColor: activeColor, strokeWidth: 1 / zoom, dashArray: [2 / zoom, 2 / zoom], insert: false });
    const c1 = new paper.Path.Circle({ center: outPt, radius: 3.5 / zoom, fillColor: activeColor, insert: false });
    const c2 = new paper.Path.Circle({ center: inPt, radius: 3.5 / zoom, fillColor: activeColor, insert: false });

    this.previewGroup.addChildren([l1, l2, c1, c2]);

    const hudLayer = this.utils.hudLayer || paper.project?.layers?.find((l) => l.name === 'hudLayer');
    if (hudLayer) {
      hudLayer.addChild(this.previewGroup);
    } else if (paper.project?.activeLayer) {
      paper.project.activeLayer.addChild(this.previewGroup);
    }
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

  // Limpieza al cambiar o desactivar la herramienta
  cancel() {
    this.clearPreview();
    if (this.utils.activePath) {
      this.utils.finishCurrentDrawing();
    }
  }

  // Clic derecho: 1.° finaliza el trazo activo, 2.° sale a Selección
  onContextMenu(event) {
    if (this.utils.activePath) {
      this.clearPreview();
      this.utils.finishCurrentDrawing();
      this.setPrompt(this.promptText);
    } else {
      this.exitToSelect();
    }
    return true;
  }

  cancelAndExit() {
    this.clearPreview();
    if (this.utils.activePath) {
      this.utils.finishCurrentDrawing();
    }
    this.utils.setTool('select');
  }
}