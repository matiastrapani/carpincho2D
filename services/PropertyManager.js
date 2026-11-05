/**
 * services/PropertyManager.js - Gestor de propiedades y resolución BYLAYER.
 */
import { UpdateEntityPropertyCommand } from './commands/cadCommands.js';

export class PropertyManager {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;

    this.defaultSettings = {
      color: 'BYLAYER',      // 'BYLAYER' o Hex string ('#00e5ff')
      strokeWidth: 'BYLAYER' // 'BYLAYER' o número (1, 1.5, 2, 3)
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
    return layer ? layer.color : '#00e5ff';
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
}