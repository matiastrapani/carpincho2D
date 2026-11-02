/**
 * LayerPanelUI.js - Panel de control e interacción de capas sobrio, adaptativo y reordenable.
 * Incluye delimitador "::", gestión de posición e historial completo (Undo/Redo).
 */

// =========================================================================
// COMANDOS DE HISTORIAL (UNDO / REDO)
// =========================================================================

class CreateLayerCommand {
  constructor(layerManager, layerData, panelUI) {
    this.manager = layerManager;
    this.layerData = layerData;
    this.panelUI = panelUI;
    this.createdLayerId = layerData.id || null;
  }

  execute() {
    if (!this.createdLayerId) {
      const layer = this.manager.createLayer(this.layerData);
      this.createdLayerId = layer.id;
    } else {
      this.manager.layers.set(this.createdLayerId, { ...this.layerData, id: this.createdLayerId });
    }
    this.manager.setActiveLayer(this.createdLayerId);
    this.panelUI.refresh();
  }

  undo() {
    if (this.createdLayerId) {
      this.manager.deleteLayer(this.createdLayerId);
      this.panelUI.refresh();
    }
  }
}

class SetActiveLayerCommand {
  constructor(layerManager, oldLayerId, newLayerId, panelUI) {
    this.manager = layerManager;
    this.oldLayerId = oldLayerId;
    this.newLayerId = newLayerId;
    this.panelUI = panelUI;
  }

  execute() {
    const layer = this.manager.layers.get(this.newLayerId);
    if (layer) {
      layer.visible = true;
      layer.locked = false;
    }
    this.manager.setActiveLayer(this.newLayerId);
    this.panelUI.refresh();
  }

  undo() {
    this.manager.setActiveLayer(this.oldLayerId);
    this.panelUI.refresh();
  }
}

class DeleteLayerCommand {
  constructor(layerManager, layerId, targetLayerId, cadService, panelUI) {
    this.manager = layerManager;
    this.layerId = layerId;
    this.targetLayerId = targetLayerId;
    this.cadService = cadService;
    this.panelUI = panelUI;
    
    // Respaldos para Undo
    this.oldEntries = Array.from(this.manager.layers.entries());
    this.layerBackup = { ...this.manager.layers.get(layerId) };
    this.oldActiveLayerId = this.manager.activeLayerId;
    this.affectedEntities = [];
  }

  execute() {
    this.affectedEntities = [];
    
    // Reasignar elementos a la capa de destino
    if (this.cadService && this.cadService.demoEntities && this.targetLayerId) {
      this.cadService.demoEntities.forEach((ent) => {
        if (ent.data && String(ent.data.layerId) === String(this.layerId)) {
          this.affectedEntities.push(ent);
          ent.data.layerId = this.targetLayerId;
        }
      });
    }

    // Si la capa eliminada era la activa, activar la capa de destino
    if (String(this.manager.activeLayerId) === String(this.layerId) && this.targetLayerId) {
      this.manager.setActiveLayer(this.targetLayerId);
    }

    this.manager.deleteLayer(this.layerId);
    this.panelUI._syncPaperZIndex();
    this.panelUI.refresh();
    
    if (this.panelUI.utils?.updateEntitiesStroke) {
      this.panelUI.utils.updateEntitiesStroke();
    }
  }

  undo() {
    if (this.layerBackup && this.oldEntries) {
      // Reconstruir lista de capas preservando el orden original
      this.manager.layers = new Map(this.oldEntries);

      // Devolver los elementos a la capa restaurada
      this.affectedEntities.forEach((ent) => {
        if (ent.data) ent.data.layerId = this.layerId;
      });

      // Restaurar capa activa previa
      if (this.oldActiveLayerId) {
        this.manager.setActiveLayer(this.oldActiveLayerId);
      }

      this.panelUI._syncPaperZIndex();
      this.panelUI.refresh();
      
      if (this.panelUI.utils?.updateEntitiesStroke) {
        this.panelUI.utils.updateEntitiesStroke();
      }
      if (window.paper?.view) {
        window.paper.view.update();
      }
    }
  }
}


