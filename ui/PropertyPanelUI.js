/**
 * PropertyPanelUI.js - Panel de Propiedades para entidades del lienzo CAD.
 * Maneja estados de selección (Sin selección, Selección única y Selección múltiple) con Undo/Redo.
 */

import { UpdateEntityPropertyCommand, UpdateDefaultSettingsCommand } from '../services/commands/cadCommands.js';
import { SetActiveLayerCommand } from '../services/commands/LayerCommands.js';
import { PropertyControls } from './components/PropertyControls.js';
import { PropertyColorHandler } from './components/PropertyColorHandler.js';
import { PropertyDefaultsView } from './components/PropertyDefaultsView.js';
import { PropertySingleView } from './components/PropertySingleView.js';
import { PropertyBatchView } from './components/PropertyBatchView.js';
import { CAD_THEME } from '../config/cadTheme.js';

export class PropertyPanelUI {
  constructor(cadUtils, containerId = 'propertyPanelContainer', { layerPanelUI = null, paperInstance = null } = {}) {
    if (!cadUtils || !cadUtils.service) {
      throw new Error('PropertyPanelUI requiere una instancia válida de cadUtils con service.');
    }

    this.utils = cadUtils;
    this.service = cadUtils.service;
    this.layerPanelUI = layerPanelUI;
    this.paper = paperInstance || cadUtils.paper;
    this.container = document.getElementById(containerId);

    this.colorHandler = new PropertyColorHandler({
      utils: this.utils,
      onDispatchEntity: (newState, entity, oldState) => this._dispatchCommand(newState, entity, oldState),
      onDispatchDefault: (oldState, newState) => this._dispatchDefaultCommand(oldState, newState),
      onRefresh: () => this.refresh(),
      onRequestCanvasUpdate: () => this._requestCanvasUpdate(),
      getSelectedEntities: () => this.selectedEntities,
      getLayer: (layerId) => this._getLayer(layerId)
    });

    this.defaultsView = new PropertyDefaultsView({
      utils: this.utils,
      service: this.service,
      layerPanelUI: this.layerPanelUI,
      paper: this.paper,
      colorHandler: this.colorHandler,
      onDispatchDefaultCommand: (oldState, newState) => this._dispatchDefaultCommand(oldState, newState),
      onRefresh: () => this.refresh(),
      onEnsureDefaultSettings: () => this._ensureDefaultSettings(),
      getHexColor: (color) => this._getHexColor(color),
      formatWidthDisplay: (val) => this._formatWidthDisplay(val),
      isPresetWidth: (val) => this._isPresetWidth(val),
      getOpacityTextColorClass: (isByLayer) => this._getOpacityTextColorClass(isByLayer),
      getWidthTextColorClass: (isByLayer, val) => this._getWidthTextColorClass(isByLayer, val),
      SetActiveLayerCommandClass: SetActiveLayerCommand
    });

    this.singleView = new PropertySingleView({
      utils: this.utils,
      paper: this.paper,
      colorHandler: this.colorHandler,
      onDispatchCommand: (newState, entity, oldState) => this._dispatchCommand(newState, entity, oldState),
      onRequestCanvasUpdate: () => this._requestCanvasUpdate(),
      getLayer: (layerId) => this._getLayer(layerId),
      getHexColor: (color) => this._getHexColor(color),
      formatWidthDisplay: (val) => this._formatWidthDisplay(val),
      isPresetWidth: (val) => this._isPresetWidth(val),
      getOpacityTextColorClass: (isByLayer) => this._getOpacityTextColorClass(isByLayer),
      getWidthTextColorClass: (isByLayer, val) => this._getWidthTextColorClass(isByLayer, val)
    });

    this.batchView = new PropertyBatchView({
      utils: this.utils,
      colorHandler: this.colorHandler,
      onDispatchCommand: (newState, entity, oldState) => this._dispatchCommand(newState, entity, oldState),
      onRequestCanvasUpdate: () => this._requestCanvasUpdate(),
      getLayer: (layerId) => this._getLayer(layerId),
      getHexColor: (color) => this._getHexColor(color),
      formatWidthDisplay: (val) => this._formatWidthDisplay(val),
      isPresetWidth: (val) => this._isPresetWidth(val),
      getWidthTextColorClass: (isByLayer, val) => this._getWidthTextColorClass(isByLayer, val)
    });

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

  get selectedEntities() {
    const raw = this.service.selectedEntities || [];
    const layerManager = this.utils.layerManager;

    return raw.filter((ent) => {
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
          <span id="propSelectionBadge" class="text-[9px] text-zinc-500 font-bold uppercase">Sin selección</span>
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
      this.defaultsView.render(fieldsContainer);
    } else if (count === 1) {
      const entity = this.selectedEntities[0];
      const rawName = entity.name || entity.data?.name || entity.type || 'Elemento';

      // Se elimina el número al final del nombre para el badge superior derecho (ej. "Línea 1" -> "Línea")
      const badgeText = rawName.replace(/\s+\d+$/, '');
      if (badge) badge.textContent = badgeText;

      this.singleView.render(fieldsContainer, entity);
    } else {
      if (badge) badge.textContent = `${count} seleccionados`;
      this.batchView.render(fieldsContainer, this.selectedEntities);
    }
    PropertyControls.convertSelectsToCustom(fieldsContainer);
  }

  _getHexColor(color) {
    const fallback = CAD_THEME.properties.defaultColor;
    if (!color) return fallback;
    if (typeof color === 'string') {
      if (color.startsWith('#')) {
        if (color.length === 4) {
          return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
        }
        return color;
      }
      return fallback;
    }
    if (typeof color.toCSS === 'function') {
      return color.toCSS(true);
    }
    return fallback;
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
    return CAD_THEME.properties.strokeWidthPresets.includes(num);
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

  // --- DESPACHADOR DE COMANDOS UNDO/REDO PARA SELECCIÓN ---
  _dispatchCommand(newStateObj, entityTarget = null, customOldStateObj = null) {
    const targets = entityTarget ? [entityTarget] : this.selectedEntities;
    if (targets.length === 0) return;

    if (newStateObj.opacity !== undefined && newStateObj.baseOpacity === undefined) {
      newStateObj.baseOpacity = newStateObj.opacity;
    }

    let oldStateObj = customOldStateObj;
    if (!oldStateObj) {
      if (targets.length > 1) {
        oldStateObj = targets.map((ent) => {
          const singleOld = {};
          Object.keys(newStateObj).forEach((key) => {
            singleOld[key] = ent.data?.[key] !== undefined ? ent.data[key] : ent[key];
          });
          return singleOld;
        });
      } else {
        oldStateObj = {};
        Object.keys(newStateObj).forEach((key) => {
          oldStateObj[key] = targets[0].data?.[key] !== undefined ? targets[0].data[key] : targets[0][key];
        });
      }
    }

    const cmd = new UpdateEntityPropertyCommand(this.service, targets, oldStateObj, newStateObj, this.utils);
    this.service.executeCommand(cmd);
  }

  _dispatchDefaultCommand(oldStateObj, newStateObj) {
    const defaults = this.utils.propertyManager?.defaultSettings;
    if (!defaults) return;

    const cmd = new UpdateDefaultSettingsCommand(this.service, defaults, oldStateObj, newStateObj, this.utils);
    this.service.executeCommand(cmd);
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
    if (this.utils.selectionRenderEngine?.updateEntitiesStroke) {
      this.utils.selectionRenderEngine.updateEntitiesStroke();
    }
    if (this.paper?.view) {
      this.paper.view.update();
    }
  }

  destroy() {
    this.cleanup();
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  cleanup() {
    this.colorHandler.close();
    PropertyControls.cleanup();
  }
}