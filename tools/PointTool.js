/**
 * tools/PointTool.js - Herramienta para Puntos y División de Entidades
 * Soporta selección estándar, caja de selección verde (#008800) y definición del punto de inicio en división por distancia.
 */

import { BaseTool } from './BaseTool.js';
import { AddPointCommand, DivideCommand } from '../services/commands/cadCommands.js';

export class PointTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'POINT. Haz clic en el lienzo para colocar un punto o ingresa coordenadas (X,Y).';
    this.isSelectingBox = false;
    this.boxStartPoint = null;
    this.selectionBoxPath = null;
    
    // Control de puntos de inicio personalizados por entidad
    this.customStartPoints = new Map();
    this.startPointMarkersGroup = null;
    this.divisionDistance = null;
    this.divisionCount = null;
  }

  // --- HELPER DE CONFIGURACIÓN POR DEFECTO PARA PUNTOS ---
  getPointDefaultOpts() {
    const activeLayerId = String(this.utils.layerManager?.getActiveLayer()?.id || this.utils.layerManager?.activeLayerId || '0');
    const defaults = this.utils.propertyManager?.defaultSettings || { color: 'BYLAYER', opacity: 'BYLAYER', strokeWidth: 'BYLAYER' };
    const activeLayer = this.utils.layerManager ? this.utils.layerManager.getActiveLayer() : null;

    const isColorByLayer = defaults.color === 'BYLAYER';
    const isOpacityByLayer = defaults.opacity === 'BYLAYER';

    const resolvedOpacity = isOpacityByLayer 
      ? (activeLayer && activeLayer.opacity !== undefined ? activeLayer.opacity : 1.0) 
      : (typeof defaults.opacity === 'number' ? defaults.opacity : 1.0);

    return {
      layerId: activeLayerId,
      colorByLayer: isColorByLayer,
      strokeColor: !isColorByLayer ? defaults.color : undefined,
      opacityByLayer: isOpacityByLayer,
      origOpacity: !isOpacityByLayer ? resolvedOpacity : undefined,
      opacity: resolvedOpacity
    };
  }

  onActivate() {
    this.service.lastInsertedPoint = null;
    const mode = this.utils.currentToolMode;

    if (mode === 'point') {
      this.setPrompt('POINT. Haz clic en el lienzo para colocar un punto o ingresa coordenadas (X,Y):');
      return;
    }

    if (mode === 'divide_count' || mode === 'divide_dist') {
      const validSelected = this.service.selectedEntities.filter(
        ent => ent && !ent.data?.isPointEntity
      );

      if (validSelected.length > 0) {
        this.utils.divisionSelectedEntities = [...validSelected];
        this.askForDivisionValue();
      } else {
        this.utils.divisionStep = 'select';
        this.utils.divisionSelectedEntities = [];

        if (mode === 'divide_count') {
          this.setPrompt('DIVIDIR (N): Selecciona entidad/es y presiona ENTER o Clic Derecho para continuar.');
        } else {
          this.setPrompt('DIVIDIR (Dist): Selecciona entidad/es y presiona ENTER o Clic Derecho para continuar.');
        }
      }
    }
  }

  askForDivisionValue() {
    const targets = (this.utils.divisionSelectedEntities && this.utils.divisionSelectedEntities.length > 0)
      ? this.utils.divisionSelectedEntities
      : this.service.selectedEntities.filter(ent => ent && !ent.data?.isPointEntity);

    this.utils.divisionSelectedEntities = [...targets];
    this.utils.divisionStep = 'input';

    this.service.editingEntities = [];
    this.service.deselectAllSegments();
    if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();
    if (this.utils.updateEntitiesStroke) this.utils.updateEntitiesStroke();
    if (window.paper?.view) window.paper.view.update();

    const count = this.utils.divisionSelectedEntities.length;
    const mode = this.utils.currentToolMode;

    if (mode === 'divide_count') {
      this.setPrompt(`DIVIDIR (N): Especifica el número de segmentos (${count} objetivo/s):`);
    } else {
      this.setPrompt(`DIVIDIR (Dist): Especifica la distancia de división (${count} objetivo/s):`);
    }

    const cmdInput = document.getElementById('cmdInput');
    if (cmdInput) {
      cmdInput.focus();
      cmdInput.select();
    }
  }

  renderStartPointMarkers() {
    if (this.startPointMarkersGroup) {
      this.startPointMarkersGroup.remove();
      this.startPointMarkersGroup = null;
    }

    this.startPointMarkersGroup = new paper.Group();

    this.utils.divisionSelectedEntities.forEach(entity => {
      let pt = this.customStartPoints.get(entity);
      if (!pt && entity.getPointAt) {
        pt = entity.getPointAt(0);
      }

      if (pt) {
        const marker = new paper.Path.Circle({
          center: pt,
          radius: 5 / paper.view.zoom,
          fillColor: '#00ffcc',
          strokeColor: '#000000',
          strokeWidth: 1.5 / paper.view.zoom
        });
        this.startPointMarkersGroup.addChild(marker);
      }
    });

    if (window.paper?.view) window.paper.view.update();
  }

  onMouseDown(event) {
    if (event.event.button !== 0) return;

    const mode = this.utils.currentToolMode;

    if (mode === 'point') {
      const osnap = this.service.calculateOsnap(
        event.point, 
        (pt, type) => this.utils.renderSnapMarker(pt, type)
      );
      this.createPointAt(osnap.point);
      return;
    }

    // PASO: Selección del punto de inicio en División por Distancia
    if (mode === 'divide_dist' && this.utils.divisionStep === 'start_point') {
      const hitEntity = paper.project.hitTest(event.point, {
        stroke: true, fill: true, tolerance: 10 / paper.view.zoom,
        match: (res) => this.utils.divisionSelectedEntities.includes(res.item)
      });

      if (hitEntity && hitEntity.item && hitEntity.item.getNearestPoint) {
        const nearestPt = hitEntity.item.getNearestPoint(event.point);
        this.customStartPoints.set(hitEntity.item, nearestPt);
        this.renderStartPointMarkers();
        this.setPrompt('Punto de inicio actualizado. Haz clic en otra entidad o presiona ENTER / Clic Derecho para ejecutar:');
        return;
      }
    }

    // PASO: Selección de Entidades
    if ((mode === 'divide_count' || mode === 'divide_dist') && this.utils.divisionStep === 'select') {
      const hitEntity = paper.project.hitTest(event.point, {
        stroke: true, fill: true, tolerance: 8 / paper.view.zoom,
        match: (res) => this.service.demoEntities.includes(res.item) && !res.item.data?.isPointEntity
      });

      if (hitEntity && hitEntity.item) {
        const item = hitEntity.item;
        const existingIdx = this.utils.divisionSelectedEntities.indexOf(item);

        if (existingIdx !== -1) {
          this.utils.divisionSelectedEntities.splice(existingIdx, 1);
          const selIdx = this.service.selectedEntities.indexOf(item);
          if (selIdx !== -1) this.service.selectedEntities.splice(selIdx, 1);
        } else {
          this.utils.divisionSelectedEntities.push(item);
          if (!this.service.selectedEntities.includes(item)) {
            this.service.selectedEntities.push(item);
          }
        }

        this.service.editingEntities = [];
        this.service.deselectAllSegments();
        if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();
        if (this.utils.updateEntitiesStroke) this.utils.updateEntitiesStroke();
        if (window.paper?.view) window.paper.view.update();

        const count = this.utils.divisionSelectedEntities.length;
        this.setPrompt(`Objetivos seleccionados: ${count}. Presiona ENTER o Clic Derecho para continuar...`);
        return;
      }

      this.isSelectingBox = true;
      this.boxStartPoint = event.point;
    }
  }

  onMouseDrag(event) {
    if (!this.isSelectingBox || !this.boxStartPoint) return;

    if (this.selectionBoxPath) {
      this.selectionBoxPath.remove();
    }

    const currPt = event.point;
    const isWindowSelection = currPt.x >= this.boxStartPoint.x;

    this.selectionBoxPath = new paper.Path.Rectangle({
      from: this.boxStartPoint,
      to: currPt,
      strokeColor: '#008800',
      fillColor: new paper.Color(0, 0.53, 0, 0.15),
      strokeWidth: 1 / paper.view.zoom,
      dashArray: isWindowSelection ? null : [2 / paper.view.zoom, 2 / paper.view.zoom]
    });

    if (window.paper?.view) {
      window.paper.view.update();
    }
  }

  onMouseUp(event) {
    if (this.isSelectingBox) {
      if (this.selectionBoxPath) {
        const startPt = this.boxStartPoint;
        const endPt = event.point;
        const dragDistance = startPt.getDistance(endPt);

        if (dragDistance >= 3 / paper.view.zoom) {
          const boxBounds = this.selectionBoxPath.bounds;
          const isWindowSelection = endPt.x >= startPt.x;

          const lineIntersectsBox = (p1, p2, rect) => {
            const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
            const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
            if (maxX < rect.left || minX > rect.right || maxY < rect.top || minY > rect.bottom) return false;
            if (rect.contains(p1) || rect.contains(p2)) return true;

            const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
            const intersectLines = (a, b, c, d) => (ccw(a, c, d) !== ccw(b, c, d)) && (ccw(a, b, c) !== ccw(a, b, d));

            return intersectLines(p1, p2, rect.topLeft, rect.topRight) ||
                   intersectLines(p1, p2, rect.topRight, rect.bottomRight) ||
                   intersectLines(p1, p2, rect.bottomRight, rect.bottomLeft) ||
                   intersectLines(p1, p2, rect.bottomLeft, rect.topLeft);
          };

          const isPathSelectedByBox = (path) => {
            if (!path || !path.bounds) return false;
            if (!boxBounds.intersects(path.bounds) && !boxBounds.contains(path.bounds)) return false;
            if (isWindowSelection) return boxBounds.contains(path.bounds);
            if (boxBounds.contains(path.bounds)) return true;

            const segments = path.segments || [];
            for (let i = 0; i < segments.length; i++) {
              if (boxBounds.contains(segments[i].point)) return true;
            }

            const curves = path.curves || [];
            for (let i = 0; i < curves.length; i++) {
              const c = curves[i];
              if (!boxBounds.intersects(c.bounds)) continue;

              const p0 = c.segment1.point;
              const p1 = c.segment2.point;
              const h1 = c.segment1.handleOut;
              const h2 = c.segment2.handleIn;

              if (h1.isZero() && h2.isZero()) {
                if (lineIntersectsBox(p0, p1, boxBounds)) return true;
              } else {
                const c1 = p0.add(h1);
                const c2 = p1.add(h2);

                const getBezierPt = (t) => {
                  const mt = 1 - t;
                  return p0.multiply(mt * mt * mt)
                    .add(c1.multiply(3 * mt * mt * t))
                    .add(c2.multiply(3 * mt * t * t))
                    .add(p1.multiply(t * t * t));
                };

                let prevPt = p0;
                const steps = 4;
                for (let k = 1; k <= steps; k++) {
                  const currPt = (k === steps) ? p1 : getBezierPt(k / steps);
                  if (boxBounds.contains(currPt) || lineIntersectsBox(prevPt, currPt, boxBounds)) return true;
                  prevPt = currPt;
                }
              }
            }
            return false;
          };

          const candidates = this.service.demoEntities.filter(
            ent => ent && !ent.data?.isPointEntity && ent.bounds
          );

          candidates.forEach(entity => {
            let shouldSelect = false;

            if (entity instanceof paper.Path) {
              shouldSelect = isPathSelectedByBox(entity);
            } else if (entity instanceof paper.CompoundPath) {
              if (entity.children) {
                shouldSelect = entity.children.some(child => isPathSelectedByBox(child));
              }
            } else {
              shouldSelect = isWindowSelection 
                ? boxBounds.contains(entity.bounds) 
                : (boxBounds.contains(entity.bounds) || boxBounds.intersects(entity.bounds));
            }

            if (shouldSelect) {
              const layerId = String(entity.data?.layerId || '0');
              const layerManager = this.utils?.layerManager || window.cadUtils?.layerManager;
              const layer = layerManager?.layers?.get(layerId);

              if (!layer || !layer.locked) {
                if (!this.utils.divisionSelectedEntities.includes(entity)) {
                  this.utils.divisionSelectedEntities.push(entity);
                }
                if (!this.service.selectedEntities.includes(entity)) {
                  this.service.selectedEntities.push(entity);
                }
              }
            }
          });

          this.service.editingEntities = [];
          this.service.deselectAllSegments();
          if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();
          if (this.utils.updateEntitiesStroke) this.utils.updateEntitiesStroke();

          const count = this.utils.divisionSelectedEntities.length;
          this.setPrompt(`Objetivos seleccionados: ${count}. Presiona ENTER o Clic Derecho para continuar...`);
        }

        this.selectionBoxPath.remove();
        this.selectionBoxPath = null;
      }

      this.isSelectingBox = false;
      if (window.paper?.view) {
        window.paper.view.update();
      }
    }
  }

  createPointAt(pt, coordsLabel = null) {
    const opts = this.getPointDefaultOpts();
    const pointEntity = this.service.createPointEntity(pt, opts);

    if (pointEntity) {
      if (!pointEntity.data) pointEntity.data = {};

      // Asegura la capa activa seleccionada
      pointEntity.data.layerId = opts.layerId;

      // Nombre secuencial ('Punto 1', 'Punto 2', ...)
      const pointName = this.utils.generateNextEntityName ? this.utils.generateNextEntityName('Punto') : 'Punto';
      pointEntity.name = pointName;
      pointEntity.data.name = pointName;

      // Sincronizar propiedades por defecto
      if (this.utils.propertyManager) {
        this.utils.propertyManager.applyDefaultSettings(pointEntity);
      }

      const cmd = new AddPointCommand(this.service, pointEntity);
      this.service.executeCommand(cmd);

      this.service.editingEntities = [];
      this.service.deselectAllSegments();
      if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();
      if (this.utils.updateEntitiesStroke) this.utils.updateEntitiesStroke();
      if (window.paper?.view) window.paper.view.update();

      const cadX = pt.x.toFixed(2);
      const cadY = (-pt.y).toFixed(2);
      const label = coordsLabel || `${cadX}, ${cadY}`;

      this.setPrompt(`Punto insertado en (${label}). Haz clic o ingresa coordenadas (X,Y):`);
    }
  }

  onContextMenu(event) {
    const mode = this.utils.currentToolMode;
    
    if (mode === 'point') {
      this.exitToSelect();
      return true;
    }

    if (mode === 'divide_dist' && this.utils.divisionStep === 'start_point') {
      this.executeDivision();
      return true;
    }

    if ((mode === 'divide_count' || mode === 'divide_dist') && this.utils.divisionStep === 'select') {
      if (this.utils.divisionSelectedEntities.length > 0) {
        this.askForDivisionValue();
        return true;
      }
    }
    return false;
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    const mode = this.utils.currentToolMode;

    if (mode === 'point' && (key === 'Enter' || key === 'NumpadEnter' || key === 'Space' || key === 'Escape')) {
      this.exitToSelect();
      return true;
    }

    if (mode === 'divide_dist' && this.utils.divisionStep === 'start_point') {
      if (key === 'Enter' || key === 'NumpadEnter' || key === 'Space') {
        this.executeDivision();
        return true;
      }
    }

    if ((mode === 'divide_count' || mode === 'divide_dist') && this.utils.divisionStep === 'select') {
      if (key === 'Enter' || key === 'NumpadEnter' || key === 'Space') {
        if (this.utils.divisionSelectedEntities.length > 0) {
          this.askForDivisionValue();
          return true;
        }
      }
    }
    return false;
  }

  onCommandInput(input) {
    const mode = this.utils.currentToolMode;

    if (mode === 'point') {
      const raw = input.trim();
      if (raw.includes(',')) {
        const parts = raw.split(',');
        const x = parseFloat(parts[0]);
        const cadY = parseFloat(parts[1]);

        if (!isNaN(x) && !isNaN(cadY)) {
          const canvasY = -cadY;
          const pt = new paper.Point(x, canvasY);
          this.createPointAt(pt, `${x}, ${cadY}`);
          return;
        }
      }

      this.setPrompt('Sintaxis de coordenadas inválida. Usa el formato X,Y (ejemplo: 100,50):');
      return;
    }

    if (mode === 'divide_dist' && this.utils.divisionStep === 'start_point') {
      this.executeDivision();
      return;
    }

    if (this.utils.divisionStep === 'input' && this.utils.divisionSelectedEntities?.length > 0) {
      const val = parseFloat(input);

      if (isNaN(val)) {
        this.resetToolState();
        this.finishDivisionAndTransition();
        return;
      }

      if (mode === 'divide_count') {
        this.divisionCount = Math.floor(val);
        this.executeDivision();
      } else if (mode === 'divide_dist') {
        this.divisionDistance = val;
        this.utils.divisionStep = 'start_point';
        this.customStartPoints.clear();
        this.renderStartPointMarkers();
        this.setPrompt('Haz clic en una entidad para cambiar su punto de inicio, o presiona ENTER / Clic Derecho para ejecutar:');
      }
    }
  }

  executeDivision() {
    const mode = this.utils.currentToolMode;
    const targets = [...this.utils.divisionSelectedEntities];
    const val = mode === 'divide_count' ? this.divisionCount : this.divisionDistance;

    const opts = this.getPointDefaultOpts();
    const allCreatedPoints = [];

    targets.forEach(entity => {
      let created = [];
      if (mode === 'divide_count' && val >= 2) {
        created = this.service.divideEntityByCount(entity, val, null, opts);
      } else if (mode === 'divide_dist' && val > 0) {
        const customPt = this.customStartPoints.get(entity);
        created = this.service.divideEntityByDistance(entity, val, null, opts, customPt);
      }

      if (created && created.length > 0) {
        created.forEach(ptEnt => {
          if (ptEnt) {
            if (!ptEnt.data) ptEnt.data = {};
            
            // Asignar nombre correlativo a cada punto creado en la división
            const ptName = this.utils.generateNextEntityName ? this.utils.generateNextEntityName('Punto') : 'Punto';
            ptEnt.name = ptName;
            ptEnt.data.name = ptName;

            // Sincronizar propiedades por defecto y opacidad
            if (this.utils.propertyManager) {
              this.utils.propertyManager.applyDefaultSettings(ptEnt);
            }
          }
        });
        allCreatedPoints.push(...created);
      }
    });

    if (allCreatedPoints.length > 0) {
      const divideCmd = new DivideCommand(this.service, allCreatedPoints);
      this.service.executeCommand(divideCmd);
    }

    this.resetToolState();
    this.exitToSelect();
  }

  finishDivisionAndTransition() {
    const cmdInput = document.getElementById('cmdInput');
    if (cmdInput) cmdInput.blur();

    const canvas = document.getElementById('cadCanvas');
    if (canvas) canvas.focus();

    this.utils.setTool('select');
  }

  onMouseMove(event) {
    if (this.utils.snapMarkersGroup) {
      this.utils.snapMarkersGroup.removeChildren();
    }
    
    if (this.utils.currentToolMode === 'point') {
      const osnap = this.service.calculateOsnap(
        event.point, 
        (pt, type) => this.utils.renderSnapMarker(pt, type)
      );
      this.utils.updateHUD(osnap.point);
    } else {
      this.utils.updateHUD(event.point);
    }
  }

  resetToolState() {
    if (this.selectionBoxPath) {
      this.selectionBoxPath.remove();
      this.selectionBoxPath = null;
    }
    if (this.startPointMarkersGroup) {
      this.startPointMarkersGroup.remove();
      this.startPointMarkersGroup = null;
    }
    if (this.customStartPoints) {
      this.customStartPoints.clear();
    }

    this.isSelectingBox = false;
    this.divisionDistance = null;
    this.divisionCount = null;

    this.utils.divisionSelectedEntities = [];
    this.utils.divisionStep = 'select';
    this.service.deselectAllEntities();
    this.service.editingEntities = [];
    this.service.deselectAllSegments();
    if (this.utils.renderBezierHandles) this.utils.renderBezierHandles();
    if (this.utils.updateEntitiesStroke) this.utils.updateEntitiesStroke();
    this.utils.clearHUD();
  }

  cancel() {
    this.resetToolState();
  }

  exitToSelect() {
    const cmdInput = document.getElementById('cmdInput');
    if (cmdInput) cmdInput.blur();

    const canvas = document.getElementById('cadCanvas');
    if (canvas) canvas.focus();

    this.resetToolState();
    this.utils.setTool('select');
  }
}