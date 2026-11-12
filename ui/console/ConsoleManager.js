/**
 * ui/console/ConsoleManager.js - Gestor Unificado de Consolas y Despachador CAD
 */
import { FixedConsoleUI } from './FixedConsoleUI.js';
import { FloatingConsoleUI } from './FloatingConsoleUI.js';

export class ConsoleManager {
  constructor(slotId = 'fixedConsoleSlot', cadUtils = null) {
    this.utils = cadUtils;
    this.state = 'IDLE'; // 'IDLE' | 'COMMAND_ACTIVE'
    this.lastCommand = null;

    this.fixedUI = new FixedConsoleUI(slotId);
    this.floatingUI = new FloatingConsoleUI();

    this._onInputKeyDown = this._handleInputKeyDown.bind(this);
    this._onLogClick = this._handleLogClick.bind(this);

    this.initSync();
    this.initInputEvents();
  }

  setUtils(cadUtils) {
    this.utils = cadUtils;
    if (this.utils && typeof this.utils.setConsoleManager === 'function') {
      this.utils.setConsoleManager(this);
    }
  }

  initSync() {
    if (this.fixedUI.input) {
      this.floatingUI.bindInputSync(this.fixedUI.input);
    }
  }

  initInputEvents() {
    const fixedInput = this.fixedUI.input;
    if (fixedInput) {
      fixedInput.addEventListener('keydown', this._onInputKeyDown);
    }

    if (this.fixedUI.logArea) {
      this.fixedUI.logArea.addEventListener('click', this._onLogClick);
    }

    if (this.floatingUI.log) {
      this.floatingUI.log.addEventListener('click', this._onLogClick);
    }
  }

  // --- MÉTODOS ESPEJADOS EN AMBAS CONSOLAS ---

  setPrompt(text) {
    const formatted = text || 'Command:';
    this.state = formatted === 'Command:' ? 'IDLE' : 'COMMAND_ACTIVE';
    this.fixedUI.setPrompt(formatted);
    this.floatingUI.setPrompt(formatted);
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
    if (typeof this.floatingUI.appendInteractiveEntry === 'function') {
      this.floatingUI.appendInteractiveEntry(htmlContent);
    }
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
    const trimmed = (cmdText || '').trim();

    if (!this.utils) {
      throw new Error('ConsoleManager: falta referencia obligatoria a cadUtils.');
    }

    const toolManager = this.utils.toolManager;
    const activeTool = toolManager?.activeTool;
    const isCommandRunning = this.state === 'COMMAND_ACTIVE' && this.utils.currentToolMode !== 'select' && this.utils.currentToolMode !== 'pan';

    // 1. ENTER / ESPACIO CON INPUT VACÍO
    if (!trimmed) {
      if (isCommandRunning) {
        if (activeTool && typeof activeTool.onCommandInput === 'function') {
          activeTool.onCommandInput('');
        } else if (typeof this.utils.finishCurrentDrawing === 'function') {
          this.utils.finishCurrentDrawing();
        }
        return;
      }

      if (this.lastCommand) {
        this.handleExecute(this.lastCommand);
      }
      return;
    }

    this.logUser(trimmed);

    // 2. ESTADO COMMAND_ACTIVE: Entregar valor/opción a la herramienta activa
    if (isCommandRunning) {
      if (activeTool && typeof activeTool.onCommandInput === 'function') {
        activeTool.onCommandInput(trimmed);
        return;
      }

      this.utils.executeCommandLine(trimmed);
      return;
    }

    // 3. ESTADO IDLE: Resolver comando nuevo y guardarlo como último comando
    this.lastCommand = trimmed;
    this.utils.executeCommandLine(trimmed);
  }

  handleCancel() {
    const service = this.utils?.service;

    if (this.utils) {
      const activeTool = this.utils.toolManager?.activeTool;
      const currentToolName = this.utils.currentToolMode;

      if (activeTool && typeof activeTool.cancel === 'function') {
        activeTool.cancel();
      }

      if (currentToolName !== 'select' && typeof this.utils.setTool === 'function') {
        this.utils.setTool('select');
      } else if (currentToolName === 'select' && service) {
        if (service.selectedEntities.length > 0 || service.selectedSegments.length > 0) {
          service.deselectAllEntities();
        } else if (service.editingEntities.length > 0) {
          service.deselectAllEditingEntities();
        }
      }
    }

    if (this.fixedUI.input) this.fixedUI.input.value = '';
    if (this.floatingUI.input) this.floatingUI.input.value = '';

    this.setPrompt('Command:');
    this.logSystem('*Cancelado*');
  }

  _handleInputKeyDown(e) {
    const fixedInput = this.fixedUI.input;
    if (!fixedInput) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const value = fixedInput.value;

      fixedInput.value = '';
      if (this.floatingUI.input) this.floatingUI.input.value = '';

      this.handleExecute(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.handleCancel();
      fixedInput.blur();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && fixedInput.value === '') {
      e.preventDefault();
      if (this.utils?.deleteSelectedHandleOrSegment) {
        this.utils.deleteSelectedHandleOrSegment();
      } else if (this.utils?.service?.deleteSelectedElements) {
        this.utils.service.deleteSelectedElements();
      }
    }
  }

  _handleLogClick(e) {
    const optionEl = e.target.closest('.cmd-option');
    if (!optionEl) return;

    e.preventDefault();
    const optionValue = optionEl.dataset.cmd || optionEl.textContent.trim();
    if (!optionValue) return;

    if (this.fixedUI.input) this.fixedUI.input.value = '';
    if (this.floatingUI.input) this.floatingUI.input.value = '';

    this.handleExecute(optionValue);
    this.focus();
  }

  cleanup() {
    if (this.fixedUI.input) {
      this.fixedUI.input.removeEventListener('keydown', this._onInputKeyDown);
    }
    if (this.fixedUI.logArea) {
      this.fixedUI.logArea.removeEventListener('click', this._onLogClick);
    }
    if (this.floatingUI.log) {
      this.floatingUI.log.removeEventListener('click', this._onLogClick);
    }
    if (typeof this.floatingUI.unbindInputSync === 'function') {
      this.floatingUI.unbindInputSync();
    }
  }


  focus() {
    this.fixedUI.input?.focus();
  }

  toggleFloating() {
    this.floatingUI.toggle();
  }
}