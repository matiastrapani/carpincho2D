/**
 * ui/CommandBarManager.js - Gestión del Prompt, Consola e Historial Flotante [F2]
 */
export class CommandBarManager {
  constructor(cadUtils) {
    this.utils = cadUtils;
    this.cmdPrompt = document.getElementById('commandPrompt');
    this.cmdInput = document.getElementById('cmdInput');
    this.consoleModal = document.getElementById('cmdConsoleModal');
    this.consoleWindow = document.getElementById('cmdConsoleWindow');
    this.consoleHeader = document.getElementById('cmdConsoleHeader');
    this.consoleLog = document.getElementById('cmdConsoleLog');
    this.btnToggleConsole = document.getElementById('btnToggleConsole');
    this.btnCloseConsoleModal = document.getElementById('btnCloseConsoleModal');

    this.isConsoleOpen = false;
    this.hasBeenPositioned = false;

    // Guardar referencias de handlers para poder removerlos en cleanup
    this._onInputKeyDown = this._handleInputKeyDown.bind(this);
    this._onToggleClick = () => this.toggleConsoleModal();
    this._onCloseClick = () => this.hideConsoleModal();
    this._onWindowKeyDown = this._handleWindowKeyDown.bind(this);

    // Registro de limpiador del arrastre activo
    this._activeDragCleanup = null;

    this.initEvents();
    this.initDraggableModal();
  }

  initEvents() {
    if (this.cmdInput) {
      this.cmdInput.addEventListener('keydown', this._onInputKeyDown);
    }

    if (this.btnToggleConsole) {
      this.btnToggleConsole.addEventListener('click', this._onToggleClick);
    }

    if (this.btnCloseConsoleModal) {
      this.btnCloseConsoleModal.addEventListener('click', this._onCloseClick);
    }

    window.addEventListener('keydown', this._onWindowKeyDown);
  }

  _handleInputKeyDown(e) {
    if (e.key === 'Enter') {
      const value = this.cmdInput.value.trim();
      this.cmdInput.value = '';
      if (value) {
        this.logUserCommand(value);
        this.handleCommandInput(value);
      }
    }
  }

  _handleWindowKeyDown(e) {
    if (e.key === 'F2') {
      e.preventDefault();
      this.toggleConsoleModal();
    }
  }

  _refreshDOMReferences() {
    if (!this.cmdInput || !this.cmdInput.isConnected) this.cmdInput = document.getElementById('cmdInput');
    if (!this.btnToggleConsole || !this.btnToggleConsole.isConnected) this.btnToggleConsole = document.getElementById('btnToggleConsole');
    if (!this.consoleModal || !this.consoleModal.isConnected) this.consoleModal = document.getElementById('cmdConsoleModal');
    if (!this.consoleWindow || !this.consoleWindow.isConnected) this.consoleWindow = document.getElementById('cmdConsoleWindow');
    if (!this.consoleHeader || !this.consoleHeader.isConnected) this.consoleHeader = document.getElementById('cmdConsoleHeader');
    if (!this.consoleLog || !this.consoleLog.isConnected) this.consoleLog = document.getElementById('cmdConsoleLog');
    if (!this.btnCloseConsoleModal || !this.btnCloseConsoleModal.isConnected) this.btnCloseConsoleModal = document.getElementById('btnCloseConsoleModal');
    if (!this.cmdPrompt || !this.cmdPrompt.isConnected) this.cmdPrompt = document.getElementById('commandPrompt');
  }

