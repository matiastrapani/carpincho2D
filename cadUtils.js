/**
 * cadUtils.js - Orquestador central de la aplicación CAD.
 */

// Configuración Central de Estilos Visuales del Entorno CAD
const CAD_THEME = {
  // A. Estilos base y geometría de NODOS / PUNTOS
  node: {
    normalRadiusPx: 3.5,        
    selectedRadiusPx: 4.0,      
    strokeWidthPx: 1.0,         
    selectedStrokeWidthPx: 2.0, 
    defaultFillColor: '#10141D', 
    defaultStrokeColor: '#18fcf1'
  },

  // B. Estilos de SELECCIÓN por tipo de objeto
  selection: {
    line: {
      strokeColor: '#ffff00',
      widthMultiplier: 1.5
    },
    node: {
      fillColor: '#10141D',       
      strokeColor: '#ffff00',     
      selectedRadiusPx: 4.0,      
      normalRadiusPx: 3.5,        
      selectedWidthPx: 2.0,
      normalWidthPx: 1.0
    },
    circle: {
      strokeColor: '#ffff00',
      widthMultiplier: 1.5
    },
    raster: {
      selectedOpacity: 0.8,
      normalOpacity: 1.0
    }
  },

  // C. CONTROL DE GRIPS, TIRADORES Y BRAZOS
  handles: {
    // --- VÉRTICES / ANCHORS (Grips Cuadrados) ---
    anchorSizeNormalPx: 7.0,            
    anchorSizeSelectedPx: 7.5,        // Incremento sutil (+0.5px)
    anchorStrokeWidthNormalPx: 1.0,   
    anchorStrokeWidthSelectedPx: 1.5, 
    anchorStrokeWidthHoverPx: 1.5,    // Solo aplica cuando NO está seleccionado
    anchorFillNormal: '#10141D',      
    anchorFillSelected: '#10141D',    
    anchorStrokeSelected: '#ffff00',  

    // --- TIRADORES BÉZIER (Cuadrados de control) ---
    bezierHandleSizePx: 6.0,            
    bezierHandleStrokeWidthPx: 1.0,   
    bezierHandleStrokeWidthHoverPx: 1.5, // Solo aplica cuando NO está seleccionado
    bezierHandleFill: '#10141D',      
    bezierHandleStrokeSelected: '#ffff00',

    // --- BRAZOS DE CONTROL (Arms) ---
    bezierArmStrokeWidthPx: 1.0,
    bezierArmStrokeSelected: '#ffff00'
  }
};

window.CAD_THEME = CAD_THEME;


/**
 * ImportSVGCommand.js
 */
class ImportSVGCommand {
  constructor(service, cadUtils, importedEntities, createdLayers) {
    this.service = service;
    this.utils = cadUtils;
    this.entities = importedEntities || [];
    this.createdLayers = createdLayers || [];
  }

  execute() {
    const layerManager = this.utils?.layerManager;
    if (layerManager && this.createdLayers.length > 0) {
      this.createdLayers.forEach(lData => {
        if (!layerManager.layers.has(lData.id)) layerManager.createLayer(lData);
      });
    }

    this.entities.forEach(ent => {
      if (!this.service.demoEntities.includes(ent)) this.service.demoEntities.push(ent);
      const layerId = String(ent.data?.layerId || '0');
      const layer = layerManager?.layers?.get(layerId);

      if (layer && layer.paperGroup && ent.parent !== layer.paperGroup) {
        layer.paperGroup.addChild(ent);
      } else if (!ent.parent && this.utils?.drawLayer) {
        this.utils.drawLayer.addChild(ent);
      }
      ent.visible = true;
    });

    if (window.layerPanelUI && typeof window.layerPanelUI.refresh === 'function') window.layerPanelUI.refresh();
    if (this.utils) {
      this.utils.updateEntitiesStroke();
      this.utils.renderBezierHandles();
      if (window.paper?.view) window.paper.view.update();
    }
  }

  undo() {
    const layerManager = this.utils?.layerManager;
    this.entities.forEach(ent => {
      if (typeof this.service.deselectEntity === 'function') this.service.deselectEntity(ent);
      ent.remove();
      const idx = this.service.demoEntities.indexOf(ent);
      if (idx !== -1) this.service.demoEntities.splice(idx, 1);
    });

    if (layerManager && this.createdLayers.length > 0) {
      this.createdLayers.forEach(lData => {
        const layerId = String(lData.id);
        const layer = layerManager.layers.get(layerId);
        if (layer) {
          if (layer.paperGroup) layer.paperGroup.remove();
          layerManager.layers.delete(layerId);
        }
      });
      if (!layerManager.layers.has(layerManager.activeLayerId)) {
        layerManager.setActiveLayer(layerManager.layers.keys().next().value || '0');
      }
    }

    if (window.layerPanelUI && typeof window.layerPanelUI.refresh === 'function') window.layerPanelUI.refresh();
    if (this.utils) {
      this.utils.updateEntitiesStroke();
      this.utils.renderBezierHandles();
      if (window.paper?.view) window.paper.view.update();
    }
  }
}
window.ImportSVGCommand = ImportSVGCommand;


class CADUtils {
  constructor(canvasId, service) {
    // 1. Referencias al DOM y Servicio Core
    this.canvasElement = document.getElementById(canvasId);
    this.service = service;

    // 2. Módulo de Capas y Propiedades (BYLAYER)

    this.layerManager = new LayerManager(this.service, this);
    this.service.layerManager = this.layerManager;

    this.propertyManager = new PropertyManager(this.service, this);
    this.service.propertyManager = this.propertyManager;

    // 3. Estado de Herramientas y Modos de Edición
    this.currentToolMode = 'line';
    this.lastActiveToolMode = 'line';
    this.isChangingTool = false;

    // 4. Estado de Vista y Navegación (Nivel de Zoom, Pan, Grilla)
    this.isGridVisible = true;
    this.isPanning = false;
    this.panStartPoint = null;
    this.lastMousePoint = null;
    this.zoomAnimationRequestId = null;

    // 5. Estado de Dibujo Activo y Previsualización Temporal
    this.activePath = null;
    this.rubberBandLine = null;
    this.bezierHandlePreviewGroup = null;
    this.isDraggingBezierHandle = false;
    this.extendData = null;

    // 6. Estado de Selección, Cuadro Elástico y Grips
    this.selectedHandle = null;
    this.selectionBoxRect = null;
    this.selectionStartPoint = null;

    // 7. Grupos Contenedores Visuales de Paper.js
    this.gridGroup = null;
    this.controlHandlesGroup = null;

    // 8. Sub-Módulos Delegados (UI y Gestor de Herramientas)
    this.hud = new HUDManager(this);
    this.commandBar = new CommandBarManager(this);
    this.toolManager = new ToolManager(this.service, this);

    // 9. Registro Organizado de Herramientas
    this._registerTools();
  }

  /**
   * Registro centralizado de herramientas clasificadas por categoría
   */
  _registerTools() {
    // Selección
    this.toolManager.registerTool('select', new SelectTool(this.service, this));

    // Geometría Básica y Líneas
    this.toolManager.registerTool('line', new LineTool(this.service, this));
    this.toolManager.registerTool('polyline', new PolylineTool(this.service, this));
    this.toolManager.registerTool('circle', new CircleTool(this.service, this));

    // Curvas Complejas
    this.toolManager.registerTool('spline', new SplineTool(this.service, this));
    this.toolManager.registerTool('bezier', new BezierTool(this.service, this));

    // Puntos y Herramientas de División
    const pointToolInstance = new PointTool(this.service, this);
    this.toolManager.registerTool('point', pointToolInstance);
    this.toolManager.registerTool('divide_count', pointToolInstance);
    this.toolManager.registerTool('divide_dist', pointToolInstance);

    // Modificación y Edición
    this.toolManager.registerTool('trim', new TrimTool(this.service, this));
    this.toolManager.registerTool('extend', new ExtendTool(this.service, this));
  }



  // --- MÉTODOS PUENTE / DELEGADOS HACIA MÓDULOS ---

  setPrompt(text) {
    this.commandBar.setPrompt(text);
  }

  updateHUD(point) {
    if (this.hud) {
      this.hud.updateHUD(point);
    }
  }

