/**
 * PropertyPanelUI.js - Panel de Propiedades para entidades del lienzo CAD.
 * Maneja estados de selección (Sin selección, Selección única y Selección múltiple) con Undo/Redo.
 */

import { UpdateEntityPropertyCommand } from '../services/commands/cadCommands.js';

export class PropertyPanelUI {
  constructor(cadUtils, containerId = 'propertyPanelContainer') {
    this.utils = cadUtils;
    this.container = document.getElementById(containerId);
    this.selectedEntities = [];

    this.init();
  }

  init() {
    if (!this.container) return;
    this.renderShell();
    this.refresh();
  }

  _ensureDefaultSettings() {
    if (this.utils?.propertyManager) {
      if (!this.utils.propertyManager.defaultSettings) {
        this.utils.propertyManager.defaultSettings = {};
      }
      const defaults = this.utils.propertyManager.defaultSettings;
      if (defaults.color === undefined) defaults.color = 'BYLAYER';
      if (defaults.strokeWidth === undefined) defaults.strokeWidth = 'BYLAYER';
      if (defaults.opacity === undefined) defaults.opacity = 'BYLAYER';
    }
  }

  setSelectedEntities(entities = []) {
    this.selectedEntities = entities;
    this.refresh();
  }

  renderShell() {
    this.container.innerHTML = `
      <div class="flex flex-col h-full w-full select-none text-zinc-300 font-sans overflow-hidden">
        <div class="flex items-center justify-between mb-2 shrink-0 px-1 py-0.5">
          <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Propiedades</span>
          <span id="propSelectionBadge" class="text-[10px] text-zinc-500 font-mono">Sin selección</span>
        </div>

        <div id="propertyFieldsContainer" class="flex-1 overflow-y-auto custom-scrollbar space-y-3 min-h-0 bg-transparent pr-0.5">
        </div>
      </div>
    `;
  }

  refresh() {
    const fieldsContainer = document.getElementById('propertyFieldsContainer');
    const badge = document.getElementById('propSelectionBadge');
    if (!fieldsContainer) return;

    fieldsContainer.innerHTML = '';
    const count = this.selectedEntities.length;

    if (count === 0) {
      if (badge) badge.textContent = 'Sin selección';
      this._renderEmptyState(fieldsContainer);
    } else if (count === 1) {
      const entity = this.selectedEntities[0];
      const rawName = entity.name || entity.data?.name || entity.type || 'Elemento';
      
      // Se elimina el número al final del nombre para el badge superior derecho (ej. "Línea 1" -> "Línea")
      const badgeText = rawName.replace(/\s+\d+$/, '');
      if (badge) badge.textContent = badgeText;
      
      this._renderSingleEntityProperties(fieldsContainer, entity);
    } else {
      if (badge) badge.textContent = `${count} seleccionados`;
      this._renderMultipleEntitiesProperties(fieldsContainer, count);
    }
    this._convertSelectsToCustom(fieldsContainer);
  }

  _getHexColor(color) {
    if (!color) return '#ffffff';
    if (typeof color === 'string') {
      if (color.startsWith('#')) {
        if (color.length === 4) {
          return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
        }
        return color;
      }
      return '#ffffff';
    }
    if (typeof color.toCSS === 'function') {
      return color.toCSS(true);
    }
    return '#ffffff';
  }

  _formatWidthDisplay(val) {
    if (val === 0 || val === '0' || val === '-') return '-';
    const num = parseFloat(val);
    return isNaN(num) ? '-' : num.toFixed(1);
  }

  // Helper para determinar si un valor de grosor pertenece a la lista de presets
  _isPresetWidth(val) {
    if (val === '-' || val === 0 || val === '0') return true;
    const num = parseFloat(val);
    return [0, 1, 1.5, 2, 3].includes(num);
  }

  _getWidthTextColorClass(isByLayer, val) {
    if (isByLayer || this._isPresetWidth(val)) {
      return 'text-zinc-500';
    }
    return 'text-white';
  }

