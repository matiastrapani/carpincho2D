import { CADToolbarComponent } from './ui/toolbarComponent.js';
import { ConsoleManager } from './ui/console/ConsoleManager.js';

import { CADService } from './services/cadService.js';
import { CADUtils } from './cadUtils.js';
import { CADUIManager } from './ui/uiManager.js';
import { LayerPanelUI } from './ui/LayerPanelUI.js';
import { PropertyPanelUI } from './ui/PropertyPanelUI.js';
import { CAD_THEME, applyThemeToDocument } from './config/cadTheme.js';
import { populateentities } from './services/demoScene.js';

const onLoadHandler = () => {
  window.removeEventListener('load', onLoadHandler);
  applyThemeToDocument(CAD_THEME);

  // 1. Inyectar la UI visual (Toolbar base + Consolas)
  const toolbar = new CADToolbarComponent('fixedConsoleContainer');
  toolbar.render();
  window.consoleManager = new ConsoleManager('fixedConsoleSlot');
  window.fixedConsoleUI = window.consoleManager.fixedUI;
  window.floatingConsoleUI = window.consoleManager.floatingUI;

  if (window.Iconify) {
    window.Iconify.scan(document.getElementById('fixedConsoleContainer'));
  }

  // 2. Inicializar Servicios CAD y vincular consola
  window.cadService = new CADService();
  window.cadUtils = new CADUtils('cadCanvas', window.cadService);
  window.consoleManager.setUtils(window.cadUtils);
  window.cadIO = window.cadUtils.ioService;
  window.canvasViewportManager = window.cadUtils.viewportManager;

  // 3. Inicializar Administradores de UI
  window.cadUI = new CADUIManager(window.cadUtils, window.cadService);
  window.layerPanelUI = new LayerPanelUI(window.cadUtils, 'layerPanelContainer');
  window.propertyPanelUI = new PropertyPanelUI(window.cadUtils, 'propertyPanelContainer', {
    layerPanelUI: window.layerPanelUI,
    paperInstance: window.paper
  });

  // 4. Cargar entidades iniciales y refrescar visuales
  window.cadUI.init();
  window.canvasViewportManager.initPaper();
  populateentities(window.cadService);


  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      window.canvasViewportManager.handleCanvasResize();
      paper.view.center = new paper.Point(0, 0);
      paper.view.update();
    });
  }

  window.layerPanelUI.refresh();
  window.propertyPanelUI.refresh();

  window.cadUtils.selectionRenderEngine.renderBezierHandles();
  window.cadUtils.setTool('select');
};

window.addEventListener('load', onLoadHandler);