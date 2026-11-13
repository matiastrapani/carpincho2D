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
import { PropertyControls } from './components/PropertyControls.js';
import { CAD_THEME } from '../config/cadTheme.js';

export class LayerPanelUI {
  constructor(cadUtils, containerId = 'layerPanelContainer') {
    if (!cadUtils?.service || !cadUtils?.layerManager) {
      throw new Error('LayerPanelUI requiere cadUtils.service y cadUtils.layerManager.');
    }

    this.utils = cadUtils;
    this.service = cadUtils.service;
    this.manager = cadUtils.layerManager;
    this.container = document.getElementById(containerId);
    this.draggedLayerId = null;

    this.colorHandler = new LayerColorHandler({
      cadService: this.service,
      layerManager: this.manager,
      onPreviewChange: () => this._syncVisuals(),
      onCommitChange: () => this.refresh()
    });

    this._onAddLayerClick = this._handleAddLayerClick.bind(this);
    this._onListClick = this._handleListClick.bind(this);
    this._onListChange = this._handleListChange.bind(this);
    this._onListKeyDown = this._handleListKeyDown.bind(this);
    this._onListMouseDown = this._handleListMouseDown.bind(this);
    this._onDragStart = this._handleDragStart.bind(this);
    this._onDragOver = this._handleDragOver.bind(this);
    this._onDragLeave = this._handleDragLeave.bind(this);
    this._onDrop = this._handleDrop.bind(this);
    this._onDragEnd = this._handleDragEnd.bind(this);

    this.init();
  }

  init() {
    if (!this.container) return;
    this.renderShell();
    this.refresh();
  }

  renderShell() {
    this._unbindEvents();

    this.container.innerHTML = `
      <div class="flex flex-col h-full w-full select-none text-zinc-300 font-sans">
        <!-- Encabezado Sobrio -->
        <div class="flex items-center justify-between mb-2 shrink-0">
          <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Capas</span>
          <button type="button" id="btnAddLayerBtn" data-tooltip="Nueva capa" class="tooltip-top-right text-zinc-400 hover:text-zinc-100 transition-colors p-1 rounded hover:bg-[#27272a] text-xs flex items-center justify-center w-5 h-5 cursor-pointer">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>

        <!-- Encabezado de Columnas Compacto con Opacidad Responsiva -->
        <div class="layer-grid-cols grid grid-cols-[8px_12px_14px_minmax(0,1fr)_45px_45px_14px_14px_14px] gap-1 items-center px-1 py-1 text-[10px] font-semibold text-zinc-500 border-b border-[#2a2a32] shrink-0 uppercase tracking-wider">
          <span></span>
          <span data-tooltip="Capa activa" class="tooltip-top flex items-center justify-center">A</span>
          <span data-tooltip="Color de capa" class="tooltip-top flex items-center justify-center">C</span>
          <span class="truncate min-w-0">Nombre</span>
          <span class="layer-col-opacity text-center truncate tooltip-top" data-tooltip="Opacidad">Opac.</span>
          <span class="text-center truncate tooltip-top" data-tooltip="Grosor de línea">Grosor</span>
          <span class="flex items-center justify-center tooltip-top" data-tooltip="Visibilidad"><i class="fa-solid fa-eye text-[9px]"></i></span>
          <span class="flex items-center justify-center tooltip-top-right" data-tooltip="Bloqueo"><i class="fa-solid fa-lock text-[9px]"></i></span>
          <span></span>
        </div>

        <!-- Lista de Capas -->
        <div id="layerListContainer" class="flex-1 custom-scrollbar min-h-0 bg-transparent"></div>
      </div>
    `;

    this._bindEvents();
  }

  refresh() {
    const list = this.container?.querySelector('#layerListContainer');
    if (!list) return;

    document.querySelectorAll('.cad-custom-dropdown').forEach((d) => {
      if (d._triggerEl && !d._triggerEl.isConnected) {
        d.remove();
      }
    });

    const prevScrollTop = list.scrollTop;
    const activeLayer = this.manager.getActiveLayer();
    const activeId = String(activeLayer ? activeLayer.id : this.manager.activeLayerId);
    const canDelete = this.manager.layers.size > 1;

    const fragment = document.createDocumentFragment();
    this.manager.layers.forEach((layer) => {
      fragment.appendChild(this._buildLayerRow(layer, activeId, canDelete));
    });

    list.innerHTML = '';
    list.appendChild(fragment);
    list.scrollTop = prevScrollTop;

    PropertyControls.ensureGlobalListeners();
    this._syncVisuals();
  }

