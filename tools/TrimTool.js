/**
 * tools/TrimTool.js - Herramienta de Recorte (Trim) aislada
 */

import { BaseTool } from './BaseTool.js';

export class TrimTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
  }

  onActivate() {
    this.service.trimCuttingBoundaries = [];

    // Filtrar pre-selección descartando entidades que sean puntos
    const preSelected = (this.service.selectedEntities || []).filter(
      ent => ent && !ent.data?.isPointEntity
    );

    if (preSelected.length > 0) {
      // Usar la selección previa directamente como límites de corte y pasar a cortar
      this.service.trimCuttingBoundaries = [...preSelected];
      this.service.isTrimCuttingPhase = true;
      this.utils.renderBezierHandles();
      this.setPrompt(`TRIM: ${this.service.trimCuttingBoundaries.length} entidad(es) de corte pre-seleccionada(s). Haz clic en los segmentos que deseas eliminar. Clic derecho para salir.`);
    } else {
      // Fase de selección manual de límites de corte
      this.service.isTrimCuttingPhase = false;
      this.setPrompt('TRIM: Selecciona las entidades de corte y presiona BOTÓN DERECHO o ENTER para confirmar.');
    }
  }

  confirmTrimBoundaries() {
    if (this.service.trimCuttingBoundaries.length === 0) return;
    this.service.isTrimCuttingPhase = true;
    this.setPrompt('TRIM: Haz clic en los segmentos que deseas eliminar. Clic derecho o ESC para salir.');
  }

  onContextMenu(event) {
    // 1. Confirmar selección de límites si estamos en fase de selección manual
    if (!this.service.isTrimCuttingPhase && this.service.trimCuttingBoundaries.length > 0) {
      this.confirmTrimBoundaries();
      return true;
    }

    // 2. Si se hace clic derecho durante el recorte (o al inicio sin nada seleccionado) -> cancela y pasa a 'select'
    this.cancel();
    this.utils.setTool('select');
    return true;
  }

  onKeyDown(event) {
    const key = event.key || event.code;

    // Confirmar límites de corte con Enter o Espacio
    if (key === 'Enter' || key === 'NumpadEnter' || key === 'Space') {
      if (!this.service.isTrimCuttingPhase && this.service.trimCuttingBoundaries.length > 0) {
        this.confirmTrimBoundaries();
        return true;
      }
    } 
    // Cancelar herramienta con Escape
    else if (key === 'Escape') {
      this.cancel();
      this.utils.setTool('select');
      return true;
    }
    return false;
  }

  onMouseDown(event) {
    if (event.event.button === 2) return;

    const hitEntity = paper.project.hitTest(event.point, {
      stroke: true, fill: true, tolerance: 10 / paper.view.zoom,
      match: (res) => this.service.demoEntities.includes(res.item) && !res.item.data?.isPointEntity
    });

    if (!this.service.isTrimCuttingPhase) {
      if (hitEntity && hitEntity.item) {
        if (!this.service.trimCuttingBoundaries.includes(hitEntity.item)) {
          this.service.trimCuttingBoundaries.push(hitEntity.item);
          this.service.selectEntity(hitEntity.item, true);
          this.utils.renderBezierHandles();
          this.setPrompt(`TRIM: ${this.service.trimCuttingBoundaries.length} entidad(es) de corte seleccionada(s). Clic derecho o ENTER para confirmar.`);
        }
      }
    } else {
      if (hitEntity && hitEntity.item && !this.service.trimCuttingBoundaries.includes(hitEntity.item)) {
        this.service.performTrim(hitEntity.item, event.point, () => this.utils.renderBezierHandles());
      }
    }
  }

  onMouseMove(event) {
    if (this.utils.snapMarkersGroup) {
      this.utils.snapMarkersGroup.removeChildren();
    }
    this.utils.updateHUD(event.point);
  }

  cancel() {
    this.service.trimCuttingBoundaries = [];
    this.service.isTrimCuttingPhase = false;
    this.service.deselectAllEntities();
    this.utils.renderBezierHandles();
  }
}