  initDraggableModal() {
    if (!this.consoleWindow || !this.consoleHeader) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    this.consoleHeader.addEventListener('mousedown', (e) => {
      if (e.target === this.btnCloseConsoleModal || this.btnCloseConsoleModal?.contains(e.target)) return;

      e.preventDefault();

      // 1. Obtener las coordenadas visuales absolutas en la pantalla actual
      const rect = this.consoleWindow.getBoundingClientRect();

      // 2. Si es el primer arrastre, fijar posición absoluta/fixed respecto al viewport
      if (!this.hasBeenPositioned) {
        // Remover transformaciones CSS que alteren el origen de coordenadas
        this.consoleWindow.classList.remove('-translate-x-1/2', '-translate-y-1/2', 'top-1/2', 'left-1/2', 'transform');
        
        // Desacoplar márgenes y fijar coordenadas exactas de la pantalla
        this.consoleWindow.style.position = 'fixed';
        this.consoleWindow.style.margin = '0';
        this.consoleWindow.style.left = `${rect.left}px`;
        this.consoleWindow.style.top = `${rect.top}px`;

        this.hasBeenPositioned = true;
      }

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      // Usamos el rect.left/top capturado en este instante exacto
      initialLeft = rect.left;
      initialTop = rect.top;

      const onMouseMove = (moveEvt) => {
        if (!isDragging) return;
        const dx = moveEvt.clientX - startX;
        const dy = moveEvt.clientY - startY;

        this.consoleWindow.style.left = `${initialLeft + dx}px`;
        this.consoleWindow.style.top = `${initialTop + dy}px`;
      };

      const onMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  toggleConsoleModal() {
    if (this.isConsoleOpen) {
      this.hideConsoleModal();
    } else {
      this.showConsoleModal();
    }
  }

  showConsoleModal() {
    this._refreshDOMReferences();
    if (!this.consoleModal) return;
    this.consoleModal.classList.remove('hidden');
    this.isConsoleOpen = true;
    if (this.btnToggleConsole) this.btnToggleConsole.classList.add('active');
    this.scrollToBottom();
    if (this.cmdInput) this.cmdInput.focus();
  }

  hideConsoleModal() {
    if (!this.consoleModal) return;
    this.consoleModal.classList.add('hidden');
    this.isConsoleOpen = false;
    if (this.btnToggleConsole) this.btnToggleConsole.classList.remove('active');
  }

  setPrompt(text) {
    const formattedText = text || 'Command:';
    if (this.cmdPrompt) {
      this.cmdPrompt.innerText = formattedText;
    }
    this.logSystemMessage(formattedText);
  }

  logUserCommand(commandText) {
    if (!this.consoleLog) return;
    const entry = document.createElement('div');
    entry.className = 'flex items-center gap-2 text-zinc-100 font-semibold';
    entry.innerHTML = `<span class="text-emerald-400 font-bold">&gt;</span> <span>${this.escapeHTML(commandText)}</span>`;
    this.consoleLog.appendChild(entry);
    this.scrollToBottom();
  }

  logSystemMessage(messageText) {
    if (!this.consoleLog) return;
    const entry = document.createElement('div');
    entry.className = 'text-zinc-400 pl-3 border-l-2 border-zinc-700/60 my-0.5';
    entry.innerText = messageText;
    this.consoleLog.appendChild(entry);
    this.scrollToBottom();
  }

  scrollToBottom() {
    if (this.consoleLog) {
      this.consoleLog.scrollTop = this.consoleLog.scrollHeight;
    }
  }

  escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  handleCommandInput(input) {
    const activeTool = this.utils.toolManager.activeTool;
    if (activeTool && typeof activeTool.onCommandInput === 'function') {
      activeTool.onCommandInput(input);
      return;
    }

    const cmd = input.toLowerCase();
    if (this.utils.toolManager.tools[cmd]) {
      this.utils.setTool(cmd);
    }
  }

  destroy() {
    this.cleanup();
  }

  cleanup() {
    // Desvincular eventos del teclado global y del DOM
    window.removeEventListener('keydown', this._onWindowKeyDown);

    if (this.cmdInput) {
      this.cmdInput.removeEventListener('keydown', this._onInputKeyDown);
    }

    if (this.btnToggleConsole) {
      this.btnToggleConsole.removeEventListener('click', this._onToggleClick);
    }

    if (this.btnCloseConsoleModal) {
      this.btnCloseConsoleModal.removeEventListener('click', this._onCloseClick);
    }

    if (this.consoleHeader && this._onHeaderPointerDown) {
      this.consoleHeader.removeEventListener('pointerdown', this._onHeaderPointerDown);
    }

    // Limpiar arrastre activo colgado si se destruye en pleno drag
    if (typeof this._activeDragCleanup === 'function') {
      this._activeDragCleanup();
    }
  }
}

