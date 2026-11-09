/**
 * modules/ioService.js - Exportación e Importación de archivos
 */
import { ImageController } from '../../controllers/ImageController.js';
import { AddEntityCommand, ImportSVGCommand } from '../commands/cadCommands.js';

export class CADIOService {
  constructor(cadService, cadUtils) {
    this.service = cadService;
    this.utils = cadUtils;

    // Referencias guardadas para poder desvincular los eventos en cleanup()
    this._attachedCanvas = null;
    this._preventDefaultHandler = (e) => { e.preventDefault(); e.stopPropagation(); };
    this._dragOverHandler = this._handleDragOver.bind(this);
    this._dragLeaveHandler = this._handleDragLeave.bind(this);
    this._dropHandler = this._handleDrop.bind(this);
  }

  // --- IMPORTACIÓN DE ARCHIVOS ---

  importImageToCanvas(imageSrc, dropPosition = null) {
    const raster = new paper.Raster(imageSrc);

    raster.on('load', () => {
      const utils = this.utils || window.cadUtils;
      const cadService = this.service || window.cadService;

      raster.data.controller = new ImageController(raster);
      raster.position = dropPosition || paper.view.center.clone();

      if (!raster.data) raster.data = {};
      raster.data.isImageEntity = true;

      // 1. Asignar nombre correlativo ("Imagen 1", "Imagen 2")
      const imageName = utils?.generateNextEntityName ? utils.generateNextEntityName('Imagen') : 'Imagen';
      raster.name = imageName;
      raster.data.name = imageName;

      // 2. Vincular propiedades por defecto
      if (utils?.propertyManager) {
        utils.propertyManager.applyDefaultSettings(raster);
      }

      raster.data.baseOpacity = raster.opacity;
      raster.data.controller = new ImageController(raster);

      raster.sendToBack();
      if (utils?.gridGroup) utils.gridGroup.sendToBack();

      // 3. Registrar comando en el historial para Undo / Redo
      const cmd = new AddEntityCommand(cadService, raster);
      cadService.executeCommand(cmd);

      cadService.selectEntity(raster, false);
      if (utils?.selectionRenderEngine.updateEntitiesStroke) utils.selectionRenderEngine.updateEntitiesStroke();
      if (utils?.selectionRenderEngine.renderBezierHandles) utils.selectionRenderEngine.renderBezierHandles();

      if (window.cadUI && typeof window.cadUI.updatePropertyPanel === 'function') {
        window.cadUI.updatePropertyPanel(raster);
      }

      if (utils?.setPrompt) utils.setPrompt('Imagen importada al lienzo.');
    });
  }

  importSVGToCanvas(svgString, dropPosition) {
    const utils = this.utils || window.cadUtils;
    const cadService = this.service || window.cadService;

    const layerManager = cadService?.layerManager || utils?.layerManager;
    const activeCadLayer = layerManager ? layerManager.getActiveLayer() : null;

    const targetContainer = activeCadLayer?.paperGroup || utils?.drawLayer || paper.project.activeLayer;

    if (targetContainer && typeof targetContainer.activate === 'function') {
      targetContainer.activate();
    }

    paper.project.importSVG(svgString, {
      expandShapes: true,
      insert: true,
      onLoad: (item) => {
        if (!item) return;

        item.applyMatrix = true;
        item.position = dropPosition || paper.view.center.clone();

        const importedEntities = [];
        const layerColor = activeCadLayer?.color || (activeCadLayer?.data && activeCadLayer.data.color) || null;

        const processVectorEntity = (ent) => {
          if (!ent) return;
          ent.data = ent.data || {};

          if (layerColor) {
            ent.strokeColor = layerColor;
          }

          ent.data.origStrokeColor = ent.strokeColor ? (ent.strokeColor.toCSS ? ent.strokeColor.toCSS() : ent.strokeColor) : null;
          ent.data.origFillColor = ent.fillColor ? (ent.fillColor.toCSS ? ent.fillColor.toCSS() : ent.fillColor) : null;
          ent.data.baseStrokeWidth = ent.strokeWidth || 1;
          ent.data.isSvgEntity = true;

          if (activeCadLayer?.id) {
            ent.data.layerId = String(activeCadLayer.id);
          }

          if (ent instanceof paper.Path && ent.fillColor && !ent.closed) {
            ent.closed = true;
          }

          if (targetContainer && typeof targetContainer.addChild === 'function') {
            targetContainer.addChild(ent);
          }

          if (cadService && typeof cadService.registerEntity === 'function') {
            cadService.registerEntity(ent);
          }
          importedEntities.push(ent);
        };

        const registerChildren = (parent) => {
          if (!parent) return;
          if (parent instanceof paper.CompoundPath) {
            processVectorEntity(parent);
          } else if (parent.children && parent.children.length > 0) {
            const children = [...parent.children];
            children.forEach(child => registerChildren(child));
          } else if (parent instanceof paper.Path) {
            processVectorEntity(parent);
          }
        };

        registerChildren(item);
        item.remove();

        if (importedEntities.length > 0) {
          const cmd = new ImportSVGCommand(cadService, utils, importedEntities, []);
          if (cadService && typeof cadService.executeCommand === 'function') {
            cadService.executeCommand(cmd);
          }
        }

        if (utils?.selectionRenderEngine?.updateEntitiesStroke) utils.selectionRenderEngine.updateEntitiesStroke();
        if (utils?.selectionRenderEngine?.renderBezierHandles) utils.selectionRenderEngine.renderBezierHandles();
        if (paper.view) paper.view.update();
        if (utils?.setPrompt) utils.setPrompt('Dibujo SVG importado en la capa activa.');
      }
    });
  }

