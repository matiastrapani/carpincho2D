/**
 * ui/console/ConsoleManager.js - Gestor Unificado de Consolas y Despachador CAD
 */
import { FixedConsoleUI } from './FixedConsoleUI.js';
import { FloatingConsoleUI } from './FloatingConsoleUI.js';
import { ConsoleLogRenderer } from './ConsoleLogRenderer.js';
import { CommandAutocomplete } from './CommandAutocomplete.js';
import {
  CAD_CATALOG,
  formatCommandDisplay,
  resolveCatalogEntry,
  normalizeCommandKey
} from '../../config/cadCatalog.js';

export class ConsoleManager {
  constructor(slotId = 'fixedConsoleSlot', cadUtils = null) {
    this.utils = cadUtils;
    this.state = 'IDLE'; // 'IDLE' | 'COMMAND_ACTIVE'
    this.lastCommand = null;
    this._skipNextToolEcho = false;

    this.fixedUI = new FixedConsoleUI(slotId);
    this.floatingUI = new FloatingConsoleUI();
    this.renderer = new ConsoleLogRenderer(this.fixedUI, this.floatingUI, {
      getCommandTag: () => this._getActiveCommandTag(),
      onStateChange: (nextState) => { this.state = nextState; },
      onFocusRequest: () => this.focusInput()
    });

    this.autocomplete = new CommandAutocomplete({
      fixedUI: this.fixedUI,
      floatingUI: this.floatingUI,
      canShow: () =>
        this.state === 'IDLE' ||
        this.utils?.currentToolMode === 'select' ||
        this.utils?.currentToolMode === 'pan',
      onExecute: (commandText) => {
        this._clearInputs();
        this.handleExecute(commandText);
      }
    });

    this._onInputKeyDown = this._handleInputKeyDown.bind(this);
    this._onOptionMouseDown = this._handleOptionMouseDown.bind(this);
    this._onConsoleContextMenu = this._handleConsoleContextMenu.bind(this);

    this.initSync();
    this.initInputEvents();
  }

  get currentPromptText() {
    return this.renderer.currentPromptText;
  }

  set currentPromptText(val) {
    this.renderer.currentPromptText = val;
  }

  get currentPromptHtml() {
    return this.renderer.currentPromptHtml;
  }

  set currentPromptHtml(val) {
    this.renderer.currentPromptHtml = val;
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

  _getActiveCommandTag() {
    const toolManager = this.utils?.toolManager;
    const activeTool = toolManager?.activeTool;
    const rawName =
      activeTool?.commandName ||
      toolManager?.getToolDisplayName?.(this.utils?.currentToolMode) ||
      '';
    const clean = normalizeCommandKey(rawName);
    return clean ? `[${clean}]` : '';
  }

  formatCommandName(rawText) {
    return formatCommandDisplay(rawText);
  }

  // --- DELEGACIÓN DE LOGS, PROMPTS Y GRUPOS ---
  hasActiveCommandGroup() { return this.renderer.hasActiveCommandGroup(); }
  beginCommandGroup() { this.renderer.beginCommandGroup(); }
  endCommandGroup() { this.renderer.endCommandGroup(); }
  hasActiveCompactBlock() { return this.renderer.hasActiveCompactBlock(); }
  beginCompactBlock() { this.renderer.beginCompactBlock(); }
  endCompactBlock() { this.renderer.endCompactBlock(); }
  setPrompt(text) { this.renderer.setPrompt(text); }
  setStepPrompt(instruction, options) { this.renderer.setStepPrompt(instruction, options); }
  logUser(text, prefix = '', options) { this.renderer.logUser(text, prefix, options); }
  logSystem(text, options) { this.renderer.logSystem(text, options); }
  logStepInput(valueText) { this.renderer.logStepInput(valueText); }
  log(message) { this.renderer.logSystem(message); }
  logResult(title, metricsSummary = '') { this.renderer.logResult(title, metricsSummary); }
  logInteractive(htmlContent) { this.renderer.logInteractive(htmlContent); }
  clear() { this.renderer.clear(); }

  // ALIAS DE COMPATIBILIDAD
  appendUserEntry(text) { this.logUser(text); }
  appendSystemEntry(text) { this.logSystem(text); }
  appendInteractiveEntry(html) { this.logInteractive(html); }

  // --- EJECUCIÓN Y DESPACHO DE COMANDOS ---
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

    if (!trimmed) {
      if (isCommandRunning) {
        if (typeof activeTool?.onCommandInput === 'function') {
          activeTool.onCommandInput('');
        } else if (typeof activeTool?.onConfirmDefault === 'function') {
          activeTool.onConfirmDefault();
        }
        this.focusInput();
      } else if (
        this.utils.currentToolMode === 'select' &&
        this.utils.lastActiveToolMode &&
        toolManager?.tools?.[this.utils.lastActiveToolMode]
      ) {
        const lastTool = this.utils.lastActiveToolMode;
        const rawDisplayName = toolManager.getToolDisplayName?.(lastTool) || lastTool;
        this._switchToToolFromConsole(lastTool, rawDisplayName);
      } else if (this.lastCommand) {
        this.handleExecute(this.lastCommand);
      }
      return;
    }

    if (isCommandRunning) {
      const catalogMatch = resolveCatalogEntry(trimmed);
      if (catalogMatch?.kind === 'command' && (catalogMatch.id === 'undo' || catalogMatch.id === 'redo')) {
        this._executeCatalogCommand(catalogMatch.id, true);
        return;
      }

      this.logStepInput(trimmed);
      if (typeof activeTool?.onCommandInput === 'function') {
        const handled = activeTool.onCommandInput(trimmed);
        if (handled === false) {
          const tag = this._getActiveCommandTag();
          const msg = tag ? `${tag} Entrada no válida: "${trimmed}"` : `Entrada no válida: "${trimmed}"`;
          this.logSystem(msg);
        }
      }
      this.focusInput();
      return;
    }

    const catalogMatch = resolveCatalogEntry(trimmed);
    if (catalogMatch?.kind === 'command') {
      this._executeCatalogCommand(catalogMatch.id, false);
      return;
    }

    const targetTool =
      toolManager?.resolveCommand?.(trimmed) ||
      (catalogMatch?.kind === 'tool' ? catalogMatch.id : null);

    if (targetTool) {
      this._switchToToolFromConsole(targetTool, trimmed);
      return;
    }

    this.logUser(this.formatCommandName(trimmed), 'Comando: ', { grouped: false });
    this.logSystem(`[COMANDO] ${CAD_CATALOG.system.unknownCommand(trimmed)}`, { grouped: false });
    this.focusInput();
  }

