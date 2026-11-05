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
  onKeyDown(event) {}
  
  /**
   * Se ejecuta cuando la herramienta se desactiva o el usuario presiona ESC
   */
  cancel() {}
}