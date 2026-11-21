export function populateentities(cadService) {
  if (!cadService || !cadService.utils) {
    throw new Error('populateentities requiere una instancia válida de cadService con utils inicializado.');
  }

  const utils = cadService.utils;
  const paperInstance = utils.paper || cadService.paper;
  if (!paperInstance) {
    throw new Error('Instancia de Paper.js no disponible en cadService.utils.');
  }

  const { layerManager, selectionRenderEngine } = utils;
  if (!layerManager || !selectionRenderEngine) {
    throw new Error('layerManager y selectionRenderEngine son obligatorios en cadService.utils.');
  }

  const project = paperInstance.project;
  const pointsLayer = utils.pointsLayer || (project && project.layers ? project.layers['pointsLayer'] : null);
  if (!pointsLayer) {
    throw new Error('pointsLayer no está disponible en el proyecto Paper.js.');
  }

  const registerDemoEntity = (entity, baseName) => {
    if (!entity) return;
    if (!entity.data) entity.data = {};

    if (baseName && typeof utils.generateNextEntityName === 'function') {
      const entityName = utils.generateNextEntityName(baseName);
      entity.name = entityName;
      entity.data.name = entityName;
    }

    if (typeof cadService.registerEntity === 'function') {
      cadService.registerEntity(entity, { layerId: '0' });
    } else {
      cadService.entities.push(entity);
    }

    if (entity.data.isPointEntity) {
      pointsLayer.addChild(entity);
    }

    layerManager.assignEntityToLayer(entity, '0');
  };

  const rect = new paperInstance.Path.Rectangle({
    point: [-180, -120],
    size: [120, 80],
    strokeColor: '#00e5ff',
    strokeWidth: 2,
    insert: false
  });
  rect.data = {
    layerId: '0',
    colorByLayer: true,
    widthByLayer: false,
    baseStrokeWidth: 2,
    isDynamicStroke: true
  };
  registerDemoEntity(rect, 'Rectángulo');

  const poly = new paperInstance.Path.RegularPolygon({
    center: [150, -80],
    sides: 6,
    radius: 50,
    strokeColor: '#f59e0b',
    strokeWidth: 2,
    insert: false
  });
  poly.data = {
    layerId: '0',
    colorByLayer: false,
    origStrokeColor: '#f59e0b',
    widthByLayer: false,
    baseStrokeWidth: 2,
    isDynamicStroke: true
  };
  registerDemoEntity(poly, 'Polígono');

  const curve = new paperInstance.Path({
    segments: [
      [new paperInstance.Point(-120, 100), null, new paperInstance.Point(40, -60)],
      [new paperInstance.Point(0, 180), new paperInstance.Point(-40, 0), new paperInstance.Point(40, 0)],
      [new paperInstance.Point(140, 100), new paperInstance.Point(-40, 50), null]
    ],
    strokeColor: '#10b981',
    strokeWidth: 2.5,
    insert: false
  });
  curve.data = {
    layerId: '0',
    colorByLayer: false,
    origStrokeColor: '#10b981',
    widthByLayer: false,
    baseStrokeWidth: 2.5,
    isDynamicStroke: true
  };
  registerDemoEntity(curve, 'Curva');

  const pt1 = cadService.createPointEntity(new paperInstance.Point(-120, -120), {
    layerId: '0',
    colorByLayer: true
  });
  registerDemoEntity(pt1, 'Punto');

  const pt2 = cadService.createPointEntity(new paperInstance.Point(-60, -120), {
    layerId: '0',
    colorByLayer: true
  });
  registerDemoEntity(pt2, 'Punto');

  layerManager.syncZOrder();
  selectionRenderEngine.updateEntitiesStroke();
}