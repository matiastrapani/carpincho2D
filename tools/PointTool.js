/**
 * tools/PointTool.js - Herramienta para Puntos y División de Entidades
 * Soporta selección estándar, caja de selección verde (#008800) y definición del punto de inicio en división por distancia.
 */

import { BaseTool } from './BaseTool.js';
import { AddPointCommand } from '../services/commands/cadCommands.js';
import { DivisionSelectionHandler } from './point/DivisionSelectionHandler.js';

export class PointTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'POINT. Haz clic en el lienzo para colocar un punto o ingresa coordenadas (X,Y).';
    this.divisionSelector = new DivisionSelectionHandler(cadService, cadUtils);
  }

  _getPaper() {
    const p = this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
    if (!p) {
      throw new Error('PointTool requiere una instancia válida de Paper.js.');
    }
    return p;
  }

  getSelectionPreserveMode(toolName) {
    return (toolName === 'divide_count' || toolName === 'divide_dist') ? 'curves' : false;
  }

  shouldClearHudOnActivate(toolName) {
    return toolName === 'divide_count' || toolName === 'divide_dist';
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
        this.divisionSelector.askForDivisionValue(mode, (msg) => this.setPrompt(msg));
      } else {
        this.divisionSelector.reset();

        if (mode === 'divide_count') {
          this.setPrompt('DIVIDIR (N): Selecciona entidad/es y presiona ENTER o Clic Derecho para continuar.');
        } else {
          this.setPrompt('DIVIDIR (Dist): Selecciona entidad/es y presiona ENTER o Clic Derecho para continuar.');
        }
      }
    }
  }

  onMouseDown(event) {
    if (event.event.button !== 0) return;

    const p = this._getPaper();
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
    if (mode === 'divide_dist' && this.divisionSelector.step === 'start_point') {
      if (this.divisionSelector.selectStartPointAt(event.point)) {
        this.setPrompt('Punto de inicio actualizado. Haz clic en otra entidad o presiona ENTER / Clic Derecho para ejecutar:');
      }
      return;
    }

    // PASO: Selección de Entidades
    if ((mode === 'divide_count' || mode === 'divide_dist') && this.divisionSelector.step === 'select') {
      const hitEntity = p.project.hitTest(event.point, {
        stroke: true,
        fill: true,
        tolerance: 8 / p.view.zoom,
        match: (res) => {
          const item = this._resolveRootEntity(res.item);
          return Boolean(item) && this.divisionSelector.isEntitySelectable(item);
        }
      });

      const clickedItem = this._resolveRootEntity(hitEntity?.item);
      if (clickedItem && this.divisionSelector.toggleEntitySelection(clickedItem)) {
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

  onMouseMove(event) {
    const mode = this.utils.currentToolMode;

    if (mode === 'point') {
      const osnap = this.service.calculateOsnap(
        event.point,
        (pt, type) => this.utils.hud.renderSnapMarker(pt, type)
      );
      this.utils.hud.updateHUD(osnap.point);
      return;
    }

    if (mode === 'divide_dist' && this.divisionSelector.step === 'start_point') {
      const osnap = this.divisionSelector.resolveStartPointSnap(
        event.point,
        (pt, type) => this.utils.hud.renderSnapMarker(pt, type)
      );
      this.utils.hud.updateHUD(osnap.point);
      return;
    }

    this.utils.hud.renderSnapMarker?.(null, null);
    this.utils.hud.updateHUD(event.point);
  }

  onMouseUp(event) {
    if (this.divisionSelector.isSelectingBox) {
      this.divisionSelector.finishBox(event.point);
      const count = this.divisionSelector.getTargets().length;
      this.setPrompt(`Objetivos seleccionados: ${count}. Presiona ENTER o Clic Derecho para continuar...`);
    }
  }

  createPointAt(pt, coordsLabel = null) {
    const p = this._getPaper();
    const pointEntity = this.service.createPointEntity(pt);
    if (!pointEntity) return null;

    this.commitNewEntity(pointEntity, 'Punto', AddPointCommand);

    this.service.deselectAllEditingEntities();
    this.service.deselectAllSegments();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    if (p.view) p.view.update();

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

    if (mode === 'divide_dist' && this.divisionSelector.step === 'start_point') {
      this.divisionSelector.executeDivision(mode, () => this.exitToSelect());
      return true;
    }

    if ((mode === 'divide_count' || mode === 'divide_dist') && this.divisionSelector.step === 'select') {
      if (this.divisionSelector.getTargets().length > 0) {
        this.divisionSelector.askForDivisionValue(mode, (msg) => this.setPrompt(msg));
      } else {
        this.exitToSelect();
      }
      return true;
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

    if (mode === 'divide_dist' && this.divisionSelector.step === 'start_point') {
      if (key === 'Enter' || key === 'NumpadEnter' || key === ' ' || key === 'Space') {
        this.divisionSelector.executeDivision(mode, () => this.exitToSelect());
        return true;
      }
    }

    if ((mode === 'divide_count' || mode === 'divide_dist') && this.divisionSelector.step === 'select') {
      if (key === 'Enter' || key === 'NumpadEnter' || key === ' ' || key === 'Space') {
        if (this.divisionSelector.getTargets().length > 0) {
          this.divisionSelector.askForDivisionValue(mode, (msg) => this.setPrompt(msg));
          return true;
        }
      }
    }
    return super.onKeyDown(event);
  }

  onCommandInput(input) {
    const p = this._getPaper();
    const mode = this.utils.currentToolMode;

    if (mode === 'point') {
      const raw = input.trim();
      if (raw.includes(',')) {
        const parts = raw.split(',');
        const x = parseFloat(parts[0]);
        const cadY = parseFloat(parts[1]);

        if (!isNaN(x) && !isNaN(cadY)) {
          const pt = new p.Point(x, -cadY);
          this.createPointAt(pt, `${x}, ${cadY}`);
          return;
        }
      }

      this.setPrompt('Sintaxis de coordenadas inválida. Usa el formato X,Y (ejemplo: 100,50):');
      return;
    }

    if (mode === 'divide_count' || mode === 'divide_dist') {
      this.divisionSelector.handleCommandInput(
        input,
        mode,
        (msg) => this.setPrompt(msg),
        () => this.exitToSelect()
      );
    }
  }

  _resolveRootEntity(item) {
    let curr = item;
    while (curr) {
      if (this.service.entities.includes(curr)) {
        return curr;
      }
      curr = curr.parent;
    }
    return null;
  }

  resetToolState() {
    this.divisionSelector.reset();

    this.service.deselectAllEntities();
    this.service.deselectAllEditingEntities();
    this.service.deselectAllSegments();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.utils.hud.clear();
  }

  cleanup() {
    this.resetToolState();
    super.cleanup();
  }

  cancel() {
    this.resetToolState();
  }

  exitToSelect() {
    this.resetToolState();
    super.exitToSelect();
  }
}