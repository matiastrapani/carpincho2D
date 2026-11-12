/**
 * ui/console/FixedConsoleUI.js - Componente de la Consola Fija Inferior
 * Renderiza el input fijo inferior y expone los métodos de log e interacción.
 */
export class FixedConsoleUI {
  constructor(containerId = 'fixedConsoleSlot') {
    this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    this.isCollapsed = false;
    this.height = 76;
    this.minHeight = 40; // Altura exacta para el renglón de input + paddings
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
          <div class="w-full h-[3px] bg-transparent group-hover:bg-[#008800] group-[.is-dragging]:bg-[#008800] transition-colors duration-150 pointer-events-none"></div>
        </div>

        <!-- CONTENEDOR DEL LOG: overflow-y-auto + overflow-x-hidden min-h-0 flex-1 para EVITAR desbordamientos -->
        <div id="fixedConsoleLogArea" class="flex-1 flex flex-col justify-start overflow-y-auto overflow-x-hidden font-mono text-[11px] text-zinc-300 min-h-0 p-1.5 gap-1 select-text">
          <div class="flex items-center gap-1.5 text-zinc-400 font-sans text-[11px] shrink-0">
            <i class="fa-solid fa-terminal text-[10px] text-zinc-500"></i>
            <span id="fixedCommandPrompt" class="text-zinc-300 leading-none">Command:</span>
          </div>
        </div>

        <!-- RENGLÓN INFERIOR FIJO: Inamovible de 28px -->
        <div id="fixedConsoleInputRow" class="flex items-center gap-1.5 w-full shrink-0 h-[28px] min-h-[28px] max-h-[28px] relative z-20">
          <input id="cmdInput" type="text" autocomplete="off" placeholder="Escribe comando o valor..." class="command-input flex-1 px-2.5 py-1 rounded text-xs h-7 min-h-[28px]" />
          
          <div class="flex items-center gap-1 shrink-0">
            <button id="btnToggleConsole" class="cad-button cad-button-square h-6 w-6 rounded bg-[#27272a] hover:bg-[#3f3f46] text-zinc-300 tooltip-top" data-tooltip="Registro de comandos [F2]">
              <i class="fa-solid fa-list-ul text-[10px]"></i>
            </button>
            <button id="btnCollapseFixedConsole" class="cad-button cad-button-square h-6 w-6 rounded bg-[#27272a] hover:bg-[#3f3f46] text-zinc-300 tooltip-top" data-tooltip="Colapsar / Desplegar Consola">
              <i id="fixedConsoleCollapseIcon" class="fa-solid fa-chevron-down text-[10px]"></i>
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
    this.promptEl = document.getElementById('fixedCommandPrompt');
    this.btnCollapse = document.getElementById('btnCollapseFixedConsole');
    this.collapseIcon = document.getElementById('fixedConsoleCollapseIcon');
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

    this.btnCollapse?.addEventListener('click', () => this.toggleCollapse());
  }

  // --- MÉTODOS DE HISTORIAL Y OPCIONES ---

  setPrompt(text) {
    if (this.promptEl) {
      this.promptEl.innerHTML = text;
    }
  }

  appendUserEntry(text) {
    if (!this.logArea) return;
    const entry = document.createElement('div');
    entry.className = 'flex items-center gap-2 text-zinc-100 font-semibold shrink-0';
    entry.innerHTML = `<span class="text-emerald-400 font-bold">&gt;</span> <span>${this._escape(text)}</span>`;
    this.logArea.appendChild(entry);
    this.scrollToBottom();
  }

  appendSystemEntry(text) {
    if (!this.logArea) return;
    const entry = document.createElement('div');
    entry.className = 'text-zinc-400 pl-2 border-l-2 border-zinc-700/60 my-0.5 shrink-0 break-words';
    entry.innerText = text;
    this.logArea.appendChild(entry);
    this.scrollToBottom();
  }

  appendInteractiveEntry(htmlContent) {
    if (!this.logArea) return;
    const entry = document.createElement('div');
    entry.className = 'text-zinc-300 my-0.5 shrink-0 break-words';
    entry.innerHTML = htmlContent;
    this.logArea.appendChild(entry);
    this.scrollToBottom();
  }

  clear() {
    if (!this.logArea) return;
    this.logArea.innerHTML = `
      <div class="flex items-center gap-1.5 text-zinc-400 font-sans text-[11px] shrink-0">
        <i class="fa-solid fa-terminal text-[10px] text-zinc-500"></i>
        <span id="fixedCommandPrompt" class="text-zinc-300 leading-none">${this.promptEl?.innerHTML || 'Command:'}</span>
      </div>
    `;
    this.promptEl = document.getElementById('fixedCommandPrompt');
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
      if (this.collapseIcon) this.collapseIcon.className = 'fa-solid fa-chevron-up text-[10px]';
    } else {
      this.height = Math.max(this.previousHeight, 76);
      this.box.style.height = `${this.height}px`;
      if (this.logArea) this.logArea.style.display = 'flex';
      if (this.collapseIcon) this.collapseIcon.className = 'fa-solid fa-chevron-down text-[10px]';
      this.scrollToBottom();
    }
  }

  _handleMouseMove(e) {
    const deltaY = this.startY - e.clientY;
    const newHeight = Math.max(this.minHeight, Math.min(this.maxHeight, this.startHeight + deltaY));

    if (this.isCollapsed && newHeight > this.minHeight + 4) {
      this.isCollapsed = false;
      if (this.logArea) this.logArea.style.display = 'flex';
      if (this.collapseIcon) this.collapseIcon.className = 'fa-solid fa-chevron-down text-[10px]';
    }

    if (!this.isCollapsed && newHeight <= this.minHeight + 2) {
      this.isCollapsed = true;
      if (this.logArea) this.logArea.style.display = 'none';
      if (this.collapseIcon) this.collapseIcon.className = 'fa-solid fa-chevron-up text-[10px]';
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

  _escape(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}