export function populateentities(cadService) {
  const layerManager = cadService.utils?.layerManager;

  const rect = new paper.Path.Rectangle({
    point: [-180, -120],
    size: [120, 80],
    strokeColor: '#00e5ff',
    strokeWidth: 2
  });
  rect.data = {
    layerId: '0',
    colorByLayer: true,
    widthByLayer: false,
    baseStrokeWidth: 2,
    isDynamicStroke: true
  };
  cadService.entities.push(rect);

  const poly = new paper.Path.RegularPolygon({
    center: [150, -80],
    sides: 6,
    radius: 50,
    strokeColor: '#f59e0b',
    strokeWidth: 2
  });
  poly.data = {
    layerId: '0',
    colorByLayer: false,
    origStrokeColor: '#f59e0b',
    widthByLayer: false,
    baseStrokeWidth: 2,
    isDynamicStroke: true
  };
  cadService.entities.push(poly);

  const curve = new paper.Path({
    segments: [
      [new paper.Point(-120, 100), null, new paper.Point(40, -60)],
      [new paper.Point(0, 180), new paper.Point(-40, 0), new paper.Point(40, 0)],
      [new paper.Point(140, 100), new paper.Point(-40, 50), null]
    ],
    strokeColor: '#10b981',
    strokeWidth: 2.5
  });
  curve.data = {
    layerId: '0',
    colorByLayer: false,
    origStrokeColor: '#10b981',
    widthByLayer: false,
    baseStrokeWidth: 2.5,
    isDynamicStroke: true
  };
  cadService.entities.push(curve);

  const pt1 = cadService.createPointEntity(new paper.Point(-120, -120), { layerId: '0', colorByLayer: true });
  const pt2 = cadService.createPointEntity(new paper.Point(-60, -120), { layerId: '0', colorByLayer: true });

  if (layerManager) {
    [rect, poly, curve, pt1, pt2].forEach((ent) => {
      if (ent) {
        layerManager.assignEntityToLayer(ent, '0');
      }
    });
    layerManager.syncZOrder();
  }

  cadService.utils?.selectionRenderEngine?.updateEntitiesStroke?.();
}