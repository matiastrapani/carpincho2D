/**
 * services/commands/EntityCommands.js - Comandos de creación e importación de entidades
 */

export class AddLineCommand {
  constructor(cadService, lineEntity) {
    this.cadService = cadService;
    this.lineEntity = lineEntity;
  }

  _getPaper(utils) {
    return utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  execute() {
    const utils = this.cadService.utils;
    const layerManager = utils?.layerManager;
    const p = this._getPaper(utils);

    if (layerManager) {
      const targetLayerId = String(this.lineEntity.data?.layerId || layerManager.activeLayerId || '0');
      layerManager.assignEntityToLayer(this.lineEntity, targetLayerId);
    } else if (!this.lineEntity.parent) {
      (utils?.drawLayer || p?.project?.activeLayer)?.addChild(this.lineEntity);
    }

    if (!this.cadService.entities.includes(this.lineEntity)) {
      this.cadService.entities.push(this.lineEntity);
    }

    layerManager?.syncZOrder();
    p?.view?.update();
  }

  undo() {
    const p = this._getPaper(this.cadService.utils);
    const idx = this.cadService.entities.indexOf(this.lineEntity);
    if (idx !== -1) {
      this.cadService.entities.splice(idx, 1);
    }

    this.cadService.deselectEntity(this.lineEntity);
    this.lineEntity.remove();
    p?.view?.update();
  }
}

export class AddPointCommand {
  constructor(service, pointEntity) {
    this.service = service;
    this.pointEntity = pointEntity;
  }

  _getPaper(utils) {
    return utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  execute() {
    if (!this.pointEntity) return;

    const utils = this.service.utils;
    const layerManager = utils?.layerManager;
    const p = this._getPaper(utils);

    if (layerManager) {
      const targetLayerId = String(this.pointEntity.data?.layerId || layerManager.activeLayerId || '0');
      layerManager.assignEntityToLayer(this.pointEntity, targetLayerId);
    } else if (!this.pointEntity.parent) {
      (utils?.drawLayer || p?.project?.activeLayer)?.addChild(this.pointEntity);
    }

    if (!this.service.entities.includes(this.pointEntity)) {
      this.service.entities.push(this.pointEntity);
    }

    if (layerManager) {
      layerManager.syncZOrder();
    } else {
      p?.view?.update();
    }
  }

  undo() {
    if (!this.pointEntity) return;

    const p = this._getPaper(this.service.utils);
    const idx = this.service.entities.indexOf(this.pointEntity);
    if (idx !== -1) {
      this.service.entities.splice(idx, 1);
    }

    this.service.deselectEntity(this.pointEntity);
    this.pointEntity.remove();
    p?.view?.update();
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

  _getPaper(utils) {
    return utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  execute() {
    const utils = this.cadService.utils;
    const layerManager = utils?.layerManager;
    const p = this._getPaper(utils);
    const drawLayer = utils?.drawLayer || p?.project?.activeLayer;
    const existingSet = new Set(this.cadService.entities);

    this.entities.forEach((ent) => {
      if (!existingSet.has(ent)) {
        this.cadService.entities.push(ent);
      }

      if (layerManager) {
        const targetLayerId = String(ent.data?.layerId || layerManager.activeLayerId || '0');
        layerManager.assignEntityToLayer(ent, targetLayerId);
      } else if ((!ent.parent || ent.layer !== drawLayer) && drawLayer) {
        drawLayer.addChild(ent);
      }

      if ((p?.Raster && ent instanceof p.Raster) || ent.className === 'Raster') {
        ent.sendToBack();
        if (utils?.gridGroup) {
          utils.gridGroup.sendToBack();
        }
      }
    });

    layerManager?.syncZOrder();

    if (utils?.selectionRenderEngine) {
      utils.selectionRenderEngine.updateEntitiesStroke();
      utils.selectionRenderEngine.renderBezierHandles();
    }
    p?.view?.update();
  }

  undo() {
    const utils = this.cadService.utils;
    const p = this._getPaper(utils);
    const setToRemove = new Set(this.entities);

    if (Array.isArray(this.cadService.entities)) {
      this.cadService.entities = this.cadService.entities.filter((ent) => !setToRemove.has(ent));
    }

    this.entities.forEach((ent) => {
      this.cadService.deselectEntity(ent);
      if (ent && typeof ent.remove === 'function') {
        ent.remove();
      }
    });

    if (utils?.selectionRenderEngine) {
      utils.selectionRenderEngine.updateEntitiesStroke();
      utils.selectionRenderEngine.renderBezierHandles();
    }
    p?.view?.update();
  }
}

export class ImportSVGCommand {
  constructor(service, cadUtils, importedEntities, createdLayers) {
    this.service = service;
    this.utils = cadUtils;
    this.entities = importedEntities || [];
    this.createdLayers = createdLayers || [];
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  execute() {
    const layerManager = this.utils?.layerManager;
    const p = this._getPaper();

    if (layerManager && this.createdLayers.length > 0) {
      this.createdLayers.forEach((lData) => {
        if (!layerManager.layers.has(lData.id)) layerManager.createLayer(lData);
      });
    }

    this.entities.forEach((ent) => {
      if (!this.service.entities.includes(ent)) this.service.entities.push(ent);
      const layerId = String(ent.data?.layerId || '0');
      const layer = layerManager?.layers?.get(layerId);

      if (layer && layer.paperGroup && ent.parent !== layer.paperGroup) {
        layer.paperGroup.addChild(ent);
      } else if (!ent.parent && this.utils?.drawLayer) {
        this.utils.drawLayer.addChild(ent);
      }
      ent.visible = true;
    });

    layerManager?.syncZOrder();
    layerManager?._notify?.();
    this.utils?.layerPanelUI?.refresh?.();

    if (this.utils) {
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.utils.selectionRenderEngine.renderBezierHandles();
      p?.view?.update();
    }
  }

  undo() {
    const layerManager = this.utils?.layerManager;
    const p = this._getPaper();

    this.entities.forEach((ent) => {
      if (typeof this.service.deselectEntity === 'function') this.service.deselectEntity(ent);
      ent.remove();
      const idx = this.service.entities.indexOf(ent);
      if (idx !== -1) this.service.entities.splice(idx, 1);
    });

    if (layerManager && this.createdLayers.length > 0) {
      this.createdLayers.forEach((lData) => {
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

    layerManager?._notify?.();
    this.utils?.layerPanelUI?.refresh?.();

    if (this.utils?.selectionRenderEngine) {
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      this.utils.selectionRenderEngine.renderBezierHandles();
      p?.view?.update();
    }
  }
}