  _formatStrokeWidth(val) {
    const num = Number(val || 0);
    if (isNaN(num) || num <= 0) return '-';
    return num.toFixed(1);
  }

  _parseStrokeWidth(raw) {
    const clean = String(raw ?? '').trim().replace(',', '.');
    if (clean === '' || clean === '-') return 0;
    const parsed = parseFloat(clean);
    if (isNaN(parsed) || parsed < 0) return null;
    return Math.round(parsed * 100) / 100;
  }

  _buildLayerRow(layer, activeId, canDelete) {
    const isActive = String(layer.id) === activeId;
    const displayName = (layer.id === '0' && layer.name === '0') ? 'Capa 0' : layer.name;

    const opacityVal = layer.opacity !== undefined ? Number(layer.opacity) : 1;
    const opacityPct = Math.round(opacityVal * 100);
    const isDefaultOpacity = opacityPct === 100;

    const strokeVal = Number(layer.strokeWidth || 0);
    const strokeDisplay = this._formatStrokeWidth(strokeVal);
    const isPreset = CAD_THEME.properties.strokeWidthPresets.includes(strokeVal);

    const row = document.createElement('div');
    row.setAttribute('draggable', 'false');
    row.dataset.layerId = layer.id;
    row.className = `layer-row layer-grid-cols grid grid-cols-[8px_12px_14px_minmax(0,1fr)_45px_45px_14px_14px_14px] gap-1 items-center px-1 py-1 ${
      isActive ? 'bg-[#17171c] text-zinc-100' : 'hover:bg-[#1e1e24] text-zinc-400'
    }`;

    const actionBtnBase = 'w-3.5 h-3.5 flex items-center justify-center transition-colors';
    const nameTextColor = layer.visible ? 'text-zinc-200' : 'text-zinc-600';
    const opacityTextColor = !layer.visible
      ? 'text-zinc-600'
      : 'text-white';
    const strokeTextColor = !layer.visible
      ? 'text-zinc-600'
      : isPreset
        ? 'text-zinc-300'
        : 'text-white';

    const visBtnStyle = isActive
      ? 'text-zinc-200 cursor-not-allowed'
      : layer.visible
        ? 'text-zinc-200 cursor-pointer'
        : 'text-zinc-600 cursor-pointer';

    const lockBtnStyle = isActive
      ? 'text-zinc-600 cursor-not-allowed'
      : !layer.visible
        ? 'text-zinc-600 cursor-pointer'
        : layer.locked
          ? 'text-white cursor-pointer'
          : 'text-zinc-600 cursor-pointer';
    
    const inputBoxBg = isActive ? 'bg-[#17171c]' : 'bg-transparent';

    row.innerHTML = `
      <!-- 0. Tirador de Arrastre Compacto -->
      <div data-role="drag-handle" class="drag-handle h-full flex items-center justify-center cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-300 text-[9px] tracking-tighter leading-none select-none -translate-y-[1px]">
        ::
      </div>

      <!-- 1. Capa Activa -->
      <div class="flex items-center justify-center">
        <button type="button" data-action="activate" data-tooltip="Establecer como activa" class="tooltip-top ${actionBtnBase} cursor-pointer">
          ${
            isActive
              ? '<span class="w-2 h-2 rounded-full bg-zinc-200"></span>'
              : '<span class="w-1.5 h-1.5 rounded-full bg-zinc-600 hover:bg-zinc-400 transition-colors"></span>'
          }
        </button>
      </div>

      <!-- 2. Color Swatch -->
      <div class="flex items-center justify-center">
        <button type="button" data-action="color" data-tooltip="Cambiar color de capa" class="tooltip-top w-3 h-3 rounded-sm cursor-pointer shrink-0 border-0 outline-none p-0"
             style="background-color: ${layer.color}"></button>
      </div>

      <!-- 3. Nombre Editable -->
      <div class="min-w-0 flex items-center">
        <input type="text" data-field="name" value="${displayName}" aria-label="Nombre de capa"
          class="layer-name-input bg-transparent hover:bg-[#27272a] focus:bg-[#27272a] text-[11px] font-medium outline-none border-0 ring-0 shadow-none ${nameTextColor} truncate w-full px-1 py-0.5 rounded transition-colors">
      </div>

      <!-- 4. Opacidad Scrub / Editable -->
      <div class="layer-col-opacity flex items-center justify-center min-w-0">
        <div data-role="opacity-scrub" data-tooltip="Clic para editar o arrastra" class="tooltip-top flex items-center justify-end w-full ${inputBoxBg} hover:bg-[#27272a] focus-within:bg-[#27272a] rounded px-1.5 py-0.5 cursor-ew-resize transition-colors">
          <input type="number" data-field="opacity" min="0" max="100" value="${opacityPct}" aria-label="Opacidad de capa"
            class="w-full min-w-0 bg-transparent text-right outline-none border-0 ring-0 shadow-none ${opacityTextColor} text-[11px] font-sans tabular-nums p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ew-resize focus:cursor-text">
          <span class="text-[11px] ${opacityTextColor} font-sans tabular-nums ml-0.5 pointer-events-none">%</span>
        </div>
      </div>

      <!-- 5. Combo Editable de Grosor -->
      <div class="flex items-center justify-center min-w-0">
        <div data-role="stroke-combo" class="flex items-center w-full ${inputBoxBg} hover:bg-[#27272a] focus-within:bg-[#27272a] rounded px-1 py-0.5 transition-colors">
          <input type="text" data-field="strokeWidth" value="${strokeDisplay}" aria-label="Grosor de capa"
            class="layer-stroke-input w-full min-w-0 bg-transparent text-right outline-none border-0 ring-0 shadow-none ${strokeTextColor} text-[11px] font-sans tabular-nums p-0 pr-0.5">
          <button type="button" data-action="stroke-dropdown" aria-label="Opciones de grosor"
            class="flex items-center justify-center text-zinc-500 hover:text-zinc-200 cursor-pointer shrink-0 pl-0.5">
            <i class="fa-solid fa-chevron-down text-[8px]"></i>
          </button>
        </div>
      </div>

      <!-- 6. Visibilidad -->
      <div class="flex items-center justify-center">
        <button type="button" data-action="toggle-visibility" data-tooltip="${isActive ? 'La capa activa no se puede ocultar' : layer.visible ? 'Ocultar' : 'Mostrar'}" class="tooltip-top-right ${actionBtnBase} text-[9px] ${visBtnStyle}">
          <i class="fa-solid ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>
        </button>
      </div>

      <!-- 7. Bloqueo -->
      <div class="flex items-center justify-center">
        <button type="button" data-action="toggle-lock" data-tooltip="${isActive ? 'La capa activa no se puede bloquear' : layer.locked ? 'Desbloquear' : 'Bloquear'}" class="tooltip-top-right ${actionBtnBase} text-[9px] ${lockBtnStyle}">
          <i class="fa-solid ${layer.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
        </button>
      </div>

      <!-- 8. Eliminar -->
      <div class="flex items-center justify-center">
        ${
          canDelete
            ? `<button type="button" data-action="delete" data-tooltip="Eliminar capa" class="tooltip-top-right ${actionBtnBase} text-[10px] text-zinc-600 hover:text-zinc-200 cursor-pointer"><i class="fa-solid fa-xmark"></i></button>`
            : `<span data-tooltip="Debe existir al menos una capa" class="tooltip-top-right text-zinc-700 text-[10px] cursor-not-allowed">-</span>`
        }
      </div>
    `;

    this._attachRowOpacityScrub(row, layer);
    return row;
  }

