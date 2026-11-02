/**
 * tools/PointTool.js - Herramienta para Puntos y División de Entidades
 * Flujo CAD estricto con conversión de coordenadas cartesianas (Y+ hacia arriba)
 */
class PointTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'POINT. Haz clic en el lienzo para colocar un punto o ingresa coordenadas (X,Y).';
  }

  onActivate() {
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
          this.setPrompt('DIVIDIR (N): Selecciona entidad/es y presiona ENTER o Clic Derecho para confirmar.');
        } else {
          this.setPrompt('DIVIDIR (Dist): Selecciona entidad/es y presiona ENTER o Clic Derecho para confirmar.');
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

    this.utils.renderBezierHandles();

    const count = this.utils.divisionSelectedEntities.length;
    const mode = this.utils.currentToolMode;

    if (mode === 'divide_count') {
      this.setPrompt(`Specify number of segments (${count} objetivo/s):`);
    } else {
      this.setPrompt(`Specify distance (${count} objetivo/s):`);
    }

    const cmdInput = document.getElementById('cmdInput');
    if (cmdInput) {
      cmdInput.focus();
      cmdInput.select();
    }
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

    if (mode === 'divide_count' || mode === 'divide_dist') {
      if (this.utils.divisionStep === 'select') {
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
            if (selIdx !== -1) {
              this.service.selectedEntities.splice(selIdx, 1);
              item.strokeWidth = item.data?.origStrokeWidth || 2;
              if (item.data?.origStrokeColor) item.strokeColor = item.data.origStrokeColor;
            }
          } else {
            this.utils.divisionSelectedEntities.push(item);
            this.service.selectEntity(item, true);
          }

          this.utils.renderBezierHandles();

          const count = this.utils.divisionSelectedEntities.length;
          this.setPrompt(`Objetivos seleccionados: ${count}. Presiona ENTER o Clic Derecho para continuar...`);
        }
      }
    }
  }

  createPointAt(pt, coordsLabel = null) {
    const pointEntity = this.service.createPointEntity(pt);

    if (pointEntity) {
      if (window.AddPointCommand) {
        const cmd = new AddPointCommand(this.service, pointEntity);
        this.service.executeCommand(cmd);
      }
      this.utils.renderBezierHandles();

      // Formato Cartesiano CAD (Y cartesiano = -pt.y de Canvas)
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

    // Entrada para Modo Punto (Ingreso de Coordenadas Cartesianas X,Y)
    if (mode === 'point') {
      const raw = input.trim();
      if (raw.includes(',')) {
        const parts = raw.split(',');
        const x = parseFloat(parts[0]);
        const cadY = parseFloat(parts[1]);

        if (!isNaN(x) && !isNaN(cadY)) {
          // Conversión Cartesiana CAD -> Canvas Paper.js
          const canvasY = -cadY;
          const pt = new paper.Point(x, canvasY);
          this.createPointAt(pt, `${x}, ${cadY}`);
          return;
        }
      }

      this.setPrompt('Sintaxis de coordenadas inválida. Usa el formato X,Y (ejemplo: 100,50):');
      return;
    }

    // Entrada para Modos de División (Cantidad o Distancia)
    if (this.utils.divisionStep === 'input' && this.utils.divisionSelectedEntities?.length > 0) {
      const val = parseFloat(input);
      const targets = [...this.utils.divisionSelectedEntities];

      if (isNaN(val)) {
        this.resetToolState();
        this.finishDivisionAndTransition();
        return;
      }

      const allCreatedPoints = [];

      targets.forEach(entity => {
        let created = [];
        if (mode === 'divide_count' && val >= 2) {
          created = this.service.divideEntityByCount(entity, Math.floor(val));
        } else if (mode === 'divide_dist' && val > 0) {
          created = this.service.divideEntityByDistance(entity, val);
        }
        if (created && created.length > 0) {
          allCreatedPoints.push(...created);
        }
      });

      if (allCreatedPoints.length > 0 && window.DivideCommand) {
        const divideCmd = new DivideCommand(this.service, allCreatedPoints);
        this.service.executeCommand(divideCmd);
      }

      this.resetToolState();
      this.exitToSelect();
    }
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
    this.utils.divisionSelectedEntities = [];
    this.utils.divisionStep = 'select';
    this.service.deselectAllEntities();
    this.utils.renderBezierHandles();
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

window.PointTool = PointTool;