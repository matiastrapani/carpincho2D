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
    if (this.utils?.propertyManager && !this.utils.propertyManager.defaultSettings) {
      this.utils.propertyManager.defaultSettings = {
        color: 'BYLAYER',
        strokeWidth: 'BYLAYER'
      };
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
      if (badge) badge.textContent = entity.type || 'Elemento';
      this._renderSingleEntityProperties(fieldsContainer, entity);
    } else {
      if (badge) badge.textContent = `${count} seleccionados`;
      this._renderMultipleEntitiesProperties(fieldsContainer, count);
    }
  }


  /**
   * Convierte de forma segura cualquier color de Paper.js o String a Hexadecimal (#rrggbb)
   */
  _getHexColor(color) {
    if (!color) return '#ffffff';
    
    // Si ya es un String (ej: "#008800")
    if (typeof color === 'string') {
      if (color.startsWith('#')) {
        // Expandir hex corto (#fff -> #ffffff) si hiciera falta para el <input type="color">
        if (color.length === 4) {
          return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
        }
        return color;
      }
      return '#ffffff';
    }

    // Si es un objeto paper.Color de Paper.js
    if (typeof color.toCSS === 'function') {
      return color.toCSS(true); // 'true' fuerza el formato Hexadecimal (#rrggbb) en Paper.js
    }

    return '#ffffff';
  }

  // --- ESTADO: SIN SELECCIÓN (AJUSTES POR DEFECTO PARA NUEVAS ENTIDADES) ---
  _renderEmptyState(container) {
    this._ensureDefaultSettings();

    const layerManager = this.utils?.layerManager;
    const propManager = this.utils?.propertyManager;
    const layers = layerManager ? Array.from(layerManager.layers.values()) : [];
    const activeLayer = layerManager ? layerManager.getActiveLayer() : null;
    const activeLayerId = activeLayer ? activeLayer.id : '0';

    const defaults = propManager ? propManager.defaultSettings : { color: 'BYLAYER', strokeWidth: 'BYLAYER' };
    const isColorByLayer = defaults.color === 'BYLAYER';
    const isWidthByLayer = defaults.strokeWidth === 'BYLAYER';

    const activeColor = activeLayer ? activeLayer.color : '#ffffff';
    const activeWidth = (activeLayer && activeLayer.strokeWidth !== undefined) ? activeLayer.strokeWidth : 0;
    const activeWidthLabel = activeWidth === 0 ? '-' : `${activeWidth} px`;

    const standardWidths = [0, 1, 1.5, 2, 3];
    const isCustomDefWidth = !isWidthByLayer && typeof defaults.strokeWidth === 'number' && !standardWidths.includes(defaults.strokeWidth);

    let defWidthOptionsHTML = `
      <option value="BYLAYER" ${isWidthByLayer ? 'selected' : ''}>Por Capa (${activeWidthLabel})</option>
      <option value="0" ${!isWidthByLayer && defaults.strokeWidth === 0 ? 'selected' : ''}>-</option>
      <option value="1" ${!isWidthByLayer && defaults.strokeWidth === 1 ? 'selected' : ''}>1.0</option>
      <option value="1.5" ${!isWidthByLayer && defaults.strokeWidth === 1.5 ? 'selected' : ''}>1.5</option>
      <option value="2" ${!isWidthByLayer && defaults.strokeWidth === 2 ? 'selected' : ''}>2.0</option>
      <option value="3" ${!isWidthByLayer && defaults.strokeWidth === 3 ? 'selected' : ''}>3.0</option>
    `;

    if (isCustomDefWidth) {
      defWidthOptionsHTML += `<option value="${defaults.strokeWidth}" selected>${defaults.strokeWidth} (Personalizado)</option>`;
    }

    container.innerHTML = `
      <div class="border-b border-[#2a2a32] pb-2.5">
        <span class="text-[10px] font-bold uppercase text-zinc-500 tracking-wider mb-2 block">Creación (Por Defecto)</span>

        <!-- Capa Activa -->
        <div class="grid grid-cols-2 gap-2 items-center mb-1.5">
          <span class="text-[11px] text-zinc-400">Capa</span>
          <div class="relative flex items-center">
            <select id="defLayerSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none border border-[#2a2a32] cursor-pointer appearance-none pr-5">
              ${layers
                .map(
                  (l) => `<option value="${l.id}" ${String(l.id) === String(activeLayerId) ? 'selected' : ''}>${l.name}</option>`
                )
                .join('')}
            </select>
            <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
          </div>
        </div>

        <!-- Color de Trazo -->
        <div class="grid grid-cols-2 gap-2 items-center mb-1.5">
          <span class="text-[11px] text-zinc-400">Color</span>
          <div class="relative flex items-center">
            <select id="defColorSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none border border-[#2a2a32] cursor-pointer appearance-none pr-5">
              <option value="BYLAYER" ${isColorByLayer ? 'selected' : ''}>Por Capa</option>
              <option value="CUSTOM" ${!isColorByLayer ? 'selected' : ''}>Personalizado</option>
            </select>
            <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
          </div>
        </div>

        <!-- Color Picker (Si es personalizado) -->
        <div id="defColorPickerRow" class="grid grid-cols-2 gap-2 items-center mb-1.5 ${isColorByLayer ? 'hidden' : ''}">
          <span class="text-[10px] text-zinc-500 pl-2">└ Valor</span>
          <div class="flex items-center gap-1.5">
            <input type="color" id="defColorPicker" value="${!isColorByLayer ? defaults.color : activeColor}" 
              class="w-6 h-6 rounded bg-transparent cursor-pointer border border-[#2a2a32] p-0">
            <span id="defColorHexLabel" class="text-[10px] font-mono text-zinc-400 uppercase">${!isColorByLayer ? defaults.color : activeColor}</span>
          </div>
        </div>

        <!-- Selector de Grosor en Estado Sin Selección -->
        <div class="grid grid-cols-2 gap-2 items-center">
          <span class="text-[11px] text-zinc-400">Grosor</span>
          <div class="relative flex items-center">
            <select id="defWidthSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none border border-[#2a2a32] cursor-pointer appearance-none pr-5">
              ${defWidthOptionsHTML}
            </select>
            <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
          </div>
        </div>
      </div>
    `;

    this._attachInputIsolation(container);
    this._attachDefaultSettingsEvents(container);
  }

  // --- ESTADO: UNA SOLA ENTIDAD SELECCIONADA ---
  _renderSingleEntityProperties(container, entity) {
    const layerManager = this.utils?.layerManager;
    const propManager = this.utils?.propertyManager;
    const layers = layerManager ? Array.from(layerManager.layers.values()) : [];
    const currentLayerId = entity.data?.layerId || '0';

    // Priorizar la propiedad booleana colorByLayer / widthByLayer
    const isColorByLayer = entity.data?.colorByLayer !== undefined 
      ? entity.data.colorByLayer === true 
      : !entity.data?.origStrokeColor;

    const isWidthByLayer = entity.data?.widthByLayer !== undefined 
      ? entity.data.widthByLayer === true 
      : entity.data?.baseStrokeWidth === undefined;

    const hexColor = this._getHexColor(propManager ? propManager.getResolvedColor(entity) : entity.strokeColor);

    // REEMPLAZAR EN _renderSingleEntityProperties:
// (Desde la constante hexColor hasta el HTML del selector de grosor)

    const baseWidth = entity.data?.baseStrokeWidth;
    const standardWidths = [0, 1, 1.5, 2, 3];
    const isCustomWidth = !isWidthByLayer && baseWidth !== undefined && !standardWidths.includes(baseWidth);

    let widthOptionsHTML = `
      <option value="BYLAYER" ${isWidthByLayer ? 'selected' : ''}>Por Capa</option>
      <option value="0" ${!isWidthByLayer && baseWidth === 0 ? 'selected' : ''}>-</option>
      <option value="1" ${!isWidthByLayer && baseWidth === 1 ? 'selected' : ''}>1.0</option>
      <option value="1.5" ${!isWidthByLayer && baseWidth === 1.5 ? 'selected' : ''}>1.5</option>
      <option value="2" ${!isWidthByLayer && baseWidth === 2 ? 'selected' : ''}>2.0</option>
      <option value="3" ${!isWidthByLayer && baseWidth === 3 ? 'selected' : ''}>3.0</option>
    `;

    if (isCustomWidth) {
      widthOptionsHTML += `<option value="${baseWidth}" selected>${baseWidth} (Personalizado)</option>`;
    }

    container.innerHTML = `
      <!-- Sección General -->
      <div class="border-b border-[#2a2a32] pb-2.5">
        <span class="text-[10px] font-bold uppercase text-zinc-500 tracking-wider mb-2 block">General</span>

        <!-- Capa -->
        <div class="grid grid-cols-2 gap-2 items-center mb-1.5">
          <span class="text-[11px] text-zinc-400">Capa</span>
          <div class="relative flex items-center">
            <select id="propLayerSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none border border-[#2a2a32] cursor-pointer appearance-none pr-5">
              ${layers
                .map(
                  (l) => `<option value="${l.id}" ${String(l.id) === String(currentLayerId) ? 'selected' : ''}>${l.name}</option>`
                )
                .join('')}
            </select>
            <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
          </div>
        </div>

        <!-- Color -->
        <div class="grid grid-cols-2 gap-2 items-center mb-1.5">
          <span class="text-[11px] text-zinc-400">Color</span>
          <div class="relative flex items-center">
            <select id="propColorModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none border border-[#2a2a32] cursor-pointer appearance-none pr-5">
              <option value="BYLAYER" ${isColorByLayer ? 'selected' : ''}>Por Capa</option>
              <option value="CUSTOM" ${!isColorByLayer ? 'selected' : ''}>Personalizado</option>
            </select>
            <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
          </div>
        </div>

        <!-- Color Picker -->
        <div id="propColorPickerRow" class="grid grid-cols-2 gap-2 items-center mb-1.5 ${isColorByLayer ? 'hidden' : ''}">
          <span class="text-[10px] text-zinc-500 pl-2">└ Valor</span>
          <div class="flex items-center gap-1.5">
            <input type="color" id="propColorPicker" value="${hexColor}" 
              class="w-6 h-6 rounded bg-transparent cursor-pointer border border-[#2a2a32] p-0">
            <span id="propColorHexLabel" class="text-[10px] font-mono text-zinc-400 uppercase">${hexColor}</span>
          </div>
        </div>

        <!-- Selector de Grosor en Entidad Individual -->
        <div class="grid grid-cols-2 gap-2 items-center">
          <span class="text-[11px] text-zinc-400">Grosor</span>
          <div class="relative flex items-center">
            <select id="propWidthSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none border border-[#2a2a32] cursor-pointer appearance-none pr-5">
              ${widthOptionsHTML}
            </select>
            <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
          </div>
        </div>
      </div>

      <!-- Sección Geometría Básica -->
      <div>
        <span class="text-[10px] font-bold uppercase text-zinc-500 tracking-wider mb-2 block">Geometría</span>
        ${this._getGeometryFieldsHTML(entity)}
      </div>
    `;

    this._attachInputIsolation(container);
    this._attachSingleEntityEvents(entity);
  }

  // --- ESTADO: VARIAS ENTIDADES SELECCIONADAS ---
  _renderMultipleEntitiesProperties(container, count) {
    const layerManager = this.utils?.layerManager;
    const layers = layerManager ? Array.from(layerManager.layers.values()) : [];

    container.innerHTML = `
      <div class="border-b border-[#2a2a32] pb-2.5">
        <span class="text-[10px] font-bold uppercase text-zinc-500 tracking-wider mb-2 block">Cambios Masivos</span>

        <!-- Cambiar Capa a todas -->
        <div class="grid grid-cols-2 gap-2 items-center mb-1.5">
          <span class="text-[11px] text-zinc-400">Mover a Capa</span>
          <div class="relative flex items-center">
            <select id="propBatchLayerSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none border border-[#2a2a32] cursor-pointer appearance-none pr-5">
              <option value="" disabled selected>-- Seleccionar --</option>
              ${layers.map((l) => `<option value="${l.id}">${l.name}</option>`).join('')}
            </select>
            <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
          </div>
        </div>
      </div>
    `;

    this._attachInputIsolation(container);

    const batchLayerSelect = container.querySelector('#propBatchLayerSelect');
    batchLayerSelect?.addEventListener('change', (e) => {
      const targetLayerId = e.target.value;
      if (!targetLayerId) return;

      this.selectedEntities.forEach((ent) => {
        if (!ent.data) ent.data = {};
        ent.data.layerId = targetLayerId;
      });

      if (this.utils?.updateEntitiesStroke) this.utils.updateEntitiesStroke();
      if (window.paper?.view) window.paper.view.update();
    });
  }

  // Muestra propiedades específicas del tipo de entidad (ej. Radio en círculos, largo en líneas)
  _getGeometryFieldsHTML(entity) {
    if (entity.type === 'Circle' || entity.geometryType === 'circle') {
      const radius = entity.radius ? entity.radius.toFixed(2) : '0.00';
      return `
        <div class="grid grid-cols-2 gap-2 items-center mb-1">
          <span class="text-[11px] text-zinc-400">Radio</span>
          <span class="text-[11px] font-mono text-zinc-300 bg-[#17171c] px-2 py-1 rounded border border-[#2a2a32]">${radius}</span>
        </div>
      `;
    }

    if (entity.length !== undefined) {
      return `
        <div class="grid grid-cols-2 gap-2 items-center mb-1">
          <span class="text-[11px] text-zinc-400">Longitud</span>
          <span class="text-[11px] font-mono text-zinc-300 bg-[#17171c] px-2 py-1 rounded border border-[#2a2a32]">${entity.length.toFixed(2)}</span>
        </div>
      `;
    }

    return `<span class="text-[11px] text-zinc-600 italic">Sin parámetros adicionales</span>`;
  }

  // Asigna aislamiento de eventos para evitar que la edición borre o active hotkeys de canvas
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

  // --- EVENTOS PARA UNA SOLA ENTIDAD ---
  _attachSingleEntityEvents(entity) {
    const layerSelect = document.getElementById('propLayerSelect');
    const colorModeSelect = document.getElementById('propColorModeSelect');
    const colorPickerRow = document.getElementById('propColorPickerRow');
    const colorPicker = document.getElementById('propColorPicker');
    const colorHexLabel = document.getElementById('propColorHexLabel');
    const widthSelect = document.getElementById('propWidthSelect');

    // 1. CAMBIO DE CAPA
    layerSelect?.addEventListener('change', (e) => {
      const oldLayerId = entity.data?.layerId || '0';
      const newLayerId = e.target.value;
      if (String(oldLayerId) === String(newLayerId)) return;

      const oldState = { layerId: oldLayerId };
      const newState = { layerId: newLayerId };

      if (this.utils?.service?.executeCommand && window.UpdateEntityPropertyCommand) {
        const cmd = new UpdateEntityPropertyCommand(this.utils.service, entity, oldState, newState, this.utils);
        this.utils.service.executeCommand(cmd);
      } else {
        if (!entity.data) entity.data = {};
        entity.data.layerId = newLayerId;
        if (this.utils?.updateEntitiesStroke) this.utils.updateEntitiesStroke();
        if (window.paper?.view) window.paper.view.update();
      }
    });

    // 2. CAMBIO DE MODO DE COLOR (BYLAYER vs PERSONALIZADO)
    colorModeSelect?.addEventListener('change', (e) => {
      const oldColorByLayer = entity.data?.colorByLayer;
      const oldOrigColor = entity.data?.origStrokeColor;
      const isByLayer = e.target.value === 'BYLAYER';

      const oldState = { colorByLayer: oldColorByLayer, origStrokeColor: oldOrigColor };
      const newState = isByLayer
        ? { colorByLayer: true, origStrokeColor: undefined }
        : { colorByLayer: false, origStrokeColor: colorPicker ? colorPicker.value : '#00e5ff' };

      if (this.utils?.service?.executeCommand && window.UpdateEntityPropertyCommand) {
        const cmd = new UpdateEntityPropertyCommand(this.utils.service, entity, oldState, newState, this.utils);
        this.utils.service.executeCommand(cmd);
      } else {
        if (!entity.data) entity.data = {};
        if (isByLayer) {
          entity.data.colorByLayer = true;
          delete entity.data.origStrokeColor;
        } else {
          entity.data.colorByLayer = false;
          entity.data.origStrokeColor = colorPicker ? colorPicker.value : '#00e5ff';
        }
        if (this.utils?.updateEntitiesStroke) this.utils.updateEntitiesStroke();
        if (window.paper?.view) window.paper.view.update();
        this.refresh();
      }
    });

    // 3. CAMBIO DE COLOR INDIVIDUAL (COLOR PICKER)
    let initialColorState = null;

    const captureInitialState = () => {
      if (!initialColorState) {
        initialColorState = {
          colorByLayer: entity.data?.colorByLayer,
          origStrokeColor: entity.data?.origStrokeColor
        };
      }
    };

    colorPicker?.addEventListener('focus', captureInitialState);
    colorPicker?.addEventListener('mousedown', captureInitialState);

    // Previsualización en tiempo real mientras se arrastra el selector de color
    colorPicker?.addEventListener('input', (e) => {
      if (!entity.data) entity.data = {};
      const val = e.target.value;
      entity.data.colorByLayer = false;
      entity.data.origStrokeColor = val;
      if (colorHexLabel) colorHexLabel.textContent = val.toUpperCase();
      if (this.utils?.updateEntitiesStroke) this.utils.updateEntitiesStroke();
      if (window.paper?.view) window.paper.view.update();
    });

    // Registro definitivo en el Historial al soltar o confirmar la selección
    colorPicker?.addEventListener('change', (e) => {
      const val = e.target.value;
      const oldState = initialColorState || { colorByLayer: true, origStrokeColor: undefined };
      const newState = { colorByLayer: false, origStrokeColor: val };

      initialColorState = null; // Reiniciar estado capturado

      if (this.utils?.service?.executeCommand && window.UpdateEntityPropertyCommand) {
        const cmd = new UpdateEntityPropertyCommand(this.utils.service, entity, oldState, newState, this.utils);
        this.utils.service.executeCommand(cmd);
      }
    });

    // 4. CAMBIO DE GROSOR
    widthSelect?.addEventListener('change', (e) => {
      const oldWidthByLayer = entity.data?.widthByLayer;
      const oldBaseWidth = entity.data?.baseStrokeWidth;
      const val = e.target.value;
      const isByLayer = val === 'BYLAYER';

      const oldState = { widthByLayer: oldWidthByLayer, baseStrokeWidth: oldBaseWidth };
      const newState = isByLayer
        ? { widthByLayer: true, baseStrokeWidth: undefined }
        : { widthByLayer: false, baseStrokeWidth: parseFloat(val) };

      if (this.utils?.service?.executeCommand && window.UpdateEntityPropertyCommand) {
        const cmd = new UpdateEntityPropertyCommand(this.utils.service, entity, oldState, newState, this.utils);
        this.utils.service.executeCommand(cmd);
      } else {
        if (!entity.data) entity.data = {};
        if (isByLayer) {
          entity.data.widthByLayer = true;
          delete entity.data.baseStrokeWidth;
        } else {
          entity.data.widthByLayer = false;
          entity.data.baseStrokeWidth = parseFloat(val);
        }
        if (this.utils?.updateEntitiesStroke) this.utils.updateEntitiesStroke();
        if (window.paper?.view) window.paper.view.update();
      }
    });
  }

  // --- EVENTOS DE AJUSTES POR DEFECTO ---
  _attachDefaultSettingsEvents(container) {
    const layerSelect = container.querySelector('#defLayerSelect');
    const colorSelect = container.querySelector('#defColorSelect');
    const colorPickerRow = container.querySelector('#defColorPickerRow');
    const colorPicker = container.querySelector('#defColorPicker');
    const colorHexLabel = container.querySelector('#defColorHexLabel');
    const widthSelect = container.querySelector('#defWidthSelect');

    const defaults = this.utils?.propertyManager?.defaultSettings;

    const syncActiveDrawing = () => {
      if (this.utils?.activePath && this.utils?.propertyManager) {
        this.utils.propertyManager.applyDefaultSettings(this.utils.activePath);
        if (this.utils.updateEntitiesStroke) this.utils.updateEntitiesStroke();
        if (window.paper?.view) window.paper.view.update();
      }
    };

    layerSelect?.addEventListener('change', (e) => {
      const newLayerId = e.target.value;
      if (this.utils?.layerManager) {
        this.utils.layerManager.setActiveLayer(newLayerId);
        if (window.layerPanelUI) window.layerPanelUI.refresh();
      }
      syncActiveDrawing();
      this.refresh();
    });

    colorSelect?.addEventListener('change', (e) => {
      if (!defaults) return;
      if (e.target.value === 'BYLAYER') {
        defaults.color = 'BYLAYER';
        colorPickerRow?.classList.add('hidden');
      } else {
        const pickerVal = colorPicker ? colorPicker.value : '#00e5ff';
        defaults.color = pickerVal;
        colorPickerRow?.classList.remove('hidden');
      }
      syncActiveDrawing();
    });

    colorPicker?.addEventListener('input', (e) => {
      if (!defaults) return;
      const val = e.target.value;
      defaults.color = val;
      if (colorHexLabel) colorHexLabel.textContent = val.toUpperCase();
      syncActiveDrawing();
    });

    widthSelect?.addEventListener('change', (e) => {
      if (!defaults) return;
      const val = e.target.value;
      defaults.strokeWidth = val === 'BYLAYER' ? 'BYLAYER' : parseFloat(val);
      syncActiveDrawing();
    });
  }
}

window.PropertyPanelUI = PropertyPanelUI;