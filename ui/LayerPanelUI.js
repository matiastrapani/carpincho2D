/**
 * LayerPanelUI.js - Panel de control e interacción de capas sobrio, adaptativo y reordenable.
 */

import {
  CreateLayerCommand,
  SetActiveLayerCommand,
  DeleteLayerCommand,
  UpdateLayerPropertyCommand,
  RenameLayerCommand,
  ReorderLayersCommand
} from '../services/commands/LayerCommands.js';
import { LayerDeleteModal } from './components/LayerDeleteModal.js';
import { LayerColorHandler } from './components/LayerColorHandler.js';
import { LayerRowBuilder } from './components/LayerRowBuilder.js';
import { LayerDragDropHandler } from './components/LayerDragDropHandler.js';
import { PropertyControls } from './components/PropertyControls.js';

export class LayerPanelUI {
  constructor(cadUtils, containerId = 'layerPanelContainer') {
    if (!cadUtils?.service || !cadUtils?.layerManager) {
      throw new Error('LayerPanelUI requiere cadUtils.service y cadUtils.layerManager.');
    }

    this.utils = cadUtils;
    this.service = cadUtils.service;
    this.manager = cadUtils.layerManager;
    this.container = document.getElementById(containerId);
    this._isPreviewing = false;
    this._unsubscribeManager = null;

    this.colorHandler = new LayerColorHandler({
      cadService: this.service,
      layerManager: this.manager,
      onCommitChange: () => this.refresh()
    });

    this.rowBuilder = new LayerRowBuilder({
      onPreviewStart: () => { this._isPreviewing = true; },
      onPreviewEnd: () => { this._isPreviewing = false; },
      onPreviewOpacity: (layerId, nextOpacity) => this.manager.previewLayerVisuals(layerId, { opacity: nextOpacity }),
      onCommitOpacity: (layerId, prevOpacity, nextOpacity) => {
        this.service.executeCommand(
          new UpdateLayerPropertyCommand(this.manager, layerId, 'opacity', prevOpacity, nextOpacity)
        );
      },
      onCommitStrokeWidth: (layerId, nextStrokeWidth) => this._commitStrokeWidth(layerId, nextStrokeWidth),
      onFallbackRefresh: () => this.refresh()
    });

    this.dragDropHandler = new LayerDragDropHandler({
      getListEl: () => this.container?.querySelector('#layerListContainer'),
      onReorder: (draggedId, targetId, placeAfter) => this._reorderLayers(draggedId, targetId, placeAfter)
    });

    this._onAddLayerClick = this._handleAddLayerClick.bind(this);
    this._onListClick = this._handleListClick.bind(this);
    this._onListChange = this._handleListChange.bind(this);
    this._onListKeyDown = this._handleListKeyDown.bind(this);
    this._onListMouseDown = this._handleListMouseDown.bind(this);

    this.init();
  }

  init() {
    if (!this.container) return;
    this.renderShell();
    this.refresh();

    this._unsubscribeManager?.();
    this._unsubscribeManager = this.manager.subscribe(() => {
      if (!this._isPreviewing && !this.colorHandler.activePopover) {
        this.refresh();
      }
    });
  }

  renderShell() {
    this._unbindEvents();
    this.container.innerHTML = this.rowBuilder.buildShellHTML();
    this._bindEvents();
  }

  refresh() {
    const list = this.container?.querySelector('#layerListContainer');
    if (!list) return;

    this.rowBuilder.pruneOrphanDropdowns();

    const prevScrollTop = list.scrollTop;
    const activeLayer = this.manager.getActiveLayer();
    const activeId = String(activeLayer ? activeLayer.id : this.manager.activeLayerId);
    const canDelete = this.manager.layers.size > 1;

    const fragment = document.createDocumentFragment();
    this.manager.layers.forEach((layer) => {
      fragment.appendChild(this.rowBuilder.buildRow(layer, activeId, canDelete));
    });

    list.innerHTML = '';
    list.appendChild(fragment);
    list.scrollTop = prevScrollTop;

    PropertyControls.ensureGlobalListeners();
  }

