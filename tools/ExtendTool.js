/**
 * tools/ExtendTool.js - Extensión paramétrica para líneas y Polybéziers.
 * Permite cambiar entre modo 'smooth' (S) y modo 'line' (L) mediante teclado,
 * modificando entidades existentes si son rectas o anexando segmentos si son curvas.
 */
class ExtendTool extends BaseTool {
  constructor(cadService, cadUtils) {
    super(cadService, cadUtils);
    this.promptText = 'EXTEND: Selecciona un extremo. [S] Smooth / [L] Line';
    this.extendData = null;
    this.mode = 'smooth'; // 'smooth' o 'line'

    // Vinculamos el listener de teclado global para no depender únicamente de Paper.js
    this.boundKeyDown = this.handleGlobalKeyDown.bind(this);
  }

  activate() {
    super.activate();
    window.addEventListener('keydown', this.boundKeyDown);
  }

  deactivate() {
    super.deactivate();
    window.removeEventListener('keydown', this.boundKeyDown);
  }

  handleGlobalKeyDown(event) {
    if (!this.active) return;

    const key = event.key.toLowerCase();
    if (key === 's') {
      this.setMode('smooth');
    } else if (key === 'l') {
      this.setMode('line');
    }
  }

  setMode(newMode) {
    this.mode = newMode;
    const modeName = this.mode.toUpperCase();
    this.setPrompt(`EXTEND [Modo: ${modeName}]: [S] Smooth / [L] Line. Clic para confirmar/cancelar.`);
    
    // Si el usuario ya está arrastrando/extrayendo, forzamos la actualización inmediata
    if (this.lastMouseEvent) {
      this.onMouseMove(this.lastMouseEvent);
    }
  }

  onMouseDown(event) {
    // Clic derecho -> Cancelar
    if (event.event.button === 2) {
      if (this.extendData) this.cancel();
      return;
    }

    // Clic izquierdo -> Seleccionar / Confirmar
    if (event.event.button === 0) {
      if (this.extendData) {
        this.confirm();
        return;
      }

      const hitEntity = paper.project.hitTest(event.point, {
        stroke: true, fill: true, tolerance: 12 / paper.view.zoom,
        match: (res) => this.service.demoEntities.includes(res.item) && !res.item.closed
      });

      if (hitEntity && hitEntity.item) {
        const extendInfo = this.getExtendInfo(hitEntity.item, event.point);
        if (extendInfo) {
          this.extendData = extendInfo;
          this.service.selectEntity(hitEntity.item, false);
          this.setPrompt(`EXTEND [Modo: ${this.mode.toUpperCase()}]: Arrastra para extender. Presiona [S] o [L] para alternar.`);
        }
      }
    }
  }

  onMouseMove(event) {
    this.lastMouseEvent = event; // Guardamos el evento para recalcular si cambia el modo por tecla
    if (!this.extendData) return;

    const { 
      isBezier, isSingular, isStart, path, startPt, endPt, 
      straightDir, tangentVector, dirVector, tangentSpeed, initialControls 
    } = this.extendData;

    // Restaurar siempre al estado inicial limpio para evitar duplicidad de nodos
    this.restorePathToBackup(path, initialControls.segmentsBackup);

    const anchorPt = isStart ? startPt : endPt;
    const mouseVec = event.point.subtract(anchorPt);

    if (!isBezier) {
      // --- LÍNEA RECTA PURA ---
      // No inserta nodos extra: modifica directamente la posición del extremo
      const projDist = Math.max(0, mouseVec.dot(dirVector));

      if (isStart) {
        path.firstSegment.point = startPt.add(dirVector.multiply(projDist));
      } else {
        path.lastSegment.point = endPt.add(dirVector.multiply(projDist));
      }
    } else {
      // --- CURVA BÉZIER ---
      if (this.mode === 'line' || isSingular) {
        // MODO LINEA (O VELOCIDAD NULA P1 = P0)
        const vectorToUse = isSingular ? straightDir : tangentVector;
        const projDist = Math.max(0, mouseVec.dot(vectorToUse));

        if (isStart) {
          const newPt = startPt.add(vectorToUse.multiply(projDist));
          path.insertSegment(0, new paper.Segment(newPt));
        } else {
          const newPt = endPt.add(vectorToUse.multiply(projDist));
          path.addSegment(new paper.Segment(newPt));
        }
      } else {
        // MODO SMOOTH (EXTRAPOLACIÓN BÉZIER PURA)
        const projDist = Math.max(0, mouseVec.dot(tangentVector));
        const deltaT = projDist / (tangentSpeed || 1);
        const k = 1 + deltaT;

        this.applyBezierExtension(path, isStart, k, initialControls);
      }
    }

    this.utils.renderBezierHandles();
  }

