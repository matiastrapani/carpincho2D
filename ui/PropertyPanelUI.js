/**
 * PropertyPanelUI.js - Panel de Propiedades para entidades del lienzo CAD.
 * Maneja estados de selección (Sin selección, Selección única y Selección múltiple) con Undo/Redo.
 */

import { ColorPickerPopover } from './components/ColorPickerPopover.js';
import { UpdateEntityPropertyCommand, UpdateDefaultSettingsCommand } from '../services/commands/cadCommands.js';
import { SetActiveLayerCommand } from '../services/commands/LayerCommands.js';

export class PropertyPanelUI {
  constructor(cadUtils, containerId = 'propertyPanelContainer') {
    this.utils = cadUtils;
    this.service = cadUtils?.service || window.cadService;
    this.container = document.getElementById(containerId);

    // Guardar referencias bound para poder desvincular los listeners globales
    this._onDropdownClose = this._handleDropdownClose.bind(this);
    this._onDropdownSync = this._handleDropdownSync.bind(this);
    this._onDropdownKeyDown = this._handleDropdownKeyDown.bind(this);
    this._dropdownCloseAttached = false;

    this.init();
  }    

  _handleDropdownClose() {
    document.querySelectorAll('.cad-custom-dropdown').forEach(d => d.classList.add('hidden'));
  }

  _handleDropdownSync() {
    document.querySelectorAll('.cad-custom-dropdown:not(.hidden)').forEach(d => {
      if (d._updatePos) d._updatePos();
    });
  }

