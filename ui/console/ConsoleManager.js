/**
 * ui/console/ConsoleManager.js - Gestor Unificado de Consolas y Despachador CAD
 */
import { FixedConsoleUI } from './FixedConsoleUI.js';
import { FloatingConsoleUI } from './FloatingConsoleUI.js';
import { CAD_THEME } from '../../config/cadTheme.js';

export class ConsoleManager {
  constructor(slotId = 'fixedConsoleSlot', cadUtils = null) {
    this.utils = cadUtils;
    this.state = 'IDLE'; // 'IDLE' | 'COMMAND_ACTIVE'
    this.lastCommand = null;
    this.currentPromptText = 'Comando:';
    this.currentPromptHtml = 'Comando:';
    this._skipNextToolEcho = false;
    this._activeGroups = { fixed: null, floating: null };

    this.fixedUI = new FixedConsoleUI(slotId);
    this.floatingUI = new FloatingConsoleUI();

    this._onInputKeyDown = this._handleInputKeyDown.bind(this);
    this._onOptionMouseDown = this._handleOptionMouseDown.bind(this);
    this._onConsoleContextMenu = this._handleConsoleContextMenu.bind(this);

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
    this.fixedUI?.input?.addEventListener('keydown', this._onInputKeyDown);
    this.floatingUI?.input?.addEventListener('keydown', this._onInputKeyDown);

    const fixedTarget = this.fixedUI?.inputWrapper || this.fixedUI?.prompt;
    const floatingTarget = this.floatingUI?.inputWrapper || this.floatingUI?.prompt;

    fixedTarget?.addEventListener('mousedown', this._onOptionMouseDown);
    floatingTarget?.addEventListener('mousedown', this._onOptionMouseDown);

    const fixedConsoleEl = this.fixedUI?.box || this.fixedUI?.container;
    const floatingConsoleEl = this.floatingUI?.window || this.floatingUI?.modal;

    fixedConsoleEl?.addEventListener('contextmenu', this._onConsoleContextMenu);
    floatingConsoleEl?.addEventListener('contextmenu', this._onConsoleContextMenu);
  }

  // --- AGRUPACIÓN DE LOGS POR HERRAMIENTA ---
  _createGroupElement() {
    const group = document.createElement('div');
    group.className = 'cmd-session-group';
    const borderColor = CAD_THEME?.ui?.consoleSessionBorder || '#88ff00';
    group.style.borderLeft = `2px solid var(--cad-console-session-border, ${borderColor})`;
    group.style.paddingLeft = '8px';
    group.style.margin = '4px 0';
    return group;
  }

  beginCommandGroup() {
    this.endCommandGroup();

    if (this.fixedUI.logArea) {
      const group = this._createGroupElement();
      this.fixedUI.logArea.appendChild(group);
      this._activeGroups.fixed = group;
    }
    if (this.floatingUI.log) {
      const group = this._createGroupElement();
      this.floatingUI.log.appendChild(group);
      this._activeGroups.floating = group;
    }
  }

  endCommandGroup() {
    this._activeGroups.fixed = null;
    this._activeGroups.floating = null;
  }