  updatePointEntitiesScale() {
    if (!paper || !paper.view) return;
    const zoom = paper.view.zoom;

    const nodeTheme = CAD_THEME?.node || {};
    const nodeSelectionTheme = CAD_THEME?.selection?.node || {};

    this.service.demoEntities.forEach(ent => {
      if (ent && ent.data && ent.data.isPointEntity && ent.bounds) {
        const isSelected = this.service.selectedEntities.includes(ent);
        const isHovered = this.service.hoveredEntity === ent;

        // 1. Radio (Crecimiento sutil de +0.5px en Hover)
        let radiusPx = isSelected 
          ? (nodeSelectionTheme.selectedRadiusPx || nodeTheme.selectedRadiusPx || 4.0) 
          : (nodeSelectionTheme.normalRadiusPx || nodeTheme.normalRadiusPx || 3.5);

        if (isHovered && !isSelected) {
          radiusPx += 0.5;
        }

        const targetRadius = radiusPx / zoom;
        const center = ent.position.clone();
        ent.bounds.width = targetRadius * 2;
        ent.bounds.height = targetRadius * 2;
        ent.position = center;

        // 2. Espesor del borde (1.5x en Hover, manteniendo su color original)
        let strokeWidthPx = isSelected 
          ? (nodeSelectionTheme.selectedWidthPx || nodeTheme.selectedStrokeWidthPx || 2.0) 
          : (nodeSelectionTheme.normalWidthPx || nodeTheme.strokeWidthPx || 1.0);

        if (isHovered && !isSelected) {
          strokeWidthPx *= 1.5;
        }

        ent.strokeWidth = strokeWidthPx / zoom;
      }
    });
  }

  updateEntitiesStroke() {
    if (!paper || !paper.view) return;
    const zoom = paper.view.zoom;

    const entitiesToUpdate = [...(this.service?.demoEntities || [])];
    if (this.activePath) {
      entitiesToUpdate.push(this.activePath);
    }

    entitiesToUpdate.forEach(ent => {
      if (!ent) return;
      if (!ent.data) ent.data = {};

      // 0. Visibilidad y Bloqueo de Capa
      const layerId = ent.data?.layerId || '0';
      const layer = this.layerManager?.layers?.get(String(layerId));
      const isLayerVisible = layer ? (layer.visible !== false) : true;
      const isLayerLocked = layer ? (layer.locked === true) : false;
      
      ent.visible = isLayerVisible;
      if (!isLayerVisible) return;

      const layerOpacity = (layer && layer.opacity !== undefined) ? layer.opacity : 1.0;
      const resolvedOpacity = ent.data.opacityByLayer !== false 
        ? layerOpacity 
        : (ent.data.origOpacity !== undefined ? ent.data.origOpacity : (ent.opacity ?? 1.0));

      // Si la capa está bloqueada, ignora los estados de selección y hover
      const isSelected = !isLayerLocked && this.service.selectedEntities.includes(ent);
      const isHovered = !isLayerLocked && this.service.hoveredEntity === ent;

      // --- NODOS / PUNTOS ---
      if (ent.data.isPointEntity) {
        const nodeTheme = CAD_THEME?.node || {};
        const nodeSelectionTheme = CAD_THEME?.selection?.node || {};
        
        ent.opacity = 1.0;
        ent.fillColor = isSelected 
          ? (nodeSelectionTheme.fillColor || nodeTheme.defaultFillColor || '#10141D') 
          : (ent.data.origFillColor || nodeTheme.defaultFillColor || '#10141D');
          
        const resolvedPointColor = this.propertyManager 
          ? this.propertyManager.getResolvedColor(ent) 
          : (ent.data.origStrokeColor || nodeTheme.defaultStrokeColor || '#18fcf1');

        const strokeHex = isSelected 
          ? (nodeSelectionTheme.strokeColor || '#ffff00') 
          : resolvedPointColor;

        const strokeColorObj = new paper.Color(strokeHex);
        strokeColorObj.alpha = isSelected ? 1.0 : resolvedOpacity;
        ent.strokeColor = strokeColorObj;

        this.updatePointEntitiesScale();
        return;
      }

      // --- RASTERS / IMÁGENES ---
      if (ent instanceof paper.Raster) {
        const isByLayer = ent.data?.opacityByLayer !== false;
        const resolvedOpacity = (isByLayer && layer && layer.opacity !== undefined)
          ? layer.opacity
          : (ent.data?.baseOpacity ?? ent.data?.origOpacity ?? ent.opacity ?? 1.0);

        ent.opacity = resolvedOpacity;
        ent.data.baseOpacity = resolvedOpacity;
        return;
      }

      // --- LÍNEAS Y GEOMETRÍAS ---
      if (ent instanceof paper.Path || ent instanceof paper.CompoundPath) {
        if (ent instanceof paper.Path) {
          ent.strokeJoin = 'miter';
          ent.miterLimit = 3;
        }

        if (ent.data.origFillColor !== undefined) {
          ent.fillColor = ent.data.origFillColor;
        }

        const styleConfig = ent.data.isCircleEntity 
          ? (CAD_THEME?.selection?.circle || {}) 
          : (CAD_THEME?.selection?.line || {});

        const effectiveColor = this.propertyManager 
          ? this.propertyManager.getResolvedColor(ent) 
          : (ent.data.origStrokeColor || '#00e5ff');

        const effectiveBaseWidth = this.propertyManager 
          ? this.propertyManager.getResolvedStrokeWidth(ent) 
          : (ent.data.baseStrokeWidth !== undefined ? ent.data.baseStrokeWidth : 0);

        if (isSelected) {
          ent.opacity = 1.0;
          ent.strokeColor = styleConfig.strokeColor || '#ffff00';
          if (ent.fillColor) {
            const fillCol = new paper.Color(ent.fillColor);
            fillCol.alpha = resolvedOpacity;
            ent.fillColor = fillCol;
          }
        } else {
          ent.opacity = resolvedOpacity;
          ent.strokeColor = effectiveColor;
          if (ent.fillColor) {
            const fillCol = new paper.Color(ent.fillColor);
            fillCol.alpha = 1.0;
            ent.fillColor = fillCol;
          }
        }

        let mult = isSelected ? (styleConfig.widthMultiplier || 1.5) : 1;
        if (isHovered && !isSelected) {
          mult *= 1.5;
        }

        if (effectiveBaseWidth === 0) {
          ent.strokeWidth = (1 * mult) / zoom;
        } else {
          ent.strokeWidth = effectiveBaseWidth * mult;
        }
      }
    });
  }

  importSVGToCanvas(svgString, dropPosition) {
    this.drawLayer.activate();

    paper.project.importSVG(svgString, {
      expandShapes: true,
      insert: true,
      onLoad: (item) => {
        if (!item) return;

        // Aplanar transformaciones de matriz para evitar desfasajes
        item.applyMatrix = true;
        item.position = dropPosition || paper.view.center.clone();

        const importedEntities = [];

        // Helper para procesar y registrar una entidad vectorial conservando rellenos
        const processVectorEntity = (ent) => {
          ent.data = ent.data || {};

          // Preservar colores y grosores originales
          ent.data.origStrokeColor = ent.strokeColor ? ent.strokeColor.toCSS() : null;
          ent.data.origFillColor = ent.fillColor ? ent.fillColor.toCSS() : null;
          ent.data.baseStrokeWidth = ent.strokeWidth || 1;
          ent.data.isSvgEntity = true;

          // Si la entidad tiene relleno pero está abierta, cerrar contorno para renderizar relleno
          if (ent instanceof paper.Path && ent.fillColor && !ent.closed) {
            ent.closed = true;
              }

          // Mover a la capa principal de dibujo
          this.drawLayer.addChild(ent);
          this.service.registerEntity(ent);
          importedEntities.push(ent);
        };

        // Recorrido jerárquico respetando CompoundPath
        const registerChildren = (parent) => {
          if (parent instanceof paper.CompoundPath) {
            // Se preserva el CompoundPath entero para no romper rellenos con huecos
            processVectorEntity(parent);
          } else if (parent.children && parent.children.length > 0) {
            const children = [...parent.children];
            children.forEach(child => registerChildren(child));
          } else if (parent instanceof paper.Path) {
            processVectorEntity(parent);
          }
        };

        registerChildren(item);

        // Limpiar la cáscara/grupo contenedor
        item.remove();

        if (importedEntities.length > 0 && window.AddEntityCommand) {
          const cmd = new AddEntityCommand(this.service, importedEntities);
          this.service.executeCommand(cmd);
        }

        this.updateEntitiesStroke();
        this.renderBezierHandles();
        paper.view.update();
        this.setPrompt('Dibujo SVG importado y listo para editar.');
      }
    });
  }

