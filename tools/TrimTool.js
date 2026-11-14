/**
 * tools/TrimTool.js - Herramienta de Recorte (Trim) aislada
 */

import { BaseTool } from './BaseTool.js';
import { TrimSelectionHandler } from './trim/TrimSelectionHandler.js';

export class TrimTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.selector = new TrimSelectionHandler(cadService, cadUtils);
  }

  onActivate() {
    this.selector.reset();
    const preSelected = this.selector.syncBoundariesFromSelection();

    if (preSelected.length > 0) {
      this.service.isTrimCuttingPhase = true;
      this.setPrompt(`TRIM: ${preSelected.length} entidad(es) de corte pre-seleccionada(s). Haz clic o arrastra un recuadro sobre los segmentos a recortar. Clic derecho o ESC para salir.`);
    } else {
      this.service.trimCuttingBoundaries = [];
      this.service.isTrimCuttingPhase = false;
      this.setPrompt('TRIM: Selecciona entidad/es de corte (clic o recuadro) y presiona ENTER o Clic Derecho para continuar.');
    }
  }

  confirmTrimBoundaries() {
    const boundaries = this.selector.syncBoundariesFromSelection();
    if (boundaries.length === 0) return;

    this.service.isTrimCuttingPhase = true;
    this.setPrompt('TRIM: Haz clic o arrastra un recuadro sobre los segmentos que deseas eliminar. Clic derecho o ESC para salir.');
  }

  onContextMenu(event) {
    if (!this.service.isTrimCuttingPhase && this.service.trimCuttingBoundaries.length > 0) {
      this.confirmTrimBoundaries();
      return true;
    }

    this.cancel();
    this.exitToSelect();
    return true;
  }

  onKeyDown(event) {
    const key = event.key || event.code;

    if (key === 'Enter' || key === 'NumpadEnter' || key === ' ' || key === 'Space') {
      if (!this.service.isTrimCuttingPhase && this.service.trimCuttingBoundaries.length > 0) {
        this.confirmTrimBoundaries();
        return true;
      }
    } else if (key === 'Escape') {
      this.cancel();
      this.exitToSelect();
      return true;
    }
    return false;
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) return;

    const hitEntity = paper.project.hitTest(event.point, {
      stroke: true,
      fill: true,
      tolerance: 10 / paper.view.zoom,
      match: (res) => this.service.entities.includes(res.item) && this.selector.isEntitySelectable(res.item)
    });

    if (!this.service.isTrimCuttingPhase) {
      if (hitEntity?.item && this.selector.toggleBoundary(hitEntity.item)) {
        const count = this.service.trimCuttingBoundaries.length;
        this.setPrompt(`TRIM: ${count} entidad(es) de corte seleccionada(s). Clic derecho o ENTER para confirmar.`);
        return;
      }

      this.selector.startBox(event.point);
    } else {
      if (hitEntity?.item) {
        this.service.performTrim(hitEntity.item, event.point, () => {
          this.service.editingEntities = [];
          this.service.deselectAllSegments();
          this.utils.selectionRenderEngine.renderBezierHandles();
        });
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
      const count = this.service.trimCuttingBoundaries.length;
      this.setPrompt(`TRIM: ${count} entidad(es) de corte seleccionada(s). Clic derecho o ENTER para confirmar.`);
    } else {
      const boxResult = this.selector.consumeBox(event.point);
      if (boxResult) {
        const renderFn = () => {
          this.service.editingEntities = [];
          this.service.deselectAllSegments();
          this.utils.selectionRenderEngine.renderBezierHandles();
        };

        if (typeof this.service.performBoxTrim === 'function') {
          this.service.performBoxTrim(boxResult.boxBounds, boxResult.isWindowSelection, renderFn);
        } else if (this.service.geometryEngine?.performBoxTrim) {
          this.service.geometryEngine.performBoxTrim(boxResult.boxBounds, boxResult.isWindowSelection, renderFn);
        }
      }
    }
  }

  onMouseMove(event) {
    if (this.utils.snapMarkersGroup) {
      this.utils.snapMarkersGroup.removeChildren();
    }
    this.utils.hud.updateHUD(event.point);
  }

  cancel() {
    this.selector.reset();
    this.service.trimCuttingBoundaries = [];
    this.service.isTrimCuttingPhase = false;
    this.service.deselectAllEntities();
    this.service.editingEntities = [];
    this.service.deselectAllSegments();
    this.utils.selectionRenderEngine.renderBezierHandles();
    this.utils.selectionRenderEngine.updateEntitiesStroke();
  }
}