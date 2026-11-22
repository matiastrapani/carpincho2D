/**
 * tools/BaseTool.js - Clase base para todas las herramientas del entorno CAD
 */
import { AddEntityCommand } from '../services/commands/cadCommands.js';
import { CAD_THEME } from '../config/cadTheme.js';
import { normalizeCommandKey } from '../config/cadCatalog.js';

export class BaseTool {
  constructor(cadService, cadUtils) {
    if (!cadService || !cadUtils) {
      throw new Error('BaseTool requiere instancias válidas de cadService y cadUtils.');
    }
    this.service = cadService;
    this.utils = cadUtils;
    this.commandName = '';
    this.commandAliases = [];
    this.promptText = 'Comando:';
    this.preservesSelection = false; // false | 'curves' | 'all'
    this.preservesEditMode = false;
    this.clearsHudOnActivate = false;
    this.cursorMode = 'draw';
    this.highlightGripsOnSelect = false;
    this.toolOptions = {}
  }

  setToolOption(key, value) {
    if (!this.toolOptions) this.toolOptions = {};
    this.toolOptions[key] = value;
  }

  getToolOption(key, defaultValue = null) {
    if (!this.toolOptions || !(key in this.toolOptions)) {
      return defaultValue;
    }
    return this.toolOptions[key];
  }

  formatCoords(pt) {
    if (!pt) return '0.00,0.00';
    const x = pt.x.toFixed(2);
    const y = (pt.y === 0 ? 0 : -pt.y).toFixed(2);
    return `${x},${y}`;
  }

  getCommandTag() {
    const clean = normalizeCommandKey(this.commandName);
    return clean ? `[${clean}]` : '';
  }

  logTagged(message) {
    const tag = this.getCommandTag();
    const fullMsg = tag ? `${tag} ${message}` : message;
    this.utils.consoleManager?.logSystem(fullMsg);
  }

  setStep(instruction, options = {}) {
    this.promptText = `${instruction}:`;
    const cm = this.utils.consoleManager;
    if (cm?.setStepPrompt) {
      cm.setStepPrompt(instruction, options);
    } else {
      this.setPrompt(this.promptText);
    }
  }

  refreshUndoRedoUI() {
    (this.utils.cadUI || window.cadUI)?.updateUndoRedoUI?.();
  }
  
  get paper() {
    const paperInstance = this.utils.paper || (typeof paper !== 'undefined' ? paper : null);
    if (!paperInstance) {
      throw new Error('Instancia de Paper.js no disponible en cadUtils.');
    }
    return paperInstance;
  }

  getHudLayer() {
    if (this.utils.hudLayer) {
      return this.utils.hudLayer;
    }
    const project = this.paper.project;
    const hudLayer = project && project.layers ? project.layers['hudLayer'] : null;
    if (!hudLayer) {
      throw new Error('hudLayer no está disponible en el proyecto Paper.js.');
    }
    return hudLayer;
  }

  onActivate() {
    this.setPrompt(this.promptText);
  }

  _beginActivePath(initialPoint, nextPrompt, pathOptions = {}) {
    if (!this.utils.drawLayer || !this.utils.propertyManager || !this.utils.selectionRenderEngine) {
      throw new Error('drawLayer, propertyManager y selectionRenderEngine son obligatorios en cadUtils.');
    }

    const path = this.service.createPathEntity([initialPoint], {
      isDynamic: true,
      baseWidth: 1,
      ...pathOptions
    });

    this.utils.propertyManager.applyDefaultSettings(path);
    this.utils.drawLayer.addChild(path);
    this.utils.activePath = path;
    this.utils.selectionRenderEngine.updateEntitiesStroke();

    if (nextPrompt) {
      this.setPrompt(nextPrompt);
    }

    return path;
  }

  _commitOrDiscardActivePath(entityBaseName) {
    const path = this.utils.activePath;
    this.utils.activePath = null;

    if (path) {
      if (path.segments && path.segments.length >= 2 && path.length >= 0.001) {
        this.commitNewEntity(path, entityBaseName);
      } else {
        path.remove();
      }
    }

    this.utils.hud.clear();
    this.setPrompt(this.promptText);
    this.paper.view.update();
  }

  resolvePreviewStyle() {
    const propMgr = this.utils.propertyManager;
    const layerManager = this.utils.layerManager;
    if (!propMgr || !layerManager) {
      throw new Error('propertyManager y layerManager son obligatorios en cadUtils.');
    }

    const defaults = propMgr.defaultSettings;
    const activeLayer = layerManager.getActiveLayer();
    const fallbackColor = CAD_THEME.properties.customFallbackColor;

    const isColorByLayer = defaults.color === 'BYLAYER' || !defaults.color;
    const color = isColorByLayer
      ? (activeLayer ? activeLayer.color : fallbackColor)
      : defaults.color;

    const isOpacityByLayer = defaults.opacity === 'BYLAYER' || defaults.opacity === undefined;
    const opacity = isOpacityByLayer
      ? (activeLayer && activeLayer.opacity !== undefined ? activeLayer.opacity : 1)
      : (typeof defaults.opacity === 'number' ? defaults.opacity : 1);

    const zoom = this.paper.view.zoom || 1;
    const strokeWidth = 1 / zoom;
    const dashArray = [2 / zoom, 2 / zoom];

    return { color, opacity, strokeWidth, dashArray };
  }

