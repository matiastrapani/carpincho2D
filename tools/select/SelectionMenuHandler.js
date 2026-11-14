/**
 * SelectionMenuHandler.js - Detección con prioridad por capas y menú flotante tipo Rhino 3D.
 */

export class SelectionMenuHandler {
  constructor(cadService, cadUtils) {
    if (!cadService || !cadUtils) {
      throw new Error('SelectionMenuHandler requiere cadService y cadUtils.');
    }

    this.service = cadService;
    this.utils = cadUtils;
    this.menuEl = null;
    this.activeHits = [];
    this.onSelectCallback = null;
    this.wasDismissedRecently = false;

    this._onDocPointerDown = this._handleDocPointerDown.bind(this);
  }

  isOpen() {
    return Boolean(this.menuEl && this.menuEl.isConnected);
  }

  getRootEntity(item) {
    let current = item;
    while (current) {
      if (this.service.entities.includes(current)) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  _getPaper() {
    return this.utils.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  _buildLayerPriorityMap() {
    const rankMap = new Map();
    const layers = this.utils.layerManager?.layers;
    if (!layers) return rankMap;

    let idx = 0;
    layers.forEach((_, layerId) => {
      rankMap.set(String(layerId), idx++);
    });
    return rankMap;
  }

  /**
   * Devuelve todos los impactos válidos bajo el punto ordenados por:
   * 1. Jerarquía visual de capas (arriba hacia abajo en LayerManager).
   * 2. Prioridad de entidades tipo Punto sobre trazos en la misma capa.
   * 3. Orden Z inverso dentro de la misma capa (el objeto dibujado encima primero).
   */
  getSortedHits(point, tolerance) {
    const paperInst = this._getPaper();
    if (!paperInst?.project) return [];

    const options = {
      stroke: true,
      fill: true,
      pixels: true,
      tolerance,
      match: (res) => {
        const root = this.getRootEntity(res.item);
        if (!root) return false;

        const layerId = String(root.data?.layerId || '0');
        const layer = this.utils.layerManager?.layers?.get(layerId);
        if (layer && (layer.locked || layer.visible === false)) return false;
        if (root.visible === false) return false;

        if (root instanceof paperInst.Raster || res.item instanceof paperInst.Raster) return true;
        if (root.data?.isPointEntity || res.item.data?.isPointEntity) return true;
        if (res.type === 'stroke') return true;
        if (res.type === 'fill') {
          const fill = res.item.fillColor || root.fillColor;
          return !!(fill && fill.alpha > 0);
        }
        return false;
      }
    };

    const rawHits = typeof paperInst.project.hitTestAll === 'function'
      ? paperInst.project.hitTestAll(point, options)
      : [paperInst.project.hitTest(point, options)].filter(Boolean);

    const uniqueMap = new Map();
    for (const res of rawHits) {
      if (!res || !res.item) continue;
      const root = this.getRootEntity(res.item);
      if (root && !uniqueMap.has(root)) {
        uniqueMap.set(root, { entity: root, hitResult: res });
      }
    }

    const candidates = Array.from(uniqueMap.values());
    if (candidates.length <= 1) return candidates;

    const layerRanks = this._buildLayerPriorityMap();

    candidates.sort((a, b) => {
      const layerA = String(a.entity.data?.layerId || '0');
      const layerB = String(b.entity.data?.layerId || '0');
      const rankA = layerRanks.has(layerA) ? layerRanks.get(layerA) : Number.MAX_SAFE_INTEGER;
      const rankB = layerRanks.has(layerB) ? layerRanks.get(layerB) : Number.MAX_SAFE_INTEGER;

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      const isPointA = Boolean(a.entity.data?.isPointEntity);
      const isPointB = Boolean(b.entity.data?.isPointEntity);
      if (isPointA !== isPointB) {
        return isPointA ? -1 : 1;
      }

      if (a.entity.parent && a.entity.parent === b.entity.parent) {
        const idxA = typeof a.entity.index === 'number' ? a.entity.index : -1;
        const idxB = typeof b.entity.index === 'number' ? b.entity.index : -1;
        if (idxA !== idxB) {
          return idxB - idxA;
        }
      }

      return 0;
    });

    return candidates;
  }

  _getEntityDisplayMeta(entity) {
    const paperInst = this._getPaper();
    const layerId = String(entity.data?.layerId || '0');
    const layer = this.utils.layerManager?.layers?.get(layerId);

    const layerName = layer
      ? ((layer.id === '0' && layer.name === '0') ? 'Capa 0' : layer.name)
      : `Capa ${layerId}`;

    let fallbackType = 'Entidad';
    if (entity.data?.isPointEntity) fallbackType = 'Punto';
    else if (entity.data?.isCircleEntity) fallbackType = 'Círculo';
    else if (paperInst && entity instanceof paperInst.Raster) fallbackType = 'Imagen';
    else if (paperInst && entity instanceof paperInst.CompoundPath) fallbackType = 'Trazado compuesto';
    else if (paperInst && entity instanceof paperInst.Path) {
      fallbackType = entity.segments?.length === 2 && !entity.closed ? 'Línea' : 'Curva';
    }

    const name = entity.data?.name || entity.name || fallbackType;
    const color = this.utils.propertyManager?.getResolvedColor(entity)
      || layer?.color
      || entity.strokeColor?.toCSS?.(true)
      || '#e4e4e7';

    return { name, layerName, color };
  }

  open(nativeEvent, hits, onSelect) {
    this.close();
    if (!hits || hits.length === 0) return;

    this.activeHits = hits;
    this.onSelectCallback = onSelect;
    this.wasDismissedRecently = false;

    const menu = document.createElement('div');
    menu.className = 'bg-[#17171c] border border-[#27272a] rounded shadow-2xl py-1 min-w-[190px] max-w-[280px] select-none text-zinc-200';
    menu.style.position = 'fixed';
    menu.style.zIndex = '99999';
    menu.style.fontFamily = "'Inter', sans-serif";

    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((evtName) => {
      menu.addEventListener(evtName, (e) => e.stopPropagation());
    });

    const header = document.createElement('div');
    header.className = 'px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-[#27272a]';
    header.textContent = 'Seleccionar objeto';
    menu.appendChild(header);

    hits.forEach((hit) => {
      const { entity } = hit;
      const { name, layerName, color } = this._getEntityDisplayMeta(entity);

      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] text-zinc-200 hover:bg-[#27272a] focus:bg-[#27272a] outline-none cursor-pointer transition-colors';
      row.style.fontFamily = "'Inter', sans-serif";

      row.innerHTML = `
        <span class="flex items-center gap-2 min-w-0">
          <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background-color: ${color}"></span>
          <span class="truncate font-medium">${name}</span>
        </span>
        <span class="text-[10px] text-zinc-500 truncate shrink-0">${layerName}</span>
      `;

      let isRowHovered = false;

      row.addEventListener('mouseenter', () => {
        isRowHovered = true;
        this._previewEntity(entity);
      });

      row.addEventListener('mouseleave', () => {
        isRowHovered = false;
      });

      row.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        if (isRowHovered) {
          this._selectHit(hit);
        }
      });

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectHit(hit);
      });

      menu.appendChild(row);
    });

