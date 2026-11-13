// =========================================================================
// COMANDOS LAYER DE HISTORIAL (UNDO / REDO)
// =========================================================================

export class CreateLayerCommand {
  constructor(layerManager, layerData, panelUI) {
    this.manager = layerManager;
    this.layerData = layerData;
    this.panelUI = panelUI;
    this.createdLayerId = layerData?.id || null;
  }

  execute() {
    if (!this.createdLayerId) {
      const layer = this.manager.createLayer(this.layerData);
      if (layer) {
        this.createdLayerId = layer.id;
      }
    } else {
      this.manager.layers.set(this.createdLayerId, {
        ...this.layerData,
        id: this.createdLayerId,
        paperGroup: null
      });
      if (typeof this.manager.ensureLayerGroups === 'function') {
        this.manager.ensureLayerGroups();
      } else if (typeof this.manager.syncZOrder === 'function') {
        this.manager.syncZOrder();
      }
    }
    
    if (this.panelUI && typeof this.panelUI.refresh === 'function') {
      this.panelUI.refresh();
    }
  }

  undo() {
    if (this.createdLayerId) {
      this.manager.deleteLayer(this.createdLayerId);
      if (this.panelUI && typeof this.panelUI.refresh === 'function') {
        this.panelUI.refresh();
      }
    }
  }
}

// =========================================================================
// 2. COMANDO ACTIVAR CAPA (Recibe 4 parámetros)
// =========================================================================
export class SetActiveLayerCommand {
  constructor(layerManager, oldLayerId, newLayerId, panelUI) {
    this.manager = layerManager;
    this.oldLayerId = oldLayerId;
    this.newLayerId = newLayerId;
    this.panelUI = panelUI;

    // Guardar estados previos para deshacer con precisión
    const targetLayer = this.manager.layers.get(newLayerId);
    this.wasVisible = targetLayer ? targetLayer.visible : true;
    this.wasLocked = targetLayer ? targetLayer.locked : false;
  }

  execute() {
    this.manager.setActiveLayer(this.newLayerId);
    if (this.panelUI && typeof this.panelUI.refresh === 'function') {
      this.panelUI.refresh();
    }
  }

  undo() {
    const layer = this.manager.layers.get(this.newLayerId);
    if (layer && String(this.oldLayerId) !== String(this.newLayerId)) {
      layer.visible = this.wasVisible;
      layer.locked = this.wasLocked;
      
      if (!this.wasVisible && this.manager.service?.entities) {
        this.manager.service.entities.forEach(ent => {
          if (ent.data && String(ent.data.layerId) === String(this.newLayerId)) {
            ent.visible = false;
          }
        });
      }
    }

    this.manager.setActiveLayer(this.oldLayerId);
    if (this.panelUI && typeof this.panelUI.refresh === 'function') {
      this.panelUI.refresh();
    }
  }
}

export class DeleteLayerCommand {
  constructor(layerManager, layerId, targetLayerId, cadService, panelUI) {
    this.manager = layerManager;
    this.layerId = String(layerId);
    // Si targetLayerId es null/vacío, significa eliminar el contenido
    this.targetLayerId = targetLayerId ? String(targetLayerId) : null;
    this.cadService = cadService;
    this.panelUI = panelUI;

    this.oldEntries = Array.from(this.manager.layers.entries());
    this.layerBackup = { ...this.manager.layers.get(this.layerId) };
    this.oldActiveLayerId = String(this.manager.activeLayerId);
    this.affectedEntities = [];
  }

  execute() {
    this.affectedEntities = [];

    if (this.cadService && Array.isArray(this.cadService.entities)) {
      for (let i = this.cadService.entities.length - 1; i >= 0; i--) {
        const ent = this.cadService.entities[i];
        if (ent.data && String(ent.data.layerId) === this.layerId) {
          this.affectedEntities.push(ent);

          if (this.targetLayerId) {
            ent.data.layerId = this.targetLayerId;
            const targetLayer = this.manager.layers.get(this.targetLayerId);
            if (targetLayer) {
              ent.visible = targetLayer.visible !== false;
              if (targetLayer.paperGroup) {
                targetLayer.paperGroup.addChild(ent);
              }
            }
          } else {
            if (typeof this.cadService.deselectEntity === 'function') {
              this.cadService.deselectEntity(ent);
            }
            ent.remove();
            this.cadService.entities.splice(i, 1);
          }
        }
      }
    }

    if (String(this.manager.activeLayerId) === this.layerId) {
      const fallbackId = this.targetLayerId || Array.from(this.manager.layers.keys()).find((id) => String(id) !== this.layerId);
      if (fallbackId) {
        this.manager.setActiveLayer(fallbackId);
      }
    }

    this.manager.deleteLayer(this.layerId);
    this.manager.syncZOrder();
    this.panelUI?.refresh();

    if (this.manager.utils?.selectionRenderEngine?.updateEntitiesStroke) {
      this.manager.utils.selectionRenderEngine.updateEntitiesStroke();
    }
    if (paper?.view) {
      paper.view.update();
    }
  }

  undo() {
    if (!this.layerBackup || !this.oldEntries) return;

    this.manager.layers = new Map(this.oldEntries);
    const restoredLayer = this.manager.layers.get(this.layerId);

    this.affectedEntities.forEach((ent) => {
      if (ent.data) ent.data.layerId = this.layerId;

      if (this.targetLayerId) {
        if (restoredLayer) {
          ent.visible = restoredLayer.visible !== false;
          if (restoredLayer.paperGroup) {
            restoredLayer.paperGroup.addChild(ent);
          }
        }
      } else {
        if (restoredLayer?.paperGroup) {
          restoredLayer.paperGroup.addChild(ent);
        } else if (this.manager.utils?.drawLayer) {
          this.manager.utils.drawLayer.addChild(ent);
        } else if (paper?.project?.activeLayer) {
          paper.project.activeLayer.addChild(ent);
        }
        if (restoredLayer) {
          ent.visible = restoredLayer.visible !== false;
        }
        if (this.cadService && !this.cadService.entities.includes(ent)) {
          this.cadService.entities.push(ent);
        }
      }
    });

    if (this.oldActiveLayerId) {
      this.manager.setActiveLayer(this.oldActiveLayerId);
    }

    this.manager.syncZOrder();
    this.panelUI?.refresh();

    if (this.manager.utils?.selectionRenderEngine?.updateEntitiesStroke) {
      this.manager.utils.selectionRenderEngine.updateEntitiesStroke();
    }
    if (paper?.view) {
      paper.view.update();
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
    if (this.panelUI.utils?.selectionRenderEngine?.updateEntitiesStroke) {
      this.panelUI.utils.selectionRenderEngine.updateEntitiesStroke();
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
    this.manager.syncZOrder();
    if (this.panelUI && typeof this.panelUI.refresh === 'function') {
      this.panelUI.refresh();
    }
  }

  undo() {
    this.manager.layers = new Map(this.oldOrderEntries);
    this.manager.syncZOrder();
    if (this.panelUI && typeof this.panelUI.refresh === 'function') {
      this.panelUI.refresh();
    }
  }
}