  setupDragAndDrop(canvasElement) {
    const canvas = canvasElement || this.utils?.canvasElement || document.getElementById('cadCanvas');
    if (!canvas) return;

    // Si ya existía un canvas enganchado previo, limpiamos sus listeners primero
    if (this._attachedCanvas) {
      this.cleanup();
    }

    this._attachedCanvas = canvas;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      canvas.addEventListener(eventName, this._preventDefaultHandler, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      canvas.addEventListener(eventName, this._dragOverHandler, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      canvas.addEventListener(eventName, this._dragLeaveHandler, false);
    });

    canvas.addEventListener('drop', this._dropHandler, false);
  }

  // --- EXPORTACIÓN DE ARCHIVOS ---
  
  async exportSVG(defaultFileName = 'dibujo_carpincho.svg') {
    if (!paper || !paper.project) return;

    // Array para almacenar y restaurar lo que desconectaremos del proyecto
    const detachedItems = [];

    // 1. DESCONECTAR temporalmente del proyecto la capa HUD, la Grilla y las Guías
    // (Simplemente hacer `visible = false` no impide que Paper.js los guarde en el XML)
    
    // A) Capa HUD
    const hudLayer = paper.project.layers.find(l => l.name === 'hudLayer');
    if (hudLayer) {
      hudLayer.remove();
      detachedItems.push({ item: hudLayer, parent: paper.project, isLayer: true });
    }

    // B) Grupo de Grilla y Ejes Principales
    if (window.cadUtils && window.cadUtils.gridGroup) {
      const grid = window.cadUtils.gridGroup;
      const parent = grid.parent;
      if (parent) {
        grid.remove();
        detachedItems.push({ item: grid, parent: parent, isLayer: false });
      }
    }

    // C) Controles visuales y manejadores temporales
    if (window.cadUtils && window.cadUtils.controlHandlesGroup) {
      const handles = window.cadUtils.controlHandlesGroup;
      const parent = handles.parent;
      if (parent) {
        handles.remove();
        detachedItems.push({ item: handles, parent: parent, isLayer: false });
      }
    }

    // 2. Exportación limpia: ahora el proyecto SOLO contiene las geometrías dibujadas
    const svgString = paper.project.exportSVG({
      asString: true,
      bounds: 'content',   // Enmarca exclusivamente el dibujo real
      matchShapes: true,   // Mantiene etiquetas SVG nativas (<circle>, <rect>)
      precision: 4
    });

    // 3. RE-CONECTAR inmediatamente la interfaz y la grilla al Canvas
    detachedItems.forEach(({ item, parent, isLayer }) => {
      if (isLayer) {
        paper.project.addLayer(item);
      } else if (parent) {
        parent.addChild(item);
      }
    });

    paper.view.update();

    // 4. Guardar archivo con la API nativa "Guardar como..." del SO
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultFileName,
          types: [{
            description: 'Archivo Vectorial SVG',
            accept: { 'image/svg+xml': ['.svg'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // Cancelado por el usuario
        console.warn('Fallback a descarga tradicional:', err);
      }
    }

    // Respaldo para navegadores que no soportan File System Access API
    let chosenName = prompt('Ingrese el nombre para guardar el archivo:', defaultFileName);
    if (!chosenName) return;
    if (!chosenName.toLowerCase().endsWith('.svg')) {
      chosenName += '.svg';
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = chosenName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  _handleDragOver() {
    if (this._attachedCanvas) this._attachedCanvas.classList.add('drag-over');
  }

  _handleDragLeave() {
    if (this._attachedCanvas) this._attachedCanvas.classList.remove('drag-over');
  }

  _handleDrop(e) {
    if (this._attachedCanvas) this._attachedCanvas.classList.remove('drag-over');

    const dt = e.dataTransfer;
    const files = dt.files;

    if (files && files.length > 0) {
      const file = files[0];
      const viewPoint = paper.view.getEventPoint(e);

      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const svgString = event.target.result;
          this.importSVGToCanvas(svgString, viewPoint);
        };
        reader.readAsText(file);
      } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const imageSrc = event.target.result;
          this.importImageToCanvas(imageSrc, viewPoint);
        };
        reader.readAsDataURL(file);
      }
    }
  }


  // --- LIMPIEZA Y DESTRUCCIÓN DE LISTENERS ---
  cleanup() {
    if (!this._attachedCanvas) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this._attachedCanvas.removeEventListener(eventName, this._preventDefaultHandler, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      this._attachedCanvas.removeEventListener(eventName, this._dragOverHandler, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      this._attachedCanvas.removeEventListener(eventName, this._dragLeaveHandler, false);
    });

    this._attachedCanvas.removeEventListener('drop', this._dropHandler, false);
    this._attachedCanvas = null;
  }
}