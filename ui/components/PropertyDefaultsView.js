/**
 * PropertyDefaultsView.js - Vista y controlador de eventos para el estado "Sin selección"
 * (Propiedades por defecto para nuevos trazos) en el Panel de Propiedades.
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { PropertyControls } from './PropertyControls.js';

export class PropertyDefaultsView {
  constructor({
    utils,
    service,
    colorHandler,
    onDispatchDefaultCommand,
    onRefresh,
    onPreviewStateChange,
    onEnsureDefaultSettings,
    getHexColor,
    formatWidthDisplay,
    isPresetWidth,
    getOpacityTextColorClass,
    getWidthTextColorClass,
    SetActiveLayerCommandClass
  }) {
    this.utils = utils;
    this.service = service;
    this.colorHandler = colorHandler;
    this.onDispatchDefaultCommand = onDispatchDefaultCommand;
    this.onRefresh = onRefresh;
    this.onPreviewStateChange = onPreviewStateChange;
    this.onEnsureDefaultSettings = onEnsureDefaultSettings;
    this.getHexColor = getHexColor;
    this.formatWidthDisplay = formatWidthDisplay;
    this.isPresetWidth = isPresetWidth;
    this.getOpacityTextColorClass = getOpacityTextColorClass;
    this.getWidthTextColorClass = getWidthTextColorClass;
    this.SetActiveLayerCommandClass = SetActiveLayerCommandClass;
  }

  _escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  render(container) {
    this.onEnsureDefaultSettings();

    const { strokeWidthPresets } = CAD_THEME.properties;
    const layerManager = this.utils.layerManager;
    const propManager = this.utils.propertyManager;
    const layers = layerManager ? Array.from(layerManager.layers.values()) : [];
    const activeLayer = layerManager ? layerManager.getActiveLayer() : null;
    const activeLayerId = activeLayer ? activeLayer.id : '0';

    const defaults = propManager.defaultSettings;
    const isColorByLayer = defaults.color === 'BYLAYER';
    const isOpacityByLayer = defaults.opacity === 'BYLAYER';
    const isWidthByLayer = defaults.strokeWidth === 'BYLAYER';

    const hexColor = this.getHexColor(propManager.getResolvedColor());
    const resolvedOpacity = propManager.getResolvedOpacity();
    const defOpacityPct = Math.round((typeof resolvedOpacity === 'number' ? resolvedOpacity : 1) * 100);
    const resolvedWidth = propManager.getResolvedStrokeWidth();
    const defWidthFormatted = this.formatWidthDisplay(resolvedWidth);

    const opacityColorClass = this.getOpacityTextColorClass(isOpacityByLayer);
    const widthColorClass = this.getWidthTextColorClass(isWidthByLayer, resolvedWidth);

    const layerOptions = layers
      .map((l) => `<option value="${this._escapeHtml(l.id)}" ${String(l.id) === String(activeLayerId) ? 'selected' : ''}>${this._escapeHtml(l.name)}</option>`)
      .join('');

    const widthPresetOptions = strokeWidthPresets.map((preset) => {
      const label = preset === 0 ? '-' : preset.toFixed(1);
      const selected = !isWidthByLayer && resolvedWidth === preset ? 'selected' : '';
      return `<option value="${preset}" ${selected}>${label}</option>`;
    }).join('');

    container.innerHTML = `
      <div class="pb-6">

        <!-- Capa Activa -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full mt-2">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Capa</span>
          <div class="relative flex items-center flex-1 min-w-0">
            <select id="defLayerSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
              ${layerOptions}
            </select>
          </div>
        </div>

        <!-- Color -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Color</span>
          <div class="flex items-center flex-1 min-w-0 gap-1.5">
            <div class="tooltip-bottom flex items-center shrink-0" data-tooltip="Cambiar color">
              <button type="button" id="defColorPicker" data-color="${hexColor}" style="background-color: ${hexColor}" class="w-[23px] h-[23px] rounded cursor-pointer border-0 outline-none p-0 shrink-0"></button>
            </div>
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="defColorSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                <option value="BYLAYER" ${isColorByLayer ? 'selected' : ''}>Por Capa</option>
                <option value="CUSTOM" ${!isColorByLayer ? 'selected' : ''}>Personalizado</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Opacidad -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Opacidad</span>
          <div class="flex items-center flex-1 min-w-0 gap-1.5">
            <div id="defOpacityContainer" class="tooltip-bottom flex items-center justify-end w-[50px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" data-tooltip="Haz clic para editar o arrastra">
              <input type="number" id="defOpacityInput" min="0" max="100" value="${defOpacityPct}" class="w-9 bg-transparent text-right outline-none border-0 ${opacityColorClass} text-[11px] font-sans tabular-nums p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ew-resize focus:cursor-text">
              <span class="text-[11px] ${opacityColorClass} font-sans tabular-nums ml-0.5 pointer-events-none">%</span>
            </div>
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="defOpacityModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                <option value="BYLAYER" ${isOpacityByLayer ? 'selected' : ''}>Por Capa</option>
                <option value="CUSTOM" ${!isOpacityByLayer ? 'selected' : ''}>Personalizado</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Grosor -->
        <div class="flex items-center justify-between gap-2 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Grosor</span>
          <div class="flex items-center flex-1 min-w-0 gap-1.5">
            <div id="defWidthContainer" class="tooltip-bottom flex items-center justify-end w-[50px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" data-tooltip="Haz clic para editar o arrastra">
              <input type="text" id="defWidthInput" value="${defWidthFormatted}" class="w-9 bg-transparent text-right outline-none border-0 ${widthColorClass} text-[11px] font-sans tabular-nums p-0 cursor-ew-resize focus:cursor-text">
            </div>
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="defWidthModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                <option value="BYLAYER" ${isWidthByLayer ? 'selected' : ''}>Por Capa</option>
                ${widthPresetOptions}
                <option value="CUSTOM" ${!isWidthByLayer && !strokeWidthPresets.includes(resolvedWidth) ? 'selected' : ''}>Personalizado</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    `;

    PropertyControls.attachInputIsolation(container);
    this._attachEvents(container);
  }

  _attachEvents(container) {
    this._bindLayerEvents(container);
    this._bindColorEvents(container);
    this._bindOpacityEvents(container);
    this._bindWidthEvents(container);
  }

  _bindLayerEvents(container) {
    const layerSelect = container.querySelector('#defLayerSelect');
    const layerManager = this.utils.layerManager;
    const propManager = this.utils.propertyManager;
    const SetActiveLayerCommand = this.SetActiveLayerCommandClass;

    layerSelect?.addEventListener('change', (e) => {
      const newLayerId = e.target.value;
      const oldLayerId = layerManager ? layerManager.activeLayerId : '0';

      if (String(oldLayerId) !== String(newLayerId) && SetActiveLayerCommand && this.service && layerManager) {
        const cmd = new SetActiveLayerCommand(layerManager, oldLayerId, newLayerId);
        this.service.executeCommand(cmd);
      }

      propManager?.syncActivePath?.();
    });
  }

  _bindColorEvents(container) {
    const { customFallbackColor } = CAD_THEME.properties;
    const colorSelect = container.querySelector('#defColorSelect');
    const colorPicker = container.querySelector('#defColorPicker');
    const defaults = this.utils.propertyManager.defaultSettings;

    colorSelect?.addEventListener('change', (e) => {
      const oldVal = defaults.color;
      const newVal = e.target.value === 'BYLAYER' ? 'BYLAYER' : (colorPicker?.dataset.color || customFallbackColor);
      if (oldVal !== newVal) {
        this.onDispatchDefaultCommand({ color: oldVal }, { color: newVal });
      }
    });

    colorPicker?.addEventListener('click', (e) => {
      e.preventDefault();
      this.colorHandler.openForDefaults(colorPicker);
    });
  }

  _bindOpacityEvents(container) {
    const opacityModeSelect = container.querySelector('#defOpacityModeSelect');
    const opacityContainer = container.querySelector('#defOpacityContainer');
    const opacityInput = container.querySelector('#defOpacityInput');
    const propManager = this.utils.propertyManager;
    const defaults = propManager.defaultSettings;

    opacityModeSelect?.addEventListener('change', (e) => {
      const isByLayer = e.target.value === 'BYLAYER';
      const oldVal = defaults.opacity;
      const newVal = isByLayer ? 'BYLAYER' : (parseFloat(opacityInput ? opacityInput.value : 100) / 100);
      if (oldVal !== newVal) {
        this.onDispatchDefaultCommand({ opacity: oldVal }, { opacity: newVal });
      }
    });

    let opacityScrubStart = defaults.opacity;
    let isScrubbing = false;

    PropertyControls.attachScrubInput(opacityContainer, opacityInput, (pctVal) => {
      if (isScrubbing) {
        isScrubbing = false;
        this.onPreviewStateChange?.(false);
      }
      const newVal = pctVal / 100;
      if (opacityScrubStart !== newVal) {
        this.onDispatchDefaultCommand({ opacity: opacityScrubStart }, { opacity: newVal });
      } else {
        this.onRefresh?.();
      }
      opacityScrubStart = defaults.opacity;
    }, {
      min: 0, max: 100, step: 1, precision: 0,
      onScrubStart: () => {
        opacityScrubStart = defaults.opacity;
      },
      onLiveChange: (val) => {
        if (!isScrubbing) {
          isScrubbing = true;
          this.onPreviewStateChange?.(true);
        }
        propManager.previewDefaultSetting('opacity', val / 100);
        PropertyControls.updateSelectValueSilently(opacityModeSelect, 'CUSTOM');
        if (opacityInput) {
          opacityInput.classList.remove('text-zinc-500');
          opacityInput.classList.add('text-white');
        }
        const span = opacityContainer?.querySelector('span');
        if (span) {
          span.classList.remove('text-zinc-500');
          span.classList.add('text-white');
        }
      }
    });
  }

  _bindWidthEvents(container) {
    const widthModeSelect = container.querySelector('#defWidthModeSelect');
    const widthContainer = container.querySelector('#defWidthContainer');
    const widthInput = container.querySelector('#defWidthInput');
    const propManager = this.utils.propertyManager;
    const defaults = propManager.defaultSettings;

    widthModeSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      const oldVal = defaults.strokeWidth;
      let newVal = 'BYLAYER';

      if (val === 'CUSTOM') {
        newVal = parseFloat(widthInput ? widthInput.value : 1.0) || 1.0;
      } else if (val !== 'BYLAYER') {
        newVal = parseFloat(val);
      }

      if (oldVal !== newVal) {
        this.onDispatchDefaultCommand({ strokeWidth: oldVal }, { strokeWidth: newVal });
      }
    });

    let widthScrubStart = defaults.strokeWidth;
    let isScrubbing = false;

    PropertyControls.attachScrubInput(widthContainer, widthInput, (widthVal) => {
      if (isScrubbing) {
        isScrubbing = false;
        this.onPreviewStateChange?.(false);
      }
      if (widthScrubStart !== widthVal) {
        this.onDispatchDefaultCommand({ strokeWidth: widthScrubStart }, { strokeWidth: widthVal });
      } else {
        this.onRefresh?.();
      }
      widthScrubStart = defaults.strokeWidth;
    }, {
      min: 0, max: null, step: 0.1, precision: 1,
      formatValue: (v) => this.formatWidthDisplay(v),
      onScrubStart: () => {
        widthScrubStart = defaults.strokeWidth;
      },
      onLiveChange: (widthVal) => {
        if (!isScrubbing) {
          isScrubbing = true;
          this.onPreviewStateChange?.(true);
        }
        propManager.previewDefaultSetting('strokeWidth', widthVal);
        const isPreset = this.isPresetWidth(widthVal);
        const targetSelectValue = isPreset ? (widthVal === 0 ? '0' : String(widthVal)) : 'CUSTOM';
        PropertyControls.updateSelectValueSilently(widthModeSelect, targetSelectValue);

        if (widthInput) {
          widthInput.classList.toggle('text-zinc-500', isPreset);
          widthInput.classList.toggle('text-white', !isPreset);
        }
      }
    });
  }
}