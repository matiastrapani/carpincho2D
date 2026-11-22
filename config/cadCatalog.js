/**
 * config/cadCatalog.js - Catálogo centralizado de comandos, herramientas, alias y mensajes en español
 */

export function normalizeCommandKey(rawText) {
  return String(rawText || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

export function formatCommandDisplay(rawText) {
  const clean = String(rawText || '').trim();
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

export const CAD_CATALOG = {
  tools: {
    select: {
      id: 'select',
      displayName: 'Seleccionar',
      aliases: ['SELECCIONAR', 'SEL'],
      ui: { buttonId: 'btnSelect' }
    },
    pan: {
      id: 'pan',
      displayName: 'Encuadre',
      aliases: ['ENCUADRE'],
      ui: { buttonId: 'btnPan' }
    },
    point: {
      id: 'point',
      displayName: 'Punto',
      aliases: ['PUNTO', 'PT'],
      ui: { buttonId: 'btnPointGroup', iconId: 'currentPointIcon', iconName: 'custom:dot' },
      prompts: {
        start: 'Especifique ubicación del punto',
        next: 'Especifique siguiente ubicación del punto'
      },
      logs: {
        created: ({ name, coords }) => `${name} creado en (${coords})`,
        samePoint: 'El punto coincide con el último punto insertado.',
        invalidCoords: 'Sintaxis de coordenadas inválida. Use X,Y, @dx,dy o @dist<ang.',
        finished: 'Inserción de puntos finalizada.'
      }
    },
    divide_count: {
      id: 'divide_count',
      displayName: 'Dividir',
      aliases: ['DIVIDIR', 'DIV'],
      ui: { buttonId: 'btnPointGroup', iconId: 'currentPointIcon', iconName: 'custom:divide' },
      prompts: {
        select: 'Seleccione entidades a dividir y presione Enter / click derecho',
        selectedCount: (count) => `Objetivos seleccionados: ${count}. Presione Enter / click derecho para continuar`,
        selectedSummary: (count) => `Objetivos seleccionados: ${count}.`,
        input: `Especifique el número de segmentos`
      },
      logs: {
        invalidCount: 'El número de segmentos debe ser mayor o igual a 2.'
      }
    },
    divide_dist: {
      id: 'divide_dist',
      displayName: 'Dividir por distancia',
      aliases: ['DIVIDIRDIST', 'GRADUAR', 'MEDIR'],
      ui: { buttonId: 'btnPointGroup', iconId: 'currentPointIcon', iconName: 'custom:dividelength' },
      prompts: {
        select: 'Seleccione entidades a graduar y presione Enter / clic derecho',
        selectedCount: (count) => `Objetivos seleccionados: ${count}. Presione Enter / clic derecho para continuar`,
        selectedSummary: (count) => `Objetivos seleccionados: ${count}.`,
        input: `Especifique la distancia de división`,
        startPoint: 'Haga clic en una entidad para cambiar su punto de inicio, o presione Enter / clic derecho para ejecutar',
        startPointUpdated: 'Punto de inicio actualizado. Seleccione otra entidad o presione Enter / click derecho para ejecutar'
      },
      logs: {
        invalidDistance: 'La distancia de división debe ser mayor que 0.'
      }
    },
    line: {
      id: 'line',
      displayName: 'Línea',
      aliases: ['LINEA', 'L'],
      ui: { buttonId: 'btnLineGroup', iconId: 'currentLineIcon', iconName: 'custom:line' },
      prompts: {
        start: 'Especifique punto de inicio',
        next: 'Especifique el siguiente punto'
      },
      options: {
        undo: { key: 'D', label: 'Deshacer' },
        finish: { key: 'T', label: 'Terminar' }
      },
      logs: {
        created: ({ name, length, angle }) => `${name} creada: Longitud = ${length}, Ángulo = ${angle}°`,
        undoStart: ({ coords }) => `Deshacer: Punto inicial ${coords}`,
        undoSegment: ({ coords }) => `Deshacer: Último tramo. Punto actual: ${coords}`,
        redoStart: ({ coords }) => `Rehacer: Punto inicial ${coords}`,
        redoSegment: ({ coords }) => `Rehacer: Último tramo. Punto actual: ${coords}`,
        samePoint: 'El punto coincide con el origen actual.',
        needStart: 'Marque primero el punto de inicio o ingrese coordenadas X,Y.',
        invalidDistance: 'La distancia debe ser mayor a cero.',
        needDirection: 'Mueva el cursor sobre el lienzo para indicar la dirección.',
        finished: 'Trazado de línea finalizado.'
      }
    },
    polyline: {
      id: 'polyline',
      displayName: 'Polilínea',
      aliases: ['POLILINEA', 'PL', 'P'],
      ui: { buttonId: 'btnLineGroup', iconId: 'currentLineIcon', iconName: 'custom:polyline' },
      prompts: {
        start: 'Punto de inicio',
        next: 'Especifique el siguiente punto'
      },
      options: {
        undo: { key: 'D', label: 'Deshacer' },
        close: { key: 'C', label: 'Cerrar' },
        finish: { key: 'T', label: 'Terminar' }
      },
      logs: {
        created: ({ name, vertexCount, totalLength, closed }) =>
          `${name} creada${closed ? ' (cerrada)' : ''}: Vértices = ${vertexCount}, Longitud = ${totalLength}`,
        undoStart: ({ coords }) => `Deshacer: Punto inicial ${coords}`,
        undoVertex: ({ coords }) => `Deshacer: Último vértice. Punto actual: ${coords}`,
        redoStart: ({ coords }) => `Rehacer: Punto inicial ${coords}`,
        redoVertex: ({ coords }) => `Rehacer: Último vértice. Punto actual: ${coords}`,
        samePoint: 'El punto coincide con el vértice anterior.',
        needStart: 'Marque primero el punto de inicio o ingrese coordenadas X,Y.',
        invalidDistance: 'La distancia debe ser mayor a cero.',
        needDirection: 'Mueva el cursor sobre el lienzo para indicar la dirección.',
        discarded: 'Trazado de polilínea descartado.'
      }
    },
    line_tangent: {
      id: 'line_tangent',
      displayName: 'Línea tangente',
      aliases: ['LINEATANGENTE', 'LTG'],
      ui: { buttonId: 'btnLineGroup', iconId: 'currentLineIcon', iconName: 'custom:tangentline' },
      prompts: {
        pick: 'Seleccione la entidad curva para tangencia inicial',
        end: 'Especifique punto final de la línea tangente'
      },
      options: {
        changeEntity: { key: 'E', label: 'Entidad' }
      },
      logs: {
        picked: ({ name }) => `Entidad base: ${name}. Indique el punto final.`,
        created: ({ name, startCoords, length, angle }) =>
          `${name} tangente creada: Inicio = (${startCoords}), Longitud = ${length}, Ángulo = ${angle}°`,
        invalidTarget: 'Seleccione un círculo, arco o tramo curvo válido.',
        noTangent: 'No es posible calcular una tangente desde esa ubicación.',
        undoPick: 'Selección de entidad base deshecha.',
        samePoint: 'El punto final coincide con el punto de tangencia.',
        needTarget: 'Seleccione primero una entidad curva en el lienzo.',
        invalidDistance: 'La distancia debe ser mayor a cero.',
        needDirection: 'Mueva el cursor sobre el lienzo para indicar la dirección.'
      }
    },
    spline: {
      id: 'spline',
      displayName: 'Spline',
      aliases: ['SPLINE', 'SPL', 'S'],
      ui: { buttonId: 'btnCurveGroup', iconId: 'currentCurveIcon', iconName: 'custom:spline' }
    },
    bezier: {
      id: 'bezier',
      displayName: 'Bézier',
      aliases: ['BEZIER', 'BZ', 'B'],
      ui: { buttonId: 'btnCurveGroup', iconId: 'currentCurveIcon', iconName: 'custom:bezier' }
    },
    circle: {
      id: 'circle',
      displayName: 'Círculo',
      aliases: ['CIRCULO', 'C'],
      ui: { buttonId: 'btn-circle-tool' },
      prompts: {
        center: 'Especifique el centro del círculo',
        radius: 'Especifique el radio o un punto en el círculo',
        diameter: 'Especifique el diámetro o un punto en el círculo'
      },
      options: {
        diameter: { key: 'D', label: 'Diámetro' },
        radius: { key: 'R', label: 'Radio' }
      },
      logs: {
        created: ({ name, center, radius }) => `${name} creado: Centro = (${center}), Radio = ${radius}`,
        invalidRadius: 'El radio debe ser mayor a cero.',
        invalidDiameter: 'El diámetro debe ser mayor a cero.',
        needCenter: 'Indique primero el centro del círculo o ingrese coordenadas X,Y.'
      }
    },
    move: {
      id: 'move',
      displayName: 'Mover',
      aliases: ['MOVER', 'M'],
      ui: { buttonId: 'btnMove' }
    },
    trim: {
      id: 'trim',
      displayName: 'Recortar',
      aliases: ['RECORTAR', 'RR', 'R'],
      ui: { buttonId: 'btnTrim', iconId: 'currentModifyIcon', iconName: 'custom:trim' }
    },
    extend: {
      id: 'extend',
      displayName: 'Alargar',
      aliases: ['ALARGAR', 'AL'],
      ui: { buttonId: 'btnExtend', iconId: 'currentModifyIcon', iconName: 'custom:extend' }
    }
  },
  commands: {
    undo: {
      id: 'undo',
      displayName: 'Deshacer',
      aliases: ['DESHACER', 'U'],
      logs: {
        empty: 'No hay acciones para deshacer.'
      }
    },
    redo: {
      id: 'redo',
      displayName: 'Rehacer',
      aliases: ['REHACER'],
      logs: {
        empty: 'No hay acciones para rehacer.'
      }
    },
    clear: {
      id: 'clear',
      displayName: 'Limpiar',
      aliases: ['LIMPIAR'],
      logs: {
        done: 'Lienzo limpiado.'
      }
    }
  },
  system: {
    cancelled: 'Comando cancelado.',
    unknownCommand: (rawText) => `Comando desconocido: "${rawText}"`
  }
};

export function getToolCatalogEntry(toolId) {
  return CAD_CATALOG.tools[toolId] || null;
}

export function getCommandCatalogEntry(commandId) {
  return CAD_CATALOG.commands[commandId] || null;
}

export function resolveCatalogEntry(rawText) {
  const key = normalizeCommandKey(rawText);
  if (!key) return null;

  for (const [id, entry] of Object.entries(CAD_CATALOG.commands)) {
    if (normalizeCommandKey(id) === key || entry.aliases?.includes(key)) {
      return { kind: 'command', id, entry };
    }
  }

  for (const [id, entry] of Object.entries(CAD_CATALOG.tools)) {
    if (normalizeCommandKey(id) === key || entry.aliases?.includes(key)) {
      return { kind: 'tool', id, entry };
    }
  }

  return null;
}