  syncLineGuide(guideLine, fromPt, toPt) {
    const hudLayer = this.getHudLayer();
    const style = this.resolvePreviewStyle();

    let line = guideLine;
    if (!line) {
      line = new this.paper.Path.Line({
        from: [fromPt.x, fromPt.y],
        to: [toPt.x, toPt.y],
        guide: true,
        data: { isAuxiliary: true },
        insert: false
      });
    }

    if (line.parent !== hudLayer) {
      hudLayer.addChild(line);
    }

    line.visible = true;
    line.segments[0].point.set(fromPt.x, fromPt.y);
    line.segments[1].point.set(toPt.x, toPt.y);
    line.strokeColor = style.color;
    line.strokeWidth = style.strokeWidth;
    line.dashArray = style.dashArray;
    line.opacity = style.opacity;

    return line;
  }

  setPrompt(text) {
    if (this.utils && typeof this.utils.setPrompt === 'function') {
      this.utils.setPrompt(text);
      return;
    }
    const cmdPrompt = document.getElementById('commandPrompt');
    if (cmdPrompt) cmdPrompt.innerText = text;
  }

  onUndo() {
    return false;
  }

  onCommandInput(rawInput) {
    return false;
  }

  onConfirmDefault() {}

  onMouseDown(event) {}
  onMouseDrag(event) {}
  onMouseMove(event) {}
  onMouseUp(event) {}

  getSelectionPreserveMode(toolName) {
    return this.preservesSelection;
  }

  shouldPreserveEditMode(toolName) {
    return Boolean(this.preservesEditMode);
  }

  shouldClearHudOnActivate(toolName) {
    return Boolean(this.clearsHudOnActivate);
  }

  getCursorMode(toolName) {
    return this.cursorMode || 'draw';
  }  

  // Captura solo la tecla ESC para salir
  onKeyDown(event) {
    const key = event.key || event.code;
    if (key === 'Escape') {
      this.exitToSelect();
      return true;
    }
    return false;
  }

  // Clic derecho global -> Salir a la herramienta de selección
  onContextMenu(event) {
    this.exitToSelect();
    return true;
  }

  /**
   * Limpieza universal de ciclo de vida.
   * Se ejecuta al desinstalar/destruir la herramienta o cambiar a otra.
   */
  cleanup() {
    this.cancel();
  }
  
  /**
   * Se ejecuta al desinstalar/limpiar la herramienta (cada subclase limpia su previsualización)
   */
  cancel() {
    if (this.utils.activePath) {
      this.utils.activePath.remove();
      this.utils.activePath = null;
    }
  }

  /**
   * Quita el foco del input, se lo devuelve al canvas y vuelve al selector
   */
  exitToSelect() {
    const cmdInput = document.getElementById('cmdInput');
    if (cmdInput) cmdInput.blur();

    const canvas = document.getElementById('cadCanvas');
    if (canvas) canvas.focus();

    if (typeof this.utils.setTool !== 'function') {
      throw new Error('cadUtils.setTool no está disponible.');
    }
    this.utils.setTool('select');
  }

  commitNewEntity(entity, baseName, CommandClass = AddEntityCommand) {
    if (!entity) return null;

    if (!entity.data) {
      entity.data = {};
    }

    // 1. Asignar nombre correlativo único
    if (baseName) {
      if (typeof this.utils.generateNextEntityName !== 'function') {
        throw new Error('cadUtils.generateNextEntityName no está disponible.');
      }
      const entityName = this.utils.generateNextEntityName(baseName);
      entity.name = entityName;
      entity.data.name = entityName;
    }

    // 2. Aplicar propiedades por defecto y capa activa
    if (!this.utils.propertyManager) {
      throw new Error('cadUtils.propertyManager no está disponible.');
    }
    this.utils.propertyManager.applyDefaultSettings(entity);

    // 3. Ejecutar un único comando de historial (inserta en entities, asigna capa y actualiza Z-Order)
    const cmd = new CommandClass(this.service, entity);
    this.service.executeCommand(cmd);

    // 4. Sincronizar renderizado
    if (!this.utils.selectionRenderEngine) {
      throw new Error('cadUtils.selectionRenderEngine no está disponible.');
    }
    this.utils.selectionRenderEngine.updateEntitiesStroke();

    return entity;
  }
}