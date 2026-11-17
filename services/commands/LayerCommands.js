// =========================================================================
// COMANDOS LAYER DE HISTORIAL (UNDO / REDO)
// =========================================================================

export class CreateLayerCommand {
  constructor(layerManager, layerData) {
    this.manager = layerManager;
    this.layerData = layerData;
    this.createdLayerId = layerData?.id || null;
  }

  execute() {
    const layer = this.manager.createLayer({
      ...this.layerData,
      id: this.createdLayerId
    });
    if (layer) {
      this.createdLayerId = layer.id;
    }
  }

  undo() {
    if (this.createdLayerId) {
      this.manager.deleteLayer(this.createdLayerId);
    }
  }
}

// =========================================================================
// 2. COMANDO ACTIVAR CAPA (Recibe 4 parámetros)
// =========================================================================
export class SetActiveLayerCommand {
  constructor(layerManager, oldLayerId, newLayerId) {
    this.manager = layerManager;
    this.oldLayerId = oldLayerId;
    this.newLayerId = newLayerId;

    // Guardar estados previos para deshacer con precisión
    const targetLayer = this.manager.layers.get(newLayerId);
    this.wasVisible = targetLayer ? targetLayer.visible : true;
    this.wasLocked = targetLayer ? targetLayer.locked : false;
  }

  execute() {
    this.manager.setActiveLayer(this.newLayerId);
  }

  undo() {
    const layer = this.manager.layers.get(this.newLayerId);
    if (layer && String(this.oldLayerId) !== String(this.newLayerId)) {
      layer.visible = this.wasVisible;
      layer.locked = this.wasLocked;

      if (!this.wasVisible && this.manager.service?.entities) {
        this.manager.service.entities.forEach((ent) => {
          if (ent.data && String(ent.data.layerId) === String(this.newLayerId)) {
            ent.visible = false;
          }
        });
      }
    }

    this.manager.setActiveLayer(this.oldLayerId);
  }
}

export class DeleteLayerCommand {
  constructor(layerManager, layerId, targetLayerId, cadService) {
    this.manager = layerManager;
    this.layerId = String(layerId);
    // Si targetLayerId es null/vacío, significa eliminar el contenido
    this.targetLayerId = targetLayerId ? String(targetLayerId) : null;
    this.cadService = cadService;

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
            this.manager.assignEntityToLayer(ent, this.targetLayerId);
          } else {
            if (this.cadService.selectionManager?.exitEditMode && this.cadService.editingEntities?.includes(ent)) {
              this.cadService.selectionManager.exitEditMode(ent);
            }
            if (Array.isArray(this.cadService.selectedSegments) && typeof this.cadService.deselectSegment === 'function') {
              [...this.cadService.selectedSegments]
                .filter((seg) => seg?.path === ent)
                .forEach((seg) => this.cadService.deselectSegment(seg));
            }
            if (Array.isArray(this.cadService.selectedHandles) && typeof this.cadService.deselectHandle === 'function') {
              [...this.cadService.selectedHandles]
                .filter((h) => h?.segment?.path === ent)
                .forEach((h) => this.cadService.deselectHandle(h));
            }
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
    this.manager.ensureLayerGroups();

    this.affectedEntities.forEach((ent) => {
      if (!this.targetLayerId && this.cadService && !this.cadService.entities.includes(ent)) {
        this.cadService.entities.push(ent);
      }
      this.manager.assignEntityToLayer(ent, this.layerId);
      if (!ent.parent && paper?.project?.activeLayer) {
        paper.project.activeLayer.addChild(ent);
      }
    });

    if (this.oldActiveLayerId) {
      this.manager.setActiveLayer(this.oldActiveLayerId);
    }

    this.manager.syncZOrder();
    this.manager._notify();

    if (this.manager.utils?.selectionRenderEngine?.updateEntitiesStroke) {
      this.manager.utils.selectionRenderEngine.updateEntitiesStroke();
    }
    if (paper?.view) {
      paper.view.update();
    }
  }
}

export class UpdateLayerPropertyCommand {
  constructor(layerManager, layerId, propertyOrOldProps, oldValueOrNewProps, newValue) {
    this.manager = layerManager;
    this.layerId = layerId;

    if (propertyOrOldProps && typeof propertyOrOldProps === 'object') {
      this.oldProps = { ...propertyOrOldProps };
      this.newProps = { ...(oldValueOrNewProps || {}) };
      this.property = null;
    } else {
      this.property = propertyOrOldProps;
      this.oldValue = oldValueOrNewProps;
      this.newValue = newValue;
      this.oldProps = null;
      this.newProps = null;
    }
  }

  execute() {
    if (this.newProps) {
      Object.entries(this.newProps).forEach(([prop, val]) => {
        this.manager.updateLayerProperty(this.layerId, prop, val);
      });
    } else {
      this.manager.updateLayerProperty(this.layerId, this.property, this.newValue);
    }
  }

  undo() {
    if (this.oldProps) {
      Object.entries(this.oldProps).forEach(([prop, val]) => {
        this.manager.updateLayerProperty(this.layerId, prop, val);
      });
    } else {
      this.manager.updateLayerProperty(this.layerId, this.property, this.oldValue);
    }
  }
}

export class RenameLayerCommand {
  constructor(layerManager, layerId, oldName, newName) {
    this.manager = layerManager;
    this.layerId = layerId;
    this.oldName = oldName;
    this.newName = newName;
  }

  execute() {
    this.manager.updateLayerProperty(this.layerId, 'name', this.newName);
  }

  undo() {
    this.manager.updateLayerProperty(this.layerId, 'name', this.oldName);
  }
}

export class ReorderLayersCommand {
  constructor(layerManager, oldOrderEntries, newOrderEntries) {
    this.manager = layerManager;
    this.oldOrderEntries = oldOrderEntries;
    this.newOrderEntries = newOrderEntries;
  }

  execute() {
    this.manager.layers = new Map(this.newOrderEntries);
    this.manager.syncZOrder();
    this.manager._notify();
  }

  undo() {
    this.manager.layers = new Map(this.oldOrderEntries);
    this.manager.syncZOrder();
    this.manager._notify();
  }
}