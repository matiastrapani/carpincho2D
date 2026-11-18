/**
 * tools/FilletTool.js - Herramienta interactiva de Empalme (Fillet) de ejecución única
 * Flujo en 3 pasos:
 *   1. Selección de primera entidad.
 *   2. Selección de segunda entidad (o segundo tramo adyacente de la misma entidad).
 *   3. Ajuste interactivo de radio por arrastre en vivo o ingreso numérico en consola,
 *      finalizando automáticamente hacia la herramienta 'select'.
 */

import { BaseTool } from './BaseTool.js';
import { FilletSolver } from '../services/engines/FilletSolver.js';
import { FilletCommand } from '../services/commands/cadCommands.js';

export class FilletTool extends BaseTool {
  constructor(cadService, cadUtils, paperInstance) {
    super(cadService, cadUtils);
    if (!paperInstance || !paperInstance.Path) {
      throw new Error('FilletTool requiere una instancia válida de Paper.js en el constructor.');
    }

    this.paper = paperInstance;
    this.solver = new FilletSolver(paperInstance);
    this.radius = 10;

    this.firstEntity = null;
    this.firstClickPoint = null;
    this.secondEntity = null;
    this.secondClickPoint = null;
    this.isAdjustingRadius = false;
    this.previewRadius = null;
    this.lastValidRadius = null;
    this.previewGroup = null;
  }

  setPrompt(text) {
    super.setPrompt(text);
    if (this.utils.consoleManager) {
      this.utils.consoleManager.setPrompt(text);
    }
  }

  _buildStepPrompt(liveRadius = null) {
    if (this.isAdjustingRadius) {
      const liveLabel = typeof liveRadius === 'number' ? ` [${liveRadius.toFixed(2)}]` : '';
      return `FILLET: Arrastra para definir radio${liveLabel} o ingresa valor <${this.radius}>:`;
    }
    if (!this.firstEntity) {
      return `FILLET (Radio = ${this.radius}): Selecciona el primer objeto o ingresa radio:`;
    }
    return `FILLET (Radio = ${this.radius}): Selecciona el segundo objeto o ingresa radio:`;
  }

  onActivate() {
    if (!this.paper.view || !this.paper.project) {
      throw new Error('FilletTool requiere que Paper.js esté inicializado.');
    }

    super.onActivate();
    this.resetStep();
  }

  setFirstEntity(entity, clickPoint) {
    if (!this._isValidTarget(entity)) return;

    this.clearPreviews();
    this.utils.clearHoverHighlight();
    this.firstEntity = entity;
    this.firstClickPoint = clickPoint.clone();
    this.secondEntity = null;
    this.secondClickPoint = null;
    this.isAdjustingRadius = false;
    this.lastValidRadius = null;

    this.service.selectEntity(entity, false);
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.setPrompt(this._buildStepPrompt());
    this.paper.view.update();
  }

  beginRadiusDragPhase(entity2, clickPoint2) {
    if (!this.solver.canFillet(this.firstEntity, this.firstClickPoint, entity2, clickPoint2)) {
      if (this.utils.consoleManager) {
        this.utils.consoleManager.logSystem(
          'Las entidades seleccionadas no admiten empalme.'
        );
      }
      this.exitToSelect();
      return false;
    }

    this.utils.clearHoverHighlight();
    this.secondEntity = entity2;
    this.secondClickPoint = clickPoint2.clone();
    this.isAdjustingRadius = true;

    this.service.selectEntity(this.firstEntity, false);
    if (entity2 !== this.firstEntity) {
      this.service.selectEntity(entity2, true);
    }
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();

    const initialSol = this._solveWithBisectionFallback(clickPoint2, this.radius);
    if (initialSol) {
      this.previewRadius = initialSol.radius;
      this.lastValidRadius = initialSol.radius;
      this._renderPreview(initialSol);
      this.setPrompt(this._buildStepPrompt(initialSol.radius));
    } else {
      this.previewRadius = 0;
      this.lastValidRadius = 0;
      this.setPrompt(this._buildStepPrompt(0));
    }

    this.paper.view.update();

    if (this.utils.consoleManager) {
      this.utils.consoleManager.focus();
    }
    return true;
  }

