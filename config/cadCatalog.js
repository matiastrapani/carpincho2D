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
    divide_dist: {
      id: 'divide_dist',
      displayName: 'Dividir por distancia',
      aliases: ['GRADUAR', 'MEDIR', 'DIVIDIRDIST'],
      ui: { buttonId: 'btnPointGroup', iconId: 'currentPointIcon', iconName: 'custom:dividelength' }
    },
    polyline: {
      id: 'polyline',
      displayName: 'Polilínea',
      aliases: ['POLILINEA', 'PL', 'P'],
      ui: { buttonId: 'btnLineGroup', iconId: 'currentLineIcon', iconName: 'custom:polyline' }
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
    trim: {
      id: 'trim',
      displayName: 'Recortar',
      aliases: ['RECORTAR', 'RR', 'R'],
      ui: { buttonId: 'btnTrim', iconId: 'currentModifyIcon', iconName: 'custom:trim' }
    },
    pan: {
      id: 'pan',
      displayName: 'Encuadre',
      aliases: ['ENCUADRE', 'P'],
      ui: { buttonId: 'btnPan' }
    },
    point: {
      id: 'point',
      displayName: 'Punto',
      aliases: ['PUNTO', 'PT'],
      ui: { buttonId: 'btnPointGroup', iconId: 'currentPointIcon', iconName: 'custom:dot' },
      prompts: {
        start: 'Ubicación del punto'
      },
      logs: {
        created: ({ name, coords }) => `${name} creado en (${coords})`
      }
    },
    divide_count: {
      id: 'divide_count',
      displayName: 'Dividir',
      aliases: ['DIVIDIR', 'DIV'],
      ui: { buttonId: 'btnPointGroup', iconId: 'currentPointIcon', iconName: 'custom:divide' }
    },
    divide_dist: {
      id: 'divide_dist',
      displayName: 'Dividir por distancia',
      aliases: ['DIVIDIRDIST', 'MEDIR'],
      ui: { buttonId: 'btnPointGroup', iconId: 'currentPointIcon', iconName: 'custom:dividelength' }
    },
    line: {
      id: 'line',
      displayName: 'Línea',
      aliases: ['LINEA', 'L'],
      ui: { buttonId: 'btnLineGroup', iconId: 'currentLineIcon', iconName: 'custom:line' },
      prompts: {
        start: 'Punto de inicio',
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
        finished: 'Trazo de línea finalizado.'
      }
    },
    polyline: {
      id: 'polyline',
      displayName: 'Polilínea',
      aliases: ['POLILINEA', 'PL'],
      ui: { buttonId: 'btnLineGroup', iconId: 'currentLineIcon', iconName: 'custom:polyline' }
    },
    spline: {
      id: 'spline',
      displayName: 'Spline',
      aliases: ['SPLINE', 'SPL'],
      ui: { buttonId: 'btnCurveGroup', iconId: 'currentCurveIcon', iconName: 'custom:spline' }
    },
    bezier: {
      id: 'bezier',
      displayName: 'Bézier',
      aliases: ['BEZIER', 'BZ'],
      ui: { buttonId: 'btnCurveGroup', iconId: 'currentCurveIcon', iconName: 'custom:bezier' }
    },
    circle: {
      id: 'circle',
      displayName: 'Círculo',
      aliases: ['CIRCULO', 'C'],
      ui: { buttonId: 'btn-circle-tool' }
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
      aliases: ['RECORTAR', 'RR'],
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