  importSVGToCanvas(svgString, dropPosition) {
    this.drawLayer.activate();

    paper.project.importSVG(svgString, {
      expandShapes: true,
      insert: true,
      onLoad: (item) => {
        if (!item) return;

        // Aplanar transformaciones de matriz para evitar desfasajes
        item.applyMatrix = true;
        item.position = dropPosition || paper.view.center.clone();

        const importedEntities = [];

        // Helper para procesar y registrar una entidad vectorial conservando rellenos
        const processVectorEntity = (ent) => {
          ent.data = ent.data || {};

          // Preservar colores y grosores originales
          ent.data.origStrokeColor = ent.strokeColor ? ent.strokeColor.toCSS() : null;
          ent.data.origFillColor = ent.fillColor ? ent.fillColor.toCSS() : null;
          ent.data.baseStrokeWidth = ent.strokeWidth || 1;
          ent.data.isSvgEntity = true;

          // Si la entidad tiene relleno pero está abierta, cerrar contorno para renderizar relleno
          if (ent instanceof paper.Path && ent.fillColor && !ent.closed) {
            ent.closed = true;
              }

          // Mover a la capa principal de dibujo
          this.drawLayer.addChild(ent);
          this.service.registerEntity(ent);
          importedEntities.push(ent);
        };

        // Recorrido jerárquico respetando CompoundPath
        const registerChildren = (parent) => {
          if (parent instanceof paper.CompoundPath) {
            // Se preserva el CompoundPath entero para no romper rellenos con huecos
            processVectorEntity(parent);
          } else if (parent.children && parent.children.length > 0) {
            const children = [...parent.children];
            children.forEach(child => registerChildren(child));
          } else if (parent instanceof paper.Path) {
            processVectorEntity(parent);
          }
        };

        registerChildren(item);

        // Limpiar la cáscara/grupo contenedor
        item.remove();

        if (importedEntities.length > 0 && window.AddEntityCommand) {
          const cmd = new AddEntityCommand(this.service, importedEntities);
          this.service.executeCommand(cmd);
        }

        this.updateEntitiesStroke();
        this.renderBezierHandles();
        paper.view.update();
        this.setPrompt('Dibujo SVG importado y listo para editar.');
      }
    });
  }

  renderSnapMarker(point, type) {
    if (this.hud) {
      this.hud.renderSnapMarker(point, type);
    }
  }

  updateFeedbackLabels(fromPt, toPt) {
    if (this.hud) {
      this.hud.updateFeedbackLabels(fromPt, toPt);
    }
  }

  clearHUD() {
    if (this.hud) {
      this.hud.clear();
    }
  }

  clearFeedbackLabels() {
    if (this.hud) {
      this.hud.clear();
    }
  }

  clearSelectedHandle() {
    this.selectedHandle = null;
  }

  // --- INICIALIZACIÓN DE PAPER.JS Y EVENTOS DEL CANVAS ---

