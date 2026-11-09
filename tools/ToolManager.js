/**
 * tools/ToolManager.js - Administrador central del ciclo de vida de herramientas
 */
export class ToolManager {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;
    this.tools = {};
    this.activeTool = null;
    this.activeToolName = null;
  }

  registerTool(name, toolInstance) {
    this.tools[name] = toolInstance;
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

    // 2. Si la nueva herramienta es Trim y hay una selección activa, 
    // resguardamos las entidades elegidas para que no se pierdan al cancelar SelectTool.
    const preservedSelection = (name === 'trim' && this.service.selectedEntities) 
      ? [...this.service.selectedEntities] 
      : null;

    // 3. Limpieza de la herramienta saliente (invocación automática de cleanup)
    if (this.activeTool) {
      if (typeof this.activeTool.cleanup === 'function') {
        this.activeTool.cleanup();
      } else if (typeof this.activeTool.cancel === 'function') {
        this.activeTool.cancel();
      }
    }

    // 4. Restauramos la selección resguardada en el servicio si íbamos hacia TRIM
    if (preservedSelection && preservedSelection.length > 0) {
      this.service.selectedEntities = preservedSelection;
    }

    // 5. Cambiamos a la nueva herramienta y ejecutamos su onActivate
    this.activeToolName = name;
    this.activeTool = this.tools[name] || null;

    if (this.activeTool && typeof this.activeTool.onActivate === 'function') {
      this.activeTool.onActivate();
    }
  }

  onMouseDown(event) {
    if (this.activeTool) this.activeTool.onMouseDown(event);
  }

  onMouseDrag(event) {
    if (this.activeTool) this.activeTool.onMouseDrag(event);
  }

  onMouseMove(event) {
    if (this.activeTool) this.activeTool.onMouseMove(event);
  }

  onMouseUp(event) {
    if (this.activeTool) this.activeTool.onMouseUp(event);
  }
}

