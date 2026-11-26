/**
 * tools/TrimTool.js - Herramienta de Recorte (Trim) aislada
 */

import { BaseTool } from './BaseTool.js';
import { TrimSelectionHandler } from './trim/TrimSelectionHandler.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';

export class TrimTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    const meta = CAD_CATALOG.tools.trim;
    this.commandName = 'RECORTAR';
    this.commandAliases = meta?.aliases || ['RECORTAR', 'TRIM', 'RR', 'R'];
    this.promptText = `${meta?.prompts?.select || 'Seleccione entidades límite de corte'}:`;

    this.selector = new TrimSelectionHandler(cadService, cadUtils);
    this.preservesSelection = 'curves';
    this.clearsHudOnActivate = true;
    this.cursorMode = 'trim';
    this.sessionCutCount = 0;
  }

  _getCurrentOptions() {
    if (!this.service.isTrimCuttingPhase) return [];

    const optsMeta = CAD_CATALOG.tools.trim.options;
    const options = [];
    if (this.sessionCutCount > 0) {
      options.push({ ...optsMeta.undo, active: false });
    }
    options.push({ ...optsMeta.finish, active: false });
    return options;
  }

  _announceStep() {
    const prompts = CAD_CATALOG.tools.trim.prompts;
    const options = this._getCurrentOptions();

    if (!this.service.isTrimCuttingPhase) {
      const count = this.service.trimCuttingBoundaries?.length || 0;
      const msg = count > 0 ? prompts.selectedCount(count) : prompts.select;
      this.setStep(msg, { options });
      return;
    }

    this.setStep(prompts.cut, { options });
  }

  _logBoundariesSummary(count) {
    const summaryMsg = CAD_CATALOG.tools.trim.prompts?.selectedSummary?.(count)
      || (count === 1 ? '1 entidad límite seleccionada.' : `${count} entidades límite seleccionadas.`);
    this.logTagged(summaryMsg);
  }

  onActivate() {
    this.selector.reset();
    this.sessionCutCount = 0;
    const preSelected = this.selector.syncBoundariesFromSelection();

    if (preSelected.length > 0) {
      this.service.isTrimCuttingPhase = true;
      this._logBoundariesSummary(preSelected.length);
    } else {
      this.service.trimCuttingBoundaries = [];
      this.service.isTrimCuttingPhase = false;
    }

    this._announceStep();
  }

  confirmTrimBoundaries() {
    const boundaries = this.selector.syncBoundariesFromSelection();
    if (boundaries.length === 0) {
      this.logTagged(CAD_CATALOG.tools.trim.logs.needBoundaries);
      return false;
    }

    this.service.isTrimCuttingPhase = true;
    this._logBoundariesSummary(boundaries.length);
    this._announceStep();
    return true;
  }

  _resetEditOverlays() {
    this.service.editingEntities = [];
    this.service.deselectAllSegments();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
  }

  _finishTool() {
    if (this.sessionCutCount > 0) {
      this.logTagged(CAD_CATALOG.tools.trim.logs.finished);
    }
    this.exitToSelect();
  }

  onUndo() {
    if (!this.service.isTrimCuttingPhase || this.sessionCutCount <= 0) return false;
    if (!this.service.undo({ silentLog: true })) return false;

    this.sessionCutCount = Math.max(0, this.sessionCutCount - 1);
    this._resetEditOverlays();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.paper.view.update();
    this.logTagged(CAD_CATALOG.tools.trim.logs.undone);
    this._announceStep();
    this.refreshUndoRedoUI();
    return true;
  }

  onConfirmDefault() {
    if (!this.service.isTrimCuttingPhase) {
      if ((this.service.trimCuttingBoundaries?.length || 0) > 0) {
        this.confirmTrimBoundaries();
      } else {
        this.exitToSelect();
      }
      return;
    }

    this._finishTool();
  }

  onCommandInput(rawInput) {
    const { handled, parsed } = this._parsePointInput(rawInput, {
      options: this._getCurrentOptions(),
      numberAsDistance: false,
      acceptDefault: true
    });
    if (handled) return true;

    if (parsed.type === 'OPTION') {
      if (parsed.key === 'D') this.onUndo();
      else if (parsed.key === 'T') this._finishTool();
      return true;
    }

    return false;
  }

  onContextMenu(event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.event?.preventDefault) event.event.preventDefault();

    if (!this.service.isTrimCuttingPhase && (this.service.trimCuttingBoundaries?.length || 0) > 0) {
      this.confirmTrimBoundaries();
      return true;
    }

    this._finishTool();
    return true;
  }

  onKeyDown(event) {
    const key = event.key || event.code;

    if (key === 'Enter' || key === 'NumpadEnter' || key === ' ' || key === 'Space') {
      if (!this.service.isTrimCuttingPhase && (this.service.trimCuttingBoundaries?.length || 0) > 0) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        this.confirmTrimBoundaries();
        return true;
      }
    }

    return super.onKeyDown(event);
  }

  onMouseDown(event) {
    if (event?.event && event.event.button !== 0) return;

    const p = this.paper;
    const hitEntity = p.project.hitTest(event.point, {
      stroke: true,
      fill: true,
      tolerance: 10 / (p.view.zoom || 1),
      match: (res) => this.service.entities.includes(res.item) && this.selector.isEntitySelectable(res.item)
    });

    if (!this.service.isTrimCuttingPhase) {
      if (hitEntity?.item && this.selector.toggleBoundary(hitEntity.item)) {
        this._announceStep();
        return;
      }

      this.selector.startBox(event.point);
    } else {
      if (hitEntity?.item) {
        const didCut = this.service.performTrim(hitEntity.item, event.point, () => this._resetEditOverlays());
        if (didCut !== false) {
          this.sessionCutCount += 1;
          this._announceStep();
        }
        this.refreshUndoRedoUI();
        return;
      }

      this.selector.startBox(event.point);
    }
  }

  onMouseDrag(event) {
    if (this.selector.isSelectingBox) {
      this.selector.updateBox(event.point);
    }
  }

  onMouseUp(event) {
    if (!this.selector.isSelectingBox) return;

    if (!this.service.isTrimCuttingPhase) {
      this.selector.finishBox(event.point);
      this._announceStep();
    } else {
      const boxResult = this.selector.consumeBox(event.point);
      if (boxResult) {
        const renderFn = () => this._resetEditOverlays();
        let didCut = false;

        if (typeof this.service.performBoxTrim === 'function') {
          didCut = this.service.performBoxTrim(boxResult.boxBounds, boxResult.isWindowSelection, renderFn) !== false;
        } else if (this.service.geometryEngine?.performBoxTrim) {
          didCut = this.service.geometryEngine.performBoxTrim(boxResult.boxBounds, boxResult.isWindowSelection, renderFn) !== false;
        }

        if (didCut) {
          this.sessionCutCount += 1;
          this._announceStep();
        }
        this.refreshUndoRedoUI();
      }
    }
  }

  onMouseMove(event) {
    this.utils.hud.updateHUD(event.point);
  }

  cancel() {
    this.selector.reset();
    this.service.trimCuttingBoundaries = [];
    this.service.isTrimCuttingPhase = false;
    this.sessionCutCount = 0;
    this.service.deselectAllEntities();
    this._resetEditOverlays();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.utils.hud.clear();
  }

  exitToSelect() {
    this.cancel();
    super.exitToSelect();
  }
}