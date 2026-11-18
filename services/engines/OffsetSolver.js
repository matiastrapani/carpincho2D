/**
 * services/engines/OffsetSolver.js
 * Motor geométrico puro para operaciones de Offset (paralelas y contornos).
 * Utiliza Paper.js 0.17.0+ para curvas Bézier y resolución analítica para círculos.
 */

export class OffsetSolver {
  constructor(paperInstance) {
    if (!paperInstance || !paperInstance.Path) {
      throw new Error('OffsetSolver requiere una instancia válida de Paper.js en el constructor.');
    }
    this.paper = paperInstance;
  }

  /**
   * Calcula la geometría resultante de aplicar un offset a una entidad (Path, CompoundPath o Círculo).
   * Retorna un nuevo ítem de Paper.js sin insertar en el proyecto (insert: false) o null si colapsa.
   */
  computeOffset(entity, distance, options = {}) {
    if (!entity || typeof distance !== 'number' || Number.isNaN(distance)) {
      return null;
    }

    if (Math.abs(distance) < 1e-6) {
      return null;
    }

    // 1. Bypass analítico exacto para círculos paramétricos
    if (this._isAnalyticalCircle(entity)) {
      return this._offsetAnalyticalCircle(entity, distance);
    }

    // 2. Validar soporte nativo de Paper.js 0.17.0+
    if (typeof entity.offset !== 'function') {
      throw new Error('La entidad no soporta .offset(). Verifica que Paper.js 0.17.0+ esté cargado.');
    }

    const offsetOptions = {
      join: options.join || 'miter',
      miterLimit: typeof options.miterLimit === 'number' ? options.miterLimit : 10,
      insert: false
    };

    const result = entity.offset(distance, offsetOptions);
    if (!result) return null;

    // Validar que el resultado no haya colapsado a geometría vacía
    if (result instanceof this.paper.CompoundPath) {
      if (!result.children || result.children.length === 0) {
        result.remove();
        return null;
      }
    } else if (result.segments && result.segments.length < 2) {
      result.remove();
      return null;
    }

    return result;
  }

  /**
   * Determina el signo (+1 exterior / -1 interior o lado de normal) y la distancia
   * respecto a un punto del cursor o una distancia explícita ingresada por consola.
   */
  resolveSignedDistance(entity, targetPoint, overrideDistance = null) {
    if (!entity || !targetPoint) return null;

    // Caso A: Círculo analítico
    if (this._isAnalyticalCircle(entity)) {
      const center = entity.position;
      const radius = entity.data.radius;
      const distFromCenter = center.getDistance(targetPoint);
      const sign = distFromCenter >= radius ? 1 : -1;
      const magnitude = overrideDistance !== null
        ? Math.abs(overrideDistance)
        : Math.abs(distFromCenter - radius);

      const dir = distFromCenter > 1e-6
        ? targetPoint.subtract(center).normalize()
        : new this.paper.Point(1, 0);

      return {
        distance: sign * magnitude,
        magnitude,
        sign,
        nearestPoint: center.add(dir.multiply(radius))
      };
    }

    // Caso B: Path o CompoundPath general
    const nearestLoc = this._getNearestLocation(entity, targetPoint);
    if (!nearestLoc) return null;

    const nearestPoint = nearestLoc.point;
    const magnitude = overrideDistance !== null
      ? Math.abs(overrideDistance)
      : nearestPoint.getDistance(targetPoint);

    let sign = 1;
    if (entity instanceof this.paper.CompoundPath || entity.closed) {
      sign = entity.contains(targetPoint) ? -1 : 1;
    } else {
      const toCursor = targetPoint.subtract(nearestPoint);
      sign = nearestLoc.normal.dot(toCursor) >= 0 ? 1 : -1;
    }

    return {
      distance: sign * magnitude,
      magnitude,
      sign,
      nearestPoint
    };
  }

  _isAnalyticalCircle(entity) {
    if (!entity || !entity.data) return false;
    const hasCircleFlag = entity.data.cadType === 'circle' || entity.data.isCircle === true;
    const hasValidRadius = typeof entity.data.radius === 'number' && entity.data.radius > 0;
    return Boolean((hasCircleFlag || hasValidRadius) && entity.closed && entity.segments?.length === 4);
  }

  _offsetAnalyticalCircle(circleEntity, distance) {
    const newRadius = circleEntity.data.radius + distance;
    if (newRadius <= 1e-4) return null;

    const center = circleEntity.position.clone();
    const newCircle = new this.paper.Path.Circle({
      center,
      radius: newRadius,
      insert: false
    });

    newCircle.data = {
      cadType: 'circle',
      isCircle: true,
      radius: newRadius
    };

    return newCircle;
  }

  _getNearestLocation(entity, point) {
    if (typeof entity.getNearestLocation === 'function') {
      return entity.getNearestLocation(point);
    }

    if (entity instanceof this.paper.CompoundPath && Array.isArray(entity.children)) {
      let bestLoc = null;
      let minDist = Infinity;

      for (const child of entity.children) {
        if (typeof child.getNearestLocation !== 'function') continue;
        const loc = child.getNearestLocation(point);
        if (loc && loc.distance < minDist) {
          minDist = loc.distance;
          bestLoc = loc;
        }
      }
      return bestLoc;
    }

    return null;
  }
}