  /**
   * Intenta resolver con targetRadius; si excede la curvatura o longitud disponible,
   * realiza bisección entre el último radio válido y targetRadius para acotar sin colapsar a 0.
   */
  _solveWithBisectionFallback(cursorPt, targetRadius) {
    const direct = this.solver.solvePreview(
      this.firstEntity,
      this.firstClickPoint,
      this.secondEntity,
      this.secondClickPoint,
      targetRadius
    );
    if (direct) return direct;

    let low = (typeof this.lastValidRadius === 'number' && this.lastValidRadius > 0 && this.lastValidRadius < targetRadius)
      ? this.lastValidRadius
      : 0;
    let high = targetRadius;
    let bestSol = null;

    for (let i = 0; i < 12; i++) {
      const mid = (low + high) * 0.5;
      const candidate = this.solver.solvePreview(
        this.firstEntity,
        this.firstClickPoint,
        this.secondEntity,
        this.secondClickPoint,
        mid
      );
      if (candidate) {
        bestSol = candidate;
        low = mid;
      } else {
        high = mid;
      }
    }

    return bestSol;
  }

  onMouseMove(event) {
    this.utils.hud.clear();
    this.clearPreviews();

    // Durante el arrastre de radio usamos event.point libre (sin imán OSNAP al vértice)
    // para evitar que el cursor quede atrapado en R = 0.
    const pt = event.point;
    this.utils.hud.updateHUD(pt);

    // PASO 3: Ambas entidades seleccionadas -> Arrastre dinámico de radio
    if (this.isAdjustingRadius && this.firstEntity && this.secondEntity) {
      const zeroSnap = 0.75 / this.paper.view.zoom;
      const estimatedR = this.solver.estimateRadiusFromPoint(
        this.firstEntity,
        this.firstClickPoint,
        this.secondEntity,
        this.secondClickPoint,
        pt,
        zeroSnap
      );

      if (estimatedR !== null) {
        const roundedR = Math.round(estimatedR * 1000) / 1000;
        const solution = this._solveWithBisectionFallback(pt, roundedR);

        if (solution) {
          this.previewRadius = solution.radius;
          if (solution.radius > 0) {
            this.lastValidRadius = solution.radius;
          }
          this._renderPreview(solution);
          const guideOrigin = solution.arcPoints?.center || solution.vertex;
          if (guideOrigin) {
            this.utils.hud.updateFeedbackLabels(guideOrigin, pt);
          }
          this.setPrompt(this._buildStepPrompt(solution.radius));
        }
      }

      this.paper.view.update();
      return;
    }

    // PASO 1 y PASO 2: Resaltado hover de entidades
    const hovered = this._hitTestEntity(pt);

    if (!this.firstEntity) {
      if (this.service.hoveredEntity !== hovered) {
        this.service.hoveredEntity = hovered;
        this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
        this.paper.view.update();
      }
      return;
    }

    const validCandidate = hovered && (hovered !== this.firstEntity || hovered.curves?.length >= 2)
      ? hovered
      : null;

    if (this.service.hoveredEntity !== validCandidate) {
      this.service.hoveredEntity = validCandidate;
      this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    }

    if (validCandidate) {
      const previewSol = this.solver.solvePreview(
        this.firstEntity,
        this.firstClickPoint,
        validCandidate,
        pt,
        this.radius
      );
      if (previewSol) {
        this._renderPreview(previewSol);
      }
    }

    this.paper.view.update();
  }

  onMouseDown(event) {
    if (event.event && event.event.button !== 0) return;

    // PASO 3: Clic izquierdo confirma el radio arrastrado y termina la herramienta
    if (this.isAdjustingRadius && this.firstEntity && this.secondEntity) {
      const finalR = typeof this.previewRadius === 'number' ? this.previewRadius : this.radius;
      this.commitFilletWithRadius(finalR, true);
      return;
    }

    const pt = event.point;
    const hitEntity = this._hitTestEntity(pt);
    if (!hitEntity) return;

    // PASO 1: Seleccionar primera entidad
    if (!this.firstEntity) {
      this.setFirstEntity(hitEntity, pt);
      return;
    }

    // PASO 2: Seleccionar segunda entidad (o segundo tramo curvo) y pasar al arrastre
    this.beginRadiusDragPhase(hitEntity, pt);
  }

  onCommandInput(input) {
    const trimmed = String(input || '').trim();

    if (!trimmed) {
      if (this.isAdjustingRadius) {
        this.commitFilletWithRadius(this.radius, false);
      } else {
        this.exitToSelect();
      }
      return;
    }

    this.applyRadiusFromCommand(trimmed);
  }

