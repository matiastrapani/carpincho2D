/**
 * tools/PointTool.js - Herramienta para Puntos y División de Entidades
 * Soporta inserción de puntos por clic o coordenadas y división por cantidad o distancia.
 */

import { BaseTool } from './BaseTool.js';
import { AddPointCommand } from '../services/commands/cadCommands.js';
import { DivisionSelectionHandler } from './point/DivisionSelectionHandler.js';
import { CommandInputParser } from '../services/input/CommandInputParser.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';

export class PointTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.divisionSelector = new DivisionSelectionHandler(cadService, cadUtils);
    this.lastInsertedPoint = null;
  }

  _resolvePointMode() {
    const mode = this.utils?.currentToolMode;
    return (mode === 'point' || mode === 'divide_count' || mode === 'divide_dist')
      ? mode
      : 'point';
  }

  get commandName() {
    if (this._commandName) return this._commandName;
    const mode = this._resolvePointMode();
    return (CAD_CATALOG.tools[mode]?.displayName || 'PUNTO').toUpperCase();
  }

  set commandName(val) {
    this._commandName = val;
  }

  get commandAliases() {
    if (this._commandAliases && this._commandAliases.length > 0) return this._commandAliases;
    const mode = this._resolvePointMode();
    return CAD_CATALOG.tools[mode]?.aliases || ['PUNTO', 'PT'];
  }

  set commandAliases(val) {
    this._commandAliases = val;
  }

  getSelectionPreserveMode(toolName) {
    return (toolName === 'divide_count' || toolName === 'divide_dist') ? 'curves' : false;
  }

  shouldClearHudOnActivate(toolName) {
    return toolName === 'divide_count' || toolName === 'divide_dist';
  }

  _setStepFromLegacyPrompt(msg, options = {}) {
    const clean = String(msg || '').replace(/:\s*$/, '').trim();
    this.setStep(clean || 'Especifique valor', options);
  }

  onActivate() {
    this.lastInsertedPoint = null;
    const mode = this.utils.currentToolMode;

    if (mode === 'point') {
      this.setStep(CAD_CATALOG.tools.point.prompts.start);
      return;
    }

    if (mode === 'divide_count' || mode === 'divide_dist') {
      const validSelected = this.divisionSelector.syncTargetsCache();

      if (validSelected.length > 0) {
        this.divisionSelector.askForDivisionValue(mode, (msg) => this._setStepFromLegacyPrompt(msg));
      } else {
        this.divisionSelector.reset();
        this.setStep(CAD_CATALOG.tools[mode].prompts.select);
      }
    }
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) return;

    const p = this.paper;
    const mode = this.utils.currentToolMode;

    if (mode === 'point') {
      const pt = this.utils.resolveConstrainedPoint(event.point);
      this.createPointAt(pt, { logInput: true });
      return;
    }

    if (mode === 'divide_dist' && this.divisionSelector.step === 'start_point') {
      if (this.divisionSelector.selectStartPointAt(event.point)) {
        this.setStep(CAD_CATALOG.tools.divide_dist.prompts.startPointUpdated);
      }
      return;
    }

    if ((mode === 'divide_count' || mode === 'divide_dist') && this.divisionSelector.step === 'select') {
      const hitEntity = p.project.hitTest(event.point, {
        stroke: true,
        fill: true,
        tolerance: 8 / (p.view.zoom || 1),
        match: (res) => {
          const item = this._resolveRootEntity(res.item);
          return Boolean(item) && this.divisionSelector.isEntitySelectable(item);
        }
      });

      const clickedItem = hitEntity ? this._resolveRootEntity(hitEntity.item) : null;
      if (clickedItem && this.divisionSelector.toggleEntitySelection(clickedItem)) {
        const count = this.divisionSelector.getTargets().length;
        this.setStep(CAD_CATALOG.tools[mode].prompts.selectedCount(count));
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
      const pt = this.utils.resolveConstrainedPoint(event.point);
      this.utils.hud.updateHUD(pt);
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

    this.utils.hud.renderSnapMarker(null, null);
    this.utils.hud.updateHUD(event.point);
  }

  onMouseUp(event) {
    if (this.divisionSelector.isSelectingBox) {
      this.divisionSelector.finishBox(event.point);
      const mode = this.utils.currentToolMode;
      const count = this.divisionSelector.getTargets().length;
      if (CAD_CATALOG.tools[mode]?.prompts?.selectedCount) {
        this.setStep(CAD_CATALOG.tools[mode].prompts.selectedCount(count));
      }
    }
  }

  createPointAt(pt, { logInput = false } = {}) {
    const logs = CAD_CATALOG.tools.point.logs;
    if (!pt) return null;

    if (this.lastInsertedPoint && this.lastInsertedPoint.getDistance(pt) < 0.001) {
      this.logTagged(logs.samePoint);
      return null;
    }

    const coordsStr = this.formatCoords(pt);
    if (logInput) {
      this.utils.consoleManager?.logStepInput?.(coordsStr);
    }

    const pointEntity = this.service.createPointEntity(pt);
    if (!pointEntity) return null;

    this.commitNewEntity(pointEntity, 'Punto', AddPointCommand);
    this.lastInsertedPoint = pt.clone();

    this.service.deselectAllEditingEntities();
    this.service.deselectAllSegments();
    this.utils.selectionRenderEngine.renderBezierHandles();
    this.utils.selectionRenderEngine.updateEntitiesStroke();
    this.paper.view.update();
    this.refreshUndoRedoUI();

    this.logTagged(logs.created({
      name: pointEntity.name || 'Punto',
      coords: coordsStr
    }));
    this.setStep(CAD_CATALOG.tools.point.prompts.next);

    return pointEntity;
  }

  _finishPointMode() {
    if (this.lastInsertedPoint) {
      this.logTagged(CAD_CATALOG.tools.point.logs.finished);
      this.exitToSelect();
      return;
    }
    if (this.utils.consoleManager) {
      this.utils.consoleManager.handleCancel();
      return;
    }
    this.exitToSelect();
  }

  onConfirmDefault() {
    const mode = this.utils.currentToolMode;
    if (mode === 'point') {
      this._finishPointMode();
    } else if (mode === 'divide_dist' && this.divisionSelector.step === 'start_point') {
      this.divisionSelector.executeDivision(mode, () => this.exitToSelect());
    } else if ((mode === 'divide_count' || mode === 'divide_dist') && this.divisionSelector.step === 'input') {
      this.divisionSelector.acceptDefaultValue(
        mode,
        (msg, opts) => this._setStepFromLegacyPrompt(msg, opts),
        () => this.exitToSelect()
      );
    } else if ((mode === 'divide_count' || mode === 'divide_dist') && this.divisionSelector.step === 'select') {
      if (this.divisionSelector.getTargets().length > 0) {
        this.divisionSelector.askForDivisionValue(mode, (msg, opts) => this._setStepFromLegacyPrompt(msg, opts));
      }
    }
  }

  onContextMenu(event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.event?.preventDefault) event.event.preventDefault();

    const mode = this.utils.currentToolMode;

    if (mode === 'point') {
      this._finishPointMode();
      return true;
    }

    if (mode === 'divide_dist' && this.divisionSelector.step === 'start_point') {
      this.divisionSelector.executeDivision(mode, () => this.exitToSelect());
      return true;
    }

    if ((mode === 'divide_count' || mode === 'divide_dist') && this.divisionSelector.step === 'input') {
      if (this.divisionSelector.acceptDefaultValue(
        mode,
        (msg, opts) => this._setStepFromLegacyPrompt(msg, opts),
        () => this.exitToSelect()
      )) {
        return true;
      }
    }

    if ((mode === 'divide_count' || mode === 'divide_dist') && this.divisionSelector.step === 'select') {
      if (this.divisionSelector.getTargets().length > 0) {
        this.divisionSelector.askForDivisionValue(mode, (msg, opts) => this._setStepFromLegacyPrompt(msg, opts));
        return true;
      }
    }

    if (this.utils.consoleManager) {
      this.utils.consoleManager.handleCancel();
      return true;
    }

    this.exitToSelect();
    return true;
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    const mode = this.utils.currentToolMode;

    if (key === 'Enter' || key === 'NumpadEnter') {
      if (mode === 'point') {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        this._finishPointMode();
        return true;
      }

      if (mode === 'divide_dist' && this.divisionSelector.step === 'start_point') {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        this.divisionSelector.executeDivision(mode, () => this.exitToSelect());
        return true;
      }

      if ((mode === 'divide_count' || mode === 'divide_dist') && this.divisionSelector.step === 'input') {
        if (this.divisionSelector.acceptDefaultValue(
          mode,
          (msg, opts) => this._setStepFromLegacyPrompt(msg, opts),
          () => this.exitToSelect()
        )) {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          return true;
        }
      }

      if ((mode === 'divide_count' || mode === 'divide_dist') && this.divisionSelector.step === 'select') {
        if (this.divisionSelector.getTargets().length > 0) {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          this.divisionSelector.askForDivisionValue(mode, (msg, opts) => this._setStepFromLegacyPrompt(msg, opts));
          return true;
        }
      }
    }

    return super.onKeyDown(event);
  }

  onCommandInput(input) {
    const mode = this.utils.currentToolMode;

    if (mode === 'point') {
      const logs = CAD_CATALOG.tools.point.logs;
      const parsed = CommandInputParser.parse(input, {
        referencePoint: this.lastInsertedPoint,
        paper: this.paper
      });

      switch (parsed.type) {
        case 'ACCEPT_DEFAULT':
          this._finishPointMode();
          return true;
        case 'POINT':
          this.createPointAt(parsed.point);
          return true;
        case 'ERROR':
          this.logTagged(parsed.message);
          return true;
        default:
          this.logTagged(logs.invalidCoords);
          return true;
      }
    }

    if (mode === 'divide_count' || mode === 'divide_dist') {
      if (!String(input || '').trim()) {
        this.onConfirmDefault();
        return true;
      }
      this.divisionSelector.handleCommandInput(
        input,
        mode,
        (msg) => this._setStepFromLegacyPrompt(msg),
        () => this.exitToSelect()
      );
      return true;
    }

    return false;
  }

  _resolveRootEntity(item) {
    let curr = item;
    while (curr) {
      if (this.service.entities.includes(curr)) return curr;
      curr = curr.parent;
    }
    return null;
  }

  resetToolState() {
    this.divisionSelector.reset();
    this.lastInsertedPoint = null;

    this.service.deselectAllEntities();
    this.service.deselectAllEditingEntities();
    this.service.deselectAllSegments();
    this.utils.selectionRenderEngine.renderBezierHandles();
    this.utils.selectionRenderEngine.updateEntitiesStroke();
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