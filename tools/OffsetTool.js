/**
 * tools/OffsetTool.js - Herramienta interactiva de Offset (paralelas y contornos)
 * Flujo en 2 pasos:
 *   1. Selección de entidad objetivo (previa o en vivo con resaltado hover).
 *   2. Previsualización dinámica en hudLayer y confirmación por clic o distancia en consola.
 */

import { BaseTool } from './BaseTool.js';
import { OffsetSolver } from '../services/engines/OffsetSolver.js';

export class OffsetTool extends BaseTool {
  constructor(cadService, cadUtils, paperInstance) {
    super(cadService, cadUtils);
    if (!paperInstance || !paperInstance.Path) {
      throw new Error('OffsetTool requiere una instancia válida de Paper.js en el constructor.');
    }

    this.paper = paperInstance;
    this.solver = new OffsetSolver(paperInstance);
    this.promptText = 'OFFSET: Selecciona una curva o contorno para desfasar:';

    this.targetEntity = null;
    this.previewPath = null;
    this.previewGuideLine = null;
    this.lastSignedDistance = null;
    this.lastMousePoint = null;
    this.joinType = 'miter';
  }

  setPrompt(text) {
    super.setPrompt(text);
    if (this.utils.consoleManager) {
      this.utils.consoleManager.setPrompt(text);
    }
  }

  onActivate() {
    if (!this.paper.view || !this.paper.project) {
      throw new Error('OffsetTool requiere que Paper.js esté inicializado (paper.view y paper.project).');
    }

    super.onActivate();
    this.clearPreviews();
    this.targetEntity = null;
    this.lastSignedDistance = null;

    const validSelected = (this.service.selectedEntities || []).filter((ent) =>
      this._isValidTarget(ent)
    );

    if (validSelected.length === 1) {
      this.setTargetEntity(validSelected[0]);
    } else {
      if (validSelected.length > 1) {
        this.service.deselectAllEntities();
        this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
      }
      this.setPrompt(this.promptText);
    }
  }

  setTargetEntity(entity) {
    if (!this._isValidTarget(entity)) return;

    this.clearPreviews();
    this.utils.clearHoverHighlight();
    this.targetEntity = entity;
    this.lastSignedDistance = null;

    this.service.selectEntity(entity, false);
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.setPrompt('OFFSET: Especifica punto de paso o ingresa distancia en consola:');
    this.paper.view.update();

    if (this.utils.consoleManager) {
      this.utils.consoleManager.focus();
    }
  }

  onMouseMove(event) {
    this.utils.hud.clear();

    const isShift = Boolean(event.event && event.event.shiftKey);
    const pt = this.utils.resolveConstrainedPoint(event.point, { isShift });
    this.lastMousePoint = pt;
    this.utils.hud.updateHUD(pt);

    if (!this.targetEntity) {
      const hovered = this._hitTestEntity(event.point);
      if (this.service.hoveredEntity !== hovered) {
        this.service.hoveredEntity = hovered;
        this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
        this.paper.view.update();
      }
      return;
    }

    const resolved = this.solver.resolveSignedDistance(this.targetEntity, pt);
    if (!resolved) {
      this.clearPreviews();
      return;
    }

    this._updatePreview(resolved.distance, resolved.nearestPoint, pt);
    this.utils.hud.updateFeedbackLabels(resolved.nearestPoint, pt);
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) return;

    if (!this.targetEntity) {
      const hitEntity = this._hitTestEntity(event.point);
      if (hitEntity) {
        this.setTargetEntity(hitEntity);
      }
      return;
    }

    const isShift = Boolean(event.event && event.event.shiftKey);
    const pt = this.utils.resolveConstrainedPoint(event.point, { isShift });
    const resolved = this.solver.resolveSignedDistance(this.targetEntity, pt);

