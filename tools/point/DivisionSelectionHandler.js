/**
 * tools/point/DivisionSelectionHandler.js - Selección por clic/recuadro y marcadores de inicio para División
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { BoxSelectHandler } from '../select/BoxSelectHandler.js';
import { DivideCommand } from '../../services/commands/cadCommands.js';

export class DivisionSelectionHandler {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.boxSelector = new BoxSelectHandler(cadService, cadUtils);

    this.step = 'select';
    this.divisionCount = null;
    this.divisionDistance = null;
    this.isSelectingBox = false;
    this.boxStartPoint = null;

    this.targetEntities = [];
    this.customStartPoints = new Map();
    this.startPointMarkersGroup = null;
  }

  _getPaper() {
    const p = this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
    if (!p) {
      throw new Error('DivisionSelectionHandler requiere una instancia válida de Paper.js.');
    }
    return p;
  }

  _getHudLayer() {
    const p = this._getPaper();
    return this.utils.hudLayer || this.utils.hud?.hudLayer || p.project?.layers?.find((l) => l.name === 'hudLayer') || null;
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

  askForDivisionValue(mode, setPromptFn) {
    const p = this._getPaper();
    const count = this.syncTargetsCache().length;
    this.step = 'input';

    this._clearEditStateAndSync();
    if (p.view) p.view.update();

    const label = mode === 'divide_count'
      ? 'DIVIDIR (N): Especifica el número de segmentos'
      : 'DIVIDIR (Dist): Especifica la distancia de división';
    setPromptFn?.(`${label} (${count} objetivo/s):`);
    this.utils.consoleManager?.focus?.();
  }

  handleCommandInput(input, mode, setPromptFn, exitToSelectFn) {
    if (mode === 'divide_dist' && this.step === 'start_point') {
      this.executeDivision(mode, exitToSelectFn);
      return;
    }
    if (this.step !== 'input' || this.getTargets().length === 0) return;

    const val = parseFloat(input);
    if (isNaN(val)) {
      exitToSelectFn?.();
      return;
    }

    if (mode === 'divide_count') {
      const count = Math.floor(val);
      if (count < 2) {
        setPromptFn?.('DIVIDIR (N): El número de segmentos debe ser mayor o igual a 2:');
        return;
      }
      this.divisionCount = count;
      this.executeDivision(mode, exitToSelectFn);
    } else if (mode === 'divide_dist') {
      if (val <= 0) {
        setPromptFn?.('DIVIDIR (Dist): La distancia de división debe ser mayor que 0:');
        return;
      }
      this.divisionDistance = val;
      this.beginStartPointStep();
      setPromptFn?.('Haz clic en una entidad para cambiar su punto de inicio, o presiona ENTER / Clic Derecho para ejecutar:');
    }
  }

  executeDivision(mode, exitToSelectFn) {
    const val = mode === 'divide_count' ? this.divisionCount : this.divisionDistance;
    const allCreatedPoints = [];

    this.getTargets().forEach((entity) => {
      const created = mode === 'divide_count' && val >= 2
        ? this.service.divideEntityByCount(entity, val, null, null)
        : mode === 'divide_dist' && val > 0
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

  resolveStartPointSnap(mousePoint, renderMarkerFn = null) {
    const targets = this.getTargets();
    if (targets.length === 0) {
      renderMarkerFn?.(null, null);
      return { point: mousePoint, type: null, entity: null };
    }

    return this.service.calculateOsnap(mousePoint, renderMarkerFn, null, {
      restrictToEntities: targets,
      filterOverrides: { nearest: true },
      forceMasterEnabled: true
    });
  }

  _findSnappedTarget(snapResult, mousePoint, targets) {
    if (!snapResult?.type) return null;

    if (snapResult.entity) {
      const direct = targets.find((t) => t === snapResult.entity || t.children?.includes(snapResult.entity));
      if (direct) return direct;
    }

    const EPS = 0.05;
    let bestTarget = null;
    let bestSnapDist = Infinity;
    let bestCursorDist = Infinity;

    targets.forEach((ent) => {
      const curvePt = ent.getNearestPoint?.(snapResult.point) || ent.children?.[0]?.getNearestPoint?.(snapResult.point);
      const snapDist = curvePt
        ? curvePt.getDistance(snapResult.point)
        : (ent.position ? ent.position.getDistance(snapResult.point) : Infinity);

      if (snapDist > EPS) return;

      const cursorPt = ent.getNearestPoint?.(mousePoint) || curvePt;
      const cursorDist = cursorPt ? cursorPt.getDistance(mousePoint) : Infinity;

      if (snapDist < bestSnapDist - 1e-4 || (Math.abs(snapDist - bestSnapDist) <= 1e-4 && cursorDist < bestCursorDist)) {
        bestSnapDist = snapDist;
        bestCursorDist = cursorDist;
        bestTarget = ent;
      }
    });

    return bestTarget;
  }

  selectStartPointAt(mousePoint) {
    const targets = this.getTargets();
    const snap = this.resolveStartPointSnap(mousePoint);
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