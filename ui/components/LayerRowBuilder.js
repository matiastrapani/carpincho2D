/**
 * ui/components/LayerRowBuilder.js
 * Construye filas de capa, formateo/validación de grosores, scrub de opacidad y selector desplegable.
 */

import { PropertyControls } from './PropertyControls.js';
import { CAD_THEME } from '../../config/cadTheme.js';

export class LayerRowBuilder {
  constructor({
    onPreviewStart,
    onPreviewEnd,
    onPreviewOpacity,
    onCommitOpacity,
    onCommitStrokeWidth,
    onFallbackRefresh
  }) {
    this.onPreviewStart = onPreviewStart;
    this.onPreviewEnd = onPreviewEnd;
    this.onPreviewOpacity = onPreviewOpacity;
    this.onCommitOpacity = onCommitOpacity;
    this.onCommitStrokeWidth = onCommitStrokeWidth;
    this.onFallbackRefresh = onFallbackRefresh;
    this._dropdowns = new Set();
  }

  buildShellHTML() {
    return `
      <div class="flex flex-col h-full w-full select-none text-zinc-300 font-sans">
        <!-- Encabezado Sobrio -->
        <div class="flex items-center justify-between mb-2 shrink-0">
          <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Capas</span>
          <button type="button" id="btnAddLayerBtn" data-tooltip="Nueva capa" class="tooltip-top-right text-zinc-400 hover:text-zinc-100 transition-colors p-0 rounded hover:bg-[#27272a] text-xs flex items-center justify-center w-5 h-5 cursor-pointer">
            <span class="iconify text-[13px] shrink-0 justify-center" data-icon="lucide:plus"></span> 
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
          <span class="flex items-center justify-center tooltip-top-right" data-tooltip="Visibilidad">
            <span class="iconify text-xs icon-crisp shrink-0 justify-center" data-icon="lucide:eye"></span> 
          </span>
          <span class="flex items-center justify-center tooltip-top-right" data-tooltip="Bloqueo">
            <span class="iconify text-[10px] icon-crisp shrink-0 justify-center" data-icon="lucide:lock"></span> 
          </span>
          <span></span>
        </div>

        <!-- Lista de Capas -->
        <div id="layerListContainer" class="flex-1 custom-scrollbar min-h-0 bg-transparent"></div>
      </div>
    `;
  }

  resetInputValue(input, layer) {
    if (!input || !layer) return;

    if (input.dataset.field === 'name') {
      input.value = layer.name;
    } else if (input.dataset.field === 'strokeWidth') {
      input.value = this.formatStrokeWidth(layer.strokeWidth);
    } else if (input.dataset.field === 'opacity') {
      const opacity = layer.opacity !== undefined ? Number(layer.opacity) : 1;
      input.value = Math.round(opacity * 100);
    }
  }

  formatStrokeWidth(val) {
    const num = Number(val || 0);
    if (isNaN(num) || num <= 0) return '-';
    return num.toFixed(1);
  }

  parseStrokeWidth(raw) {
    const clean = String(raw ?? '').trim().replace(',', '.');
    if (clean === '' || clean === '-') return 0;
    const parsed = parseFloat(clean);
    if (isNaN(parsed) || parsed < 0) return null;
    return Math.round(parsed * 100) / 100;
  }

