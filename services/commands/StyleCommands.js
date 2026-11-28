/**
 * services/commands/StyleCommands.js - Comandos de modificación de estilos y propiedades
 */

export class UpdateEntityPropertyCommand {
  constructor(cadService, entities, oldState, newState, cadUtils) {
    this.service = cadService;
    this.entities = Array.isArray(entities) ? entities : [entities];
    this.oldState = oldState;
    this.newState = newState;
    this.utils = cadUtils || cadService?.utils || null;
  }

  execute() {
    this._applyState(this.newState);
  }

  undo() {
    this._applyState(this.oldState);
  }

  _applyState(state) {
    if (!this.entities || this.entities.length === 0) return;

    const layerManager = this.utils?.layerManager || this.service?.layerManager || this.service?.utils?.layerManager;
    let hasLayerChange = false;

    this.entities.forEach((entity, idx) => {
      if (!entity.data) entity.data = {};
      const entityState = Array.isArray(state) ? state[idx] : state;
      if (!entityState) return;

      Object.keys(entityState).forEach((key) => {
        if (entityState[key] === undefined) {
          delete entity.data[key];
        } else {
          entity.data[key] = entityState[key];
        }
      });

      if (entityState.layerId !== undefined && layerManager) {
        hasLayerChange = true;
        if (typeof layerManager.ensureLayerGroups === 'function') {
          layerManager.ensureLayerGroups();
        }
        layerManager.assignEntityToLayer(entity, entityState.layerId);
      }

      if (entityState.name !== undefined) entity.name = entityState.name;
      if (entityState.opacity !== undefined) entity.opacity = entityState.opacity;
      if (entityState.origOpacity !== undefined && !entityState.opacityByLayer) entity.opacity = entityState.origOpacity;
      if (entityState.strokeColor !== undefined) entity.strokeColor = entityState.strokeColor;
      if (entityState.origStrokeColor !== undefined && !entityState.colorByLayer) entity.strokeColor = entityState.origStrokeColor;
    });

    if (hasLayerChange && layerManager && typeof layerManager.syncZOrder === 'function') {
      layerManager.syncZOrder();
    }

    this.utils?.selectionRenderEngine?.updateEntitiesStroke?.();
    this.utils?.selectionRenderEngine?.renderBezierHandles?.();

    const p = this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
    p?.view?.update();

    this.utils?.propertyManager?._notify?.();
    this.utils?.propertyPanelUI?.refresh?.();
  }
}

export class UpdateDefaultSettingsCommand {
  constructor(cadService, defaultSettingsRef, oldState, newState, cadUtils) {
    this.service = cadService;
    this.defaults = defaultSettingsRef;
    this.oldState = oldState;
    this.newState = newState;
    this.utils = cadUtils || cadService?.utils || null;
  }

  execute() {
    this._applyState(this.newState);
  }

  undo() {
    this._applyState(this.oldState);
  }

  _applyState(state) {
    if (!this.defaults) return;

    Object.assign(this.defaults, state);

    if (this.utils?.propertyManager) {
      if (this.utils.activePath) {
        this.utils.propertyManager.applyDefaultSettings(this.utils.activePath);
      }
      this.utils.propertyManager._notify();
    }
    this.utils?.selectionRenderEngine?.updateEntitiesStroke?.();

    const p = this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
    p?.view?.update();

    if (!this.utils?.propertyManager?._listeners?.size) {
      this.utils?.propertyPanelUI?.refresh?.();
    }
  }
}

export class EntityVisibilityLockCommand {
  constructor(cadService, entities, action, cadUtils = null) {
    this.service = cadService;
    this.utils = cadUtils || cadService?.utils || null;
    this.action = action;

    const list = Array.isArray(entities) ? entities : (entities ? [entities] : []);
    this.entries = list.map((entity) => {
      const prevHidden = Boolean(entity.data?.isHidden);
      const prevLocked = Boolean(entity.data?.isLocked);
      let nextHidden = prevHidden;
      let nextLocked = prevLocked;

      if (action === 'hide') nextHidden = true;
      else if (action === 'unhideAll') nextHidden = false;
      else if (action === 'lock') nextLocked = true;
      else if (action === 'unlockAll') nextLocked = false;

      return { entity, prevHidden, prevLocked, nextHidden, nextLocked };
    });
  }

  execute() {
    this._applySnapshots(true);
  }

  undo() {
    this._applySnapshots(false);
  }

  _applySnapshots(useNext) {
    if (!this.entries.length) return;

    const layerManager = this.utils?.layerManager || null;
    const selectionManager = this.service?.selectionManager || null;
    const entitiesToPurge = [];
    const entitiesToSelect = [];

    this.entries.forEach(({ entity, prevHidden, prevLocked, nextHidden, nextLocked }) => {
      if (!entity) return;
      if (!entity.data) entity.data = {};

      const isHidden = useNext ? nextHidden : prevHidden;
      const isLocked = useNext ? nextLocked : prevLocked;

      if (isHidden) {
        entity.data.isHidden = true;
      } else {
        delete entity.data.isHidden;
      }

      if (isLocked) {
        entity.data.isLocked = true;
      } else {
        delete entity.data.isLocked;
      }

      const layerId = String(entity.data.layerId || '0');
      const layer = layerManager?.layers?.get(layerId);
      const isLayerVisible = layer ? layer.visible !== false : true;
      entity.visible = isLayerVisible && !isHidden;

      if (isHidden || isLocked) {
        entitiesToPurge.push(entity);
      } else if (useNext && (this.action === 'unhideAll' || this.action === 'unlockAll')) {
        const isInteractive = layerManager ? layerManager.isEntityInteractive(entity) : true;
        if (isInteractive) {
          entitiesToSelect.push(entity);
        }
      }
    });

    if (entitiesToPurge.length > 0 && selectionManager?.purgeEntitiesSelection) {
      selectionManager.purgeEntitiesSelection(entitiesToPurge);
    }

    if (entitiesToSelect.length > 0) {
      if (this.utils?.currentToolMode && this.utils.currentToolMode !== 'select' && typeof this.utils.setTool === 'function') {
        this.utils.setTool('select');
      }
      if (selectionManager?.selectEntities) {
        selectionManager.selectEntities(entitiesToSelect, false);
        queueMicrotask(() => {
          if (selectionManager.selectedEntities.length === 0) {
            selectionManager.selectEntities(entitiesToSelect, false);
          }
          this.utils?.selectionRenderEngine?.updateEntitiesStroke?.();
          this.utils?.selectionRenderEngine?.renderBezierHandles?.();
          const p = this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
          p?.view?.update?.();
        });
      }
    }

    this.utils?.uiManager?.updateUndoRedoUI?.();
  }
}