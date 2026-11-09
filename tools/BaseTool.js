/**
 * tools/BaseTool.js - Clase base para todas las herramientas del entorno CAD
 */

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
}