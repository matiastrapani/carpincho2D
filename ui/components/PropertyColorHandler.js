/**
 * PropertyColorHandler.js - Controlador de ColorPickerPopover para el Panel de Propiedades.
 * Maneja la apertura, vista previa en vivo, snapshots de cancelación y despacho de Undo/Redo
 * para los modos: Sin selección (Defaults), Entidad única y Selección múltiple.
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { ColorPickerPopover } from './ColorPickerPopover.js';
import { PropertyControls } from './PropertyControls.js';
import { analyzeBatchSelection } from './BatchSelectionAnalyzer.js';

export class PropertyColorHandler {
  constructor({
    utils,
    container = null,
    getHexColor,
    onDispatchEntity,
    onDispatchDefault,
    onRefresh,
    onPreviewStateChange,
    getSelectedEntities,
    getLayer
  }) {
    if (typeof getHexColor !== 'function') {
      throw new Error('PropertyColorHandler requiere la función getHexColor.');
    }

    this.utils = utils;
    this.container = container;
    this.getHexColor = getHexColor;
    this.onDispatchEntity = onDispatchEntity;
    this.onDispatchDefault = onDispatchDefault;
    this.onRefresh = onRefresh;
    this.onPreviewStateChange = onPreviewStateChange;
    this.getSelectedEntities = getSelectedEntities;
    this.getLayer = getLayer;
    this.activePopover = null;
  }

  _el(id) {
    if (!id) return null;
    return this.container
      ? this.container.querySelector(`#${id}`)
      : document.getElementById(id);
  }

  _syncCustomColorDOM(pickerTarget, selectId, hexColor, clearText = false) {
    const picker = typeof pickerTarget === 'string'
      ? this._el(pickerTarget)
      : ((pickerTarget?.id ? this._el(pickerTarget.id) : null) || pickerTarget);
    const select = this._el(selectId);

    if (picker) {
      picker.dataset.color = hexColor;
      picker.style.backgroundColor = hexColor;
      if (clearText) picker.textContent = '';
    }
    if (select) PropertyControls.updateSelectValueSilently(select, 'CUSTOM');
  }

  _syncCustomOpacityDOM(selectId, inputId, containerId, alphaValue) {
    const selectEl = this._el(selectId);
    const inputEl = this._el(inputId);
    const containerEl = this._el(containerId);

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

  _cloneEntitySnapshot(entity) {
    const rawOrigColor = entity.data?.origStrokeColor;
    const rawStrokeColor = entity.strokeColor;
    return {
      colorByLayer: entity.data?.colorByLayer,
      origStrokeColor: rawOrigColor != null ? this.getHexColor(rawOrigColor) : rawOrigColor,
      strokeColor: rawStrokeColor != null ? this.getHexColor(rawStrokeColor) : rawStrokeColor,
      opacityByLayer: entity.data?.opacityByLayer,
      origOpacity: entity.data?.origOpacity,
      baseOpacity: entity.data?.baseOpacity,
      opacity: entity.opacity
    };
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
    this.onPreviewStateChange?.(false);
    if (this.activePopover && typeof this.activePopover.close === 'function') {
      this.activePopover.close();
      this.activePopover = null;
    }
  }

  _openPopoverSession({
    initialColor,
    initialOpacity,
    triggerEl,
    onLiveUpdate,
    onCommit,
    onRevert
  }) {
    this.close();
    let hasChanges = false;

    this.activePopover = new ColorPickerPopover({
      color: initialColor,
      opacity: initialOpacity,
      anchorEl: triggerEl,
      presets: ColorPickerPopover.getPresets(),

      onChange: (hexColor, alphaValue, flags = {}) => {
        if (!flags.colorChanged && !flags.opacityChanged) return;
        hasChanges = true;
        this.onPreviewStateChange?.(true);
        onLiveUpdate(hexColor, alphaValue, flags);
      },

      onChangeEnd: (hexColor, alphaValue, flags = {}) => {
        this.onPreviewStateChange?.(false);
        onCommit(hexColor, alphaValue, flags);
      },

      onCancel: () => {
        this.onPreviewStateChange?.(false);
        if (!hasChanges) return;
        onRevert();
        this.onRefresh();
      },

      onClose: () => {
        this.onPreviewStateChange?.(false);
        this.activePopover = null;
      }
    });
  }

  openForDefaults(triggerEl) {
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

    const snapshot = {
      color: defaults.color != null && defaults.color !== 'BYLAYER'
        ? this.getHexColor(defaults.color)
        : defaults.color,
      opacity: defaults.opacity
    };

    this._openPopoverSession({
      initialColor: this.getHexColor(resolvedColor),
      initialOpacity: typeof resolvedOpacity === 'number' ? resolvedOpacity : 1,
      triggerEl,
      onLiveUpdate: (hexColor, alphaValue, flags) => {
        const previewPatch = {};
        if (flags.colorChanged) {
          previewPatch.color = hexColor;
          this._syncCustomColorDOM(triggerEl, 'defColorSelect', hexColor);
        }
        if (flags.opacityChanged) {
          previewPatch.opacity = alphaValue;
          this._syncCustomOpacityDOM('defOpacityModeSelect', 'defOpacityInput', 'defOpacityContainer', alphaValue);
        }
        propManager.previewDefaultSetting(previewPatch);
      },
      onCommit: (hexColor, alphaValue, flags) => {
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
      onRevert: () => propManager.previewDefaultSetting(snapshot)
    });
  }

  openForEntity(entity, triggerEl) {
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

    const snapshot = this._cloneEntitySnapshot(entity);

    this._openPopoverSession({
      initialColor: this.getHexColor(resolvedColor),
      initialOpacity: typeof resolvedOpacity === 'number' ? resolvedOpacity : 1,
      triggerEl,
      onLiveUpdate: (hexColor, alphaValue, flags) => {
        const { newState } = this._buildStateDiff(hexColor, alphaValue, flags, snapshot);
        if (flags.colorChanged) {
          this._syncCustomColorDOM('propColorPicker', 'propColorModeSelect', hexColor);
        }
        if (flags.opacityChanged) {
          this._syncCustomOpacityDOM('propOpacityModeSelect', 'propOpacityInput', 'propOpacityContainer', alphaValue);
        }
        if (Object.keys(newState).length > 0) {
          propManager.previewEntitiesProperty(entity, newState);
        }
      },
      onCommit: (hexColor, alphaValue, flags) => {
        const { newState, oldState } = this._buildStateDiff(hexColor, alphaValue, flags, snapshot);
        if (Object.keys(newState).length > 0) this.onDispatchEntity(newState, entity, oldState);
      },
      onRevert: () => propManager.previewEntitiesProperty(entity, snapshot)
    });
  }

  openForBatch(triggerEl) {
    const entities = this.getSelectedEntities();
    if (entities.length === 0) {
      this.close();
      return;
    }

    const { defaultColor } = CAD_THEME.properties;
    const propManager = this.utils.propertyManager;
    const activeLayer = this.utils.layerManager?.getActiveLayer() || null;
    const defaults = propManager.defaultSettings;

    const {
      sharedColor,
      allSameColor,
      sharedOpacity,
      allSameOpacity
    } = analyzeBatchSelection(entities, {
      getLayer: this.getLayer,
      activeLayer,
      getHexColor: (c) => this.getHexColor(c)
    });

    const creationColor = (defaults.color === 'BYLAYER' || !defaults.color)
      ? (activeLayer ? activeLayer.color : defaultColor)
      : defaults.color;
    const initialColor = allSameColor && sharedColor ? sharedColor : this.getHexColor(creationColor);
    const initialOpacity = allSameOpacity && sharedOpacity !== null
      ? sharedOpacity
      : (defaults.opacity !== 'BYLAYER' && typeof defaults.opacity === 'number' ? defaults.opacity : (activeLayer?.opacity ?? 1));

    const snapshots = entities.map((ent) => this._cloneEntitySnapshot(ent));

    this._openPopoverSession({
      initialColor,
      initialOpacity,
      triggerEl,
      onLiveUpdate: (hexColor, alphaValue, flags) => {
        const { newState } = this._buildStateDiff(hexColor, alphaValue, flags, snapshots[0]);
        if (flags.colorChanged) {
          this._syncCustomColorDOM('propBatchColorPicker', 'propBatchColorModeSelect', hexColor, true);
        }
        if (flags.opacityChanged) {
          this._syncCustomOpacityDOM(null, 'propBatchOpacityInput', null, alphaValue);
        }
        if (Object.keys(newState).length > 0) {
          propManager.previewEntitiesProperty(entities, newState);
        }
      },
      onCommit: (hexColor, alphaValue, flags) => {
        const { newState } = this._buildStateDiff(hexColor, alphaValue, flags, snapshots[0]);
        if (Object.keys(newState).length > 0) {
          const oldStates = snapshots.map((s) => this._buildStateDiff(hexColor, alphaValue, flags, s).oldState);
          this.onDispatchEntity(newState, null, oldStates);
        }
      },
      onRevert: () => propManager.previewEntitiesProperty(entities, snapshots)
    });
  }
}