/**
 * services/input/InputDispatcher.js - Captura centralizada de teclado y atajos globales
 */

export class InputDispatcher {
  constructor(cadService) {
    this._cadService = cadService;

    // Guardar referencias vinculadas para desenganche limpio
    this._onKeyDown = this.handleGlobalKeydown.bind(this);
    this._onKeyUp = this.handleGlobalKeyup.bind(this);
    this._onWindowBlur = this._handleWindowBlur.bind(this);

    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onWindowBlur);
  }

  cleanup() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onWindowBlur);
    if (this.service) {
      this.service.isSnapSuspendedByAlt = false;
    }
    this._cadService = null;
  }

  get service() {
    return this._cadService || window.cadService;
  }

  handleGlobalKeydown(e) {
    const cadUtils = window.cadUtils;
    const consoleManager = cadUtils?.consoleManager || window.consoleManager;
    const toolManager = cadUtils?.toolManager || window.toolManager;
    const activeTool = toolManager?.activeTool;

    const activeElement = document.activeElement;
    const activeTag = activeElement ? activeElement.tagName : '';
    const isConsoleInput = activeElement === document.getElementById('cmdInput') ||
                           activeElement === document.getElementById('cmdInputFloating');

    // 1. Si el usuario está escribiendo en un input del panel lateral, no interferir
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) && !isConsoleInput) {
      if (e.key === 'Escape') {
        activeElement.blur();
      }
      return;
    }

    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    // 2. Teclas de función hardware (F3 Snap, F7 Grid, F8 Ortho, F9 Grid Snap) funcionan siempre
    if (e.key === 'F3') {
      e.preventDefault();
      if (cadUtils?.toggleSnapMaster) cadUtils.toggleSnapMaster();
      else this.service?.toggleSnapMaster();
      return;
    }
    if (e.key === 'F7') {
      e.preventDefault();
      if (cadUtils?.toggleGrid) cadUtils.toggleGrid();
      else this.service?.viewportManager?.toggleGrid();
      return;
    }
    if (e.key === 'F8') {
      e.preventDefault();
      if (cadUtils?.toggleOrtho) {
        cadUtils.toggleOrtho();
      } else {
        this.service?.toggleOrtho();
      }
      return;
    }
    if (e.key === 'F9') {
      e.preventDefault();
      if (cadUtils?.toggleSnapFilter) {
        cadUtils.toggleSnapFilter('grid');
      } else {
        this.service?.toggleSnapFilter('grid');
      }
      if (cadUtils?.refreshActivePreview) {
        cadUtils.refreshActivePreview();
      }
      return;
    }

    // 2b. Alt mantenido: suspende temporalmente OSNAP y Grid Snap (estilo Rhino)
    if (e.key === 'Alt' || e.keyCode === 18) {
      e.preventDefault();
      if (!e.repeat && this.service) {
        this.service.isSnapSuspendedByAlt = true;
        if (cadUtils?.refreshActivePreview) {
          cadUtils.refreshActivePreview();
        }
      }
      return;
    }

    // 3. Seleccionar todo (Ctrl+A / Cmd+A)
    if (isCtrlOrCmd && (e.key.toLowerCase() === 'a' || e.code === 'KeyA')) {
      // Si la consola tiene texto escrito, permitir seleccionar el texto normalmente
      if (isConsoleInput && activeElement.value.length > 0) {
        return;
      }

      // Delegar primero a la herramienta activa (ej. modo edición de nodos en SelectTool)
      if (activeTool && typeof activeTool.onKeyDown === 'function' && activeTool.onKeyDown(e)) {
        return;
      }

      e.preventDefault();

      if (cadUtils?.currentToolMode !== 'select' && typeof cadUtils?.setTool === 'function') {
        cadUtils.setTool('select');
      }

      const service = this.service;
      if (service?.entities) {
        const layerManager = cadUtils?.layerManager;
        const selectableEntities = service.entities.filter((ent) => {
          if (!ent || !ent.visible) return false;
          const layerId = String(ent.data?.layerId || '0');
          const layer = layerManager?.layers?.get(layerId);
          if (layer && (layer.locked || !layer.visible)) return false;
          return true;
        });

        service.editingEntities = [];
        service.deselectAllSegments();
        service.deselectAllHandles();
        service.selectedEntities = [...selectableEntities];

        if (service.selectionManager?._notifySelectionChanged) {
          service.selectionManager._notifySelectionChanged();
        }
        cadUtils?.selectionRenderEngine?.updateEntitiesStroke();
        cadUtils?.selectionRenderEngine?.renderBezierHandles();
        if (window.paper?.view) window.paper.view.update();
      }
      return;
    }

    // 4. Deshacer / Rehacer
    if (isCtrlOrCmd && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (cadUtils?.finishCurrentDrawing) cadUtils.finishCurrentDrawing();
      this.service?.undo();
      cadUtils?.selectionRenderEngine?.updateEntitiesStroke();
      cadUtils?.selectionRenderEngine?.renderBezierHandles();
      return;
    }

    if ((isCtrlOrCmd && e.key.toLowerCase() === 'y') || (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z')) {
      e.preventDefault();
      if (cadUtils?.finishCurrentDrawing) cadUtils.finishCurrentDrawing();
      this.service?.redo();
      cadUtils?.selectionRenderEngine?.updateEntitiesStroke();
      cadUtils?.selectionRenderEngine?.renderBezierHandles();
      return;
    }

    // Si el foco ya está en el input de la consola, ConsoleManager maneja Enter, Espacio, Escape y Delete
    if (isConsoleInput) {
      return;
    }

    // 5. Delegar primero a la herramienta activa si intercepta la tecla
    if (activeTool && typeof activeTool.onKeyDown === 'function') {
      const handled = activeTool.onKeyDown(e);
      if (handled) return;
    }

    // 6. Re-evaluar cursor dinámico al presionar Shift (Ortho)
    if (e.key === 'Shift' || e.keyCode === 16) {
      if (cadUtils?.refreshActivePreview) {
        cadUtils.refreshActivePreview(true);
      }
      return;
    }

    // 7. Borrado de elementos seleccionados
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (cadUtils?.deleteSelectedHandleOrSegment) {
        cadUtils.deleteSelectedHandleOrSegment();
      } else {
        this.service?.deleteSelectedElements();
      }
      return;
    }

    // 8. Escape, Enter y Espacio pasan por la máquina de estados de la consola
    if (e.key === 'Escape') {
      e.preventDefault();
      if (cadUtils?.closeAllMenus) cadUtils.closeAllMenus();
      if (cadUtils) cadUtils.selectedHandle = null;
      if (consoleManager) consoleManager.handleCancel();
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (cadUtils?.currentToolMode === 'trim' && typeof activeTool?.confirmTrimBoundaries === 'function') {
        activeTool.confirmTrimBoundaries();
        return;
      }
      if (consoleManager) {
        const currentText = consoleManager.fixedUI?.input?.value || '';
        if (consoleManager.fixedUI?.input) consoleManager.fixedUI.input.value = '';
        if (consoleManager.floatingUI?.input) consoleManager.floatingUI.input.value = '';
        consoleManager.handleExecute(currentText);
      }
      return;
    }

    // 9. Estilo Rhino 3D: Cualquier tecla imprimible va directo a la consola
    if (!isCtrlOrCmd && !e.altKey && e.key.length === 1) {
      const targetInput = (consoleManager?.floatingUI?.isOpen && consoleManager.floatingUI.input)
        ? consoleManager.floatingUI.input
        : consoleManager?.fixedUI?.input;

      if (targetInput) {
        targetInput.focus();
      }
    }
  }

  handleGlobalKeyup(e) {
    const cadUtils = window.cadUtils;

    if (e.key === 'Alt' || e.keyCode === 18) {
      e.preventDefault();
      if (this.service) {
        this.service.isSnapSuspendedByAlt = false;
      }
      if (cadUtils?.refreshActivePreview) {
        cadUtils.refreshActivePreview();
      }
      return;
    }

    if (e.key === 'Shift' || e.keyCode === 16) {
      if (cadUtils?.refreshActivePreview) {
        cadUtils.refreshActivePreview(false);
      }
    }
  }

  _handleWindowBlur() {
    if (this.service && this.service.isSnapSuspendedByAlt) {
      this.service.isSnapSuspendedByAlt = false;
      const cadUtils = window.cadUtils;
      if (cadUtils && typeof cadUtils.refreshActivePreview === 'function') {
        cadUtils.refreshActivePreview();
      }
    }
  }
}