// =========================================================================
// COMANDOS LAYER DE HISTORIAL (UNDO / REDO)
// =========================================================================

export class CreateLayerCommand {
  constructor(layerManager, layerData, panelUI) {
    this.manager = layerManager;
    this.layerData = layerData;
    this.panelUI = panelUI;
    this.createdLayerId = layerData.id || null;
  }

  execute() {
    if (!this.createdLayerId) {
      const layer = this.manager.createLayer(this.layerData);
      this.createdLayerId = layer.id;
    } else {
      this.manager.layers.set(this.createdLayerId, { ...this.layerData, id: this.createdLayerId });
    }
    // ❌ Se eliminó: this.manager.setActiveLayer(this.createdLayerId);
    this.panelUI.refresh();
  }

  undo() {
    if (this.createdLayerId) {
      this.manager.deleteLayer(this.createdLayerId);
      this.panelUI.refresh();
    }
  }
}

export class SetActiveLayerCommand {
  constructor(layerManager, oldLayerId, newLayerId, panelUI) {
    this.manager = layerManager;
    this.oldLayerId = oldLayerId;
    this.newLayerId = newLayerId;
    this.panelUI = panelUI;
  }

  execute() {
    const layer = this.manager.layers.get(this.newLayerId);
    if (layer) {
      layer.visible = true;
      layer.locked = false;
    }
    this.manager.setActiveLayer(this.newLayerId);
    this.panelUI.refresh();
  }

  undo() {
    this.manager.setActiveLayer(this.oldLayerId);
    this.panelUI.refresh();
  }
}

export class DeleteLayerCommand {
  constructor(layerManager, layerId, targetLayerId, cadService, panelUI) {
    this.manager = layerManager;
    this.layerId = layerId;
    this.targetLayerId = targetLayerId;
    this.cadService = cadService;
    this.panelUI = panelUI;
    
    // Respaldos para Undo
    this.oldEntries = Array.from(this.manager.layers.entries());
    this.layerBackup = { ...this.manager.layers.get(layerId) };
    this.oldActiveLayerId = this.manager.activeLayerId;
    this.affectedEntities = [];
  }

  execute() {
    this.affectedEntities = [];
    
    // Reasignar elementos a la capa de destino
    if (this.cadService && this.cadService.demoEntities && this.targetLayerId) {
      this.cadService.demoEntities.forEach((ent) => {
        if (ent.data && String(ent.data.layerId) === String(this.layerId)) {
          this.affectedEntities.push(ent);
          ent.data.layerId = this.targetLayerId;
        }
      });
    }

    // Si la capa eliminada era la activa, activar la capa de destino
    if (String(this.manager.activeLayerId) === String(this.layerId) && this.targetLayerId) {
      this.manager.setActiveLayer(this.targetLayerId);
    }

    this.manager.deleteLayer(this.layerId);
    this.panelUI._syncPaperZIndex();
    this.panelUI.refresh();
    
    if (this.panelUI.utils?.updateEntitiesStroke) {
      this.panelUI.utils.updateEntitiesStroke();
    }
  }

  undo() {
    if (this.layerBackup && this.oldEntries) {
      // Reconstruir lista de capas preservando el orden original
      this.manager.layers = new Map(this.oldEntries);

      // Devolver los elementos a la capa restaurada
      this.affectedEntities.forEach((ent) => {
        if (ent.data) ent.data.layerId = this.layerId;
      });

      // Restaurar capa activa previa
      if (this.oldActiveLayerId) {
        this.manager.setActiveLayer(this.oldActiveLayerId);
      }

      this.panelUI._syncPaperZIndex();
      this.panelUI.refresh();
      
      if (this.panelUI.utils?.updateEntitiesStroke) {
        this.panelUI.utils.updateEntitiesStroke();
      }
      if (window.paper?.view) {
        window.paper.view.update();
      }
    }
  }
}

export class UpdateLayerPropertyCommand {
  constructor(layerManager, layerId, property, oldValue, newValue, panelUI) {
    this.manager = layerManager;
    this.layerId = layerId;
    this.property = property;
    this.oldValue = oldValue;
    this.newValue = newValue;
    this.panelUI = panelUI;
  }

  execute() {
    this.manager.updateLayerProperty(this.layerId, this.property, this.newValue);
    this.panelUI.refresh();
    this._updateCanvas();
  }

  undo() {
    this.manager.updateLayerProperty(this.layerId, this.property, this.oldValue);
    this.panelUI.refresh();
    this._updateCanvas();
  }

  _updateCanvas() {
    if (this.panelUI.utils?.updateEntitiesStroke) {
      this.panelUI.utils.updateEntitiesStroke();
    }
    if (window.paper?.view) {
      window.paper.view.update();
    }
  }
}

export class RenameLayerCommand {
  constructor(layerManager, layerId, oldName, newName, panelUI) {
    this.manager = layerManager;
    this.layerId = layerId;
    this.oldName = oldName;
    this.newName = newName;
    this.panelUI = panelUI;
  }

  execute() {
    this.manager.updateLayerProperty(this.layerId, 'name', this.newName);
    this.panelUI.refresh();
  }

  undo() {
    this.manager.updateLayerProperty(this.layerId, 'name', this.oldName);
    this.panelUI.refresh();
  }
}

export class ReorderLayersCommand {
  constructor(layerManager, oldOrderEntries, newOrderEntries, panelUI) {
    this.manager = layerManager;
    this.oldOrderEntries = oldOrderEntries;
    this.newOrderEntries = newOrderEntries;
    this.panelUI = panelUI;
  }

  execute() {
    this.manager.layers = new Map(this.newOrderEntries);
    this.panelUI._syncPaperZIndex();
    this.panelUI.refresh();
  }

  undo() {
    this.manager.layers = new Map(this.oldOrderEntries);
    this.panelUI._syncPaperZIndex();
    this.panelUI.refresh();
  }
}