  initPaper() {
    paper.setup(this.canvasElement);
    paper.view.center = new paper.Point(0, 0);

    // 1. Capa para entidades del dibujo (líneas, arcos, polígonos, etc.)
    this.drawLayer = paper.project.activeLayer;
    this.drawLayer.name = 'drawLayer';

    this.nodesLayer = new paper.Layer();
    this.nodesLayer.name = 'nodesLayer';

    // 2. Capa superior dedicada exclusivamente para HUD y marcadores OSNAP
    this.hudLayer = new paper.Layer();
    this.hudLayer.name = 'hudLayer';


    // Mantener la capa de HUD arriba de todo el proyecto de Paper.js
    this.drawLayer.sendToBack();
    this.nodesLayer.insertAbove(this.drawLayer);
    this.hudLayer.bringToFront();

    // Dejar la capa de dibujo activa por defecto para que los trazos vayan allí
    this.drawLayer.activate();

    this.drawGrid();
    this.setupPaperTool();
    this.setupDragAndDrop();

    window.addEventListener('resize', () => this.handleCanvasResize());

    const viewportEl = document.getElementById('mainViewport');
    if (viewportEl) {
      const resizeObserver = new ResizeObserver(() => this.handleCanvasResize());
      resizeObserver.observe(viewportEl);
    }

    this.canvasElement.addEventListener('wheel', (e) => this.handleMagicMouseWheel(e), { passive: false });

    this.canvasElement.addEventListener('contextmenu', e => {
      e.preventDefault();

      // 1. Capturar el modo ANTES de que cualquier herramienta lo cambie
      const previousTool = this.currentToolMode;

      // 2. Delegar la confirmación por Clic Derecho a la herramienta activa
      if (this.toolManager.activeTool && typeof this.toolManager.activeTool.onContextMenu === 'function') {
        const handled = this.toolManager.activeTool.onContextMenu(e);
        if (handled) return;
      }

      if (this.currentToolMode === 'trim') {
        const activeTool = this.toolManager.activeTool;
        if (activeTool && typeof activeTool.confirmTrimBoundaries === 'function') {
          activeTool.confirmTrimBoundaries();
          return;
        }
      }

      const drawingTools = ['polyline', 'spline', 'bezier', 'line'];
      if (drawingTools.includes(this.currentToolMode) && this.activePath) {
        this.finishCurrentDrawing();
        return;
      }

      // 3. SOLO repetir la última herramienta si YA ESTÁBAMOS en 'select' antes de hacer clic
      if (previousTool === 'select' && this.lastActiveToolMode && this.lastActiveToolMode !== 'select') {
        this.setTool(this.lastActiveToolMode);
      } else {
        this.setTool('select');
      }
    });

    window.addEventListener('keydown', (e) => this.handleGlobalKeydown(e));
    window.addEventListener('keyup', (e) => this.handleGlobalKeyup(e));

    const cmdInput = document.getElementById('cmdInput');
    if (cmdInput) {
      cmdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.executeCommandLine();
      });
    }

    // Reemplazamos la llamada a (0,0) por una limpieza transparente del HUD
    this.clearHUD();

    if (this.canvasElement) {
      this.canvasElement.focus();
    }
    this.updateEntitiesStroke();
    paper.view.update();
  }

  handleCanvasResize() {
    if (!paper || !paper.view) return;

    const viewportEl = document.getElementById('mainViewport');
    if (!viewportEl) return;

    const newWidth = viewportEl.clientWidth;
    const newHeight = viewportEl.clientHeight;
    if (newWidth === 0 || newHeight === 0) return;

    const currentCenter = paper.view.center.clone();
    const currentZoom = paper.view.zoom;

    paper.view.viewSize = new paper.Size(newWidth, newHeight);
    paper.view.center = currentCenter;
    paper.view.zoom = currentZoom;

    this.drawGrid();
    this.updatePointEntitiesScale();
    this.renderBezierHandles();
    paper.view.requestUpdate();
  }

  drawGrid() {
    if (this.gridGroup) this.gridGroup.remove();
    if (!this.isGridVisible) return;

    this.gridGroup = new paper.Group();
    this.gridGroup.sendToBack();

    const bounds = paper.view.bounds;
    const zoom = paper.view.zoom;

    let mainStep = zoom > 3 ? 20 : (zoom < 0.3 ? 500 : 100);
    let subStep = zoom > 3 ? 4 : (zoom < 0.3 ? 100 : 20);

    const startX = Math.floor(bounds.left / subStep) * subStep;
    const endX = Math.ceil(bounds.right / subStep) * subStep;
    const startY = Math.floor(bounds.top / subStep) * subStep;
    const endY = Math.ceil(bounds.bottom / subStep) * subStep;

    // Líneas Verticales (Eje X)
    for (let x = startX; x <= endX; x += subStep) {
      const roundedX = Math.round(x);
      const isMain = Math.abs(roundedX) % mainStep === 0;

      const line = new paper.Path.Line(new paper.Point(x, bounds.top), new paper.Point(x, bounds.bottom));
      line.strokeColor = isMain ? new paper.Color(1, 1, 1, 0.08) : new paper.Color(1, 1, 1, 0.03);
      line.strokeWidth = (isMain ? 1.2 : 1.0) / zoom;
      this.gridGroup.addChild(line);
    }

    // Líneas Horizontales (Eje Y)
    for (let y = startY; y <= endY; y += subStep) {
      const roundedY = Math.round(y);
      const isMain = Math.abs(roundedY) % mainStep === 0;

      const line = new paper.Path.Line(new paper.Point(bounds.left, y), new paper.Point(bounds.right, y));
      line.strokeColor = isMain ? new paper.Color(1, 1, 1, 0.08) : new paper.Color(1, 1, 1, 0.03);
      line.strokeWidth = (isMain ? 1.2 : 1.0) / zoom;
      this.gridGroup.addChild(line);
    }

    // Ejes Principales X e Y (Origen 0,0)
    const axisX = new paper.Path.Line(new paper.Point(bounds.left, 0), new paper.Point(bounds.right, 0));
    axisX.strokeColor = new paper.Color(0.71, 0.85, 1, 0.2);
    axisX.strokeWidth = 1.5 / zoom;
    this.gridGroup.addChild(axisX);

    const axisY = new paper.Path.Line(new paper.Point(0, bounds.top), new paper.Point(0, bounds.bottom));
    axisY.strokeColor = new paper.Color(0.71, 0.85, 1, 0.2);
    axisY.strokeWidth = 1.5 / zoom;
    this.gridGroup.addChild(axisY);
  }

  setupPaperTool() {
    const tool = new paper.Tool();

    tool.onMouseDown = (event) => {
      if (event.event.button === 1 || this.currentToolMode === 'pan') {
        this.isPanning = true;
        this.panStartPoint = event.event;
        return;
      }

      if (this.toolManager.activeTool) {
        this.toolManager.onMouseDown(event);
      }
    };

    tool.onMouseDrag = (event) => {
      if (this.isPanning) {
        const delta = paper.view.center.subtract(
          paper.view.getEventPoint(event.event).subtract(paper.view.getEventPoint(this.panStartPoint))
        );
        paper.view.center = delta;
        this.panStartPoint = event.event;
        this.drawGrid();
        return;
      }

      if (this.toolManager.activeTool) {
        this.toolManager.onMouseDrag(event);
      }
    };

    tool.onMouseUp = (event) => {
      if (event.event.button === 1 || event.event.button === 2 || this.currentToolMode === 'pan') {
        this.isPanning = false;
      }

      if (this.toolManager.activeTool) {
        this.toolManager.onMouseUp(event);
      }
    };

    tool.onMouseMove = (event) => {
      this.lastMousePoint = event.point.clone();
      this.updateHUD(event.point);

      if (this.toolManager.activeTool) {
        this.toolManager.onMouseMove(event);
      }
    };
  }

  deleteSelectedHandleOrSegment() {
    if (this.selectedHandle && this.selectedHandle.segment) {
      const seg = this.selectedHandle.segment;
      const parentPath = seg.path;
      const type = this.selectedHandle.type;

      if (type === 'handleIn' || type === 'handleOut') {
        const originalVector = type === 'handleIn' ? seg.handleIn.clone() : seg.handleOut.clone();

        const deleteCmd = new DeleteCommand(this.service, {
          type: 'handle',
          segment: seg,
          handleType: type,
          originalVector: originalVector
        });

        this.service.executeCommand(deleteCmd);
        this.selectedHandle = null;

        if (parentPath && !this.service.selectedEntities.includes(parentPath)) {
          this.service.selectEntity(parentPath, true);
        }

        this.renderBezierHandles();
        return;
      }
    }

    // Resetear la referencia huérfana ANTES de borrar elementos
    this.selectedHandle = null;
    this.service.deleteSelectedElements(() => this.renderBezierHandles());
  }

  finishCurrentDrawing() {
    if (this.rubberBandLine) {
      this.rubberBandLine.remove();
      this.rubberBandLine = null;
    }
    if (this.bezierHandlePreviewGroup) {
      this.bezierHandlePreviewGroup.remove();
      this.bezierHandlePreviewGroup = null;
    }

    if (this.hud) {
      this.hud.clear();
    }

    if (this.activePath) {
      // 1. Eliminar el último segmento elástico "dinámico" si no se confirmó
      // (Opcional según si usas rubberband en la propia activePath)

      // 2. Registrar usando el guardián de CADService
      const isRegistered = this.service.registerEntity(this.activePath);

      if (isRegistered) {
        // Generar comando para Undo/Redo si aplica
        const cmd = new AddLineCommand(this.service, this.activePath);
        this.service.executeCommand(cmd);
        this.renderBezierHandles();
      }
      
      this.activePath = null;
    }

    this.setPrompt('Command:');
    // Cambiar automáticamente a 'select' al finalizar el trazo si no estamos en polilínea/spline
    if (!this.isChangingTool && this.currentToolMode !== 'select' && this.currentToolMode !== 'pan') {
      setTimeout(() => this.setTool('select'), 0);
    }
  }

  executeCommandLine() {
    const inputEl = document.getElementById('cmdInput');
    const val = inputEl?.value.trim();
    if (inputEl) inputEl.value = '';

    if (!val) return;
    const upperVal = val.toUpperCase();

    if (upperVal === 'POINT' || upperVal === 'PT') { this.setTool('point'); return; }
    if (upperVal === 'DIVIDE' || upperVal === 'DIV') { this.setTool('divide_count'); return; }
    if (upperVal === 'MEASURE' || upperVal === 'DIST_DIV') { this.setTool('divide_dist'); return; }
    if (upperVal === 'LINE' || upperVal === 'L') { this.setTool('line'); return; }
    if (upperVal === 'POLYLINE' || upperVal === 'PL' || upperVal === 'P') { this.setTool('polyline'); return; }
    if (upperVal === 'SPLINE' || upperVal === 'S') { this.setTool('spline'); return; }
    if (upperVal === 'BEZIER' || upperVal === 'B') { this.setTool('bezier'); return; }
    if (upperVal === 'TRIM' || upperVal === 'TR' || upperVal === 'T') { this.setTool('trim'); return; }
    if (upperVal === 'PAN') { this.setTool('pan'); return; }
    if (upperVal === 'CLEAR') { this.clearCanvas(); return; }
    if (upperVal === 'EXTEND' || upperVal === 'EX') { this.setTool('extend'); return; }
    if (upperVal === 'CIRCLE' || upperVal === 'C') { this.setTool('circle'); return; }

    if (this.activePath && ['line', 'polyline', 'spline', 'bezier'].includes(this.currentToolMode)) {
      const originPt = this.activePath.firstSegment.point;

      if (val.includes(',')) {
        const parts = val.split(',');
        const x = parseFloat(parts[0]);
        const y = -parseFloat(parts[1]);
        
        if (!isNaN(x) && !isNaN(y)) {
          const newPt = new paper.Point(x, y);

          if (this.currentToolMode === 'line') {
            this.activePath.lastSegment.point = newPt;
            
            const cmd = new AddLineCommand(this.service, this.activePath);
            this.service.executeCommand(cmd);

            const startNextPt = newPt.clone();
            this.activePath = new paper.Path.Line({
              from: startNextPt,
              to: startNextPt
            });

            if (!this.activePath.data) this.activePath.data = {};
            this.activePath.data.isDynamicStroke = true;

            if (this.propertyManager) {
              this.propertyManager.applyDefaultSettings(this.activePath);
            }

            this.updateEntitiesStroke();
          } else {
            this.activePath.add(newPt);
          }
        }
      } else {
        const dist = parseFloat(val);
        if (!isNaN(dist) && this.rubberBandLine) {
          const currentVector = this.rubberBandLine.lastSegment.point.subtract(originPt);
          if (currentVector.length > 0) {
            const constrainedVector = currentVector.normalize(dist);
            const newPt = originPt.add(constrainedVector);

            if (this.currentToolMode === 'line') {
              this.activePath.lastSegment.point = newPt;

              const cmd = new AddLineCommand(this.service, this.activePath);
              this.service.executeCommand(cmd);

              const startNextPt = newPt.clone();
              this.activePath = new paper.Path.Line({
                from: startNextPt,
                to: startNextPt
              });

              if (!this.activePath.data) this.activePath.data = {};
              this.activePath.data.isDynamicStroke = true;

              if (this.propertyManager) {
                this.propertyManager.applyDefaultSettings(this.activePath);
              }

              this.updateEntitiesStroke();
            } else {
              this.activePath.add(newPt);
            }
          }
        }
      }
    }
  }

  handleGlobalKeyup(e) {
    // Al soltar Shift, re-evaluamos inmediatamente la posición actual del cursor
    if ((e.key === 'Shift' || e.keyCode === 16) && this.lastMousePoint && this.toolManager.activeTool) {
      const mockEvent = {
        point: this.lastMousePoint.clone(),
        event: { shiftKey: true }
      };
      this.toolManager.activeTool.onMouseMove(mockEvent);
    }
  }

  handleGlobalKeydown(e) {

    const activeTag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) {
      if (e.key === 'Escape') {
        document.activeElement.blur();
      }
      return; // Detiene la ejecución de borrado de entidades o atajos de herramientas
    }

    // Delegar teclas a la herramienta activa (Enter / Space)
    if (this.toolManager.activeTool && typeof this.toolManager.activeTool.onKeyDown === 'function') {
      const handled = this.toolManager.activeTool.onKeyDown(e);
      if (handled) return;
    }
    
    if (e.key === 'Shift' && this.lastMousePoint && this.activePath && this.toolManager.activeTool) {
      const mockEvent = {
        point: this.lastMousePoint.clone(),
        event: e
      };
      this.toolManager.activeTool.onMouseMove(mockEvent);
    }

    if (document.activeElement === document.getElementById('cmdInput')) {
      if (e.key === 'Escape') document.getElementById('cmdInput').blur();
      return;
    }

    // Delegar teclas a la herramienta activa (Enter / Space)
    if (this.toolManager.activeTool && typeof this.toolManager.activeTool.onKeyDown === 'function') {
      const handled = this.toolManager.activeTool.onKeyDown(e);
      if (handled) return;
    }

    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    if (isCtrlOrCmd && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.finishCurrentDrawing();
      this.service.undo();
      this.updateEntitiesStroke();
      this.renderBezierHandles();
      return;
    }

    if ((isCtrlOrCmd && e.key.toLowerCase() === 'y') || (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z')) {
      e.preventDefault();
      this.finishCurrentDrawing();
      this.service.redo();
      this.updateEntitiesStroke();
      this.renderBezierHandles();
      return;
    }

    if (e.key === 'F3') {
      e.preventDefault();
      this.toggleSnapMaster();
    } else if (e.key === 'F7') {
      e.preventDefault();
      this.toggleGrid();
    } else if (e.key === 'Escape') {
      e.preventDefault();

      // 1. CERRAR MENÚS DESPLEGABLES DEL DOM EN INTERFAZ
      this.closeAllMenus();

      this.selectedHandle = null;

      if (this.activePath) {
        this.activePath.remove();
        this.activePath = null;
        this.finishCurrentDrawing();
        this.setTool('select');
      } else if (this.currentToolMode === 'trim') {
        this.service.trimCuttingBoundaries = [];
        this.service.isTrimCuttingPhase = false;
        this.service.deselectAllEditingEntities();
        this.setTool('select');
      } else {
        // LÓGICA DE DOS NIVELES DE ESCAPE:
        if (this.service.selectedEntities.length > 0 || this.service.selectedSegments.length > 0) {
          // 1.er ESCAPE: Deselecciona la entidad pero MANTIENE el Modo Edición de Nodos (nodos visibles en reposo)
          this.service.deselectAllEntities();
        } else if (this.service.editingEntities.length > 0) {
          // 2.º ESCAPE: Sale totalmente del Modo Edición de Nodos (oculta manejadores/vértices)
          this.service.deselectAllEditingEntities();
        }
        this.setTool('select');
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelectedHandleOrSegment();
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (this.currentToolMode === 'trim') {
        const activeTool = this.toolManager.activeTool;
        if (activeTool && typeof activeTool.confirmTrimBoundaries === 'function') {
          activeTool.confirmTrimBoundaries();
          return;
        }
      }
      this.finishCurrentDrawing();
    } else if (e.key.toLowerCase() === 'l') {
      this.setTool('line');
    } else if (e.key.toLowerCase() === 'p') {
      this.setTool('polyline');
    } else if (e.key.toLowerCase() === 's') {
      this.setTool('spline');
    } else if (e.key.toLowerCase() === 'b') {
      this.setTool('bezier');
    } else if (e.key.toLowerCase() === 't') {
      this.setTool('trim');
    } else if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) {
      this.setTool('extend');
    }
  }

  handleMagicMouseWheel(e) {
    e.preventDefault();

    const view = paper.view;
    const mousePosition = view.viewToProject(new paper.Point(e.clientX, e.clientY));
    this.updateHUD(mousePosition);

    const isZoomIntent = e.altKey || e.ctrlKey || e.metaKey || e.pinching;

    if (isZoomIntent) {
      const delta = e.deltaY;
      const zoomFactor = Math.pow(0.997, delta);
      const oldZoom = view.zoom;
      const newZoom = Math.max(0.05, Math.min(oldZoom * zoomFactor, 80));

      view.zoom = newZoom;

      const newMousePosition = view.viewToProject(new paper.Point(e.clientX, e.clientY));
      view.center = view.center.add(mousePosition.subtract(newMousePosition));
    } else {
      const panSensitivity = 1 / view.zoom;
      const deltaX = e.deltaX * panSensitivity;
      const deltaY = e.deltaY * panSensitivity;

      view.center = view.center.add(new paper.Point(deltaX, deltaY));
    }

    this.drawGrid();
    this.updatePointEntitiesScale();
    this.updateEntitiesStroke();
    this.renderBezierHandles();
    if (this.hud && typeof this.hud.refreshSnapMarkerScale === 'function') {
      this.hud.refreshSnapMarkerScale();
    }
    if (this.activePath && this.rubberBandLine) {
      const activeWidth = this.propertyManager ? this.propertyManager.getResolvedStrokeWidth(this.activePath) : 0;
      this.rubberBandLine.strokeWidth = activeWidth === 0 ? (1 / view.zoom) : activeWidth;
      this.rubberBandLine.dashArray = [2 / view.zoom, 2 / view.zoom];
    }
    this.updateHUD(view.viewToProject(new paper.Point(e.clientX, e.clientY)));

  }

  renderBezierHandles() {
    if (this.controlHandlesGroup) this.controlHandlesGroup.remove();
    this.controlHandlesGroup = new paper.Group();

    // 1. Purga de edición para elementos huérfanos o eliminados
    if (this.service.editingEntities && this.service.editingEntities.length > 0) {
      this.service.editingEntities = this.service.editingEntities.filter(
        ent => ent && ent.parent && this.service.demoEntities.includes(ent)
      );

      if (this.service.editingEntities.length === 0) {
        if (typeof this.service.deselectAllSegments === 'function') {
          this.service.deselectAllSegments();
        } else {
          this.service.selectedSegments = [];
        }
        if (typeof this.service.deselectAllCurves === 'function') {
          this.service.deselectAllCurves();
        } else if (Array.isArray(this.service.selectedCurves)) {
          this.service.selectedCurves = [];
        }
        if (typeof this.service.deselectAllHandles === 'function') {
          this.service.deselectAllHandles();
        } else {
          this.service.selectedHandles = [];
        }
      }
    }

    const zoom = paper.view.zoom;
    const cfg = CAD_THEME?.handles || {};

    // Excluir entidades pertenecientes a capas bloqueadas
    const activeEntities = (this.service.editingEntities || []).filter(ent => {
      if (!ent || !ent.parent) return false;
      const lId = String(ent.data?.layerId || '0');
      const layer = this.layerManager?.layers?.get(lId);
      return !layer || !layer.locked;
    });

    // 2. Renderizado de Nodos Bézier y Vértices
    activeEntities.forEach(entity => {
      if (!entity.visible) return;

      if (entity instanceof paper.Path && entity.segments && entity.segments.length >= 2 && !entity.data?.isPointEntity) {
        
        const entityColor = entity.strokeColor 
          ? (entity.strokeColor.toCSS ? entity.strokeColor.toCSS() : entity.strokeColor)
          : (entity.data?.origStrokeColor || '#ffff00');

        if (entity.curves) {
          const selectedChains = [];
          let currentChain = [];

          entity.curves.forEach((curve) => {
            const isCurveSelected = this.service.selectedSegments.includes(curve.segment1) && 
                                    this.service.selectedSegments.includes(curve.segment2);

            if (isCurveSelected) {
              if (currentChain.length === 0) {
                currentChain.push(curve.segment1, curve.segment2);
              } else {
                if (currentChain[currentChain.length - 1] === curve.segment1) {
                  currentChain.push(curve.segment2);
                } else {
                  selectedChains.push(currentChain);
                  currentChain = [curve.segment1, curve.segment2];
                }
              }
            } else {
              if (currentChain.length > 0) {
                selectedChains.push(currentChain);
                currentChain = [];
              }
            }
          });

          if (currentChain.length > 0) {
            selectedChains.push(currentChain);
          }

          if (entity.closed && selectedChains.length > 1) {
            const firstChain = selectedChains[0];
            const lastChain = selectedChains[selectedChains.length - 1];
            if (lastChain[lastChain.length - 1] === firstChain[0]) {
              selectedChains[0] = lastChain.concat(firstChain.slice(1));
              selectedChains.pop();
            }
          }

          selectedChains.forEach(chainSegments => {
            const strokeColor = cfg.anchorStrokeSelected || '#ffff00';
            const baseW = entity.data?.baseStrokeWidth || 1.5;
            const mult = 1.8;

            let isClosedLoop = false;
            let segmentsToRender = chainSegments;

            if (chainSegments.length > 2 && chainSegments[0] === chainSegments[chainSegments.length - 1]) {
              isClosedLoop = true;
              segmentsToRender = chainSegments.slice(0, chainSegments.length - 1);
            }

            const highlightedPath = new paper.Path({
              segments: segmentsToRender.map(s => new paper.Segment(s.point, s.handleIn, s.handleOut)),
              strokeColor: strokeColor,
              strokeWidth: (baseW * mult) / (entity.data?.isDynamicStroke !== false ? zoom : 1),
              strokeJoin: entity.strokeJoin || 'miter',
              strokeCap: entity.strokeCap || 'butt',
              miterLimit: entity.miterLimit || 3,
              closed: isClosedLoop,
              insert: false
            });

            highlightedPath.guide = true;
            this.controlHandlesGroup.addChild(highlightedPath);
          });

          if (this.hoveredCurve && this.hoveredCurve.path === entity) {
            const c = this.hoveredCurve;
            const isHoveredSelected = this.service.selectedSegments.includes(c.segment1) && 
                                      this.service.selectedSegments.includes(c.segment2);

            if (!isHoveredSelected) {
              const baseW = entity.data?.baseStrokeWidth || 1.5;
              const mult = 1.4;

              const hoveredCurvePath = new paper.Path({
                segments: [
                  new paper.Segment(c.segment1.point, c.segment1.handleIn, c.segment1.handleOut),
                  new paper.Segment(c.segment2.point, c.segment2.handleIn, c.segment2.handleOut)
                ],
                strokeColor: entityColor,
                strokeWidth: (baseW * mult) / (entity.data?.isDynamicStroke !== false ? zoom : 1),
                strokeJoin: entity.strokeJoin || 'miter',
                strokeCap: entity.strokeCap || 'butt',
                miterLimit: entity.miterLimit || 3,
                insert: false
              });

              hoveredCurvePath.guide = true;
              this.controlHandlesGroup.addChild(hoveredCurvePath);
            }
          }
        }
        
        entity.segments.forEach(segment => {
          const isEntitySelected = this.service.selectedEntities.includes(entity);
          const isSegSelected = !isEntitySelected && this.service.selectedSegments.includes(segment);

          ['handleIn', 'handleOut'].forEach(handleType => {
            if (!segment[handleType].isZero()) {
              const handlePt = segment.point.add(segment[handleType]);

              const isHandleSelected = !isEntitySelected && this.service.isSelectedHandle(segment, handleType);
              const isArmActive = isSegSelected && isHandleSelected;
              const canHover = !isEntitySelected;

              const isHandleHovered = canHover && !isHandleSelected && 
                                      !!(this.hoveredHandle && 
                                        this.hoveredHandle.segment === segment && 
                                        this.hoveredHandle.type === handleType);

              const isArmHovered = canHover && !isArmActive && 
                                   !!(this.hoveredHandle && 
                                     this.hoveredHandle.segment === segment && 
                                     this.hoveredHandle.type === 'arm' && 
                                     this.hoveredHandle.handleType === handleType);

              const armColor = isArmActive 
                ? (cfg.bezierArmStrokeSelected || '#ffff00') 
                : entityColor;

              let armWidth = cfg.bezierArmStrokeWidthPx || 1.0;
              if (isArmActive) {
                armWidth = cfg.anchorStrokeWidthSelectedPx || 1.5;
              } else if (isArmHovered) {
                armWidth = cfg.bezierArmStrokeWidthHoverPx || 1.8;
              }

              const arm = new paper.Path.Line({
                from: segment.point,
                to: handlePt,
                strokeColor: armColor,
                strokeWidth: armWidth / zoom
              });
              arm.data = { type: 'arm', handleType: handleType, segment: segment };

              const handleStrokeColor = isHandleSelected 
                ? (cfg.bezierHandleStrokeSelected || '#ffff00') 
                : entityColor;

              let handleStrokeWidth = cfg.bezierHandleStrokeWidthPx || 1.0;
              if (isHandleSelected) {
                handleStrokeWidth = cfg.anchorStrokeWidthSelectedPx || 1.5;
              } else if (isHandleHovered) {
                handleStrokeWidth = cfg.bezierHandleStrokeWidthHoverPx || 1.8;
              }

              const sizePx = isHandleSelected 
                ? (cfg.bezierHandleSizePx + 1.0) 
                : (isHandleHovered ? cfg.bezierHandleSizePx + 0.5 : cfg.bezierHandleSizePx);

              const handleSquare = new paper.Path.Rectangle({
                point: [handlePt.x - sizePx / (2 * zoom), handlePt.y - sizePx / (2 * zoom)],
                size: [sizePx / zoom, sizePx / zoom],
                fillColor: cfg.bezierHandleFill || '#10141D',
                strokeColor: handleStrokeColor,
                strokeWidth: handleStrokeWidth / zoom
              });
              handleSquare.data = { type: handleType, segment: segment };

              this.controlHandlesGroup.addChild(arm);
              this.controlHandlesGroup.addChild(handleSquare);
            }
          });

          const isAnchorHovered = !isEntitySelected && !isSegSelected && 
                                  !!(this.hoveredHandle && 
                                    this.hoveredHandle.segment === segment && 
                                    this.hoveredHandle.type === 'anchor');

          const baseSide = isSegSelected 
            ? (cfg.anchorSizeSelectedPx || 7.5) 
            : (isAnchorHovered ? (cfg.anchorSizeNormalPx || 7.0) + 0.5 : (cfg.anchorSizeNormalPx || 7.0));

          // Si está seleccionado, aplica estrictamente el grosor de selección sin sumar hover
          let strokeW = isSegSelected 
            ? (cfg.anchorStrokeWidthSelectedPx || 1.5) 
            : (isAnchorHovered ? (cfg.anchorStrokeWidthHoverPx || 1.8) : (cfg.anchorStrokeWidthNormalPx || 1.0));

          const anchorSquare = new paper.Path.Rectangle({
            point: [segment.point.x - (baseSide / zoom) / 2, segment.point.y - (baseSide / zoom) / 2],
            size: [baseSide / zoom, baseSide / zoom],
            fillColor: isSegSelected ? (cfg.anchorFillSelected || '#10141D') : (cfg.anchorFillNormal || '#10141D'),
            strokeColor: isSegSelected ? (cfg.anchorStrokeSelected || '#ffff00') : entityColor,
            strokeWidth: strokeW / zoom
          });
          anchorSquare.data = { type: 'anchor', segment: segment };
          this.controlHandlesGroup.addChild(anchorSquare);
        });
      }
    });

    // 3. Renderizado de Contornos y Grips Paramétricos
    const selectableEntities = (this.service.selectedEntities || []).filter(ent => {
      const lId = String(ent.data?.layerId || '0');
      const layer = this.layerManager?.layers?.get(lId);
      return !layer || !layer.locked;
    });

    selectableEntities.forEach(entity => {
      if (!entity.visible) return;

      if (entity.data && entity.data.controller) {
        const controller = entity.data.controller;
        const { grips, outlineSegments } = controller.getGrips();

        const rawColor = this.propertyManager 
          ? this.propertyManager.getResolvedColor(entity)
          : '#00e5ff';

        const entityColor = new paper.Color(rawColor);
        entityColor.alpha = 1.0;

        if (outlineSegments && outlineSegments.length > 1) {
          const boundingOutline = new paper.Path({
            segments: outlineSegments,
            closed: true,
            strokeColor: entityColor,
            strokeWidth: 1 / zoom,
            insert: false
          });
          boundingOutline.guide = true;
          this.controlHandlesGroup.addChild(boundingOutline);
        }

        grips.forEach(grip => {
          const isCenter = grip.id === 'center';
          const isHovered = this.hoveredParametricGrip && 
                            this.hoveredParametricGrip.entity === entity && 
                            this.hoveredParametricGrip.gripId === grip.id;
          
          const isActiveGrip = this.activeParametricGrip && 
                              this.activeParametricGrip.entity === entity && 
                              this.activeParametricGrip.gripId === grip.id;

          const normalSide = isCenter ? 8.0 : (cfg.anchorSizeNormalPx || 7.0);
          const selectedSide = isCenter ? 9.0 : (cfg.anchorSizeSelectedPx || 7.5);

          let sizePx = normalSide;
          let strokeW = cfg.anchorStrokeWidthNormalPx || 1.0;
          let strokeColor = entityColor;
          let fillColor = cfg.anchorFillNormal || '#10141D';

          if (isActiveGrip) {
            sizePx = selectedSide;
            strokeW = cfg.anchorStrokeWidthSelectedPx || 1.5;
          } else if (isHovered) {
            sizePx = normalSide;
            strokeW = cfg.anchorStrokeWidthHoverPx || 1.8;
          }

          const size = sizePx / zoom;

          let gripMarker;
          if (isCenter) {
            gripMarker = new paper.CompoundPath({
              children: [
                new paper.Path.Circle({ center: grip.point, radius: size / 1.5 }),
                new paper.Path.Line(grip.point.subtract([size, 0]), grip.point.add([size, 0])),
                new paper.Path.Line(grip.point.subtract([0, size]), grip.point.add([0, size]))
              ],
              strokeColor: strokeColor,
              strokeWidth: strokeW / zoom,
              fillColor: null
            });
          } else {
            gripMarker = new paper.Path.Rectangle({
              point: [grip.point.x - size / 2, grip.point.y - size / 2],
              size: [size, size],
              fillColor: fillColor,
              strokeColor: strokeColor,
              strokeWidth: strokeW / zoom
            });
          }

          gripMarker.data = { 
            isParametricGrip: true, 
            gripId: grip.id, 
            entity: entity,
            cursor: grip.cursor
          };

          this.controlHandlesGroup.addChild(gripMarker);
        });
      }
    });
  }
  
  // Delegación directa a HUDManager
  updateHUD(point) {
    if (this.hud) {
      this.hud.updateHUD(point);
    }
  }

  // Selección de herramienta con registro automático en consola
  setTool(toolName) {
    this.isChangingTool = true;
    this.currentToolMode = toolName;
    this.closeAllMenus();

    // 1. RESPALDO INMEDIATO: Guardar selección previa antes de que se limpie por cambio de herramienta
    const isDivisionTool = (toolName === 'divide_count' || toolName === 'divide_dist');
    const preservedEntities = isDivisionTool 
      ? this.service.selectedEntities.filter(ent => ent && !ent.data?.isPointEntity) 
      : [];

    // 2. Limpieza de estados de edición de nodos (sin deseleccionar si es división)
    if (toolName !== 'select' && toolName !== 'pan') {
      this.service.editingEntities = [];
      this.service.deselectAllSegments();
      if (!isDivisionTool) {
        this.service.deselectAllEntities();
      }
    }

    if (toolName !== 'select' && toolName !== 'pan') {
      this.lastActiveToolMode = toolName;
    }

    // 3. Registro en la Consola / Historial
    if (this.commandBar && typeof this.commandBar.logUserCommand === 'function') {
      this.commandBar.logUserCommand(toolName.toUpperCase());
    }

    // 4. Cambiar herramienta en ToolManager (esto ejecuta cancel() de la tool previa)
    this.toolManager.setTool(toolName);

    // 5. RESTAURACIÓN Y TRANSICIÓN DIRECTA: Restaurar selección y saltar al paso de ingreso
    if (isDivisionTool && preservedEntities.length > 0) {
      this.service.selectedEntities = [...preservedEntities];
      this.divisionSelectedEntities = [...preservedEntities];

      const activeTool = this.toolManager.activeTool;
      if (activeTool && typeof activeTool.askForDivisionValue === 'function') {
        activeTool.askForDivisionValue();
      }
    }

    this.isChangingTool = false;
    
    // 6. Actualización de clases visuales en Botones de UI
    const allButtons = document.querySelectorAll('.cad-button');
    allButtons.forEach(btn => btn.classList.remove('active'));
    
    const btnSnap = document.getElementById('btnSnap');
    if (btnSnap && this.service.isSnapMasterEnabled) {
      btnSnap.classList.add('active');
    }

    const btnGrid = document.getElementById('btnGrid');
    if (btnGrid && this.isGridVisible) {
      btnGrid.classList.add('active');
    }

    const toolBtnMap = {
      'select': 'btnSelect',
      'pan': 'btnPan',
      'point': 'btnPointGroup',
      'divide_count': 'btnPointGroup',
      'divide_dist': 'btnPointGroup',
      'line': 'btnLineGroup',
      'polyline': 'btnLineGroup',
      'spline': 'btnCurveGroup',
      'bezier': 'btnCurveGroup',
      'circle': 'btn-circle-tool',
      'trim': 'btnTrim',
      'extend': 'btnExtend'
    };

    const activeBtnId = toolBtnMap[toolName];
    if (activeBtnId) {
      const activeBtn = document.getElementById(activeBtnId);
      if (activeBtn) activeBtn.classList.add('active');
    }

    const canvas = document.getElementById('cadCanvas');
    if (canvas) {
      canvas.className = `tool-${['select', 'pan', 'trim', 'extend'].includes(toolName) ? toolName : 'draw'}`;
    }

    if (['select', 'trim', 'divide_count', 'divide_dist'].includes(toolName)) {
      if (this.hud) this.hud.clear();
    }

    // 7. Actualización del icono y de la herramienta por defecto del botón Flyout
    const iconMap = {
      'point': { btn: 'btnPointGroup', icon: 'currentPointIcon', name: 'custom:dot' },
      'divide_count': { btn: 'btnPointGroup', icon: 'currentPointIcon', name: 'custom:divide' },
      'divide_dist': { btn: 'btnPointGroup', icon: 'currentPointIcon', name: 'custom:dividelength' },
      'line': { btn: 'btnLineGroup', icon: 'currentLineIcon', name: 'custom:line' },
      'polyline': { btn: 'btnLineGroup', icon: 'currentLineIcon', name: 'custom:polyline' },
      'spline': { btn: 'btnCurveGroup', icon: 'currentCurveIcon', name: 'custom:spline' },
      'bezier': { btn: 'btnCurveGroup', icon: 'currentCurveIcon', name: 'fa-solid:bezier-curve' },
      'trim': { btn: 'btnTrim', icon: 'currentModifyIcon', name: 'custom:trim' },
      'extend': { btn: 'btnExtend', icon: 'currentModifyIcon', name: 'custom:extend' }
    };

    const config = iconMap[toolName];
    if (config) {
      const btnEl = document.getElementById(config.btn);
      const iconEl = document.getElementById(config.icon);
      if (btnEl) btnEl.setAttribute('data-default-tool', toolName);
      if (iconEl) {
        iconEl.setAttribute('data-icon', config.name);
        if (window.Iconify) window.Iconify.scan(iconEl.parentElement);
      }
    }
  }

  clearHoverHighlight() {
    if (this.service.hoveredEntity) {
      this.service.hoveredEntity = null;
      this.updateEntitiesStroke();
    }
  }

  toggleSnapMaster() {
    const isEnabled = this.service.toggleSnapMaster();

    const btn = document.getElementById('btnSnap');
    const icon = document.getElementById('btnSnapIcon');
    if (btn) btn.classList.toggle('active', isEnabled);
    if (icon) {
      icon.className = isEnabled 
        ? 'fa-solid fa-magnet text-[10px] text-zinc-100' 
        : 'fa-solid fa-magnet text-[10px] text-zinc-500';
    }

    const chipContainer = document.getElementById('chipEndpoint')?.parentElement;
    if (chipContainer) {
      chipContainer.classList.toggle('snap-chips-disabled', !isEnabled);
    }

    if (!isEnabled && this.hud) {
      this.hud.clear();
    }
  }

  toggleSnapFilter(filterKey) {
    const isActive = this.service.toggleSnapFilter(filterKey);
    const chipMap = {
      endpoint: 'chipEndpoint',
      midpoint: 'chipMidpoint',
      center: 'chipCenter',
      quadrant: 'chipQuadrant',
      node: 'chipNode',
      intersection: 'chipIntersection',
      grid: 'chipGrid'
    };
    const chip = document.getElementById(chipMap[filterKey]);
    if (chip) chip.classList.toggle('active', isActive);
  }

  toggleGrid() {
    this.isGridVisible = !this.isGridVisible;
    const btnGrid = document.getElementById('btnGrid');
    if (btnGrid) btnGrid.classList.toggle('active', this.isGridVisible);
    this.drawGrid();
  }

  closeAllMenus() {
    // Ajusta las clases CSS al nombre exacto que use tu barra de herramientas HTML
    document.querySelectorAll('.dropdown-menu, .toolbar-dropdown, .submenu, .menu-open').forEach(el => {
      el.classList.remove('show', 'open', 'active');
    });
  }
  
  resetView() {
    if (this.zoomAnimationRequestId) {
      cancelAnimationFrame(this.zoomAnimationRequestId);
      this.zoomAnimationRequestId = null;
    }

    let targetCenter = new paper.Point(0, 0);
    let targetZoom = 1;

    const validEntities = this.service.demoEntities.filter(
      ent => ent && ent.bounds && ent.bounds.width > 0 && ent.bounds.height > 0
    );

    if (validEntities.length > 0) {
      let combinedBounds = validEntities[0].strokeBounds 
        ? validEntities[0].strokeBounds.clone() 
        : validEntities[0].bounds.clone();

      for (let i = 1; i < validEntities.length; i++) {
        const b = validEntities[i].strokeBounds || validEntities[i].bounds;
        combinedBounds = combinedBounds.unite(b);
      }

      if (combinedBounds && combinedBounds.width > 0 && combinedBounds.height > 0) {
        const viewSizePx = paper.view.element.getBoundingClientRect();

        // 1. Medir la altura real ocupada por el panel inferior de la UI
        const bottomBarEl = document.querySelector('#app-ui-container > div');
        const bottomInset = bottomBarEl ? bottomBarEl.getBoundingClientRect().height : 90;
        const topInset = 20;
        const horizontalPadding = 80;

        // 2. Calcular las dimensiones del área útil visible
        const visibleWidth = Math.max(viewSizePx.width - horizontalPadding, 100);
        const visibleHeight = Math.max(viewSizePx.height - bottomInset - topInset, 100);

        // 3. Zoom ajustado al área útil (con un margen del 85%)
        const zoomX = (visibleWidth * 0.85) / combinedBounds.width;
        const zoomY = (visibleHeight * 0.85) / combinedBounds.height;
        targetZoom = Math.max(0.05, Math.min(Math.min(zoomX, zoomY), 50));

        // 4. Compensar el centro visual desplazándolo según la barra inferior
        const offsetYPx = (bottomInset - topInset) / 2;
        targetCenter = combinedBounds.center.add(new paper.Point(0, offsetYPx / targetZoom));
      }
    }

    const startCenter = paper.view.center.clone();
    const startZoom = paper.view.zoom;
    const startTime = performance.now();
    const duration = 400;

    const animateZoom = (time) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const currentCenterX = startCenter.x + (targetCenter.x - startCenter.x) * easeOut;
      const currentCenterY = startCenter.y + (targetCenter.y - startCenter.y) * easeOut;
      paper.view.center = new paper.Point(currentCenterX, currentCenterY);

      paper.view.zoom = startZoom + (targetZoom - startZoom) * easeOut;

      this.drawGrid();
      this.updatePointEntitiesScale();
      this.updateEntitiesStroke();
      this.renderBezierHandles();
      this.updateHUD(paper.view.center);

      if (progress < 1) {
        this.zoomAnimationRequestId = requestAnimationFrame(animateZoom);
      } else {
        this.zoomAnimationRequestId = null;
      }
    };

    this.zoomAnimationRequestId = requestAnimationFrame(animateZoom);
  }

  clearCanvas() {
    this.service.clearCanvas(() => this.renderBezierHandles());
    if (this.activePath) { this.activePath.remove(); this.activePath = null; }
    if (this.rubberBandLine) { this.rubberBandLine.remove(); this.rubberBandLine = null; }
    if (this.hud) this.hud.clear();
  }

  setupDragAndDrop() {
    if (!this.canvasElement) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this.canvasElement.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      this.canvasElement.addEventListener(eventName, () => {
        this.canvasElement.classList.add('drag-over');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      this.canvasElement.addEventListener(eventName, () => {
        this.canvasElement.classList.remove('drag-over');
      }, false);
    });

    this.canvasElement.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;

      if (files && files.length > 0) {
        const file = files[0];
        const viewPoint = paper.view.getEventPoint(e);

        // 1. CASO SVG: Detecta si es vectorial y lo lee como texto XML puro
        if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const svgString = event.target.result;
            this.importSVGToCanvas(svgString, viewPoint);
          };
          reader.readAsText(file);
        } 
        // 2. CASO IMAGEN RÁSTER: Mantiene tu importImageToCanvas intacto
        else if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const imageSrc = event.target.result;
            this.importImageToCanvas(imageSrc, viewPoint);
          };
          reader.readAsDataURL(file);
        }
      }
    });
  }

  applyOrthoConstraint(fromPt, toPt, isShiftPressed) {
    if (!isShiftPressed || !fromPt || !toPt) return toPt;

    const dx = Math.abs(toPt.x - fromPt.x);
    const dy = Math.abs(toPt.y - fromPt.y);

    // Si el desplazamiento horizontal es mayor, mantiene Y fija; de lo contrario mantiene X fija.
    if (dx > dy) {
      return new paper.Point(toPt.x, fromPt.y);
    } else {
      return new paper.Point(fromPt.x, toPt.y);
    }
  }

  renderPivotMarker(point) {
    if (!point) return;

    const zoom = paper.view.zoom;
    const cfg = CAD_THEME?.handles || {};
    const side = (cfg.anchorSizeSelectedPx || 8.5) / zoom;

    const marker = new paper.Path.Rectangle({
      point: [point.x - side / 2, point.y - side / 2],
      size: [side, side],
      fillColor: cfg.anchorFillSelected || '#10141D',
      strokeColor: cfg.anchorStrokeSelected || '#ffff00',
      strokeWidth: (cfg.anchorStrokeWidthSelectedPx || 2.0) / zoom
    });

    const targetGroup = this.hudGroup || this.controlHandlesGroup;
    if (targetGroup) {
      targetGroup.addChild(marker);
    }
  }

  /**
   * Genera el siguiente nombre disponible para una entidad analizando las existentes en el lienzo.
   */
  generateNextEntityName(basePrefix = 'Línea') {
    const entities = this.service?.demoEntities || [];
    let maxNum = 0;
    const regex = new RegExp(`^${basePrefix}\\s+(\\d+)$`, 'i');

    entities.forEach((ent) => {
      const name = ent.name || ent.data?.name || '';
      const match = name.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });

    return `${basePrefix} ${maxNum + 1}`;
  }
}

window.CADUtils = CADUtils;