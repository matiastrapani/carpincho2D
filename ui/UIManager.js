/**
 * modules/UIManager.js - Delegación de eventos e interfaz CAD
 */
import { EntityVisibilityLockCommand } from '../services/commands/cadCommands.js';

export class CADUIManager {
  constructor(cadUtils, cadService) {
    this.cadUtils = cadUtils;
    this.cadService = cadService;
    
    // Referencias bindeadas para listeners globales en window / document
    this._onGlobalKeyDown = this._handleGlobalKeyDown.bind(this);
    this._onDocumentMouseDown = this._handleDocumentMouseDown.bind(this);
    
    // Handlers de arrastre de la Toolbar
    this._onToolbarMouseMove = this._handleToolbarMouseMove.bind(this);
    this._onToolbarMouseUp = this._handleToolbarMouseUp.bind(this);
    this._onToolbarResizeMouseMove = this._handleToolbarResizeMouseMove.bind(this);
    this._onToolbarResizeMouseUp = this._handleToolbarResizeMouseUp.bind(this);
    this._onToolbarContextMenu = (e) => e.preventDefault();

    // Handlers de redimensionamiento del Sidebar
    this._onSidebarMouseMove = this._handleSidebarMouseMove.bind(this);
    this._onSidebarMouseUp = this._handleSidebarMouseUp.bind(this);

    this._onSidebarVerticalMouseMove = this._handleSidebarVerticalMouseMove.bind(this);
    this._onSidebarVerticalMouseUp = this._handleSidebarVerticalMouseUp.bind(this);

    this._verticalResizeState = {
      startY: 0,
      startHeight: 0,
      topPanel: null,
      resizer: null,
      sidebarContent: null
    };

    // Estado interno de arrastres
    this._dragState = {
      isDraggingToolbar: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
      currentDockState: 'floating',
      SNAP_THRESHOLD: 40,
      verticalToolbar: null,
      rightSidebar: null,
      panelLeftDockContainer: null,
      leftDockContainer: null,
      rightDockContainer: null,
      resizer: null
    };

    this._toolbarResizeState = {
      isResizingToolbar: false,
      startX: 0,
      startWidth: 0,
      verticalToolbar: null,
      toolColumns: 3
    };

    this._sidebarResizeState = {
      isResizingSidebar: false,
      lastExpandedWidth: 288,
      isCollapsed: false,
      rightSidebar: null,
      resizer: null
    };
  }

  _handleSidebarVerticalMouseMove(e) {
    const vs = this._verticalResizeState;
    if (!vs.topPanel || !vs.resizer || !vs.sidebarContent) return;

    const deltaY = e.clientY - vs.startY;
    const totalHeight = vs.sidebarContent.getBoundingClientRect().height;
    const resizerHeight = vs.resizer.getBoundingClientRect().height;
    const maxTopHeight = totalHeight - resizerHeight - 90;

    const newHeight = Math.max(90, Math.min(maxTopHeight, vs.startHeight + deltaY));
    vs.topPanel.style.height = `${newHeight}px`;
  }

