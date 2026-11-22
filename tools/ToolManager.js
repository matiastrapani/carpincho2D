/**
 * tools/ToolManager.js - Administrador central del ciclo de vida de herramientas
 */
import {
  CAD_CATALOG,
  normalizeCommandKey,
  getToolCatalogEntry,
  resolveCatalogEntry
} from '../config/cadCatalog.js';

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
    return normalizeCommandKey(text);
  }

  registerTool(name, toolInstance) {
    this.tools[name] = toolInstance;

    const catalogEntry = getToolCatalogEntry(name);
    const catalogAliases = Array.isArray(catalogEntry?.aliases) ? catalogEntry.aliases : [];
    const instanceAliases = Array.isArray(toolInstance?.commandAliases) ? toolInstance.commandAliases : [];

    [...catalogAliases, ...instanceAliases].forEach((alias) => {
      const normalized = normalizeCommandKey(alias);
      if (normalized) {
        this.commandAliases[normalized] = name;
      }
    });
  }

  resolveCommand(rawText) {
    const normalized = normalizeCommandKey(rawText);
    if (!normalized) return null;

    if (this.commandAliases[normalized]) {
      return this.commandAliases[normalized];
    }

    const resolved = resolveCatalogEntry(normalized);
    if (resolved?.kind === 'tool' && this.tools[resolved.id]) {
      return resolved.id;
    }

    return null;
  }

  getToolDisplayName(name) {
    const catalogEntry = getToolCatalogEntry(name);
    if (catalogEntry?.displayName) {
      return catalogEntry.displayName;
    }

    const tool = this.tools[name];
    if (tool?.commandName) {
      return tool.commandName;
    }

    return String(name || '');
  }

  getToolMetadata(name) {
    return getToolCatalogEntry(name);
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