  buildRow(layer, activeId, canDelete) {
    const isActive = String(layer.id) === activeId;
    const displayName = (layer.id === '0' && layer.name === '0') ? 'Capa 0' : layer.name;

    const opacityVal = layer.opacity !== undefined ? Number(layer.opacity) : 1;
    const opacityPct = Math.round(opacityVal * 100);

    const strokeVal = Number(layer.strokeWidth || 0);
    const strokeDisplay = this.formatStrokeWidth(strokeVal);
    const isPreset = CAD_THEME.properties.strokeWidthPresets.includes(strokeVal);

    const row = document.createElement('div');
    row.setAttribute('draggable', 'false');
    row.dataset.layerId = layer.id;
    row.className = `layer-row layer-grid-cols grid grid-cols-[8px_12px_14px_minmax(0,1fr)_45px_45px_14px_14px_14px] gap-1 items-center px-1 py-1 ${
      isActive ? 'bg-[#17171c] text-zinc-100' : 'hover:bg-[#1e1e24] text-zinc-400'
    }`;

    const actionBtnBase = 'w-3.5 h-3.5 flex items-center justify-center transition-colors';
    const nameTextColor = layer.visible ? 'text-zinc-200' : 'text-zinc-600';
    const opacityTextColor = !layer.visible ? 'text-zinc-600' : 'text-white';
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
      <div data-role="drag-handle" class="drag-handle h-full flex items-center justify-center cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-300 text-[9px] tracking-wider font-bold leading-none select-none -translate-y-[1px]">
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
            <span class="iconify text-xs icon-crisp shrink-0" data-icon="lucide:chevron-down"></span> 
          </button>
        </div>
      </div>

      <!-- 6. Visibilidad -->
      <div class="flex items-center justify-center">
        <button type="button" data-action="toggle-visibility" data-tooltip="${isActive ? 'La capa activa no se puede ocultar' : layer.visible ? 'Ocultar' : 'Mostrar'}" class="tooltip-top-right ${actionBtnBase} text-[9px] ${visBtnStyle}">
          <span class="iconify text-xs icon-crisp shrink-0" data-icon="${layer.visible ? 'lucide:eye' : 'lucide:eye-closed'}"></span> 
        </button>
      </div>

      <!-- 7. Bloqueo -->
      <div class="flex items-center justify-center">
        <button type="button" data-action="toggle-lock" data-tooltip="${isActive ? 'La capa activa no se puede bloquear' : layer.locked ? 'Desbloquear' : 'Bloquear'}" class="tooltip-top-right ${actionBtnBase} text-[9px] ${lockBtnStyle}">
          <span class="iconify text-[10px] icon-crisp shrink-0" data-icon="${layer.locked ? 'lucide:lock' : 'lucide:lock-open'}"></span> 
        </button>
      </div>

      <!-- 8. Eliminar -->
      <div class="flex items-center justify-center">
        ${
          canDelete
            ? `<button type="button" data-action="delete" data-tooltip="Eliminar capa" class="tooltip-top-right ${actionBtnBase} text-[10px] text-zinc-600 hover:text-zinc-200 cursor-pointer">
            <span class="iconify text-xs shrink-0" data-icon="lucide:x"></span>
            </button>`
            : `<span data-tooltip="Debe existir al menos una capa" class="tooltip-top-right text-zinc-700 text-[10px] cursor-not-allowed">-</span>`
        }
      </div>
    `;

    this._attachOpacityScrub(row, layer);
    return row;
  }

  _attachOpacityScrub(row, layer) {
    const scrubContainer = row.querySelector('[data-role="opacity-scrub"]');
    const opacityInput = row.querySelector('[data-field="opacity"]');
    if (!scrubContainer || !opacityInput) return;

    let scrubStartOpacity = layer.opacity !== undefined ? Number(layer.opacity) : 1;

    scrubContainer.addEventListener('pointerdown', () => {
      scrubStartOpacity = layer.opacity !== undefined ? Number(layer.opacity) : 1;
      this.onPreviewStart?.();
    });

    PropertyControls.attachScrubInput(
      scrubContainer,
      opacityInput,
      (pctVal) => {
        this.onPreviewEnd?.();
        const clampedPct = Math.max(0, Math.min(100, Math.round(pctVal)));
        const nextOpacity = clampedPct / 100;

        if (Math.abs(scrubStartOpacity - nextOpacity) > 0.001) {
          this.onCommitOpacity?.(layer.id, scrubStartOpacity, nextOpacity);
        } else {
          this.onFallbackRefresh?.();
        }
      },
      {
        min: 0,
        max: 100,
        step: 1,
        precision: 0,
        onLiveChange: (pctVal) => {
          const nextOpacity = Math.max(0, Math.min(100, pctVal)) / 100;
          this.onPreviewOpacity?.(layer.id, nextOpacity);
        }
      }
    );
  }

  openStrokeDropdown(layer, comboEl, triggerBtn) {
    const existing = comboEl._strokeDropdown;
    const isAlreadyOpen = existing && !existing.classList.contains('hidden');

    PropertyControls.closeAllDropdowns();
    if (isAlreadyOpen) return;

    let dropdown = existing;
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'cad-custom-dropdown hidden bg-[#17171c] rounded-b shadow-2xl max-h-48 overflow-y-auto py-1 border border-[#27272a] border-t-0';
      dropdown._triggerEl = triggerBtn;
      comboEl._strokeDropdown = dropdown;
      this._dropdowns.add(dropdown);
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
        this.onCommitStrokeWidth?.(layer.id, preset);
      });

      dropdown.appendChild(item);
    });

    const updatePosition = () => {
      const rect = comboEl.getBoundingClientRect();
      dropdown.style.position = 'fixed';
      dropdown.style.top = `${rect.bottom}px`;
      dropdown.style.left = `${rect.left}px`;
      dropdown.style.width = `${rect.width}px`;
      dropdown.style.zIndex = '99999';
    };

    updatePosition();
    dropdown._updatePos = updatePosition;
    dropdown.classList.remove('hidden');
  }

  pruneOrphanDropdowns() {
    this._dropdowns.forEach((d) => {
      if (d._triggerEl && !d._triggerEl.isConnected) {
        this._dropdowns.delete(d);
        d.remove();
      }
    });
  }

  cleanup() {
    this._dropdowns.forEach((d) => d.remove());
    this._dropdowns.clear();
  }
}