class UpdateLayerPropertyCommand {
  constructor(layerManager, layerId, property, oldValue, newValue, panelUI) {
    this.manager = layerManager;
    this.layerId = layerId;
    this.property = property;
    this.oldValue = oldValue;
    this.newValue = newValue;
    this.panelUI = panelUI;
  }

  execute() {
    this.manager.updateLayerProperty(this.layerId, this.property, this.newValue);
    this.panelUI.refresh();
    this._updateCanvas();
  }

  undo() {
    this.manager.updateLayerProperty(this.layerId, this.property, this.oldValue);
    this.panelUI.refresh();
    this._updateCanvas();
  }

  _updateCanvas() {
    if (this.panelUI.utils?.updateEntitiesStroke) {
      this.panelUI.utils.updateEntitiesStroke();
    }
    if (window.paper?.view) {
      window.paper.view.update();
    }
  }
}

class RenameLayerCommand {
  constructor(layerManager, layerId, oldName, newName, panelUI) {
    this.manager = layerManager;
    this.layerId = layerId;
    this.oldName = oldName;
    this.newName = newName;
    this.panelUI = panelUI;
  }

  execute() {
    this.manager.updateLayerProperty(this.layerId, 'name', this.newName);
    this.panelUI.refresh();
  }

  undo() {
    this.manager.updateLayerProperty(this.layerId, 'name', this.oldName);
    this.panelUI.refresh();
  }
}

class ReorderLayersCommand {
  constructor(layerManager, oldOrderEntries, newOrderEntries, panelUI) {
    this.manager = layerManager;
    this.oldOrderEntries = oldOrderEntries;
    this.newOrderEntries = newOrderEntries;
    this.panelUI = panelUI;
  }

  execute() {
    this.manager.layers = new Map(this.newOrderEntries);
    this.panelUI._syncPaperZIndex();
    this.panelUI.refresh();
  }

  undo() {
    this.manager.layers = new Map(this.oldOrderEntries);
    this.panelUI._syncPaperZIndex();
    this.panelUI.refresh();
  }
}

window.CreateLayerCommand = CreateLayerCommand;
window.SetActiveLayerCommand = SetActiveLayerCommand;
window.DeleteLayerCommand = DeleteLayerCommand;
window.UpdateLayerPropertyCommand = UpdateLayerPropertyCommand;
window.RenameLayerCommand = RenameLayerCommand;
window.ReorderLayersCommand = ReorderLayersCommand;


// =========================================================================
// COMPONENTE PRINCIPAL DE INTERFAZ DE CAPAS
// =========================================================================

class LayerPanelUI {
  constructor(cadUtils, containerId = 'layerPanelContainer') {
    this.utils = cadUtils;
    this.manager = cadUtils.layerManager;
    this.container = document.getElementById(containerId);
    this.activePopover = null;
    this.draggedLayerId = null;

    this.init();
  }

  init() {
    if (!this.container) return;
    this._ensureDefaultLayerConfig();
    this.renderShell();
    this.refresh();
  }

  _ensureDefaultLayerConfig() {
    if (!this.manager || !this.manager.layers) return;
    const layer0 = this.manager.layers.get('0');
    if (layer0) {
      if (layer0.name === '0') {
        layer0.name = 'Capa 0';
      }
      if (layer0.strokeWidth === undefined || layer0.strokeWidth === 1) {
        layer0.strokeWidth = 0;
      }
    }
  }

  _generateUniqueName(desiredName, layerId) {
    if (!this.manager || !this.manager.layers) return desiredName;

    const layers = this.manager.layers;
    const isTaken = (name) => {
      for (const [id, l] of layers.entries()) {
        if (String(id) !== String(layerId) && l.name.trim().toLowerCase() === name.trim().toLowerCase()) {
          return true;
        }
      }
      return false;
    };

    let cleanName = desiredName.trim() || `Capa ${layers.size}`;
    if (!isTaken(cleanName)) return cleanName;

    const match = cleanName.match(/^(.*?)(?:\s+(\d+))?$/);
    let base = cleanName;
    let num = 1;

    if (match && match[2] !== undefined) {
      base = match[1];
      num = parseInt(match[2], 10) + 1;
    }

    let candidate = `${base} ${num}`;
    while (isTaken(candidate)) {
      num++;
      candidate = `${base} ${num}`;
    }
    return candidate;
  }

