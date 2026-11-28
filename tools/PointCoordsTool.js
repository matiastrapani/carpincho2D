/**
 * tools/PointCoordsTool.js - Herramienta de consulta de coordenadas X, Y de un punto (ID)
 */

import { BaseTool } from './BaseTool.js';
import { CAD_CATALOG } from '../config/cadCatalog.js';

export class PointCoordsTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    const meta = CAD_CATALOG.tools.point_coords;
    this.commandName = meta?.displayName || 'POSICIÓN DE PUNTO';
    this.commandAliases = meta?.aliases || ['ID', 'PUNTOID', 'COORDENADAS'];
    this.promptText = `${meta?.prompts?.pick || 'Especifique el punto a consultar'}:`;
    this.preservesSelection = 'all';
    this.preservesEditMode = true;
  }

  onActivate() {
    this.setStep(CAD_CATALOG.tools.point_coords.prompts.pick);
  }

  _inspectPoint(pt, { logInput = false } = {}) {
    if (!pt) return;

    const logs = CAD_CATALOG.tools.point_coords.logs;
    if (logInput) {
      this.utils.consoleManager?.logStepInput?.(this.formatCoords(pt));
    }

    const x = (pt.x === 0 ? 0 : pt.x).toFixed(2);
    const y = (pt.y === 0 ? 0 : -pt.y).toFixed(2);

    this.logTaggedResult(logs.measured({ x, y }));
    this.utils.hud.clear();
    this.exitToSelect();
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) return;

    const pt = this.utils.resolveConstrainedPoint(event.point);
    this._inspectPoint(pt, { logInput: true });
  }

  onMouseMove(event) {
    const pt = this.utils.resolveConstrainedPoint(event.point);
    this.utils.hud.updateHUD(pt);
  }

  _finishOrCancel() {
    if (this.utils.consoleManager) {
      this.utils.consoleManager.handleCancel();
      return;
    }
    this.utils.hud.clear();
    this.exitToSelect();
  }

  onConfirmDefault() {
    this._finishOrCancel();
  }

  onCommandInput(rawInput) {
    const logs = CAD_CATALOG.tools.point_coords.logs;
    const { handled, parsed } = this._parsePointInput(rawInput, {
      numberAsDistance: false
    });
    if (handled) return true;

    if (parsed.type === 'POINT') {
      this._inspectPoint(parsed.point);
      return true;
    }

    this.logTagged(logs.invalidCoords);
    return true;
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    if (key === 'Enter' || key === 'NumpadEnter') {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this._finishOrCancel();
      return true;
    }
    return super.onKeyDown(event);
  }

  onContextMenu(event) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.event?.preventDefault) event.event.preventDefault();
    this._finishOrCancel();
    return true;
  }

  cancel() {
    this.utils.hud.clear();
  }
}