/**
 * tools/BaseTool.js - Clase base para todas las herramientas del entorno CAD
 */

import { AddEntityCommand } from '../services/commands/cadCommands.js';

export class BaseTool {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.promptText = 'Command:';
  }

  onActivate() {
    this.setPrompt(this.promptText);
  }

  setPrompt(text) {
    const cmdPrompt = document.getElementById('commandPrompt');
    if (cmdPrompt) cmdPrompt.innerText = text;
  }

  onMouseDown(event) {}
  onMouseDrag(event) {}
  onMouseMove(event) {}
  onMouseUp(event) {}

  // Captura solo la tecla ESC para salir
  onKeyDown(event) {
    const key = event.key || event.code;
    if (key === 'Escape') {
      this.exitToSelect();
      return true;
    }
    return false;
  }

  // Clic derecho global -> Salir a la herramienta de selección
  onContextMenu(event) {
    this.exitToSelect();
    return true;
  }


  /**
   * Limpieza universal de ciclo de vida.
   * Se ejecuta al desinstalar/destruir la herramienta o cambiar a otra.
   */
  cleanup() {
    this.cancel();
  }
  
  /**
   * Se ejecuta al desinstalar/limpiar la herramienta (cada subclase limpia su previsualización)
   */
  cancel() {
    if (this.utils?.finishCurrentDrawing) {
      this.utils.finishCurrentDrawing();
    }
  }

  /**
   * Quita el foco del input, se lo devuelve al canvas y vuelve al selector
   */
  exitToSelect() {
    const cmdInput = document.getElementById('cmdInput');
    if (cmdInput) cmdInput.blur();

    const canvas = document.getElementById('cadCanvas');
    if (canvas) canvas.focus();

    if (this.utils?.setTool) {
      this.utils.setTool('select');
    }
  }

  commitNewEntity(entity, baseName, CommandClass = AddEntityCommand) {
    if (!entity) return null;
    if (!this.service || !this.utils) {
      throw new Error('BaseTool requiere instancias válidas de cadService y cadUtils.');
    }

    if (!entity.data) {
      entity.data = {};
    }

    // 1. Asignar nombre correlativo único
    if (baseName) {
      const entityName = typeof this.utils.generateNextEntityName === 'function'
        ? this.utils.generateNextEntityName(baseName)
        : baseName;
      entity.name = entityName;
      entity.data.name = entityName;
    }

    // 2. Aplicar propiedades por defecto y capa activa
    if (this.utils.propertyManager) {
      this.utils.propertyManager.applyDefaultSettings(entity);
    }

    // 3. Ejecutar un único comando de historial (inserta en entities, asigna capa y actualiza Z-Order)
    const cmd = new CommandClass(this.service, entity);
    this.service.executeCommand(cmd);

    // 4. Sincronizar renderizado
    if (this.utils.selectionRenderEngine) {
      this.utils.selectionRenderEngine.updateEntitiesStroke();
    }

    return entity;
  }
}