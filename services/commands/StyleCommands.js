/**
 * services/commands/StyleCommands.js - Comandos de modificación de estilos y propiedades
 */

export class ChangeOpacityCommand {
  constructor(cadService, entity, oldOpacity, newOpacity) {
    this.cadService = cadService;
    this.entity = entity;
    this.oldOpacity = oldOpacity;
    this.newOpacity = newOpacity;
  }

  execute() {
    this.applyOpacity(this.newOpacity);
  }

  undo() {
    this.applyOpacity(this.oldOpacity);
  }

  applyOpacity(val) {
    if (!this.entity) return;
    if (!this.entity.data) this.entity.data = {};

    this.entity.data.baseOpacity = val;
    this.entity.opacity = val;

    if (window.cadUI) {
      const opacityInput = document.getElementById('imageOpacityInput');
      const opacityVal = document.getElementById('opacityVal');
      if (opacityInput && opacityVal) {
        const pct = Math.round(val * 100);
        opacityInput.value = pct;
        opacityVal.innerText = `${pct}%`;
      }
    }
    paper.view.update();
  }
}

export class UpdateEntityPropertyCommand {
  constructor(cadService, entities, oldState, newState, cadUtils) {
    this.service = cadService;
    this.entities = Array.isArray(entities) ? entities : [entities];
    this.oldState = oldState;
    this.newState = newState;
    this.utils = cadUtils;
  }

  execute() {
    this._applyState(this.newState);
  }

  undo() {
    this._applyState(this.oldState);
  }

  _applyState(state) {
    if (!this.entities || this.entities.length === 0) return;

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

      if (entityState.name !== undefined) entity.name = entityState.name;
      if (entityState.opacity !== undefined) entity.opacity = entityState.opacity;
      if (entityState.origOpacity !== undefined && !entityState.opacityByLayer) entity.opacity = entityState.origOpacity;
      if (entityState.strokeColor !== undefined) entity.strokeColor = entityState.strokeColor;
      if (entityState.origStrokeColor !== undefined && !entityState.colorByLayer) entity.strokeColor = entityState.origStrokeColor;
    });

    if (this.utils?.updateEntitiesStroke) {
      this.utils.updateEntitiesStroke();
    }
    if (this.utils?.renderBezierHandles) {
      this.utils.renderBezierHandles();
    }
    if (window.paper?.view) {
      window.paper.view.update();
    }
    if (window.propertyPanelUI) {
      window.propertyPanelUI.refresh();
    }
  }
}

export class UpdateDefaultSettingsCommand {
  constructor(cadService, defaultSettingsRef, oldState, newState, cadUtils) {
    this.service = cadService;
    this.defaults = defaultSettingsRef;
    this.oldState = oldState;
    this.newState = newState;
    this.utils = cadUtils;
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

    if (this.utils?.activePath && this.utils?.propertyManager) {
      this.utils.propertyManager.applyDefaultSettings(this.utils.activePath);
    }
    if (this.utils?.updateEntitiesStroke) {
      this.utils.updateEntitiesStroke();
    }
    if (window.paper?.view) {
      window.paper.view.update();
    }
    if (window.propertyPanelUI) {
      window.propertyPanelUI.refresh();
    }
  }
}