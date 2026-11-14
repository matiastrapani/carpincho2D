/**
 * tools/PointTool.js - Herramienta para Puntos y División de Entidades
 * Soporta selección estándar, caja de selección verde (#008800) y definición del punto de inicio en división por distancia.
 */

import { BaseTool } from './BaseTool.js';
import { AddPointCommand, DivideCommand } from '../services/commands/cadCommands.js';
import { DivisionSelectionHandler } from './point/DivisionSelectionHandler.js';

export class PointTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'POINT. Haz clic en el lienzo para colocar un punto o ingresa coordenadas (X,Y).';
    this.divisionSelector = new DivisionSelectionHandler(cadService, cadUtils);
    this.divisionDistance = null;
    this.divisionCount = null;
  }

  // --- HELPER DE CONFIGURACIÓN POR DEFECTO PARA PUNTOS ---
  getPointDefaultOpts() {
    const activeLayerId = String(this.utils.layerManager?.getActiveLayer()?.id || this.utils.layerManager?.activeLayerId || '0');
    const defaults = this.utils.propertyManager?.defaultSettings || { color: 'BYLAYER', opacity: 'BYLAYER', strokeWidth: 'BYLAYER' };
    const activeLayer = this.utils.layerManager ? this.utils.layerManager.getActiveLayer() : null;

    const isColorByLayer = defaults.color === 'BYLAYER';
    const isOpacityByLayer = defaults.opacity === 'BYLAYER';

    const resolvedOpacity = isOpacityByLayer 
      ? (activeLayer && activeLayer.opacity !== undefined ? activeLayer.opacity : 1.0) 
      : (typeof defaults.opacity === 'number' ? defaults.opacity : 1.0);

    return {
      layerId: activeLayerId,
      colorByLayer: isColorByLayer,
      strokeColor: !isColorByLayer ? defaults.color : undefined,
      opacityByLayer: isOpacityByLayer,
      origOpacity: !isOpacityByLayer ? resolvedOpacity : undefined,
      opacity: resolvedOpacity
    };
  }

  onActivate() {
    this.service.lastInsertedPoint = null;
    const mode = this.utils.currentToolMode;

    if (mode === 'point') {
      this.setPrompt('POINT. Haz clic en el lienzo para colocar un punto o ingresa coordenadas (X,Y):');
      return;
    }

    if (mode === 'divide_count' || mode === 'divide_dist') {
      const validSelected = this.divisionSelector.syncTargetsCache();

      if (validSelected.length > 0) {
        this.askForDivisionValue();
      } else {
        this.utils.divisionStep = 'select';
        this.utils.divisionSelectedEntities = [];

        if (mode === 'divide_count') {
          this.setPrompt('DIVIDIR (N): Selecciona entidad/es y presiona ENTER o Clic Derecho para continuar.');
        } else {
          this.setPrompt('DIVIDIR (Dist): Selecciona entidad/es y presiona ENTER o Clic Derecho para continuar.');
        }
      }
    }
  }

  askForDivisionValue() {
    const targets = this.divisionSelector.syncTargetsCache();
    this.utils.divisionStep = 'input';

    this.service.editingEntities = [];
    this.service.deselectAllSegments();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    if (paper?.view) paper.view.update();

    const count = targets.length;
    const mode = this.utils.currentToolMode;

    if (mode === 'divide_count') {
      this.setPrompt(`DIVIDIR (N): Especifica el número de segmentos (${count} objetivo/s):`);
    } else {
      this.setPrompt(`DIVIDIR (Dist): Especifica la distancia de división (${count} objetivo/s):`);
    }

    const cmdInput = document.getElementById('cmdInput');
    if (cmdInput) {
      cmdInput.focus();
      cmdInput.select();
    }
  }

  renderStartPointMarkers() {
    if (this.startPointMarkersGroup) {
      this.startPointMarkersGroup.remove();
      this.startPointMarkersGroup = null;
    }

    this.startPointMarkersGroup = new paper.Group();

    this.utils.divisionSelectedEntities.forEach(entity => {
      let pt = this.customStartPoints.get(entity);
      if (!pt && entity.getPointAt) {
        pt = entity.getPointAt(0);
      }

      if (pt) {
        const marker = new paper.Path.Circle({
          center: pt,
          radius: 5 / paper.view.zoom,
          fillColor: '#00ffcc',
          strokeColor: '#000000',
          strokeWidth: 1.5 / paper.view.zoom
        });
        this.startPointMarkersGroup.addChild(marker);
      }
    });

    if (window.paper?.view) window.paper.view.update();
  }

  onMouseDown(event) {
    if (event.event.button !== 0) return;

    const mode = this.utils.currentToolMode;

    if (mode === 'point') {
      const osnap = this.service.calculateOsnap(
        event.point,
        (pt, type) => this.utils.hud.renderSnapMarker(pt, type)
      );
      this.createPointAt(osnap.point);
      return;
    }

    // PASO: Selección del punto de inicio en División por Distancia
    if (mode === 'divide_dist' && this.utils.divisionStep === 'start_point') {
      const targets = this.divisionSelector.getTargets();
      const hitEntity = paper.project.hitTest(event.point, {
        stroke: true,
        fill: true,
        tolerance: 10 / paper.view.zoom,
        match: (res) => targets.includes(res.item)
      });

      if (hitEntity?.item?.getNearestPoint) {
        const nearestPt = hitEntity.item.getNearestPoint(event.point);
        this.divisionSelector.customStartPoints.set(hitEntity.item, nearestPt);
        this.divisionSelector.renderStartPointMarkers();
        this.setPrompt('Punto de inicio actualizado. Haz clic en otra entidad o presiona ENTER / Clic Derecho para ejecutar:');
        return;
      }
    }

    // PASO: Selección de Entidades
    if ((mode === 'divide_count' || mode === 'divide_dist') && this.utils.divisionStep === 'select') {
      const hitEntity = paper.project.hitTest(event.point, {
        stroke: true,
        fill: true,
        tolerance: 8 / paper.view.zoom,
        match: (res) => this.service.entities.includes(res.item) && !res.item.data?.isPointEntity
      });

      if (hitEntity?.item && this.divisionSelector.toggleEntitySelection(hitEntity.item)) {
        const count = this.divisionSelector.getTargets().length;
        this.setPrompt(`Objetivos seleccionados: ${count}. Presiona ENTER o Clic Derecho para continuar...`);
        return;
      }

      this.divisionSelector.startBox(event.point);
    }
  }

  onMouseDrag(event) {
    this.divisionSelector.updateBox(event.point);
  }

  onMouseUp(event) {
    if (this.divisionSelector.isSelectingBox) {
      this.divisionSelector.finishBox(event.point);
      const count = this.divisionSelector.getTargets().length;
      this.setPrompt(`Objetivos seleccionados: ${count}. Presiona ENTER o Clic Derecho para continuar...`);
    }
  }

  createPointAt(pt, coordsLabel = null) {
    const opts = this.getPointDefaultOpts();
    const pointEntity = this.service.createPointEntity(pt, opts);
    if (!pointEntity) return null;

    this.commitNewEntity(pointEntity, 'Punto', AddPointCommand);

    this.service.editingEntities = [];
    this.service.deselectAllSegments();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    if (paper?.view) paper.view.update();

    const cadX = pt.x.toFixed(2);
    const cadY = (-pt.y).toFixed(2);
    const label = coordsLabel || `${cadX}, ${cadY}`;
    this.setPrompt(`Punto insertado en (${label}). Haz clic o ingresa coordenadas (X,Y):`);

    return pointEntity;
  }

  onContextMenu(event) {
    const mode = this.utils.currentToolMode;

    if (mode === 'point') {
      this.exitToSelect();
      return true;
    }

    if (mode === 'divide_dist' && this.utils.divisionStep === 'start_point') {
      this.executeDivision();
      return true;
    }

    if ((mode === 'divide_count' || mode === 'divide_dist') && this.utils.divisionStep === 'select') {
      if (this.divisionSelector.getTargets().length > 0) {
        this.askForDivisionValue();
        return true;
      }
    }
    return false;
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    const mode = this.utils.currentToolMode;

    if (key === 'Escape') {
      this.exitToSelect();
      return true;
    }

    if (mode === 'point' && (key === 'Enter' || key === 'NumpadEnter' || key === ' ' || key === 'Space')) {
      this.exitToSelect();
      return true;
    }

    if (mode === 'divide_dist' && this.utils.divisionStep === 'start_point') {
      if (key === 'Enter' || key === 'NumpadEnter' || key === ' ' || key === 'Space') {
        this.executeDivision();
        return true;
      }
    }

    if ((mode === 'divide_count' || mode === 'divide_dist') && this.utils.divisionStep === 'select') {
      if (key === 'Enter' || key === 'NumpadEnter' || key === ' ' || key === 'Space') {
        if (this.divisionSelector.getTargets().length > 0) {
          this.askForDivisionValue();
          return true;
        }
      }
    }
    return super.onKeyDown(event);
  }

  onCommandInput(input) {
    const mode = this.utils.currentToolMode;

    if (mode === 'point') {
      const raw = input.trim();
      if (raw.includes(',')) {
        const parts = raw.split(',');
        const x = parseFloat(parts[0]);
        const cadY = parseFloat(parts[1]);

        if (!isNaN(x) && !isNaN(cadY)) {
          const pt = new paper.Point(x, -cadY);
          this.createPointAt(pt, `${x}, ${cadY}`);
          return;
        }
      }

      this.setPrompt('Sintaxis de coordenadas inválida. Usa el formato X,Y (ejemplo: 100,50):');
      return;
    }

    if (mode === 'divide_dist' && this.utils.divisionStep === 'start_point') {
      this.executeDivision();
      return;
    }

    if (this.utils.divisionStep === 'input' && this.divisionSelector.getTargets().length > 0) {
      const val = parseFloat(input);

      if (isNaN(val)) {
        this.exitToSelect();
        return;
      }

      if (mode === 'divide_count') {
        this.divisionCount = Math.floor(val);
        this.executeDivision();
      } else if (mode === 'divide_dist') {
        this.divisionDistance = val;
        this.divisionSelector.beginStartPointStep();
        this.setPrompt('Haz clic en una entidad para cambiar su punto de inicio, o presiona ENTER / Clic Derecho para ejecutar:');
      }
    }
  }

  executeDivision() {
    const mode = this.utils.currentToolMode;
    const targets = this.divisionSelector.getTargets();
    const val = mode === 'divide_count' ? this.divisionCount : this.divisionDistance;

    const opts = this.getPointDefaultOpts();
    const allCreatedPoints = [];

    targets.forEach((entity) => {
      let created = [];
      if (mode === 'divide_count' && val >= 2) {
        created = this.service.divideEntityByCount(entity, val, null, opts);
      } else if (mode === 'divide_dist' && val > 0) {
        const customPt = this.divisionSelector.customStartPoints.get(entity);
        created = this.service.divideEntityByDistance(entity, val, null, opts, customPt);
      }

      if (created && created.length > 0) {
        created.forEach((ptEnt) => {
          if (ptEnt) {
            if (!ptEnt.data) ptEnt.data = {};
            const ptName = typeof this.utils.generateNextEntityName === 'function'
              ? this.utils.generateNextEntityName('Punto')
              : 'Punto';
            ptEnt.name = ptName;
            ptEnt.data.name = ptName;

            if (this.utils.propertyManager) {
              this.utils.propertyManager.applyDefaultSettings(ptEnt);
            }
          }
        });
        allCreatedPoints.push(...created);
      }
    });

    if (allCreatedPoints.length > 0) {
      const divideCmd = new DivideCommand(this.service, allCreatedPoints);
      this.service.executeCommand(divideCmd);
    }

    this.exitToSelect();
  }

  onMouseMove(event) {
    if (this.utils.snapMarkersGroup) {
      this.utils.snapMarkersGroup.removeChildren();
    }
    
    if (this.utils.currentToolMode === 'point') {
      const osnap = this.service.calculateOsnap(
        event.point, 
        (pt, type) => this.utils.hud.renderSnapMarker(pt, type)
      );
      this.utils.hud.updateHUD(osnap.point);
    } else {
      this.utils.hud.updateHUD(event.point);
    }
  }

  resetToolState() {
    this.divisionSelector.reset();
    this.divisionDistance = null;
    this.divisionCount = null;

    this.utils.divisionStep = 'select';
    this.service.deselectAllEntities();
    this.service.editingEntities = [];
    this.service.deselectAllSegments();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.utils.hud.clear();
  }

  cancel() {
    this.resetToolState();
  }

  exitToSelect() {
    this.resetToolState();
    super.exitToSelect();
  }
}