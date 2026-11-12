/**
 * PropertyBatchView.js - Vista y controlador de eventos para Selección Múltiple
 * en el Panel de Propiedades.
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { PropertyControls } from './PropertyControls.js';

export class PropertyBatchView {
  constructor({
    utils,
    colorHandler,
    onDispatchCommand,
    onRequestCanvasUpdate,
    getLayer,
    getHexColor,
    formatWidthDisplay,
    isPresetWidth,
    getWidthTextColorClass
  }) {
    this.utils = utils;
    this.colorHandler = colorHandler;
    this.onDispatchCommand = onDispatchCommand;
    this.onRequestCanvasUpdate = onRequestCanvasUpdate;
    this.getLayer = getLayer;
    this.getHexColor = getHexColor;
    this.formatWidthDisplay = formatWidthDisplay;
    this.isPresetWidth = isPresetWidth;
    this.getWidthTextColorClass = getWidthTextColorClass;
  }

  _analyzeSelection(selectedEntities) {
    const { defaultColor } = CAD_THEME.properties;
    const layerManager = this.utils.layerManager;
    const activeLayer = layerManager ? layerManager.getActiveLayer() : null;

    const state = {
      sharedLayerId: null,
      allSameLayer: true,
      sharedColor: null,
      allSameColor: true,
      allColorByLayer: true,
      allColorCustom: true,
      sharedOpacity: null,
      allSameOpacity: true,
      allOpacityByLayer: true,
      allOpacityCustom: true,
      sharedWidth: null,
      allSameWidth: true,
      allWidthByLayer: true,
      allWidthCustom: true
    };

    for (const ent of selectedEntities) {
      const entLayerId = String(ent.data?.layerId ?? '0');
      if (state.sharedLayerId === null) {
        state.sharedLayerId = entLayerId;
      } else if (state.sharedLayerId !== entLayerId) {
        state.allSameLayer = false;
      }

      const layerOfEnt = this.getLayer(ent.data?.layerId) || activeLayer;

      // Color
      const colorByLayer = ent.data?.colorByLayer !== false;
      if (colorByLayer) state.allColorCustom = false;
      else state.allColorByLayer = false;

      const entColor = colorByLayer
        ? (layerOfEnt ? layerOfEnt.color : defaultColor)
        : (ent.data?.origStrokeColor || ent.strokeColor || defaultColor);
      const hex = this.getHexColor(entColor);

      if (state.sharedColor === null) {
        state.sharedColor = hex;
      } else if (state.sharedColor.toLowerCase() !== hex.toLowerCase()) {
        state.allSameColor = false;
      }

      // Opacidad
      const opacityByLayer = ent.data?.opacityByLayer !== false;
      if (opacityByLayer) state.allOpacityCustom = false;
      else state.allOpacityByLayer = false;

      const entOp = opacityByLayer
        ? (layerOfEnt && layerOfEnt.opacity !== undefined ? layerOfEnt.opacity : 1)
        : (ent.data?.origOpacity !== undefined ? ent.data.origOpacity : (ent.opacity !== undefined ? ent.opacity : 1));

      if (state.sharedOpacity === null) {
        state.sharedOpacity = entOp;
      } else if (Math.abs(state.sharedOpacity - entOp) > 0.01) {
        state.allSameOpacity = false;
      }

      // Grosor
      const widthByLayer = ent.data?.widthByLayer !== false;
      if (widthByLayer) state.allWidthCustom = false;
      else state.allWidthByLayer = false;

      const entW = widthByLayer
        ? (layerOfEnt && layerOfEnt.strokeWidth !== undefined ? layerOfEnt.strokeWidth : 1)
        : (ent.data?.baseStrokeWidth !== undefined ? ent.data.baseStrokeWidth : (ent.strokeWidth !== undefined ? ent.strokeWidth : 1));

      if (state.sharedWidth === null) {
        state.sharedWidth = entW;
      } else if (Math.abs(state.sharedWidth - entW) > 0.001) {
        state.allSameWidth = false;
      }
    }

    return state;
  }

  render(container, selectedEntities) {
    const { defaultColor, strokeWidthPresets } = CAD_THEME.properties;
    const layerManager = this.utils.layerManager;
    const propManager = this.utils.propertyManager;
    const layers = layerManager ? Array.from(layerManager.layers.values()) : [];
    const activeLayer = layerManager ? layerManager.getActiveLayer() : null;
    const defaults = propManager ? propManager.defaultSettings : null;

    const s = this._analyzeSelection(selectedEntities);

    const isColorCustomMode = s.allColorCustom && s.allSameColor;
    const isColorMixedMode = !s.allColorByLayer && !isColorCustomMode;

    const isOpacityCustomMode = s.allOpacityCustom && s.allSameOpacity;
    const isOpacityMixedMode = !s.allOpacityByLayer && !isOpacityCustomMode;

    const isWidthCustomMode = s.allWidthCustom && s.allSameWidth;
    const isWidthMixedMode = !s.allWidthByLayer && !isWidthCustomMode;

    const colorQuestionClass = s.allColorByLayer ? 'text-zinc-500' : 'text-white';
    const opacityColorClass = s.allOpacityByLayer ? 'text-zinc-500' : 'text-white';
    const opacityWeightClass = s.allSameOpacity ? 'font-normal' : 'font-bold';

    const widthColorClass = s.allWidthByLayer
      ? 'text-zinc-500'
      : (s.allSameWidth ? this.getWidthTextColorClass(false, s.sharedWidth) : 'text-white');
    const widthWeightClass = s.allSameWidth ? 'font-normal' : 'font-bold';

    const defaultFallbackColor = defaults?.color && defaults.color !== 'BYLAYER'
      ? defaults.color
      : (activeLayer ? activeLayer.color : defaultColor);
    const batchHexColor = this.getHexColor(s.allSameColor && s.sharedColor ? s.sharedColor : defaultFallbackColor);

    const opacityDisplay = s.allSameOpacity && s.sharedOpacity !== null ? `${Math.round(s.sharedOpacity * 100)}` : '?';
    const widthDisplay = s.allSameWidth && s.sharedWidth !== null ? this.formatWidthDisplay(s.sharedWidth) : '?';

    const widthPresetOptions = strokeWidthPresets.map((preset) => {
      const label = preset === 0 ? '-' : preset.toFixed(1);
      const selected = isWidthCustomMode && s.sharedWidth === preset ? 'selected' : '';
      return `<option value="${preset}" ${selected}>${label}</option>`;
    }).join('');

    container.innerHTML = `
      <div class="pb-6">
        <!-- Nombres (Solo lectura) -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full mt-2">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Nombres</span>
          <input type="text" id="propBatchNameInput" value="-- Varios --" disabled class="w-full bg-[#121215] text-zinc-500 text-[11px] px-2 py-1 rounded outline-none border border-[#27272a]/30 flex-1 min-w-0 cursor-not-allowed select-none">
        </div>

        <!-- Capa en lote -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Capa</span>
          <div class="relative flex items-center flex-1 min-w-0">
            <select id="propBatchLayerSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
              ${!s.allSameLayer ? '<option value="" disabled selected>-- Varias --</option>' : ''}
              ${layers.map((l) => `<option value="${l.id}" ${s.allSameLayer && String(l.id) === String(s.sharedLayerId) ? 'selected' : ''}>${l.name}</option>`).join('')}
            </select>
            <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
          </div>
        </div>

        <!-- Color (Múltiple) -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Color</span>
          <div class="flex items-center flex-1 min-w-0 gap-1.5">
            ${!s.allSameColor ? `
              <div id="propBatchColorPicker" class="tooltip-bottom w-[22px] h-[22px] rounded cursor-pointer bg-[#17171c] hover:bg-[#27272a] flex items-center justify-center ${colorQuestionClass} text-[11px] font-sans font-bold select-none shrink-0 transition-colors" data-tooltip="Cambiar color en lote">
                ?
              </div>
            ` : `
              <div class="tooltip-bottom flex items-center shrink-0" data-tooltip="Cambiar color en lote">
                <input type="color" id="propBatchColorPicker" value="${batchHexColor}" class="w-[22px] h-[22px] rounded cursor-pointer border-none outline-none p-0 bg-transparent">
              </div>
            `}
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="propBatchColorModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                ${isColorMixedMode ? '<option value="" disabled selected>-- Varios --</option>' : ''}
                <option value="BYLAYER" ${s.allColorByLayer ? 'selected' : ''}>Por Capa</option>
                <option value="CUSTOM" ${isColorCustomMode ? 'selected' : ''}>Personalizado</option>
              </select>
              <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
            </div>
          </div>
        </div>

        <!-- Opacidad (Múltiple) -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Opacidad</span>
          <div class="flex items-center flex-1 min-w-0 gap-1.5">
            <div id="propBatchOpacityContainer" class="tooltip-bottom flex items-center justify-end w-[62px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" data-tooltip="Haz clic para editar o arrastra">
              <input type="text" id="propBatchOpacityInput" value="${opacityDisplay}" class="w-9 bg-transparent text-right outline-none border-0 ${opacityColorClass} ${opacityWeightClass} text-[11px] font-sans tabular-nums p-0 cursor-ew-resize focus:cursor-text">
              ${s.allSameOpacity ? `<span class="text-[11px] ${opacityColorClass} font-sans tabular-nums ml-0.5 pointer-events-none">%</span>` : ''}
            </div>
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="propBatchOpacityModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                ${isOpacityMixedMode ? '<option value="" disabled selected>-- Varios --</option>' : ''}
                <option value="BYLAYER" ${s.allOpacityByLayer ? 'selected' : ''}>Por Capa</option>
                <option value="CUSTOM" ${isOpacityCustomMode ? 'selected' : ''}>Personalizado</option>
              </select>
              <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
            </div>
          </div>
        </div>

        <!-- Grosor (Múltiple) -->
        <div class="flex items-center justify-between gap-2 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Grosor</span>
          <div class="flex items-center flex-1 min-w-0 gap-1.5">
            <div id="propBatchWidthContainer" class="tooltip-bottom flex items-center justify-end w-[62px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" data-tooltip="Haz clic para editar o arrastra">
              <input type="text" id="propBatchWidthInput" value="${widthDisplay}" class="w-9 bg-transparent text-right outline-none border-0 ${widthColorClass} ${widthWeightClass} text-[11px] font-sans tabular-nums p-0 cursor-ew-resize focus:cursor-text">
            </div>
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="propBatchWidthModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                ${isWidthMixedMode ? '<option value="" disabled selected>-- Varios --</option>' : ''}
                <option value="BYLAYER" ${s.allWidthByLayer ? 'selected' : ''}>Por Capa</option>
                ${widthPresetOptions}
                <option value="CUSTOM" ${isWidthCustomMode && !strokeWidthPresets.includes(s.sharedWidth) ? 'selected' : ''}>Personalizado</option>
              </select>
              <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
            </div>
          </div>
        </div>
      </div>
    `;

    PropertyControls.attachInputIsolation(container);
    this._attachEvents(container, selectedEntities);
  }

  _attachEvents(container, selectedEntities) {
    const { customFallbackColor } = CAD_THEME.properties;
    const propManager = this.utils.propertyManager;

    const batchLayerSelect = container.querySelector('#propBatchLayerSelect');
    batchLayerSelect?.addEventListener('change', (e) => {
      const targetLayerId = e.target.value;
      if (!targetLayerId) return;
      this.onDispatchCommand({ layerId: targetLayerId });
    });

    const batchColorModeSelect = container.querySelector('#propBatchColorModeSelect');
    const batchColorPicker = container.querySelector('#propBatchColorPicker');

    batchColorModeSelect?.addEventListener('change', (e) => {
      const isByLayer = e.target.value === 'BYLAYER';
      this.onDispatchCommand({
        colorByLayer: isByLayer,
        origStrokeColor: isByLayer ? undefined : (batchColorPicker && batchColorPicker.value ? batchColorPicker.value : customFallbackColor)
      });
    });

    batchColorPicker?.addEventListener('click', (e) => {
      e.preventDefault();
      this.colorHandler.openForBatch(batchColorPicker);
    });

    const batchOpacityModeSelect = container.querySelector('#propBatchOpacityModeSelect');
    const batchOpacityContainer = container.querySelector('#propBatchOpacityContainer');
    const batchOpacityInput = container.querySelector('#propBatchOpacityInput');

    batchOpacityModeSelect?.addEventListener('change', (e) => {
      const isByLayer = e.target.value === 'BYLAYER';
      const pctVal = parseFloat(batchOpacityInput ? batchOpacityInput.value : 100) || 100;
      const val = pctVal / 100;
      this.onDispatchCommand({
        opacityByLayer: isByLayer,
        origOpacity: isByLayer ? undefined : val,
        baseOpacity: isByLayer ? undefined : val,
        opacity: isByLayer ? undefined : val
      });
    });

    PropertyControls.attachScrubInput(batchOpacityContainer, batchOpacityInput, (pctVal) => {
      const val = pctVal / 100;
      this.onDispatchCommand({ opacityByLayer: false, origOpacity: val, baseOpacity: val, opacity: val });
    }, {
      min: 0, max: 100, step: 1, precision: 0,
      onLiveChange: (val) => {
        propManager.previewEntitiesProperty(selectedEntities, { opacity: val / 100 });
        if (batchOpacityInput) {
          batchOpacityInput.classList.remove('text-zinc-500');
          batchOpacityInput.classList.add('text-white');
        }
      }
    });

    const batchWidthModeSelect = container.querySelector('#propBatchWidthModeSelect');
    const batchWidthContainer = container.querySelector('#propBatchWidthContainer');
    const batchWidthInput = container.querySelector('#propBatchWidthInput');

    batchWidthModeSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'BYLAYER') {
        this.onDispatchCommand({ widthByLayer: true, baseStrokeWidth: undefined });
      } else if (val === 'CUSTOM') {
        const num = parseFloat(batchWidthInput ? batchWidthInput.value : 1.0) || 1.0;
        this.onDispatchCommand({ widthByLayer: false, baseStrokeWidth: num, strokeWidth: num });
      } else {
        const num = parseFloat(val);
        this.onDispatchCommand({ widthByLayer: false, baseStrokeWidth: num, strokeWidth: num });
      }
    });

    PropertyControls.attachScrubInput(batchWidthContainer, batchWidthInput, (widthVal) => {
      this.onDispatchCommand({ widthByLayer: false, baseStrokeWidth: widthVal, strokeWidth: widthVal });
    }, {
      min: 0, max: null, step: 0.1, precision: 1,
      formatValue: (v) => this.formatWidthDisplay(v),
      onLiveChange: (val) => {
        propManager.previewEntitiesProperty(selectedEntities, { strokeWidth: val });
        const isPreset = this.isPresetWidth(val);
        if (batchWidthInput) {
          batchWidthInput.classList.toggle('text-zinc-500', isPreset);
          batchWidthInput.classList.toggle('text-white', !isPreset);
        }
      }
    });
  }
}