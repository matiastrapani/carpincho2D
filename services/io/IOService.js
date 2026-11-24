/**
 * services/io/IOService.js - Exportación e Importación de archivos (Imágenes y SVG)
 */
import { ImageController } from '../../controllers/ImageController.js';
import { AddEntityCommand, ImportSVGCommand } from '../commands/cadCommands.js';

export class CADIOService {
  constructor(cadService, cadUtils) {
    if (!cadService || !cadUtils) {
      throw new Error('CADIOService requiere cadService y cadUtils.');
    }

    this.service = cadService;
    this.utils = cadUtils;

    this._attachedCanvas = null;
    this._preventDefaultHandler = (e) => { e.preventDefault(); e.stopPropagation(); };
    this._dragOverHandler = this._handleDragOver.bind(this);
    this._dragLeaveHandler = this._handleDragLeave.bind(this);
    this._dropHandler = this._handleDrop.bind(this);
  }

  _formatCoords(pt) {
    if (!pt) return '0.00, 0.00';
    const x = pt.x.toFixed(2);
    const y = (pt.y === 0 ? 0 : -pt.y).toFixed(2);
    return `${x}, ${y}`;
  }

  _logImport(message, { commandTitle = null } = {}) {
    const cm = this.utils?.consoleManager || window.consoleManager;
    if (!cm) return;

    if (commandTitle) {
      cm.beginCompactBlock?.();
      cm.logUser(commandTitle, 'Comando: ', { grouped: true });
      cm.logSystem(`[IMPORTAR] ${message}`, { grouped: true });
      cm.endCompactBlock?.();
    } else if (cm.hasActiveCompactBlock?.()) {
      cm.logSystem(`[IMPORTAR] ${message}`, { grouped: true });
      cm.endCompactBlock?.();
    } else {
      cm.logSystem(`[IMPORTAR] ${message}`, { grouped: false });
    }
  }

  _syncUndoRedoUI() {
    (this.utils?.cadUI || window.cadUI)?.updateUndoRedoUI?.();
  }

  // --- SELECTOR Y LECTURA UNIFICADA DE ARCHIVOS ---

