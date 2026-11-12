/**
 * services/PropertyManager.js - Gestor de propiedades y resolución BYLAYER.
 */

import { CAD_THEME } from '../config/cadTheme.js';

export class PropertyManager {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;

    this.defaultSettings = {
      color: 'BYLAYER',       // 'BYLAYER' o Hex string ('#00e5ff')
      strokeWidth: 'BYLAYER', // 'BYLAYER' o número (0, 1, 1.5, 2, 3)
      opacity: 'BYLAYER'      // 'BYLAYER' o número (0..1)
    };
  }

  /**
   * Aplica la configuración de propiedades por defecto a una nueva entidad.
   * @param {paper.Item} item - Entidad de Paper.js recién creada
   */
  applyDefaultSettings(item) {
    if (!item) return;
    if (!item.data) item.data = {};

    const defaults = this.defaultSettings || {};
    const lm = this.utils?.layerManager;
    const activeLayer = lm ? lm.getActiveLayer() : null;

    // 0. Capa activa (Preserva la capa si ya venía definida)
    if (!item.data.layerId) {
      item.data.layerId = activeLayer ? String(activeLayer.id) : '0';
    }

    // 1. Color por defecto
    if (defaults.color === 'BYLAYER' || !defaults.color) {
      item.data.colorByLayer = true;
      delete item.data.origStrokeColor;
    } else {
      item.data.colorByLayer = false;
      item.data.origStrokeColor = defaults.color;
    }

    // 2. Grosor por defecto
    if (defaults.strokeWidth === 'BYLAYER' || defaults.strokeWidth === undefined) {
      item.data.widthByLayer = true;
      delete item.data.baseStrokeWidth;
    } else {
      item.data.widthByLayer = false;
      item.data.baseStrokeWidth = typeof defaults.strokeWidth === 'number' ? defaults.strokeWidth : parseFloat(defaults.strokeWidth) || 0;
    }

    // 3. Opacidad por defecto
    if (defaults.opacity === 'BYLAYER' || defaults.opacity === undefined) {
      item.data.opacityByLayer = true;
      delete item.data.origOpacity;
      item.opacity = activeLayer && activeLayer.opacity !== undefined ? activeLayer.opacity : 1.0;
    } else {
      item.data.opacityByLayer = false;
      const opVal = typeof defaults.opacity === 'number' ? defaults.opacity : parseFloat(defaults.opacity) || 1.0;
      item.data.origOpacity = opVal;
      item.opacity = opVal;
    }
  }

  getResolvedColor(entity = null) {
    if (entity) {
      // Si la entidad tiene explícitamente un color personalizado, lo devuelve
      if (entity.data?.colorByLayer === false && entity.data?.origStrokeColor) {
        return entity.data.origStrokeColor;
      }
    } else if (this.defaultSettings.color !== 'BYLAYER') {
      return this.defaultSettings.color;
    }

    // Si es BYLAYER, consulta el color dinámico actual de la capa
    const layerId = entity?.data?.layerId || this.utils.layerManager?.activeLayerId || '0';
    const layer = this.utils.layerManager?.layers?.get(String(layerId));
    return layer ? layer.color : CAD_THEME.properties.customFallbackColor;
  }

  getResolvedStrokeWidth(entity = null) {
    if (entity) {
        if (entity.data?.widthByLayer === false && entity.data?.baseStrokeWidth !== undefined) {
        return entity.data.baseStrokeWidth;
        }
    } else if (this.defaultSettings.strokeWidth !== 'BYLAYER') {
        return parseFloat(this.defaultSettings.strokeWidth);
    }

    const layerId = entity?.data?.layerId || this.utils.layerManager?.activeLayerId || '0';
    const layer = this.utils.layerManager?.layers?.get(String(layerId));
    const layerWidth = layer?.strokeWidth;

    // Debe retornar layerWidth directo si existe (incluyendo 0), no (layerWidth || 1)
    return layerWidth !== undefined ? layerWidth : 0;
  }
  
/**
   * Actualiza temporalmente una o varias propiedades por defecto durante el scrubbing
   * o vista previa en vivo, y sincroniza el trazado activo en curso.
   */
  previewDefaultSetting(keyOrState, value) {
    if (!this.defaultSettings) return;

    if (typeof keyOrState === 'object' && keyOrState !== null) {
      Object.assign(this.defaultSettings, keyOrState);
    } else {
      this.defaultSettings[keyOrState] = value;
    }

    if (this.utils.activePath) {
      this.applyDefaultSettings(this.utils.activePath);
    }
    this._requestRender();
  }

  /**
   * Aplica temporalmente cambios en vivo (scrubbing / color picker) o restaura
   * un snapshot sobre una o varias entidades y actualiza el motor de renderizado.
   */
  previewEntitiesProperty(entities, partialStateOrSnapshots) {
    const list = Array.isArray(entities) ? entities : [entities];
    const isPerEntitySnapshot = Array.isArray(partialStateOrSnapshots);

    list.forEach((entity, idx) => {
      if (!entity) return;
      if (!entity.data) entity.data = {};

      const state = isPerEntitySnapshot ? partialStateOrSnapshots[idx] : partialStateOrSnapshots;
      if (!state) return;

      if ('colorByLayer' in state) {
        entity.data.colorByLayer = state.colorByLayer;
        entity.data.origStrokeColor = state.origStrokeColor;
        if (state.strokeColor !== undefined) {
          entity.strokeColor = state.strokeColor;
        }
      }

      if ('opacityByLayer' in state) {
        entity.data.opacityByLayer = state.opacityByLayer;
        entity.data.origOpacity = state.origOpacity;
        entity.data.baseOpacity = state.baseOpacity;
        if (state.opacity !== undefined) {
          entity.opacity = state.opacity;
        }
      } else if (state.opacity !== undefined) {
        entity.data.opacityByLayer = false;
        entity.data.origOpacity = state.opacity;
        entity.data.baseOpacity = state.opacity;
        entity.opacity = state.opacity;
      }

      if ('widthByLayer' in state) {
        entity.data.widthByLayer = state.widthByLayer;
        entity.data.baseStrokeWidth = state.baseStrokeWidth;
        if (state.strokeWidth !== undefined) {
          entity.strokeWidth = state.strokeWidth;
        }
      } else if (state.strokeWidth !== undefined) {
        entity.data.widthByLayer = false;
        entity.data.baseStrokeWidth = state.strokeWidth;
        entity.strokeWidth = state.strokeWidth;
      }
    });

    this._requestRender();
  }

  _requestRender() {
    if (this.utils?.selectionRenderEngine?.updateEntitiesStroke) {
      this.utils.selectionRenderEngine.updateEntitiesStroke();
    }
    const paperInstance = this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
    if (paperInstance?.view) {
      paperInstance.view.update();
    }
  }
}