  _getPresetColors() {
    return [
      '#008800', '#00e5ff', '#ff3b30', '#ff9500', 
      '#ffcc00', '#34c759', '#007aff', '#5856d6', 
      '#af52de', '#ff2d55', '#ffffff', '#8e8e93'
    ];
  }

  _getRandomColor() {
    if (!this.manager || !this.manager.layers) return '#00e5ff';

    const existingLayers = Array.from(this.manager.layers.values());
    const existingHues = existingLayers
      .map((l) => this._hexToHue(l.color))
      .filter((h) => h !== null);

    let bestHue = Math.floor(Math.random() * 360);

    if (existingHues.length > 0) {
      let maxMinDist = -1;
      for (let cand = 0; cand < 360; cand += 10) {
        let minDist = 360;
        for (const h of existingHues) {
          let dist = Math.abs(cand - h);
          if (dist > 180) dist = 360 - dist;
          if (dist < minDist) minDist = dist;
        }
        if (minDist > maxMinDist) {
          maxMinDist = minDist;
          bestHue = cand;
        }
      }
    }

    return this._hslToHex(bestHue, 85, 55);
  }

  _hexToHue(hex) {
    if (!hex || !hex.startsWith('#')) return null;
    let c = hex.substring(1);
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    if (c.length !== 6) return null;

    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0;
    if (max !== min) {
      const d = max - min;
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return Math.round(h * 360);
  }

  _hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }

  renderShell() {
    this.container.innerHTML = `
      <div class="flex flex-col h-full w-full select-none text-zinc-300 font-sans overflow-hidden">
        <!-- Encabezado Sobrio -->
        <div class="flex items-center justify-between mb-2 shrink-0">
          <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Capas</span>
          <button id="btnAddLayerBtn" class="text-zinc-400 hover:text-zinc-100 transition-colors p-1 rounded hover:bg-[#27272a] text-xs flex items-center justify-center w-5 h-5" title="Nueva Capa">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>

        <!-- Encabezado de Columnas con Delimitador :: -->
        <div class="grid grid-cols-[12px_16px_16px_minmax(0,1fr)_48px_16px_16px_16px] gap-1.5 items-center px-1.5 py-1 text-[10px] font-semibold text-zinc-500 border-b border-[#2a2a32] shrink-0 uppercase tracking-wider overflow-hidden">
          <span></span>
          <span title="Capa Activa" class="flex items-center justify-center">A</span>
          <span title="Color de Capa" class="flex items-center justify-center">C</span>
          <span class="truncate min-w-0">Nombre</span>
          <span class="text-center truncate" title="Grosor de Línea">Grosor</span>
          <span class="flex items-center justify-center" title="Visibilidad"><i class="fa-solid fa-eye text-[9px]"></i></span>
          <span class="flex items-center justify-center" title="Bloqueo"><i class="fa-solid fa-lock text-[9px]"></i></span>
          <span></span>
        </div>

        <!-- Lista de Capas (Sin divide-y) -->
        <div id="layerListContainer" class="flex-1 overflow-y-auto custom-scrollbar min-h-0 bg-transparent"></div>
      </div>
    `;

    document.getElementById('btnAddLayerBtn')?.addEventListener('click', () => {
      const defaultName = this._generateUniqueName(`Capa ${this.manager.layers.size}`, null);
      const layerData = {
        name: defaultName,
        color: this._getRandomColor(),
        strokeWidth: 0
      };

      if (this.utils?.service?.executeCommand) {
        const cmd = new CreateLayerCommand(this.manager, layerData, this);
        this.utils.service.executeCommand(cmd);
      } else {
        const newLayer = this.manager.createLayer(layerData);
        if (newLayer) {
          this.manager.setActiveLayer(newLayer.id);
          this.refresh();
        }
      }
    });
  }

  refresh() {
    this._closeColorPicker();
    const list = document.getElementById('layerListContainer');
    if (!list) return;

    list.innerHTML = '';

    if (!this.manager || !this.manager.layers) return;

    this.manager.layers.forEach((layer) => {
      const row = this.createLayerRow(layer);
      list.appendChild(row);
    });
  }

