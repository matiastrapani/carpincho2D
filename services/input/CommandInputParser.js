/**
 * services/input/CommandInputParser.js
 * Lector único de entradas de consola para herramientas CAD.
 */

export class CommandInputParser {
  static normalize(text) {
    return String(text || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Interpreta una entrada de texto en contexto de la herramienta activa.
   * @param {string} rawInput
   * @param {Object} context
   * @param {Array<{key: string, label: string, active?: boolean}>} [context.options]
   * @param {paper.Point|null} [context.referencePoint]
   * @param {Object} [context.paper]
   */
  static parse(rawInput, { options = [], referencePoint = null, paper = window.paper } = {}) {
    const trimmed = rawInput !== null && rawInput !== undefined ? String(rawInput).trim() : '';

    // 1. Cadena vacía (Enter / Espacio) -> Aceptar valor por defecto
    if (!trimmed) {
      return { type: 'ACCEPT_DEFAULT' };
    }

    const normalized = this.normalize(trimmed);

    // 2. Opciones activas del paso actual (por letra clave o etiqueta completa)
    for (const opt of options) {
      const normKey = this.normalize(opt.key);
      const normLabel = this.normalize(opt.label);
      if (normalized === normKey || normalized === normLabel) {
        return { type: 'OPTION', key: opt.key, option: opt };
      }
    }

    // 3. Coordenada polar relativa: @distancia<angulo (ej: @50<45)
    if (trimmed.startsWith('@') && trimmed.includes('<')) {
      if (!referencePoint) {
        return {
          type: 'ERROR',
          message: 'Se necesita un punto inicial antes de ingresar coordenadas polares (@dist<áng).'
        };
      }
      const [distPart, anglePart] = trimmed.slice(1).split('<');
      const dist = parseFloat(distPart);
      const angleDeg = parseFloat(anglePart);
      if (Number.isNaN(dist) || Number.isNaN(angleDeg)) {
        return {
          type: 'ERROR',
          message: 'Formato polar inválido. Use @distancia<ángulo (ej: @50<45).'
        };
      }
      const rad = (angleDeg * Math.PI) / 180;
      const dx = dist * Math.cos(rad);
      const dy = -(dist * Math.sin(rad));
      return {
        type: 'POINT',
        mode: 'polar',
        point: referencePoint.add(new paper.Point(dx, dy))
      };
    }

    // 4. Coordenada cartesiana relativa (@dX,dY) o absoluta (X,Y)
    if (trimmed.includes(',')) {
      const isRelative = trimmed.startsWith('@');
      const coordBody = isRelative ? trimmed.slice(1) : trimmed;
      const parts = coordBody.split(',');

      if (parts.length !== 2) {
        return {
          type: 'ERROR',
          message: 'Formato de coordenada inválido. Use X,Y o @dX,dY (ej: 100,50).'
        };
      }

      const x = parseFloat(parts[0]);
      const rawY = parseFloat(parts[1]);
      if (Number.isNaN(x) || Number.isNaN(rawY)) {
        return {
          type: 'ERROR',
          message: 'Las coordenadas deben ser valores numéricos (ej: 100,50).'
        };
      }

      const paperY = rawY === 0 ? 0 : -rawY;

      if (isRelative) {
        if (!referencePoint) {
          return {
            type: 'ERROR',
            message: 'Se necesita un punto inicial antes de ingresar coordenadas relativas (@dX,dY).'
          };
        }
        return {
          type: 'POINT',
          mode: 'relative',
          point: referencePoint.add(new paper.Point(x, paperY))
        };
      }

      return {
        type: 'POINT',
        mode: 'absolute',
        point: new paper.Point(x, paperY)
      };
    }

    // 5. Valor numérico puro (distancia, radio, cantidad)
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) {
      return {
        type: 'NUMBER',
        value: parseFloat(trimmed)
      };
    }

    // 6. Texto no reconocido por la herramienta (posible comando global)
    return {
      type: 'UNKNOWN',
      raw: trimmed
    };
  }
}