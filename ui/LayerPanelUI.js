/**
 * LayerPanelUI.js - Panel de control e interacción de capas sobrio, adaptativo y reordenable.
 */
// ui/LayerPanelUI.js
import { 
  CreateLayerCommand, 
  SetActiveLayerCommand, 
  DeleteLayerCommand,
  UpdateLayerPropertyCommand,
  RenameLayerCommand, 
  ReorderLayersCommand 
} from '../services/commands/LayerCommands.js';
import { ColorPickerPopover } from './components/ColorPickerPopover.js';

export class LayerPanelUI {
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
    return ColorPickerPopover.getPresets();
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
          // ❌ Se eliminó: this.manager.setActiveLayer(newLayer.id);
          this.refresh();
        }
      }
    });
  }

  refresh() {
    const list = document.getElementById('layerListContainer');
    if (!list) return;

    list.innerHTML = '';

    if (!this.manager || !this.manager.layers) return;

    this.manager.layers.forEach((layer) => {
      const row = this.createLayerRow(layer);
      list.appendChild(row);
    });

    if (window.propertyPanelUI) {
      window.propertyPanelUI.refresh();
    }
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

    let initialColor = layer.color ? layer.color.substring(0, 7).toUpperCase() : '#00E5FF';
    let initialOpacity = layer.opacity !== undefined ? layer.opacity : 1.0;

    const snapshot = {
      color: layer.color,
      opacity: layer.opacity
    };

    let hasChanges = false;

    this.activePopover = new ColorPickerPopover({
      color: initialColor,
      opacity: initialOpacity,
      anchorEl: triggerEl,
      presets: this._getPresetColors(), // Muestras unificadas de 20 colores

      // Actualización en vivo (durante el arrastre)
      onChange: (hexColor, alphaValue) => {
        layer.color = hexColor;
        layer.opacity = alphaValue;

        if (triggerEl) {
          triggerEl.style.backgroundColor = hexColor;
        }

        hasChanges = true;
        if (this.utils?.updateEntitiesStroke) this.utils.updateEntitiesStroke();
        if (window.paper?.view) window.paper.view.update();

        // Refresco en vivo del Panel de Propiedades mientras se arrastra
        if (window.propertyPanelUI) {
          window.propertyPanelUI.refresh();
        }
      },

      // Registro en Undo/Redo al finalizar el arrastre
      onChangeEnd: (hexColor, alphaValue, flags = {}) => {
        let hasChangesCommand = false;

        if (flags.colorChanged && initialColor !== hexColor) {
          if (this.utils?.service?.executeCommand) {
            const cmd = new UpdateLayerPropertyCommand(this.manager, layer.id, 'color', initialColor, hexColor, this);
            this.utils.service.executeCommand(cmd);
          } else {
            this.manager.updateLayerProperty(layer.id, 'color', hexColor);
          }
          initialColor = hexColor;
          hasChangesCommand = true;
        }

        if (flags.opacityChanged && Math.abs(initialOpacity - alphaValue) > 0.001) {
          if (this.utils?.service?.executeCommand) {
            const cmd = new UpdateLayerPropertyCommand(this.manager, layer.id, 'opacity', initialOpacity, alphaValue, this);
            this.utils.service.executeCommand(cmd);
          } else {
            this.manager.updateLayerProperty(layer.id, 'opacity', alphaValue);
          }
          initialOpacity = alphaValue;
          hasChangesCommand = true;
        }

        if (hasChangesCommand) {
          this.refresh();
        }
      },

      onCancel: () => {
        if (!hasChanges) return;
        layer.color = snapshot.color;
        layer.opacity = snapshot.opacity;

        if (triggerEl) {
          triggerEl.style.backgroundColor = snapshot.color;
        }

        this.refresh();
        if (this.utils?.updateEntitiesStroke) this.utils.updateEntitiesStroke();
        if (window.paper?.view) window.paper.view.update();
        if (window.propertyPanelUI) window.propertyPanelUI.refresh();
      },

      onClose: () => {
        this.activePopover = null;
      }
    });
  }

  _closeColorPicker() {
    if (this.activePopover && typeof this.activePopover.close === 'function') {
      this.activePopover.close();
      this.activePopover = null;
    }
  }

}