  _executeCatalogCommand(commandId, isCommandRunning) {
    if (commandId === 'undo') {
      this.triggerUndo();
      this.lastCommand = CAD_CATALOG.commands.undo.displayName;
      this.focusInput();
      return;
    }

    if (commandId === 'redo') {
      this.triggerRedo();
      this.lastCommand = CAD_CATALOG.commands.redo.displayName;
      this.focusInput();
      return;
    }

    if (commandId === 'clear') {
      const clearLabel = CAD_CATALOG.commands.clear.displayName;
      if (isCommandRunning) {
        this.endCommandGroup();
      }
      this.logUser(clearLabel, 'Comando: ', { grouped: false });
      this.utils.clearCanvas();
      this.logSystem(`[LIMPIAR] ${CAD_CATALOG.commands.clear.logs.done}`, { grouped: false });
      this.lastCommand = clearLabel;
      this.focusInput();
    }
    if (['import', 'import_image', 'import_svg'].includes(commandId)) {
      const entry = CAD_CATALOG.commands[commandId];
      this.beginCompactBlock();
      this.logUser(entry.displayName, 'Comando: ', { grouped: true });
      this.lastCommand = entry.displayName;

      const accept =
        commandId === 'import_svg'
          ? '.svg,image/svg+xml'
          : commandId === 'import_image'
            ? 'image/*'
            : '.svg,image/*';

      const ioService = this.utils.ioService;
      ioService?.promptFileImport?.({ accept, source: 'console' });
      return;
    }

    if (commandId === 'export_svg') {
      const exportLabel = CAD_CATALOG.commands.export_svg.displayName;
      this.beginCompactBlock();
      this.logUser(exportLabel, 'Comando: ', { grouped: true });
      this.lastCommand = exportLabel;
      const ioService = this.utils.ioService;
      ioService?.exportSVG?.();
      this.focusInput();
      return;
    }
  }

  _switchToToolFromConsole(targetTool, rawText) {
    const toolManager = this.utils.toolManager;
    const rawDisplayName = toolManager?.getToolDisplayName?.(targetTool) || rawText;
    const displayLabel = this.formatCommandName(rawDisplayName);

    this.endCommandGroup();
    this.logUser(displayLabel, 'Comando: ', { grouped: false });

    this.lastCommand = displayLabel;
    this._skipNextToolEcho = true;
    try {
      this.utils.setTool(targetTool);
    } finally {
      this._skipNextToolEcho = false;
    }
    this.focusInput();
  }

  _clearInputs() {
    if (this.fixedUI?.input) this.fixedUI.input.value = '';
    if (this.floatingUI?.input) this.floatingUI.input.value = '';
    this.autocomplete?.close();
  }