  _attachRowOpacityScrub(row, layer) {
    const scrubContainer = row.querySelector('[data-role="opacity-scrub"]');
    const opacityInput = row.querySelector('[data-field="opacity"]');
    const pctSpan = scrubContainer?.querySelector('span');
    if (!scrubContainer || !opacityInput) return;

    let scrubStartOpacity = layer.opacity !== undefined ? Number(layer.opacity) : 1;

    scrubContainer.addEventListener('pointerdown', () => {
      scrubStartOpacity = layer.opacity !== undefined ? Number(layer.opacity) : 1;
    });

    PropertyControls.attachScrubInput(
      scrubContainer,
      opacityInput,
      (pctVal) => {
        const clampedPct = Math.max(0, Math.min(100, Math.round(pctVal)));
        const nextOpacity = clampedPct / 100;

        if (Math.abs(scrubStartOpacity - nextOpacity) > 0.001) {
          this.service.executeCommand(
            new UpdateLayerPropertyCommand(this.manager, layer.id, 'opacity', scrubStartOpacity, nextOpacity, this)
          );
        } else {
          opacityInput.value = Math.round(scrubStartOpacity * 100);
        }
      },
      {
        min: 0,
        max: 100,
        step: 1,
        precision: 0,
        onLiveChange: (pctVal) => {
          const nextOpacity = Math.max(0, Math.min(100, pctVal)) / 100;
          this.manager.previewLayerVisuals(layer.id, { opacity: nextOpacity });
          this._syncVisuals();
        }
      }
    );
  }

