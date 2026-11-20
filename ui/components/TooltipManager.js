/**
 * ui/components/TooltipManager.js - Gestor global de tooltips flotantes (capa superior)
 */
export class TooltipManager {
  constructor(mountNode = document.body) {
    this.mountNode = mountNode;
    this.activeTarget = null;
    this._currentRawText = null;
    this.gap = 6;
    this.viewportPadding = 6;

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'cad-floating-tooltip';
    this.tooltipEl.setAttribute('role', 'tooltip');
    this.mountNode.appendChild(this.tooltipEl);

    this._onPointerOver = this._handlePointerOver.bind(this);
    this._onPointerOut = this._handlePointerOut.bind(this);
    this._onPointerDown = this._handleHide.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onScroll = this._handleHide.bind(this);
    this._onWindowBlur = this._handleHide.bind(this);

    this._attrObserver = new MutationObserver(() => {
      if (!this.activeTarget) return;
      if (!this.activeTarget.isConnected) {
        this.hide();
        return;
      }
      const nextText = this.activeTarget.getAttribute('data-tooltip');
      if (!nextText) {
        this.hide();
        return;
      }
      this._syncAlignment(this.activeTarget);
      if (this._currentRawText !== nextText) {
        this._currentRawText = nextText;
        this._renderContent(nextText);
      }
      this._positionTooltip(this.activeTarget);
    });

    this._bindEvents();
  }

  _syncAlignment(target) {
    const isLeft = target.classList.contains('tooltip-align-left');
    const isRight = !isLeft && target.classList.contains('tooltip-align-right');
    this.tooltipEl.classList.toggle('align-left', isLeft);
    this.tooltipEl.classList.toggle('align-right', isRight);
  }

  _bindEvents() {
    document.addEventListener('pointerover', this._onPointerOver, true);
    document.addEventListener('pointerout', this._onPointerOut, true);
    document.addEventListener('pointerdown', this._onPointerDown, true);
    document.addEventListener('keydown', this._onKeyDown, true);
    document.addEventListener('scroll', this._onScroll, true);
    window.addEventListener('blur', this._onWindowBlur);
  }

  _handlePointerOver(e) {
    if (!(e.target instanceof Element)) return;
    const target = e.target.closest('[data-tooltip]');
    if (!target || target === this.activeTarget) return;

    const text = target.getAttribute('data-tooltip');
    if (!text) return;

    this.show(target, text);
  }

  _handlePointerOut(e) {
    if (!this.activeTarget) return;
    const related = e.relatedTarget instanceof Node ? e.relatedTarget : null;
    if (related && this.activeTarget.contains(related)) return;

    const relatedEl = related instanceof Element ? related : (related ? related.parentElement : null);
    const nextTarget = relatedEl ? relatedEl.closest('[data-tooltip]') : null;
    if (nextTarget && nextTarget !== this.activeTarget) {
      const text = nextTarget.getAttribute('data-tooltip');
      if (text) {
        this.show(nextTarget, text);
        return;
      }
    }

    this.hide();
  }

  _handleKeyDown(e) {
    if (e.key === 'Escape') {
      this.hide();
    }
  }

  _handleHide() {
    if (this.activeTarget) {
      this.hide();
    }
  }

  show(target, text) {
    this.activeTarget = target;
    this._currentRawText = text;
    this._syncAlignment(target);
    this._renderContent(text);
    this.tooltipEl.classList.add('visible');

    this._attrObserver.disconnect();
    this._attrObserver.observe(target, {
      attributes: true,
      attributeFilter: ['data-tooltip', 'class']
    });

    this._positionTooltip(target);
  }

  hide() {
    this.activeTarget = null;
    this._currentRawText = null;
    this._attrObserver.disconnect();
    this.tooltipEl.classList.remove('visible');
  }