  _getOpacityTextColorClass(isByLayer) {
    return isByLayer ? 'text-zinc-500' : 'text-white';
  }

  // --- ESTADO: SIN SELECCIÓN (MODO CREACIÓN) ---
  _renderEmptyState(container) {
    this._ensureDefaultSettings();

    const layerManager = this.utils?.layerManager;
    const propManager = this.utils?.propertyManager;
    const layers = layerManager ? Array.from(layerManager.layers.values()) : [];
    const activeLayer = layerManager ? layerManager.getActiveLayer() : null;
    const activeLayerId = activeLayer ? activeLayer.id : '0';

    const defaults = propManager ? propManager.defaultSettings : { color: 'BYLAYER', strokeWidth: 'BYLAYER', opacity: 'BYLAYER' };
    const isColorByLayer = defaults.color === 'BYLAYER';
    const isOpacityByLayer = defaults.opacity === 'BYLAYER';
    const isWidthByLayer = defaults.strokeWidth === 'BYLAYER';

    const activeColor = activeLayer ? activeLayer.color : '#ffffff';
    const resolvedColor = isColorByLayer ? activeColor : defaults.color;
    const hexColor = this._getHexColor(resolvedColor);

    const activeOpacity = (activeLayer && activeLayer.opacity !== undefined) ? activeLayer.opacity : 1;
    const resolvedOpacity = isOpacityByLayer ? activeOpacity : defaults.opacity;
    const defOpacityPct = Math.round((typeof resolvedOpacity === 'number' ? resolvedOpacity : 1) * 100);

    const activeWidth = (activeLayer && activeLayer.strokeWidth !== undefined) ? activeLayer.strokeWidth : 1;
    const resolvedWidth = isWidthByLayer ? activeWidth : defaults.strokeWidth;
    const defWidthFormatted = this._formatWidthDisplay(resolvedWidth);

    const opacityColorClass = this._getOpacityTextColorClass(isOpacityByLayer);
    const widthColorClass = this._getWidthTextColorClass(isWidthByLayer, resolvedWidth);

    container.innerHTML = `
      <div class="pb-2.5">

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
            <input type="color" id="defColorPicker" value="${hexColor}" class="w-[22px] h-[22px] rounded cursor-pointer border-none outline-none p-0 shrink-0 bg-transparent" title="Cambiar color">
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
            <div id="defOpacityContainer" class="flex items-center justify-end w-[50px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o arrastra">
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
            <div id="defWidthContainer" class="flex items-center justify-end w-[50px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o arrastra">
              <input type="text" id="defWidthInput" value="${defWidthFormatted}" class="w-9 bg-transparent text-right outline-none border-0 ${widthColorClass} text-[11px] font-sans tabular-nums p-0 cursor-ew-resize focus:cursor-text">
            </div>
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="defWidthModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                <option value="BYLAYER" ${isWidthByLayer ? 'selected' : ''}>Por Capa</option>
                <option value="0" ${!isWidthByLayer && resolvedWidth === 0 ? 'selected' : ''}>-</option>
                <option value="1" ${!isWidthByLayer && resolvedWidth === 1 ? 'selected' : ''}>1.0</option>
                <option value="1.5" ${!isWidthByLayer && resolvedWidth === 1.5 ? 'selected' : ''}>1.5</option>
                <option value="2" ${!isWidthByLayer && resolvedWidth === 2 ? 'selected' : ''}>2.0</option>
                <option value="3" ${!isWidthByLayer && resolvedWidth === 3 ? 'selected' : ''}>3.0</option>
                <option value="CUSTOM" ${!isWidthByLayer && ![0, 1, 1.5, 2, 3].includes(resolvedWidth) ? 'selected' : ''}>Personalizado</option>
              </select>
              <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
            </div>
          </div>
        </div>
      </div>
    `;

    this._attachInputIsolation(container);
    this._attachDefaultSettingsEvents(container);
  }

