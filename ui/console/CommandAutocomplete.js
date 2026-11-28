/**
 * ui/console/CommandAutocomplete.js - Predictivo de comandos y herramientas para consola CAD
 */
import { CAD_CATALOG, normalizeCommandKey } from '../../config/cadCatalog.js';

export class CommandAutocomplete {
  constructor({
    fixedUI,
    floatingUI,
    canShow = () => true,
    onExecute = () => {},
    maxItems = 8
  } = {}) {
    this.fixedUI = fixedUI;
    this.floatingUI = floatingUI;
    this.canShow = canShow;
    this.onExecute = onExecute;
    this.maxItems = maxItems;

    this.items = [];
    this.selectedIndex = -1;
    this.hasUserNavigated = false;
    this.activeInput = null;
    this.isOpen = false;

    this.catalogEntries = this._buildCatalogEntries();

    this._onInput = this._handleInput.bind(this);
    this._onBlur = this._handleBlur.bind(this);
    this._onDocPointerDown = this._handleDocPointerDown.bind(this);
    this._onViewportChange = this._handleViewportChange.bind(this);
    this._onListMouseDown = this._handleListMouseDown.bind(this);
    this._onListMouseMove = this._handleListMouseMove.bind(this);

    this._createPopover();
    this._bindEvents();
  }

  _buildCatalogEntries() {
    const entries = [];

    for (const [id, tool] of Object.entries(CAD_CATALOG.tools || {})) {
      if (!tool?.displayName) continue;
      entries.push({
        id,
        kind: 'tool',
        kindLabel: 'Herramienta',
        displayName: tool.displayName,
        normName: normalizeCommandKey(tool.displayName),
        aliases: (tool.aliases || []).map((a) => normalizeCommandKey(a)).filter(Boolean)
      });
    }

    for (const [id, cmd] of Object.entries(CAD_CATALOG.commands || {})) {
      if (!cmd?.displayName) continue;
      entries.push({
        id,
        kind: 'command',
        kindLabel: 'Comando',
        displayName: cmd.displayName,
        normName: normalizeCommandKey(cmd.displayName),
        aliases: (cmd.aliases || []).map((a) => normalizeCommandKey(a)).filter(Boolean)
      });
    }

    return entries;
  }

  _createPopover() {
    const existing = document.getElementById('cmdAutocompletePopover');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'cmdAutocompletePopover';
    el.className = 'cad-console-autocomplete hidden';
    el.setAttribute('role', 'listbox');
    document.body.appendChild(el);
    this.popover = el;
  }

  _bindEvents() {
    [this.fixedUI?.input, this.floatingUI?.input].forEach((input) => {
      if (!input) return;
      input.addEventListener('input', this._onInput);
      input.addEventListener('blur', this._onBlur);
    });

    this.popover?.addEventListener('mousedown', this._onListMouseDown);
    this.popover?.addEventListener('mousemove', this._onListMouseMove);
    document.addEventListener('pointerdown', this._onDocPointerDown, true);
    window.addEventListener('resize', this._onViewportChange);
  }

  _handleInput(e) {
    const input = e.currentTarget;
    this.activeInput = input;
    this.update(input.value, input);
  }

  _handleBlur() {
    setTimeout(() => {
      const active = document.activeElement;
      if (active !== this.fixedUI?.input && active !== this.floatingUI?.input) {
        this.close();
      }
    }, 100);
  }

  _handleDocPointerDown(e) {
    if (!this.isOpen) return;
    if (this.popover?.contains(e.target)) return;
    if (e.target === this.fixedUI?.input || e.target === this.floatingUI?.input) return;
    this.close();
  }

  _handleViewportChange() {
    if (this.isOpen && this.activeInput) {
      this._positionPopover(this.activeInput);
    }
  }

  _handleListMouseMove(e) {
    const row = e.target?.closest?.('[data-ac-index]');
    if (!row) return;
    const idx = Number(row.getAttribute('data-ac-index'));
    if (!Number.isNaN(idx) && idx !== this.selectedIndex) {
      this.selectedIndex = idx;
      this.hasUserNavigated = true;
      this._syncActiveRow();
    }
  }