  _positionTooltip(target) {
    const rect = target.getBoundingClientRect();
    const tipRect = this.tooltipEl.getBoundingClientRect();
    const gap = this.gap;
    const pad = this.viewportPadding;

    let left = rect.right + gap;
    let top = rect.top + (rect.height - tipRect.height) / 2;

    const isBottom = target.classList.contains('tooltip-bottom');
    const isBottomRight = target.classList.contains('tooltip-bottom-right');
    const isTop = target.classList.contains('tooltip-top');
    const isTopLeft = target.classList.contains('tooltip-top-left');
    const isTopRight = target.classList.contains('tooltip-top-right');
    const isRightDock = Boolean(target.closest('.dock-right, .dock-panel-left'));

    if (isBottom) {
      top = rect.bottom + gap;
      left = rect.left + (rect.width - tipRect.width) / 2;
    } else if (isBottomRight) {
      top = rect.bottom + gap;
      left = rect.right - tipRect.width;
    } else if (isTop) {
      top = rect.top - tipRect.height - gap;
      left = rect.left + (rect.width - tipRect.width) / 2;
    } else if (isTopLeft) {
      top = rect.top - tipRect.height - gap;
      left = rect.left;
    } else if (isTopRight) {
      top = rect.top - tipRect.height - gap;
      left = rect.right - tipRect.width;
    } else if (isRightDock) {
      left = rect.left - tipRect.width - gap;
      top = rect.top + (rect.height - tipRect.height) / 2;
    }

    const maxLeft = window.innerWidth - tipRect.width - pad;
    const maxTop = window.innerHeight - tipRect.height - pad;
    left = Math.max(pad, Math.min(left, maxLeft));
    top = Math.max(pad, Math.min(top, maxTop));

    this.tooltipEl.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }

  _renderContent(rawText) {
    this.tooltipEl.replaceChildren();

    const lines = String(rawText).split(/\r?\n|\\n/);
    const tokenRegex = /<span\b([^>]*)><\/span>|<span\b([^>]*)\/>|\{icon:([a-zA-Z0-9:_-]+)\}/gi;

    for (const line of lines) {
      const lineEl = document.createElement('div');
      lineEl.className = 'cad-tooltip-line';

      if (line.length === 0) {
        lineEl.textContent = '\u00A0';
        this.tooltipEl.appendChild(lineEl);
        continue;
      }

      let lastIndex = 0;
      tokenRegex.lastIndex = 0;
      let match;

      while ((match = tokenRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          lineEl.appendChild(document.createTextNode(line.slice(lastIndex, match.index)));
        }

        const rawSpanAttrs = match[1] !== undefined ? match[1] : match[2];
        const shorthandIcon = match[3];

        if (rawSpanAttrs !== undefined) {
          const iconAttrMatch = rawSpanAttrs.match(/\bdata-icon\s*=\s*["']([^"']+)["']/i);
          if (iconAttrMatch) {
            const classAttrMatch = rawSpanAttrs.match(/\bclass\s*=\s*["']([^"']+)["']/i);
            const iconSpan = document.createElement('span');
            iconSpan.className = classAttrMatch ? classAttrMatch[1] : 'iconify';
            iconSpan.setAttribute('data-icon', iconAttrMatch[1]);
            lineEl.appendChild(iconSpan);
          } else {
            lineEl.appendChild(document.createTextNode(match[0]));
          }
        } else if (shorthandIcon) {
          const iconSpan = document.createElement('span');
          iconSpan.className = 'iconify';
          iconSpan.setAttribute('data-icon', shorthandIcon);
          lineEl.appendChild(iconSpan);
        }

        lastIndex = tokenRegex.lastIndex;
      }

      if (lastIndex < line.length) {
        lineEl.appendChild(document.createTextNode(line.slice(lastIndex)));
      }

      this.tooltipEl.appendChild(lineEl);
    }
  }

  cleanup() {
    this.hide();
    document.removeEventListener('pointerover', this._onPointerOver, true);
    document.removeEventListener('pointerout', this._onPointerOut, true);
    document.removeEventListener('pointerdown', this._onPointerDown, true);
    document.removeEventListener('keydown', this._onKeyDown, true);
    document.removeEventListener('scroll', this._onScroll, true);
    window.removeEventListener('blur', this._onWindowBlur);

    if (this.tooltipEl && this.tooltipEl.parentNode) {
      this.tooltipEl.parentNode.removeChild(this.tooltipEl);
    }
    this.tooltipEl = null;
  }
}