/**
 * tools/BaseTool.js - Clase base para todas las herramientas del entorno CAD
 */
class BaseTool {
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

window.BaseTool = BaseTool;

/*
const iconMap = {
    'point': { btn: 'btnPointGroup', icon: 'currentPointIcon', class: 'fa-solid fa-o text-sm' },
    'divide_count': { btn: 'btnPointGroup', icon: 'currentPointIcon', class: 'fa-solid fa-arrows-left-right-to-line text-sm' },
    'divide_dist': { btn: 'btnPointGroup', icon: 'currentPointIcon', class: 'fa-solid fa-ruler-horizontal text-sm' },
    'line': { btn: 'btnLineGroup', icon: 'currentLineIcon', class: 'fa-solid fa-slash text-sm' },
    'polyline': { btn: 'btnLineGroup', icon: 'currentLineIcon', class: 'fa-solid fa-vector-square text-sm' },
    'spline': { btn: 'btnCurveGroup', icon: 'currentCurveIcon', class: 'fa-solid fa-wave-square text-sm' },
    'bezier': { btn: 'btnCurveGroup', icon: 'currentCurveIcon', class: 'fa-solid fa-bezier-curve text-sm' },
    'trim': { btn: 'btnTrimGroup', icon: 'currentModifyIcon', class: 'fa-solid fa-scissors text-sm' },
    'extend': { btn: 'btnTrimGroup', icon: 'currentModifyIcon', class: 'fa-solid fa-expand text-sm' }
  };
*/