    document.body.appendChild(menu);
    this.menuEl = menu;

    const clientX = nativeEvent?.clientX ?? 0;
    const clientY = nativeEvent?.clientY ?? 0;
    const rect = menu.getBoundingClientRect();
    const margin = 8;

    const left = Math.min(clientX + 10, Math.max(margin, window.innerWidth - rect.width - margin));
    const top = Math.min(clientY + 10, Math.max(margin, window.innerHeight - rect.height - margin));

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    this._previewEntity(hits[0].entity);

    document.addEventListener('pointerdown', this._onDocPointerDown, true);
  }

  _previewEntity(entity) {
    if (!entity) return;
    if (this.service.hoveredEntity !== entity) {
      this.utils.clearHoverHighlight();
      this.service.hoveredEntity = entity;
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      const paperInst = this._getPaper();
      if (paperInst?.view) {
        paperInst.view.update();
      }
    }
  }

  _handleDocPointerDown(e) {
    if (this.menuEl && !this.menuEl.contains(e.target)) {
      this.close();
      this.wasDismissedRecently = true;
      setTimeout(() => {
        this.wasDismissedRecently = false;
      }, 0);
    }
  }

  _selectHit(hit) {
    const callback = this.onSelectCallback;
    if (!callback) return;

    this.close();
    callback(hit);
  }

  close() {
    document.removeEventListener('pointerdown', this._onDocPointerDown, true);

    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }

    this.activeHits = [];
    this.onSelectCallback = null;

    if (this.service.hoveredEntity) {
      this.utils.clearHoverHighlight();
      this.utils.selectionRenderEngine.updateEntitiesStroke();
      const paperInst = this._getPaper();
      if (paperInst?.view) {
        paperInst.view.update();
      }
    }
  }

  cleanup() {
    this.close();
  }
}