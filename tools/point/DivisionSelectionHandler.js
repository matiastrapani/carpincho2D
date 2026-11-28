/**
 * tools/point/DivisionSelectionHandler.js - Selección por clic/recuadro y marcadores de inicio para División
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { CAD_CATALOG, normalizeCommandKey } from '../../config/cadCatalog.js';
import { BoxSelectHandler } from '../select/BoxSelectHandler.js';
import { DivideCommand } from '../../services/commands/cadCommands.js';
import { CommandInputParser } from '../../services/input/CommandInputParser.js';

export class DivisionSelectionHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.boxSelector = new BoxSelectHandler(cadService, cadUtils);

    this.step = 'select';
    this.divisionMode = 'count'; // 'count' | 'distance'
    this.divisionCount = null;
    this.divisionDistance = null;
    this.lastDivisionCount = null;
    this.lastDivisionDistance = null;
    this.isSelectingBox = false;
    this.boxStartPoint = null;

    this.targetEntities = [];
    this.customStartPoints = new Map();
    this.startPointMarkersGroup = null;
  }

  _getPaper() {
    const p = this.utils?.paper;
    if (!p) {
      throw new Error('DivisionSelectionHandler requiere una instancia válida de Paper.js.');
    }
    return p;
  }

  _getHudLayer() {
    const p = this._getPaper();
    return this.utils.hudLayer || this.utils.hud?.hudLayer || p.project?.layers?.find((l) => l.name === 'hudLayer') || null;
  }

  _getCurrentOptions() {
    const opts = CAD_CATALOG.tools.divide?.options;
    if (!opts) return [];
    return [this.divisionMode === 'distance' ? opts.modeDistance : opts.modeCount];
  }

  getStepOptions() {
    const opts = CAD_CATALOG.tools.divide?.options;
    if (!opts) return [];
    return [this.divisionMode === 'distance' ? opts.modeDistance : opts.modeCount];
  }

  setDivisionMode(newMode, setStepFn = null) {
    const targetMode = newMode === 'distance' ? 'distance' : 'count';
    if (this.divisionMode === targetMode) return;

    this.divisionMode = targetMode;
    const modeLabel = targetMode === 'distance' ? 'Distancia' : 'Cantidad';
    const logMsg = CAD_CATALOG.tools.divide?.logs?.modeChanged?.({ modeLabel })
      || `Modo de división: ${modeLabel}`;
    this._logTagged(logMsg);

    if (this.step === 'select') {
      const count = this.getTargets().length;
      const prompts = CAD_CATALOG.tools.divide?.prompts;
      const msg = count > 0
        ? prompts?.selectedCount?.(count)
        : prompts?.select;
      setStepFn?.(msg, { options: this.getStepOptions() });
    } else if (this.step === 'input') {
      this._promptDivisionValue(setStepFn);
    } else if (this.step === 'start_point' && targetMode === 'count') {
      const preservedTargets = this.getTargets();
      this.clearStartPointMarkers();
      this.customStartPoints.clear();
      preservedTargets.forEach((ent) => {
        if (!this.service.selectedEntities.includes(ent)) {
          this.service.selectEntity(ent, true);
        }
      });
      this.step = 'input';
      this._promptDivisionValue(setStepFn);
    }
  }

  toggleDivisionMode(setStepFn = null) {
    const nextMode = this.divisionMode === 'count' ? 'distance' : 'count';
    this.setDivisionMode(nextMode, setStepFn);
  }

  _logTagged(msg) {
    const displayName = CAD_CATALOG.tools.divide?.displayName || 'DIVIDIR';
    const tag = `[${normalizeCommandKey(displayName)}]`;
    this.utils.consoleManager?.logSystem(`${tag} ${msg}`);
  }

  _formatDefault() {
    if (this.divisionMode === 'count' && this.lastDivisionCount >= 2) {
      return String(this.lastDivisionCount);
    }
    if (this.divisionMode === 'distance' && this.lastDivisionDistance > 0) {
      return String(Number(this.lastDivisionDistance.toFixed(4)));
    }
    return null;
  }

  _clearEditStateAndSync() {
    const exited = this.service.selectionManager?.exitEditMode?.();
    if (!exited) {
      this.service.editingEntities = [];
      this.service.deselectAllSegments();
      this.service.deselectAllHandles?.();
      this.utils.selectionRenderEngine?.renderBezierHandles?.();
      this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    }
  }

  _promptDivisionValue(setStepFn) {
    const prompts = CAD_CATALOG.tools.divide?.prompts;
    const instruction = this.divisionMode === 'distance'
      ? (prompts?.inputDistance || 'Especifique la distancia de división')
      : (prompts?.inputCount || 'Especifique el número de segmentos');

    setStepFn?.(instruction, {
      defaultValue: this._formatDefault(),
      options: this.getStepOptions()
    });
    this.utils.consoleManager?.focusInput?.();
  }

  askForDivisionValue(setStepFn) {
    const p = this._getPaper();
    const count = this.syncTargetsCache().length;
    this.step = 'input';

    this._clearEditStateAndSync();
    if (p.view) p.view.update();

    const summaryMsg = CAD_CATALOG.tools.divide?.prompts?.selectedSummary?.(count)
      || `Objetivos seleccionados: ${count}.`;
    this._logTagged(summaryMsg);

    this._promptDivisionValue(setStepFn);
  }

  acceptDefaultValue(setStepFn, exitToSelectFn) {
    if (this.step !== 'input' || this.getTargets().length === 0) return false;
    const defaultStr = this._formatDefault();
    if (!defaultStr) return false;

    this.utils.consoleManager?.logStepInput?.(defaultStr);
    this.handleCommandInput(defaultStr, setStepFn, exitToSelectFn);
    return true;
  }

  handleCommandInput(input, setStepFn, exitToSelectFn) {
    const p = this._getPaper();
    const parsed = CommandInputParser.parse(input, {
      options: this.getStepOptions(),
      paper: p
    });

    if (parsed.type === 'OPTION' && parsed.key === 'M') {
      this.toggleDivisionMode(setStepFn);
      return true;
    }

    if (this.divisionMode === 'distance' && this.step === 'start_point') {
      this.executeDivision(exitToSelectFn);
      return true;
    }

    if (this.step === 'select') {
      if (parsed.type === 'ACCEPT_DEFAULT' && this.getTargets().length > 0) {
        this.askForDivisionValue(setStepFn);
        return true;
      }
      return false;
    }

    if (this.step !== 'input' || this.getTargets().length === 0) return false;

    if (parsed.type === 'ACCEPT_DEFAULT') {
      if (!this.acceptDefaultValue(setStepFn, exitToSelectFn)) {
        exitToSelectFn?.();
      }
      return true;
    }

    const meta = CAD_CATALOG.tools.divide;

    if (this.divisionMode === 'count') {
      const count = parsed.type === 'NUMBER' ? Math.floor(parsed.value) : NaN;
      if (Number.isNaN(count) || count < 2) {
        this._logTagged(meta?.logs?.invalidCount || 'El número de segmentos debe ser mayor o igual a 2.');
        this._promptDivisionValue(setStepFn);
        return true;
      }
      this.divisionCount = count;
      this.lastDivisionCount = count;
      this.executeDivision(exitToSelectFn);
      return true;
    }

    if (this.divisionMode === 'distance') {
      const dist = parsed.type === 'NUMBER' ? parsed.value : NaN;
      if (Number.isNaN(dist) || dist <= 0) {
        this._logTagged(meta?.logs?.invalidDistance || 'La distancia de división debe ser mayor que 0.');
        this._promptDivisionValue(setStepFn);
        return true;
      }
      this.divisionDistance = dist;
      this.lastDivisionDistance = dist;
      this.beginStartPointStep();
      setStepFn?.(
        meta?.prompts?.startPoint || 'Haga clic en una entidad para cambiar su punto de inicio, o presione Enter / clic derecho para ejecutar',
        { options: this.getStepOptions() }
      );
      return true;
    }

    return false;
  }

  executeDivision(exitToSelectFn) {
    const isCount = this.divisionMode === 'count';
    const val = isCount ? this.divisionCount : this.divisionDistance;
    const allCreatedPoints = [];

    this.getTargets().forEach((entity) => {
      const created = isCount && val >= 2
        ? this.service.divideEntityByCount(entity, val, null, null)
        : !isCount && val > 0
          ? this.service.divideEntityByDistance(entity, val, null, null, this.customStartPoints.get(entity))
          : [];

      (created || []).forEach((ptEnt) => {
        if (!ptEnt) return;
        ptEnt.data = ptEnt.data || {};
        const ptName = this.utils.generateNextEntityName?.('Punto') || 'Punto';
        ptEnt.name = ptName;
        ptEnt.data.name = ptName;
        this.utils.propertyManager?.applyDefaultSettings(ptEnt);
        allCreatedPoints.push(ptEnt);
      });
    });

    if (allCreatedPoints.length > 0) {
      this.service.executeCommand(new DivideCommand(this.service, allCreatedPoints));
    }
    exitToSelectFn?.();
  }

  isEntitySelectable(entity) {
    if (!entity || entity.data?.isPointEntity || entity.visible === false) {
      return false;
    }

    const layerId = String(entity.data?.layerId || '0');
    const layer = this.utils.layerManager?.layers?.get(layerId);
    if (layer && (layer.locked || layer.visible === false)) {
      return false;
    }

    return true;
  }

  getTargets() {
    if (this.step === 'start_point') {
      return (this.targetEntities || []).filter(
        (ent) => ent && ent.parent && this.isEntitySelectable(ent)
      );
    }
    return this.syncTargetsCache();
  }

  beginStartPointStep() {
    this.syncTargetsCache();
    this.step = 'start_point';
    this.customStartPoints.clear();
    this.service.deselectAllEntities();
    this._clearEditStateAndSync();
    this.renderStartPointMarkers();
  }

  _resolveSelectedPointStyle() {
    const zoom = this._getPaper().view?.zoom || 1;
    const nodeTheme = CAD_THEME.node || {};
    const selTheme = CAD_THEME.selection?.node || {};
    return {
      radius: (selTheme.selectedRadiusPx || nodeTheme.selectedRadiusPx || 4.0) / zoom,
      fillColor: selTheme.fillColor || nodeTheme.defaultFillColor || CAD_THEME.canvas.backgroundColor,
      strokeColor: selTheme.strokeColor || CAD_THEME.selection.strokeColor,
      strokeWidth: (selTheme.selectedWidthPx || nodeTheme.selectedStrokeWidthPx || 2.0) / zoom
    };
  }

  syncTargetsCache() {
    this.targetEntities = (this.service.selectedEntities || []).filter((ent) => this.isEntitySelectable(ent));
    return this.targetEntities;
  }

  toggleEntitySelection(entity) {
    if (!this.isEntitySelectable(entity)) return false;

    const p = this._getPaper();
    if (this.service.selectedEntities.includes(entity)) {
      this.service.deselectEntity(entity);
    } else {
      this.service.selectEntity(entity, true);
    }

    this._clearEditStateAndSync();
    if (p.view) p.view.update();
    this.syncTargetsCache();
    return true;
  }

  startBox(point) {
    this.isSelectingBox = true;
    this.boxStartPoint = point.clone();
    this.boxSelector.startBox(point);
  }

  updateBox(currPt) {
    if (!this.isSelectingBox || !this.boxStartPoint) return;

    const p = this._getPaper();
    this.boxSelector.updateBox(currPt);
    if (p.view) p.view.update();
  }

  finishBox(endPt) {
    if (!this.isSelectingBox) return false;

    const p = this._getPaper();
    const zoom = p.view?.zoom || 1;
    let selectedAny = false;

    if (this.boxSelector.selectionBoxRect && this.boxStartPoint) {
      if (this.boxStartPoint.getDistance(endPt) >= 3 / zoom) {
        const boxBounds = this.boxSelector.selectionBoxRect.bounds;
        const isWindowSelection = endPt.x >= this.boxStartPoint.x;
        const matched = this.boxSelector.getEntitiesInBox(
          boxBounds,
          isWindowSelection,
          (ent) => this.isEntitySelectable(ent)
        );

        matched.forEach((entity) => {
          if (!this.service.selectedEntities.includes(entity)) {
            this.service.selectEntity(entity, true);
            selectedAny = true;
          }
        });
        this._clearEditStateAndSync();
      }
    }

    this.boxSelector.clean();
    this.isSelectingBox = false;
    this.boxStartPoint = null;
    this.syncTargetsCache();

    if (p.view) p.view.update();
    return selectedAny;
  }

  renderStartPointMarkers() {
    this.clearStartPointMarkers();
    const p = this._getPaper();
    const hudLayer = this._getHudLayer();
    if (!hudLayer) return;

    const style = this._resolveSelectedPointStyle();
    this.startPointMarkersGroup = new p.Group({ insert: false, guide: true, data: { isAuxiliary: true } });

    this.getTargets().forEach((entity) => {
      const pt = this.customStartPoints.get(entity)
        || entity.getPointAt?.(0)
        || entity.children?.[0]?.getPointAt?.(0);
      if (!pt) return;

      this.startPointMarkersGroup.addChild(new p.Path.Circle({
        center: pt,
        radius: style.radius,
        fillColor: style.fillColor,
        strokeColor: style.strokeColor,
        strokeWidth: style.strokeWidth,
        insert: false,
        guide: true,
        data: { isAuxiliary: true }
      }));
    });

    hudLayer.addChild(this.startPointMarkersGroup);
    if (p.view) p.view.update();
  }

  clearStartPointMarkers() {
    if (this.startPointMarkersGroup) {
      this.startPointMarkersGroup.remove();
      this.startPointMarkersGroup = null;
    }
  }

  resolveStartPointSnap(mousePoint, renderMarker = false) {
    const targets = this.getTargets();
    if (targets.length === 0) {
      if (renderMarker) this.utils.hud?.renderSnapMarker(null, null);
      return { point: mousePoint, type: null, entity: null };
    }

    const snap = this.service.calculateOsnap(mousePoint, null, {
      filterOverrides: { nearest: true, center: false },
      forceMasterEnabled: true
    });

    if (renderMarker) {
      this.utils.hud?.renderSnapMarker(snap.type ? snap.point : null, snap.type || null);
    }

    return snap;
  }

  _findSnappedTarget(snapResult, mousePoint, targets) {
    if (!snapResult?.type) return null;

    const EPS = 0.05;
    const isPointOnTarget = (ent) => {
      const curvePt = ent.getNearestPoint?.(snapResult.point) || ent.children?.[0]?.getNearestPoint?.(snapResult.point);
      return curvePt ? curvePt.getDistance(snapResult.point) <= EPS : false;
    };

    if (snapResult.entity) {
      const direct = targets.find((t) => t === snapResult.entity || t.children?.includes(snapResult.entity));
      if (direct && isPointOnTarget(direct)) return direct;
    }

    let bestTarget = null;
    let bestCursorDist = Infinity;

    targets.forEach((ent) => {
      if (!isPointOnTarget(ent)) return;
      const cursorPt = ent.getNearestPoint?.(mousePoint) || ent.children?.[0]?.getNearestPoint?.(mousePoint);
      const cursorDist = cursorPt ? cursorPt.getDistance(mousePoint) : Infinity;
      if (cursorDist < bestCursorDist) {
        bestCursorDist = cursorDist;
        bestTarget = ent;
      }
    });

    return bestTarget;
  }

  selectStartPointAt(mousePoint) {
    const targets = this.getTargets();
    const snap = this.resolveStartPointSnap(mousePoint, false);
    const targetItem = this._findSnappedTarget(snap, mousePoint, targets);
    if (!targetItem) return false;

    const startPt = targetItem.getNearestPoint?.(snap.point)
      || targetItem.children?.[0]?.getNearestPoint?.(snap.point)
      || snap.point;

    this.customStartPoints.set(targetItem, startPt);
    this.renderStartPointMarkers();
    return true;
  }

  reset() {
    this.boxSelector.clean();
    this.clearStartPointMarkers();
    this.customStartPoints.clear();
    this.targetEntities = [];
    this.step = 'select';
    this.divisionCount = null;
    this.divisionDistance = null;
    this.isSelectingBox = false;
    this.boxStartPoint = null;
  }
}