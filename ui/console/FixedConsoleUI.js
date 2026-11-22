/**
 * ui/console/FixedConsoleUI.js - Componente de la Consola Fija Inferior
 * Renderiza el input fijo inferior con prompt dinámico y expone los métodos de log e interacción.
 */
export class FixedConsoleUI {
  constructor(containerId = 'fixedConsoleSlot') {
    this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    this.isCollapsed = false;
    this.height = 76;
    this.minHeight = 40;
    this.maxHeight = 260;
    this.previousHeight = this.height;

    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);

    this.render();
    this.initDOM();
    this.initEvents();
  }

  render() {
    if (!this.container) return;

    this.container.classList.add('flex', 'flex-col', 'justify-end');

    this.container.innerHTML = `
      <!-- Panel Principal de Consola -->
      <div id="fixedConsoleBox" class="cad-panel relative p-1.5 rounded text-xs text-zinc-300 flex flex-col justify-end gap-1 w-full font-sans z-10 box-border" style="height: ${this.height}px;">
        
        <!-- Resizer Superior -->
        <div id="fixedConsoleResizer" class="group absolute top-0 inset-x-0 h-[8px] cursor-row-resize z-30 flex items-start justify-center">
          <div id="fixedConsoleResizerVisual" class="w-full h-[3px] bg-transparent transition-colors duration-150 pointer-events-none"></div>
        </div>

        <!-- CONTENEDOR DEL LOG -->
        <div id="fixedConsoleLogArea" class="cad-console-log"></div>
        
        <!-- RENGLÓN INFERIOR FIJO: Contenedor Unificado (Prompt + Input) + Acciones -->
        <div id="fixedConsoleInputRow" class="flex items-center gap-1.5 w-full shrink-0 h-[28px] min-h-[28px] max-h-[28px] relative z-20">
          <div id="fixedCommandInputWrapper" class="flex items-center flex-1 min-w-[120px] h-7 min-h-[28px] px-2.5 rounded cursor-text overflow-hidden" style="background-color: var(--cad-bg-input);">
            <span id="fixedCommandPrompt" class="text-xs font-normal text-zinc-400 whitespace-nowrap shrink-0 pr-1.5 select-none">Comando:</span>
            <input id="cmdInput" type="text" autocomplete="off" class="command-input flex-1 min-w-[40px] py-1 text-xs h-full outline-none focus:outline-none" />
          </div>
          
          <div class="flex items-center gap-1 shrink-0">
            <button id="btnToggleConsole" class="cad-button cad-button-square h-6 w-6 rounded bg-[#27272a] hover:bg-[#3f3f46] text-zinc-300 tooltip-top" data-tooltip="Registro de comandos [{shortcut:console}]">
              <span class="iconify text-sm icon-crisp shrink-0" data-icon="lucide:logs"></span> 
            </button>
            <button id="btnCollapseFixedConsole" class="cad-button cad-button-square h-6 w-6 rounded bg-[#27272a] hover:bg-[#3f3f46] text-zinc-300 tooltip-top" data-tooltip="Colapsar / Desplegar Consola">
              <span class="iconify text-sm icon-crisp shrink-0" data-icon="lucide:chevron-down"></span>
            </button>
          </div>
        </div>

      </div>
    `;
  }

  initDOM() {
    this.box = document.getElementById('fixedConsoleBox');
    this.resizer = document.getElementById('fixedConsoleResizer');
    this.logArea = document.getElementById('fixedConsoleLogArea');
    this.inputWrapper = document.getElementById('fixedCommandInputWrapper');
    this.promptEl = document.getElementById('fixedCommandPrompt');
    this.prompt = this.promptEl;
    this.btnCollapse = document.getElementById('btnCollapseFixedConsole');
    this.inputRow = document.getElementById('fixedConsoleInputRow');
    this.input = document.getElementById('cmdInput');
  }

  initEvents() {
    this.resizer?.addEventListener('mousedown', (e) => {
      e.preventDefault();

      this.startY = e.clientY;
      this.startHeight = this.box.getBoundingClientRect().height;
      this.resizer.classList.add('is-dragging');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      window.addEventListener('mousemove', this._onMouseMove);
      window.addEventListener('mouseup', this._onMouseUp);
    });

    this.inputWrapper?.addEventListener('click', (e) => {
      if (e.target.closest('.cmd-option')) return;
      this.input?.focus({ preventScroll: true });
    });

    this.btnCollapse?.addEventListener('click', () => this.toggleCollapse());
  }

  // --- MÉTODOS DE HISTORIAL Y OPCIONES ---

  setPrompt(text) {
    if (this.promptEl) {
      this.promptEl.textContent = text;
    }
  }

  setPromptHtml(html) {
    if (this.promptEl) {
      this.promptEl.innerHTML = html;
    }
  }

  appendUserEntry(text) {
    if (!this.logArea) return;
    const entry = document.createElement('div');
    entry.className = 'cad-console-entry cad-console-entry--user';
    entry.textContent = text;
    this.logArea.appendChild(entry);
    this.scrollToBottom();
  }

  appendSystemEntry(text) {
    if (!this.logArea) return;
    const entry = document.createElement('div');
    entry.className = 'cad-console-entry cad-console-entry--system';
    entry.textContent = text;
    this.logArea.appendChild(entry);
    this.scrollToBottom();
  }

  appendInteractiveEntry(htmlContent) {
    if (!this.logArea) return;
    const entry = document.createElement('div');
    entry.className = 'cad-console-entry cad-console-entry--interactive';
    entry.innerHTML = htmlContent;
    this.logArea.appendChild(entry);
    this.scrollToBottom();
  }

  clear() {
    if (!this.logArea) return;
    this.logArea.innerHTML = '';
  }

  scrollToBottom() {
    if (this.logArea) {
      this.logArea.scrollTop = this.logArea.scrollHeight;
    }
  }

  toggleCollapse(forceState = null) {
    this.isCollapsed = forceState !== null ? forceState : !this.isCollapsed;

    if (this.isCollapsed) {
      this.previousHeight = Math.max(this.height, 76);
      this.box.style.height = `${this.minHeight}px`;
      if (this.logArea) this.logArea.style.display = 'none';
    } else {
      this.height = Math.max(this.previousHeight, 76);
      this.box.style.height = `${this.height}px`;
      if (this.logArea) this.logArea.style.display = 'flex';
      this.scrollToBottom();
    }

    this._updateCollapseIcon(this.isCollapsed);
  }

  _updateCollapseIcon(collapsed) {
    const iconEl = this.btnCollapse?.querySelector('[data-icon]');
    if (iconEl) {
      iconEl.setAttribute('data-icon', collapsed ? 'lucide:chevron-up' : 'lucide:chevron-down');
    }
  }

  _handleMouseMove(e) {
    const deltaY = this.startY - e.clientY;
    const newHeight = Math.max(this.minHeight, Math.min(this.maxHeight, this.startHeight + deltaY));

    if (this.isCollapsed && newHeight > this.minHeight + 4) {
      this.isCollapsed = false;
      if (this.logArea) this.logArea.style.display = 'flex';
      this._updateCollapseIcon(false);
    }

    if (!this.isCollapsed && newHeight <= this.minHeight + 2) {
      this.isCollapsed = true;
      if (this.logArea) this.logArea.style.display = 'none';
      this._updateCollapseIcon(true);
    }

    this.height = newHeight;
    this.box.style.height = `${newHeight}px`;
    this.scrollToBottom();
  }

  _handleMouseUp() {
    this.resizer?.classList.remove('is-dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
  }
}