import { CADToolbarComponent } from './ui/toolbarComponent.js';
import { CADService } from './services/cadService.js';
import { CADUtils } from './cadUtils.js';
import { CADUIManager } from './ui/uiManager.js';
import { LayerPanelUI } from './ui/LayerPanelUI.js';
import { PropertyPanelUI } from './ui/PropertyPanelUI.js';

const onLoadHandler = () => {
  // Desenganchar inmediatamente el listener de arranque
  window.removeEventListener('load', onLoadHandler);

  // 1. Inyectar Componente de Interfaz
  const toolbar = new CADToolbarComponent('fixedConsoleContainer');
  toolbar.render();

  if (window.Iconify) {
    window.Iconify.scan(document.getElementById('fixedConsoleContainer'));
  }

  // 2. Inicializar Servicios principales
  window.cadService = new CADService();
  window.cadUtils = new CADUtils('cadCanvas', window.cadService);
  window.cadIO = window.cadUtils.ioService;

  // 3. Inicializar Viewport Manager y Paper.js
  window.canvasViewportManager = window.cadUtils.viewportManager;
  
  // 4. Inicializar Administradores de UI
  window.cadUI = new CADUIManager(window.cadUtils, window.cadService);
  window.layerPanelUI = new LayerPanelUI(window.cadUtils, 'layerPanelContainer');
  window.propertyPanelUI = new PropertyPanelUI(window.cadUtils, 'propertyPanelContainer');

  // 5. Cargar entidades iniciales y refrescar visuales
  window.cadUI.init();
  window.canvasViewportManager.initPaper();
  window.cadService.createDemoEntities();


  // Refrescar tamaño y centro exacto tras la carga de recursos de la página
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