  restorePathToBackup(path, backup) {
    while (path.segments.length > backup.length) {
      path.removeSegment(path.segments.length - 1);
    }
    while (path.segments.length < backup.length) {
      path.addSegment(new paper.Point(0, 0));
    }
    backup.forEach((b, i) => {
      path.segments[i].point = b.point.clone();
      path.segments[i].handleIn = b.handleIn.clone();
      path.segments[i].handleOut = b.handleOut.clone();
    });
  }

  applyBezierExtension(path, isStart, k, controls) {
    const totalSegs = path.segments.length;

    if (!isStart) {
      const res = ExtendTool.extenderBezierCubica(
        controls.P0, controls.P1, controls.P2, controls.P3, k
      );

      const segFixed = path.segments[totalSegs - 2];
      const segMoving = path.segments[totalSegs - 1];

      segFixed.point = new paper.Point(res.p0.x, res.p0.y);
      segFixed.handleOut = new paper.Point(res.p1.x - res.p0.x, res.p1.y - res.p0.y);

      segMoving.point = new paper.Point(res.p3.x, res.p3.y);
      segMoving.handleIn = new paper.Point(res.p2.x - res.p3.x, res.p2.y - res.p3.y);
    } else {
      const res = ExtendTool.extenderBezierCubica(
        controls.P3, controls.P2, controls.P1, controls.P0, k
      );

      const segFixed = path.segments[1];
      const segMoving = path.segments[0];

      segFixed.point = new paper.Point(res.p0.x, res.p0.y);
      segFixed.handleIn = new paper.Point(res.p1.x - res.p0.x, res.p1.y - res.p0.y);

      segMoving.point = new paper.Point(res.p3.x, res.p3.y);
      segMoving.handleOut = new paper.Point(res.p2.x - res.p3.x, res.p2.y - res.p3.y);
    }
  }

  static extenderBezierCubica(p0, p1, p2, p3, k) {
    const p0_prime = { x: p0.x, y: p0.y };

    const p1_prime = {
      x: p0.x + k * (p1.x - p0.x),
      y: p0.y + k * (p1.y - p0.y)
    };

    const k2 = k * k;
    const k2_mult = 2 * k;

    const p2_prime = {
      x: p0.x + k2_mult * (p1.x - p0.x) + k2 * (p2.x - 2 * p1.x + p0.x),
      y: p0.y + k2_mult * (p1.y - p0.y) + k2 * (p2.y - 2 * p1.y + p0.y)
    };

    const u = 1 - k;
    const u3 = u * u * u;
    const u2 = u * u;
    const k3 = k2 * k;

    const p3_prime = {
      x: (u3 * p0.x) + (3 * u2 * k * p1.x) + (3 * u * k2 * p2.x) + (k3 * p3.x),
      y: (u3 * p0.y) + (3 * u2 * k * p1.y) + (3 * u * k2 * p2.y) + (k3 * p3.y)
    };

    return { p0: p0_prime, p1: p1_prime, p2: p2_prime, p3: p3_prime };
  }

