/**
 * ui/CommandBarManager.js - Gestión del Prompt, Consola e Historial Flotante [F2]
 */
class CommandBarManager {
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

    this.initEvents();
    this.initDraggableModal();
  }

  initEvents() {
    if (this.cmdInput) {
      this.cmdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const value = this.cmdInput.value.trim();
          this.cmdInput.value = '';
          if (value) {
            this.logUserCommand(value);
            this.handleCommandInput(value);
          }
        }
      });
    }

    if (this.btnToggleConsole) {
      this.btnToggleConsole.addEventListener('click', () => this.toggleConsoleModal());
    }

    if (this.btnCloseConsoleModal) {
      this.btnCloseConsoleModal.addEventListener('click', () => this.hideConsoleModal());
    }

    // Atajo F2 para alternar el modal de historial
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        this.toggleConsoleModal();
      } else if (e.key === 'Escape' && this.isConsoleOpen) {
        this.hideConsoleModal();
      }
    });
  }

  initDraggableModal() {
    if (!this.consoleWindow || !this.consoleHeader) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    this.consoleHeader.addEventListener('mousedown', (e) => {
      if (e.target === this.btnCloseConsoleModal || this.btnCloseConsoleModal?.contains(e.target)) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.consoleWindow.getBoundingClientRect();
      
      // La primera vez remueve las clases CSS de centrado fijo para permitir libre arrastre
      if (!this.hasBeenPositioned) {
        this.consoleWindow.classList.remove('-translate-x-1/2', '-translate-y-1/2');
        this.consoleWindow.style.left = `${rect.left}px`;
        this.consoleWindow.style.top = `${rect.top}px`;
        this.hasBeenPositioned = true;
      }

      initialLeft = parseFloat(this.consoleWindow.style.left) || rect.left;
      initialTop = parseFloat(this.consoleWindow.style.top) || rect.top;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      this.consoleWindow.style.left = `${initialLeft + dx}px`;
      this.consoleWindow.style.top = `${initialTop + dy}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  toggleConsoleModal() {
    if (this.isConsoleOpen) {
      this.hideConsoleModal();
    } else {
      this.showConsoleModal();
    }
  }

  showConsoleModal() {
    if (!this.consoleModal) return;
    this.consoleModal.classList.remove('hidden');
    this.isConsoleOpen = true;
    if (this.btnToggleConsole) this.btnToggleConsole.classList.add('active');
    this.scrollToBottom();
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
}

window.CommandBarManager = CommandBarManager;