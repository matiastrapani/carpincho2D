/**
 * ui/console/FloatingConsoleUI.js - Modal Emergente de Consola Flotante [F2]
 * Estilo minimalista sincronizado con la barra de herramientas (#1e1e24) y sombra sutil.
 */
export class FloatingConsoleUI {
  constructor() {
    this.isOpen = false;

    this._onKeyDown = this._handleKeyDown.bind(this);
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
            <span class="text-xs font-semibold text-zinc-200 tracking-wide uppercase pointer-events-none">Historial de Consola CAD</span>
            <button id="btnCloseConsoleModal" class="text-zinc-400 hover:text-white text-xs w-6 h-6 flex items-center justify-center rounded hover:bg-[#2a2a32] transition-colors pointer-events-auto">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Log de Entradas y Salidas -->
          <div id="cmdConsoleLog" class="flex-1 p-3.5 overflow-y-auto bg-[#1e1e24] font-mono text-[11px] flex flex-col gap-1.5 text-zinc-300 select-text"></div>

          <!-- Renglón 2: Input Flotante -->
          <div id="floatingConsoleInputRow" class="p-2 border-t border-[#2a2a32] bg-[#1e1e24] shrink-0">
            <input id="cmdInputFloating" type="text" autocomplete="off" placeholder="Escribe comando o valor..." class="command-input flex-1 px-2.5 py-1 rounded text-xs w-full h-7" />
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
    this.input = document.getElementById('cmdInputFloating');
  }

  initEvents() {
    this.btnClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });

    window.addEventListener('keydown', this._onKeyDown);
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
    // Si tu ventana flotante tiene un elemento para el prompt (o si no usa prompt visual)
    if (this.promptEl) {
      this.promptEl.innerHTML = text;
    }
  }

  _handleKeyDown(e) {
    if (e.key === 'F2') {
      e.preventDefault();
      this.toggle();
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

  appendUserEntry(text) {
    if (!this.log) return;
    const entry = document.createElement('div');
    entry.className = 'flex items-center gap-2 text-zinc-100 font-semibold';
    entry.innerHTML = `<span class="text-emerald-400 font-bold">&gt;</span> <span>${this._escape(text)}</span>`;
    this.log.appendChild(entry);
    this.scrollToBottom();
  }

  appendSystemEntry(text) {
    if (!this.log) return;
    const entry = document.createElement('div');
    entry.className = 'text-zinc-400 pl-3 border-l-2 border-zinc-700/60 my-0.5';
    entry.innerText = text;
    this.log.appendChild(entry);
    this.scrollToBottom();
  }

  scrollToBottom() {
    if (this.log) {
      this.log.scrollTop = this.log.scrollHeight;
    }
  }

  _escape(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
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

    // Sincronización bidireccional al tipear
    this.input.addEventListener('input', (e) => {
      fixedInputEl.value = e.target.value;
    }, { signal });

    fixedInputEl.addEventListener('input', (e) => {
      this.input.value = e.target.value;
    }, { signal });

    // Control de Enter y Escape desde la consola flotante
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        // Redirigir la tecla al input fijo para que ConsoleManager gestione la cancelación o ejecución
        const event = new KeyboardEvent('keydown', { key: e.key, bubbles: true });
        fixedInputEl.dispatchEvent(event);
        
        setTimeout(() => {
          this.input.value = fixedInputEl.value;
        }, 0);
      }
    }, { signal });

    // Sincronizar enter/escape desde el input fijo al flotante
    fixedInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        setTimeout(() => {
          if (this.input) this.input.value = fixedInputEl.value;
        }, 0);
      }
    }, { signal });
  }
}