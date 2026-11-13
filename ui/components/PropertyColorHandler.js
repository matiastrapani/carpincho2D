/**
 * PropertyColorHandler.js - Controlador de ColorPickerPopover para el Panel de Propiedades.
 * Maneja la apertura, vista previa en vivo, snapshots de cancelación y despacho de Undo/Redo
 * para los modos: Sin selección (Defaults), Entidad única y Selección múltiple.
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { ColorPickerPopover } from './ColorPickerPopover.js';
import { PropertyControls } from './PropertyControls.js';

export class PropertyColorHandler {
  constructor({
    utils,
    onDispatchEntity,
    onDispatchDefault,
    onRefresh,
    onRequestCanvasUpdate,
    getSelectedEntities,
    getLayer
  }) {
    this.utils = utils;
    this.onDispatchEntity = onDispatchEntity;
    this.onDispatchDefault = onDispatchDefault;
    this.onRefresh = onRefresh;
    this.onRequestCanvasUpdate = onRequestCanvasUpdate;
    this.getSelectedEntities = getSelectedEntities;
    this.getLayer = getLayer;
    this.activePopover = null;
  }

  _getHexColor(color) {
    const fallback = CAD_THEME.properties.defaultColor;
    if (!color) return fallback;
    if (typeof color === 'string') {
      if (color.startsWith('#')) {
        return color.length === 4
          ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
          : color;
      }
      return fallback;
    }
    return typeof color.toCSS === 'function' ? color.toCSS(true) : fallback;
  }

  _syncCustomOpacityDOM(selectId, inputId, containerId, alphaValue) {
    const selectEl = document.getElementById(selectId);
    const inputEl = document.getElementById(inputId);
    const containerEl = containerId ? document.getElementById(containerId) : null;

    if (selectEl) PropertyControls.updateSelectValueSilently(selectEl, 'CUSTOM');
    if (inputEl && document.activeElement !== inputEl) {
      inputEl.value = Math.round(alphaValue * 100);
      inputEl.classList.remove('text-zinc-500');
      inputEl.classList.add('text-white');
    }
    const span = containerEl?.querySelector('span');
    if (span) {
      span.classList.remove('text-zinc-500');
      span.classList.add('text-white');
    }
  }

  _buildStateDiff(hexColor, alphaValue, flags, snapshot) {
    const newState = {};
    const oldState = {};

    if (flags.colorChanged) {
      Object.assign(newState, { colorByLayer: false, origStrokeColor: hexColor, strokeColor: hexColor });
      Object.assign(oldState, {
        colorByLayer: snapshot.colorByLayer,
        origStrokeColor: snapshot.origStrokeColor,
        strokeColor: snapshot.strokeColor
      });
    }
    if (flags.opacityChanged) {
      Object.assign(newState, {
        opacityByLayer: false,
        origOpacity: alphaValue,
        baseOpacity: alphaValue,
        opacity: alphaValue
      });
      Object.assign(oldState, {
        opacityByLayer: snapshot.opacityByLayer,
        origOpacity: snapshot.origOpacity,
        baseOpacity: snapshot.baseOpacity,
        opacity: snapshot.opacity
      });
    }
    return { newState, oldState };
  }

  close() {
    if (this.activePopover && typeof this.activePopover.close === 'function') {
      this.activePopover.close();
      this.activePopover = null;
    }
  }

  openForDefaults(triggerEl) {
    this.close();
    const { defaultColor } = CAD_THEME.properties;
    const propManager = this.utils.propertyManager;
    const defaults = propManager.defaultSettings;
    const activeLayer = this.utils.layerManager.getActiveLayer();

    const resolvedColor = defaults.color === 'BYLAYER'
      ? (activeLayer ? activeLayer.color : defaultColor)
      : defaults.color;
    const resolvedOpacity = defaults.opacity === 'BYLAYER'
      ? (activeLayer?.opacity ?? 1)
      : defaults.opacity;

    const snapshot = { color: defaults.color, opacity: defaults.opacity };
    let hasChanges = false;

    this.activePopover = new ColorPickerPopover({
      color: this._getHexColor(resolvedColor),
      opacity: typeof resolvedOpacity === 'number' ? resolvedOpacity : 1,
      anchorEl: triggerEl,
      presets: ColorPickerPopover.getPresets(),

      onChange: (hexColor, alphaValue, flags = {}) => {
        const previewPatch = {};
        if (flags.colorChanged) {
          previewPatch.color = hexColor;
          const freshTrigger = (triggerEl?.id ? document.getElementById(triggerEl.id) : null) || triggerEl;
          if (freshTrigger) {
            freshTrigger.dataset.color = hexColor;
            freshTrigger.style.backgroundColor = hexColor;
          }
          const colorSelect = document.getElementById('defColorSelect');
          if (colorSelect) PropertyControls.updateSelectValueSilently(colorSelect, 'CUSTOM');
        }
        if (flags.opacityChanged) {
          previewPatch.opacity = alphaValue;
          this._syncCustomOpacityDOM('defOpacityModeSelect', 'defOpacityInput', 'defOpacityContainer', alphaValue);
        }
        if (flags.colorChanged || flags.opacityChanged) {
          hasChanges = true;
          propManager.previewDefaultSetting(previewPatch);
        }
      },

      onChangeEnd: (hexColor, alphaValue, flags = {}) => {
        const oldState = {};
        const newState = {};
        if (flags.colorChanged) {
          newState.color = hexColor;
          oldState.color = snapshot.color;
        }
        if (flags.opacityChanged) {
          newState.opacity = alphaValue;
          oldState.opacity = snapshot.opacity;
        }
        if (Object.keys(newState).length > 0) this.onDispatchDefault(oldState, newState);
      },

      onCancel: () => {
        if (!hasChanges) return;
        propManager.previewDefaultSetting(snapshot);
        this.onRefresh();
      },

      onClose: () => {
        this.activePopover = null;
      }
    });
  }

  openForEntity(entity, triggerEl) {
    this.close();
    const { defaultColor } = CAD_THEME.properties;
    const propManager = this.utils.propertyManager;
    const activeLayer = this.getLayer(entity.data?.layerId || '0');

    const isColorByLayer = entity.data?.colorByLayer !== false;
    const isOpacityByLayer = entity.data?.opacityByLayer !== false;
    const resolvedColor = isColorByLayer
      ? (activeLayer ? activeLayer.color : defaultColor)
      : (entity.data?.origStrokeColor || entity.strokeColor);
    const resolvedOpacity = isOpacityByLayer
      ? (activeLayer?.opacity ?? 1)
      : (entity.data?.origOpacity ?? entity.opacity ?? 1);

    const snapshot = {
      colorByLayer: entity.data?.colorByLayer,
      origStrokeColor: entity.data?.origStrokeColor,
      strokeColor: entity.strokeColor,
      opacityByLayer: entity.data?.opacityByLayer,
      origOpacity: entity.data?.origOpacity,
      baseOpacity: entity.data?.baseOpacity,
      opacity: entity.opacity
    };
    let hasChanges = false;

    this.activePopover = new ColorPickerPopover({
      color: this._getHexColor(resolvedColor),
      opacity: typeof resolvedOpacity === 'number' ? resolvedOpacity : 1,
      anchorEl: triggerEl,
      presets: ColorPickerPopover.getPresets(),

      onChange: (hexColor, alphaValue, flags = {}) => {
        const { newState } = this._buildStateDiff(hexColor, alphaValue, flags, snapshot);
        if (flags.colorChanged) {
          const picker = document.getElementById('propColorPicker');
          const select = document.getElementById('propColorModeSelect');
          if (picker) {
            picker.dataset.color = hexColor;
            picker.style.backgroundColor = hexColor;
          }
          if (select) PropertyControls.updateSelectValueSilently(select, 'CUSTOM');
        }
        if (flags.opacityChanged) {
          this._syncCustomOpacityDOM('propOpacityModeSelect', 'propOpacityInput', 'propOpacityContainer', alphaValue);
        }
        if (Object.keys(newState).length > 0) {
          hasChanges = true;
          propManager.previewEntitiesProperty(entity, newState);
        }
      },

      onChangeEnd: (hexColor, alphaValue, flags = {}) => {
        const { newState, oldState } = this._buildStateDiff(hexColor, alphaValue, flags, snapshot);
        if (Object.keys(newState).length > 0) this.onDispatchEntity(newState, entity, oldState);
      },

      onCancel: () => {
        if (!hasChanges) return;
        propManager.previewEntitiesProperty(entity, snapshot);
        this.onRefresh();
      },

      onClose: () => {
        this.activePopover = null;
      }
    });
  }

  openForBatch(triggerEl) {
    this.close();
    const entities = this.getSelectedEntities();
    if (entities.length === 0) return;

    const { defaultColor } = CAD_THEME.properties;
    const propManager = this.utils.propertyManager;
    const activeLayer = this.utils.layerManager.getActiveLayer();
    const defaults = propManager.defaultSettings;

    let sharedColor = null;
    let allSameColor = true;
    let sharedOpacity = null;
    let allSameOpacity = true;

    for (const ent of entities) {
      const layerOfEnt = this.getLayer(ent.data?.layerId) || activeLayer;
      const entColor = ent.data?.colorByLayer !== false
        ? (layerOfEnt ? layerOfEnt.color : defaultColor)
        : (ent.data?.origStrokeColor || ent.strokeColor || defaultColor);
      const hex = this._getHexColor(entColor);

      if (sharedColor === null) sharedColor = hex;
      else if (sharedColor.toLowerCase() !== hex.toLowerCase()) allSameColor = false;

      const entOp = ent.opacity ?? ent.data?.origOpacity ?? 1;
      if (sharedOpacity === null) sharedOpacity = entOp;
      else if (Math.abs(sharedOpacity - entOp) > 0.01) allSameOpacity = false;
    }

    const creationColor = (defaults.color === 'BYLAYER' || !defaults.color)
      ? (activeLayer ? activeLayer.color : defaultColor)
      : defaults.color;
    const initialColor = allSameColor && sharedColor ? sharedColor : this._getHexColor(creationColor);
    const initialOpacity = allSameOpacity && sharedOpacity !== null
      ? sharedOpacity
      : (defaults.opacity !== 'BYLAYER' && typeof defaults.opacity === 'number' ? defaults.opacity : (activeLayer?.opacity ?? 1));

    const snapshots = entities.map((ent) => ({
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
      presets: ColorPickerPopover.getPresets(),

      onChange: (hexColor, alphaValue, flags = {}) => {
        const { newState } = this._buildStateDiff(hexColor, alphaValue, flags, snapshots[0]);
        if (flags.colorChanged) {
          const picker = document.getElementById('propBatchColorPicker');
          const select = document.getElementById('propBatchColorModeSelect');
          if (picker) {
            picker.dataset.color = hexColor;
            picker.style.backgroundColor = hexColor;
            picker.textContent = '';
          }
          if (select) PropertyControls.updateSelectValueSilently(select, 'CUSTOM');
        }
        if (flags.opacityChanged) {
          this._syncCustomOpacityDOM(null, 'propBatchOpacityInput', null, alphaValue);
        }
        if (Object.keys(newState).length > 0) {
          hasChanges = true;
          propManager.previewEntitiesProperty(entities, newState);
        }
      },

      onChangeEnd: (hexColor, alphaValue, flags = {}) => {
        const { newState } = this._buildStateDiff(hexColor, alphaValue, flags, snapshots[0]);
        if (Object.keys(newState).length > 0) {
          const oldStates = snapshots.map((s) => this._buildStateDiff(hexColor, alphaValue, flags, s).oldState);
          this.onDispatchEntity(newState, null, oldStates);
        }
      },

      onCancel: () => {
        if (!hasChanges) return;
        propManager.previewEntitiesProperty(entities, snapshots);
        this.onRefresh();
      },

      onClose: () => {
        this.activePopover = null;
      }
    });
  }
}