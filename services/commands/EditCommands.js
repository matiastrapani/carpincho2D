/**
 * services/commands/EditCommands.js - Comandos de edición topológica (División, Recorte y Extensión)
 */

export class DivideCommand {
  constructor(cadService, pointsCreated) {
    this.cadService = cadService;
    this.pointsCreated = pointsCreated;
  }

  _getRuntime() {
    const utils = this.cadService?.utils || null;
    const paperInst = utils?.paper || (typeof paper !== 'undefined' ? paper : null);
    return { utils, paperInst };
  }

  execute() {
    const { utils, paperInst } = this._getRuntime();
    const layerManager = utils?.layerManager;
    const fallbackLayer = utils?.pointsLayer || utils?.drawLayer || paperInst?.project?.activeLayer;

    this.pointsCreated.forEach((pt) => {
      if (!pt) return;

      if (layerManager) {
        const targetLayerId = String(pt.data?.layerId || layerManager.activeLayerId || '0');
        layerManager.assignEntityToLayer(pt, targetLayerId);
      } else if (!pt.parent && fallbackLayer) {
        fallbackLayer.addChild(pt);
      }

      if (!this.cadService.entities.includes(pt)) {
        this.cadService.entities.push(pt);
      }
    });

    if (layerManager) {
      layerManager.syncZOrder();
    }

    const renderEngine = this.cadService.selectionRenderEngine || utils?.selectionRenderEngine;
    if (renderEngine?.renderBezierHandles) {
      renderEngine.renderBezierHandles();
    }
    if (paperInst?.view) {
      paperInst.view.update();
    }
  }

  undo() {
    const { utils, paperInst } = this._getRuntime();

    this.pointsCreated.forEach((pt) => {
      if (!pt) return;

      const idx = this.cadService.entities.indexOf(pt);
      if (idx !== -1) {
        this.cadService.entities.splice(idx, 1);
      }

      this.cadService.deselectEntity(pt);
      pt.remove();
    });

    const renderEngine = this.cadService.selectionRenderEngine || utils?.selectionRenderEngine;
    if (renderEngine?.renderBezierHandles) {
      renderEngine.renderBezierHandles();
    }
    if (paperInst?.view) {
      paperInst.view.update();
    }
  }
}

export class TrimCommand {
  constructor(cadService, originalPath, remainingPaths, originalIndex) {
    this.cadService = cadService;
    this.originalPath = originalPath;
    this.remainingPaths = remainingPaths;
    this.originalIndex = originalIndex;

    const { utils, paperInst } = this._getRuntime();
    this.targetLayer = (originalPath && originalPath.layer)
      ? originalPath.layer
      : (utils?.drawLayer || paperInst?.project?.activeLayer);
  }

  _getRuntime() {
    const utils = this.cadService?.utils || null;
    const paperInst = utils?.paper || (typeof paper !== 'undefined' ? paper : null);
    return { utils, paperInst };
  }

  cleanupEditState() {
    const { utils } = this._getRuntime();

    if (typeof this.cadService.deselectAllEditingEntities === 'function') {
      this.cadService.deselectAllEditingEntities();
    } else {
      this.cadService.selectedEntities = [];
      this.cadService.selectedSegments = [];
      this.cadService.editingEntities = [];
    }

    if (Array.isArray(this.cadService.selectedCurves)) {
      this.cadService.selectedCurves = [];
    }

    if (utils) {
      utils.hoveredCurve = null;
      utils.hoveredHandle = null;
      utils.clearHoverHighlight();
      utils.selectionRenderEngine?.updateEntitiesStroke();
    }
  }

  execute() {
    const { utils, paperInst } = this._getRuntime();
    const idx = this.cadService.entities.indexOf(this.originalPath);
    if (idx !== -1) {
      this.cadService.entities.splice(idx, 1);
    }
    this.originalPath.remove();

    this.remainingPaths.forEach((p) => {
      if ((!p.parent || p.layer !== this.targetLayer) && this.targetLayer) {
        this.targetLayer.addChild(p);
      }
      if (!this.cadService.entities.includes(p)) {
        this.cadService.entities.push(p);
      }
    });

    this.cleanupEditState();
    const renderEngine = this.cadService.selectionRenderEngine || utils?.selectionRenderEngine;
    if (renderEngine?.renderBezierHandles) {
      renderEngine.renderBezierHandles();
    }
    if (paperInst?.view) {
      paperInst.view.update();
    }
  }

  undo() {
    const { utils, paperInst } = this._getRuntime();

    this.remainingPaths.forEach((p) => {
      const idx = this.cadService.entities.indexOf(p);
      if (idx !== -1) {
        this.cadService.entities.splice(idx, 1);
      }
      p.remove();
    });

    if ((!this.originalPath.parent || this.originalPath.layer !== this.targetLayer) && this.targetLayer) {
      this.targetLayer.addChild(this.originalPath);
    }
    this.originalPath.visible = true;

    if (!this.cadService.entities.includes(this.originalPath)) {
      if (this.originalIndex !== -1 && this.originalIndex <= this.cadService.entities.length) {
        this.cadService.entities.splice(this.originalIndex, 0, this.originalPath);
      } else {
        this.cadService.entities.push(this.originalPath);
      }
    }

    this.cleanupEditState();
    const renderEngine = this.cadService.selectionRenderEngine || utils?.selectionRenderEngine;
    if (renderEngine?.renderBezierHandles) {
      renderEngine.renderBezierHandles();
    }
    if (paperInst?.view) {
      paperInst.view.update();
    }
  }
}

export class ExtendCommand {
  constructor(cadService, path, initialSegments, finalSegments) {
    this.cadService = cadService;
    this.path = path;
    this.initialSegments = initialSegments;
    this.finalSegments = finalSegments;
  }

  execute() {
    this.applySegments(this.finalSegments);
  }

  undo() {
    this.applySegments(this.initialSegments);
  }

  applySegments(segmentsData) {
    if (!this.path) return;

    const utils = this.cadService?.utils || null;
    const paperInst = utils?.paper || (typeof paper !== 'undefined' ? paper : null);
    const PointCtor = paperInst?.Point || (typeof paper !== 'undefined' ? paper.Point : null);

    while (this.path.segments.length > segmentsData.length) {
      this.path.removeSegment(this.path.segments.length - 1);
    }
    while (this.path.segments.length < segmentsData.length && PointCtor) {
      this.path.addSegment(new PointCtor(0, 0));
    }

    segmentsData.forEach((s, i) => {
      this.path.segments[i].point = s.point.clone();
      this.path.segments[i].handleIn = s.handleIn.clone();
      this.path.segments[i].handleOut = s.handleOut.clone();
    });

    const renderEngine = this.cadService.selectionRenderEngine || utils?.selectionRenderEngine;
    if (renderEngine) {
      renderEngine.updateEntitiesStroke();
      renderEngine.renderBezierHandles();
    }
    if (paperInst?.view) {
      paperInst.view.update();
    }
  }
}

export class BatchTrimCommand {
  constructor(commands = []) {
    this.commands = commands;
  }

  execute() {
    for (let i = 0; i < this.commands.length; i++) {
      this.commands[i].execute();
    }
  }

  undo() {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }
}