  applyRadiusFromCommand(rawValue) {
    const cleaned = String(rawValue).trim().replace(/^(R|RADIO|RADIUS)\s*[:=]?\s*/i, '');
    const parsed = parseFloat(cleaned);

    if (Number.isNaN(parsed) || parsed < 0) {
      this.setPrompt(`FILLET: Radio inválido. Ingresa un número >= 0 <${this.radius}>:`);
      return false;
    }

    if (this.isAdjustingRadius && this.firstEntity && this.secondEntity) {
      return this.commitFilletWithRadius(parsed, true);
    }

    this.radius = parsed;
    if (this.utils.consoleManager) {
      this.utils.consoleManager.logSystem(`Radio de empalme: ${this.radius}`);
    }
    this.setPrompt(this._buildStepPrompt());
    return true;
  }

  commitFilletWithRadius(targetRadius, persistAsDefault = true) {
    if (!this.firstEntity || !this.secondEntity) {
      this.exitToSelect();
      return false;
    }

    const result = this.solver.applyFillet(
      this.firstEntity,
      this.firstClickPoint,
      this.secondEntity,
      this.secondClickPoint,
      targetRadius
    );

    if (!result) {
      if (this.utils.consoleManager) {
        this.utils.consoleManager.logSystem(
          `No se pudo resolver el empalme con radio ${targetRadius}.`
        );
      }
      this.exitToSelect();
      return false;
    }

    if (persistAsDefault) {
      this.radius = Math.round(targetRadius * 1000) / 1000;
    }

    const { arcEntity, splitEntity, modifications } = result;
    const activeLayerId = String(
      this.utils.layerManager?.getActiveLayer()?.id ||
      this.utils.layerManager?.activeLayerId ||
      '0'
    );

    if (arcEntity) {
      if (!arcEntity.data) arcEntity.data = {};
      arcEntity.data.layerId = activeLayerId;

      const entityName = typeof this.utils.generateNextEntityName === 'function'
        ? this.utils.generateNextEntityName('Empalme')
        : 'Empalme';
      arcEntity.name = entityName;
      arcEntity.data.name = entityName;

      if (this.utils.propertyManager) {
        this.utils.propertyManager.applyDefaultSettings(arcEntity);
      }
    }

    if (splitEntity) {
      if (!splitEntity.data) splitEntity.data = {};
      if (!splitEntity.data.layerId) {
        splitEntity.data.layerId = String(this.firstEntity.data?.layerId || activeLayerId);
      }

      const isSingleLine = splitEntity.segments.length === 2 &&
        splitEntity.segments[0].handleOut.isZero() &&
        splitEntity.segments[1].handleIn.isZero();
      const basePrefix = isSingleLine ? 'Línea' : 'Polilínea';
      const splitName = typeof this.utils.generateNextEntityName === 'function'
        ? this.utils.generateNextEntityName(basePrefix)
        : basePrefix;
      splitEntity.name = splitName;
      splitEntity.data.name = splitName;
    }

    const createdEntities = [arcEntity, splitEntity].filter(Boolean);
    const filletCmd = new FilletCommand(this.service, modifications, createdEntities);
    this.service.executeCommand(filletCmd);

    // Finaliza la herramienta tras un redondeo y vuelve a 'select'
    this.exitToSelect();
    return true;
  }