  _handleListMouseDown(e) {
    const row = e.target?.closest?.('[data-ac-index]');
    if (!row) return;
    if (typeof e.button === 'number' && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const idx = Number(row.getAttribute('data-ac-index'));
    const chosen = this.items[idx];
    if (!chosen) return;

    const commandText = chosen.displayName;
    this.close();
    this.onExecute(commandText);
  }

  _search(rawQuery) {
    const trimmed = String(rawQuery || '').trim();
    if (!trimmed || trimmed.includes(',') || trimmed.startsWith('@')) {
      return [];
    }

    const query = normalizeCommandKey(trimmed);
    if (!query) return [];

    const scored = [];

    for (const entry of this.catalogEntries) {
      let score = Infinity;
      let matchedAlias = null;

      if (entry.normName === query) {
        score = 0;
      } else if (entry.aliases.includes(query)) {
        score = 1;
        matchedAlias = query;
      } else if (entry.normName.startsWith(query)) {
        score = 2;
      } else {
        const prefixAlias = entry.aliases.find((a) => a.startsWith(query));
        if (prefixAlias) {
          score = 3;
          matchedAlias = prefixAlias;
        } else if (entry.normName.includes(query)) {
          score = 4;
        } else {
          const partialAlias = entry.aliases.find((a) => a.includes(query));
          if (partialAlias) {
            score = 5;
            matchedAlias = partialAlias;
          }
        }
      }

      if (score < Infinity) {
        const displayAlias = matchedAlias || entry.aliases[0] || '';
        scored.push({
          ...entry,
          score,
          displayAlias
        });
      }
    }

    scored.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.kind !== b.kind) return a.kind === 'tool' ? -1 : 1;
      return a.displayName.localeCompare(b.displayName, 'es');
    });

    return scored.slice(0, this.maxItems);
  }

  update(rawValue, inputEl = null) {
    if (!this.canShow()) {
      this.close();
      return;
    }

    const matches = this._search(rawValue);
    if (matches.length === 0) {
      this.close();
      return;
    }

    this.items = matches;
    this.selectedIndex = 0;
    this.hasUserNavigated = false;
    this.isOpen = true;

    this._renderItems();
    this.popover.classList.remove('hidden');
    this._positionPopover(inputEl || this.activeInput || this.fixedUI?.input);
  }

  _renderItems() {
    if (!this.popover) return;

    this.popover.innerHTML = this.items
      .map((item, idx) => {
        const activeClass = idx === this.selectedIndex ? ' is-active' : '';
        const aliasHtml = item.displayAlias
          ? `<span class="cad-console-autocomplete__alias">${this._escapeHtml(item.displayAlias)}</span>`
          : '';
        return `
          <div class="cad-console-autocomplete__item${activeClass}" role="option" data-ac-index="${idx}">
            <div class="cad-console-autocomplete__left">
              <span class="cad-console-autocomplete__name">${this._escapeHtml(item.displayName)}</span>
              ${aliasHtml}
            </div>
            <span class="cad-console-autocomplete__badge">${this._escapeHtml(item.kindLabel)}</span>
          </div>
        `;
      })
      .join('');
  }

  _syncActiveRow() {
    if (!this.popover) return;
    const rows = this.popover.querySelectorAll('[data-ac-index]');
    rows.forEach((row) => {
      const idx = Number(row.getAttribute('data-ac-index'));
      row.classList.toggle('is-active', idx === this.selectedIndex);
      if (idx === this.selectedIndex) {
        row.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  _positionPopover(inputEl) {
    if (!this.popover || !inputEl) return;

    const isFloating = inputEl === this.floatingUI?.input;
    const anchor = isFloating
      ? (this.floatingUI?.inputWrapper || inputEl)
      : (this.fixedUI?.inputWrapper || inputEl);

    const rect = anchor.getBoundingClientRect();
    const width = Math.max(240, Math.min(rect.width, 460));
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const left = Math.max(8, Math.min(rect.left, maxLeft));

    this.popover.style.width = `${width}px`;
    this.popover.style.left = `${left}px`;

    const popHeight = this.popover.offsetHeight || 180;
    const spaceAbove = rect.top - 8;
    const spaceBelow = window.innerHeight - rect.bottom - 8;

    const openUpward = !isFloating || (spaceBelow < popHeight && spaceAbove >= spaceBelow);

    if (openUpward) {
      this.popover.style.top = 'auto';
      this.popover.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 4)}px`;
    } else {
      this.popover.style.bottom = 'auto';
      this.popover.style.top = `${Math.max(8, rect.bottom + 4)}px`;
    }
  }

  _applyCompletion(text, inputEl) {
    const target = inputEl || this.activeInput;
    if (this.fixedUI?.input) this.fixedUI.input.value = text;
    if (this.floatingUI?.input) this.floatingUI.input.value = text;

    if (target) {
      const len = text.length;
      try {
        target.setSelectionRange(len, len);
      } catch (_) {}
    }
  }

  handleKeyDown(e) {
    if (!this.isOpen || this.items.length === 0) return false;

    const input = e.currentTarget || this.activeInput;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
      this.hasUserNavigated = true;
      this._syncActiveRow();
      return true;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
      this.hasUserNavigated = true;
      this._syncActiveRow();
      return true;
    }

    if (e.key === 'Tab') {
      const chosen = this.items[this.selectedIndex] || this.items[0];
      if (!chosen) return false;
      e.preventDefault();
      e.stopPropagation();
      this._applyCompletion(chosen.displayName, input);
      this.close();
      return true;
    }

    if (e.key === 'ArrowRight') {
      const atEnd =
        !input ||
        (input.selectionStart === input.value.length && input.selectionEnd === input.value.length);
      if (!atEnd) return false;

      const chosen = this.items[this.selectedIndex] || this.items[0];
      if (!chosen) return false;

      e.preventDefault();
      e.stopPropagation();
      this._applyCompletion(chosen.displayName, input);
      this.close();
      return true;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return true;
    }

    if (e.key === 'Enter') {
      const chosen = this.items[this.selectedIndex] || this.items[0];
      if (chosen) {
        e.preventDefault();
        e.stopPropagation();
        const commandText = chosen.displayName;
        this.close();
        this.onExecute(commandText);
        return true;
      }
      this.close();
      return false;
    }

    return false;
  }

  close() {
    this.isOpen = false;
    this.items = [];
    this.selectedIndex = -1;
    this.hasUserNavigated = false;
    this.popover?.classList.add('hidden');
  }

  _escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  destroy() {
    this.close();
    [this.fixedUI?.input, this.floatingUI?.input].forEach((input) => {
      if (!input) return;
      input.removeEventListener('input', this._onInput);
      input.removeEventListener('blur', this._onBlur);
    });

    this.popover?.removeEventListener('mousedown', this._onListMouseDown);
    this.popover?.removeEventListener('mousemove', this._onListMouseMove);
    document.removeEventListener('pointerdown', this._onDocPointerDown, true);
    window.removeEventListener('resize', this._onViewportChange);
    this.popover?.remove();
    this.popover = null;
  }
}   