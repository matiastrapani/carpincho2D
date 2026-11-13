/**
 * LayerManager.js - Gestión de capas, visibilidad, bloqueo y propiedades BYLAYER.
 */

import { CAD_THEME } from '../config/cadTheme.js';

export class LayerManager {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;

    this.activeLayerId = '0';
    this.layers = new Map();
    this._listeners = new Set();

    this.initDefaultLayers();
  }

  subscribe(listener) {
    if (typeof listener === 'function') {
      this._listeners.add(listener);
    }
    return () => this._listeners.delete(listener);
  }

  _notify() {
    this._listeners.forEach((listener) => listener());
  }

  initDefaultLayers() {
    this.createLayer({
      id: '0',
      name: 'Capa 0',
      color: CAD_THEME.properties.customFallbackColor,
      strokeWidth: 0,
      visible: true,
      locked: false
    });
  }

  createLayer({ id, name, color, strokeWidth = 0, visible = true, locked = false } = {}) {
    const layerId = String(id || `layer_${Date.now()}`);
    const resolvedColor = color || CAD_THEME.properties.customFallbackColor;

    if (this.layers.has(layerId)) {
      console.warn(`La capa ${layerId} ya existe.`);
      return this.layers.get(layerId);
    }

    let paperLayer = null;
    if (typeof paper !== 'undefined' && this.utils?.drawLayer) {
      this.utils.drawLayer.activate();
      paperLayer = new paper.Group();
      paperLayer.name = `layer_group_${layerId}`;
      paperLayer.visible = visible !== false;
    }

    const layerData = {
      id: layerId,
      name: name || `Capa ${this.layers.size + 1}`,
      color: resolvedColor,
      strokeWidth,
      visible,
      locked,
      paperGroup: paperLayer
    };

    this.layers.set(layerId, layerData);
    this.syncZOrder();
    this._notify();
    return layerData;
  }

  previewLayerVisuals(layerId, { color, opacity } = {}) {
    const layer = this.layers.get(String(layerId));
    if (!layer) return false;

    if (color !== undefined) {
      layer.color = color;
    }
    if (opacity !== undefined) {
      layer.opacity = opacity;
    }

    if (this.utils?.selectionRenderEngine?.updateEntitiesStroke) {
      this.utils.selectionRenderEngine.updateEntitiesStroke();
    }
    if (paper?.view) {
      paper.view.update();
    }

    this._notify();
    return true;
  }

  syncZOrder() {
    if (!this.layers) return;

    const layerList = Array.from(this.layers.values());
    const layerOrderMap = new Map();
    layerList.forEach((layer, idx) => layerOrderMap.set(String(layer.id), idx));

    if (Array.isArray(this.service?.entities)) {
      this.service.entities.forEach((ent) => {
        const targetLayer = this.layers.get(String(ent.data?.layerId || '0'));
        if (targetLayer?.paperGroup && ent.parent !== targetLayer.paperGroup) {
          targetLayer.paperGroup.addChild(ent);
        }
      });

      this.service.entities.sort((a, b) => {
        const orderA = layerOrderMap.get(String(a.data?.layerId || '0')) ?? 999;
        const orderB = layerOrderMap.get(String(b.data?.layerId || '0')) ?? 999;
        return orderB - orderA;
      });
    }

    for (let i = layerList.length - 1; i >= 0; i--) {
      const layer = layerList[i];
      if (layer.paperGroup && typeof layer.paperGroup.bringToFront === 'function') {
        layer.paperGroup.bringToFront();
      }
    }

    if (typeof paper !== 'undefined' && paper.view) {
      paper.view.update();
    }
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
    this._notify();
    return true;
  }
  
  setActiveLayer(layerId) {
    const key = String(layerId);
    if (!this.layers.has(key)) return false;

    this.activeLayerId = key;
    const layer = this.layers.get(key);

    if (layer) {
      layer.visible = true;
      layer.locked = false;

      if (this.service && Array.isArray(this.service.entities)) {
        this.service.entities.forEach((ent) => {
          if (ent.data && String(ent.data.layerId) === key) {
            ent.visible = true;
          }
        });
      }

      if (layer.paperGroup) {
        layer.paperGroup.visible = true;
      }
    }

    if (paper?.view) {
      paper.view.update();
    }

    this._notify();
    return true;
  }

  updateLayerProperty(id, property, value) {
    const layerId = String(id);
    const layer = this.layers.get(layerId);
    if (!layer) return false;

    layer[property] = value;

    if (this.service && ((property === 'locked' && value === true) || (property === 'visible' && value === false))) {
      this._purgeLockedLayerState(layerId);

      if (this.service.selectionManager?._notifySelectionChanged) {
        this.service.selectionManager._notifySelectionChanged();
      }
    }

    if (this.utils) {
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.utils.selectionRenderEngine.renderBezierHandles();
      if (paper?.view) paper.view.update();
    }

    this._notify();
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
    this.service.entities.forEach(ent => {
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
    const key = String(layerId);
    const layer = this.layers.get(key);
    if (!layer) return;

    layer.locked = !layer.locked;

    if (layer.locked && this.service) {
      this._purgeLockedLayerState(key);
    }

    if (this.utils) {
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.utils.selectionRenderEngine.renderBezierHandles();
      if (paper?.view) paper.view.update();
    }
  }

  _purgeLockedLayerState(layerId) {
    if (!this.service) return;
    const idStr = String(layerId);

    this.service.selectedEntities = (this.service.selectedEntities || []).filter(
      ent => String(ent.data?.layerId || '0') !== idStr
    );

    this.service.editingEntities = (this.service.editingEntities || []).filter(
      ent => String(ent.data?.layerId || '0') !== idStr
    );

    this.service.selectedSegments = (this.service.selectedSegments || []).filter(
      seg => seg && seg.path && String(seg.path.data?.layerId || '0') !== idStr
    );

    this.service.selectedHandles = (this.service.selectedHandles || []).filter(
      h => h && h.segment && h.segment.path && String(h.segment.path.data?.layerId || '0') !== idStr
    );
  }

  assignEntityToLayer(entity, layerId) {
    if (!entity) return;

    const key = String(layerId || this.activeLayerId || '0');
    const layer = this.layers.get(key) || this.layers.get('0');
    if (!layer) return;

    entity.data = entity.data || {};
    entity.data.layerId = layer.id;

    // Asignar color heredado BYLAYER si no tiene color propio forzado
    if (entity.data.useColorByLayer !== false && entity.data.colorByLayer !== false) {
      entity.data.origStrokeColor = layer.color;
    }

    if (layer.paperGroup && entity.parent !== layer.paperGroup) {
      layer.paperGroup.addChild(entity);
    }

    entity.visible = layer.visible !== false;
  }

  ensureLayerGroups() {
    if (typeof paper === 'undefined') return;
    const drawLayer = this.utils?.drawLayer || paper.project?.layers?.['drawLayer'];
    if (!drawLayer) return;

    this.layers.forEach((layer) => {
      const hasValidGroup = Boolean(
        layer.paperGroup &&
        layer.paperGroup.parent &&
        layer.paperGroup.layer === drawLayer
      );

      if (!hasValidGroup) {
        const paperLayer = new paper.Group();
        paperLayer.name = `layer_group_${layer.id}`;
        paperLayer.visible = layer.visible !== false;
        drawLayer.addChild(paperLayer);
        layer.paperGroup = paperLayer;
      }
    });

    this.syncZOrder();
  }
}