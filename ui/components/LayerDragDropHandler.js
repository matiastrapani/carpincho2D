/**
 * ui/components/LayerDragDropHandler.js
 * Gestiona la interacción DOM de arrastrar y soltar para reordenar capas en el panel.
 */

export class LayerDragDropHandler {
  constructor({ getListEl, onReorder }) {
    this.getListEl = getListEl;
    this.onReorder = onReorder;
    this.draggedLayerId = null;

    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onDragStart = this._handleDragStart.bind(this);
    this._onDragOver = this._handleDragOver.bind(this);
    this._onDragLeave = this._handleDragLeave.bind(this);
    this._onDrop = this._handleDrop.bind(this);
    this._onDragEnd = this._handleDragEnd.bind(this);
  }

  bind() {
    const list = this.getListEl?.();
    if (!list) return;

    list.addEventListener('mousedown', this._onMouseDown);
    list.addEventListener('dragstart', this._onDragStart);
    list.addEventListener('dragover', this._onDragOver);
    list.addEventListener('dragleave', this._onDragLeave);
    list.addEventListener('drop', this._onDrop);
    list.addEventListener('dragend', this._onDragEnd);
  }

  unbind() {
    this.draggedLayerId = null;
    const list = this.getListEl?.();
    if (!list) return;

    list.removeEventListener('mousedown', this._onMouseDown);
    list.removeEventListener('dragstart', this._onDragStart);
    list.removeEventListener('dragover', this._onDragOver);
    list.removeEventListener('dragleave', this._onDragLeave);
    list.removeEventListener('drop', this._onDrop);
    list.removeEventListener('dragend', this._onDragEnd);
  }

  _handleMouseDown(e) {
    const handle = e.target.closest('[data-role="drag-handle"]');
    if (!handle) return;

    const row = handle.closest('.layer-row');
    if (row) row.setAttribute('draggable', 'true');
  }

  _handleDragStart(e) {
    const row = e.target.closest('.layer-row');
    if (!row) return;

    this.draggedLayerId = row.dataset.layerId;
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('opacity-40');
  }

  _handleDragOver(e) {
    e.preventDefault();
    const row = e.target.closest('.layer-row');
    if (!row || !this.draggedLayerId || String(this.draggedLayerId) === String(row.dataset.layerId)) return;

    e.dataTransfer.dropEffect = 'move';
    const rect = row.getBoundingClientRect();
    const isBottom = (e.clientY - rect.top) > rect.height / 2;

    this._clearDragOverStylesExcept(row);
    if (isBottom) {
      row.classList.remove('border-t-2');
      row.classList.add('border-b-2', 'border-[#52525B]');
    } else {
      row.classList.remove('border-b-2');
      row.classList.add('border-t-2', 'border-[#52525B]');
    }
  }

  _handleDragLeave(e) {
    const row = e.target.closest('.layer-row');
    if (row && !row.contains(e.relatedTarget)) {
      row.classList.remove('border-t-2', 'border-b-2', 'border-[#52525B]');
    }
  }

  _handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const row = e.target.closest('.layer-row');
    if (!row || !this.draggedLayerId || String(this.draggedLayerId) === String(row.dataset.layerId)) return;

    const rect = row.getBoundingClientRect();
    const placeAfter = (e.clientY - rect.top) > rect.height / 2;
    const draggedId = this.draggedLayerId;

    this._clearDragOverStyles();
    this.onReorder?.(draggedId, row.dataset.layerId, placeAfter);
  }

  _handleDragEnd(e) {
    const row = e.target.closest('.layer-row');
    if (row) {
      row.setAttribute('draggable', 'false');
      row.classList.remove('opacity-40');
    }
    this.draggedLayerId = null;
    this._clearDragOverStyles();
  }

  _clearDragOverStylesExcept(targetRow = null) {
    const list = this.getListEl?.();
    list?.querySelectorAll('.border-t-2, .border-b-2').forEach((el) => {
      if (el !== targetRow) {
        el.classList.remove('border-t-2', 'border-b-2', 'border-[#52525B]');
      }
    });
  }

  _clearDragOverStyles() {
    this._clearDragOverStylesExcept(null);
  }
}