  promptFileImport({ accept = '.svg,image/*', source = 'console' } = {}) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    Object.assign(input.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none'
    });

    const cleanupInput = (cancelled = false) => {
      if (input.parentNode) input.remove();
      if (cancelled && source === 'console') {
        const cm = this.utils?.consoleManager || window.consoleManager;
        if (cm?.hasActiveCompactBlock?.()) {
          cm.logSystem('[IMPORTAR] Cancelado.', { grouped: true });
          cm.endCompactBlock?.();
        }
      }
    };

    input.addEventListener('change', (e) => {
      const file = e.target?.files?.[0];
      cleanupInput(false);
      if (!file) return;
      this.importFile(file, null, { source });
    }, { once: true });

    input.addEventListener('cancel', () => cleanupInput(true), { once: true });

    document.body.appendChild(input);
    input.click();
  }

  importFile(file, dropPosition = null, { source = 'ui' } = {}) {
    if (!file) return;

    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    const isImage = !isSvg && file.type.startsWith('image/');

    if (!isSvg && !isImage) {
      this._logImport(`Formato no soportado: "${file.name}". Use SVG, PNG, JPG o WEBP.`);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      this._logImport(`Error al leer el archivo "${file.name}".`);
    };

    if (isSvg) {
      reader.onload = (event) => {
        this.importSVGToCanvas(event.target.result, dropPosition, {
          fileName: file.name,
          source
        });
      };
      reader.readAsText(file);
    } else {
      reader.onload = (event) => {
        this.importImageToCanvas(event.target.result, dropPosition, {
          fileName: file.name,
          source
        });
      };
      reader.readAsDataURL(file);
    }
  }

  // --- IMPORTACIÓN DE IMÁGENES Y SVG ---

  importImageToCanvas(imageSrc, dropPosition = null, options = {}) {
    const { fileName = '', source = 'ui' } = options;
    const raster = new paper.Raster(imageSrc);

    raster.on('error', () => {
      raster.remove();
      const label = fileName ? ` "${fileName}"` : '';
      this._logImport(`No se pudo cargar la imagen${label}.`, {
        commandTitle: source !== 'console' ? 'Importar imagen' : null
      });
    });

    raster.on('load', () => {
      const utils = this.utils;
      const cadService = this.service;
      const layerManager = cadService.layerManager || utils.layerManager || null;

      if (!raster.data) raster.data = {};
      raster.data.isImageEntity = true;
      raster.position = dropPosition ? dropPosition.clone() : paper.view.center.clone();

      const imageName = utils.generateNextEntityName ? utils.generateNextEntityName('Imagen') : 'Imagen';
      raster.name = imageName;
      raster.data.name = imageName;

      if (utils.propertyManager) {
        utils.propertyManager.applyDefaultSettings(raster);
      }
      if (layerManager && typeof layerManager.assignEntityToLayer === 'function') {
        layerManager.assignEntityToLayer(raster);
      }

      raster.data.baseOpacity = raster.opacity;
      raster.data.controller = new ImageController(raster, layerManager);

      raster.sendToBack();
      if (utils.gridGroup) utils.gridGroup.sendToBack();

      const cmd = new AddEntityCommand(cadService, raster);
      cadService.executeCommand(cmd);

      cadService.selectEntity(raster, false);
      utils.selectionRenderEngine?.updateEntitiesStroke?.();
      utils.selectionRenderEngine?.renderBezierHandles?.();
      this._syncUndoRedoUI();

      const width = Math.round(raster.size?.width || raster.bounds?.width || 0);
      const height = Math.round(raster.size?.height || raster.bounds?.height || 0);
      const coords = this._formatCoords(raster.position);
      const fileLabel = fileName ? ` (${fileName})` : '';

      this._logImport(
        `${imageName}${fileLabel} importada en (${coords}) — ${width} × ${height} px.`,
        { commandTitle: source !== 'console' ? 'Importar imagen' : null }
      );
    });
  }

  _getNextEntityStartIndex(prefix) {
    const regex = new RegExp(`^${prefix}\\s+(\\d+)$`, 'i');
    let maxNum = 0;
    for (const ent of this.service.entities || []) {
      const name = ent?.name || ent?.data?.name || '';
      const match = regex.exec(name);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    return maxNum + 1;
  }

  importSVGToCanvas(svgString, dropPosition = null, options = {}) {
    const { fileName = '', source = 'ui' } = options;
    const utils = this.utils;
    const cadService = this.service;

    const layerManager = cadService.layerManager || utils.layerManager;
    const activeCadLayer = layerManager ? layerManager.getActiveLayer() : null;
    const targetContainer = activeCadLayer?.paperGroup || utils.drawLayer || paper.project.activeLayer;

    const commandTitle = source !== 'console' ? 'Importar SVG' : null;
    const fileLabel = fileName ? `"${fileName}"` : 'SVG';

    paper.project.importSVG(svgString, {
      expandShapes: true,
      insert: false,
      onError: () => {
        this._logImport(`Error al interpretar el archivo ${fileLabel}.`, { commandTitle });
      },
      onLoad: (item) => {
        if (!item) {
          this._logImport(`El archivo ${fileLabel} está vacío o no es válido.`, { commandTitle });
          return;
        }

        const targetPos = dropPosition ? dropPosition.clone() : paper.view.center.clone();
        item.applyMatrix = true;
        item.position = targetPos;

        const importedEntities = [];
        const layerColor = activeCadLayer?.color || activeCadLayer?.data?.color || null;
        let nextCurveIndex = this._getNextEntityStartIndex('Curva');

        const processVectorEntity = (ent) => {
          if (!ent) return;
          ent.data = ent.data || {};

          if (layerColor) {
            ent.strokeColor = layerColor;
          }

          const entityName = `Curva ${nextCurveIndex++}`;
          ent.name = entityName;
          ent.data.name = entityName;

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

        if (importedEntities.length === 0) {
          this._logImport(`No se encontraron trazados vectoriales válidos en ${fileLabel}.`, { commandTitle });
          return;
        }

        const cmd = new ImportSVGCommand(cadService, utils, importedEntities, []);
        cadService.executeCommand?.(cmd);

        cadService.deselectAllEntities?.();
        cadService.selectedEntities = [...importedEntities];
        utils.uiManager?.updatePropertyPanel?.(
          importedEntities.length === 1 ? importedEntities[0] : null
        );
        cadService.selectionManager?.onSelectionChange?.(cadService.selectedEntities);

        utils.selectionRenderEngine?.updateEntitiesStroke?.();
        utils.selectionRenderEngine?.renderBezierHandles?.();
        if (paper.view) paper.view.update();
        this._syncUndoRedoUI();

        const layerName = activeCadLayer?.name || 'Capa 0';
        const count = importedEntities.length;
        const countLabel = count === 1 ? '1 trazado' : `${count} trazados`;
        const coords = this._formatCoords(targetPos);

        this._logImport(
          `${fileLabel} importado en "${layerName}" (${coords}): ${countLabel}.`,
          { commandTitle }
        );
      }
    });
  }

  setupDragAndDrop(canvasElement) {
    const canvas = canvasElement || this.utils?.canvasElement || document.getElementById('cadCanvas');
    if (!canvas) return;

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

    const detachedItems = [];

    const hudLayer = paper.project.layers.find(l => l.name === 'hudLayer');
    if (hudLayer) {
      hudLayer.remove();
      detachedItems.push({ item: hudLayer, parent: paper.project, isLayer: true });
    }

    if (this.utils.gridGroup) {
      const grid = this.utils.gridGroup;
      const parent = grid.parent;
      if (parent) {
        grid.remove();
        detachedItems.push({ item: grid, parent: parent, isLayer: false });
      }
    }

    if (this.utils.controlHandlesGroup) {
      const handles = this.utils.controlHandlesGroup;
      const parent = handles.parent;
      if (parent) {
        handles.remove();
        detachedItems.push({ item: handles, parent: parent, isLayer: false });
      }
    }

    const svgString = paper.project.exportSVG({
      asString: true,
      bounds: 'content',
      matchShapes: true,
      precision: 4
    });

    detachedItems.forEach(({ item, parent, isLayer }) => {
      if (isLayer) {
        paper.project.addLayer(item);
      } else if (parent) {
        parent.addChild(item);
      }
    });

    paper.view.update();

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
        this.utils?.consoleManager?.logSystem(`[EXPORTAR] Archivo "${handle.name || defaultFileName}" guardado correctamente.`, { grouped: false });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('Fallback a descarga tradicional:', err);
      }
    }

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
    this.utils?.consoleManager?.logSystem(`[EXPORTAR] Archivo "${chosenName}" descargado.`, { grouped: false });
  }

  _handleDragOver() {
    if (this._attachedCanvas) this._attachedCanvas.classList.add('drag-over');
  }

  _handleDragLeave() {
    if (this._attachedCanvas) this._attachedCanvas.classList.remove('drag-over');
  }

  _handleDrop(e) {
    if (this._attachedCanvas) this._attachedCanvas.classList.remove('drag-over');

    const file = e.dataTransfer?.files?.[0];
    if (file) {
      const viewPoint = paper.view.getEventPoint(e);
      this.importFile(file, viewPoint, { source: 'drop' });
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