  _handleSidebarVerticalMouseUp() {
    window.removeEventListener('mousemove', this._onSidebarVerticalMouseMove);
    window.removeEventListener('mouseup', this._onSidebarVerticalMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = 'none';
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

    this._verticalResizeState.topPanel = topPanel;
    this._verticalResizeState.resizer = resizer;
    this._verticalResizeState.sidebarContent = sidebarContent;

    resizer.addEventListener('mousedown', (e) => {
      this._verticalResizeState.startY = e.clientY;
      this._verticalResizeState.startHeight = topPanel.getBoundingClientRect().height;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      window.addEventListener('mousemove', this._onSidebarVerticalMouseMove);
      window.addEventListener('mouseup', this._onSidebarVerticalMouseUp);
    });
  }

  bindGlobalKeyboard() {
    document.addEventListener('keydown', this._onGlobalKeyDown);
  }
  
  // 1. Botones de herramientas simples
  bindToolButtons() {
    const simpleTools = [
      { id: 'btnPan', tool: 'pan' },
      { id: 'btnSelect', tool: 'select' },
      { id: 'btnMove', tool: 'move' },
      { id: 'btnCopy', tool: 'copy' },
      { id: 'btnRotate', tool: 'rotate' },
      { id: 'btnOffset', tool: 'offset' },
      { id: 'btnTrim', tool: 'trim' },
      { id: 'btnSplit', tool: 'split' },
      { id: 'btnExtend', tool: 'extend' },
      { id: 'btnConnect', tool: 'connect' },
      { id: 'btnJoin', tool: 'join' },
      { id: 'btnExplode', tool: 'explode' },
      { id: 'btnGroup', tool: 'group' },
      { id: 'btnUngroup', tool: 'ungroup' },
      { id: 'btnList', tool: 'list' }
    ];

    simpleTools.forEach(({ id, tool }) => {
      const el = document.getElementById(id);
      if (!el) return;

      const handleActivate = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeAllFlyouts();

        // Si está deshabilitado, repite el comportamiento inactivo del clic izquierdo
        if (el.disabled || el.classList.contains('disabled')) return;

        if (typeof this.cadUtils.setTool === 'function') {
          this.cadUtils.setTool(tool);
        }
      };

      // Clic izquierdo
      el.addEventListener('click', handleActivate);

      // Clic derecho en botón simple (activo o deshabilitado):
      // bloquea el menú del SO y cierra flyouts igual que el clic izquierdo en disabled
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeAllFlyouts();
      });
    });
  }

  // 2. Control Inteligente de Flyouts Desplegables (Auto-descubrimiento + vista previa en bloqueados)
  bindFlyouts() {
    const LONG_PRESS_MS = 250;
    const flyoutButtons = document.querySelectorAll('#toolGridContainer .has-flyout');

    const positionMenu = (btn, menu) => {
      const rect = btn.getBoundingClientRect();
      const toolbar = document.getElementById('verticalToolbar');
      const isRightSide =
        toolbar?.classList.contains('dock-right') ||
        toolbar?.classList.contains('dock-panel-left');

      // Medir altura real antes de mostrar para evitar recorte inferior
      menu.style.visibility = 'hidden';
      menu.classList.add('show');
      const menuHeight = menu.offsetHeight || 220;
      menu.classList.remove('show');
      menu.style.visibility = '';

      const maxTop = Math.max(8, window.innerHeight - menuHeight - 8);
      menu.style.position = 'fixed';
      menu.style.top = `${Math.min(rect.top, maxTop)}px`;

      if (isRightSide) {
        menu.style.left = 'auto';
        menu.style.right = `${window.innerWidth - rect.left + 4}px`;
      } else {
        menu.style.right = 'auto';
        menu.style.left = `${rect.right + 4}px`;
      }
    };

    flyoutButtons.forEach((btn) => {
      const menu = btn.parentElement?.querySelector('.flyout-menu');
      const mainIcon = btn.querySelector('.iconify');
      if (!menu) return;

      let pressTimer = null;
      let isLongPress = false;
      const isBtnDisabled = () => btn.disabled || btn.classList.contains('disabled');

      const openThisMenu = () => {
        this.closeAllFlyouts();
        positionMenu(btn, menu);
        menu.classList.add('show');
      };

      // Clic derecho siempre despliega (incluso si está bloqueado para inspección)
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openThisMenu();
      });

      btn.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isLongPress = false;
        pressTimer = setTimeout(() => {
          isLongPress = true;
          openThisMenu();
        }, LONG_PRESS_MS);
      });

      btn.addEventListener('mouseup', (e) => {
        if (e.button !== 0) return;
        clearTimeout(pressTimer);

        if (!isLongPress) {
          // Si el botón está bloqueado, clic rápido abre el flyout para previsualizar
          if (isBtnDisabled()) {
            const wasOpen = menu.classList.contains('show');
            this.closeAllFlyouts();
            if (!wasOpen) openThisMenu();
            return;
          }

          const defaultTool = btn.getAttribute('data-default-tool');
          if (defaultTool && typeof this.cadUtils.setTool === 'function') {
            this.cadUtils.setTool(defaultTool);
          }
          this.closeAllFlyouts();
        }
      });

      btn.addEventListener('mouseleave', () => clearTimeout(pressTimer));

      menu.querySelectorAll('.flyout-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          clearTimeout(pressTimer);

          if (item.classList.contains('disabled')) return;

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
        });
      });
    });

    document.addEventListener('mousedown', this._onDocumentMouseDown, true);
    document.addEventListener('contextmenu', this._onDocumentMouseDown, true);
  }

  closeAllFlyouts() {
    const menus = document.querySelectorAll('.flyout-menu');
    menus.forEach(m => m.classList.remove('show'));
  }
  
  // 3. Botones de acción rápida (Snap, Grid, Ortho, Extents, OK)
  bindTogglesAndActions() {
    const btnSnap = document.getElementById('btnSnap');
    if (btnSnap) btnSnap.addEventListener('click', () => this.cadUtils.toggleSnapMaster());

    const btnGrid = document.getElementById('btnGrid');
    if (btnGrid) {
      btnGrid.addEventListener('click', () => {
        if (typeof this.cadUtils.toggleGrid === 'function') {
          this.cadUtils.toggleGrid();
        } else {
          this.cadUtils.viewportManager.toggleGrid();
        }
      });
    }

    const btnOrtho = document.getElementById('btnOrtho');
    if (btnOrtho) {
      btnOrtho.addEventListener('click', () => {
        if (typeof this.cadUtils.toggleOrtho === 'function') {
          this.cadUtils.toggleOrtho();
        }
      });
    }

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
    const filters = [
      'endpoint',
      'nearest',
      'node',
      'midpoint',
      'center',
      'intersection',
      'perpendicular',
      'tangent',
      'quadrant',
      'grid'
    ];

    filters.forEach(filter => {
      const chip = document.getElementById(`chip${filter.charAt(0).toUpperCase() + filter.slice(1)}`);
      if (chip) {
        chip.addEventListener('click', () => this.cadUtils.toggleSnapFilter(filter));
      }
    });
  }

  // 5. Arrastre, acople (docking) y redimensionamiento multi-columna de la barra
  bindToolbarDockAndResize() {
    // Bloquea el menú contextual nativo del navegador en toda la barra (incluso sobre botones disabled)
    verticalToolbar.addEventListener('contextmenu', this._onToolbarContextMenu, true);
    document.querySelectorAll('.flyout-menu').forEach((menu) => {
      menu.addEventListener('contextmenu', this._onToolbarContextMenu, true);
    });
    const dragHandle = document.getElementById('toolbarDragHandle');
    const toolbarWidthResizer = document.getElementById('toolbarWidthResizer');

    if (!verticalToolbar || !dragHandle) return;
    
    verticalToolbar.addEventListener('contextmenu', this._onToolbarContextMenu);

    this._dragState.verticalToolbar = verticalToolbar;
    this._dragState.leftDockContainer = document.getElementById('leftDockContainer');
    this._dragState.panelLeftDockContainer = document.getElementById('panelLeftDockContainer');
    this._dragState.rightDockContainer = document.getElementById('rightDockContainer');
    this._dragState.rightSidebar = document.getElementById('rightSidebar');
    this._dragState.resizer = document.getElementById('resizer');

    // Sincronizar el estado inicial real según el contenedor HTML
    if (verticalToolbar.parentElement === this._dragState.leftDockContainer) {
      this._dragState.currentDockState = 'docked-left';
    } else if (verticalToolbar.parentElement === this._dragState.panelLeftDockContainer) {
      this._dragState.currentDockState = 'docked-panel-left';
    } else if (verticalToolbar.parentElement === this._dragState.rightDockContainer) {
      this._dragState.currentDockState = 'docked-right';
    } else if (verticalToolbar.parentElement !== document.body) {
      this._dragState.currentDockState = 'docked';
    }

    dragHandle.addEventListener('mousedown', (e) => {
      this._dragState.isDraggingToolbar = true;
      const rect = verticalToolbar.getBoundingClientRect();
      this._dragState.dragOffsetX = e.clientX - rect.left;
      this._dragState.dragOffsetY = e.clientY - rect.top;

      if (this._dragState.currentDockState !== 'floating') {
        const startX = rect.left;
        const startY = rect.top;
        this._applyDockState('floating');
        verticalToolbar.style.left = `${startX}px`;
        verticalToolbar.style.top = `${startY}px`;
      }
      document.body.style.cursor = 'grabbing';

      window.addEventListener('mousemove', this._onToolbarMouseMove);
      window.addEventListener('mouseup', this._onToolbarMouseUp);
    });

    this._toolbarResizeState.verticalToolbar = verticalToolbar;
    toolbarWidthResizer?.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this._toolbarResizeState.isResizingToolbar = true;
      this._toolbarResizeState.startX = e.clientX;
      this._toolbarResizeState.startWidth = verticalToolbar.offsetWidth;
      document.body.style.cursor = 'ew-resize';

      window.addEventListener('mousemove', this._onToolbarResizeMouseMove);
      window.addEventListener('mouseup', this._onToolbarResizeMouseUp);
    });
  }

  // 6. Colapsado y redimensionamiento del Panel Lateral Derecho
  bindSidebarControls() {
    const rightSidebar = document.getElementById('rightSidebar');
    const resizer = document.getElementById('resizer');
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    const btnExpandSidebar = document.getElementById('btnExpandSidebar');

    if (!rightSidebar || !btnToggleSidebar) return;

    this._sidebarResizeState.rightSidebar = rightSidebar;
    this._sidebarResizeState.resizer = resizer;
    this._sidebarResizeState.btnExpandSidebar = btnExpandSidebar;
    this._sidebarResizeState.expandRevealTimer = null;

    resizer?.addEventListener('mousedown', () => {
      if (this._sidebarResizeState.isCollapsed) return;
      this._sidebarResizeState.isResizingSidebar = true;
      resizer.classList.add('is-dragging');
      rightSidebar.style.transition = 'none';
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      window.addEventListener('mousemove', this._onSidebarMouseMove);
      window.addEventListener('mouseup', this._onSidebarMouseUp);
    });

    btnToggleSidebar.addEventListener('click', () => this.toggleSidebar(true));
    btnExpandSidebar?.addEventListener('click', () => this.toggleSidebar(false));
  }

  toggleSidebar(forceState = null) {
    const rightSidebar = this._sidebarResizeState.rightSidebar || document.getElementById('rightSidebar');
    const sidebarHeader = document.getElementById('sidebarHeader');
    const sidebarContent = document.getElementById('sidebarContent');
    const resizer = this._sidebarResizeState.resizer || document.getElementById('resizer');
    const btnExpandSidebar = this._sidebarResizeState.btnExpandSidebar || document.getElementById('btnExpandSidebar');

    if (!rightSidebar) return;

    const collapsed = typeof forceState === 'boolean'
      ? forceState
      : !this._sidebarResizeState.isCollapsed;

    this._sidebarResizeState.isCollapsed = collapsed;
    clearTimeout(this._sidebarResizeState.expandRevealTimer);
    rightSidebar.style.transition = 'width 180ms ease-out';

    if (collapsed) {
      rightSidebar.classList.add('overflow-hidden');
      rightSidebar.style.width = '0px';
      resizer?.classList.add('hidden');
      resizer?.classList.remove('has-docked-border');

      if (this._dragState.currentDockState === 'docked-right') {
        this._applyDockState('docked-panel-left');
      }

      const revealExpandBtn = () => {
        if (!this._sidebarResizeState.isCollapsed) return;
        sidebarHeader?.classList.add('hidden');
        sidebarContent?.classList.add('hidden');
        this._updateExpandButtonPosition();
        btnExpandSidebar?.classList.remove('hidden');
      };

      const onTransitionEnd = (e) => {
        if (e.propertyName !== 'width') return;
        rightSidebar.removeEventListener('transitionend', onTransitionEnd);
        clearTimeout(this._sidebarResizeState.expandRevealTimer);
        revealExpandBtn();
      };

      rightSidebar.addEventListener('transitionend', onTransitionEnd);
      this._sidebarResizeState.expandRevealTimer = setTimeout(() => {
        rightSidebar.removeEventListener('transitionend', onTransitionEnd);
        revealExpandBtn();
      }, 195);
    } else {
      btnExpandSidebar?.classList.add('hidden');
      sidebarHeader?.classList.remove('hidden');
      sidebarContent?.classList.remove('hidden');
      rightSidebar.style.width = `${this._sidebarResizeState.lastExpandedWidth}px`;
      resizer?.classList.remove('hidden');

      if (this._dragState.currentDockState === 'docked-panel-left') {
        resizer?.classList.add('has-docked-border');
      }

      const onExpandEnd = (e) => {
        if (e.propertyName !== 'width') return;
        rightSidebar.removeEventListener('transitionend', onExpandEnd);
        if (!this._sidebarResizeState.isCollapsed) {
          rightSidebar.classList.remove('overflow-hidden');
        }
      };

      rightSidebar.addEventListener('transitionend', onExpandEnd);
      this._sidebarResizeState.expandRevealTimer = setTimeout(() => {
        rightSidebar.removeEventListener('transitionend', onExpandEnd);
        if (!this._sidebarResizeState.isCollapsed) {
          rightSidebar.classList.remove('overflow-hidden');
        }
      }, 195);
    }
  }

  _updateExpandButtonPosition() {
    const btnExpandSidebar = this._sidebarResizeState.btnExpandSidebar || document.getElementById('btnExpandSidebar');
    if (!btnExpandSidebar) return;

    const dockState = this._dragState.currentDockState;
    if (this._sidebarResizeState.isCollapsed && dockState === 'docked-panel-left') {
      const dockWidth = this._dragState.panelLeftDockContainer?.offsetWidth || 0;
      btnExpandSidebar.style.right = `${dockWidth + 6}px`;
    } else {
      btnExpandSidebar.style.right = '6px';
    }
  }

  bindImageImport() {
    const btnImport = document.getElementById('btnImportImage');
    const inputFile = document.getElementById('inputImageFile');

    if (!btnImport || !inputFile) return;

    btnImport.addEventListener('click', () => {
      inputFile.value = '';
      inputFile.click();
    });

    inputFile.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const ioService = this.cadUtils?.ioService;
      if (ioService && typeof ioService.importFile === 'function') {
        ioService.importFile(file, null, { source: 'ui' });
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        if (typeof this.cadUtils.importImageToCanvas === 'function') {
          this.cadUtils.importImageToCanvas(event.target.result, null, {
            fileName: file.name,
            source: 'ui'
          });
        }
      };
      reader.readAsDataURL(file);
    });
  }

  bindHeaderControls() {
    // 0. Botón Nuevo Dibujo (New)
    const btnNew = document.getElementById('btnHeaderNew');
    if (btnNew) {
      btnNew.addEventListener('click', (e) => {
        e.preventDefault();
        if (!this.cadService) return;

        const hasWork = Boolean(
          this.cadService.entities?.length > 0 ||
          this.cadService.history?.canUndo?.()
        );

        if (hasWork && !window.confirm('¿Iniciar un dibujo nuevo? Se perderán los cambios actuales.')) {
          return;
        }

        this.cadService.resetDocument();
      });
    }

    // 1. Botón Deshacer (Undo)
    const btnUndo = document.getElementById('btnHeaderUndo');
    if (btnUndo) {
      btnUndo.addEventListener('click', (e) => {
        e.preventDefault();
        const cm = this.cadUtils?.consoleManager;
        if (cm && typeof cm.triggerUndo === 'function') {
          cm.triggerUndo();
          return;
        }
        if (this.cadUtils && this.cadService) {
          this.cadService.undo();
          this.cadUtils.selectionRenderEngine?.updateEntitiesStroke();
          this.cadUtils.selectionRenderEngine?.renderBezierHandles();
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
        const cm = this.cadUtils?.consoleManager;
        if (cm && typeof cm.triggerRedo === 'function') {
          cm.triggerRedo();
          return;
        }
        if (this.cadUtils && this.cadService) {
          this.cadService.redo();
          this.cadUtils.selectionRenderEngine?.updateEntitiesStroke();
          this.cadUtils.selectionRenderEngine?.renderBezierHandles();
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
        const ioService = this.cadUtils?.ioService;
        if (ioService && typeof ioService.exportSVG === 'function') {
          ioService.exportSVG('sketch.svg');
        }
      });
    }

    const bindRightClickIconFlash = (btnEl, btnId, activeIcon, hasTargetsFn) => {
      if (!btnEl) return;
      btnEl.addEventListener('mousedown', (e) => {
        if (e.button !== 2 || !hasTargetsFn()) return;
        const headerToolbar = this.cadUtils?.headerToolbar;
        if (typeof headerToolbar?.flashButtonIcon !== 'function') return;

        const release = headerToolbar.flashButtonIcon(btnId, activeIcon, 220);
        const onRelease = () => {
          window.removeEventListener('mouseup', onRelease);
          window.removeEventListener('blur', onRelease);
          release();
        };
        window.addEventListener('mouseup', onRelease);
        window.addEventListener('blur', onRelease);
      });
    };

    // 4. Botón Ocultar selección (clic izq) / Desocultar todo (clic der)
    const btnVisibility = document.getElementById('btnHeaderVisibility');
    if (btnVisibility) {
      bindRightClickIconFlash(
        btnVisibility,
        'btnHeaderVisibility',
        'lucide:eye',
        () => Boolean(this.cadUtils?.layerManager?.hasHiddenEntities?.())
      );

      btnVisibility.addEventListener('click', (e) => {
        e.preventDefault();
        const targets = (this.cadService?.selectedEntities || []).filter((ent) => !ent?.data?.isHidden);
        if (!targets.length) return;
        const cmd = new EntityVisibilityLockCommand(this.cadService, targets, 'hide', this.cadUtils);
        this.cadService.executeCommand(cmd);
      });

      btnVisibility.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const targets = (this.cadService?.entities || []).filter((ent) => Boolean(ent?.data?.isHidden));
        if (!targets.length) return;
        const cmd = new EntityVisibilityLockCommand(this.cadService, targets, 'unhideAll', this.cadUtils);
        this.cadService.executeCommand(cmd);
      });
    }

    // 5. Botón Bloquear selección (clic izq) / Desbloquear todo (clic der)
    const btnLock = document.getElementById('btnHeaderLock');
    if (btnLock) {
      bindRightClickIconFlash(
        btnLock,
        'btnHeaderLock',
        'lucide:lock-open',
        () => Boolean(this.cadUtils?.layerManager?.hasLockedEntities?.())
      );

      btnLock.addEventListener('click', (e) => {
        e.preventDefault();
        const targets = (this.cadService?.selectedEntities || []).filter((ent) => !ent?.data?.isLocked);
        if (!targets.length) return;
        const cmd = new EntityVisibilityLockCommand(this.cadService, targets, 'lock', this.cadUtils);
        this.cadService.executeCommand(cmd);
      });

      btnLock.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const targets = (this.cadService?.entities || []).filter((ent) => Boolean(ent?.data?.isLocked));
        if (!targets.length) return;
        const cmd = new EntityVisibilityLockCommand(this.cadService, targets, 'unlockAll', this.cadUtils);
        this.cadService.executeCommand(cmd);
      });
    }
  }

  updateUndoRedoUI() {
    const btnUndo = document.getElementById('btnHeaderUndo');
    const btnRedo = document.getElementById('btnHeaderRedo');
    const history = this.cadService?.history;
    if (!history) return;

    const activeTool = this.cadUtils?.toolManager?.activeTool;
    const toolCanUndo = Boolean(activeTool?.sessionVertices?.length > 0 || activeTool?.canUndo?.());
    const toolCanRedo = Boolean(activeTool?.redoVertices?.length > 0 || activeTool?.canRedo?.());

    const canUndo = toolCanUndo || (typeof history.canUndo === 'function'
      ? history.canUndo()
      : Boolean(history.undoStack?.length));

    const canRedo = toolCanRedo || (typeof history.canRedo === 'function'
      ? history.canRedo()
      : Boolean(history.redoStack?.length));

    if (btnUndo) btnUndo.disabled = !canUndo;
    if (btnRedo) btnRedo.disabled = !canRedo;

    const headerToolbar = this.cadUtils?.headerToolbar;
    const layerManager = this.cadUtils?.layerManager;
    if (headerToolbar && layerManager) {
      headerToolbar.updateTooltips({
        hasHidden: layerManager.hasHiddenEntities(),
        hasLocked: layerManager.hasLockedEntities()
      });
    }
  }

  _handleDocumentMouseDown(e) {
    // Si el clic ocurre FUERA de cualquier contenedor de flyout/desplegable
    if (!e.target.closest('.has-flyout') && !e.target.closest('.flyout-menu')) {
      this.closeAllFlyouts();
    }
  }

  _handleGlobalKeyDown(e) {
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
  }

  _applyDockState(dockState) {
    const s = this._dragState;
    const isCollapsed = this._sidebarResizeState.isCollapsed;
    s.currentDockState = dockState;
    
    if (dockState === 'docked-panel-left') {
      s.panelLeftDockContainer?.appendChild(s.verticalToolbar);
      s.verticalToolbar.className = 'relative cad-panel p-1 flex flex-col items-center gap-1 z-50 toolbar-docked dock-panel-left pointer-events-auto';
      s.verticalToolbar.style.top = '';
      s.verticalToolbar.style.left = '';
      if (isCollapsed) {
        s.resizer?.classList.remove('has-docked-border');
      } else {
        s.resizer?.classList.add('has-docked-border');
      }
    } else {
      s.resizer?.classList.remove('has-docked-border');

      if (dockState === 'docked-left') {
        s.leftDockContainer?.appendChild(s.verticalToolbar);
        s.verticalToolbar.className = 'relative cad-panel p-1 flex flex-col items-center gap-1 z-50 toolbar-docked dock-left pointer-events-auto';
        s.verticalToolbar.style.top = '';
        s.verticalToolbar.style.left = '';
      } else if (dockState === 'docked-right' && !isCollapsed) {
        s.rightDockContainer?.appendChild(s.verticalToolbar);
        s.verticalToolbar.className = 'relative cad-panel p-1 flex flex-col items-center gap-1 z-50 toolbar-docked dock-right pointer-events-auto';
        s.verticalToolbar.style.top = '';
        s.verticalToolbar.style.left = '';
      } else {
        document.body.appendChild(s.verticalToolbar);
        s.verticalToolbar.className = 'absolute cad-panel p-1 flex flex-col items-center gap-1 z-50 toolbar-floating dock-left pointer-events-auto';
      }
    }

    this._updateExpandButtonPosition();
  }

  _handleToolbarMouseMove(e) {
    const s = this._dragState;
    if (!s.isDraggingToolbar || !s.verticalToolbar) return;

    let newX = e.clientX - s.dragOffsetX;
    let newY = e.clientY - s.dragOffsetY;
    newY = Math.max(8, Math.min(newY, window.innerHeight - s.verticalToolbar.offsetHeight - 8));

    const isCollapsed = this._sidebarResizeState.isCollapsed;
    const sidebarRect = (!isCollapsed && s.rightSidebar)
      ? s.rightSidebar.getBoundingClientRect()
      : { left: window.innerWidth, right: window.innerWidth };

    if (e.clientX <= s.SNAP_THRESHOLD) {
      this._applyDockState('docked-left');
      return;
    }

    // Con panel colapsado: cualquier acople en el borde derecho va a docked-panel-left (sin margen)
    if (isCollapsed) {
      if (e.clientX >= window.innerWidth - s.SNAP_THRESHOLD) {
        this._applyDockState('docked-panel-left');
        return;
      }
    } else {
      if (Math.abs(e.clientX - sidebarRect.left) <= s.SNAP_THRESHOLD) {
        this._applyDockState('docked-panel-left');
        return;
      }
      if (e.clientX >= window.innerWidth - s.SNAP_THRESHOLD || e.clientX >= sidebarRect.right - s.SNAP_THRESHOLD) {
        this._applyDockState('docked-right');
        return;
      }
    }

    if (s.currentDockState !== 'floating') this._applyDockState('floating');

    const toolbarWidth = s.verticalToolbar.offsetWidth;
    newX = Math.max(8, Math.min(newX, window.innerWidth - toolbarWidth - 8));
    s.verticalToolbar.style.left = `${newX}px`;
    s.verticalToolbar.style.top = `${newY}px`;
  }

  _handleToolbarMouseUp() {
    if (this._dragState.isDraggingToolbar) {
      this._dragState.isDraggingToolbar = false;
      document.body.style.cursor = 'default';
      window.removeEventListener('mousemove', this._onToolbarMouseMove);
      window.removeEventListener('mouseup', this._onToolbarMouseUp);
    }
  }

  _handleToolbarResizeMouseMove(e) {
    const rs = this._toolbarResizeState;
    if (!rs.isResizingToolbar || !rs.verticalToolbar) return;

    let deltaX = e.clientX - rs.startX;
    if (this._dragState.currentDockState === 'docked-right' || this._dragState.currentDockState === 'docked-panel-left') {
      deltaX = -deltaX;
    }

    const targetWidth = rs.startWidth + deltaX;
    if (targetWidth < 70) rs.toolColumns = 1;
    else if (targetWidth >= 70 && targetWidth < 110) rs.toolColumns = 2;
    else if (targetWidth >= 110 && targetWidth < 150) rs.toolColumns = 3;
    else rs.toolColumns = 4;

    rs.verticalToolbar.style.setProperty('--tool-cols', rs.toolColumns);
  }

  _handleToolbarResizeMouseUp() {
    if (this._toolbarResizeState.isResizingToolbar) {
      this._toolbarResizeState.isResizingToolbar = false;
      document.body.style.cursor = 'default';
      window.removeEventListener('mousemove', this._onToolbarResizeMouseMove);
      window.removeEventListener('mouseup', this._onToolbarResizeMouseUp);
      this._updateExpandButtonPosition();
    }
  }

  _handleSidebarMouseMove(e) {
    const ss = this._sidebarResizeState;
    if (!ss.isResizingSidebar || ss.isCollapsed || !ss.rightSidebar) return;

    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= 180 && newWidth <= 520) {
      ss.lastExpandedWidth = newWidth;
      ss.rightSidebar.style.width = `${newWidth}px`;
    }
  }

  _handleSidebarMouseUp() {
    const ss = this._sidebarResizeState;
    if (ss.isResizingSidebar) {
      ss.isResizingSidebar = false;
      ss.resizer?.classList.remove('is-dragging');
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', this._onSidebarMouseMove);
      window.removeEventListener('mouseup', this._onSidebarMouseUp);
    }
  }

  // --- MÉTODOS DE DESTRUCCIÓN Y CLEANUP ---
  destroy() {
    this.cleanup();
  }

  cleanup() {
    if (this._dragState.verticalToolbar && this._onToolbarContextMenu) {
      this._dragState.verticalToolbar.removeEventListener('contextmenu', this._onToolbarContextMenu, true);
    }
    document.querySelectorAll('.flyout-menu').forEach((menu) => {
      menu.removeEventListener('contextmenu', this._onToolbarContextMenu, true);
    });

    document.removeEventListener('keydown', this._onGlobalKeyDown);
    document.removeEventListener('mousedown', this._onDocumentMouseDown);

    window.removeEventListener('mousemove', this._onToolbarMouseMove);
    window.removeEventListener('mouseup', this._onToolbarMouseUp);
    window.removeEventListener('mousemove', this._onToolbarResizeMouseMove);
    window.removeEventListener('mouseup', this._onToolbarResizeMouseUp);

    window.removeEventListener('mousemove', this._onSidebarMouseMove);
    window.removeEventListener('mouseup', this._onSidebarMouseUp);

    window.removeEventListener('mousemove', this._onSidebarVerticalMouseMove);
    window.removeEventListener('mouseup', this._onSidebarVerticalMouseUp);
  }
}