  // --- ESTADO: ENTIDAD ÚNICA ---
  _renderSingleEntityProperties(container, entity) {
    const layerManager = this.utils?.layerManager;
    const layers = layerManager ? Array.from(layerManager.layers.values()) : [];
    const currentLayerId = entity.data?.layerId || '0';
    const entityName = entity.name || entity.data?.name || '';

    // Detección de entidad tipo Imagen (Raster)
    const isRaster = entity instanceof paper.Raster || entity.className === 'Raster' || entity.data?.isImageEntity;

    const isColorByLayer = entity.data?.colorByLayer !== undefined 
      ? entity.data.colorByLayer === true 
      : !entity.data?.origStrokeColor;

    const isOpacityByLayer = entity.data?.opacityByLayer !== undefined
      ? entity.data.opacityByLayer === true
      : entity.data?.origOpacity === undefined;

    const isWidthByLayer = entity.data?.widthByLayer !== undefined 
      ? entity.data.widthByLayer === true 
      : entity.data?.baseStrokeWidth === undefined;

    const activeLayer = this._getLayer(currentLayerId);

    const layerColor = activeLayer ? activeLayer.color : '#ffffff';
    const resolvedColor = isColorByLayer ? layerColor : (entity.data?.origStrokeColor || entity.strokeColor);
    const hexColor = this._getHexColor(resolvedColor);

    const layerOpacity = (activeLayer && activeLayer.opacity !== undefined) ? activeLayer.opacity : 1;
    const resolvedOpacity = isOpacityByLayer ? layerOpacity : (entity.data?.origOpacity !== undefined ? entity.data.origOpacity : (entity.opacity !== undefined ? entity.opacity : 1));
    const opacityPct = Math.round(resolvedOpacity * 100);

    const layerWidth = (activeLayer && activeLayer.strokeWidth !== undefined) ? activeLayer.strokeWidth : 1;
    const resolvedWidth = isWidthByLayer ? layerWidth : (entity.data?.baseStrokeWidth !== undefined ? entity.data.baseStrokeWidth : (entity.strokeWidth !== undefined ? entity.strokeWidth : 1));
    const formattedWidth = this._formatWidthDisplay(resolvedWidth);

    const opacityColorClass = this._getOpacityTextColorClass(isOpacityByLayer);
    const widthColorClass = this._getWidthTextColorClass(isWidthByLayer, resolvedWidth);

    container.innerHTML = `
      <div class="pb-2.5">
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
            <input type="color" id="propColorPicker" value="${hexColor}" class="w-[22px] h-[22px] rounded cursor-pointer border-none outline-none p-0 shrink-0 bg-transparent" title="Cambiar color">
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
            <div id="propOpacityContainer" class="flex items-center justify-end w-[62px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o arrastra">
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
              <div id="propWidthContainer" class="flex items-center justify-end w-[62px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o arrastra">
                <input type="text" id="propWidthInput" value="${formattedWidth}" class="w-9 bg-transparent text-right outline-none border-0 ${widthColorClass} text-[11px] font-sans tabular-nums p-0 cursor-ew-resize focus:cursor-text">
              </div>
              <div class="relative flex-1 min-w-0 flex items-center">
                <select id="propWidthModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                  <option value="BYLAYER" ${isWidthByLayer ? 'selected' : ''}>Por Capa</option>
                  <option value="0" ${!isWidthByLayer && resolvedWidth === 0 ? 'selected' : ''}>-</option>
                  <option value="1" ${!isWidthByLayer && resolvedWidth === 1 ? 'selected' : ''}>1.0</option>
                  <option value="1.5" ${!isWidthByLayer && resolvedWidth === 1.5 ? 'selected' : ''}>1.5</option>
                  <option value="2" ${!isWidthByLayer && resolvedWidth === 2 ? 'selected' : ''}>2.0</option>
                  <option value="3" ${!isWidthByLayer && resolvedWidth === 3 ? 'selected' : ''}>3.0</option>
                  <option value="CUSTOM" ${!isWidthByLayer && ![0, 1, 1.5, 2, 3].includes(resolvedWidth) ? 'selected' : ''}>Personalizado</option>
                </select>
                <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    this._attachInputIsolation(container);
    this._attachSingleEntityEvents(container, entity);
  }

  // --- ESTADO: VARIAS ENTIDADES SELECCIONADAS ---
  _renderMultipleEntitiesProperties(container, count) {
    const layerManager = this.utils?.layerManager;
    const layers = layerManager ? Array.from(layerManager.layers.values()) : [];

    container.innerHTML = `
      <div class="pb-2.5">
        <!-- Nombre (Múltiple) -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full mt-2">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Nombre</span>
          <input type="text" id="propBatchNameInput" placeholder="-- Varios --" class="w-full bg-[#17171c] hover:bg-[#27272a] focus:bg-[#09090b] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none border-0 flex-1 min-w-0 transition-colors">
        </div>

        <!-- Capa en lote -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Capa</span>
          <div class="relative flex items-center flex-1 min-w-0">
            <select id="propBatchLayerSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
              <option value="" disabled selected>-- Seleccionar --</option>
              ${layers.map((l) => `<option value="${l.id}">${l.name}</option>`).join('')}
            </select>
            <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
          </div>
        </div>

        <!-- Opacidad (Múltiple) -->
        <div class="flex items-center justify-between gap-2 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Opacidad</span>
          <div class="flex items-center flex-1 min-w-0 gap-1.5">
            <div id="propBatchOpacityContainer" class="flex items-center justify-end w-[62px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o arrastra">
              <input type="number" id="propBatchOpacityInput" min="0" max="100" value="100" class="w-9 bg-transparent text-right outline-none border-0 text-white text-[11px] font-sans tabular-nums p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ew-resize focus:cursor-text">
              <span class="text-[11px] text-white font-sans tabular-nums ml-0.5 pointer-events-none">%</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this._attachInputIsolation(container);

    const batchNameInput = container.querySelector('#propBatchNameInput');
    batchNameInput?.addEventListener('change', (e) => {
      const newName = e.target.value.trim();
      if (!newName) return;
      this._dispatchCommand({ name: newName });
    });

    const batchLayerSelect = container.querySelector('#propBatchLayerSelect');
    batchLayerSelect?.addEventListener('change', (e) => {
      const targetLayerId = e.target.value;
      if (!targetLayerId) return;
      this._dispatchCommand({ layerId: targetLayerId });
    });

    const batchOpacityContainer = container.querySelector('#propBatchOpacityContainer');
    const batchOpacityInput = container.querySelector('#propBatchOpacityInput');

    this._attachScrubInput(batchOpacityContainer, batchOpacityInput, (pctVal) => {
      const val = pctVal / 100;
      this._dispatchCommand({ opacityByLayer: false, origOpacity: val, opacity: val });
    }, { min: 0, max: 100, step: 1, precision: 0 });
  }

