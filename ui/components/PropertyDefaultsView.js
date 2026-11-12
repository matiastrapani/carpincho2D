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
    layerPanelUI = null,
    paper = null,
    colorHandler,
    onDispatchDefaultCommand,
    onRefresh,
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
    this.layerPanelUI = layerPanelUI;
    this.paper = paper;
    this.colorHandler = colorHandler;
    this.onDispatchDefaultCommand = onDispatchDefaultCommand;
    this.onRefresh = onRefresh;
    this.onEnsureDefaultSettings = onEnsureDefaultSettings;
    this.getHexColor = getHexColor;
    this.formatWidthDisplay = formatWidthDisplay;
    this.isPresetWidth = isPresetWidth;
    this.getOpacityTextColorClass = getOpacityTextColorClass;
    this.getWidthTextColorClass = getWidthTextColorClass;
    this.SetActiveLayerCommandClass = SetActiveLayerCommandClass;
  }

  render(container) {
    this.onEnsureDefaultSettings();

    const { defaultColor, strokeWidthPresets } = CAD_THEME.properties;
    const layerManager = this.utils.layerManager;
    const propManager = this.utils.propertyManager;
    const layers = layerManager ? Array.from(layerManager.layers.values()) : [];
    const activeLayer = layerManager ? layerManager.getActiveLayer() : null;
    const activeLayerId = activeLayer ? activeLayer.id : '0';

    const defaults = propManager.defaultSettings;
    const isColorByLayer = defaults.color === 'BYLAYER';
    const isOpacityByLayer = defaults.opacity === 'BYLAYER';
    const isWidthByLayer = defaults.strokeWidth === 'BYLAYER';

    const activeColor = activeLayer ? activeLayer.color : defaultColor;
    const resolvedColor = isColorByLayer ? activeColor : defaults.color;
    const hexColor = this.getHexColor(resolvedColor);

    const activeOpacity = (activeLayer && activeLayer.opacity !== undefined) ? activeLayer.opacity : 1;
    const resolvedOpacity = isOpacityByLayer ? activeOpacity : defaults.opacity;
    const defOpacityPct = Math.round((typeof resolvedOpacity === 'number' ? resolvedOpacity : 1) * 100);

    const activeWidth = (activeLayer && activeLayer.strokeWidth !== undefined) ? activeLayer.strokeWidth : 1;
    const resolvedWidth = isWidthByLayer ? activeWidth : defaults.strokeWidth;
    const defWidthFormatted = this.formatWidthDisplay(resolvedWidth);

    const opacityColorClass = this.getOpacityTextColorClass(isOpacityByLayer);
    const widthColorClass = this.getWidthTextColorClass(isWidthByLayer, resolvedWidth);

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
              ${layers.map((l) => `<option value="${l.id}" ${String(l.id) === String(activeLayerId) ? 'selected' : ''}>${l.name}</option>`).join('')}
            </select>
            <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
          </div>
        </div>

        <!-- Color -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Color</span>
          <div class="flex items-center flex-1 min-w-0 gap-1.5">
            <div class="tooltip-bottom flex items-center shrink-0" data-tooltip="Cambiar color">
              <input type="color" id="defColorPicker" value="${hexColor}" class="w-[22px] h-[22px] rounded cursor-pointer border-none outline-none p-0 bg-transparent">
            </div>
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="defColorSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                <option value="BYLAYER" ${isColorByLayer ? 'selected' : ''}>Por Capa</option>
                <option value="CUSTOM" ${!isColorByLayer ? 'selected' : ''}>Personalizado</option>
              </select>
              <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
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
              <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
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
              <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
            </div>
          </div>
        </div>
      </div>
    `;

    PropertyControls.attachInputIsolation(container);
    this._attachEvents(container);
  }

  _attachEvents(container) {
    const { defaultColor, customFallbackColor } = CAD_THEME.properties;
    const layerSelect = container.querySelector('#defLayerSelect');
    const colorSelect = container.querySelector('#defColorSelect');
    const colorPicker = container.querySelector('#defColorPicker');

    const opacityModeSelect = container.querySelector('#defOpacityModeSelect');
    const opacityContainer = container.querySelector('#defOpacityContainer');
    const opacityInput = container.querySelector('#defOpacityInput');

    const widthModeSelect = container.querySelector('#defWidthModeSelect');
    const widthContainer = container.querySelector('#defWidthContainer');
    const widthInput = container.querySelector('#defWidthInput');

    const propManager = this.utils.propertyManager;
    const defaults = propManager.defaultSettings;
    const layerManager = this.utils.layerManager;

    layerSelect?.addEventListener('change', (e) => {
      const newLayerId = e.target.value;
      const oldLayerId = layerManager ? layerManager.activeLayerId : '0';
      const SetActiveLayerCommand = this.SetActiveLayerCommandClass;

      if (String(oldLayerId) !== String(newLayerId)) {
        if (SetActiveLayerCommand && this.service && layerManager) {
          const uiListener = this.layerPanelUI || { refresh: () => this.onRefresh() };
          const cmd = new SetActiveLayerCommand(layerManager, oldLayerId, newLayerId, uiListener);
          this.service.executeCommand(cmd);
        } else if (layerManager) {
          layerManager.setActiveLayer(newLayerId);
          if (this.layerPanelUI) this.layerPanelUI.refresh();
          this.onRefresh();
        }
      }

      const activeLayer = layerManager ? layerManager.getActiveLayer() : null;

      if (defaults.color === 'BYLAYER' && colorPicker) {
        colorPicker.value = this.getHexColor(activeLayer ? activeLayer.color : defaultColor);
      }

      if (defaults.opacity === 'BYLAYER' && opacityInput) {
        const layerOpacity = activeLayer?.opacity !== undefined ? activeLayer.opacity : 1;
        opacityInput.value = Math.round(layerOpacity * 100);
      }

      if (defaults.strokeWidth === 'BYLAYER' && widthInput) {
        const layerWidth = activeLayer?.strokeWidth !== undefined ? activeLayer.strokeWidth : 1;
        widthInput.value = this.formatWidthDisplay(layerWidth);
      }

      propManager.previewDefaultSetting('color', defaults.color);
    });

    colorSelect?.addEventListener('change', (e) => {
      const oldVal = defaults.color;
      const newVal = e.target.value === 'BYLAYER' ? 'BYLAYER' : (colorPicker ? colorPicker.value : customFallbackColor);
      if (oldVal !== newVal) {
        this.onDispatchDefaultCommand({ color: oldVal }, { color: newVal });
      }
    });

    colorPicker?.addEventListener('click', (e) => {
      e.preventDefault();
      this.colorHandler.openForDefaults(colorPicker);
    });

    opacityModeSelect?.addEventListener('change', (e) => {
      const isByLayer = e.target.value === 'BYLAYER';
      const oldVal = defaults.opacity;
      const newVal = isByLayer ? 'BYLAYER' : (parseFloat(opacityInput ? opacityInput.value : 100) / 100);
      if (oldVal !== newVal) {
        this.onDispatchDefaultCommand({ opacity: oldVal }, { opacity: newVal });
      }
    });

    let opacityScrubStart = defaults.opacity;
    PropertyControls.attachScrubInput(opacityContainer, opacityInput, (pctVal) => {
      const newVal = pctVal / 100;
      if (opacityScrubStart !== newVal) {
        this.onDispatchDefaultCommand({ opacity: opacityScrubStart }, { opacity: newVal });
      }
    }, {
      min: 0, max: 100, step: 1, precision: 0,
      onLiveChange: (val) => {
        propManager.previewDefaultSetting('opacity', val / 100);
        PropertyControls.updateSelectValueSilently(opacityModeSelect, 'CUSTOM');
        if (opacityInput) {
          opacityInput.classList.remove('text-zinc-500');
          opacityInput.classList.add('text-white');
        }
        if (opacityContainer) {
          const span = opacityContainer.querySelector('span');
          if (span) {
            span.classList.remove('text-zinc-500');
            span.classList.add('text-white');
          }
        }
      }
    });

    opacityContainer?.addEventListener('pointerdown', () => {
      opacityScrubStart = defaults.opacity;
    });

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
    PropertyControls.attachScrubInput(widthContainer, widthInput, (widthVal) => {
      if (widthScrubStart !== widthVal) {
        this.onDispatchDefaultCommand({ strokeWidth: widthScrubStart }, { strokeWidth: widthVal });
      }
    }, {
      min: 0, max: null, step: 0.1, precision: 1,
      formatValue: (v) => this.formatWidthDisplay(v),
      onLiveChange: (widthVal) => {
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

    widthContainer?.addEventListener('pointerdown', () => {
      widthScrubStart = defaults.strokeWidth;
    });
  }
}