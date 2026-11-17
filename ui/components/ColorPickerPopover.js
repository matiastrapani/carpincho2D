/**
 * ui/components/ColorPickerPopover.js
 * Orquestador del popover selector de color con soporte RGB/HSL/HSB, muestras y scrubbing.
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { ColorMath } from './ColorMath.js';
import { ColorCanvasWidgets } from './ColorCanvasWidgets.js';
import { PropertyControls } from './PropertyControls.js';
import { ColorPickerTemplate } from './ColorPickerTemplate.js';
import { ColorPickerHistory } from './ColorPickerHistory.js';

export class ColorPickerPopover {
  static DEFAULT_PRESETS = [...CAD_THEME.properties.colorPresets];
  static _activeInstance = null;

  static getPresets() {
    return ColorPickerPopover.DEFAULT_PRESETS;
  }

  constructor({
    color = CAD_THEME.properties.customFallbackColor,
    opacity = 1.0,
    onChange,
    onChangeEnd,
    onCancel,
    onClose,
    anchorEl,
    presets = null
  }) {
    if (ColorPickerPopover._activeInstance && ColorPickerPopover._activeInstance !== this) {
      ColorPickerPopover._activeInstance.close(true);
    }
    ColorPickerPopover._activeInstance = this;

    this.onChange = onChange;
    this.onChangeEnd = onChangeEnd;
    this.onCancel = onCancel;
    this.onClose = onClose;
    this.anchorEl = anchorEl;
    this.presets = (presets && presets.length > 0) ? presets : ColorPickerPopover.DEFAULT_PRESETS;

    this.format = 'HEX';
    this.popoverEl = null;
    this.widgets = null;
    this._isClosing = false;

    const hsb = ColorMath.hexToHsb(color);
    this.h = hsb.h;
    this.s = hsb.s;
    this.b = hsb.b;
    this.a = Math.max(0, Math.min(1, opacity));

    this._initialState = {
      a: this.a,
      hex: ColorMath.hsbToHex(this.h, this.s, this.b)
    };
    this.history = new ColorPickerHistory({ h: this.h, s: this.s, b: this.b, a: this.a });

    this.colorChanged = false;
    this.opacityChanged = false;

    this.render();
  }

  render() {
    const rect = this.anchorEl ? this.anchorEl.getBoundingClientRect() : { top: 100, left: 100, bottom: 122 };
    const popover = document.createElement('div');
    popover.id = 'figmaColorPickerPopover';
    popover.className = 'fixed z-50 bg-[#1e1e24] border border-[#2a2a32] rounded-lg shadow-2xl p-3 w-[260px] text-zinc-300 font-sans text-xs flex flex-col gap-2.5 select-none';

    const topPos = Math.min(rect.bottom + 6, window.innerHeight - 410);
    const leftPos = Math.max(12, Math.min(rect.left - 210, window.innerWidth - 280));
    popover.style.top = `${topPos}px`;
    popover.style.left = `${leftPos}px`;
    popover.innerHTML = ColorPickerTemplate.buildPopoverHTML({
      format: this.format,
      opacity: this.a,
      presets: this.presets
    });

    document.body.appendChild(popover);
    this.popoverEl = popover;
    this.widgets = new ColorCanvasWidgets(popover);

    this._bindEvents();
    ColorCanvasWidgets.attachModalDrag(popover.querySelector('#cpHeader'), popover, '#cpCloseBtn');
    this.widgets.bindAlphaInput(
      (alpha) => {
        this.opacityChanged = true;
        this.a = alpha;
        this._updateUI(true);
      },
      (alpha) => {
        this.opacityChanged = true;
        this.a = alpha;
        this._updateUI(true);
        this._pushHistorySnapshot();
      }
    );
    this.widgets.drawSatValCanvas(this.h);
    this._updateUI(false);
  }

  _applyHexSelection(hex) {
    this.colorChanged = true;
    const hsb = ColorMath.hexToHsb(hex);
    this.h = hsb.h;
    this.s = hsb.s;
    this.b = hsb.b;
    this.widgets.drawSatValCanvas(this.h);
    this._updateUI(true);
    this._pushHistorySnapshot();
  }

  _bindEvents() {
    if (!this.popoverEl) return;
    const blur = () => ColorCanvasWidgets.blurActiveInput();

    this.popoverEl.querySelector('#cpCloseBtn')?.addEventListener('click', () => this.close(true));

    this.popoverEl.querySelectorAll('.cp-fmt-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.format = e.currentTarget.getAttribute('data-fmt');
        this.popoverEl.querySelectorAll('.cp-fmt-btn').forEach((b) => {
          b.className = `cp-fmt-btn py-0.5 rounded transition-colors font-sans ${b.getAttribute('data-fmt') === this.format ? 'bg-[#27272a] text-zinc-200' : 'hover:text-zinc-300'}`;
        });
        this._renderInputs();
      });
    });

    this.popoverEl.querySelector('#cpEyedropperBtn')?.addEventListener('click', async () => {
      blur();
      if (!('EyeDropper' in window)) return;
      try {
        const result = await new window.EyeDropper().open();
        if (result?.sRGBHex) this._applyHexSelection(result.sRGBHex);
      } catch (_) {}
    });

    this.popoverEl.querySelectorAll('.cp-swatch').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        blur();
        this._applyHexSelection(e.currentTarget.getAttribute('data-color'));
      });
    });

    const alphaInput = this.popoverEl.querySelector('#cpAlphaInput');
    this.widgets.bindSliders({
      onBeforeStart: blur,
      onSatVal: (x, y) => {
        this.colorChanged = true;
        this.s = Math.max(0, Math.min(100, x * 100));
        this.b = Math.max(0, Math.min(100, (1 - y) * 100));
        this._updateUI(true);
      },
      onHue: (pos) => {
        this.colorChanged = true;
        this.h = Math.max(0, Math.min(360, pos * 360));
        this.widgets.drawSatValCanvas(this.h);
        this._updateUI(true);
      },
      onAlpha: (pos) => {
        this.opacityChanged = true;
        this.a = Math.max(0, Math.min(1, pos));
        if (alphaInput) alphaInput.value = Math.round(this.a * 100);
        this._updateUI(true);
      },
      onEnd: () => this._pushHistorySnapshot()
    });

    if (this._outsideClickTimer) clearTimeout(this._outsideClickTimer);
    this._outsideClickTimer = setTimeout(() => {
      this._outsideClickListener = (e) => {
        if (this.anchorEl && !this.anchorEl.isConnected && this.anchorEl.id) {
          this.anchorEl = document.getElementById(this.anchorEl.id) || this.anchorEl;
        }
        if (this.popoverEl && !this.popoverEl.contains(e.target) && !this.anchorEl?.contains(e.target)) {
          this.close(true);
        }
      };
      document.addEventListener('pointerdown', this._outsideClickListener);
    }, 0);

    this._escKeyDownListener = (e) => this._handleKeyDown(e);
    document.addEventListener('keydown', this._escKeyDownListener, true);
  }

  _handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.cancel();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const activeEl = document.activeElement;
      const isEditingText = activeEl && this.popoverEl?.contains(activeEl) && activeEl.tagName === 'INPUT';
      if (isEditingText) {
        e.stopPropagation();
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        this._stepHistory(-1);
      } else if ((key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        this._stepHistory(1);
      }
    }
  }

  _updateUI(triggerLiveChange = false) {
    this.widgets?.updateHandlesAndAlpha(this.h, this.s, this.b, this.a);
    this._renderInputs();

    if (triggerLiveChange && typeof this.onChange === 'function') {
      this.onChange(ColorMath.hsbToHex(this.h, this.s, this.b), this.a, {
        colorChanged: this.colorChanged,
        opacityChanged: this.opacityChanged
      });
    }
  }

  _renderInputs() {
    const container = this.popoverEl?.querySelector('#cpInputsContainer');
    if (!container) return;

    if (container.getAttribute('data-fmt') !== this.format) {
      container.setAttribute('data-fmt', this.format);
      container.innerHTML = ColorPickerTemplate.buildValueInputHTML(this.format);

      PropertyControls.attachInputIsolation(container);
      const inputEl = container.querySelector('#cpValueInput');
      inputEl?.addEventListener('input', (e) => {
        const parsed = ColorMath.parseInput(this.format, e.target.value);
        if (parsed) {
          this.colorChanged = true;
          this.h = parsed.h;
          this.s = parsed.s;
          this.b = parsed.b;
          this.widgets.drawSatValCanvas(this.h);
          this._updateUI(true);
        }
      });
      inputEl?.addEventListener('change', () => this._pushHistorySnapshot());
    }

    const inputEl = container.querySelector('#cpValueInput');
    if (inputEl && document.activeElement !== inputEl) {
      inputEl.value = ColorMath.formatDisplay(this.format, this.h, this.s, this.b);
    }
  }

  _pushHistorySnapshot() {
    this.history.push({ h: this.h, s: this.s, b: this.b, a: this.a });
  }

  _stepHistory(delta) {
    const snap = delta < 0 ? this.history.undo() : this.history.redo();
    if (!snap) return false;
    this.widgets?.cancelDrags();
    this._applyHistorySnapshot(snap);
    return true;
  }

  _applyHistorySnapshot(snap) {
    if (!snap) return;
    this.h = snap.h;
    this.s = snap.s;
    this.b = snap.b;
    this.a = snap.a;

    const alphaInput = this.popoverEl?.querySelector('#cpAlphaInput');
    if (alphaInput && document.activeElement !== alphaInput) {
      alphaInput.value = Math.round(this.a * 100);
    }

    this.widgets?.drawSatValCanvas(this.h);
    this._updateUI(true);
  }

  cancel() {
    this.widgets?.cancelDrags();
    if (typeof this.onCancel === 'function') {
      this.onCancel();
    }
    this.close(false);
  }

  close(commit = true) {
    if (this._isClosing) return;
    this._isClosing = true;

    this.widgets?.cancelDrags();

    if (this._outsideClickTimer) clearTimeout(this._outsideClickTimer);
    if (this._outsideClickListener) document.removeEventListener('pointerdown', this._outsideClickListener);
    if (this._escKeyDownListener) document.removeEventListener('keydown', this._escKeyDownListener, true);
    this._outsideClickTimer = null;
    this._outsideClickListener = null;
    this._escKeyDownListener = null;

    if (this.popoverEl) {
      this.popoverEl.remove();
      this.popoverEl = null;
    }
    if (ColorPickerPopover._activeInstance === this) {
      ColorPickerPopover._activeInstance = null;
    }

    if (commit && typeof this.onChangeEnd === 'function') {
      const finalHex = ColorMath.hsbToHex(this.h, this.s, this.b);
      const finalColorChanged = finalHex !== this._initialState.hex;
      const finalOpacityChanged = Math.abs(this.a - this._initialState.a) > 0.001;

      if (finalColorChanged || finalOpacityChanged) {
        this.onChangeEnd(finalHex, this.a, {
          colorChanged: finalColorChanged,
          opacityChanged: finalOpacityChanged
        });
      }
    }

    if (typeof this.onClose === 'function') {
      this.onClose();
    }
  }
}