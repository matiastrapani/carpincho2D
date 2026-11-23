/**
 * tools/select/SelectKeyHandler.js - Gestión de teclado, menú contextual y cancelación en SelectTool
 */

export class SelectKeyHandler {
  constructor(tool) {
    this.tool = tool;
    this.service = tool.service;
    this.utils = tool.utils;
  }

  onContextMenu() {
    const { selectionMenuHandler } = this.tool;
    if (selectionMenuHandler.isOpen()) {
      selectionMenuHandler.close();
      return true;
    }

    if (this.service.hoveredEntity) {
      this.utils.clearHoverHighlight();
    }

    return false;
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    const targetTag = event.target?.tagName;
    const isConsoleInput = event.target?.id === 'cmdInput' || event.target?.id === 'cmdInputFloating';
    const isOtherInputFocused = !isConsoleInput && (
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag) || event.target?.isContentEditable
    );

    if (!isOtherInputFocused && (event.ctrlKey || event.metaKey) && (key.toLowerCase() === 'a' || event.code === 'KeyA')) {
      if (isConsoleInput && event.target.value.length > 0) return false;
      return this.tool.segmentEditHandler.selectAllSegments(event);
    }

    if (key === 'Escape') {
      const { selectionMenuHandler } = this.tool;
      if (selectionMenuHandler.hasScheduledOpen() || selectionMenuHandler.isOpen()) {
        selectionMenuHandler.close();
        return true;
      }

      if (this.cancelActiveDrag()) return true;

      const hasSelection =
        this.service.selectedEntities?.length > 0 ||
        this.service.selectedSegments?.length > 0 ||
        this.service.selectedHandles?.length > 0;

      if (hasSelection) {
        this.service.deselectAllEntities();
        this.service.deselectAllSegments();
        this.service.deselectAllHandles();
        this.tool.cleanBox();
        return true;
      }

      if (this.service.editingEntities?.length > 0) {
        this.service.selectionManager.exitEditMode();
        this.utils.setPrompt('Herramienta Selección: selecciona objetos o haz doble clic en un trazo para editar sus nodos.');
        return true;
      }
    }

    return false;
  }

  cancelActiveDrag() {
    let cancelled = false;
    const {
      activeModule,
      segmentEditHandler,
      dragHandler,
      boxSelectHandler,
      selectionMenuHandler
    } = this.tool;

    selectionMenuHandler.clearPendingMenu();

    if (activeModule) {
      if (typeof activeModule.cancelDrag === 'function') {
        activeModule.cancelDrag();
      } else {
        activeModule.reset();
      }
      this.tool.activeModule = null;
      cancelled = true;
    } else if (segmentEditHandler.isDragging() || segmentEditHandler.session?.mouseStartPt) {
      segmentEditHandler.cancelDrag();
      cancelled = true;
    } else if (dragHandler.cancelDrag() || boxSelectHandler.selectionStartPoint) {
      this.tool.cleanBox();
      cancelled = true;
    }

    if (cancelled) {
      this.utils.hud.clear();
      this.tool._refreshView();
    }

    return cancelled;
  }

  cancel() {
    this.cancelActiveDrag();
    this.tool.cleanBox();
    this.utils.hud.clear();
    this.service.deselectAllEditingEntities();
    const paperInst = this.utils.paper || (typeof paper !== 'undefined' ? paper : null);
    if (paperInst?.view) paperInst.view.update();
  }
}