  _handleInputKeyDown(e) {
    const sourceInput = e.currentTarget || this.fixedUI.input;
    if (!sourceInput) return;

    if (this.autocomplete?.handleKeyDown(e)) {
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      const value = sourceInput.value;
      this._clearInputs();
      this.handleExecute(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.handleCancel();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && sourceInput.value === '') {
      e.preventDefault();
      if (this.utils?.currentToolMode !== 'select') return;

      if (this.utils?.deleteSelectedHandleOrSegment) {
        this.utils.deleteSelectedHandleOrSegment();
      } else if (this.utils?.service?.deleteSelectedElements) {
        this.utils.service.deleteSelectedElements();
      }
    }
  }

  _handleOptionMouseDown(e) {
    const optEl = e.target?.closest?.('.cmd-option');
    if (!optEl) return;
    if (typeof e.button === 'number' && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const cmd = optEl.getAttribute('data-cmd');
    if (!cmd) return;

    this._clearInputs();
    this.handleExecute(cmd);
  }

  _handleConsoleContextMenu(e) {
    const hasActiveTool =
      this.state === 'COMMAND_ACTIVE' ||
      (this.utils?.currentToolMode && this.utils.currentToolMode !== 'select');

    if (hasActiveTool) {
      e.preventDefault();
      e.stopPropagation();
      this.handleCancel();
      return;
    }

    const activeInput = this.getActiveInput() || this.fixedUI?.input;
    const pendingText = (activeInput?.value || this.fixedUI?.input?.value || '').trim();
    if (pendingText) {
      e.preventDefault();
      e.stopPropagation();
      this._clearInputs();
      this.handleExecute(pendingText);
    }
  }

  handleCancel() {
    if (!this.utils) return;
    this.autocomplete?.close();
    this._clearInputs();

    const activeTool = this.utils.toolManager?.activeTool;
    const isCommandRunning =
      this.state === 'COMMAND_ACTIVE' ||
      (this.utils.currentToolMode && this.utils.currentToolMode !== 'select');

    if (isCommandRunning) {
      const tag = this._getActiveCommandTag();
      const cancelMsg = tag ? `${tag} ${CAD_CATALOG.system.cancelled}` : CAD_CATALOG.system.cancelled;
      this.logSystem(cancelMsg);
      this.endCommandGroup();
      this.utils.setTool('select');
      const canvas = this.utils.canvasElement || document.getElementById('cadCanvas');
      if (canvas) canvas.focus();
      return;
    }

    if (typeof activeTool?.cancel === 'function') {
      activeTool.cancel();
    }
    this.utils.service?.deselectAllEntities?.();
    this.utils.service?.deselectAllSegments?.();
    this.utils.service?.deselectAllHandles?.();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.utils.selectionRenderEngine?.renderBezierHandles?.();
    this.utils.paper?.view?.update();
    this.setPrompt('Comando:');
  }

  _runHistoryAction(direction) {
    if (!this.utils) return false;

    const isUndo = direction === 'undo';
    const activeTool = this.utils.toolManager?.activeTool;
    const toolHook = isUndo ? activeTool?.onUndo : activeTool?.onRedo;
    const isCommandRunning =
      this.state === 'COMMAND_ACTIVE' &&
      this.utils.currentToolMode !== 'select' &&
      this.utils.currentToolMode !== 'pan';

    if (isCommandRunning && typeof toolHook === 'function' && toolHook.call(activeTool)) {
      this.utils.selectionRenderEngine?.updateEntitiesStroke();
      this.utils.selectionRenderEngine?.renderBezierHandles();
      this.utils.paper?.view?.update();
      this.utils.uiManager?.updateUndoRedoUI?.();
      this.focusInput();
      return true;
    }

    if (isCommandRunning) {
      this.handleCancel();
    }

    const changed = isUndo
      ? Boolean(this.utils.service?.undo())
      : Boolean(this.utils.service?.redo());

    this.utils.selectionRenderEngine?.updateEntitiesStroke();
    this.utils.selectionRenderEngine?.renderBezierHandles();
    this.utils.paper?.view?.update();
    return changed;
  }

  triggerUndo() {
    return this._runHistoryAction('undo');
  }

  triggerRedo() {
    return this._runHistoryAction('redo');
  }

  cleanup() {
    this.autocomplete?.destroy();
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

    this.fixedUI?.cleanup?.();
    this.floatingUI?.destroy?.();
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

  showWelcomeMessage(htmlContent = null) {
    this.renderer.showWelcomeMessage(htmlContent);
  }
}