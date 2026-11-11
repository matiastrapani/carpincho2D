/**
 * ui/console/ConsoleManager.js - Gestor Unificado de Consolas y Despachador CAD
 */
import { FixedConsoleUI } from './FixedConsoleUI.js';
import { FloatingConsoleUI } from './FloatingConsoleUI.js';

export class ConsoleManager {
  constructor(slotId = 'fixedConsoleSlot') {
    this.fixedUI = new FixedConsoleUI(slotId);
    this.floatingUI = new FloatingConsoleUI();

    this.initSync();
    this.initInputEvents();
  }

  initSync() {
    if (this.fixedUI.input) {
      this.floatingUI.bindInputSync(this.fixedUI.input);
    }
  }

  initInputEvents() {
    const fixedInput = this.fixedUI.input;
    if (!fixedInput) return;

    fixedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = fixedInput.value;
        
        fixedInput.value = '';
        if (this.floatingUI.input) this.floatingUI.input.value = '';

        this.handleExecute(value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.handleCancel();
      }
    });
  }

  // --- MÉTODOS ESPEJADOS EN AMBAS CONSOLAS ---

  setPrompt(text) {
    this.fixedUI.setPrompt(text);
    this.floatingUI.setPrompt(text);
  }

  logUser(text) {
    this.fixedUI.appendUserEntry(text);
    this.floatingUI.appendUserEntry(text);
  }

  logSystem(text) {
    this.fixedUI.appendSystemEntry(text);
    this.floatingUI.appendSystemEntry(text);
  }

  log(message) {
    this.logSystem(message);
  }

  logInteractive(htmlContent) {
    this.fixedUI.appendInteractiveEntry(htmlContent);
    this.floatingUI.appendInteractiveEntry(htmlContent);
  }

  clear() {
    this.fixedUI.clear();
    this.floatingUI.clear();
  }

  // ALIAS DE COMPATIBILIDAD
  appendUserEntry(text) { this.logUser(text); }
  appendSystemEntry(text) { this.logSystem(text); }
  appendInteractiveEntry(html) { this.logInteractive(html); }

  handleExecute(cmdText) {
    if (!cmdText) return;
    const trimmed = cmdText.trim();
    if (!trimmed) return;

    this.logUser(trimmed);

    if (!window.cadUtils) return;

    const activeTool = window.cadUtils.activeTool || window.cadUtils.currentToolInstance;

    if (activeTool && typeof activeTool.onCommandInput === 'function' && window.cadUtils.currentToolMode !== 'select') {
      activeTool.onCommandInput(trimmed);
      return;
    }

    if (typeof window.cadUtils.executeCommandLine === 'function') {
      window.cadUtils.executeCommandLine(trimmed);
      return;
    }

    const lowerCmd = trimmed.toLowerCase();
    const commandMap = {
      'point': 'point', 'punto': 'point', 'p': 'point',
      'line': 'line', 'linea': 'line', 'l': 'line',
      'circle': 'circle', 'circulo': 'circle', 'c': 'circle',
      'polyline': 'polyline', 'polilinea': 'polyline', 'pl': 'polyline',
      'spline': 'spline', 's': 'spline',
      'bezier': 'bezier', 'b': 'bezier',
      'trim': 'trim', 't': 'trim',
      'extend': 'extend', 'ex': 'extend'
    };

    const targetTool = commandMap[lowerCmd] || lowerCmd;
    if (typeof window.cadUtils.setTool === 'function') {
      window.cadUtils.setTool(targetTool);
    }
  }

  handleCancel() {
    const utils = this.utils;
    const service = utils?.service;

    if (utils) {
      const activeTool = utils.activeTool || utils.currentToolInstance;
      const currentToolName = utils.currentToolMode || utils.activeToolName || activeTool?.name;

      // 1. Si hay una herramienta activa en progreso (ej. Polilínea, Spline, Trim), cancelarla
      if (activeTool && typeof activeTool.cancel === 'function') {
        activeTool.cancel();
      } else if (typeof utils.cancelCurrentTool === 'function') {
        utils.cancelCurrentTool();
      } 
      // 2. Solo cambiar a 'select' si estabas en OTRA herramienta (línea, círculo, etc.)
      else if (currentToolName !== 'select' && typeof utils.setTool === 'function') {
        utils.setTool('select');
      }

      // 3. Si YA estabas en 'select', deseleccionar entidades en silencio (sin llamar a setTool)
      if (currentToolName === 'select' && service) {
        if (typeof service.deselectAll === 'function') {
          service.deselectAll();
        } else if (Array.isArray(service.selectedEntities)) {
          service.selectedEntities = [];
          utils.selectionRenderEngine?.updateEntitiesStroke();
          utils.selectionRenderEngine?.renderBezierHandles();
          if (typeof paper !== 'undefined' && paper.view) paper.view.update();
        }
      }
    }

    // Vaciar los inputs sin imprimir "select"
    if (this.fixedUI?.input) this.fixedUI.input.value = '';
    if (this.floatingUI?.input) this.floatingUI.input.value = '';

    this.setPrompt('Command:');
    this.logSystem('*Cancelado*');
  }

  focus() {
    this.fixedUI.input?.focus();
  }

  toggleFloating() {
    this.floatingUI.toggle();
  }
}