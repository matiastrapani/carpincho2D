/**
 * services/commands/EntityCommands.js - Comandos de creación e importación de entidades
 */

export class AddLineCommand {
  constructor(cadService, lineEntity) {
    this.cadService = cadService;
    this.lineEntity = lineEntity;
  }

  execute() {
    if (!this.lineEntity.parent) {
      paper.project.activeLayer.addChild(this.lineEntity);
    }
    
    if (!this.cadService.demoEntities.includes(this.lineEntity)) {
      this.cadService.demoEntities.push(this.lineEntity);
    }
  }

  undo() {
    const idx = this.cadService.demoEntities.indexOf(this.lineEntity);
    if (idx !== -1) {
      this.cadService.demoEntities.splice(idx, 1);
    }
    
    const selIdx = this.cadService.selectedEntities.indexOf(this.lineEntity);
    if (selIdx !== -1) {
      this.cadService.selectedEntities.splice(selIdx, 1);
    }

    this.lineEntity.remove();
  }
}

export class AddPointCommand {
  constructor(service, pointEntity) {
    this.service = service;
    this.pointEntity = pointEntity;
  }

  execute() {
    if (!this.pointEntity) return;

    if (!this.pointEntity.parent) {
      paper.project.activeLayer.addChild(this.pointEntity);
    }
    if (!this.service.demoEntities.includes(this.pointEntity)) {
      this.service.demoEntities.push(this.pointEntity);
    }
    paper.view.update();
  }

  undo() {
    if (!this.pointEntity) return;

    const idx = this.service.demoEntities.indexOf(this.pointEntity);
    if (idx !== -1) {
      this.service.demoEntities.splice(idx, 1);
    }

    if (this.service.selectedEntities) {
      const selIdx = this.service.selectedEntities.indexOf(this.pointEntity);
      if (selIdx !== -1) {
        this.service.selectedEntities.splice(selIdx, 1);
      }
    }

    this.pointEntity.remove();
    paper.view.update();
  }
}

export class AddEntityCommand {
  constructor(cadService, entity) {
    this.cadService = cadService;
    this.entities = Array.isArray(entity) ? entity : [entity];
  }

  get entity() {
    return this.entities[0];
  }

  execute() {
    const drawLayer = window.cadUtils?.drawLayer || paper.project.activeLayer;
    const existingSet = new Set(this.cadService.demoEntities);

    this.entities.forEach(ent => {
      if (!existingSet.has(ent)) {
        this.cadService.demoEntities.push(ent);
      }

      if (!ent.parent || ent.layer !== drawLayer) {
        drawLayer.addChild(ent);
      }

      if (ent instanceof paper.Raster || ent.className === 'Raster') {
        ent.sendToBack();
        if (window.cadUtils?.gridGroup) {
          window.cadUtils.gridGroup.sendToBack();
        }
      }
    });

    if (window.cadUtils?.selectionRenderEngine) {
      window.cadUtils.selectionRenderEngine.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }
    paper.view.update();
  }

  undo() {
    const setToRemove = new Set(this.entities);

    if (Array.isArray(this.cadService.demoEntities)) {
      this.cadService.demoEntities = this.cadService.demoEntities.filter(ent => !setToRemove.has(ent));
    }

    if (Array.isArray(this.cadService.selectedEntities)) {
      this.cadService.selectedEntities = this.cadService.selectedEntities.filter(ent => !setToRemove.has(ent));
    }

    this.entities.forEach(ent => {
      if (ent && typeof ent.remove === 'function') {
        ent.remove();
      }
    });

    if (window.cadUtils?.selectionRenderEngine) {
      window.cadUtils.selectionRenderEngine.updateEntitiesStroke();
      window.cadUtils.selectionRenderEngine.renderBezierHandles();
    }
    paper.view.update();
  }
}

export class ImportSVGCommand {
  constructor(service, cadUtils, importedEntities, createdLayers) {
    this.service = service;
    this.utils = cadUtils;
    this.entities = importedEntities || [];
    this.createdLayers = createdLayers || [];
  }

  execute() {
    const layerManager = this.utils?.layerManager;
    if (layerManager && this.createdLayers.length > 0) {
      this.createdLayers.forEach(lData => {
        if (!layerManager.layers.has(lData.id)) layerManager.createLayer(lData);
      });
    }

    this.entities.forEach(ent => {
      if (!this.service.demoEntities.includes(ent)) this.service.demoEntities.push(ent);
      const layerId = String(ent.data?.layerId || '0');
      const layer = layerManager?.layers?.get(layerId);

      if (layer && layer.paperGroup && ent.parent !== layer.paperGroup) {
        layer.paperGroup.addChild(ent);
      } else if (!ent.parent && this.utils?.drawLayer) {
        this.utils.drawLayer.addChild(ent);
      }
      ent.visible = true;
    });

    if (window.layerPanelUI && typeof window.layerPanelUI.refresh === 'function') window.layerPanelUI.refresh();
    if (this.utils) {
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.utils.selectionRenderEngine.renderBezierHandles();
      if (window.paper?.view) window.paper.view.update();
    }
  }

  undo() {
    const layerManager = this.utils?.layerManager;
    this.entities.forEach(ent => {
      if (typeof this.service.deselectEntity === 'function') this.service.deselectEntity(ent);
      ent.remove();
      const idx = this.service.demoEntities.indexOf(ent);
      if (idx !== -1) this.service.demoEntities.splice(idx, 1);
    });

    if (layerManager && this.createdLayers.length > 0) {
      this.createdLayers.forEach(lData => {
        const layerId = String(lData.id);
        const layer = layerManager.layers.get(layerId);
        if (layer) {
          if (layer.paperGroup) layer.paperGroup.remove();
          layerManager.layers.delete(layerId);
        }
      });
      if (!layerManager.layers.has(layerManager.activeLayerId)) {
        layerManager.setActiveLayer(layerManager.layers.keys().next().value || '0');
      }
    }

    if (window.layerPanelUI && typeof window.layerPanelUI.refresh === 'function') window.layerPanelUI.refresh();
    if (this.utils?.selectionRenderEngine) {
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.utils.selectionRenderEngine.renderBezierHandles();
      if (window.paper?.view) window.paper.view.update();
    }
  }
}