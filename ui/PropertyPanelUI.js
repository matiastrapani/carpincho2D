/**
 * PropertyPanelUI.js - Panel de Propiedades compacto para entidades del lienzo CAD.
 * Maneja estados de selección (Sin selección, Selección única y Selección múltiple).
 */

class PropertyPanelUI {
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

  // --- INICIALIZACIÓN DE VALORES POR DEFECTO ---
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

  /**
   * Actualiza el panel según las entidades actualmente seleccionadas en el lienzo.
   * @param {Array} entities - Lista de entidades seleccionadas.
   */
  setSelectedEntities(entities = []) {
    this.selectedEntities = entities;
    this.refresh();
  }

  renderShell() {
    this.container.innerHTML = `
      <div class="flex flex-col h-full w-full select-none text-zinc-300 font-sans overflow-hidden">
        <!-- Encabezado del Panel -->
        <div class="flex items-center justify-between mb-2 shrink-0 px-1 py-0.5">
          <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Propiedades</span>
          <span id="propSelectionBadge" class="text-[10px] text-zinc-500 font-mono">Sin selección</span>
        </div>

        <!-- Creador Dinámico de Propiedades -->
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
      const entityName = entity.name || entity.data?.name || entity.type || 'Elemento';
      if (badge) badge.textContent = entityName;
      this._renderSingleEntityProperties(fieldsContainer, entity);
    } else {
      if (badge) badge.textContent = `${count} seleccionados`;
      this._renderMultipleEntitiesProperties(fieldsContainer, count);
    }
    this._convertSelectsToCustom(fieldsContainer);
  }

  /**
   * Convierte de forma segura cualquier color de Paper.js o String a Hexadecimal (#rrggbb)
   */
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
    const defWidthFormatted = (typeof resolvedWidth === 'number' ? resolvedWidth : 1).toFixed(1);

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

        <!-- Color de Trazo -->
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
            <div id="defOpacityContainer" class="flex items-center justify-end w-[65px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o mantén presionado y arrastra">
              <input type="number" id="defOpacityInput" min="0" max="100" value="${defOpacityPct}" class="w-7 bg-transparent text-right outline-none border-0 text-zinc-200 text-[11px] font-sans tabular-nums p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ew-resize focus:cursor-text">
              <span class="text-[11px] text-zinc-400 font-sans tabular-nums ml-0.5 pointer-events-none">%</span>
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
            <div id="defWidthContainer" class="flex items-center justify-end w-[65px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o mantén presionado y arrastra">
              <input type="number" id="defWidthInput" min="0" step="0.1" value="${defWidthFormatted}" class="w-9 bg-transparent text-right outline-none border-0 text-zinc-200 text-[11px] font-sans tabular-nums p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ew-resize focus:cursor-text">
            </div>
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="defWidthModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                <option value="BYLAYER" ${isWidthByLayer ? 'selected' : ''}>Por Capa</option>
                <option value="CUSTOM" ${!isWidthByLayer ? 'selected' : ''}>Personalizado</option>
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
    const formattedWidth = resolvedWidth.toFixed(1);

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
            <div id="propOpacityContainer" class="flex items-center justify-end w-[65px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o mantén presionado y arrastra">
              <input type="number" id="propOpacityInput" min="0" max="100" value="${opacityPct}" class="w-7 bg-transparent text-right outline-none border-0 text-zinc-200 text-[11px] font-sans tabular-nums p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ew-resize focus:cursor-text">
              <span class="text-[11px] text-zinc-400 font-sans tabular-nums ml-0.5 pointer-events-none">%</span>
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

        <!-- Grosor -->
        <div class="flex items-center justify-between gap-2 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Grosor</span>
          <div class="flex items-center flex-1 min-w-0 gap-1.5">
            <div id="propWidthContainer" class="flex items-center justify-end w-[65px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o mantén presionado y arrastra">
              <input type="number" id="propWidthInput" min="0" step="0.1" value="${formattedWidth}" class="w-9 bg-transparent text-right outline-none border-0 text-zinc-200 text-[11px] font-sans tabular-nums p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ew-resize focus:cursor-text">
            </div>
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="propWidthModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                <option value="BYLAYER" ${isWidthByLayer ? 'selected' : ''}>Por Capa</option>
                <option value="CUSTOM" ${!isWidthByLayer ? 'selected' : ''}>Personalizado</option>
              </select>
              <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
            </div>
          </div>
        </div>
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

        <!-- Cambiar Capa a todas -->
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
            <div id="propBatchOpacityContainer" class="flex items-center justify-end w-[65px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o mantén presionado y arrastra">
              <input type="number" id="propBatchOpacityInput" min="0" max="100" value="100" class="w-7 bg-transparent text-right outline-none border-0 text-zinc-200 text-[11px] font-sans tabular-nums p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ew-resize focus:cursor-text">
              <span class="text-[11px] text-zinc-400 font-sans tabular-nums ml-0.5 pointer-events-none">%</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this._attachInputIsolation(container);

    // Evento Nombre en Lote
    const batchNameInput = container.querySelector('#propBatchNameInput');
    batchNameInput?.addEventListener('change', (e) => {
      const newName = e.target.value.trim();
      if (!newName) return;
      this.selectedEntities.forEach((ent) => {
        ent.name = newName;
        if (!ent.data) ent.data = {};
        ent.data.name = newName;
      });
    });

    // Evento Capa en Lote
    const batchLayerSelect = container.querySelector('#propBatchLayerSelect');
    batchLayerSelect?.addEventListener('change', (e) => {
      const targetLayerId = e.target.value;
      if (!targetLayerId) return;

      this.selectedEntities.forEach((ent) => {
        if (!ent.data) ent.data = {};
        ent.data.layerId = targetLayerId;
      });

      this._requestCanvasUpdate();
    });

    // Evento Opacidad en Lote
    const batchOpacityContainer = container.querySelector('#propBatchOpacityContainer');
    const batchOpacityInput = container.querySelector('#propBatchOpacityInput');

    this._attachScrubInput(batchOpacityContainer, batchOpacityInput, (pctVal) => {
      const val = pctVal / 100;
      this.selectedEntities.forEach((ent) => {
        ent.opacity = val;
        if (!ent.data) ent.data = {};
        ent.data.origOpacity = val;
        ent.data.opacityByLayer = false;
      });
      this._requestCanvasUpdate();
    }, { min: 0, max: 100, step: 1, precision: 0 });
  }

  // --- HELPER COMPONENT: SCRUB INPUT INTERACTIVO GENERALIZADO ---
  _attachScrubInput(containerEl, inputEl, onChange, { min = 0, max = null, step = 1, precision = 0 } = {}) {
    if (!containerEl || !inputEl) return;

    let isDragging = false;
    let startX = 0;
    let startVal = 0;
    let hasDragged = false;

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      if (document.activeElement === inputEl) return;

      isDragging = true;
      hasDragged = false;
      startX = e.clientX;
      startVal = parseFloat(inputEl.value) || 0;

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

        const formatted = precision > 0 ? newVal.toFixed(precision) : String(newVal);

        if (inputEl.value !== formatted) {
          inputEl.value = formatted;
          onChange(newVal);
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

        if (!hasDragged) {
          inputEl.focus();
          inputEl.select();
        }
      }
    };

    containerEl.addEventListener('mousedown', onMouseDown);

    const handleDirectInput = () => {
      let val = parseFloat(inputEl.value);
      if (isNaN(val)) val = 0;
      if (min !== null) val = Math.max(min, val);
      if (max !== null) val = Math.min(max, val);
      onChange(val);
    };

    inputEl.addEventListener('input', handleDirectInput);
    inputEl.addEventListener('change', () => {
      let val = parseFloat(inputEl.value);
      if (isNaN(val)) val = 0;
      if (min !== null) val = Math.max(min, val);
      if (max !== null) val = Math.min(max, val);
      inputEl.value = precision > 0 ? val.toFixed(precision) : String(val);
      onChange(val);
    });
  }

  // Asigna aislamiento de eventos para evitar que la edición borre o active hotkeys de canvas
  _attachInputIsolation(container) {
    container.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('focus', () => {
        if (el.tagName === 'INPUT') el.select();
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

    // 0. CAMBIO DE NOMBRE
    nameInput?.addEventListener('change', (e) => {
      const newName = e.target.value.trim();
      entity.name = newName;
      if (!entity.data) entity.data = {};
      entity.data.name = newName;

      const badge = document.getElementById('propSelectionBadge');
      if (badge) badge.textContent = newName || entity.type || 'Elemento';
    });

    // 1. CAMBIO DE CAPA
    layerSelect?.addEventListener('change', (e) => {
      const newLayerId = e.target.value;
      if (!entity.data) entity.data = {};
      entity.data.layerId = newLayerId;

      this._requestCanvasUpdate();
      this.refresh();
    });

    // 2. MODO DE COLOR (Desplegable)
    colorModeSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (!entity.data) entity.data = {};

      if (val === 'BYLAYER') {
        entity.data.colorByLayer = true;
        delete entity.data.origStrokeColor;
      } else {
        entity.data.colorByLayer = false;
        entity.data.origStrokeColor = colorPicker ? colorPicker.value : '#00e5ff';
      }

      this._requestCanvasUpdate();
      this.refresh();
    });

    // 3. COLOR PICKER
    const handlePickerInput = () => {
      if (!entity.data) entity.data = {};
      const newColor = colorPicker.value;

      const wasByLayer = entity.data.colorByLayer !== false;
      entity.data.colorByLayer = false;
      entity.data.origStrokeColor = newColor;

      this._requestCanvasUpdate();

      if (wasByLayer) {
        this.refresh();
      }
    };

    colorPicker?.addEventListener('input', handlePickerInput);
    colorPicker?.addEventListener('change', handlePickerInput);

    // 4. OPACIDAD - MODO
    opacityModeSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (!entity.data) entity.data = {};

      if (val === 'BYLAYER') {
        entity.data.opacityByLayer = true;
        delete entity.data.origOpacity;
        const layerOpacity = activeLayer?.opacity !== undefined ? activeLayer.opacity : 1;
        entity.opacity = layerOpacity;
      } else {
        entity.data.opacityByLayer = false;
        const currentPct = parseFloat(opacityInput ? opacityInput.value : 100);
        entity.data.origOpacity = currentPct / 100;
        entity.opacity = entity.data.origOpacity;
      }

      this._requestCanvasUpdate();
      this.refresh();
    });

    // 4b. OPACIDAD - SCRUB INPUT
    this._attachScrubInput(opacityContainer, opacityInput, (pctVal) => {
      if (!entity.data) entity.data = {};
      const opacityVal = pctVal / 100;

      const wasByLayer = entity.data.opacityByLayer !== false;
      entity.data.opacityByLayer = false;
      entity.data.origOpacity = opacityVal;
      entity.opacity = opacityVal;

      this._requestCanvasUpdate();

      if (wasByLayer) {
        this.refresh();
      }
    }, { min: 0, max: 100, step: 1, precision: 0 });

    // 5. GROSOR - MODO
    widthModeSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (!entity.data) entity.data = {};

      if (val === 'BYLAYER') {
        entity.data.widthByLayer = true;
        delete entity.data.baseStrokeWidth;
      } else {
        entity.data.widthByLayer = false;
        entity.data.baseStrokeWidth = parseFloat(widthInput ? widthInput.value : 1.0);
      }

      this._requestCanvasUpdate();
      this.refresh();
    });

    // 5b. GROSOR - SCRUB INPUT
    this._attachScrubInput(widthContainer, widthInput, (widthVal) => {
      if (!entity.data) entity.data = {};

      const wasByLayer = entity.data.widthByLayer !== false;
      entity.data.widthByLayer = false;
      entity.data.baseStrokeWidth = widthVal;

      this._requestCanvasUpdate();

      if (wasByLayer) {
        this.refresh();
      }
    }, { min: 0, max: null, step: 0.1, precision: 1 });
  }

  // --- EVENTOS: CREACIÓN (POR DEFECTO) ---
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

    // 1. CAMBIO DE CAPA POR DEFECTO
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
        widthInput.value = layerWidth.toFixed(1);
      }

      syncActiveDrawing();
    });

    // 2. MODO DE COLOR POR DEFECTO
    colorSelect?.addEventListener('change', (e) => {
      if (!defaults) return;
      const val = e.target.value;

      if (val === 'BYLAYER') {
        defaults.color = 'BYLAYER';
        const activeLayer = layerManager ? layerManager.getActiveLayer() : null;
        if (colorPicker) colorPicker.value = this._getHexColor(activeLayer ? activeLayer.color : '#ffffff');
      } else {
        defaults.color = colorPicker ? colorPicker.value : '#00e5ff';
      }
      syncActiveDrawing();
    });

    // 3. COLOR PICKER POR DEFECTO
    const handleDefPickerInput = () => {
      if (!defaults) return;
      defaults.color = colorPicker.value;

      if (colorSelect && colorSelect.value !== 'CUSTOM') {
        colorSelect.value = 'CUSTOM';
        colorSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      syncActiveDrawing();
    };

    colorPicker?.addEventListener('input', handleDefPickerInput);
    colorPicker?.addEventListener('change', handleDefPickerInput);

    // 4. MODO DE OPACIDAD POR DEFECTO
    opacityModeSelect?.addEventListener('change', (e) => {
      if (!defaults) return;
      const val = e.target.value;

      if (val === 'BYLAYER') {
        defaults.opacity = 'BYLAYER';
        const activeLayer = layerManager ? layerManager.getActiveLayer() : null;
        const layerOpacity = activeLayer?.opacity !== undefined ? activeLayer.opacity : 1;
        if (opacityInput) opacityInput.value = Math.round(layerOpacity * 100);
      } else {
        const pct = parseFloat(opacityInput ? opacityInput.value : 100);
        defaults.opacity = pct / 100;
      }
      syncActiveDrawing();
    });

    // 4b. OPACIDAD POR DEFECTO (SCRUB INPUT)
    this._attachScrubInput(opacityContainer, opacityInput, (pctVal) => {
      if (!defaults) return;
      defaults.opacity = pctVal / 100;

      if (opacityModeSelect && opacityModeSelect.value !== 'CUSTOM') {
        opacityModeSelect.value = 'CUSTOM';
        opacityModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      syncActiveDrawing();
    }, { min: 0, max: 100, step: 1, precision: 0 });

    // 5. MODO DE GROSOR POR DEFECTO
    widthModeSelect?.addEventListener('change', (e) => {
      if (!defaults) return;
      const val = e.target.value;

      if (val === 'BYLAYER') {
        defaults.strokeWidth = 'BYLAYER';
        const activeLayer = layerManager ? layerManager.getActiveLayer() : null;
        const layerWidth = activeLayer?.strokeWidth !== undefined ? activeLayer.strokeWidth : 1;
        if (widthInput) widthInput.value = layerWidth.toFixed(1);
      } else {
        defaults.strokeWidth = parseFloat(widthInput ? widthInput.value : 1.0);
      }
      syncActiveDrawing();
    });

    // 5b. GROSOR POR DEFECTO (SCRUB INPUT)
    this._attachScrubInput(widthContainer, widthInput, (widthVal) => {
      if (!defaults) return;
      defaults.strokeWidth = widthVal;

      if (widthModeSelect && widthModeSelect.value !== 'CUSTOM') {
        widthModeSelect.value = 'CUSTOM';
        widthModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      syncActiveDrawing();
    }, { min: 0, max: null, step: 0.1, precision: 1 });
  }

  // --- HELPER SEGURO PARA OBTENER CAPAS ---
  _getLayer(layerId) {
    const lm = this.utils?.layerManager;
    if (!lm) return null;
    if (typeof lm.getLayer === 'function') return lm.getLayer(layerId);
    if (lm.layers && typeof lm.layers.get === 'function') return lm.layers.get(String(layerId));
    if (lm.layers && typeof lm.layers === 'object') return lm.layers[layerId];
    return null;
  }

  // --- FORZAR REFRESCO INMEDIATO DE CANVAS Y LIENZO ---
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

window.PropertyPanelUI = PropertyPanelUI;