  createLayerRow(layer) {
    const activeLayer = this.manager.getActiveLayer();
    const activeId = activeLayer ? activeLayer.id : this.manager.activeLayerId;
    const isActive = String(activeId) === String(layer.id);
    const canDelete = this.manager.layers.size > 1;

    // Regla: La capa activa SIEMPRE está visible y desbloqueada
    if (isActive) {
      layer.visible = true;
      layer.locked = false;
    }

    const displayName = (layer.id === '0' && layer.name === '0') ? 'Capa 0' : layer.name;

    const row = document.createElement('div');
    row.setAttribute('draggable', 'false');
    row.dataset.layerId = layer.id;

    row.className = `grid grid-cols-[12px_16px_16px_minmax(0,1fr)_48px_16px_16px_16px] gap-1.5 items-center px-1.5 py-1 overflow-hidden ${
      isActive ? 'bg-[#17171c] text-zinc-200' : 'hover:bg-[#1e1e24] text-zinc-400'
    }`;

    const actionBtnBase = "w-4 h-4 flex items-center justify-center transition-colors text-[11px]";

    // Estilos de texto gris cuando la capa está invisible
    const nameTextColor = layer.visible ? 'text-zinc-200' : 'text-zinc-600';
    const strokeTextColor = layer.visible ? 'text-zinc-300' : 'text-zinc-600';

    // Botón Visibilidad: mantiene color encendido (text-zinc-200) pero muestra el cursor de bloqueo en la capa activa
    const visBtnStyle = isActive
      ? 'text-zinc-200 cursor-not-allowed'
      : layer.visible 
        ? 'text-zinc-200 cursor-pointer' 
        : 'text-zinc-600 hover:text-zinc-300 cursor-pointer';

    // Botón Bloqueo: mantiene el color habitual (text-zinc-600 / hover) pero muestra el cursor de bloqueo en la capa activa
    const lockBtnStyle = isActive
      ? 'text-zinc-600 hover:text-zinc-300 cursor-not-allowed'
      : !layer.visible
        ? 'text-zinc-600 hover:text-zinc-300 cursor-pointer'
        : layer.locked 
          ? 'text-zinc-200 cursor-pointer' 
          : 'text-zinc-600 hover:text-zinc-300 cursor-pointer';

    row.innerHTML = `
      <!-- 0. Delimitador / Tirador de Arrastre :: -->
      <div class="drag-handle flex items-center justify-center cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-300 font-mono text-[10px] leading-none select-none" title="Arrastrar para reordenar">
        ::
      </div>

      <!-- 1. Capa Activa -->
      <div class="flex items-center justify-center">
        <button class="btn-activate ${actionBtnBase} cursor-pointer" title="Establecer como activa">
          ${
            isActive
              ? '<span class="w-2 h-2 rounded-full bg-zinc-200"></span>'
              : '<span class="w-1.5 h-1.5 rounded-full bg-zinc-600 hover:bg-zinc-400 transition-colors"></span>'
          }
        </button>
      </div>

      <!-- 2. Color Swatch -->
      <div class="flex items-center justify-center">
        <button class="btn-color-picker w-3.5 h-3.5 rounded-sm overflow-hidden cursor-pointer shrink-0 transition-transform hover:scale-110" 
             style="background-color: ${layer.color}" title="Cambiar color de capa"></button>
      </div>

      <!-- 3. Nombre Editable -->
      <div class="min-w-0 flex items-center">
        <input type="text" value="${displayName}" 
          class="layer-name-input bg-transparent hover:bg-[#27272a] focus:bg-[#27272a] text-[11px] font-medium outline-none border-0 ring-0 shadow-none ${nameTextColor} truncate w-full px-1.5 py-0.5 rounded transition-colors">
      </div>

      <!-- 4. Selector de Grosor -->
      <div class="flex items-center justify-center min-w-0">
        <div class="relative flex items-center justify-center w-full">
          <select class="layer-stroke-select bg-transparent hover:bg-[#27272a] focus:bg-[#27272a] ${strokeTextColor} hover:text-white text-[11px] outline-none border-0 ring-0 shadow-none cursor-pointer w-full text-center appearance-none pr-3 py-0.5 rounded transition-colors">
            <option value="0" class="bg-[#121215] text-zinc-200" ${!layer.strokeWidth || layer.strokeWidth === 0 ? 'selected' : ''}>-</option>
            <option value="1" class="bg-[#121215] text-zinc-200" ${layer.strokeWidth === 1 ? 'selected' : ''}>1.0</option>
            <option value="1.5" class="bg-[#121215] text-zinc-200" ${layer.strokeWidth === 1.5 ? 'selected' : ''}>1.5</option>
            <option value="2" class="bg-[#121215] text-zinc-200" ${layer.strokeWidth === 2 ? 'selected' : ''}>2.0</option>
            <option value="3" class="bg-[#121215] text-zinc-200" ${layer.strokeWidth === 3 ? 'selected' : ''}>3.0</option>
          </select>
          <i class="fa-solid fa-chevron-down text-[7px] text-zinc-500 pointer-events-none absolute right-1"></i>
        </div>
      </div>

      <!-- 5. Visibilidad -->
      <div class="flex items-center justify-center">
        <button class="btn-vis ${actionBtnBase} ${visBtnStyle}" title="${isActive ? 'La capa activa no se puede ocultar' : layer.visible ? 'Ocultar' : 'Mostrar'}">
          <i class="fa-solid ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>
        </button>
      </div>

      <!-- 6. Bloqueo -->
      <div class="flex items-center justify-center">
        <button class="btn-lock ${actionBtnBase} ${lockBtnStyle}" title="${isActive ? 'La capa activa no se puede bloquear' : layer.locked ? 'Desbloquear' : 'Bloquear'}">
          <i class="fa-solid ${layer.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
        </button>
      </div>

      <!-- 7. Eliminar -->
      <div class="flex items-center justify-center">
        ${
          canDelete
            ? `<button class="btn-del ${actionBtnBase} text-zinc-600 hover:text-zinc-200 cursor-pointer" title="Eliminar capa"><i class="fa-solid fa-xmark"></i></button>`
            : `<span class="text-zinc-700 text-[10px] cursor-not-allowed" title="Debe existir al menos una capa">-</span>`
        }
      </div>
    `;

    // Referencias y manejadores de eventos
    const dragHandle = row.querySelector('.drag-handle');
    const activateBtn = row.querySelector('.btn-activate');
    const colorBtn = row.querySelector('.btn-color-picker');
    const nameInput = row.querySelector('.layer-name-input');
    const strokeSelect = row.querySelector('.layer-stroke-select');
    const visBtn = row.querySelector('.btn-vis');
    const lockBtn = row.querySelector('.btn-lock');
    const delBtn = row.querySelector('.btn-del');

    const updatePropertyWithCommand = (prop, oldValue, newValue) => {
      if (oldValue === newValue) return;
      if (this.utils?.service?.executeCommand) {
        const cmd = new UpdateLayerPropertyCommand(this.manager, layer.id, prop, oldValue, newValue, this);
        this.utils.service.executeCommand(cmd);
      } else {
        this.manager.updateLayerProperty(layer.id, prop, newValue);
        this.refresh();
        if (this.utils?.updateEntitiesStroke) this.utils.updateEntitiesStroke();
        if (window.paper?.view) window.paper.view.update();
      }
    };

    activateBtn?.addEventListener('click', () => {
      const oldActiveId = this.manager.activeLayerId;
      if (String(oldActiveId) !== String(layer.id)) {
        if (this.utils?.service?.executeCommand) {
          const cmd = new SetActiveLayerCommand(this.manager, oldActiveId, layer.id, this);
          this.utils.service.executeCommand(cmd);
        } else {
          this.manager.setActiveLayer(layer.id);
          this.refresh();
        }
      }
    });

    colorBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._openColorPickerPopover(layer, colorBtn);
    });

    let isFocusedByClick = false;

    nameInput?.addEventListener('focus', () => {
      if (!isFocusedByClick) nameInput.select();
    });

    nameInput?.addEventListener('blur', () => {
      isFocusedByClick = false;
    });

    nameInput?.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (document.activeElement !== nameInput) {
        isFocusedByClick = true;
        setTimeout(() => {
          nameInput.select();
          isFocusedByClick = false;
        }, 0);
      }
    });

    nameInput?.addEventListener('click', (e) => e.stopPropagation());

    nameInput?.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'Escape') nameInput.blur();
    });

    nameInput?.addEventListener('change', (e) => {
      const oldName = layer.name;
      const rawName = e.target.value;
      const uniqueName = this._generateUniqueName(rawName, layer.id);

      if (uniqueName !== oldName) {
        if (this.utils?.service?.executeCommand) {
          const cmd = new RenameLayerCommand(this.manager, layer.id, oldName, uniqueName, this);
          this.utils.service.executeCommand(cmd);
        } else {
          this.manager.updateLayerProperty(layer.id, 'name', uniqueName);
          this.refresh();
        }
      } else {
        e.target.value = oldName;
      }
    });

    strokeSelect?.addEventListener('change', (e) => {
      const oldVal = layer.strokeWidth || 0;
      const newVal = parseFloat(e.target.value);
      updatePropertyWithCommand('strokeWidth', oldVal, newVal);
    });

    visBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isActive) return;
      const oldVal = layer.visible;
      updatePropertyWithCommand('visible', oldVal, !oldVal);
    });

    lockBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isActive) return;
      const oldVal = layer.locked;
      updatePropertyWithCommand('locked', oldVal, !oldVal);
    });

    delBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!canDelete) return;

      // Determinar la capa de destino para los contenidos
      let targetLayer = null;
      if (isActive) {
        // Si borramos la activa, buscar la primera capa disponible diferente a esta
        for (const [id, l] of this.manager.layers.entries()) {
          if (String(id) !== String(layer.id)) {
            targetLayer = l;
            break;
          }
        }
      } else {
        // Si borramos una no activa, el destino es la capa activa actual
        targetLayer = activeLayer || this.manager.layers.get(activeId);
      }

      // Verificar si la capa tiene elementos en el lienzo
      const hasContent = this.utils?.service?.demoEntities?.some(
        (ent) => ent.data && String(ent.data.layerId) === String(layer.id)
      );

      if (hasContent && targetLayer) {
        const confirmMsg = `La capa "${layer.name}" contiene elementos. ¿Eliminarla y mover sus elementos a la capa "${targetLayer.name}"?`;
        if (!confirm(confirmMsg)) {
          return;
        }
      }

      // Ejecutar comando de eliminación con historial
      if (this.utils?.service?.executeCommand) {
        const cmd = new DeleteLayerCommand(this.manager, layer.id, targetLayer?.id, this.utils.service, this);
        this.utils.service.executeCommand(cmd);
      } else {
        if (hasContent && targetLayer) {
          this.utils?.service?.demoEntities?.forEach((ent) => {
            if (ent.data && String(ent.data.layerId) === String(layer.id)) {
              ent.data.layerId = targetLayer.id;
            }
          });
        }
        if (isActive && targetLayer) {
          this.manager.setActiveLayer(targetLayer.id);
        }
        this.manager.deleteLayer(layer.id);
        this.refresh();
      }
    });

    dragHandle?.addEventListener('mousedown', () => {
      row.setAttribute('draggable', 'true');
    });

    row.addEventListener('dragstart', (e) => {
      this.draggedLayerId = layer.id;
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('opacity-40');
    });

    row.addEventListener('dragend', () => {
      row.setAttribute('draggable', 'false');
      row.classList.remove('opacity-40');
      this._clearDragOverStyles();
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (!this.draggedLayerId || String(this.draggedLayerId) === String(layer.id)) return;

      const rect = row.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const isBottom = offsetY > rect.height / 2;

      this._clearDragOverStylesExcept(row);

      if (isBottom) {
        row.classList.remove('border-t-2');
        row.classList.add('border-b-2', 'border-[#52525B]');
      } else {
        row.classList.remove('border-b-2');
        row.classList.add('border-t-2', 'border-[#52525B]');
      }
    });

    row.addEventListener('dragleave', (e) => {
      if (!row.contains(e.relatedTarget)) {
        row.classList.remove('border-t-2', 'border-b-2', 'border-[#52525B]');
      }
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!this.draggedLayerId || String(this.draggedLayerId) === String(layer.id)) return;

      const rect = row.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const placeAfter = offsetY > rect.height / 2;

      this._clearDragOverStyles();
      this._reorderLayers(this.draggedLayerId, layer.id, placeAfter);
    });

    return row;
  }

  _reorderLayers(draggedId, targetId, placeAfter = false) {
    if (!this.manager || !this.manager.layers) return;

    const oldOrderEntries = Array.from(this.manager.layers.entries());
    const layerArray = [...oldOrderEntries];

    const draggedIdx = layerArray.findIndex(([id]) => String(id) === String(draggedId));
    if (draggedIdx === -1) return;

    const [draggedItem] = layerArray.splice(draggedIdx, 1);

    let targetIdx = layerArray.findIndex(([id]) => String(id) === String(targetId));
    if (targetIdx === -1) return;

    if (placeAfter) {
      targetIdx += 1;
    }

    layerArray.splice(targetIdx, 0, draggedItem);

    if (this.utils?.service?.executeCommand) {
      const cmd = new ReorderLayersCommand(this.manager, oldOrderEntries, layerArray, this);
      this.utils.service.executeCommand(cmd);
    } else {
      this.manager.layers = new Map(layerArray);
      this._syncPaperZIndex();
      this.refresh();
    }
  }

  _syncPaperZIndex() {
    if (!this.manager || !this.manager.layers) return;

    const layerList = Array.from(this.manager.layers.values());
    const layerOrderMap = new Map();
    layerList.forEach((l, idx) => layerOrderMap.set(String(l.id), idx));

    if (this.utils?.service?.demoEntities) {
      this.utils.service.demoEntities.sort((a, b) => {
        const orderA = layerOrderMap.get(String(a.data?.layerId)) ?? 999;
        const orderB = layerOrderMap.get(String(b.data?.layerId)) ?? 999;
        return orderB - orderA;
      });

      this.utils.service.demoEntities.forEach((ent) => {
        if (typeof ent.bringToFront === 'function') {
          ent.bringToFront();
        }
      });
    }

    for (let i = layerList.length - 1; i >= 0; i--) {
      const layer = layerList[i];
      if (layer.paperGroup && typeof layer.paperGroup.bringToFront === 'function') {
        layer.paperGroup.bringToFront();
      }
    }

    if (window.paper?.view) {
      window.paper.view.update();
    }
  }

  _clearDragOverStylesExcept(targetRow = null) {
    const list = document.getElementById('layerListContainer');
    if (!list) return;
    list.querySelectorAll('.border-t-2, .border-b-2').forEach((el) => {
      if (el !== targetRow) {
        el.classList.remove('border-t-2', 'border-b-2', 'border-[#52525B]');
      }
    });
  }

  _clearDragOverStyles() {
    this._clearDragOverStylesExcept(null);
  }

  _openColorPickerPopover(layer, triggerEl) {
    this._closeColorPicker();

    const rect = triggerEl.getBoundingClientRect();
    const presets = this._getPresetColors();

    const popover = document.createElement('div');
    popover.id = 'figmaColorPickerPopover';
    popover.className = 'fixed z-50 bg-[#1c1c22] border border-[#2a2a32] rounded-lg shadow-2xl p-2.5 w-52 text-zinc-300 font-sans text-xs flex flex-col gap-2 select-none';

    const topPos = Math.min(rect.bottom + 4, window.innerHeight - 240);
    const leftPos = Math.max(10, rect.left - 190);

    popover.style.top = `${topPos}px`;
    popover.style.left = `${leftPos}px`;

    popover.innerHTML = `
      <div class="flex items-center justify-between pb-1 border-b border-[#2a2a32]">
        <span class="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Color de Capa</span>
        <button id="closeColorPickerBtn" class="text-zinc-500 hover:text-zinc-200 transition-colors text-xs p-0.5">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="relative w-full h-24 rounded overflow-hidden cursor-crosshair border border-[#2a2a32]">
        <canvas id="squareColorCanvas" class="w-full h-full block"></canvas>
      </div>

      <div class="grid grid-cols-6 gap-1.5">
        ${presets
          .map(
            (c) => `
          <button class="color-preset-btn w-6 h-5 rounded-sm hover:scale-105 transition-transform cursor-pointer ${
            layer.color.toLowerCase() === c.toLowerCase() ? 'ring-1 ring-white' : ''
          }" style="background-color: ${c}" data-color="${c}"></button>
        `
          )
          .join('')}
      </div>

      <div class="flex items-center gap-1.5 pt-0.5">
        <div class="flex-1 flex items-center bg-[#121215] border border-[#27272a] rounded px-2 py-1 focus-within:border-[#008800]">
          <span class="text-zinc-500 text-[10px] mr-1 font-mono">#</span>
          <input type="text" id="hexColorInput" value="${layer.color.replace('#', '')}" maxlength="6" 
            class="bg-transparent text-zinc-200 text-[10px] font-mono outline-none w-full uppercase">
        </div>
        <label class="w-6 h-6 rounded border border-[#27272a] bg-[#121215] hover:bg-[#27272a] flex items-center justify-center cursor-pointer text-zinc-400 hover:text-zinc-100 transition-colors" title="Paleta del Sistema">
          <i class="fa-solid fa-eye-dropper text-[10px]"></i>
          <input type="color" id="nativeColorFallback" value="${layer.color}" class="hidden">
        </label>
      </div>
    `;

    document.body.appendChild(popover);
    this.activePopover = popover;

    const canvas = popover.querySelector('#squareColorCanvas');
    if (canvas) {
      canvas.width = 180;
      canvas.height = 96;
      const ctx = canvas.getContext('2d');

      const hueGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
      for (let i = 0; i <= 360; i += 60) {
        hueGrad.addColorStop(i / 360, `hsl(${i}, 100%, 50%)`);
      }
      ctx.fillStyle = hueGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const lightGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      lightGrad.addColorStop(0, 'rgba(255,255,255,0.2)');
      lightGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
      lightGrad.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = lightGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let isDragging = false;
      const pickCanvasColor = (e) => {
        const cRect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - cRect.left, cRect.width));
        const y = Math.max(0, Math.min(e.clientY - cRect.top, cRect.height));
        
        const canvasX = Math.floor((x / cRect.width) * canvas.width);
        const canvasY = Math.floor((y / cRect.height) * canvas.height);

        const pixel = ctx.getImageData(canvasX, canvasY, 1, 1).data;
        const hex = `#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1)}`;
        applyColor(hex);
      };

      canvas.addEventListener('pointerdown', (e) => {
        isDragging = true;
        pickCanvasColor(e);
      });

      canvas.addEventListener('pointermove', (e) => {
        if (isDragging) pickCanvasColor(e);
      });

      window.addEventListener('pointerup', () => { isDragging = false; }, { once: true });
    }

    const applyColor = (colorHex) => {
      const oldVal = layer.color;
      if (oldVal === colorHex) return;

      if (this.utils?.service?.executeCommand) {
        const cmd = new UpdateLayerPropertyCommand(this.manager, layer.id, 'color', oldVal, colorHex, this);
        this.utils.service.executeCommand(cmd);
      } else {
        this.manager.updateLayerProperty(layer.id, 'color', colorHex);
        this.refresh();
        if (this.utils?.updateEntitiesStroke) this.utils.updateEntitiesStroke();
        if (window.paper?.view) window.paper.view.update();
      }
    };

    popover.querySelectorAll('.color-preset-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        applyColor(e.currentTarget.getAttribute('data-color'));
      });
    });

    const hexInput = popover.querySelector('#hexColorInput');
    hexInput?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (/^[0-9A-Fa-f]{6}$/.test(val)) {
        applyColor(`#${val}`);
      }
    });

    const nativeInput = popover.querySelector('#nativeColorFallback');
    nativeInput?.addEventListener('input', (e) => {
      applyColor(e.target.value);
    });

    popover.querySelector('#closeColorPickerBtn')?.addEventListener('click', () => {
      this._closeColorPicker();
    });

    setTimeout(() => {
      const outsideClickListener = (e) => {
        if (popover && !popover.contains(e.target) && !triggerEl.contains(e.target)) {
          this._closeColorPicker();
          document.removeEventListener('pointerdown', outsideClickListener);
        }
      };
      document.addEventListener('pointerdown', outsideClickListener);
    }, 0);
  }

  _closeColorPicker() {
    if (this.activePopover) {
      this.activePopover.remove();
      this.activePopover = null;
    }
  }
}

window.LayerPanelUI = LayerPanelUI;