/**
 * services/input/InputDispatcher.js - Captura centralizada de teclado y atajos globales
 */

export class InputDispatcher {
  constructor(cadService) {
    this._cadService = cadService;
  }

  get service() {
    return this._cadService || window.cadService;
  }

  handleGlobalKeydown(e) {
    const cadUtils = window.cadUtils;
    const toolManager = cadUtils?.toolManager || window.toolManager;
    const activeTool = toolManager?.activeTool;

    // 1. Filtrado de foco en inputs DOM
    const activeElement = document.activeElement;
    const activeTag = activeElement ? activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) || activeElement === document.getElementById('cmdInput')) {
      if (e.key === 'Escape') {
        activeElement.blur();
      }
      return;
    }

    // 2. Delegar primero a la herramienta activa si intercepta la tecla
    if (activeTool && typeof activeTool.onKeyDown === 'function') {
      const handled = activeTool.onKeyDown(e);
      if (handled) return;
    }

    // 3. Re-evaluar cursor dinámico al presionar Shift (Ortho)
    if (e.key === 'Shift' && cadUtils?.lastMousePoint && cadUtils?.activePath && activeTool) {
      const mockEvent = {
        point: cadUtils.lastMousePoint.clone(),
        event: e
      };
      activeTool.onMouseMove(mockEvent);
    }

    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    // 4. Deshacer / Rehacer
    if (isCtrlOrCmd && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (cadUtils?.finishCurrentDrawing) cadUtils.finishCurrentDrawing();
      this.service?.undo();
      if (cadUtils?.updateEntitiesStroke) cadUtils.updateEntitiesStroke();
      if (cadUtils?.renderBezierHandles) cadUtils.renderBezierHandles();
      return;
    }

    if ((isCtrlOrCmd && e.key.toLowerCase() === 'y') || (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z')) {
      e.preventDefault();
      if (cadUtils?.finishCurrentDrawing) cadUtils.finishCurrentDrawing();
      this.service?.redo();
      if (cadUtils?.updateEntitiesStroke) cadUtils.updateEntitiesStroke();
      if (cadUtils?.renderBezierHandles) cadUtils.renderBezierHandles();
      return;
    }

    // 5. Teclas de función y atajos directos
    if (e.key === 'F3') {
      e.preventDefault();
      this.service?.toggleSnapMaster();
    } else if (e.key === 'F7') {
      e.preventDefault();
      if (cadUtils?.toggleGrid) cadUtils.toggleGrid();
    } else if (e.key === 'Escape') {
      e.preventDefault();

      if (cadUtils?.closeAllMenus) cadUtils.closeAllMenus();
      if (cadUtils) cadUtils.selectedHandle = null;

      if (cadUtils?.activePath) {
        cadUtils.activePath.remove();
        cadUtils.activePath = null;
        if (cadUtils.finishCurrentDrawing) cadUtils.finishCurrentDrawing();
        if (cadUtils.setTool) cadUtils.setTool('select');
      } else if (cadUtils?.currentToolMode === 'trim') {
        this.service.trimCuttingBoundaries = [];
        this.service.isTrimCuttingPhase = false;
        this.service.deselectAllEditingEntities();
        if (cadUtils.setTool) cadUtils.setTool('select');
      } else {
        const selectedEntities = this.service?.selectedEntities || [];
        const selectedSegments = this.service?.selectedSegments || [];
        const editingEntities = this.service?.editingEntities || [];

        if (selectedEntities.length > 0 || selectedSegments.length > 0) {
          this.service.deselectAllEntities();
        } else if (editingEntities.length > 0) {
          this.service.deselectAllEditingEntities();
        }
        if (cadUtils?.setTool) cadUtils.setTool('select');
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (cadUtils?.deleteSelectedHandleOrSegment) {
        cadUtils.deleteSelectedHandleOrSegment();
      } else {
        this.service?.deleteSelectedElements();
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (cadUtils?.currentToolMode === 'trim') {
        if (activeTool && typeof activeTool.confirmTrimBoundaries === 'function') {
          activeTool.confirmTrimBoundaries();
          return;
        }
      }
      if (cadUtils?.finishCurrentDrawing) cadUtils.finishCurrentDrawing();
    } else if (cadUtils?.setTool) {
      const key = e.key.toLowerCase();
      if (key === 'l') cadUtils.setTool('line');
      else if (key === 'p') cadUtils.setTool('polyline');
      else if (key === 's') cadUtils.setTool('spline');
      else if (key === 'b') cadUtils.setTool('bezier');
      else if (key === 't') cadUtils.setTool('trim');
      else if (key === 'e' && !isCtrlOrCmd) cadUtils.setTool('extend');
    }
  }

  handleGlobalKeyup(e) {
    const cadUtils = window.cadUtils;
    const toolManager = cadUtils?.toolManager || window.toolManager;
    const activeTool = toolManager?.activeTool;

    if ((e.key === 'Shift' || e.keyCode === 16) && cadUtils?.lastMousePoint && activeTool) {
      const mockEvent = {
        point: cadUtils.lastMousePoint.clone(),
        event: { shiftKey: true }
      };
      if (typeof activeTool.onMouseMove === 'function') {
        activeTool.onMouseMove(mockEvent);
      }
    }
  }
}