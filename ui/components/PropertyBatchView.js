/**
 * PropertyBatchView.js - Vista y controlador de eventos para Selección Múltiple
 * en el Panel de Propiedades.
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { PropertyControls } from './PropertyControls.js';
import { analyzeBatchSelection } from './BatchSelectionAnalyzer.js';

export class PropertyBatchView {
  constructor({
    utils,
    colorHandler,
    onDispatchCommand,
    onPreviewStateChange,
    getLayer,
    getHexColor,
    formatWidthDisplay,
    isPresetWidth,
    getWidthTextColorClass
  }) {
    this.utils = utils;
    this.colorHandler = colorHandler;
    this.onDispatchCommand = onDispatchCommand;
    this.onPreviewStateChange = onPreviewStateChange;
    this.getLayer = getLayer;
    this.getHexColor = getHexColor;
    this.formatWidthDisplay = formatWidthDisplay;
    this.isPresetWidth = isPresetWidth;
    this.getWidthTextColorClass = getWidthTextColorClass;
  }

  _escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  render(container, selectedEntities) {
    const { defaultColor, strokeWidthPresets } = CAD_THEME.properties;
    const layerManager = this.utils.layerManager;
    const propManager = this.utils.propertyManager;
    const layers = layerManager ? Array.from(layerManager.layers.values()) : [];
    const activeLayer = layerManager ? layerManager.getActiveLayer() : null;
    const defaults = propManager ? propManager.defaultSettings : null;

    const s = analyzeBatchSelection(selectedEntities, {
      getLayer: this.getLayer,
      activeLayer,
      getHexColor: this.getHexColor
    });

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

    const layerOptions = layers
      .map((l) => `<option value="${this._escapeHtml(l.id)}" ${s.allSameLayer && String(l.id) === String(s.sharedLayerId) ? 'selected' : ''}>${this._escapeHtml(l.name)}</option>`)
      .join('');

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
              ${layerOptions}
            </select>
          </div>
        </div>

        <!-- Color (Múltiple) -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Color</span>
          <div class="flex items-center flex-1 min-w-0 gap-1.5">
            ${!s.allSameColor ? `
              <div class="tooltip-bottom flex items-center shrink-0" data-tooltip="Cambiar color en lote">
                <button type="button" id="propBatchColorPicker" class="w-[23px] h-[23px] p-0 rounded cursor-pointer bg-[#17171c] hover:bg-[#27272a] flex items-center justify-center ${colorQuestionClass} text-[11px] font-sans font-bold select-none shrink-0 border-0 outline-none transition-colors">?</button>
              </div>
            ` : `
              <div class="tooltip-bottom flex items-center shrink-0" data-tooltip="Cambiar color en lote">
                <button type="button" id="propBatchColorPicker" data-color="${batchHexColor}" style="background-color: ${batchHexColor}" class="w-[23px] h-[23px] rounded cursor-pointer border-0 outline-none p-0"></button>
              </div>
            `}
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="propBatchColorModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                ${isColorMixedMode ? '<option value="" disabled selected>-- Varios --</option>' : ''}
                <option value="BYLAYER" ${s.allColorByLayer ? 'selected' : ''}>Por Capa</option>
                <option value="CUSTOM" ${isColorCustomMode ? 'selected' : ''}>Personalizado</option>
              </select>
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
            </div>
          </div>
        </div>
      </div>
    `;

    PropertyControls.attachInputIsolation(container);
    this._attachEvents(container, selectedEntities);
  }

  _attachEvents(container, selectedEntities) {
    this._bindBatchLayerEvents(container);
    this._bindBatchColorEvents(container);
    this._bindBatchOpacityEvents(container, selectedEntities);
    this._bindBatchWidthEvents(container, selectedEntities);
  }

  _bindBatchLayerEvents(container) {
    const batchLayerSelect = container.querySelector('#propBatchLayerSelect');
    batchLayerSelect?.addEventListener('change', (e) => {
      const targetLayerId = e.target.value;
      if (!targetLayerId) return;
      this.onDispatchCommand({ layerId: targetLayerId });
    });
  }

  _bindBatchColorEvents(container) {
    const { customFallbackColor } = CAD_THEME.properties;
    const batchColorModeSelect = container.querySelector('#propBatchColorModeSelect');
    const batchColorPicker = container.querySelector('#propBatchColorPicker');

    batchColorModeSelect?.addEventListener('change', (e) => {
      const isByLayer = e.target.value === 'BYLAYER';
      this.onDispatchCommand({
        colorByLayer: isByLayer,
        origStrokeColor: isByLayer ? undefined : (batchColorPicker?.dataset.color || customFallbackColor)
      });
    });

    batchColorPicker?.addEventListener('click', (e) => {
      e.preventDefault();
      this.colorHandler.openForBatch(batchColorPicker);
    });
  }

  _bindBatchOpacityEvents(container, selectedEntities) {
    const propManager = this.utils.propertyManager;
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

    const captureOpacitySnapshots = () => selectedEntities.map((ent) => ({
      opacityByLayer: ent.data?.opacityByLayer,
      origOpacity: ent.data?.origOpacity,
      baseOpacity: ent.data?.baseOpacity,
      opacity: ent.opacity
    }));

    let opacityStartSnapshots = captureOpacitySnapshots();
    let isOpacityScrubbing = false;

    PropertyControls.attachScrubInput(batchOpacityContainer, batchOpacityInput, (pctVal) => {
      if (isOpacityScrubbing) {
        isOpacityScrubbing = false;
        this.onPreviewStateChange?.(false);
      }
      const val = pctVal / 100;
      this.onDispatchCommand(
        { opacityByLayer: false, origOpacity: val, baseOpacity: val, opacity: val },
        null,
        opacityStartSnapshots
      );
      opacityStartSnapshots = captureOpacitySnapshots();
    }, {
      min: 0, max: 100, step: 1, precision: 0,
      onScrubStart: () => {
        opacityStartSnapshots = captureOpacitySnapshots();
      },
      onLiveChange: (val) => {
        if (!isOpacityScrubbing) {
          isOpacityScrubbing = true;
          this.onPreviewStateChange?.(true);
        }
        propManager.previewEntitiesProperty(selectedEntities, { opacity: val / 100 });
        if (batchOpacityInput) {
          batchOpacityInput.classList.remove('text-zinc-500');
          batchOpacityInput.classList.add('text-white');
        }
      }
    });
  }

  _bindBatchWidthEvents(container, selectedEntities) {
    const propManager = this.utils.propertyManager;
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

    const captureWidthSnapshots = () => selectedEntities.map((ent) => ({
      widthByLayer: ent.data?.widthByLayer,
      baseStrokeWidth: ent.data?.baseStrokeWidth,
      strokeWidth: ent.strokeWidth
    }));

    let widthStartSnapshots = captureWidthSnapshots();
    let isWidthScrubbing = false;

    PropertyControls.attachScrubInput(batchWidthContainer, batchWidthInput, (widthVal) => {
      if (isWidthScrubbing) {
        isWidthScrubbing = false;
        this.onPreviewStateChange?.(false);
      }
      this.onDispatchCommand(
        { widthByLayer: false, baseStrokeWidth: widthVal, strokeWidth: widthVal },
        null,
        widthStartSnapshots
      );
      widthStartSnapshots = captureWidthSnapshots();
    }, {
      min: 0, max: null, step: 0.1, precision: 1,
      formatValue: (v) => this.formatWidthDisplay(v),
      onScrubStart: () => {
        widthStartSnapshots = captureWidthSnapshots();
      },
      onLiveChange: (val) => {
        if (!isWidthScrubbing) {
          isWidthScrubbing = true;
          this.onPreviewStateChange?.(true);
        }
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