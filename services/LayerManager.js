/**
 * LayerManager.js - Gestión de capas, visibilidad, bloqueo y propiedades BYLAYER.
 */

class LayerManager {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;

    // Capa por defecto
    this.activeLayerId = '0';
    this.layers = new Map();

    this.initDefaultLayers();
  }

  initDefaultLayers() {
    // Capa base estándar CAD ('0')
    this.createLayer({
      id: '0',
      name: '0',
      color: '#18fcf1',
      strokeWidth: 0,
      visible: true,
      locked: false
    });
  }

  createLayer({ id, name, color = '#18fcf1', strokeWidth = 0, visible = true, locked = false }) {
    const layerId = id || `layer_${Date.now()}`;
    
    if (this.layers.has(layerId)) {
      console.warn(`La capa ${layerId} ya existe.`);
      return this.layers.get(layerId);
    }

    // Crear grupo / capa nativa en Paper.js dentro de drawLayer
    let paperLayer = null;
    if (paper && this.utils.drawLayer) {
      this.utils.drawLayer.activate();
      paperLayer = new paper.Group();
      paperLayer.name = `layer_group_${layerId}`;
    }

    const layerData = {
      id: layerId,
      name: name || `Capa ${this.layers.size + 1}`,
      color: color,
      strokeWidth: strokeWidth,
      visible: visible,
      locked: locked,
      paperGroup: paperLayer
    };

    this.layers.set(layerId, layerData);
    return layerData;
  }

  deleteLayer(id) {
    const layerId = String(id);

    // 1. Guardián: Impedir borrado solo si queda 1 capa en total
    if (this.layers.size <= 1) return false;

    const layer = this.layers.get(layerId);
    if (!layer) return false;

    // 2. Eliminar la capa del Map sin restringir el id '0'
    this.layers.delete(layerId);

    // 3. Si la capa eliminada era la activa, asignar la primera disponible
    if (String(this.activeLayerId) === layerId) {
      const firstAvailableId = this.layers.keys().next().value;
      if (firstAvailableId !== undefined) {
        this.setActiveLayer(firstAvailableId);
      }
    }

    return true;
  }
  
  setActiveLayer(layerId) {
    const key = String(layerId);
    if (!this.layers.has(key)) return false;
    this.activeLayerId = key;
    return true;
  }

  getActiveLayer() {
    return this.layers.get(this.activeLayerId) || this.layers.get('0');
  }

  toggleVisibility(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    layer.visible = !layer.visible;
    
    // Ocultar/Mostrar entidades vinculadas en Paper.js
    this.service.demoEntities.forEach(ent => {
      if (ent.data && ent.data.layerId === layerId) {
        ent.visible = layer.visible;
      }
    });

    if (layer.paperGroup) {
      layer.paperGroup.visible = layer.visible;
    }

    paper.view.update();
  }

  toggleLock(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    layer.locked = !layer.locked;
  }

  updateLayerProperty(id, property, value) {
    const layerId = String(id);
    const layer = this.layers.get(layerId);
    if (!layer) return false;

    // Actualiza únicamente la propiedad de la capa
    layer[property] = value;
    return true;
  }

  assignEntityToLayer(entity, layerId) {
    if (!entity || !this.layers.has(layerId)) return;

    const layer = this.layers.get(layerId);
    entity.data = entity.data || {};
    entity.data.layerId = layerId;

    // Asignar color heredado BYLAYER si no tiene color propio forzado
    if (entity.data.useColorByLayer !== false) {
      entity.data.origStrokeColor = layer.color;
    }

    if (layer.paperGroup && !layer.paperGroup.children.includes(entity)) {
      layer.paperGroup.addChild(entity);
    }
  }
}

window.LayerManager = LayerManager;