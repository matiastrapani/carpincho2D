/**
 * modules/uiManager.js - Delegación de eventos e interfaz CAD
 */
import { ChangeOpacityCommand } from '../services/commands/cadCommands.js';

export class CADUIManager {
  constructor(cadUtils, cadService) {
    this.cadUtils = cadUtils;
    this.cadService = cadService;
  }

  init() {
    this.bindToolButtons();
    this.bindFlyouts();
    this.bindTogglesAndActions();
    this.bindOsnapChips();
    this.bindToolbarDockAndResize();
    this.bindSidebarControls();
    this.bindSidebarVerticalResizer();
    this.bindImageImport();
    this.bindGlobalKeyboard();
    this.bindHeaderControls();
    this.updateUndoRedoUI();
  }

  bindSidebarVerticalResizer() {
    const topPanel = document.getElementById('propertyPanelContainer');
    const resizer = document.getElementById('sidebarVerticalResizer');
    const sidebarContent = document.getElementById('sidebarContent');

    if (!topPanel || !resizer || !sidebarContent) return;

    let startY = 0;
    let startHeight = 0;

    const onMouseMove = (e) => {
      const deltaY = e.clientY - startY;
      const totalHeight = sidebarContent.getBoundingClientRect().height;
      const resizerHeight = resizer.getBoundingClientRect().height;
      const maxTopHeight = totalHeight - resizerHeight - 90; // Mínimo 90px para el panel de capas

      const newHeight = Math.max(90, Math.min(maxTopHeight, startHeight + deltaY));
      topPanel.style.height = `${newHeight}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    resizer.addEventListener('mousedown', (e) => {
      startY = e.clientY;
      startHeight = topPanel.getBoundingClientRect().height;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  bindGlobalKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openMenus = document.querySelectorAll('.flyout-menu.show');
        
        // Si hay algún flyout/menú abierto en el DOM
        if (openMenus.length > 0) {
          e.stopPropagation(); // Evita que el primer ESC cancele herramientas en el canvas
          this.closeAllFlyouts();

          // Devolver el foco al canvas para que Paper.js siga escuchando teclas
          const canvas = document.getElementById('myCanvas') || document.querySelector('canvas');
          if (canvas) canvas.focus();
        }
      }
    });
  }
  
  // 1. Botones de herramientas simples
  bindToolButtons() {
    const simpleTools = [
      { id: 'btnPan', tool: 'pan' },
      { id: 'btnSelect', tool: 'select' },
      { id: 'btnTrim', tool: 'trim' },
      { id: 'btnExtend', tool: 'extend' },
      { id: 'btn-circle-tool', tool: 'circle' }
    ];

    simpleTools.forEach(({ id, tool }) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('click', () => {
          if (typeof this.cadUtils.setTool === 'function') {
            this.cadUtils.setTool(tool);
          }
          this.closeAllFlyouts();
        });
      }
    });
  }

  // 2. Control Inteligente de Flyouts Desplegables (Clic rápido vs Mantener Presionado)
  bindFlyouts() {
    const flyoutGroups = [
      { btnId: 'btnPointGroup', menuId: 'pointFlyoutMenu', iconId: 'currentPointIcon' },
      { btnId: 'btnLineGroup', menuId: 'lineFlyoutMenu', iconId: 'currentLineIcon' },
      { btnId: 'btnCurveGroup', menuId: 'curveFlyoutMenu', iconId: 'currentCurveIcon' },
      { btnId: 'btnTrimGroup', menuId: 'modifyFlyoutMenu', iconId: 'currentModifyIcon' }
    ];

    const LONG_PRESS_MS = 250;

    flyoutGroups.forEach(({ btnId, menuId, iconId }) => {
      const btn = document.getElementById(btnId);
      const menu = document.getElementById(menuId);
      const mainIcon = document.getElementById(iconId);

      if (!btn || !menu) return;

      let pressTimer = null;
      let isLongPress = false;

      // Presionar el botón principal
      btn.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isLongPress = false;

        pressTimer = setTimeout(() => {
          isLongPress = true;
          this.closeAllFlyouts();
          menu.classList.add('show');
        }, LONG_PRESS_MS);
      });

      // Soltar el botón principal
      btn.addEventListener('mouseup', (e) => {
        if (e.button !== 0) return;
        clearTimeout(pressTimer);

        // Si fue clic rápido y el menú no está visible, activa la herramienta por defecto
        if (!isLongPress) {
          if (!menu.classList.contains('show')) {
            const defaultTool = btn.getAttribute('data-default-tool');
            if (defaultTool && typeof this.cadUtils.setTool === 'function') {
              this.cadUtils.setTool(defaultTool);
            }
          }
        }
      });

      btn.addEventListener('mouseleave', () => clearTimeout(pressTimer));

      // SELECCIÓN DE OPCIÓN EN EL FLYOUT (Usamos mousedown para ganar prioridad de evento)
      const items = menu.querySelectorAll('.flyout-item');
      items.forEach(item => {
        const handleSelect = (e) => {
          e.stopPropagation();
          e.preventDefault();
          clearTimeout(pressTimer);

          const selectedTool = item.getAttribute('data-tool');
          const itemIcon = item.querySelector('.iconify, i, span');

          if (selectedTool) {
            btn.setAttribute('data-default-tool', selectedTool);

            if (mainIcon && itemIcon) {
              const iconName = itemIcon.getAttribute('data-icon') || itemIcon.className;
              mainIcon.setAttribute('data-icon', iconName);
              if (window.Iconify) window.Iconify.scan(mainIcon.parentElement);
            }

            if (typeof this.cadUtils.setTool === 'function') {
              this.cadUtils.setTool(selectedTool);
            }
          }

          this.closeAllFlyouts();

          if (typeof this.cadUtils.setTool === 'function') {
            this.cadUtils.setTool(selectedTool);
          }
        };
        item.addEventListener('click', handleSelect);
      });
    });

    // Cerrar desplegables al hacer clic en el lienzo o fuera de la barra
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.relative')) {
        this.closeAllFlyouts();
      }
    });
  }

  closeAllFlyouts() {
    const menus = document.querySelectorAll('.flyout-menu');
    menus.forEach(m => m.classList.remove('show'));
  }

  // 3. Botones de acción rápida (Snap, Grid, Extents, OK)
  bindTogglesAndActions() {
    const btnSnap = document.getElementById('btnSnap');
    if (btnSnap) btnSnap.addEventListener('click', () => this.cadUtils.toggleSnapMaster());

    const btnGrid = document.getElementById('btnGrid');
    if (btnGrid) btnGrid.addEventListener('click', () => this.cadUtils.viewportManager.toggleGrid());


    // Restablecer Zoom al 100% y centrar en Origen (0,0)
    const btnZoomReset = document.getElementById('btnZoomReset');
    if (btnZoomReset) {
      btnZoomReset.addEventListener('click', () => {
        if (this.cadUtils.viewportManager?.zoomReset) {
          this.cadUtils.viewportManager.zoomReset();
        }
      });
    }
    
    const btnExtents = document.getElementById('btnExtents');
    if (btnExtents) btnExtents.addEventListener('click', () => this.cadUtils.viewportManager.resetView());

    const btnCmdOk = document.getElementById('btnCmdOk');
    if (btnCmdOk) btnCmdOk.addEventListener('click', () => this.cadUtils.viewportManager.executeCommandLine());
  }

  // 4. Modos OSNAP
  bindOsnapChips() {
      const filters = ['endpoint', 'midpoint', 'center', 'quadrant', 'node', 'intersection', 'grid'];    filters.forEach(filter => {
      const chip = document.getElementById(`chip${filter.charAt(0).toUpperCase() + filter.slice(1)}`);
      if (chip) {
        chip.addEventListener('click', () => this.cadUtils.toggleSnapFilter(filter));
      }
    });
  }

  // 5. Arrastre, acople (docking) y redimensionamiento multi-columna de la barra
  bindToolbarDockAndResize() {
    const verticalToolbar = document.getElementById('verticalToolbar');
    const dragHandle = document.getElementById('toolbarDragHandle');
    const toolbarWidthResizer = document.getElementById('toolbarWidthResizer');

    const leftDockContainer = document.getElementById('leftDockContainer');
    const panelLeftDockContainer = document.getElementById('panelLeftDockContainer');
    const rightDockContainer = document.getElementById('rightDockContainer');
    const rightSidebar = document.getElementById('rightSidebar');
    const resizer = document.getElementById('resizer'); // <--- AHORA SE CAPTURA EL CONTENEDOR RESIZER

    if (!verticalToolbar || !dragHandle) return;

    let currentDockState = 'floating';
    let toolColumns = 1;
    const SNAP_THRESHOLD = 40;

    const applyDockState = (dockState) => {
      currentDockState = dockState;
      
      if (dockState === 'docked-panel-left') {
        panelLeftDockContainer?.appendChild(verticalToolbar);
        verticalToolbar.className = 'relative cad-panel p-1 flex flex-col items-center gap-1 z-50 toolbar-docked dock-panel-left pointer-events-auto';
        verticalToolbar.style.top = '';
        verticalToolbar.style.left = '';
        resizer?.classList.add('has-docked-border'); // <--- ANCHO FÍSICO DE 3PX
      } else {
        resizer?.classList.remove('has-docked-border'); // <--- VUELVE A 1PX SI SE DESACOPLA

        if (dockState === 'docked-left') {
          leftDockContainer?.appendChild(verticalToolbar);
          verticalToolbar.className = 'relative cad-panel p-1 flex flex-col items-center gap-1 z-50 toolbar-docked dock-left pointer-events-auto';
          verticalToolbar.style.top = '';
          verticalToolbar.style.left = '';
        } else if (dockState === 'docked-right') {
          rightDockContainer?.appendChild(verticalToolbar);
          verticalToolbar.className = 'relative cad-panel p-1 flex flex-col items-center gap-1 z-50 toolbar-docked dock-right pointer-events-auto';
          verticalToolbar.style.top = '';
          verticalToolbar.style.left = '';
        } else {
          document.body.appendChild(verticalToolbar);
          verticalToolbar.className = 'absolute cad-panel p-1 flex flex-col items-center gap-1 z-50 toolbar-floating dock-left pointer-events-auto';
        }
      }
    };

    let isDraggingToolbar = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    dragHandle.addEventListener('mousedown', (e) => {
      isDraggingToolbar = true;
      const rect = verticalToolbar.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;

      if (currentDockState !== 'floating') {
        const startX = rect.left;
        const startY = rect.top;
        applyDockState('floating');
        verticalToolbar.style.left = `${startX}px`;
        verticalToolbar.style.top = `${startY}px`;
      }
      document.body.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingToolbar) return;

      let newX = e.clientX - dragOffsetX;
      let newY = e.clientY - dragOffsetY;
      newY = Math.max(8, Math.min(newY, window.innerHeight - verticalToolbar.offsetHeight - 8));
      const sidebarRect = rightSidebar ? rightSidebar.getBoundingClientRect() : { left: window.innerWidth, right: window.innerWidth };

      if (e.clientX <= SNAP_THRESHOLD) {
        applyDockState('docked-left');
        return;
      }
      if (Math.abs(e.clientX - sidebarRect.left) <= SNAP_THRESHOLD) {
        applyDockState('docked-panel-left');
        return;
      }
      if (e.clientX >= window.innerWidth - SNAP_THRESHOLD || e.clientX >= sidebarRect.right - SNAP_THRESHOLD) {
        applyDockState('docked-right');
        return;
      }

      if (currentDockState !== 'floating') applyDockState('floating');

      const toolbarWidth = verticalToolbar.offsetWidth;
      newX = Math.max(8, Math.min(newX, window.innerWidth - toolbarWidth - 8));
      verticalToolbar.style.left = `${newX}px`;
      verticalToolbar.style.top = `${newY}px`;
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingToolbar) {
        isDraggingToolbar = false;
        document.body.style.cursor = 'default';
      }
    });

    // Redimensionamiento de ancho
    let isResizingToolbar = false;
    let startWidth = 0;
    let startX = 0;

    toolbarWidthResizer?.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isResizingToolbar = true;
      startX = e.clientX;
      startWidth = verticalToolbar.offsetWidth;
      document.body.style.cursor = 'ew-resize';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizingToolbar) return;

      let deltaX = e.clientX - startX;
      if (currentDockState === 'docked-right' || currentDockState === 'docked-panel-left') {
        deltaX = -deltaX;
      }

      const targetWidth = startWidth + deltaX;
      if (targetWidth < 70) toolColumns = 1;
      else if (targetWidth >= 70 && targetWidth < 110) toolColumns = 2;
      else if (targetWidth >= 110 && targetWidth < 150) toolColumns = 3;
      else toolColumns = 4;

      verticalToolbar.style.setProperty('--tool-cols', toolColumns);
    });

    window.addEventListener('mouseup', () => {
      if (isResizingToolbar) {
        isResizingToolbar = false;
        document.body.style.cursor = 'default';
      }
    });
  }

  // 6. Colapsado y redimensionamiento del Panel Lateral Derecho
  bindSidebarControls() {
    const rightSidebar = document.getElementById('rightSidebar');
    const sidebarHeader = document.getElementById('sidebarHeader');
    const sidebarTitleGroup = document.getElementById('sidebarTitleGroup');
    const sidebarContent = document.getElementById('sidebarContent');
    const resizer = document.getElementById('resizer');
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    const sidebarIcon = document.getElementById('sidebarIcon');

    if (!rightSidebar || !btnToggleSidebar) return;

    let lastExpandedWidth = 288;
    let isCollapsed = false;
    let isResizingSidebar = false;

    resizer?.addEventListener('mousedown', () => {
      if (isCollapsed) return;
      isResizingSidebar = true;
      resizer.classList.add('is-dragging'); // <--- ENCIENDE ESTADO DE ARRASTRE
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizingSidebar || isCollapsed) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 180 && newWidth <= 520) {
        lastExpandedWidth = newWidth;
        rightSidebar.style.width = `${newWidth}px`;
      }
    });

    window.addEventListener('mouseup', () => {
      if (isResizingSidebar) {
        isResizingSidebar = false;
        resizer?.classList.remove('is-dragging'); // <--- APAGA ESTADO DE ARRASTRE
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';
      }
    });

    btnToggleSidebar.addEventListener('click', () => {
      isCollapsed = !isCollapsed;
      if (isCollapsed) {
        rightSidebar.style.width = `40px`;
        sidebarTitleGroup?.classList.add('hidden');
        sidebarContent?.classList.add('hidden');
        sidebarHeader?.classList.remove('justify-between', 'pl-2');
        sidebarHeader?.classList.add('justify-center', 'p-1');
        if (sidebarIcon) sidebarIcon.className = 'fa-solid fa-chevron-left text-xs';
        if (resizer) resizer.style.pointerEvents = 'none';
      } else {
        rightSidebar.style.width = `${lastExpandedWidth}px`;
        sidebarTitleGroup?.classList.remove('hidden');
        sidebarContent?.classList.remove('hidden');
        sidebarHeader?.classList.remove('justify-center');
        sidebarHeader?.classList.add('justify-between', 'p-1');
        if (sidebarIcon) sidebarIcon.className = 'fa-solid fa-chevron-right text-xs';
        if (resizer) resizer.style.pointerEvents = 'auto';
      }
    });
  }

  bindImageImport() {
    const btnImport = document.getElementById('btnImportImage');
    const inputFile = document.getElementById('inputImageFile');

    if (!btnImport || !inputFile) return;

    btnImport.addEventListener('click', () => {
      inputFile.value = ''; // Resetear valor
      inputFile.click();    // Abrir selector de archivos del SO
    });

    inputFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const imageSrc = event.target.result;
        if (typeof this.cadUtils.importImageToCanvas === 'function') {
          this.cadUtils.importImageToCanvas(imageSrc);
        }
      };
      reader.readAsDataURL(file);
    });
  }
  // Al seleccionar un objeto en la escena:
  updatePropertyPanel(selectedItem) {
    const panelContent = document.getElementById('propertyPanelContent');
    if (!panelContent) return;

    const isRaster = selectedItem && (selectedItem instanceof paper.Raster || selectedItem.className === 'Raster');

    if (isRaster) {
      if (!selectedItem.data) selectedItem.data = {};
      let initialOpacity = selectedItem.data.baseOpacity ?? selectedItem.opacity ?? 1;
      let initialPct = Math.round(initialOpacity * 100);

      panelContent.innerHTML = `
        <div class="p-3.5 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Propiedades</span>
            <span class="text-[10px] text-white bg-[#008800] px-2 py-0.5 rounded font-medium">Imagen</span>
          </div>

          <div class="flex flex-col gap-1.5">
            <div class="flex justify-between items-center text-xs">
              <span class="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">OPACIDAD</span>
              
              <!-- Contenedor estático con dígitos tabulares -->
              <div class="flex items-center justify-end w-10 text-right select-none">
                <input 
                  type="number" 
                  id="imageOpacityNumber" 
                  min="0" 
                  max="100" 
                  value="${initialPct}" 
                  class="w-7 bg-transparent text-right outline-none text-zinc-300 font-sans text-xs tabular-nums focus:text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span class="text-zinc-400 font-sans text-xs tabular-nums">%</span>
              </div>
            </div>

            <input 
              type="range" 
              id="imageOpacityInput" 
              min="0" 
              max="100" 
              value="${initialPct}" 
              class="cad-slider w-full"
            />
          </div>
        </div>
      `;

      const sliderInput = document.getElementById('imageOpacityInput');
      const numberInput = document.getElementById('imageOpacityNumber');

      const applyOpacityChange = (valPct) => {
        const clampedPct = Math.max(0, Math.min(100, valPct));
        const opacityVal = clampedPct / 100;

        selectedItem.data.baseOpacity = opacityVal;
        selectedItem.opacity = opacityVal;

        sliderInput.value = clampedPct;
        numberInput.value = clampedPct;

        paper.view.requestUpdate();
        return opacityVal;
      };

      sliderInput.addEventListener('input', (e) => {
        applyOpacityChange(parseFloat(e.target.value));
      });

      sliderInput.addEventListener('change', (e) => {
        const finalOpacity = applyOpacityChange(parseFloat(e.target.value));
        if (Math.abs(initialOpacity - finalOpacity) > 0.001) {
          if (ChangeOpacityCommand && this.cadService) {
            const cmd = new ChangeOpacityCommand(this.cadService, selectedItem, initialOpacity, finalOpacity);
            this.cadService.executeCommand(cmd);
          }
          initialOpacity = finalOpacity;
        }
      });

      numberInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) || 0;
        applyOpacityChange(val);
      });

      numberInput.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value) || 0;
        const finalOpacity = applyOpacityChange(val);
        if (Math.abs(initialOpacity - finalOpacity) > 0.001) {
          if (ChangeOpacityCommand && this.cadService) {
            const cmd = new ChangeOpacityCommand(this.cadService, selectedItem, initialOpacity, finalOpacity);
            this.cadService.executeCommand(cmd);
          }
          initialOpacity = finalOpacity;
        }
      });

      numberInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          numberInput.blur();
        }
      });

    } else {
      panelContent.innerHTML = `
        <div class="p-3.5 text-xs text-zinc-500 italic">
          Sin selección o seleccione una imagen para ajustar sus propiedades.
        </div>
      `;
    }
  }

  bindHeaderControls() {
    // 1. Botón Deshacer (Undo)
    const btnUndo = document.getElementById('btnHeaderUndo');
    if (btnUndo) {
      btnUndo.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.cadUtils && this.cadService) {
          this.cadUtils.finishCurrentDrawing(); // Cancela o cierra cualquier trazo en progreso
          this.cadService.undo();
          this.cadUtils.selectionRenderEngine.updateEntitiesStroke();
          this.cadUtils.selectionRenderEngine.renderBezierHandles();
          paper.view.update();
          this.updateUndoRedoUI();
        }
      });
    }

    // 2. Botón Rehacer (Redo)
    const btnRedo = document.getElementById('btnHeaderRedo');
    if (btnRedo) {
      btnRedo.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.cadUtils && this.cadService) {
          this.cadUtils.finishCurrentDrawing();
          this.cadService.redo();
          this.cadUtils.selectionRenderEngine.updateEntitiesStroke();
          this.cadUtils.selectionRenderEngine.renderBezierHandles();
          paper.view.update();
          this.updateUndoRedoUI();
        }
      });
    }

    // 3. Botón Exportar a SVG
    const btnExport = document.getElementById('btnHeaderExportSVG');

    if (btnExport) {
      btnExport.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Invocación directa a la nueva función de ioService
        if (window.cadIO && typeof window.cadIO.exportSVG === 'function') {
          window.cadIO.exportSVG('sketch.svg');
        }
      });
    }
  }

  updateUndoRedoUI() {
    const btnUndo = document.getElementById('btnHeaderUndo');
    const btnRedo = document.getElementById('btnHeaderRedo');
    const history = this.cadService?.history || window.cadService?.history;
    if (!history) return;

    const canUndo = typeof history.canUndo === 'function' 
      ? history.canUndo() 
      : (history.undoStack && history.undoStack.length > 0);

    const canRedo = typeof history.canRedo === 'function' 
      ? history.redoStack.length > 0 
      : (history.redoStack && history.redoStack.length > 0);

    if (btnUndo) btnUndo.disabled = !canUndo;
    if (btnRedo) btnRedo.disabled = !canRedo;
  }

}
