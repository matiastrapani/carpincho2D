/**
 * services/PropertyManager.js - Gestor de propiedades y resolución BYLAYER.
 */
class PropertyManager {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;

    this.defaultSettings = {
      color: 'BYLAYER',      // 'BYLAYER' o Hex string ('#00e5ff')
      strokeWidth: 'BYLAYER' // 'BYLAYER' o número (1, 1.5, 2, 3)
    };
  }

  applyDefaultSettings(entity) {
    if (!entity) return;
    if (!entity.data) entity.data = {};

    const activeLayer = this.utils.layerManager?.getActiveLayer();
    entity.data.layerId = activeLayer ? activeLayer.id : '0';

    if (this.defaultSettings.color === 'BYLAYER') {
      entity.data.colorByLayer = true;
      delete entity.data.origStrokeColor;
    } else {
      entity.data.colorByLayer = false;
      entity.data.origStrokeColor = this.defaultSettings.color;
    }

    if (this.defaultSettings.strokeWidth === 'BYLAYER') {
      entity.data.widthByLayer = true;
      delete entity.data.baseStrokeWidth;
    } else {
      entity.data.widthByLayer = false;
      entity.data.baseStrokeWidth = parseFloat(this.defaultSettings.strokeWidth);
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

window.PropertyManager = PropertyManager;