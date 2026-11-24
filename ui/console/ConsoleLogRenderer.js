/**
 * ui/console/ConsoleLogRenderer.js - Renderizador y formateador espejado de logs y prompts CAD
 */
export class ConsoleLogRenderer {
  constructor(fixedUI, floatingUI, { getCommandTag = null, onStateChange = null, onFocusRequest = null } = {}) {
    this.fixedUI = fixedUI;
    this.floatingUI = floatingUI;
    this.getCommandTag = getCommandTag;
    this.onStateChange = onStateChange;
    this.onFocusRequest = onFocusRequest;

    this.currentPromptText = 'Comando:';
    this.currentPromptHtml = 'Comando:';
    this._activeGroups = { fixed: null, floating: null };
    this._activeCompacts = { fixed: null, floating: null };
    this._scrollRafId = null;

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        [this.fixedUI?.logArea, this.floatingUI?.log].forEach((el) => {
          if (!el) return;
          const isAtTopOrBottom = el.scrollTop === 0 || (el.scrollHeight - el.scrollTop - el.clientHeight) < 40;
          if (isAtTopOrBottom) {
            el.scrollTop = el.scrollHeight;
          }
        });
      });
      if (this.fixedUI?.logArea) this._resizeObserver.observe(this.fixedUI.logArea);
      if (this.floatingUI?.log) this._resizeObserver.observe(this.floatingUI.log);
    }
  }

  scrollToBottom() {
    const applyScroll = () => {
      if (this.fixedUI?.logArea) {
        this.fixedUI.logArea.scrollTop = this.fixedUI.logArea.scrollHeight;
      }
      if (this.floatingUI?.log) {
        this.floatingUI.log.scrollTop = this.floatingUI.log.scrollHeight;
      }
    };

    applyScroll();

    if (this._scrollRafId) cancelAnimationFrame(this._scrollRafId);
    this._scrollRafId = requestAnimationFrame(() => {
      applyScroll();
      this._scrollRafId = null;
    });
  }

  hasActiveCommandGroup() {
    return Boolean(this._activeGroups.fixed || this._activeGroups.floating);
  }

  hasActiveCompactBlock() {
    return Boolean(this._activeCompacts.fixed || this._activeCompacts.floating);
  }

  _createGroupElement(className = 'cad-console-group') {
    const group = document.createElement('div');
    group.className = className;
    return group;
  }

  beginCommandGroup() {
    this.endCommandGroup();
    this.endCompactBlock();

    if (this.fixedUI?.logArea) {
      const group = this._createGroupElement('cad-console-group');
      this.fixedUI.logArea.appendChild(group);
      this._activeGroups.fixed = group;
    }
    if (this.floatingUI?.log) {
      const group = this._createGroupElement('cad-console-group');
      this.floatingUI.log.appendChild(group);
      this._activeGroups.floating = group;
    }
  }

  endCommandGroup() {
    if (this._activeGroups.fixed && this._activeGroups.fixed.children.length === 0) {
      this._activeGroups.fixed.remove();
    }
    if (this._activeGroups.floating && this._activeGroups.floating.children.length === 0) {
      this._activeGroups.floating.remove();
    }
    this._activeGroups.fixed = null;
    this._activeGroups.floating = null;
  }

  beginCompactBlock() {
    this.endCommandGroup();
    this.endCompactBlock();

    if (this.fixedUI?.logArea) {
      const block = this._createGroupElement('cad-console-compact');
      this.fixedUI.logArea.appendChild(block);
      this._activeCompacts.fixed = block;
    }
    if (this.floatingUI?.log) {
      const block = this._createGroupElement('cad-console-compact');
      this.floatingUI.log.appendChild(block);
      this._activeCompacts.floating = block;
    }
  }

  endCompactBlock() {
    if (this._activeCompacts.fixed && this._activeCompacts.fixed.children.length === 0) {
      this._activeCompacts.fixed.remove();
    }
    if (this._activeCompacts.floating && this._activeCompacts.floating.children.length === 0) {
      this._activeCompacts.floating.remove();
    }
    this._activeCompacts.fixed = null;
    this._activeCompacts.floating = null;
  }

  escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  formatOptionHtml(opt, interactive = true) {
    const label = String(opt.label || '');
    const key = String(opt.key || '');
    const idx = key ? label.toLowerCase().indexOf(key.toLowerCase()) : -1;

    let labelHtml;
    if (idx >= 0) {
      const before = this.escapeHtml(label.slice(0, idx));
      const match = this.escapeHtml(label.slice(idx, idx + key.length));
      const after = this.escapeHtml(label.slice(idx + key.length));
      labelHtml = `${before}<u class="decoration-1 underline-offset-2">${match}</u>${after}`;
    } else {
      labelHtml = `<u class="decoration-1 underline-offset-2">${this.escapeHtml(key)}</u> - ${this.escapeHtml(label)}`;
    }

    if (!interactive) {
      return `<span>[${labelHtml}]</span>`;
    }

    const activeClass = opt.active ? ' active' : '';
    return `<span class="cmd-option group cursor-pointer select-none${activeClass}" data-cmd="${this.escapeHtml(key)}">[<span class="group-hover:underline decoration-1 underline-offset-2">${labelHtml}</span>]</span>`;
  }

  setPrompt(text) {
    const formatted = text || 'Comando:';
    this.currentPromptText = formatted;
    this.currentPromptHtml = this.escapeHtml(formatted);

    const nextState = (formatted === 'Comando:' || formatted === 'Command:') ? 'IDLE' : 'COMMAND_ACTIVE';
    this.onStateChange?.(nextState);

    this.fixedUI?.setPrompt(formatted);
    this.floatingUI?.setPrompt(formatted);
  }

  setStepPrompt(instruction, { defaultValue = null, options = [] } = {}) {
    const tag = this.getCommandTag ? this.getCommandTag() : '';
    const tagPrefix = tag ? `${tag} ` : '';
    const hasDefault = defaultValue !== null && defaultValue !== undefined && defaultValue !== '';

    const plainDefault = hasDefault ? ` <${defaultValue}>` : '';
    const plainOptions = options.length > 0
      ? ' ' + options.map((opt) => `[${opt.label}]`).join('')
      : '';
    const plainFull = `${tagPrefix}${instruction}${plainDefault}${plainOptions}:`;

    const htmlDefault = hasDefault ? ` &lt;${this.escapeHtml(defaultValue)}&gt;` : '';
    const htmlOptionsStatic = options.length > 0
      ? ' ' + options.map((opt) => this.formatOptionHtml(opt, false)).join('')
      : '';

    this.currentPromptText = plainFull;
    this.currentPromptHtml = `${this.escapeHtml(tagPrefix)}${this.escapeHtml(instruction)}${htmlDefault}${htmlOptionsStatic}:`;
    this.onStateChange?.('COMMAND_ACTIVE');

    if (options.length > 0) {
      const htmlOptionsInteractive = ' ' + options.map((opt) => this.formatOptionHtml(opt, true)).join('');
      const htmlFullInteractive = `${this.escapeHtml(tagPrefix)}${this.escapeHtml(instruction)}${htmlDefault}${htmlOptionsInteractive}:`;
      this.fixedUI?.setPromptHtml(htmlFullInteractive);
      this.floatingUI?.setPromptHtml(htmlFullInteractive);
    } else {
      this.fixedUI?.setPrompt(plainFull);
      this.floatingUI?.setPrompt(plainFull);
    }

    this.onFocusRequest?.();
  }

  _appendEntry(type, content, { isHtml = false, grouped = true } = {}) {
    const targets = [
      {
        container: this.fixedUI?.logArea,
        group: this._activeGroups.fixed,
        compact: this._activeCompacts.fixed
      },
      {
        container: this.floatingUI?.log,
        group: this._activeGroups.floating,
        compact: this._activeCompacts.floating
      }
    ];

    targets.forEach(({ container, group, compact }) => {
      if (!container) return;

      const entry = document.createElement('div');
      entry.className = `cad-console-entry cad-console-entry--${type}`;
      if (isHtml) {
        entry.innerHTML = content;
      } else {
        entry.textContent = content;
      }

      if (grouped && group && group.parentElement === container) {
        group.appendChild(entry);
        group.classList.toggle('is-multiline', group.children.length > 1);
      } else if (grouped && compact && compact.parentElement === container) {
        compact.appendChild(entry);
      } else {
        container.appendChild(entry);
      }

      this.scrollToBottom();
    });
  }

  logUser(text, prefix = '', { grouped = true } = {}) {
    if (prefix) {
      const html = `<span class="text-zinc-400 font-normal">${this.escapeHtml(prefix)}</span><span class="text-white font-bold">${this.escapeHtml(text)}</span>`;
      this._appendEntry('interactive', html, { isHtml: true, grouped });
      return;
    }
    this._appendEntry('user', text, { isHtml: false, grouped });
  }

  logSystem(text, { grouped = true } = {}) {
    this._appendEntry('system', text, { isHtml: false, grouped });
  }

  logStepInput(valueText) {
    const formattedValue = String(valueText ?? '').replace(/,\s*(?=-?\d)/g, ', ');
    const promptPrefixHtml = this.currentPromptHtml ? `${this.currentPromptHtml} ` : '';
    const html = `<span class="text-zinc-400 font-normal">${promptPrefixHtml}</span><span class="text-white font-bold">${this.escapeHtml(formattedValue)}</span>`;
    this._appendEntry('interactive', html, { isHtml: true, grouped: true });
    }

  logResult(title, metricsSummary = '') {
    const suffix = metricsSummary ? `: ${metricsSummary}` : '';
    this.logSystem(`${title}${suffix}`);
  }

  logInteractive(htmlContent) {
    this._appendEntry('interactive', htmlContent, { isHtml: true, grouped: true });
  }

  showWelcomeMessage(htmlContent = null) {
    const html = htmlContent ||
      `<div class="pb-1 text-zinc-400 font-normal">Bienvenido a <span class="text-white font-bold">Carpincho</span> — ¡Todo listo, a divertirse dibujando!</div>`;
    this._appendEntry('interactive', html, { isHtml: true, grouped: false });
  }

  clear() {
    this.endCommandGroup();
    this.endCompactBlock();
    this.fixedUI?.clear();
    this.floatingUI?.clear();
  }
}