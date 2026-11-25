/**
 * SelectionMenuHandler.js - Detección con prioridad por capas y menú flotante tipo Rhino 3D.
 */

import { SelectionMenuPopover } from './SelectionMenuPopover.js';

export class SelectionMenuHandler {
  constructor(cadService, cadUtils) {
    if (!cadService || !cadUtils) {
      throw new Error('SelectionMenuHandler requiere cadService y cadUtils.');
    }

    this.service = cadService;
    this.utils = cadUtils;
    this.popover = new SelectionMenuPopover();
    this.activeHits = [];
    this.onSelectCallback = null;
    this._openTimer = null;
    this._pendingMenu = null;
  }

  get wasDismissedRecently() {
    return this.popover.wasDismissedRecently;
  }

  set wasDismissedRecently(val) {
    this.popover.wasDismissedRecently = Boolean(val);
  }

  isOpen() {
    return this.popover.isOpen();
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
        if (!root || root.visible === false) return false;

        const layerManager = this.utils.layerManager;
        if (layerManager && !layerManager.isEntityInteractive(root)) return false;
        if (!layerManager && (root.data?.isHidden || root.data?.isLocked)) return false;

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

      if (rankA !== rankB) return rankA - rankB;

      const isPointA = Boolean(a.entity.data?.isPointEntity);
      const isPointB = Boolean(b.entity.data?.isPointEntity);
      if (isPointA !== isPointB) return isPointA ? -1 : 1;

      if (a.entity.parent && a.entity.parent === b.entity.parent) {
        const idxA = typeof a.entity.index === 'number' ? a.entity.index : -1;
        const idxB = typeof b.entity.index === 'number' ? b.entity.index : -1;
        if (idxA !== idxB) return idxB - idxA;
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

    return { name, sublabel: layerName, color };
  }

  open(nativeEvent, hits, onSelect, options = {}) {
    this.close();
    if (!hits || hits.length === 0) return;

    this.activeHits = hits;
    this.onSelectCallback = onSelect;

    const items = hits.map((hit) => {
      if (hit.label) {
        return {
          raw: hit,
          name: hit.label,
          sublabel: hit.sublabel || '',
          color: hit.color || '#e4e4e7',
          isSelected: Boolean(hit.isSelected)
        };
      }
      if (hit.entity) {
        const isSelected = Boolean(
          hit.isSelected ?? this.service.selectedEntities?.includes(hit.entity)
        );
        return { raw: hit, ...this._getEntityDisplayMeta(hit.entity), isSelected };
      }
      return { raw: hit, name: 'Elemento', sublabel: '', color: '#e4e4e7', isSelected: false };
    });

    this.popover.open(nativeEvent, items, {
      title: options.title || 'Seleccionar objeto',
      onHover: (rawHit) => this._previewHit(rawHit),
      onSelect: (rawHit) => this._selectHit(rawHit),
      onDismiss: () => this._clearPreviews()
    });
  }

  _previewHit(hit) {
    if (!hit) return;

    if (typeof hit.onPreview === 'function') {
      if (this.service.hoveredEntity) {
        this.utils.clearHoverHighlight();
        this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
      }
      hit.onPreview();
      const paperInst = this._getPaper();
      if (paperInst?.view) paperInst.view.update();
      return;
    }

    if (hit.entity) {
      if (this.utils.hoveredHandle || this.utils.hoveredCurve) {
        this.utils.hoveredHandle = null;
        this.utils.hoveredCurve = null;
        this.utils.selectionRenderEngine?.renderBezierHandles?.();
      }
      if (this.service.hoveredEntity !== hit.entity) {
        this.utils.clearHoverHighlight();
        this.service.hoveredEntity = hit.entity;
        this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
        const paperInst = this._getPaper();
        if (paperInst?.view) paperInst.view.update();
      }
    }
  }

  _clearPreviews() {
    let needsViewUpdate = false;

    if (this.service.hoveredEntity) {
      this.utils.clearHoverHighlight();
      this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
      needsViewUpdate = true;
    }

    if (this.utils.hoveredHandle || this.utils.hoveredCurve) {
      this.utils.hoveredHandle = null;
      this.utils.hoveredCurve = null;
      this.utils.selectionRenderEngine?.renderBezierHandles?.();
      needsViewUpdate = true;
    }

    if (needsViewUpdate) {
      const paperInst = this._getPaper();
      if (paperInst?.view) paperInst.view.update();
    }
  }

  handleHover(point, zoom) {
    const hits = this.getSortedHits(point, 6 / zoom);
    const targetItem = hits.length > 0 ? hits[0].entity : null;

    if (targetItem) {
      const isEditingOrSelected =
        this.service.editingEntities.includes(targetItem) ||
        this.service.selectedEntities.includes(targetItem);

      if (!isEditingOrSelected) {
        if (this.service.hoveredEntity !== targetItem) {
          this.utils.clearHoverHighlight();
          this.service.hoveredEntity = targetItem;
          this.utils.selectionRenderEngine?.updateEntitiesStroke?.();
        }
      } else if (this.service.hoveredEntity) {
        this.utils.clearHoverHighlight();
      }
    } else if (this.service.hoveredEntity) {
      this.utils.clearHoverHighlight();
    }
  }

  _selectHit(hit) {
    const callback = this.onSelectCallback;
    if (!callback) return;

    this.close();
    callback(hit);
  }

  setPendingMenu(menuData, onSelect) {
    this._pendingMenu = menuData ? { menuData, onSelect } : null;
  }

  clearPendingMenu() {
    this._pendingMenu = null;
  }

  consumePendingMenu(hadConfirmedDrag) {
    const pending = !hadConfirmedDrag ? this._pendingMenu : null;
    this._pendingMenu = null;
    return pending;
  }

  hasScheduledOpen() {
    return Boolean(this._openTimer);
  }

  cancelScheduledOpen() {
    if (this._openTimer) {
      clearTimeout(this._openTimer);
      this._openTimer = null;
    }
  }

  scheduleOpen(delayMs, menuData, onSelect, shouldAbort = null) {
    this.cancelScheduledOpen();
    if (!menuData) return;

    this._openTimer = setTimeout(() => {
      this._openTimer = null;
      if (typeof shouldAbort === 'function' && shouldAbort()) return;

      const { event: menuEvent, hits, point, shift, options } = menuData;
      this.open(menuEvent, hits, (chosenHit) => {
        if (typeof onSelect === 'function') {
          onSelect(chosenHit, point, shift);
        }
      }, options);
    }, delayMs);
  }

  close() {
    this.cancelScheduledOpen();
    this.clearPendingMenu();
    this.popover.close();
    this.activeHits = [];
    this.onSelectCallback = null;
    this._clearPreviews();
  }

  cleanup() {
    this.close();
  }
}