  // --- DESPACHADOR DE COMANDOS UNDO/REDO PARA SELECCIÓN ---
  _dispatchCommand(newStateObj, entityTarget = null) {
    const cadService = this.service || window.cadService;
    const targets = entityTarget ? [entityTarget] : this.selectedEntities;
    if (targets.length === 0) return;

    // Sincronizar baseOpacity en newStateObj si se modifica la opacidad
    if (newStateObj.opacity !== undefined && newStateObj.baseOpacity === undefined) {
      newStateObj.baseOpacity = newStateObj.opacity;
    }

    const oldStateObj = {};
    Object.keys(newStateObj).forEach(key => {
      oldStateObj[key] = targets[0]?.data?.[key] !== undefined ? targets[0].data[key] : targets[0]?.[key];
    });

    if (UpdateEntityPropertyCommand && cadService) {
      const cmd = new UpdateEntityPropertyCommand(cadService, targets, oldStateObj, newStateObj, this.utils);
      cadService.executeCommand(cmd);
    } else {
      targets.forEach(ent => {
        if (!ent.data) ent.data = {};
        Object.assign(ent.data, newStateObj);
        if (newStateObj.name !== undefined) ent.name = newStateObj.name;
        if (newStateObj.opacity !== undefined) {
          ent.opacity = newStateObj.opacity;
          ent.data.baseOpacity = newStateObj.opacity; // <-- Mantiene sincronizado baseOpacity
        }
      });
      this._requestCanvasUpdate();
      this.refresh();
    }
  }