  _renderPreview(solution) {
    this.clearPreviews();

    const zoom = this.paper.view.zoom;
    const dashStyle = [2 / zoom, 2 / zoom];
    const { color, opacity } = this._resolvePreviewStyle();
    const targetLayer = this.utils.hudLayer || this.paper.project.activeLayer;

    this.previewGroup = new this.paper.Group({ insert: false });

    if (solution.arcPoints) {
      const { T1, M, T2, center } = solution.arcPoints;

      // 1. Arco de empalme punteado (estilo rubber-band de CircleTool)
      const arcPreview = new this.paper.Path.Arc({
        from: T1,
        through: M,
        to: T2,
        strokeColor: color,
        strokeWidth: 1 / zoom,
        dashArray: dashStyle,
        opacity,
        insert: false
      });
      this.previewGroup.addChild(arcPreview);

      // 2. Líneas radiales rubber-band desde el centro hacia ambos puntos de tangencia (T1 y T2)
      if (center) {
        const radiusLine1 = new this.paper.Path.Line({
          from: center,
          to: T1,
          strokeColor: color,
          strokeWidth: 1 / zoom,
          dashArray: dashStyle,
          opacity,
          insert: false
        });
        const radiusLine2 = new this.paper.Path.Line({
          from: center,
          to: T2,
          strokeColor: color,
          strokeWidth: 1 / zoom,
          dashArray: dashStyle,
          opacity,
          insert: false
        });
        this.previewGroup.addChild(radiusLine1);
        this.previewGroup.addChild(radiusLine2);
      }

      // 3. Marcadores en los puntos de tangencia
      [T1, T2].forEach((tp) => {
        const dot = new this.paper.Path.Circle({
          center: tp,
          radius: 2.5 / zoom,
          fillColor: color,
          opacity,
          insert: false
        });
        this.previewGroup.addChild(dot);
      });
    } else if (solution.vertex) {
      const marker = new this.paper.Path.Circle({
        center: solution.vertex,
        radius: 3.5 / zoom,
        strokeColor: color,
        strokeWidth: 1 / zoom,
        dashArray: dashStyle,
        opacity,
        insert: false
      });
      this.previewGroup.addChild(marker);
    }

    targetLayer.addChild(this.previewGroup);
  }

  _resolvePreviewStyle() {
    const defaults = this.utils.propertyManager?.defaultSettings || {};
    const activeLayer = this.utils.layerManager?.getActiveLayer() || null;

    const isColorByLayer = defaults.color === 'BYLAYER' || !defaults.color;
    const color = isColorByLayer ? (activeLayer?.color || '#00e5ff') : defaults.color;

    const isOpacityByLayer = defaults.opacity === 'BYLAYER' || defaults.opacity === undefined;
    const opacity = isOpacityByLayer
      ? (activeLayer?.opacity !== undefined ? activeLayer.opacity : 1)
      : (typeof defaults.opacity === 'number' ? defaults.opacity : 1);

    return { color, opacity };
  }

  _hitTestEntity(point) {
    const tolerance = 10 / this.paper.view.zoom;
    const hit = this.paper.project.hitTest(point, {
      stroke: true,
      fill: true,
      curves: true,
      tolerance,
      match: (res) => Boolean(this._resolveRootEntity(res.item))
    });

    if (!hit || !hit.item) return null;
    return this._resolveRootEntity(hit.item);
  }

  _resolveRootEntity(item) {
    if (!item) return null;

    let current = item;
    while (current) {
      if (this.service.entities.includes(current)) {
        return this._isValidTarget(current) ? current : null;
      }
      current = current.parent;
    }
    return null;
  }

  _isValidTarget(entity) {
    if (!entity || entity.data?.isPointEntity) return false;
    if (entity instanceof this.paper.Raster) return false;
    if (!(entity instanceof this.paper.Path)) return false;

    if (this.utils.layerManager && !this.utils.layerManager.isEntityInteractive(entity)) {
      return false;
    }
    return true;
  }

  clearPreviews() {
    if (this.previewGroup) {
      this.previewGroup.remove();
      this.previewGroup = null;
    }
  }

  resetStep() {
    this.clearPreviews();
    this.firstEntity = null;
    this.firstClickPoint = null;
    this.secondEntity = null;
    this.secondClickPoint = null;
    this.isAdjustingRadius = false;
    this.previewRadius = null;
    this.lastValidRadius = null;
    this.service.deselectAllEntities();
    this.utils.clearHoverHighlight();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.utils.hud?.clear?.();
    this.setPrompt(this._buildStepPrompt());
    this.paper.view.update();
  }

  onKeyDown(event) {
    const key = event.key || event.code;
    if (key === 'Escape') {
      this.exitToSelect();
      return true;
    }
    return super.onKeyDown(event);
  }

  onContextMenu(event) {
    this.exitToSelect();
    return true;
  }

  cancel() {
    this.clearPreviews();
    this.firstEntity = null;
    this.firstClickPoint = null;
    this.secondEntity = null;
    this.secondClickPoint = null;
    this.isAdjustingRadius = false;
    this.previewRadius = null;
    this.lastValidRadius = null;
    this.service.deselectAllEntities();
    this.utils.clearHoverHighlight();
    this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
    this.utils.hud?.clear?.();
  }

  exitToSelect() {
    this.cancel();
    super.exitToSelect();
  }
}