  _openStrokeDropdown(layer, comboEl, triggerBtn) {
    const existing = comboEl._strokeDropdown;
    const isAlreadyOpen = existing && !existing.classList.contains('hidden');

    PropertyControls._onDropdownClose();
    if (isAlreadyOpen) return;

    let dropdown = existing;
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'cad-custom-dropdown hidden bg-[#17171c] rounded-b shadow-2xl max-h-48 overflow-y-auto py-1 border border-[#27272a] border-t-0';
      dropdown._triggerEl = triggerBtn;
      comboEl._strokeDropdown = dropdown;
      document.body.appendChild(dropdown);
    }

    const currentVal = Number(layer.strokeWidth || 0);
    dropdown.innerHTML = '';

    CAD_THEME.properties.strokeWidthPresets.forEach((preset) => {
      const label = preset === 0 ? '-' : preset.toFixed(1);
      const active = Math.abs(currentVal - preset) < 0.001;

      const item = document.createElement('div');
      item.className = `px-2 py-1 text-[11px] text-right font-sans tabular-nums cursor-pointer ${
        active ? 'font-bold text-white bg-[#27272a]' : 'font-normal text-zinc-400 hover:text-white hover:bg-[#222226]'
      }`;
      item.textContent = label;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.add('hidden');
        this._commitStrokeWidth(layer.id, preset);
      });