  _handleDropdownKeyDown(e) {
    if (e.key === 'Escape') this._handleDropdownClose();
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

  get selectedEntities() {
    const service = this.service || this.utils?.service || window.cadService;
    const raw = service?.selectedEntities || [];
    const layerManager = this.utils?.layerManager;

    return raw.filter(ent => {
      if (!ent || !ent.parent || ent.visible === false) return false;
      if (!layerManager) return true;
      const layer = layerManager.layers?.get(String(ent.data?.layerId || '0'));
      return !layer || (layer.visible !== false && !layer.locked);
    });
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

  _openColorPickerForDefaults(triggerEl) {
    this._closeColorPicker();
    const defaults = this.utils?.propertyManager?.defaultSettings;
    if (!defaults) return;

    const layerManager = this.utils?.layerManager;
    const activeLayer = layerManager ? layerManager.getActiveLayer() : null;

    const isColorByLayer = defaults.color === 'BYLAYER';
    const resolvedColor = isColorByLayer ? (activeLayer ? activeLayer.color : '#ffffff') : defaults.color;
    const initialColor = this._getHexColor(resolvedColor);

    const isOpacityByLayer = defaults.opacity === 'BYLAYER';
    const resolvedOpacity = isOpacityByLayer ? (activeLayer?.opacity ?? 1) : defaults.opacity;
    const initialOpacity = typeof resolvedOpacity === 'number' ? resolvedOpacity : 1;

    const snapshot = {
      color: defaults.color,
      opacity: defaults.opacity
    };

    let hasChanges = false;

    this.activePopover = new ColorPickerPopover({
      color: initialColor,
      opacity: initialOpacity,
      anchorEl: triggerEl,
      presets: this._getPresetColors(),

      onChange: (hexColor, alphaValue, flags = {}) => {
        const colorChanged = flags.colorChanged === true;
        const opacityChanged = flags.opacityChanged === true;

        if (colorChanged) {
          defaults.color = hexColor;
          const freshTrigger = (triggerEl?.id ? document.getElementById(triggerEl.id) : null) || triggerEl;
          if (freshTrigger) freshTrigger.value = hexColor;
          const colorSelect = document.getElementById('defColorSelect');
          if (colorSelect) {
            this._updateSelectValueSilently(colorSelect, 'CUSTOM');
          }
        }

        if (opacityChanged) {
          defaults.opacity = alphaValue;
          const opacitySelect = document.getElementById('defOpacityModeSelect');
          const opacityInput = document.getElementById('defOpacityInput');
          const opacityContainer = document.getElementById('defOpacityContainer');

          if (opacitySelect) {
            this._updateSelectValueSilently(opacitySelect, 'CUSTOM');
          }
          if (opacityInput && document.activeElement !== opacityInput) {
            opacityInput.value = Math.round(alphaValue * 100);
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

        if (colorChanged || opacityChanged) {
          hasChanges = true;
          if (this.utils?.activePath && this.utils?.propertyManager) {
            this.utils.propertyManager.applyDefaultSettings(this.utils.activePath);
          }
          if (this.utils?.selectionRenderEngine?.updateEntitiesStroke) {
            this.utils.selectionRenderEngine.updateEntitiesStroke();
          }
          this._requestCanvasUpdate();
        }
      },

      onChangeEnd: (hexColor, alphaValue, flags = {}) => {
        const colorChanged = flags.colorChanged === true;
        const opacityChanged = flags.opacityChanged === true;

        const oldStateObj = {};
        const newStateObj = {};

        if (colorChanged) {
          newStateObj.color = hexColor;
          oldStateObj.color = snapshot.color;
        }

        if (opacityChanged) {
          newStateObj.opacity = alphaValue;
          oldStateObj.opacity = snapshot.opacity;
        }

        if (Object.keys(newStateObj).length > 0) {
          this._dispatchDefaultCommand(oldStateObj, newStateObj);
        }
      },

      onCancel: () => {
        if (!hasChanges) return;
        defaults.color = snapshot.color;
        defaults.opacity = snapshot.opacity;

        this.refresh();
        if (this.utils?.activePath && this.utils?.propertyManager) {
          this.utils.propertyManager.applyDefaultSettings(this.utils.activePath);
        }
        this._requestCanvasUpdate();
      },

      onClose: () => {
        this.activePopover = null;
      }
    });
  }

  _openColorPickerForEntity(entity, triggerEl) {
    this._closeColorPicker();

    const activeLayer = this._getLayer(entity?.data?.layerId || '0');
    const isColorByLayer = entity.data?.colorByLayer !== false;
    const isOpacityByLayer = entity.data?.opacityByLayer !== false;

    const layerColor = activeLayer ? activeLayer.color : '#ffffff';
    const resolvedColor = isColorByLayer ? layerColor : (entity.data?.origStrokeColor || entity.strokeColor);
    const initialColor = this._getHexColor(resolvedColor);

    const layerOpacity = (activeLayer && activeLayer.opacity !== undefined) ? activeLayer.opacity : 1;
    const resolvedOpacity = isOpacityByLayer ? layerOpacity : (entity.data?.origOpacity !== undefined ? entity.data.origOpacity : (entity.opacity !== undefined ? entity.opacity : 1));
    const initialOpacity = typeof resolvedOpacity === 'number' ? resolvedOpacity : 1;

    const initialColorByLayer = entity.data?.colorByLayer;
    const initialOrigStrokeColor = entity.data?.origStrokeColor;
    const initialStrokeColor = entity.strokeColor;
    const initialOpacityByLayer = entity.data?.opacityByLayer;
    const initialOrigOpacity = entity.data?.origOpacity;
    const initialBaseOpacity = entity.data?.baseOpacity;
    const initialOpacityVal = entity.opacity;

    let hasChanges = false;

    this.activePopover = new ColorPickerPopover({
      color: initialColor,
      opacity: initialOpacity,
      anchorEl: triggerEl,
      presets: this._getPresetColors(),

      onChange: (hexColor, alphaValue, flags = {}) => {
        if (!entity.data) entity.data = {};
        
        const colorChanged = flags.colorChanged === true;
        const opacityChanged = flags.opacityChanged === true;

        if (colorChanged) {
          entity.data.colorByLayer = false;
          entity.data.origStrokeColor = hexColor;
          entity.strokeColor = hexColor;

          const colorPickerIn = document.getElementById('propColorPicker');
          const colorModeSelect = document.getElementById('propColorModeSelect');
          if (colorPickerIn) colorPickerIn.value = hexColor;
          if (colorModeSelect) this._updateSelectValueSilently(colorModeSelect, 'CUSTOM');
        }

        if (opacityChanged) {
          entity.data.opacityByLayer = false;
          entity.data.origOpacity = alphaValue;
          entity.data.baseOpacity = alphaValue;
          entity.opacity = alphaValue;

          const opacityIn = document.getElementById('propOpacityInput');
          const opacityContainer = document.getElementById('propOpacityContainer');
          const opacityModeSelect = document.getElementById('propOpacityModeSelect');

          if (opacityModeSelect) this._updateSelectValueSilently(opacityModeSelect, 'CUSTOM');
          if (opacityIn && document.activeElement !== opacityIn) {
            opacityIn.value = Math.round(alphaValue * 100);
            opacityIn.classList.remove('text-zinc-500');
            opacityIn.classList.add('text-white');
          }
          if (opacityContainer) {
            const span = opacityContainer.querySelector('span');
            if (span) {
              span.classList.remove('text-zinc-500');
              span.classList.add('text-white');
            }
          }
        }

        if (colorChanged || opacityChanged) {
          hasChanges = true;
          if (this.utils?.selectionRenderEngine?.updateEntitiesStroke) {
            this.utils.selectionRenderEngine.updateEntitiesStroke();
          }
          this._requestCanvasUpdate();
        }
      },

      onChangeEnd: (hexColor, alphaValue, flags = {}) => {
        const colorChanged = flags.colorChanged === true;
        const opacityChanged = flags.opacityChanged === true;

        const newStateObj = {};
        const oldStateObj = {};

        if (colorChanged) {
          newStateObj.colorByLayer = false;
          newStateObj.origStrokeColor = hexColor;
          newStateObj.strokeColor = hexColor;

          oldStateObj.colorByLayer = initialColorByLayer;
          oldStateObj.origStrokeColor = initialOrigStrokeColor;
          oldStateObj.strokeColor = initialStrokeColor;
        }

        if (opacityChanged) {
          newStateObj.opacityByLayer = false;
          newStateObj.origOpacity = alphaValue;
          newStateObj.baseOpacity = alphaValue;
          newStateObj.opacity = alphaValue;

          oldStateObj.opacityByLayer = initialOpacityByLayer;
          oldStateObj.origOpacity = initialOrigOpacity;
          oldStateObj.baseOpacity = initialBaseOpacity;
          oldStateObj.opacity = initialOpacityVal;
        }

        if (Object.keys(newStateObj).length > 0) {
          this._dispatchCommand(newStateObj, entity, oldStateObj);
        }
      },

      onCancel: () => {
        if (!hasChanges) return;
        if (!entity.data) entity.data = {};

        entity.data.colorByLayer = initialColorByLayer;
        entity.data.origStrokeColor = initialOrigStrokeColor;
        entity.strokeColor = initialStrokeColor;

        entity.data.opacityByLayer = initialOpacityByLayer;
        entity.data.origOpacity = initialOrigOpacity;
        entity.data.baseOpacity = initialBaseOpacity;
        entity.opacity = initialOpacityVal;

        this.refresh();
        this._requestCanvasUpdate();
      },

      onClose: () => {
        this.activePopover = null;
      }
    });
  }

  _openColorPickerForBatch(triggerEl) {
    this._closeColorPicker();
    if (this.selectedEntities.length === 0) return;

    const propManager = this.utils?.propertyManager;
    const layerManager = this.utils?.layerManager;
    const activeLayer = layerManager ? layerManager.getActiveLayer() : null;
    const defaults = propManager?.defaultSettings;

    let sharedColor = null;
    let allSameColor = true;

    for (const ent of this.selectedEntities) {
      const isByLayer = ent.data?.colorByLayer !== false;
      const layerOfEnt = this._getLayer(ent.data?.layerId) || activeLayer;
      const entColor = isByLayer 
        ? (layerOfEnt ? layerOfEnt.color : '#ffffff')
        : (ent.data?.origStrokeColor || ent.strokeColor || '#ffffff');
      
      const hex = this._getHexColor(entColor);
      if (sharedColor === null) {
        sharedColor = hex;
      } else if (sharedColor.toLowerCase() !== hex.toLowerCase()) {
        allSameColor = false;
        break;
      }
    }

    // Color de creación por defecto (resuelto según Por Capa o Valor Personalizado)
    const creationColor = (defaults?.color === 'BYLAYER' || !defaults?.color)
      ? (activeLayer ? activeLayer.color : '#ffffff')
      : defaults.color;

    // Si los colores difieren (estado '?'), abre con el color por defecto de creación
    const initialColor = allSameColor && sharedColor ? sharedColor : this._getHexColor(creationColor);

    let sharedOpacity = null;
    let allSameOpacity = true;

    for (const ent of this.selectedEntities) {
      const entOp = ent.opacity !== undefined ? ent.opacity : (ent.data?.origOpacity !== undefined ? ent.data.origOpacity : 1);
      if (sharedOpacity === null) {
        sharedOpacity = entOp;
      } else if (Math.abs(sharedOpacity - entOp) > 0.01) {
        allSameOpacity = false;
        break;
      }
    }

    const initialOpacity = allSameOpacity && sharedOpacity !== null 
      ? sharedOpacity 
      : (defaults?.opacity !== 'BYLAYER' && typeof defaults?.opacity === 'number' ? defaults.opacity : (activeLayer?.opacity ?? 1));

    const initialStates = this.selectedEntities.map(ent => ({
      entity: ent,
      colorByLayer: ent.data?.colorByLayer,
      origStrokeColor: ent.data?.origStrokeColor,
      strokeColor: ent.strokeColor,
      opacityByLayer: ent.data?.opacityByLayer,
      origOpacity: ent.data?.origOpacity,
      baseOpacity: ent.data?.baseOpacity,
      opacity: ent.opacity
    }));

    let hasChanges = false;

    this.activePopover = new ColorPickerPopover({
      color: initialColor,
      opacity: initialOpacity,
      anchorEl: triggerEl,
      presets: this._getPresetColors(),

      onChange: (hexColor, alphaValue, flags = {}) => {
        const colorChanged = flags.colorChanged === true;
        const opacityChanged = flags.opacityChanged === true;

        this.selectedEntities.forEach(ent => {
          if (!ent.data) ent.data = {};
          if (colorChanged) {
            ent.data.colorByLayer = false;
            ent.data.origStrokeColor = hexColor;
            ent.strokeColor = hexColor;
          }
          if (opacityChanged) {
            ent.data.opacityByLayer = false;
            ent.data.origOpacity = alphaValue;
            ent.data.baseOpacity = alphaValue;
            ent.opacity = alphaValue;
          }
        });

        if (colorChanged) {
          const colorPickerIn = document.getElementById('propBatchColorPicker');
          const colorModeSelect = document.getElementById('propBatchColorModeSelect');
          if (colorPickerIn) {
            colorPickerIn.style.backgroundColor = hexColor;
            colorPickerIn.textContent = '';
          }
          if (colorModeSelect) this._updateSelectValueSilently(colorModeSelect, 'CUSTOM');
        }

        if (opacityChanged) {
          const opacityIn = document.getElementById('propBatchOpacityInput');
          if (opacityIn && document.activeElement !== opacityIn) {
            opacityIn.value = Math.round(alphaValue * 100);
          }
        }

        if (colorChanged || opacityChanged) {
          hasChanges = true;
          if (this.utils?.selectionRenderEngine?.updateEntitiesStroke) {
            this.utils.selectionRenderEngine.updateEntitiesStroke();
          }
          this._requestCanvasUpdate();
        }
      },

      onChangeEnd: (hexColor, alphaValue, flags = {}) => {
        const colorChanged = flags.colorChanged === true;
        const opacityChanged = flags.opacityChanged === true;

        const newStateObj = {};
        if (colorChanged) {
          newStateObj.colorByLayer = false;
          newStateObj.origStrokeColor = hexColor;
          newStateObj.strokeColor = hexColor;
        }
        if (opacityChanged) {
          newStateObj.opacityByLayer = false;
          newStateObj.origOpacity = alphaValue;
          newStateObj.baseOpacity = alphaValue;
          newStateObj.opacity = alphaValue;
        }

        if (Object.keys(newStateObj).length > 0) {
          const oldStates = initialStates.map(s => {
            const oldObj = {};
            if (colorChanged) {
              oldObj.colorByLayer = s.colorByLayer;
              oldObj.origStrokeColor = s.origStrokeColor;
              oldObj.strokeColor = s.strokeColor;
            }
            if (opacityChanged) {
              oldObj.opacityByLayer = s.opacityByLayer;
              oldObj.origOpacity = s.origOpacity;
              oldObj.baseOpacity = s.baseOpacity;
              oldObj.opacity = s.opacity;
            }
            return oldObj;
          });

          this._dispatchCommand(newStateObj, null, oldStates);
        }
      },

      onCancel: () => {
        if (!hasChanges) return;
        initialStates.forEach(s => {
          const ent = s.entity;
          if (!ent.data) ent.data = {};

          ent.data.colorByLayer = s.colorByLayer;
          ent.data.origStrokeColor = s.origStrokeColor;
          ent.strokeColor = s.strokeColor;

          ent.data.opacityByLayer = s.opacityByLayer;
          ent.data.origOpacity = s.origOpacity;
          ent.data.baseOpacity = s.baseOpacity;
          ent.opacity = s.opacity;
        });

        this.refresh();
        this._requestCanvasUpdate();
      },

      onClose: () => {
        this.activePopover = null;
      }
    });
  }

  _closeColorPicker() {
    if (this.activePopover && typeof this.activePopover.close === 'function') {
      this.activePopover.close();
      this.activePopover = null;
    }
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

  _getPresetColors() {
    return ColorPickerPopover.getPresets();
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
    const propManager = this.utils?.propertyManager;
    const layers = layerManager ? Array.from(layerManager.layers.values()) : [];
    const activeLayer = layerManager ? layerManager.getActiveLayer() : null;
    const defaults = propManager ? propManager.defaultSettings : null;

    // 1. Capas
    let sharedLayerId = null;
    let allSameLayer = true;

    // 2. Color
    let sharedColor = null;
    let allSameColor = true;
    let allColorByLayer = true;
    let allColorCustom = true;

    // 3. Opacidad
    let sharedOpacity = null;
    let allSameOpacity = true;
    let allOpacityByLayer = true;
    let allOpacityCustom = true;

    // 4. Grosor
    let sharedWidth = null;
    let allSameWidth = true;
    let allWidthByLayer = true;
    let allWidthCustom = true;

    for (const ent of this.selectedEntities) {
      // Evaluador de Capa
      const entLayerId = String(ent.data?.layerId ?? '0');
      if (sharedLayerId === null) {
        sharedLayerId = entLayerId;
      } else if (sharedLayerId !== entLayerId) {
        allSameLayer = false;
      }

      const layerOfEnt = this._getLayer(ent.data?.layerId) || activeLayer;

      // Evaluador de Color
      const colorByLayer = ent.data?.colorByLayer !== false;
      if (colorByLayer) allColorCustom = false;
      else allColorByLayer = false;

      const entColor = colorByLayer 
        ? (layerOfEnt ? layerOfEnt.color : '#ffffff')
        : (ent.data?.origStrokeColor || ent.strokeColor || '#ffffff');
      const hex = this._getHexColor(entColor);

      if (sharedColor === null) {
        sharedColor = hex;
      } else if (sharedColor.toLowerCase() !== hex.toLowerCase()) {
        allSameColor = false;
      }

      // Evaluador de Opacidad
      const opacityByLayer = ent.data?.opacityByLayer !== false;
      if (opacityByLayer) allOpacityCustom = false;
      else allOpacityByLayer = false;

      const entOp = opacityByLayer
        ? (layerOfEnt && layerOfEnt.opacity !== undefined ? layerOfEnt.opacity : 1)
        : (ent.data?.origOpacity !== undefined ? ent.data.origOpacity : (ent.opacity !== undefined ? ent.opacity : 1));

      if (sharedOpacity === null) {
        sharedOpacity = entOp;
      } else if (Math.abs(sharedOpacity - entOp) > 0.01) {
        allSameOpacity = false;
      }

      // Evaluador de Grosor
      const widthByLayer = ent.data?.widthByLayer !== false;
      if (widthByLayer) allWidthCustom = false;
      else allWidthByLayer = false;

      const entW = widthByLayer
        ? (layerOfEnt && layerOfEnt.strokeWidth !== undefined ? layerOfEnt.strokeWidth : 1)
        : (ent.data?.baseStrokeWidth !== undefined ? ent.data.baseStrokeWidth : (ent.strokeWidth !== undefined ? ent.strokeWidth : 1));

      if (sharedWidth === null) {
        sharedWidth = entW;
      } else if (Math.abs(sharedWidth - entW) > 0.001) {
        allSameWidth = false;
      }
    }

    // Determinación de Modos Válidos
    const isColorCustomMode = allColorCustom && allSameColor;
    const isColorMixedMode = !allColorByLayer && !isColorCustomMode;

    const isOpacityCustomMode = allOpacityCustom && allSameOpacity;
    const isOpacityMixedMode = !allOpacityByLayer && !isOpacityCustomMode;

    const isWidthCustomMode = allWidthCustom && allSameWidth;
    const isWidthMixedMode = !allWidthByLayer && !isWidthCustomMode;

    // Clases de Color y Peso (Bold cuando hay '?')
    const colorQuestionClass = allColorByLayer ? 'text-zinc-500' : 'text-white';

    const opacityColorClass = allOpacityByLayer ? 'text-zinc-500' : 'text-white';
    const opacityWeightClass = allSameOpacity ? 'font-normal' : 'font-bold';

    const widthColorClass = allWidthByLayer 
      ? 'text-zinc-500' 
      : (allSameWidth ? this._getWidthTextColorClass(false, sharedWidth) : 'text-white');
    const widthWeightClass = allSameWidth ? 'font-normal' : 'font-bold';

    // Valores visuales para controles
    const defaultFallbackColor = defaults?.color && defaults.color !== 'BYLAYER' 
      ? defaults.color 
      : (activeLayer ? activeLayer.color : '#ffffff');
    const batchHexColor = this._getHexColor(allSameColor && sharedColor ? sharedColor : defaultFallbackColor);

    const opacityDisplay = allSameOpacity && sharedOpacity !== null ? `${Math.round(sharedOpacity * 100)}` : '?';
    const widthDisplay = allSameWidth && sharedWidth !== null ? this._formatWidthDisplay(sharedWidth) : '?';

    container.innerHTML = `
      <div class="pb-2.5">
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
              ${!allSameLayer ? '<option value="" disabled selected>-- Varias --</option>' : ''}
              ${layers.map((l) => `<option value="${l.id}" ${allSameLayer && String(l.id) === String(sharedLayerId) ? 'selected' : ''}>${l.name}</option>`).join('')}
            </select>
            <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
          </div>
        </div>

        <!-- Color (Múltiple) -->
        <div class="flex items-center justify-between gap-2 mb-1.5 w-full">
          <span class="text-[11px] text-zinc-400 w-[55px] shrink-0">Color</span>
          <div class="flex items-center flex-1 min-w-0 gap-1.5">
            ${!allSameColor ? `
              <div id="propBatchColorPicker" class="w-[22px] h-[22px] rounded cursor-pointer bg-[#17171c] hover:bg-[#27272a] flex items-center justify-center ${colorQuestionClass} text-[11px] font-sans font-bold select-none shrink-0 transition-colors" title="Cambiar color en lote">
                ?
              </div>
            ` : `
              <input type="color" id="propBatchColorPicker" value="${batchHexColor}" class="w-[22px] h-[22px] rounded cursor-pointer border-none outline-none p-0 shrink-0 bg-transparent" title="Cambiar color en lote">
            `}
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="propBatchColorModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                ${isColorMixedMode ? '<option value="" disabled selected>-- Varios --</option>' : ''}
                <option value="BYLAYER" ${allColorByLayer ? 'selected' : ''}>Por Capa</option>
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
            <div id="propBatchOpacityContainer" class="flex items-center justify-end w-[62px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o arrastra">
              <input type="text" id="propBatchOpacityInput" value="${opacityDisplay}" class="w-9 bg-transparent text-right outline-none border-0 ${opacityColorClass} ${opacityWeightClass} text-[11px] font-sans tabular-nums p-0 cursor-ew-resize focus:cursor-text">
              ${allSameOpacity ? `<span class="text-[11px] ${opacityColorClass} font-sans tabular-nums ml-0.5 pointer-events-none">%</span>` : ''}
            </div>
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="propBatchOpacityModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                ${isOpacityMixedMode ? '<option value="" disabled selected>-- Varios --</option>' : ''}
                <option value="BYLAYER" ${allOpacityByLayer ? 'selected' : ''}>Por Capa</option>
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
            <div id="propBatchWidthContainer" class="flex items-center justify-end w-[62px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o arrastra">
              <input type="text" id="propBatchWidthInput" value="${widthDisplay}" class="w-9 bg-transparent text-right outline-none border-0 ${widthColorClass} ${widthWeightClass} text-[11px] font-sans tabular-nums p-0 cursor-ew-resize focus:cursor-text">
            </div>
            <div class="relative flex-1 min-w-0 flex items-center">
              <select id="propBatchWidthModeSelect" class="w-full bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2 py-1 rounded outline-none cursor-pointer appearance-none pr-5">
                ${isWidthMixedMode ? '<option value="" disabled selected>-- Varios --</option>' : ''}
                <option value="BYLAYER" ${allWidthByLayer ? 'selected' : ''}>Por Capa</option>
                <option value="0" ${isWidthCustomMode && sharedWidth === 0 ? 'selected' : ''}>-</option>
                <option value="1" ${isWidthCustomMode && sharedWidth === 1 ? 'selected' : ''}>1.0</option>
                <option value="1.5" ${isWidthCustomMode && sharedWidth === 1.5 ? 'selected' : ''}>1.5</option>
                <option value="2" ${isWidthCustomMode && sharedWidth === 2 ? 'selected' : ''}>2.0</option>
                <option value="3" ${isWidthCustomMode && sharedWidth === 3 ? 'selected' : ''}>3.0</option>
                <option value="CUSTOM" ${isWidthCustomMode && ![0, 1, 1.5, 2, 3].includes(sharedWidth) ? 'selected' : ''}>Personalizado</option>
              </select>
              <i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 absolute right-2 pointer-events-none"></i>
            </div>
          </div>
        </div>
      </div>
    `;

    this._attachInputIsolation(container);

    // Eventos Capa
    const batchLayerSelect = container.querySelector('#propBatchLayerSelect');
    batchLayerSelect?.addEventListener('change', (e) => {
      const targetLayerId = e.target.value;
      if (!targetLayerId) return;
      this._dispatchCommand({ layerId: targetLayerId });
    });

    // Eventos Modo Color
    const batchColorModeSelect = container.querySelector('#propBatchColorModeSelect');
    const batchColorPicker = container.querySelector('#propBatchColorPicker');

    batchColorModeSelect?.addEventListener('change', (e) => {
      const isByLayer = e.target.value === 'BYLAYER';
      this._dispatchCommand({
        colorByLayer: isByLayer,
        origStrokeColor: isByLayer ? undefined : (batchColorPicker && batchColorPicker.value ? batchColorPicker.value : '#00e5ff')
      });
    });

    batchColorPicker?.addEventListener('click', (e) => {
      e.preventDefault();
      this._openColorPickerForBatch(batchColorPicker);
    });

    // Eventos Modo Opacidad
    const batchOpacityModeSelect = container.querySelector('#propBatchOpacityModeSelect');
    const batchOpacityContainer = container.querySelector('#propBatchOpacityContainer');
    const batchOpacityInput = container.querySelector('#propBatchOpacityInput');

    batchOpacityModeSelect?.addEventListener('change', (e) => {
      const isByLayer = e.target.value === 'BYLAYER';
      const pctVal = parseFloat(batchOpacityInput ? batchOpacityInput.value : 100) || 100;
      const val = pctVal / 100;
      this._dispatchCommand({
        opacityByLayer: isByLayer,
        origOpacity: isByLayer ? undefined : val,
        baseOpacity: isByLayer ? undefined : val,
        opacity: isByLayer ? undefined : val
      });
    });

    // Scrub Opacidad en lote
    this._attachScrubInput(batchOpacityContainer, batchOpacityInput, (pctVal) => {
      const val = pctVal / 100;
      this._dispatchCommand({ opacityByLayer: false, origOpacity: val, baseOpacity: val, opacity: val });
    }, {
      min: 0, max: 100, step: 1, precision: 0,
      onLiveChange: (val) => {
        const opacityVal = val / 100;
        this.selectedEntities.forEach(ent => {
          if (!ent.data) ent.data = {};
          ent.data.opacityByLayer = false;
          ent.data.baseOpacity = opacityVal;
          ent.opacity = opacityVal;
        });
        if (batchOpacityInput) {
          batchOpacityInput.classList.remove('text-zinc-500');
          batchOpacityInput.classList.add('text-white');
        }
        this._requestCanvasUpdate();
      }
    });

    // Eventos Modo Grosor
    const batchWidthModeSelect = container.querySelector('#propBatchWidthModeSelect');
    const batchWidthContainer = container.querySelector('#propBatchWidthContainer');
    const batchWidthInput = container.querySelector('#propBatchWidthInput');

    batchWidthModeSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'BYLAYER') {
        this._dispatchCommand({ widthByLayer: true, baseStrokeWidth: undefined });
      } else if (val === 'CUSTOM') {
        const num = parseFloat(batchWidthInput ? batchWidthInput.value : 1.0) || 1.0;
        this._dispatchCommand({ widthByLayer: false, baseStrokeWidth: num, strokeWidth: num });
      } else {
        const num = parseFloat(val);
        this._dispatchCommand({ widthByLayer: false, baseStrokeWidth: num, strokeWidth: num });
      }
    });

    // Scrub Grosor en lote
    this._attachScrubInput(batchWidthContainer, batchWidthInput, (widthVal) => {
      this._dispatchCommand({ widthByLayer: false, baseStrokeWidth: widthVal, strokeWidth: widthVal });
    }, {
      min: 0, max: null, step: 0.1, precision: 1, isWidth: true,
      onLiveChange: (val) => {
        this.selectedEntities.forEach(ent => {
          if (!ent.data) ent.data = {};
          ent.data.widthByLayer = false;
          ent.data.baseStrokeWidth = val;
          ent.strokeWidth = val;
        });
        const isPreset = this._isPresetWidth(val);
        if (batchWidthInput) {
          batchWidthInput.classList.toggle('text-zinc-500', isPreset);
          batchWidthInput.classList.toggle('text-white', !isPreset);
        }
        this._requestCanvasUpdate();
      }
    });
  }
  
  // --- DESPACHADOR DE COMANDOS UNDO/REDO PARA SELECCIÓN ---
  _dispatchCommand(newStateObj, entityTarget = null, customOldStateObj = null) {
    const cadService = this.service || this.utils?.service || window.cadService;
    const targets = entityTarget ? [entityTarget] : this.selectedEntities;
    if (targets.length === 0) return;

    if (newStateObj.opacity !== undefined && newStateObj.baseOpacity === undefined) {
      newStateObj.baseOpacity = newStateObj.opacity;
    }

    let oldStateObj = customOldStateObj;
    if (!oldStateObj) {
      if (targets.length > 1) {
        // En selección múltiple, capturamos el estado original de CADA entidad
        oldStateObj = targets.map(ent => {
          const singleOld = {};
          Object.keys(newStateObj).forEach(key => {
            singleOld[key] = ent?.data?.[key] !== undefined ? ent.data[key] : ent?.[key];
          });
          return singleOld;
        });
      } else {
        oldStateObj = {};
        Object.keys(newStateObj).forEach(key => {
          oldStateObj[key] = targets[0]?.data?.[key] !== undefined ? targets[0].data[key] : targets[0]?.[key];
        });
      }
    }

    if (UpdateEntityPropertyCommand && cadService) {
      const cmd = new UpdateEntityPropertyCommand(cadService, targets, oldStateObj, newStateObj, this.utils);
      cadService.executeCommand(cmd);
    } else {
      targets.forEach((ent, idx) => {
        if (!ent.data) ent.data = {};
        const stateToApply = Array.isArray(newStateObj) ? newStateObj[idx] : newStateObj;
        Object.assign(ent.data, stateToApply);
        if (stateToApply.name !== undefined) ent.name = stateToApply.name;
        if (stateToApply.opacity !== undefined) {
          ent.opacity = stateToApply.opacity;
          ent.data.baseOpacity = stateToApply.opacity;
        }
      });
      this._requestCanvasUpdate();
      this.refresh();
    }
  }

  _dispatchDefaultCommand(oldStateObj, newStateObj) {
    const cadService = this.service || this.utils?.service || window.cadService;
    const defaults = this.utils?.propertyManager?.defaultSettings;
    if (!defaults) return;

    if (UpdateDefaultSettingsCommand && cadService) {
      const cmd = new UpdateDefaultSettingsCommand(cadService, defaults, oldStateObj, newStateObj, this.utils);
      cadService.executeCommand(cmd);
    } else {
      Object.assign(defaults, newStateObj);
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
        if (this.utils.selectionRenderEngine.updateEntitiesStroke) this.utils.selectionRenderEngine.updateEntitiesStroke();
        if (window.paper?.view) window.paper.view.update();
      }
    };

    // Capa por defecto (con Undo/Redo y refresco de muestras BYLAYER)
    layerSelect?.addEventListener('change', (e) => {
      const newLayerId = e.target.value;
      const oldLayerId = layerManager ? layerManager.activeLayerId : '0';
      const cadService = this.service || this.utils?.service || window.cadService;

      // 1. Registro en Undo/Redo a través de mando de comando
      if (String(oldLayerId) !== String(newLayerId)) {
        if (SetActiveLayerCommand && cadService && layerManager) {
          const uiListener = window.layerPanelUI || this;
          const cmd = new SetActiveLayerCommand(layerManager, oldLayerId, newLayerId, uiListener);
          cadService.executeCommand(cmd);
        } else if (layerManager) {
          layerManager.setActiveLayer(newLayerId);
          if (window.layerPanelUI) window.layerPanelUI.refresh();
          this.refresh();
        }
      }

      // 2. Sincronización visual de muestras y trazo activo (Tu funcionalidad original intacta)
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

    // Modo Color por Defecto
    colorSelect?.addEventListener('change', (e) => {
      if (!defaults) return;
      const oldVal = defaults.color;
      const newVal = e.target.value === 'BYLAYER' ? 'BYLAYER' : (colorPicker ? colorPicker.value : '#00e5ff');
      if (oldVal !== newVal) {
        this._dispatchDefaultCommand({ color: oldVal }, { color: newVal });
      }
    });

    // Picker Color (Modo Creación / Defaults)
    colorPicker?.addEventListener('click', (e) => {
      e.preventDefault();
      this._openColorPickerForDefaults(colorPicker);
    });

    // Modo Opacidad por Defecto
    opacityModeSelect?.addEventListener('change', (e) => {
      if (!defaults) return;
      const isByLayer = e.target.value === 'BYLAYER';
      const oldVal = defaults.opacity;
      const newVal = isByLayer ? 'BYLAYER' : (parseFloat(opacityInput ? opacityInput.value : 100) / 100);
      if (oldVal !== newVal) {
        this._dispatchDefaultCommand({ opacity: oldVal }, { opacity: newVal });
      }
    });

    // Scrub Opacidad por Defecto
    let opacityScrubStart = defaults ? defaults.opacity : 1;
    this._attachScrubInput(opacityContainer, opacityInput, (pctVal) => {
      if (!defaults) return;
      const newVal = pctVal / 100;
      if (opacityScrubStart !== newVal) {
        this._dispatchDefaultCommand({ opacity: opacityScrubStart }, { opacity: newVal });
      }
    }, {
      min: 0, max: 100, step: 1, precision: 0,
      onLiveChange: (val) => {
        if (!defaults) return;
        defaults.opacity = val / 100;
        this._updateSelectValueSilently(opacityModeSelect, 'CUSTOM');
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
        syncActiveDrawing();
      }
    });

    if (opacityContainer) {
      // Usar pointerdown para garantizar la captura antes de iniciar el arrastre
      opacityContainer.addEventListener('pointerdown', () => {
        opacityScrubStart = defaults ? defaults.opacity : 1;
      });
    }

    // Modo Grosor por Defecto
    widthModeSelect?.addEventListener('change', (e) => {
      if (!defaults) return;
      const val = e.target.value;
      const oldVal = defaults.strokeWidth;
      let newVal = 'BYLAYER';

      if (val === 'CUSTOM') {
        newVal = parseFloat(widthInput ? widthInput.value : 1.0) || 1.0;
      } else if (val !== 'BYLAYER') {
        newVal = parseFloat(val);
      }

      if (oldVal !== newVal) {
        this._dispatchDefaultCommand({ strokeWidth: oldVal }, { strokeWidth: newVal });
      }
    });

    // Scrub Grosor por Defecto
    let widthScrubStart = defaults ? defaults.strokeWidth : 1;
    this._attachScrubInput(widthContainer, widthInput, (widthVal) => {
      if (!defaults) return;
      if (widthScrubStart !== widthVal) {
        this._dispatchDefaultCommand({ strokeWidth: widthScrubStart }, { strokeWidth: widthVal });
      }
    }, {
      min: 0, max: null, step: 0.1, precision: 1, isWidth: true,
      onLiveChange: (widthVal) => {
        if (defaults) defaults.strokeWidth = widthVal;
        const isPreset = this._isPresetWidth(widthVal);
        const targetSelectValue = isPreset ? (widthVal === 0 ? '0' : String(widthVal)) : 'CUSTOM';
        this._updateSelectValueSilently(widthModeSelect, targetSelectValue);

        if (widthInput) {
          widthInput.classList.toggle('text-zinc-500', isPreset);
          widthInput.classList.toggle('text-white', !isPreset);
        }
        syncActiveDrawing();
      }
    });

    if (widthContainer) {
      widthContainer.addEventListener('mousedown', () => {
        widthScrubStart = defaults ? defaults.strokeWidth : 1;
      });
    }
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
      const curColor = colorPicker ? colorPicker.value : '#00e5ff';
      this._dispatchCommand({
        colorByLayer: isByLayer,
        origStrokeColor: isByLayer ? undefined : curColor,
        strokeColor: isByLayer ? (activeLayer ? activeLayer.color : '#ffffff') : curColor
      }, entity);
    });

    // Color Picker
    colorPicker?.addEventListener('click', (e) => {
      e.preventDefault(); // Bloquea el selector de color nativo del navegador
      this._openColorPickerForEntity(entity, colorPicker);
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
        const layerWidth = activeLayer?.strokeWidth !== undefined ? activeLayer.strokeWidth : 1;
        this._dispatchCommand({ widthByLayer: true, baseStrokeWidth: undefined, strokeWidth: layerWidth }, entity);
      } else if (val === 'CUSTOM') {
        const num = parseFloat(widthInput ? widthInput.value : 1.0) || 1.0;
        this._dispatchCommand({ widthByLayer: false, baseStrokeWidth: num, strokeWidth: num }, entity);
      } else {
        const num = parseFloat(val);
        this._dispatchCommand({ widthByLayer: false, baseStrokeWidth: num, strokeWidth: num }, entity);
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

  // Helper para sincronizar visualmente selects personalizados
  _updateSelectValue(selectEl, value) {
    if (!selectEl) return;
    this._updateSelectValueSilently(selectEl, value);
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  _updateSelectValueSilently(selectEl, value) {
    if (!selectEl) return;
    selectEl.value = value;
    
    // Sincronizar el texto del botón del select personalizado sin disparar eventos
    const wrapper = selectEl.nextElementSibling;
    if (wrapper && wrapper.classList.contains('custom-select-wrapper')) {
      const trigger = wrapper.querySelector('button');
      const opt = selectEl.options[selectEl.selectedIndex];
      if (trigger && opt) {
        trigger.innerHTML = `<span class="truncate pr-1 text-left">${opt.text}</span><i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 shrink-0"></i>`;
      }
    }
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
    if (this.utils?.selectionRenderEngine?.updateEntitiesStroke) {
      this.utils.selectionRenderEngine.updateEntitiesStroke();
    }
    if (window.paper?.view) {
      window.paper.view.update();
    }
  }

  _convertSelectsToCustom(container) {
    // Limpiar solo los dropdowns cuyo elemento disparador ya fue eliminado del DOM por un refresh
    document.querySelectorAll('.cad-custom-dropdown').forEach(d => {
      if (d._triggerEl && !d._triggerEl.isConnected) {
        d.remove();
      }
    });

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
      dropdown._triggerEl = trigger; // Guardar referencia al botón para saber si sigue conectado

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

    if (!this._dropdownCloseAttached) {
      this._dropdownCloseAttached = true;
      document.addEventListener('click', this._onDropdownClose);
      window.addEventListener('scroll', this._onDropdownSync, true);
      window.addEventListener('resize', this._onDropdownSync);
      document.addEventListener('keydown', this._onDropdownKeyDown);
    }
  }

  destroy() {
    this.cleanup();
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  cleanup() {
    this._closeColorPicker();

    // Eliminar dropdowns flotantes pegados al body
    document.querySelectorAll('.cad-custom-dropdown').forEach(d => d.remove());

    // Desenganchar listeners globales limpiamente
    if (this._dropdownCloseAttached) {
      document.removeEventListener('click', this._onDropdownClose);
      window.removeEventListener('scroll', this._onDropdownSync, true);
      window.removeEventListener('resize', this._onDropdownSync);
      document.removeEventListener('keydown', this._onDropdownKeyDown);
      this._dropdownCloseAttached = false;
    }
  }
}