    if (resolved && resolved.magnitude > 1e-4) {
      this.commitOffset(resolved.distance);
    }
  }

  onCommandInput(input) {
    const trimmed = String(input || '').trim();

    if (!trimmed) {
      if (this.targetEntity) {
        this.resetTarget();
      } else {
        this.exitToSelect();
      }
      return;
    }

    if (!this.targetEntity) {
      this.setPrompt('OFFSET: Primero haz clic sobre una curva o contorno en el lienzo:');
      return;
    }

    this.applyDistanceFromCommand(trimmed);
  }

  applyDistanceFromCommand(rawValue) {
    if (!this.targetEntity) {
      this.setPrompt('OFFSET: Primero haz clic sobre una curva o contorno en el lienzo:');
      return false;
    }

    const trimmed = String(rawValue).trim();
    const parsed = parseFloat(trimmed);
    if (Number.isNaN(parsed) || Math.abs(parsed) <= 1e-4) {
      this.setPrompt('OFFSET: Distancia inválida. Ingresa un número mayor a 0 o haz clic en el lienzo:');
      return false;
    }

    let signedDistance = parsed;
    if (!trimmed.startsWith('-') && !trimmed.startsWith('+')) {
      const sideSign = this.lastSignedDistance !== null && this.lastSignedDistance < 0 ? -1 : 1;
      signedDistance = sideSign * Math.abs(parsed);
    }

    return this.commitOffset(signedDistance);
  }

  commitOffset(signedDistance) {
    if (!this.targetEntity || typeof signedDistance !== 'number' || Math.abs(signedDistance) <= 1e-4) {
      return false;
    }

    const offsetResult = this.solver.computeOffset(this.targetEntity, signedDistance, {
      join: this.joinType
    });

    if (!offsetResult) {
      if (this.utils.consoleManager) {
        this.utils.consoleManager.logSystem('No se pudo generar el offset (la geometría colapsa a esa distancia).');
      }
      return false;
    }

    this.commitNewEntity(offsetResult, 'Offset');
    this.resetTarget();
    return true;
  }

  _updatePreview(signedDistance, nearestPoint, cursorPoint) {
    this.clearPreviews();
    this.lastSignedDistance = signedDistance;

    if (Math.abs(signedDistance) <= 1e-4) return;

    const previewGeom = this.solver.computeOffset(this.targetEntity, signedDistance, {
      join: this.joinType
    });

    const zoom = this.paper.view.zoom;
    const { color, opacity } = this._resolvePreviewStyle();
    const targetLayer = this.utils.hudLayer || this.paper.project.activeLayer;

    if (previewGeom) {
      previewGeom.strokeColor = color;
      previewGeom.strokeWidth = 1 / zoom;
      previewGeom.dashArray = [3 / zoom, 3 / zoom];
      previewGeom.opacity = opacity;
      previewGeom.fillColor = null;
      targetLayer.addChild(previewGeom);
      this.previewPath = previewGeom;
    }

    this.previewGuideLine = new this.paper.Path.Line({
      from: nearestPoint,
      to: cursorPoint,
      strokeColor: color,
      strokeWidth: 1 / zoom,
      dashArray: [2 / zoom, 2 / zoom],
      opacity: 0.75,
      insert: false
    });
    targetLayer.addChild(this.previewGuideLine);
  }

  _resolvePreviewStyle() {
    const defaults = this.utils.propertyManager?.defaultSettings || {};
    const activeLayer = this.utils.layerManager?.getActiveLayer() || null;

    const isColorByLayer = defaults.color === 'BYLAYER' || !defaults.color;
    const color = isColorByLayer ? (activeLayer?.color || '#00e5ff') : defaults.color;

    const isOpacityByLayer = defaults.opacity === 'BYLAYER' || defaults.opacity === undefined;
    const opacity = isOpacityByLayer
      ? (activeLayer?.opacity !== undefined ? activeLayer.opacity : 1)
      : (typeof defaults.opacity === 'number' ? defaults.opacity : 1);

    return { color, opacity };
  }

  _hitTestEntity(point) {
    const tolerance = 10 / this.paper.view.zoom;
    const hit = this.paper.project.hitTest(point, {
      stroke: true,
      fill: true,
      curves: true,
      tolerance,
      match: (res) => Boolean(this._resolveRootEntity(res.item))
    });

    if (!hit || !hit.item) return null;
    return this._resolveRootEntity(hit.item);
  }

  _resolveRootEntity(item) {
    if (!item) return null;

    let current = item;
    while (current) {
      if (this.service.entities.includes(current)) {
        return this._isValidTarget(current) ? current : null;
      }
      current = current.parent;
    }

    return null;
  }

  _isValidTarget(entity) {
    if (!entity || entity.data?.isPointEntity) return false;
    if (entity instanceof this.paper.Raster) return false;

    const isPathLike = entity instanceof this.paper.Path || entity instanceof this.paper.CompoundPath;
    if (!isPathLike) return false;

    if (this.utils.layerManager && !this.utils.layerManager.isEntityInteractive(entity)) {
      return false;
    }

    return true;
  }

  clearPreviews() {
    if (this.previewPath) {
      this.previewPath.remove();
      this.previewPath = null;
    }
    if (this.previewGuideLine) {
      this.previewGuideLine.remove();
      this.previewGuideLine = null;
    }
  }

  resetTarget() {
    this.clearPreviews();
    this.targetEntity = null;
    this.lastSignedDistance = null;
    this.service.deselectAllEntities();
    this.utils.clearHoverHighlight();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.utils.hud?.clear?.();
    this.setPrompt(this.promptText);
    this.paper.view.update();
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    if (key === 'Escape') {
      this.exitToSelect();
      return true;
    }
    return super.onKeyDown(event);
  }

  onContextMenu(event) {
    if (this.targetEntity) {
      this.resetTarget();
    } else {
      this.exitToSelect();
    }
    return true;
  }

  cancel() {
    this.clearPreviews();
    this.targetEntity = null;
    this.lastSignedDistance = null;
    this.service.deselectAllEntities();
    this.utils.clearHoverHighlight();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.utils.hud?.clear?.();
  }

  exitToSelect() {
    this.cancel();
    super.exitToSelect();
  }
}