      dropdown.appendChild(item);
    });

    const updatePosition = () => {
      const rect = comboEl.getBoundingClientRect();
      dropdown.style.position = 'fixed';
      dropdown.style.top = `${rect.bottom}px`;
      dropdown.style.left = `${rect.left}px`;
      dropdown.style.width = `${rect.width}px`;;
      dropdown.style.zIndex = '99999';
    };

    updatePosition();
    dropdown._updatePos = updatePosition;
    dropdown.classList.remove('hidden');
  }

  _commitStrokeWidth(layerId, newVal) {
    const layer = this.manager.layers.get(String(layerId));
    if (!layer) return;

    const oldVal = Number(layer.strokeWidth || 0);
    if (Math.abs(oldVal - newVal) > 0.0001) {
      this.service.executeCommand(
        new UpdateLayerPropertyCommand(this.manager, layerId, 'strokeWidth', oldVal, newVal, this)
      );
    } else {
      const input = this.container?.querySelector(`.layer-row[data-layer-id="${layerId}"] [data-field="strokeWidth"]`);
      if (input) input.value = this._formatStrokeWidth(oldVal);
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
          this.service.executeCommand(new SetActiveLayerCommand(this.manager, this.manager.activeLayerId, layerId, this));
        }
        break;

      case 'color':
        this.colorHandler.open(layer, actionBtn, this);
        break;

      case 'stroke-dropdown': {
        const comboEl = actionBtn.closest('[data-role="stroke-combo"]');
        if (comboEl) this._openStrokeDropdown(layer, comboEl, actionBtn);
        break;
      }

      case 'toggle-visibility':
        if (!isActive) {
          this.service.executeCommand(new UpdateLayerPropertyCommand(this.manager, layerId, 'visible', layer.visible, !layer.visible, this));
        }
        break;

      case 'toggle-lock':
        if (!isActive) {
          this.service.executeCommand(new UpdateLayerPropertyCommand(this.manager, layerId, 'locked', layer.locked, !layer.locked, this));
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
        this.service.executeCommand(new RenameLayerCommand(this.manager, layerId, layer.name, uniqueName, this));
      } else {
        fieldEl.value = layer.name;
      }
    } else if (fieldEl.dataset.field === 'strokeWidth') {
      const parsed = this._parseStrokeWidth(fieldEl.value);
      if (parsed === null) {
        fieldEl.value = this._formatStrokeWidth(layer.strokeWidth);
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
      if (layer) {
        if (input.dataset.field === 'name') {
          input.value = layer.name;
        } else if (input.dataset.field === 'strokeWidth') {
          input.value = this._formatStrokeWidth(layer.strokeWidth);
        } else if (input.dataset.field === 'opacity') {
          input.value = Math.round((layer.opacity !== undefined ? Number(layer.opacity) : 1) * 100);
        }
      }
      input.blur();
    }
  }

  _handleListMouseDown(e) {
    const handle = e.target.closest('[data-role="drag-handle"]');
    if (handle) {
      const row = handle.closest('.layer-row');
      if (row) row.setAttribute('draggable', 'true');
      return;
    }

    const input = e.target.closest('[data-field="name"], [data-field="strokeWidth"]');
    if (input) {
      e.stopPropagation();
      if (document.activeElement !== input) {
        setTimeout(() => input.select(), 0);
      }
    }
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
    this._clearDragOverStyles();
    this._reorderLayers(this.draggedLayerId, row.dataset.layerId, placeAfter);
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
    const list = this.container?.querySelector('#layerListContainer');
    list?.querySelectorAll('.border-t-2, .border-b-2').forEach((el) => {
      if (el !== targetRow) {
        el.classList.remove('border-t-2', 'border-b-2', 'border-[#52525B]');
      }
    });
  }

  _clearDragOverStyles() {
    this._clearDragOverStylesExcept(null);
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
    this.service.executeCommand(new ReorderLayersCommand(this.manager, oldOrderEntries, nextOrder, this));
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
      this.service.executeCommand(new DeleteLayerCommand(this.manager, layer.id, targetLayerId, this.service, this));
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
    this.service.executeCommand(new CreateLayerCommand(this.manager, layerData, this));
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

  _syncVisuals() {
    this.utils.selectionRenderEngine?.updateEntitiesStroke();
    if (this.utils.paper?.view) {
      this.utils.paper.view.update();
    }
  }

  _bindEvents() {
    const btnAdd = this.container?.querySelector('#btnAddLayerBtn');
    const list = this.container?.querySelector('#layerListContainer');
    btnAdd?.addEventListener('click', this._onAddLayerClick);
    if (!list) return;

    list.addEventListener('click', this._onListClick);
    list.addEventListener('change', this._onListChange);
    list.addEventListener('keydown', this._onListKeyDown);
    list.addEventListener('mousedown', this._onListMouseDown);
    list.addEventListener('dragstart', this._onDragStart);
    list.addEventListener('dragover', this._onDragOver);
    list.addEventListener('dragleave', this._onDragLeave);
    list.addEventListener('drop', this._onDrop);
    list.addEventListener('dragend', this._onDragEnd);
  }

  _unbindEvents() {
    const btnAdd = this.container?.querySelector('#btnAddLayerBtn');
    const list = this.container?.querySelector('#layerListContainer');
    btnAdd?.removeEventListener('click', this._onAddLayerClick);
    if (!list) return;

    list.removeEventListener('click', this._onListClick);
    list.removeEventListener('change', this._onListChange);
    list.removeEventListener('keydown', this._onListKeyDown);
    list.removeEventListener('mousedown', this._onListMouseDown);
    list.removeEventListener('dragstart', this._onDragStart);
    list.removeEventListener('dragover', this._onDragOver);
    list.removeEventListener('dragleave', this._onDragLeave);
    list.removeEventListener('drop', this._onDrop);
    list.removeEventListener('dragend', this._onDragEnd);
  }

  cleanup() {
    this.colorHandler.close();
    this._unbindEvents();
  }

  destroy() {
    this.cleanup();
    if (this.container) this.container.innerHTML = '';
  }
}