  _commitStrokeWidth(layerId, newVal) {
    const layer = this.manager.layers.get(String(layerId));
    if (!layer) return;

    const oldVal = Number(layer.strokeWidth || 0);
    if (Math.abs(oldVal - newVal) > 0.0001) {
      this.service.executeCommand(
        new UpdateLayerPropertyCommand(this.manager, layerId, 'strokeWidth', oldVal, newVal)
      );
    } else {
      const input = this.container?.querySelector(`.layer-row[data-layer-id="${layerId}"] [data-field="strokeWidth"]`);
      if (input) input.value = this.rowBuilder.formatStrokeWidth(oldVal);
    }
  }

  _handleListClick(e) {
    const actionBtn = e.target.closest('[data-action]');
    const row = e.target.closest('.layer-row');
    if (!actionBtn || !row) return;

    e.stopPropagation();
    const layerId = row.dataset.layerId;
    const layer = this.manager.layers.get(String(layerId));
    if (!layer) return;

    const isActive = String(this.manager.activeLayerId) === String(layerId);

    switch (actionBtn.dataset.action) {
      case 'activate':
        if (!isActive) {
          this.service.executeCommand(new SetActiveLayerCommand(this.manager, this.manager.activeLayerId, layerId));
        }
        break;

      case 'color':
        this.colorHandler.open(layer, actionBtn);
        break;

      case 'stroke-dropdown': {
        const comboEl = actionBtn.closest('[data-role="stroke-combo"]');
        if (comboEl) this.rowBuilder.openStrokeDropdown(layer, comboEl, actionBtn);
        break;
      }

      case 'toggle-visibility':
        if (!isActive) {
          this.service.executeCommand(new UpdateLayerPropertyCommand(this.manager, layerId, 'visible', layer.visible, !layer.visible));
        }
        break;

      case 'toggle-lock':
        if (!isActive) {
          this.service.executeCommand(new UpdateLayerPropertyCommand(this.manager, layerId, 'locked', layer.locked, !layer.locked));
        }
        break;

      case 'delete':
        this._requestDeleteLayer(layer, isActive);
        break;
    }
  }
  
  _handleListChange(e) {
    const fieldEl = e.target.closest('[data-field]');
    const row = e.target.closest('.layer-row');
    if (!fieldEl || !row) return;

    const layerId = row.dataset.layerId;
    const layer = this.manager.layers.get(String(layerId));
    if (!layer) return;

    if (fieldEl.dataset.field === 'name') {
      const uniqueName = this._generateUniqueName(fieldEl.value, layerId);
      if (uniqueName !== layer.name) {
        this.service.executeCommand(new RenameLayerCommand(this.manager, layerId, layer.name, uniqueName));
      } else {
        fieldEl.value = layer.name;
      }
    } else if (fieldEl.dataset.field === 'strokeWidth') {
      const parsed = this.rowBuilder.parseStrokeWidth(fieldEl.value);
      if (parsed === null) {
        fieldEl.value = this.rowBuilder.formatStrokeWidth(layer.strokeWidth);
        return;
      }
      this._commitStrokeWidth(layerId, parsed);
    }
  }
  
  _handleListKeyDown(e) {
    const input = e.target.closest('[data-field="name"], [data-field="strokeWidth"], [data-field="opacity"]');
    if (!input) return;

    e.stopPropagation();
    if (e.key === 'Enter') {
      input.blur();
    } else if (e.key === 'Escape') {
      const row = input.closest('.layer-row');
      const layer = row ? this.manager.layers.get(String(row.dataset.layerId)) : null;
      this.rowBuilder.resetInputValue(input, layer);
      input.blur();
    }
  }

  _handleListMouseDown(e) {
    const input = e.target.closest('[data-field="name"], [data-field="strokeWidth"]');
    if (input) {
      e.stopPropagation();
      if (document.activeElement !== input) {
        setTimeout(() => input.select(), 0);
      }
    }
  }