  getExtendInfo(path, clickPt) {
    if (!path || path.closed || !path.segments || path.segments.length < 2) return null;

    const totalSegs = path.segments.length;
    const startPt = path.segments[0].point.clone();
    const endPt = path.segments[totalSegs - 1].point.clone();

    const nearestLoc = path.getNearestLocation(clickPt);
    let isStart = false;
    if (nearestLoc && path.length > 0) {
      isStart = nearestLoc.offset < (path.length / 2);
    } else {
      isStart = startPt.getDistance(clickPt) < endPt.getDistance(clickPt);
    }

    let isBezier = false;
    let isSingular = false;
    let p0, p1, p2, p3;
    let straightDir = null;
    let tangentVector = null;
    let dirVector = null;
    let tangentSpeed = 1;

    if (!isStart) {
      const segFixed = path.segments[totalSegs - 2];
      const segMoving = path.segments[totalSegs - 1];

      isBezier = !segFixed.handleOut.isZero() || !segMoving.handleIn.isZero();

      p0 = segFixed.point.clone();
      p1 = p0.add(segFixed.handleOut);
      p3 = segMoving.point.clone();
      p2 = p3.add(segMoving.handleIn);

      if (p2.getDistance(p3) < 0.001) {
        isSingular = true;
        const refPt = p1.getDistance(p0) > 0.001 ? p1 : p0;
        straightDir = p3.subtract(refPt).normalize();
      } else {
        tangentVector = p3.subtract(p2);
        tangentSpeed = 3 * tangentVector.length;
        tangentVector = tangentVector.normalize();
      }

      dirVector = segMoving.point.subtract(segFixed.point).normalize();
    } else {
      const segMoving = path.segments[0];
      const segFixed = path.segments[1];

      isBezier = !segMoving.handleOut.isZero() || !segFixed.handleIn.isZero();

      p0 = segMoving.point.clone();
      p1 = p0.add(segMoving.handleOut);
      p3 = segFixed.point.clone();
      p2 = p3.add(segFixed.handleIn);

      if (p1.getDistance(p0) < 0.001) {
        isSingular = true;
        const refPt = p2.getDistance(p3) > 0.001 ? p2 : p3;
        straightDir = p0.subtract(refPt).normalize();
      } else {
        tangentVector = p0.subtract(p1);
        tangentSpeed = 3 * tangentVector.length;
        tangentVector = tangentVector.normalize();
      }

      dirVector = segMoving.point.subtract(segFixed.point).normalize();
    }

    return {
      path: path,
      isStart: isStart,
      isBezier: isBezier,
      isSingular: isSingular,
      startPt: startPt,
      endPt: endPt,
      straightDir: straightDir,
      tangentVector: tangentVector,
      dirVector: dirVector,
      tangentSpeed: tangentSpeed,
      initialControls: {
        P0: p0, P1: p1, P2: p2, P3: p3,
        segmentsBackup: path.segments.map(s => ({
          point: s.point.clone(),
          handleIn: s.handleIn.clone(),
          handleOut: s.handleOut.clone()
        }))
      }
    };
  }

  confirm() {
    if (!this.extendData) return;

    const { path, initialControls } = this.extendData;

    // Capturar el estado final de los segmentos
    const finalSegments = path.segments.map(s => ({
      point: s.point.clone(),
      handleIn: s.handleIn.clone(),
      handleOut: s.handleOut.clone()
    }));

    const initialSegments = initialControls.segmentsBackup;

    // Crear y registrar el comando en el historial para habilitar Undo/Redo
    if (window.ExtendCommand) {
      const extendCmd = new ExtendCommand(this.service, path, initialSegments, finalSegments);
      this.service.executeCommand(extendCmd);
    }

    this.extendData = null;
    this.lastMouseEvent = null;
    this.service.deselectAllEntities();
    this.utils.renderBezierHandles();
    this.setPrompt('EXTEND: Extensión confirmada. Selecciona otra entidad o presiona ESC.');
  }

  cancel() {
    if (!this.extendData) return;
    const { path, initialControls } = this.extendData;

    this.restorePathToBackup(path, initialControls.segmentsBackup);

    this.extendData = null;
    this.lastMouseEvent = null;
    this.service.deselectAllEntities();
    this.utils.renderBezierHandles();
    this.setPrompt('EXTEND: Operación cancelada.');
  }
}

window.ExtendTool = ExtendTool;