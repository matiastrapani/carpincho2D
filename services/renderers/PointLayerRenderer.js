

import { CAD_THEME } from '../../config/cadTheme.js';


export class PointLayerRenderer {
  constructor(cadService, cadUtils = null) {
    this._cadService = cadService;
    this._cadUtils = cadUtils;
  }

  get service() {
    return this._cadService;
  }

  get utils() {
    return this._cadUtils || this.service?.utils || null;
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  ensurePointsLayer() {
    const paperInst = this._getPaper();
    if (!paperInst || !paperInst.project) return null;

    const viewportManager = this.utils?.viewportManager;

    let pointsLayer = viewportManager?.pointsLayer
      || paperInst.project.layers.find((l) => l.name === 'pointsLayer');

    if (!pointsLayer) {
      const prevActive = paperInst.project.activeLayer;
      pointsLayer = new paperInst.Layer();
      pointsLayer.name = 'pointsLayer';
      if (prevActive && prevActive !== pointsLayer) {
        prevActive.activate();
      }
    }

    if (viewportManager && !viewportManager.pointsLayer) {
      viewportManager.pointsLayer = pointsLayer;
    }

    const drawLayer = viewportManager?.drawLayer || paperInst.project.layers.find((l) => l.name === 'drawLayer');
    const nodesLayer = viewportManager?.nodesLayer || paperInst.project.layers.find((l) => l.name === 'nodesLayer');
    const hudLayer = viewportManager?.hudLayer || paperInst.project.layers.find((l) => l.name === 'hudLayer');

    if (drawLayer) drawLayer.sendToBack();
    if (nodesLayer && drawLayer) nodesLayer.insertAbove(drawLayer);
    if (nodesLayer) {
      pointsLayer.insertAbove(nodesLayer);
    } else if (drawLayer) {
      pointsLayer.insertAbove(drawLayer);
    }
    if (hudLayer) hudLayer.bringToFront();

    return pointsLayer;
  }

  updatePointEntitiesScale() {
    const paperInst = this._getPaper();
    if (!paperInst || !paperInst.view) return;

    const zoom = paperInst.view.zoom;
    const pointsLayer = this.ensurePointsLayer();

    const nodeTheme = CAD_THEME?.node || {};
    const nodeSelectionTheme = CAD_THEME?.selection?.node || {};

    const entities = this.service?.entities || [];
    const hoveredPoints = [];
    const selectedPoints = [];

    entities.forEach((ent) => {
      if (ent && ent.data && ent.data.isPointEntity && ent.bounds) {
        if (pointsLayer && ent.parent !== pointsLayer) {
          pointsLayer.addChild(ent);
        }

        const isSelected = Boolean(this.service.selectedEntities?.includes(ent));
        const isHovered = this.service.hoveredEntity === ent;

        let radiusPx = isSelected
          ? (nodeSelectionTheme.selectedRadiusPx || nodeTheme.selectedRadiusPx || 4.0)
          : (nodeSelectionTheme.normalRadiusPx || nodeTheme.normalRadiusPx || 3.5);

        if (isHovered && !isSelected) {
          radiusPx += 0.5;
        }

        const targetRadius = radiusPx / zoom;
        const center = ent.position.clone();
        ent.bounds.width = targetRadius * 2;
        ent.bounds.height = targetRadius * 2;
        ent.position = center;

        let strokeWidthPx = isSelected
          ? (nodeSelectionTheme.selectedWidthPx || nodeTheme.selectedStrokeWidthPx || 2.0)
          : (nodeSelectionTheme.normalWidthPx || nodeTheme.strokeWidthPx || 1.0);

        if (isHovered && !isSelected) {
          strokeWidthPx *= 1.5;
        }

        ent.strokeWidth = strokeWidthPx / zoom;

        if (isSelected) {
          selectedPoints.push(ent);
        } else if (isHovered) {
          hoveredPoints.push(ent);
        }
      }
    });

    hoveredPoints.forEach((ent) => ent.bringToFront());
    selectedPoints.forEach((ent) => ent.bringToFront());

    paperInst.view.update();
  }

}