/**
 * tools/select/SelectionMenuPopover.js - Componente DOM del menú flotante de selección
 */

export class SelectionMenuPopover {
  constructor() {
    this.menuEl = null;
    this.wasDismissedRecently = false;
    this._onDocPointerDown = this._handleDocPointerDown.bind(this);
  }

  isOpen() {
    return Boolean(this.menuEl && this.menuEl.isConnected);
  }

  open(nativeEvent, items, { title = 'Seleccionar objeto', onHover, onSelect, onDismiss } = {}) {
    this.close();
    if (!items || items.length === 0) return;

    this._onDismissCallback = onDismiss || null;
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
    header.textContent = title;
    menu.appendChild(header);

    items.forEach((item) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] text-zinc-200 hover:bg-[#27272a] focus:bg-[#27272a] outline-none cursor-pointer transition-colors';
      row.style.fontFamily = "'Inter', sans-serif";

      const nameClasses = item.isSelected
        ? 'truncate font-bold text-white'
        : 'truncate font-normal text-zinc-300';
      const sublabelClasses = item.isSelected
        ? 'text-[10px] font-semibold text-zinc-400 truncate shrink-0'
        : 'text-[10px] text-zinc-500 truncate shrink-0';

      row.innerHTML = `
        <span class="flex items-center gap-2 min-w-0">
          <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background-color: ${item.color}"></span>
          <span class="${nameClasses}">${item.name}</span>
        </span>
        <span class="${sublabelClasses}">${item.sublabel}</span>
      `;

      let isRowHovered = false;

      row.addEventListener('mouseenter', () => {
        isRowHovered = true;
        if (typeof onHover === 'function') onHover(item.raw);
      });

      row.addEventListener('mouseleave', () => {
        isRowHovered = false;
      });

      row.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        if (isRowHovered && typeof onSelect === 'function') {
          onSelect(item.raw);
        }
      });

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof onSelect === 'function') {
          onSelect(item.raw);
        }
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

    if (typeof onHover === 'function') {
      onHover(items[0].raw);
    }

    document.addEventListener('pointerdown', this._onDocPointerDown, true);
  }

  _handleDocPointerDown(e) {
    if (this.menuEl && !this.menuEl.contains(e.target)) {
      const dismissCb = this._onDismissCallback;
      this.close();
      this.wasDismissedRecently = true;
      setTimeout(() => {
        this.wasDismissedRecently = false;
      }, 0);
      if (typeof dismissCb === 'function') {
        dismissCb();
      }
    }
  }

  close() {
    document.removeEventListener('pointerdown', this._onDocPointerDown, true);
    this._onDismissCallback = null;

    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
  }
}