  _reorderLayers(draggedId, targetId, placeAfter = false) {
    const oldOrderEntries = Array.from(this.manager.layers.entries());
    const nextOrder = [...oldOrderEntries];
    const fromIdx = nextOrder.findIndex(([id]) => String(id) === String(draggedId));
    if (fromIdx === -1) return;

    const [moved] = nextOrder.splice(fromIdx, 1);
    let toIdx = nextOrder.findIndex(([id]) => String(id) === String(targetId));
    if (toIdx === -1) return;
    if (placeAfter) toIdx += 1;

    nextOrder.splice(toIdx, 0, moved);
    this.colorHandler.close();
    this.service.executeCommand(new ReorderLayersCommand(this.manager, oldOrderEntries, nextOrder));
  }

  _requestDeleteLayer(layer, isActive) {
    if (this.manager.layers.size <= 1) return;

    const availableLayers = Array.from(this.manager.layers.values())
      .filter((l) => String(l.id) !== String(layer.id));
    const activeLayer = this.manager.getActiveLayer();
    const defaultTarget = (!isActive && activeLayer) ? activeLayer : availableLayers[0];

    const hasContent = this.service.entities.some(
      (ent) => ent.data && String(ent.data.layerId) === String(layer.id)
    );

    const executeDelete = (targetLayerId) => {
      this.service.executeCommand(new DeleteLayerCommand(this.manager, layer.id, targetLayerId, this.service));
    };

    if (hasContent) {
      LayerDeleteModal.open({
        layer,
        availableLayers,
        defaultTargetId: defaultTarget?.id,
        onConfirm: executeDelete
      });
    } else {
      executeDelete(defaultTarget?.id || null);
    }
  }

  _handleAddLayerClick() {
    const defaultName = this._generateUniqueName(`Capa ${this.manager.layers.size}`, null);
    const layerData = {
      name: defaultName,
      color: this.colorHandler.generateDistinctColor(),
      strokeWidth: 0
    };
    this.service.executeCommand(new CreateLayerCommand(this.manager, layerData));
  }

  _generateUniqueName(desiredName, layerId) {
    const layers = this.manager.layers;
    const isTaken = (name) => {
      for (const [id, l] of layers.entries()) {
        if (String(id) !== String(layerId) && l.name.trim().toLowerCase() === name.trim().toLowerCase()) {
          return true;
        }
      }
      return false;
    };

    const cleanName = desiredName.trim() || `Capa ${layers.size}`;
    if (!isTaken(cleanName)) return cleanName;

    const match = cleanName.match(/^(.*?)(?:\s+(\d+))?$/);
    const base = match?.[2] !== undefined ? match[1] : cleanName;
    let num = match?.[2] !== undefined ? parseInt(match[2], 10) + 1 : 1;

    let candidate = `${base} ${num}`;
    while (isTaken(candidate)) {
      num++;
      candidate = `${base} ${num}`;
    }
    return candidate;
  }

  _setEvents(bind) {
    const method = bind ? 'addEventListener' : 'removeEventListener';
    const btnAdd = this.container?.querySelector('#btnAddLayerBtn');
    const list = this.container?.querySelector('#layerListContainer');

    btnAdd?.[method]('click', this._onAddLayerClick);
    if (!list) return;

    list[method]('click', this._onListClick);
    list[method]('change', this._onListChange);
    list[method]('keydown', this._onListKeyDown);
    list[method]('mousedown', this._onListMouseDown);
    bind ? this.dragDropHandler.bind() : this.dragDropHandler.unbind();
  }

  _bindEvents() {
    this._setEvents(true);
  }

  _unbindEvents() {
    this._setEvents(false);
  }

  cleanup() {
    if (this._unsubscribeManager) {
      this._unsubscribeManager();
      this._unsubscribeManager = null;
    }
    this.rowBuilder.cleanup();
    this.colorHandler.close();
    this._unbindEvents();
  }

  destroy() {
    this.cleanup();
    if (this.container) this.container.innerHTML = '';
  }
}