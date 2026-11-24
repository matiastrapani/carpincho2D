/**
 * ui/console/FloatingConsoleUI.js - Modal Emergente de Consola Flotante [F2]
 * Estilo minimalista sincronizado con la barra de herramientas (#1e1e24) y sombra sutil.
 */
export class FloatingConsoleUI {
  constructor() {
    this.isOpen = false;

    this._onWindowResize = this._handleWindowResize.bind(this);
    this._onDocumentClick = this._handleDocumentClick.bind(this);

    this.render();
    this.initDOM();
    this.initEvents();
    this.initDraggable();
    this.initResizers();
  }

  render() {
    const existing = document.getElementById('cmdConsoleModal');
    if (existing) existing.remove();

    const modalHTML = `
      <!-- Contenedor del Modal Flotante -->
      <div id="cmdConsoleModal" class="hidden fixed inset-0 z-[100] pointer-events-none">
        <div id="cmdConsoleWindow" 
             class="cad-panel w-[580px] h-[380px] min-w-[340px] min-h-[220px] max-w-[95vw] max-h-[90vh] rounded-lg flex flex-col pointer-events-auto border border-[#2a2a32] overflow-hidden absolute select-none"
             style="background-color: #1e1e24 !important; box-shadow: 5px 5px 15px 0 rgba(0, 0, 0, 1.0) !important;">
          
          <!-- Tiradores de Redimensionamiento Perimetral (8 Direcciones) -->
          <div class="resize-handle handle-n absolute -top-1 left-3 right-3 h-2 cursor-n-resize z-20"></div>
          <div class="resize-handle handle-s absolute -bottom-1 left-3 right-3 h-2 cursor-s-resize z-20"></div>
          <div class="resize-handle handle-w absolute -left-1 top-3 bottom-3 w-2 cursor-w-resize z-20"></div>
          <div class="resize-handle handle-e absolute -right-1 top-3 bottom-3 w-2 cursor-e-resize z-20"></div>
          <div class="resize-handle handle-nw absolute -top-1 -left-1 w-4 h-4 cursor-nw-resize z-30"></div>
          <div class="resize-handle handle-ne absolute -top-1 -right-1 w-4 h-4 cursor-ne-resize z-30"></div>
          <div class="resize-handle handle-sw absolute -bottom-1 -left-1 w-4 h-4 cursor-sw-resize z-30"></div>
          <div class="resize-handle handle-se absolute -bottom-1 -right-1 w-4 h-4 cursor-se-resize z-30"></div>

          <!-- Header del Modal -->
          <div id="cmdConsoleHeader" class="bg-[#1e1e24] px-3.5 py-2 flex items-center justify-between cursor-grab active:cursor-grabbing border-b border-[#2a2a32] shrink-0 select-none touch-none">
            <span class="text-xs font-semibold text-zinc-200 tracking-wide uppercase pointer-events-none">Registro de comandos</span>
            <button id="btnCloseConsoleModal" class="text-zinc-400 hover:text-white text-xs w-6 h-6 flex items-center justify-center rounded hover:bg-[#2a2a32] transition-colors pointer-events-auto">
              <span class="iconify text-xs shrink-0" data-icon="lucide:x"></span> 
            </button>
          </div>

          <!-- Log de Entradas y Salidas -->
          <div id="cmdConsoleLog" class="cad-console-log bg-[#1e1e24]"></div>          
          
          <!-- Renglón 2: Contenedor Unificado (Prompt + Input Flotante) -->
          <div id="floatingConsoleInputRow" class="p-2 border-t border-[#2a2a32] bg-[#1e1e24] shrink-0 flex items-center gap-1.5">
            <div id="floatingCommandInputWrapper" class="flex items-center flex-1 min-w-[120px] h-7 px-2.5 rounded cursor-text overflow-hidden" style="background-color: var(--cad-bg-input);">
              <span id="floatingCommandPrompt" class="text-xs font-normal text-zinc-400 whitespace-nowrap shrink-0 pr-1.5 select-none">Comando:</span>
              <input id="cmdInputFloating" type="text" autocomplete="off" class="command-input flex-1 min-w-[40px] py-1 text-xs h-full outline-none focus:outline-none" />
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  initDOM() {
    this.modal = document.getElementById('cmdConsoleModal');
    this.window = document.getElementById('cmdConsoleWindow');
    this.header = document.getElementById('cmdConsoleHeader');
    this.log = document.getElementById('cmdConsoleLog');
    this.btnClose = document.getElementById('btnCloseConsoleModal');
    this.inputWrapper = document.getElementById('floatingCommandInputWrapper');
    this.promptEl = document.getElementById('floatingCommandPrompt');
    this.prompt = this.promptEl;
    this.input = document.getElementById('cmdInputFloating');
  }

  initEvents() {
    this.btnClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });

    this.inputWrapper?.addEventListener('click', (e) => {
      if (e.target.closest('.cmd-option')) return;
      this.input?.focus({ preventScroll: true });
    });

    window.addEventListener('resize', this._onWindowResize);
    document.addEventListener('click', this._onDocumentClick);
  }

  _handleDocumentClick(e) {
    const toggleBtn = e.target.closest('#btnToggleConsole');
    if (toggleBtn) {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    }
  }

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

  _handleWindowResize() {
    if (this.isOpen && this.window) {
      this.clampToViewport();
    }
  }

  centerInViewport() {
    if (!this.window) return;

    this.window.style.transform = 'none';

    const viewportW = document.documentElement.clientWidth;
    const viewportH = document.documentElement.clientHeight;

    let width = this.window.offsetWidth || 580;
    let height = this.window.offsetHeight || 380;

    if (width > viewportW) {
      width = Math.max(340, viewportW - 20);
      this.window.style.width = `${width}px`;
    }
    if (height > viewportH) {
      height = Math.max(200, viewportH - 20);
      this.window.style.height = `${height}px`;
    }

    const left = Math.max(0, (viewportW - width) / 2);
    const top = Math.max(0, (viewportH - height) / 2);

    this.window.style.left = `${left}px`;
    this.window.style.top = `${top}px`;
  }

  initDraggable() {
    if (!this.header || !this.window) return;

    this.header.addEventListener('pointerdown', (e) => {
      if (e.target === this.btnClose || this.btnClose?.contains(e.target)) return;
      if (e.button !== 0) return;

      e.preventDefault();

      try {
        this.header.setPointerCapture(e.pointerId);
      } catch (_) {}

      const startX = e.clientX;
      const startY = e.clientY;
      const initialLeft = this.window.offsetLeft;
      const initialTop = this.window.offsetTop;

      const onPointerMove = (moveEvt) => {
        const viewportW = document.documentElement.clientWidth;
        const viewportH = document.documentElement.clientHeight;

        const isInside = (
          moveEvt.clientX >= 0 &&
          moveEvt.clientX <= viewportW &&
          moveEvt.clientY >= 0 &&
          moveEvt.clientY <= viewportH
        );

        if (isInside) {
          this.window.style.left = `${initialLeft + (moveEvt.clientX - startX)}px`;
          this.window.style.top = `${initialTop + (moveEvt.clientY - startY)}px`;
        }
      };

      const stopDrag = (upEvt) => {
        try {
          this.header.releasePointerCapture(upEvt.pointerId);
        } catch (_) {}
        this.header.removeEventListener('pointermove', onPointerMove);
        this.header.removeEventListener('pointerup', stopDrag);
        this.header.removeEventListener('pointercancel', stopDrag);
      };

      this.header.addEventListener('pointermove', onPointerMove);
      this.header.addEventListener('pointerup', stopDrag);
      this.header.addEventListener('pointercancel', stopDrag);
    });
  }

  initResizers() {
    if (!this.window) return;
    const handles = this.window.querySelectorAll('.resize-handle');

    handles.forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        try {
          handle.setPointerCapture(e.pointerId);
        } catch (_) {}

        const startX = e.clientX;
        const startY = e.clientY;
        const startW = this.window.offsetWidth;
        const startH = this.window.offsetHeight;
        const startL = this.window.offsetLeft;
        const startT = this.window.offsetTop;

        const minW = 340;
        const minH = 200;

        const isN = handle.classList.contains('handle-n') || handle.classList.contains('handle-nw') || handle.classList.contains('handle-ne');
        const isS = handle.classList.contains('handle-s') || handle.classList.contains('handle-sw') || handle.classList.contains('handle-se');
        const isW = handle.classList.contains('handle-w') || handle.classList.contains('handle-nw') || handle.classList.contains('handle-sw');
        const isE = handle.classList.contains('handle-e') || handle.classList.contains('handle-ne') || handle.classList.contains('handle-se');

        const onPointerMove = (moveEvt) => {
          const deltaX = moveEvt.clientX - startX;
          const deltaY = moveEvt.clientY - startY;

          let newW = startW, newH = startH, newL = startL, newT = startT;

          if (isE) newW = Math.max(minW, startW + deltaX);
          if (isS) newH = Math.max(minH, startH + deltaY);

          if (isW) {
            newW = Math.max(minW, startW - deltaX);
            newL = startL + (startW - newW);
          }
          if (isN) {
            newH = Math.max(minH, startH - deltaY);
            newT = startT + (startH - newH);
          }

          this.window.style.width = `${newW}px`;
          this.window.style.height = `${newH}px`;
          this.window.style.left = `${newL}px`;
          this.window.style.top = `${newT}px`;
        };

        const stopResize = (upEvt) => {
          try {
            handle.releasePointerCapture(upEvt.pointerId);
          } catch (_) {}
          handle.removeEventListener('pointermove', onPointerMove);
          handle.removeEventListener('pointerup', stopResize);
          handle.removeEventListener('pointercancel', stopResize);
        };

        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', stopResize);
        handle.addEventListener('pointercancel', stopResize);
      });
    });
  }

  clampToViewport() {
    if (!this.window) return;

    const viewportW = document.documentElement.clientWidth;
    const viewportH = document.documentElement.clientHeight;
    const winW = this.window.offsetWidth;
    const winH = this.window.offsetHeight;

    if (winW > viewportW) {
      this.window.style.width = `${Math.max(340, viewportW - 20)}px`;
    }
    if (winH > viewportH) {
      this.window.style.height = `${Math.max(200, viewportH - 20)}px`;
    }

    const currentL = this.window.offsetLeft;
    const currentT = this.window.offsetTop;

    const maxLeft = Math.max(0, viewportW - this.window.offsetWidth);
    const maxTop = Math.max(0, viewportH - this.window.offsetHeight);

    this.window.style.left = `${Math.max(0, Math.min(currentL, maxLeft))}px`;
    this.window.style.top = `${Math.max(0, Math.min(currentT, maxTop))}px`;
  }

  toggle() {
    this.isOpen ? this.hide() : this.show();
  }

  show() {
    if (!this.modal || !this.window) return;
    this.modal.classList.remove('hidden');
    this.isOpen = true;
    this.centerInViewport();
    this.scrollToBottom();
    setTimeout(() => this.input?.focus(), 50);
  }

  hide() {
    if (!this.modal) return;
    this.modal.classList.add('hidden');
    this.isOpen = false;
  }

  clear() {
    if (this.log) {
      this.log.innerHTML = '';
    }
  }

  scrollToBottom() {
    if (this.log) {
      this.log.scrollTop = this.log.scrollHeight;
    }
  }

  destroy() {
    this.unbindInputSync();
    window.removeEventListener('resize', this._onWindowResize);
    document.removeEventListener('click', this._onDocumentClick);
    this.modal?.remove();
  }

  unbindInputSync() {
    if (this.syncController) {
      this.syncController.abort();
      this.syncController = null;
    }
  }

  bindInputSync(fixedInputEl) {
    if (!this.input || !fixedInputEl) return;

    this.unbindInputSync();

    this.syncController = new AbortController();
    const { signal } = this.syncController;

    this.input.addEventListener('input', (e) => {
      fixedInputEl.value = e.target.value;
    }, { signal });

    fixedInputEl.addEventListener('input', (e) => {
      this.input.value = e.target.value;
    }, { signal });
  }
}