  _relocateLastEntryToGroup(logContainer, groupEl) {
    if (!logContainer || !groupEl) return;
    const lastChild = logContainer.lastElementChild;
    if (lastChild && lastChild !== groupEl) {
      groupEl.appendChild(lastChild);
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  }

  _syncGroupedEntries() {
    this._relocateLastEntryToGroup(this.fixedUI.logArea, this._activeGroups.fixed);
    this._relocateLastEntryToGroup(this.floatingUI.log, this._activeGroups.floating);
  }

  // --- MÉTODOS ESPEJADOS EN AMBAS CONSOLAS ---

  _escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  formatCommandName(rawText) {
    const clean = String(rawText || '').trim();
    if (!clean) return '';
    return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  }

  _formatOptionHtml(opt, interactive = true) {
    const label = String(opt.label || '');
    const key = String(opt.key || '');
    const idx = key ? label.toLowerCase().indexOf(key.toLowerCase()) : -1;

    let labelHtml;
    if (idx >= 0) {
      const before = this._escapeHtml(label.slice(0, idx));
      const match = this._escapeHtml(label.slice(idx, idx + key.length));
      const after = this._escapeHtml(label.slice(idx + key.length));
      labelHtml = `${before}<u class="decoration-1 underline-offset-2">${match}</u>${after}`;
    } else {
      labelHtml = `<u class="decoration-1 underline-offset-2">${this._escapeHtml(key)}</u> - ${this._escapeHtml(label)}`;
    }

    if (!interactive) {
      return `<span>[${labelHtml}]</span>`;
    }

    const activeClass = opt.active ? ' active' : '';
    return `<span class="cmd-option group cursor-pointer select-none${activeClass}" data-cmd="${this._escapeHtml(key)}">[<span class="group-hover:underline decoration-1 underline-offset-2">${labelHtml}</span>]</span>`;
  }

  _getActiveCommandTag() {
    const toolManager = this.utils?.toolManager;
    const activeTool = toolManager?.activeTool;
    const rawName =
      activeTool?.commandName ||
      toolManager?.getToolDisplayName?.(this.utils?.currentToolMode) ||
      '';
    const clean = String(rawName)
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return clean ? `[${clean}]` : '';
  }

  setPrompt(text) {
    const formatted = text || 'Comando:';
    this.currentPromptText = formatted;
    this.currentPromptHtml = this._escapeHtml(formatted);
    this.state = (formatted === 'Comando:' || formatted === 'Command:') ? 'IDLE' : 'COMMAND_ACTIVE';
    this.fixedUI.setPrompt(formatted);
    this.floatingUI.setPrompt(formatted);
  }

  /**
   * Actualiza la pregunta activa directamente en el prompt del input (sin ensuciar el display).
   */
  /**
   * Actualiza la pregunta activa directamente en el prompt del input (sin ensuciar el display).
   */
  setStepPrompt(instruction, { defaultValue = null, options = [] } = {}) {
    const tag = this._getActiveCommandTag();
    const tagPrefix = tag ? `${tag} ` : '';
    const hasDefault = defaultValue !== null && defaultValue !== undefined && defaultValue !== '';
    const plainDefault = hasDefault ? ` <${defaultValue}>` : '';
    const plainOptions = options.length > 0
      ? ' ' + options.map((opt) => `[${opt.label}]`).join('')
      : '';
    const plainFull = `${tagPrefix}${instruction}${plainDefault}${plainOptions}:`;

    const htmlDefault = hasDefault ? ` &lt;${this._escapeHtml(defaultValue)}&gt;` : '';
    const htmlOptionsStatic = options.length > 0
      ? ' ' + options.map((opt) => this._formatOptionHtml(opt, false)).join('')
      : '';
    this.currentPromptText = plainFull;
    this.currentPromptHtml = `${this._escapeHtml(tagPrefix)}${this._escapeHtml(instruction)}${htmlDefault}${htmlOptionsStatic}:`;

    this.state = 'COMMAND_ACTIVE';
    this.fixedUI.setPrompt(plainFull);
    this.floatingUI.setPrompt(plainFull);

    if (options.length > 0) {
      const htmlOptionsInteractive = ' ' + options.map((opt) => this._formatOptionHtml(opt, true)).join('');
      const htmlFullInteractive = `${this._escapeHtml(tagPrefix)}${this._escapeHtml(instruction)}${htmlDefault}${htmlOptionsInteractive}:`;

      if (this.fixedUI.prompt) this.fixedUI.prompt.innerHTML = htmlFullInteractive;
      if (this.floatingUI.prompt) this.floatingUI.prompt.innerHTML = htmlFullInteractive;
    }

    this.focusInput();
  }

  logUser(text, prefix = '', { grouped = true } = {}) {
    if (prefix) {
      const html = `<span class="text-zinc-400 font-normal">${this._escapeHtml(prefix)}</span><span class="text-white font-bold">${this._escapeHtml(text)}</span>`;
      this.fixedUI.appendInteractiveEntry(html);
      if (typeof this.floatingUI.appendInteractiveEntry === 'function') {
        this.floatingUI.appendInteractiveEntry(html);
      }
      if (grouped) {
        this._syncGroupedEntries();
      }
      return;
    }

    this.fixedUI.appendUserEntry(text);
    this.floatingUI.appendUserEntry(text);
    if (grouped) {
      this._syncGroupedEntries();
    }
  }

  logSystem(text, { grouped = true } = {}) {
    this.fixedUI.appendSystemEntry(text);
    this.floatingUI.appendSystemEntry(text);
    if (grouped) {
      this._syncGroupedEntries();
    }
  }

  logStepInput(valueText) {
    const promptPrefixHtml = this.currentPromptHtml ? `${this.currentPromptHtml} ` : '';
    const html = `<span class="text-zinc-400 font-normal">${promptPrefixHtml}</span><span class="text-white font-bold">${this._escapeHtml(valueText)}</span>`;
    this.fixedUI.appendInteractiveEntry(html);
    if (typeof this.floatingUI.appendInteractiveEntry === 'function') {
      this.floatingUI.appendInteractiveEntry(html);
    }
    this._syncGroupedEntries();
  }

  log(message) {
    this.logSystem(message);
  }

  logResult(title, metricsSummary = '') {
    const suffix = metricsSummary ? `: ${metricsSummary}` : '';
    this.logSystem(`${title}${suffix}`);
  }

  logInteractive(htmlContent) {
    this.fixedUI.appendInteractiveEntry(htmlContent);
    if (typeof this.floatingUI.appendInteractiveEntry === 'function') {
      this.floatingUI.appendInteractiveEntry(htmlContent);
    }
    this._syncGroupedEntries();
  }

  clear() {
    this.endCommandGroup();
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
    const isCommandRunning =
      this.state === 'COMMAND_ACTIVE' &&
      this.utils.currentToolMode !== 'select' &&
      this.utils.currentToolMode !== 'pan';

    // 1. ENTER / ESPACIO CON INPUT VACÍO
    if (!trimmed) {
      if (isCommandRunning) {
        if (activeTool && typeof activeTool.onCommandInput === 'function') {
          activeTool.onCommandInput('');
        } else if (activeTool && typeof activeTool.onConfirmDefault === 'function') {
          activeTool.onConfirmDefault();
        }
        this.focusInput();
        return;
      }

      if (this.lastCommand) {
        this.handleExecute(this.lastCommand);
      }
      return;
    }

    const upperCmd = trimmed.toUpperCase();
    const isUndoCmd = upperCmd === 'DESHACER' || upperCmd === 'UNDO' || upperCmd === 'U';
    const isRedoCmd = upperCmd === 'REHACER' || upperCmd === 'REDO';

    // 2. HERRAMIENTA ACTIVA: Entregar primero el dato u opción a la herramienta
    if (isCommandRunning) {
      this.logStepInput(trimmed);

      if (activeTool && typeof activeTool.onCommandInput === 'function') {
        const handled = activeTool.onCommandInput(trimmed);
        if (handled !== false) {
          this.focusInput();
          return;
        }
      }
    }

    // 3. COMANDOS INSTANTÁNEOS DESHACER / REHACER (sin grupo | y con formato "Comando: Deshacer/Rehacer")
    if (isUndoCmd) {
      if (isCommandRunning && activeTool && typeof activeTool.onUndo === 'function' && activeTool.onUndo()) {
        this.utils.selectionRenderEngine?.updateEntitiesStroke();
        this.utils.selectionRenderEngine?.renderBezierHandles();
        if (window.paper?.view) window.paper.view.update();
        this.focusInput();
        return;
      }
      if (isCommandRunning) {
        this.handleCancel();
      }
      this.lastCommand = 'Deshacer';
      this.utils.service?.undo();
      this.utils.selectionRenderEngine?.updateEntitiesStroke();
      this.utils.selectionRenderEngine?.renderBezierHandles();
      if (window.paper?.view) window.paper.view.update();
      this.focusInput();
      return;
    }

    if (isRedoCmd) {
      if (isCommandRunning && activeTool && typeof activeTool.onRedo === 'function' && activeTool.onRedo()) {
        this.utils.selectionRenderEngine?.updateEntitiesStroke();
        this.utils.selectionRenderEngine?.renderBezierHandles();
        if (window.paper?.view) window.paper.view.update();
        this.focusInput();
        return;
      }
      if (isCommandRunning) {
        this.handleCancel();
      }
      this.lastCommand = 'Rehacer';
      this.utils.service?.redo();
      this.utils.selectionRenderEngine?.updateEntitiesStroke();
      this.utils.selectionRenderEngine?.renderBezierHandles();
      if (window.paper?.view) window.paper.view.update();
      this.focusInput();
      return;
    }

    // 4. ACCIÓN GLOBAL DE DOCUMENTO
    if (upperCmd === 'LIMPIAR') {
      const clearLabel = this.formatCommandName('LIMPIAR');
      if (!isCommandRunning) {
        this.logUser(clearLabel, 'Comando: ');
      }
      this.endCommandGroup();
      this.utils.clearCanvas();
      this.logSystem('Lienzo limpiado.');
      this.lastCommand = clearLabel;
      this.focusInput();
      return;
    }

    // 5. RESOLVER HERRAMIENTA POR ALIAS EN ESPAÑOL
    const targetTool = toolManager?.resolveCommand?.(trimmed) || null;
    if (targetTool) {
      const rawDisplayName = toolManager?.getToolDisplayName?.(targetTool) || trimmed;
      const displayLabel = this.formatCommandName(rawDisplayName);

      if (!isCommandRunning) {
        this.logUser(displayLabel, 'Comando: ');
      }

      this.lastCommand = displayLabel;
      this._skipNextToolEcho = true;
      try {
        this.utils.setTool(targetTool);
      } finally {
        this._skipNextToolEcho = false;
      }
      this.focusInput();
      return;
    }

    if (!isCommandRunning) {
      this.logUser(this.formatCommandName(trimmed), 'Comando: ');
    }
    this.logSystem(`Comando desconocido: "${trimmed}"`);
    this.focusInput();
  }

  _handleInputKeyDown(e) {
    const sourceInput = e.currentTarget || this.fixedUI.input;
    if (!sourceInput) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const value = sourceInput.value;

      if (this.fixedUI.input) this.fixedUI.input.value = '';
      if (this.floatingUI.input) this.floatingUI.input.value = '';

      this.handleExecute(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.handleCancel();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && sourceInput.value === '') {
      e.preventDefault();
      if (this.utils?.deleteSelectedHandleOrSegment) {
        this.utils.deleteSelectedHandleOrSegment();
      } else if (this.utils?.service?.deleteSelectedElements) {
        this.utils.service.deleteSelectedElements();
      }
    }
  }

  _handleOptionClick(e) {
    const optionEl = e.target.closest('.cmd-option');
    if (!optionEl) return;

    e.preventDefault();
    e.stopPropagation();
    const optionValue = optionEl.dataset.cmd || optionEl.textContent.trim();
    if (!optionValue) return;

    if (this.fixedUI.input) this.fixedUI.input.value = '';
    if (this.floatingUI.input) this.floatingUI.input.value = '';

    this.handleExecute(optionValue);
    this.focusInput();
  }

  _handleOptionMouseDown(e) {
    const optEl = e.target?.closest?.('.cmd-option');
    if (!optEl) return;

    if (typeof e.button === 'number' && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const cmd = optEl.getAttribute('data-cmd');
    if (!cmd) return;

    if (this.fixedUI?.input) this.fixedUI.input.value = '';
    if (this.floatingUI?.input) this.floatingUI.input.value = '';

    this.handleExecute(cmd);
  }

  _handleConsoleContextMenu(e) {
    const hasActiveTool =
      this.state === 'COMMAND_ACTIVE' ||
      (this.utils?.currentToolMode && this.utils.currentToolMode !== 'select');

    if (!hasActiveTool) return;

    e.preventDefault();
    e.stopPropagation();

    if (typeof this.handleCancel === 'function') {
      this.handleCancel();
    } else if (this.utils?.toolManager?.activeTool?.cancel) {
      this.utils.toolManager.activeTool.cancel();
    } else {
      this.utils?.setTool?.('select');
    }
  }

  handleCancel() {
    if (!this.utils) return;

    if (this.fixedUI?.input) this.fixedUI.input.value = '';
    if (this.floatingUI?.input) this.floatingUI.input.value = '';

    const activeTool = this.utils.toolManager?.activeTool;
    const isCommandRunning =
      this.state === 'COMMAND_ACTIVE' ||
      (this.utils.currentToolMode && this.utils.currentToolMode !== 'select');

    if (isCommandRunning) {
      this.logSystem('Comando cancelado.');
      this.endCommandGroup();
      this.utils.setTool('select');
      const canvas = this.utils.canvasElement || document.getElementById('cadCanvas');
      if (canvas) canvas.focus();
      return;
    }

    if (activeTool && typeof activeTool.cancel === 'function') {
      activeTool.cancel();
    }
    this.utils.service?.deselectAllEntities?.();
    this.utils.service?.deselectAllSegments?.();
    this.utils.service?.deselectAllHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    if (window.paper?.view) window.paper.view.update();
    this.setPrompt('Comando:');
  }

  triggerUndo() {
    if (!this.utils) return false;

    const activeTool = this.utils.toolManager?.activeTool;
    const isCommandRunning =
      this.state === 'COMMAND_ACTIVE' &&
      this.utils.currentToolMode !== 'select' &&
      this.utils.currentToolMode !== 'pan';

    if (isCommandRunning && activeTool && typeof activeTool.onUndo === 'function' && activeTool.onUndo()) {
      this.utils.selectionRenderEngine?.updateEntitiesStroke();
      this.utils.selectionRenderEngine?.renderBezierHandles();
      if (window.paper?.view) window.paper.view.update();
      (this.utils.cadUI || window.cadUI)?.updateUndoRedoUI?.();
      this.focusInput();
      return true;
    }

    if (isCommandRunning) {
      this.handleCancel();
    }

    const undone = Boolean(this.utils.service?.undo());
    this.utils.selectionRenderEngine?.updateEntitiesStroke();
    this.utils.selectionRenderEngine?.renderBezierHandles();
    if (window.paper?.view) window.paper.view.update();
    (this.utils.cadUI || window.cadUI)?.updateUndoRedoUI?.();
    return undone;
  }

  triggerRedo() {
    if (!this.utils) return false;

    const activeTool = this.utils.toolManager?.activeTool;
    const isCommandRunning =
      this.state === 'COMMAND_ACTIVE' &&
      this.utils.currentToolMode !== 'select' &&
      this.utils.currentToolMode !== 'pan';

    if (isCommandRunning && activeTool && typeof activeTool.onRedo === 'function' && activeTool.onRedo()) {
      this.utils.selectionRenderEngine?.updateEntitiesStroke();
      this.utils.selectionRenderEngine?.renderBezierHandles();
      if (window.paper?.view) window.paper.view.update();
      (this.utils.cadUI || window.cadUI)?.updateUndoRedoUI?.();
      this.focusInput();
      return true;
    }

    if (isCommandRunning) {
      this.handleCancel();
    }

    const redone = Boolean(this.utils.service?.redo());
    this.utils.selectionRenderEngine?.updateEntitiesStroke();
    this.utils.selectionRenderEngine?.renderBezierHandles();
    if (window.paper?.view) window.paper.view.update();
    (this.utils.cadUI || window.cadUI)?.updateUndoRedoUI?.();
    return redone;
  }

  cleanup() {
    this.fixedUI?.input?.removeEventListener('keydown', this._onInputKeyDown);
    this.floatingUI?.input?.removeEventListener('keydown', this._onInputKeyDown);

    const fixedTarget = this.fixedUI?.inputWrapper || this.fixedUI?.prompt;
    const floatingTarget = this.floatingUI?.inputWrapper || this.floatingUI?.prompt;

    fixedTarget?.removeEventListener('mousedown', this._onOptionMouseDown);
    floatingTarget?.removeEventListener('mousedown', this._onOptionMouseDown);

    const fixedConsoleEl = this.fixedUI?.box || this.fixedUI?.container;
    const floatingConsoleEl = this.floatingUI?.window || this.floatingUI?.modal;

    fixedConsoleEl?.removeEventListener('contextmenu', this._onConsoleContextMenu);
    floatingConsoleEl?.removeEventListener('contextmenu', this._onConsoleContextMenu);
  }

  getActiveInput() {
    if (this.floatingUI?.isOpen && this.floatingUI.input) {
      return this.floatingUI.input;
    }
    return this.fixedUI.input || null;
  }

  focusInput() {
    const target = this.getActiveInput();
    if (target && document.activeElement !== target) {
      target.focus({ preventScroll: true });
    }
  }

  toggleFloating() {
    this.floatingUI.toggle();
    this.focusInput();
  }
}