  // --- SCRUB INPUT INTERACTIVO ---
  _attachScrubInput(containerEl, inputEl, onChange, { min = 0, max = null, step = 1, precision = 0, isWidth = false, onLiveChange = null } = {}) {
    if (!containerEl || !inputEl) return;

    let isDragging = false;
    let startX = 0;
    let startVal = 0;
    let hasDragged = false;

    const parseInputValue = (v) => {
      if (v === '-' || v === '0') return 0;
      const parsed = parseFloat(v);
      return isNaN(parsed) ? 0 : parsed;
    };

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      if (document.activeElement === inputEl) return;

      isDragging = true;
      hasDragged = false;
      startX = e.clientX;
      startVal = parseInputValue(inputEl.value);

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;

      if (Math.abs(deltaX) > 2) {
        hasDragged = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';

        const sensitivity = precision > 0 ? 0.05 : 0.7;
        let newVal = startVal + deltaX * sensitivity;
        if (min !== null) newVal = Math.max(min, newVal);
        if (max !== null) newVal = Math.min(max, newVal);

        if (precision > 0) {
          newVal = parseFloat(newVal.toFixed(precision));
        } else {
          newVal = Math.round(newVal);
        }

        const formatted = isWidth ? this._formatWidthDisplay(newVal) : (precision > 0 ? newVal.toFixed(precision) : String(newVal));

        if (inputEl.value !== formatted) {
          inputEl.value = formatted;
          if (typeof onLiveChange === 'function') onLiveChange(newVal);
        }
      }
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        if (hasDragged) {
          const finalVal = parseInputValue(inputEl.value);
          onChange(finalVal);
        } else {
          inputEl.focus();
          if (inputEl.select) inputEl.select();
        }
      }
    };

    containerEl.addEventListener('mousedown', onMouseDown);

    inputEl.addEventListener('change', () => {
      let val = parseInputValue(inputEl.value);
      if (min !== null) val = Math.max(min, val);
      if (max !== null) val = Math.min(max, val);
      inputEl.value = isWidth ? this._formatWidthDisplay(val) : (precision > 0 ? val.toFixed(precision) : String(val));
      onChange(val);
    });
  }

  _attachInputIsolation(container) {
    container.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('focus', () => {
        if (el.tagName === 'INPUT' && el.type === 'text') el.select();
      });
      el.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') el.blur();
      });
      el.addEventListener('keyup', (e) => e.stopPropagation());
    });
  }

  // --- EVENTOS ENTIDAD ÚNICA ---
  _attachSingleEntityEvents(container, entity) {
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

    const activeLayer = this._getLayer(entity.data?.layerId || '0');

    // Nombre
    nameInput?.addEventListener('change', (e) => {
      this._dispatchCommand({ name: e.target.value.trim() }, entity);
    });

    // Capa
    layerSelect?.addEventListener('change', (e) => {
      this._dispatchCommand({ layerId: e.target.value }, entity);
    });

    // Modo Color
    colorModeSelect?.addEventListener('change', (e) => {
      const isByLayer = e.target.value === 'BYLAYER';
      this._dispatchCommand({
        colorByLayer: isByLayer,
        origStrokeColor: isByLayer ? undefined : (colorPicker ? colorPicker.value : '#00e5ff')
      }, entity);
    });

    // Color Picker
    colorPicker?.addEventListener('change', (e) => {
      this._dispatchCommand({
        colorByLayer: false,
        origStrokeColor: e.target.value
      }, entity);
    });

    // Modo Opacidad
    opacityModeSelect?.addEventListener('change', (e) => {
      const isByLayer = e.target.value === 'BYLAYER';
      const pctVal = parseFloat(opacityInput ? opacityInput.value : 100);
      const val = pctVal / 100;
      this._dispatchCommand({
        opacityByLayer: isByLayer,
        origOpacity: isByLayer ? undefined : val,
        baseOpacity: isByLayer ? undefined : val, // <-- Sincroniza baseOpacity para imágenes
        opacity: isByLayer ? (activeLayer?.opacity ?? 1) : val
      }, entity);
    });

    // Scrub Opacidad
    this._attachScrubInput(opacityContainer, opacityInput, (pctVal) => {
      const opacityVal = pctVal / 100;
      this._dispatchCommand({
        opacityByLayer: false,
        origOpacity: opacityVal,
        baseOpacity: opacityVal, // <-- Sincroniza baseOpacity para imágenes
        opacity: opacityVal
      }, entity);
    }, {
      min: 0, max: 100, step: 1, precision: 0,
      onLiveChange: (val) => {
        if (!entity.data) entity.data = {};
        entity.data.opacityByLayer = false;
        entity.data.baseOpacity = val / 100; // Refresco en vivo para el lienzo
        entity.opacity = val / 100;
        if (opacityInput) {
          opacityInput.classList.remove('text-zinc-500');
          opacityInput.classList.add('text-white');
        }
        this._requestCanvasUpdate();
      }
    });

    // Modo Grosor
    widthModeSelect?.addEventListener('change', (e) => {
      const val = e.target.value;

      if (val === 'BYLAYER') {
        this._dispatchCommand({ widthByLayer: true, baseStrokeWidth: undefined }, entity);
      } else if (val === 'CUSTOM') {
        const num = parseFloat(widthInput ? widthInput.value : 1.0) || 1.0;
        this._dispatchCommand({ widthByLayer: false, baseStrokeWidth: num }, entity);
      } else {
        const num = parseFloat(val);
        this._dispatchCommand({ widthByLayer: false, baseStrokeWidth: num }, entity);
      }
    });

    // Scrub Grosor
    this._attachScrubInput(widthContainer, widthInput, (widthVal) => {
      this._dispatchCommand({
        widthByLayer: false,
        baseStrokeWidth: widthVal
      }, entity);
    }, {
      min: 0, max: null, step: 0.1, precision: 1, isWidth: true,
      onLiveChange: (val) => {
        if (!entity.data) entity.data = {};
        entity.data.widthByLayer = false;
        
        const isPreset = this._isPresetWidth(val);
        if (widthInput) {
          widthInput.classList.toggle('text-zinc-500', isPreset);
          widthInput.classList.toggle('text-white', !isPreset);
        }
        this._requestCanvasUpdate();
      }
    });
  }

  // --- EVENTOS: MODO CREACIÓN (SIN SELECCIÓN) ---
  _attachDefaultSettingsEvents(container) {
    const layerSelect = container.querySelector('#defLayerSelect');
    const colorSelect = container.querySelector('#defColorSelect');
    const colorPicker = container.querySelector('#defColorPicker');
    
    const opacityModeSelect = container.querySelector('#defOpacityModeSelect');
    const opacityContainer = container.querySelector('#defOpacityContainer');
    const opacityInput = container.querySelector('#defOpacityInput');
    
    const widthModeSelect = container.querySelector('#defWidthModeSelect');
    const widthContainer = container.querySelector('#defWidthContainer');
    const widthInput = container.querySelector('#defWidthInput');

    const defaults = this.utils?.propertyManager?.defaultSettings;
    const layerManager = this.utils?.layerManager;

    const syncActiveDrawing = () => {
      if (this.utils?.activePath && this.utils?.propertyManager) {
        this.utils.propertyManager.applyDefaultSettings(this.utils.activePath);
        if (this.utils.updateEntitiesStroke) this.utils.updateEntitiesStroke();
        if (window.paper?.view) window.paper.view.update();
      }
    };

    // Capa por defecto
    layerSelect?.addEventListener('change', (e) => {
      const newLayerId = e.target.value;
      if (layerManager) {
        layerManager.setActiveLayer(newLayerId);
        if (window.layerPanelUI) window.layerPanelUI.refresh();
      }

      const activeLayer = layerManager ? layerManager.getActiveLayer() : null;

      if (defaults && defaults.color === 'BYLAYER' && colorPicker) {
        colorPicker.value = this._getHexColor(activeLayer ? activeLayer.color : '#ffffff');
      }

      if (defaults && defaults.opacity === 'BYLAYER' && opacityInput) {
        const layerOpacity = activeLayer?.opacity !== undefined ? activeLayer.opacity : 1;
        opacityInput.value = Math.round(layerOpacity * 100);
      }

      if (defaults && defaults.strokeWidth === 'BYLAYER' && widthInput) {
        const layerWidth = activeLayer?.strokeWidth !== undefined ? activeLayer.strokeWidth : 1;
        widthInput.value = this._formatWidthDisplay(layerWidth);
      }

      syncActiveDrawing();
    });

    // Modo Color
    colorSelect?.addEventListener('change', (e) => {
      if (!defaults) return;
      defaults.color = e.target.value === 'BYLAYER' ? 'BYLAYER' : (colorPicker ? colorPicker.value : '#00e5ff');
      syncActiveDrawing();
    });

    // Picker Color
    colorPicker?.addEventListener('change', (e) => {
      if (!defaults) return;
      defaults.color = e.target.value;
      this._updateSelectValue(colorSelect, 'CUSTOM');
      syncActiveDrawing();
    });

    // Modo Opacidad
    opacityModeSelect?.addEventListener('change', (e) => {
      if (!defaults) return;
      const isByLayer = e.target.value === 'BYLAYER';
      defaults.opacity = isByLayer ? 'BYLAYER' : (parseFloat(opacityInput ? opacityInput.value : 100) / 100);

      if (opacityInput) {
        const opacityColorClass = this._getOpacityTextColorClass(isByLayer);
        opacityInput.className = `w-9 bg-transparent text-right outline-none border-0 ${opacityColorClass} text-[11px] font-sans tabular-nums p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ew-resize focus:cursor-text`;
      }
      syncActiveDrawing();
    });

    // Scrub Opacidad
    this._attachScrubInput(opacityContainer, opacityInput, (pctVal) => {
      if (!defaults) return;
      defaults.opacity = pctVal / 100;
      this._updateSelectValue(opacityModeSelect, 'CUSTOM');
      
      if (opacityInput) {
        opacityInput.classList.remove('text-zinc-500');
        opacityInput.classList.add('text-white');
      }
      syncActiveDrawing();
    }, { min: 0, max: 100, step: 1, precision: 0 });

    // Modo Grosor
    widthModeSelect?.addEventListener('change', (e) => {
      if (!defaults) return;
      const val = e.target.value;
      const isByLayer = val === 'BYLAYER';

      if (isByLayer) {
        defaults.strokeWidth = 'BYLAYER';
      } else if (val === 'CUSTOM') {
        defaults.strokeWidth = parseFloat(widthInput ? widthInput.value : 1.0) || 1.0;
      } else {
        defaults.strokeWidth = parseFloat(val);
        if (widthInput) widthInput.value = this._formatWidthDisplay(defaults.strokeWidth);
      }

      if (widthInput) {
        const isPreset = this._isPresetWidth(val);
        const colorClass = (isByLayer || isPreset) ? 'text-zinc-500' : 'text-white';
        widthInput.className = `w-9 bg-transparent text-right outline-none border-0 ${colorClass} text-[11px] font-sans tabular-nums p-0 cursor-ew-resize focus:cursor-text`;
      }
      syncActiveDrawing();
    });

    // Scrub Grosor
    this._attachScrubInput(widthContainer, widthInput, (widthVal) => {
      if (!defaults) return;
      defaults.strokeWidth = widthVal;

      const isPreset = this._isPresetWidth(widthVal);
      const targetSelectValue = isPreset ? (widthVal === 0 ? '0' : String(widthVal)) : 'CUSTOM';
      this._updateSelectValue(widthModeSelect, targetSelectValue);

      if (widthInput) {
        widthInput.classList.toggle('text-zinc-500', isPreset);
        widthInput.classList.toggle('text-white', !isPreset);
      }
      syncActiveDrawing();
    }, { min: 0, max: null, step: 0.1, precision: 1, isWidth: true });
  }

  // Helper para sincronizar visualmente selects personalizados
  _updateSelectValue(selectEl, value) {
    if (!selectEl) return;
    selectEl.value = value;
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  _getLayer(layerId) {
    const lm = this.utils?.layerManager;
    if (!lm) return null;
    if (typeof lm.getLayer === 'function') return lm.getLayer(layerId);
    if (lm.layers && typeof lm.layers.get === 'function') return lm.layers.get(String(layerId));
    if (lm.layers && typeof lm.layers === 'object') return lm.layers[layerId];
    return null;
  }

  _requestCanvasUpdate() {
    if (this.utils?.updateEntitiesStroke) {
      this.utils.updateEntitiesStroke();
    }
    if (window.paper?.view) {
      window.paper.view.update();
    }
  }

  _convertSelectsToCustom(container) {
    container.querySelectorAll('select').forEach((select) => {
      if (select.dataset.customized) return;
      select.dataset.customized = 'true';
      select.style.display = 'none';

      const originalIcon = select.parentNode ? select.parentNode.querySelector('i.fa-chevron-down') : null;
      if (originalIcon) originalIcon.style.display = 'none';

      const wrapper = document.createElement('div');
      wrapper.className = 'custom-select-wrapper flex-1 min-w-0';

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'w-full flex items-center justify-between bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2.5 py-1 rounded border-none cursor-pointer outline-none';

      const dropdown = document.createElement('div');
      dropdown.className = 'cad-custom-dropdown hidden bg-[#17171c] rounded-b shadow-2xl max-h-48 overflow-y-auto py-1 border border-[#27272a] border-t-0';

      const syncTrigger = () => {
        const opt = select.options[select.selectedIndex];
        trigger.innerHTML = `<span class="truncate pr-1 text-left">${opt ? opt.text : ''}</span><i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 shrink-0"></i>`;
      };

      const updatePosition = () => {
        const rect = trigger.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = `${rect.bottom}px`;
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.width = `${rect.width}px`;
        dropdown.style.zIndex = '99999';
      };

      const renderOptions = () => {
        dropdown.innerHTML = '';
        Array.from(select.options).forEach((opt) => {
          const item = document.createElement('div');
          const active = opt.selected;
          item.className = `px-2.5 py-1.5 text-[11px] cursor-pointer ${
            active ? 'font-bold text-white bg-[#27272a]' : 'font-normal text-zinc-400 hover:text-white hover:bg-[#222226]'
          }`;
          item.textContent = opt.text;

          item.addEventListener('click', (e) => {
            e.stopPropagation();
            select.value = opt.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            dropdown.classList.add('hidden');
            syncTrigger();
          });
          dropdown.appendChild(item);
        });
      };

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !dropdown.classList.contains('hidden');
        document.querySelectorAll('.cad-custom-dropdown').forEach(d => d.classList.add('hidden'));

        if (!isOpen) {
          renderOptions();
          updatePosition();
          dropdown.classList.remove('hidden');
          dropdown._updatePos = updatePosition;
        }
      });

      select.addEventListener('change', syncTrigger);

      wrapper.appendChild(trigger);
      document.body.appendChild(dropdown);
      select.parentNode.insertBefore(wrapper, select.nextSibling);
      syncTrigger();
    });

    if (!window._cadDropdownCloseAttached) {
      window._cadDropdownCloseAttached = true;
      
      const syncPositions = () => {
        document.querySelectorAll('.cad-custom-dropdown:not(.hidden)').forEach(d => {
          if (d._updatePos) d._updatePos();
        });
      };

      const closeAll = () => document.querySelectorAll('.cad-custom-dropdown').forEach(d => d.classList.add('hidden'));

      document.addEventListener('click', closeAll);
      window.addEventListener('scroll', syncPositions, true);
      window.addEventListener('resize', syncPositions);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAll();
      });
    }
  }
}