/**
 * tools/ToolManager.js - Administrador central del ciclo de vida de herramientas
 */
export class ToolManager {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.tools = {};
    this.commandAliases = {};
    this.activeTool = null;
    this.activeToolName = null;
  }

  _normalizeCommandKey(text) {
    return String(text || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  registerTool(name, toolInstance) {
    this.tools[name] = toolInstance;

    const aliases = Array.isArray(toolInstance?.commandAliases)
      ? toolInstance.commandAliases
      : [];

    aliases.forEach((alias) => {
      const normalized = this._normalizeCommandKey(alias);
      if (normalized) {
        this.commandAliases[normalized] = name;
      }
    });
  }

  resolveCommand(rawText) {
    const normalized = this._normalizeCommandKey(rawText);
    if (!normalized) return null;

    if (this.commandAliases[normalized]) {
      return this.commandAliases[normalized];
    }

    // Respaldo temporal para las herramientas que aún faltan migrar
    const legacyAliases = {
      POLILINEA: 'polyline',
      PL: 'polyline',
      P: 'polyline',
      CIRCULO: 'circle',
      C: 'circle',
      SPLINE: 'spline',
      S: 'spline',
      BEZIER: 'bezier',
      B: 'bezier',
      PUNTO: 'point',
      PT: 'point',
      DIVIDIR: 'divide_count',
      DIV: 'divide_count',
      GRADUAR: 'divide_dist',
      MEDIR: 'divide_dist',
      MOVER: 'move',
      M: 'move',
      RECORTAR: 'trim',
      RR: 'trim',
      R: 'trim',
      ALARGAR: 'extend',
      AL: 'extend',
      ENCUADRE: 'pan',
      SELECCIONAR: 'select',
      SEL: 'select'
    };

    return legacyAliases[normalized] || null;
  }

  getToolDisplayName(name) {
    const tool = this.tools[name];
    if (tool?.commandName) return tool.commandName;

    const fallbackNames = {
      select: 'SELECCIONAR',
      pan: 'ENCUADRE',
      line: 'LÍNEA',
      polyline: 'POLILÍNEA',
      circle: 'CÍRCULO',
      spline: 'SPLINE',
      bezier: 'BÉZIER',
      point: 'PUNTO',
      divide_count: 'DIVIDIR',
      divide_dist: 'GRADUAR',
      move: 'MOVER',
      trim: 'RECORTAR',
      extend: 'ALARGAR'
    };

    return fallbackNames[name] || String(name || '').toUpperCase();
  }

  /**
   * Cierra submenús desplegables y actualiza el estado activo de los botones en la UI
   */
  updateToolButtonsUI(name) {
    // 1. Cerrar todos los submenús emergentes abiertos
    const openSubmenus = document.querySelectorAll('.toolbar-submenu.open, .toolbar-dropdown.open, .dropdown-menu.open');
    openSubmenus.forEach(menu => menu.classList.remove('open', 'active'));

    // 2. Actualizar la clase 'active' en los botones de herramientas
    const toolButtons = document.querySelectorAll('[data-tool]');
    toolButtons.forEach(btn => {
      const isCurrent = btn.getAttribute('data-tool') === name;
      btn.classList.toggle('active', isCurrent);
    });
  }

  setTool(name) {
    // 1. Limpiar la interfaz (submenús desplegados y botones activos)
    this.updateToolButtonsUI(name);

    // 2. Consultar políticas declarativas de la herramienta entrante
    const nextTool = this.tools[name] || null;
    const isPanMode = name === 'pan';
    const selectionMode = isPanMode
      ? 'all'
      : (nextTool?.getSelectionPreserveMode?.(name) ?? nextTool?.preservesSelection ?? false);
    const preservesEditMode = isPanMode ||
      Boolean(nextTool?.shouldPreserveEditMode?.(name) ?? nextTool?.preservesEditMode);

    const preservedSelection = (selectionMode && this.service.selectedEntities)
      ? this.service.selectedEntities.filter(
          (ent) => ent && (selectionMode === 'all' || !ent.data?.isPointEntity)
        )
      : null;

    const preservedEditState = preservesEditMode
      ? {
          editingEntities: [...(this.service.editingEntities || [])],
          selectedSegments: [...(this.service.selectedSegments || [])],
          selectedHandles: [...(this.service.selectedHandles || [])]
        }
      : null;

    // 3. Limpieza de la herramienta saliente (invocación automática de cleanup)
    if (this.activeTool) {
      if (typeof this.activeTool.cleanup === 'function') {
        this.activeTool.cleanup();
      } else if (typeof this.activeTool.cancel === 'function') {
        this.activeTool.cancel();
      }
    }

    // 4. Restaurar la selección y el estado de edición resguardados en el servicio
    if (preservedSelection && preservedSelection.length > 0) {
      this.service.selectedEntities = preservedSelection;
    }
    if (preservedEditState) {
      this.service.editingEntities = preservedEditState.editingEntities;
      this.service.selectedSegments = preservedEditState.selectedSegments;
      this.service.selectedHandles = preservedEditState.selectedHandles;
    }

    // 5. Cambiar a la nueva herramienta y ejecutar su onActivate
    this.activeToolName = name;
    this.activeTool = nextTool;

    if (this.activeTool && typeof this.activeTool.onActivate === 'function') {
      this.activeTool.onActivate();
    }
  }

  onMouseDown(event) {
    if (this.utils && event?.point) {
      this.utils.lastMousePoint = event.point.clone();
      if (!event.event || event.event.button === 0) {
        this.utils.isPointerDown = true;
      }
    }
    if (this.activeTool) this.activeTool.onMouseDown(event);
  }

  onMouseDrag(event) {
    if (this.utils && event?.point) {
      this.utils.lastMousePoint = event.point.clone();
      this.utils.isPointerDown = true;
    }
    if (this.activeTool) this.activeTool.onMouseDrag(event);
  }

  onMouseMove(event) {
    if (this.utils && event?.point) {
      this.utils.lastMousePoint = event.point.clone();
      this.utils.isPointerDown = false;
    }
    if (this.activeTool) this.activeTool.onMouseMove(event);
  }

  onMouseUp(event) {
    if (this.utils) {
      if (event?.point) this.utils.lastMousePoint = event.point.clone();
      this.utils.isPointerDown = false;
    }
    if (this.activeTool) this.activeTool.onMouseUp(event);

    if (
      this.utils?.consoleManager &&
      this.activeToolName &&
      this.activeToolName !== 'select' &&
      this.activeToolName !== 'pan'
    ) {
      this.utils.consoleManager.focusInput?.();
    }
  }
}

