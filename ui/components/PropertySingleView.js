/**
 * PropertySingleView.js - Vista y controlador de eventos para Entidad Única
 * en el Panel de Propiedades.
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { PropertyControls } from './PropertyControls.js';

export class PropertySingleView {
  constructor({
    utils,
    paper = null,
    colorHandler,
    onDispatchCommand,
    onRequestCanvasUpdate,
    getLayer,
    getHexColor,
    formatWidthDisplay,
    isPresetWidth,
    getOpacityTextColorClass,
    getWidthTextColorClass
  }) {
    this.utils = utils;
    this.paper = paper;
    this.colorHandler = colorHandler;
    this.onDispatchCommand = onDispatchCommand;
    this.onRequestCanvasUpdate = onRequestCanvasUpdate;
    this.getLayer = getLayer;
    this.getHexColor = getHexColor;
    this.formatWidthDisplay = formatWidthDisplay;
    this.isPresetWidth = isPresetWidth;
    this.getOpacityTextColorClass = getOpacityTextColorClass;
    this.getWidthTextColorClass = getWidthTextColorClass;
  }

  render(container, entity) {
    const { defaultColor, strokeWidthPresets } = CAD_THEME.properties;
    const layerManager = this.utils.layerManager;
    const layers = layerManager ? Array.from(layerManager.layers.values()) : [];
    const currentLayerId = entity.data?.layerId || '0';
    const entityName = entity.name || entity.data?.name || '';

    const isRaster = (this.paper?.Raster && entity instanceof this.paper.Raster)
      || entity.className === 'Raster'
      || entity.data?.isImageEntity;

    const isColorByLayer = entity.data?.colorByLayer !== undefined
      ? entity.data.colorByLayer === true
      : !entity.data?.origStrokeColor;

    const isOpacityByLayer = entity.data?.opacityByLayer !== undefined
      ? entity.data.opacityByLayer === true
      : entity.data?.origOpacity === undefined;

    const isWidthByLayer = entity.data?.widthByLayer !== undefined
      ? entity.data.widthByLayer === true
      : entity.data?.baseStrokeWidth === undefined;

    const activeLayer = this.getLayer(currentLayerId);

    const layerColor = activeLayer ? activeLayer.color : defaultColor;
    const resolvedColor = isColorByLayer ? layerColor : (entity.data?.origStrokeColor || entity.strokeColor);
    const hexColor = this.getHexColor(resolvedColor);

    const layerOpacity = (activeLayer && activeLayer.opacity !== undefined) ? activeLayer.opacity : 1;
    const resolvedOpacity = isOpacityByLayer
      ? layerOpacity
      : (entity.data?.origOpacity !== undefined ? entity.data.origOpacity : (entity.opacity !== undefined ? entity.opacity : 1));
    const opacityPct = Math.round(resolvedOpacity * 100);

    const layerWidth = (activeLayer && activeLayer.strokeWidth !== undefined) ? activeLayer.strokeWidth : 1;
    const resolvedWidth = isWidthByLayer
      ? layerWidth
      : (entity.data?.baseStrokeWidth !== undefined ? entity.data.baseStrokeWidth : (entity.strokeWidth !== undefined ? entity.strokeWidth : 1));
    const formattedWidth = this.formatWidthDisplay(resolvedWidth);

    const opacityColorClass = this.getOpacityTextColorClass(isOpacityByLayer);
    const widthColorClass = this.getWidthTextColorClass(isWidthByLayer, resolvedWidth);

    const widthPresetOptions = strokeWidthPresets.map((preset) => {
      const label = preset === 0 ? '-' : preset.toFixed(1);
      const selected = !isWidthByLayer && resolvedWidth === preset ? 'selected' : '';
      return `<option value="${preset}" ${selected}>${label}</option>`;
    }).join('');

    container.innerHTML = `
      <div class="pb-6">
        <!-- Nombre -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full mt-2">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Nombre</span>
          <input type="text" id="propNameInput" value="${entityName}" placeholder="${entity.type || 'Elemento'}" class="w-full bg-[#17171c] hover:bg-[#27272a] focus:bg-[#09090b] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none border-0 flex-1 min-w-0 transition-colors">
        </div>

        <!-- Capa -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Capa</span>
          <div class="relative flex items-center flex-1 min-w-0">
            <select id="propLayerSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
              ${layers.map((l) => `<option value="${l.id}" ${String(l.id) === String(currentLayerId) ? 'selected' : ''}>${l.name}</option>`).join('')}
            </select>
            <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
          </div>
        </div>

        <!-- Color -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Color</span>
          <div class="flex items-center flex-1 min-w-0 gap-1.5">
            <div class="tooltip-bottom flex items-center shrink-0" data-tooltip="Cambiar color">
              <input type="color" id="propColorPicker" value="${hexColor}" class="w-[22px] h-[22px] rounded cursor-pointer border-none outline-none p-0 bg-transparent">
            </div>
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="propColorModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
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
            <div id="propOpacityContainer" class="tooltip-bottom flex items-center justify-end w-[62px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" data-tooltip="Haz clic para editar o arrastra">
              <input type="number" id="propOpacityInput" min="0" max="100" value="${opacityPct}" class="w-9 bg-transparent text-right outline-none border-0 ${opacityColorClass} text-[11px] font-sans tabular-nums p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ew-resize focus:cursor-text">
              <span class="text-[11px] ${opacityColorClass} font-sans tabular-nums ml-0.5 pointer-events-none">%</span>
            </div>
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="propOpacityModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                <option value="BYLAYER" ${isOpacityByLayer ? 'selected' : ''}>Por Capa</option>
                <option value="CUSTOM" ${!isOpacityByLayer ? 'selected' : ''}>Personalizado</option>
              </select>
              <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
            </div>
          </div>
        </div>

        ${!isRaster ? `
          <!-- Grosor (Omitido para Imágenes) -->
          <div class="flex items-center justify-between gap-2 w-full">
            <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Grosor</span>
            <div class="flex items-center flex-1 min-w-0 gap-1.5">
              <div id="propWidthContainer" class="tooltip-bottom flex items-center justify-end w-[62px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" data-tooltip="Haz clic para editar o arrastra">
                <input type="text" id="propWidthInput" value="${formattedWidth}" class="w-9 bg-transparent text-right outline-none border-0 ${widthColorClass} text-[11px] font-sans tabular-nums p-0 cursor-ew-resize focus:cursor-text">
              </div>
              <div class="relative flex-1 min-w-0 flex items-center">
                <select id="propWidthModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                  <option value="BYLAYER" ${isWidthByLayer ? 'selected' : ''}>Por Capa</option>
                  ${widthPresetOptions}
                  <option value="CUSTOM" ${!isWidthByLayer && !strokeWidthPresets.includes(resolvedWidth) ? 'selected' : ''}>Personalizado</option>
                </select>
                <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    PropertyControls.attachInputIsolation(container);
    this._attachEvents(container, entity);
  }

  _attachEvents(container, entity) {
    const { defaultColor, customFallbackColor } = CAD_THEME.properties;
    const propManager = this.utils.propertyManager;

    const nameInput = container.querySelector('#propNameInput');
    const layerSelect = container.querySelector('#propLayerSelect');
    const colorModeSelect = container.querySelector('#propColorModeSelect');
    const colorPicker = container.querySelector('#propColorPicker');

    const opacityModeSelect = container.querySelector('#propOpacityModeSelect');
    const opacityContainer = container.querySelector('#propOpacityContainer');
    const opacityInput = container.querySelector('#propOpacityInput');

    const widthModeSelect = container.querySelector('#propWidthModeSelect');
    const widthContainer = container.querySelector('#propWidthContainer');
    const widthInput = container.querySelector('#propWidthInput');

    const activeLayer = this.getLayer(entity.data?.layerId || '0');

    nameInput?.addEventListener('change', (e) => {
      this.onDispatchCommand({ name: e.target.value.trim() }, entity);
    });

    layerSelect?.addEventListener('change', (e) => {
      this.onDispatchCommand({ layerId: e.target.value }, entity);
    });

    colorModeSelect?.addEventListener('change', (e) => {
      const isByLayer = e.target.value === 'BYLAYER';
      const curColor = colorPicker ? colorPicker.value : customFallbackColor;
      this.onDispatchCommand({
        colorByLayer: isByLayer,
        origStrokeColor: isByLayer ? undefined : curColor,
        strokeColor: isByLayer ? (activeLayer ? activeLayer.color : defaultColor) : curColor
      }, entity);
    });

    colorPicker?.addEventListener('click', (e) => {
      e.preventDefault();
      this.colorHandler.openForEntity(entity, colorPicker);
    });

    opacityModeSelect?.addEventListener('change', (e) => {
      const isByLayer = e.target.value === 'BYLAYER';
      const pctVal = parseFloat(opacityInput ? opacityInput.value : 100);
      const val = pctVal / 100;
      this.onDispatchCommand({
        opacityByLayer: isByLayer,
        origOpacity: isByLayer ? undefined : val,
        baseOpacity: isByLayer ? undefined : val,
        opacity: isByLayer ? (activeLayer?.opacity ?? 1) : val
      }, entity);
    });

    PropertyControls.attachScrubInput(opacityContainer, opacityInput, (pctVal) => {
      const opacityVal = pctVal / 100;
      this.onDispatchCommand({
        opacityByLayer: false,
        origOpacity: opacityVal,
        baseOpacity: opacityVal,
        opacity: opacityVal
      }, entity);
    }, {
      min: 0, max: 100, step: 1, precision: 0,
      onLiveChange: (val) => {
        propManager.previewEntitiesProperty(entity, { opacity: val / 100 });
        if (opacityInput) {
          opacityInput.classList.remove('text-zinc-500');
          opacityInput.classList.add('text-white');
        }
      }
    });

    widthModeSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'BYLAYER') {
        const layerWidth = activeLayer?.strokeWidth !== undefined ? activeLayer.strokeWidth : 1;
        this.onDispatchCommand({ widthByLayer: true, baseStrokeWidth: undefined, strokeWidth: layerWidth }, entity);
      } else if (val === 'CUSTOM') {
        const num = parseFloat(widthInput ? widthInput.value : 1.0) || 1.0;
        this.onDispatchCommand({ widthByLayer: false, baseStrokeWidth: num, strokeWidth: num }, entity);
      } else {
        const num = parseFloat(val);
        this.onDispatchCommand({ widthByLayer: false, baseStrokeWidth: num, strokeWidth: num }, entity);
      }
    });

    PropertyControls.attachScrubInput(widthContainer, widthInput, (widthVal) => {
      this.onDispatchCommand({
        widthByLayer: false,
        baseStrokeWidth: widthVal,
        strokeWidth: widthVal
      }, entity);
    }, {
      min: 0, max: null, step: 0.1, precision: 1,
      formatValue: (v) => this.formatWidthDisplay(v),
      onLiveChange: (val) => {
        propManager.previewEntitiesProperty(entity, { strokeWidth: val });
        const isPreset = this.isPresetWidth(val);
        if (widthInput) {
          widthInput.classList.toggle('text-zinc-500', isPreset);
          widthInput.classList.toggle('text-white', !isPreset);
        }
      }
    });
  }
}