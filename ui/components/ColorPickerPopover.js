/**
 * ui/components/ColorPickerPopover.js
 * Orquestador del popover selector de color con soporte RGB/HSL/HSB, muestras y scrubbing.
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { ColorMath } from './ColorMath.js';
import { ColorCanvasWidgets } from './ColorCanvasWidgets.js';
import { PropertyControls } from './PropertyControls.js';

export class ColorPickerPopover {
  static DEFAULT_PRESETS = [...CAD_THEME.properties.colorPresets];

  static getPresets() {
    return ColorPickerPopover.DEFAULT_PRESETS;
  }

  static setPresets(newPresets) {
    ColorPickerPopover.DEFAULT_PRESETS = newPresets;
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
    this.onChange = onChange;
    this.onChangeEnd = onChangeEnd;
    this.onCancel = onCancel;
    this.onClose = onClose;
    this.anchorEl = anchorEl;
    this.presets = (presets && presets.length > 0) ? presets : ColorPickerPopover.DEFAULT_PRESETS;

    this.format = 'HEX';
    this.popoverEl = null;
    this.widgets = null;

    const hsb = ColorMath.hexToHsb(color);
    this.h = hsb.h;
    this.s = hsb.s;
    this.b = hsb.b;
    this.a = Math.max(0, Math.min(1, opacity));

    this.colorChanged = false;
    this.opacityChanged = false;

    this.render();
  }

  render() {
    this.close();

    const rect = this.anchorEl ? this.anchorEl.getBoundingClientRect() : { top: 100, left: 100, bottom: 122 };
    const popover = document.createElement('div');
    popover.id = 'figmaColorPickerPopover';
    popover.className = 'fixed z-50 bg-[#1e1e24] border border-[#2a2a32] rounded-lg shadow-2xl p-3 w-[260px] text-zinc-300 font-sans text-xs flex flex-col gap-2.5 select-none';

    const topPos = Math.min(rect.bottom + 6, window.innerHeight - 410);
    const leftPos = Math.max(12, Math.min(rect.left - 210, window.innerWidth - 280));
    popover.style.top = `${topPos}px`;
    popover.style.left = `${leftPos}px`;

    popover.innerHTML = `
      <div id="cpHeader" class="flex items-center justify-between pb-1 border-b border-[#2a2a32] cursor-grab active:cursor-grabbing select-none" title="Arrastrar ventana">
        <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">SELECCIONAR COLOR</span>
        <button id="cpCloseBtn" class="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 text-xs rounded hover:bg-[#27272a] cursor-pointer">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="flex gap-2 h-[140px] w-full">
        <div class="relative flex-1 h-full rounded overflow-hidden cursor-crosshair border border-[#2a2a32] touch-none" id="cpSatValContainer">
          <canvas id="cpSatValCanvas" class="w-full h-full block"></canvas>
          <div id="cpSatValHandle" class="absolute w-3 h-3 border-2 border-white rounded-full shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>
        </div>

        <div class="relative w-3.5 h-full rounded overflow-hidden cursor-pointer border border-[#2a2a32] touch-none" id="cpHueContainer">
          <div class="w-full h-full" style="background: linear-gradient(to bottom, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);"></div>
          <div id="cpHueHandle" class="absolute left-1/2 w-3 h-3 border-2 border-white rounded-full shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>
        </div>

        <div class="relative w-3.5 h-full rounded overflow-hidden cursor-pointer border border-[#2a2a32] touch-none" id="cpAlphaContainer">
          <div class="w-full h-full bg-[linear-gradient(45deg,#2a2a32_25%,transparent_25%),linear-gradient(-45deg,#2a2a32_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#2a2a32_75%),linear-gradient(-45deg,transparent_75%,#2a2a32_75%)] bg-[size:6px_6px] bg-[position:0_0,0_3px,3px_-3px,-3px_0]">
            <div id="cpAlphaGradient" class="w-full h-full"></div>
          </div>
          <div id="cpAlphaHandle" class="absolute left-1/2 w-3 h-3 border-2 border-white rounded-full shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>
        </div>
      </div>

      <div class="grid grid-cols-4 bg-[#121215] p-0.5 rounded text-[10px] font-normal text-zinc-400 uppercase tracking-wider font-sans">
        <button data-fmt="HEX" class="cp-fmt-btn py-0.5 rounded transition-colors ${this.format === 'HEX' ? 'bg-[#27272a] text-zinc-200' : 'hover:text-zinc-300'}">Hex</button>
        <button data-fmt="RGB" class="cp-fmt-btn py-0.5 rounded transition-colors ${this.format === 'RGB' ? 'bg-[#27272a] text-zinc-200' : 'hover:text-zinc-300'}">RGB</button>
        <button data-fmt="HSL" class="cp-fmt-btn py-0.5 rounded transition-colors ${this.format === 'HSL' ? 'bg-[#27272a] text-zinc-200' : 'hover:text-zinc-300'}">HSL</button>
        <button data-fmt="HSB" class="cp-fmt-btn py-0.5 rounded transition-colors ${this.format === 'HSB' ? 'bg-[#27272a] text-zinc-200' : 'hover:text-zinc-300'}">HSB</button>
      </div>

      <div class="flex items-center gap-1.5">
        <button id="cpEyedropperBtn" class="cad-button cad-button-square h-6 w-6 text-zinc-400 hover:text-zinc-100 shrink-0" title="Cuentagotas">
          <i class="fa-solid fa-eye-dropper text-xs"></i>
        </button>

        <div id="cpInputsContainer" class="flex-1 flex items-center bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded transition-colors"></div>

        <div id="cpAlphaContainerInput" class="flex items-center justify-end w-[50px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o arrastra">
          <input type="number" id="cpAlphaInput" min="0" max="100" value="${Math.round(this.a * 100)}" class="w-7 bg-transparent text-right outline-none border-0 text-zinc-300 text-[11px] font-sans tabular-nums p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ew-resize focus:cursor-text" />
          <span class="text-[11px] text-zinc-500 font-sans tabular-nums ml-0.5 pointer-events-none">%</span>
        </div>
      </div>

      <div class="flex flex-col gap-1.5 pt-1 border-t border-[#2a2a32]">
        <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">MUESTRAS</span>
        <div class="grid grid-cols-10 gap-1.5 items-center">
          ${this.presets.map((c) => `
            <button class="cp-swatch w-full aspect-square rounded-sm hover:scale-110 transition-transform cursor-pointer shrink-0" style="background-color: ${c}" data-color="${c}"></button>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(popover);
    this.popoverEl = popover;
    this.widgets = new ColorCanvasWidgets(popover);

    this._bindEvents();
    this._makeModalDraggable();
    this._attachAlphaControls();
    this.widgets.drawSatValCanvas(this.h);
    this._updateUI(false);
  }

  _makeModalDraggable() {
    const header = this.popoverEl?.querySelector('#cpHeader');
    if (!header) return;

    let isDraggingModal = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    header.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#cpCloseBtn')) return;
      isDraggingModal = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.popoverEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      header.setPointerCapture(e.pointerId);
    });

    header.addEventListener('pointermove', (e) => {
      if (!isDraggingModal) return;
      this.popoverEl.style.left = `${initialLeft + (e.clientX - startX)}px`;
      this.popoverEl.style.top = `${initialTop + (e.clientY - startY)}px`;
    });

    const stopModalDrag = (e) => {
      if (!isDraggingModal) return;
      isDraggingModal = false;
      try {
        header.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };

    header.addEventListener('pointerup', stopModalDrag);
    header.addEventListener('pointercancel', stopModalDrag);
  }

  _attachAlphaControls() {
    const container = this.popoverEl?.querySelector('#cpAlphaContainerInput');
    const input = this.popoverEl?.querySelector('#cpAlphaInput');
    if (!container || !input) return;

    PropertyControls.attachScrubInput(container, input, (pctVal) => {
      this.opacityChanged = true;
      this.a = Math.max(0, Math.min(1, pctVal / 100));
      this._updateUI(true);
      this._notifyChangeEnd();
    }, {
      min: 0,
      max: 100,
      step: 1,
      precision: 0,
      onLiveChange: (pctVal) => {
        this.opacityChanged = true;
        this.a = Math.max(0, Math.min(1, pctVal / 100));
        this._updateUI(true);
      }
    });
  }

  _getFreshAnchorEl() {
    if (this.anchorEl && !this.anchorEl.isConnected && this.anchorEl.id) {
      const fresh = document.getElementById(this.anchorEl.id);
      if (fresh) this.anchorEl = fresh;
    }
    return this.anchorEl;
  }

  _blurActiveInput() {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT')) {
      document.activeElement.blur();
    }
  }

  _applyHexSelection(hex) {
    this.colorChanged = true;
    const hsb = ColorMath.hexToHsb(hex);
    this.h = hsb.h;
    this.s = hsb.s;
    this.b = hsb.b;
    this.widgets.drawSatValCanvas(this.h);
    this._updateUI(true);
    this._notifyChangeEnd();
  }

  _bindEvents() {
    if (!this.popoverEl) return;
    const blur = () => this._blurActiveInput();

    this.popoverEl.querySelector('#cpCloseBtn')?.addEventListener('click', () => this.close());

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
    alphaInput?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        this.opacityChanged = true;
        this.a = Math.max(0, Math.min(1, val / 100));
        this._updateUI(true);
      }
    });

    ColorCanvasWidgets.attachDrag(
      this.popoverEl.querySelector('#cpSatValContainer'),
      (x, y) => {
        this.colorChanged = true;
        this.s = Math.max(0, Math.min(100, x * 100));
        this.b = Math.max(0, Math.min(100, (1 - y) * 100));
        this._updateUI(true);
      },
      () => this._notifyChangeEnd(),
      blur
    );

    const hueContainer = this.popoverEl.querySelector('#cpHueContainer');
    ColorCanvasWidgets.attachDrag(
      hueContainer,
      (x, y) => {
        this.colorChanged = true;
        const pos = hueContainer.offsetWidth >= hueContainer.offsetHeight ? x : y;
        this.h = Math.max(0, Math.min(360, pos * 360));
        this.widgets.drawSatValCanvas(this.h);
        this._updateUI(true);
      },
      () => this._notifyChangeEnd(),
      blur
    );

    const alphaContainer = this.popoverEl.querySelector('#cpAlphaContainer');
    ColorCanvasWidgets.attachDrag(
      alphaContainer,
      (x, y) => {
        this.opacityChanged = true;
        const pos = alphaContainer.offsetWidth >= alphaContainer.offsetHeight ? x : y;
        this.a = Math.max(0, Math.min(1, pos));
        if (alphaInput) alphaInput.value = Math.round(this.a * 100);
        this._updateUI(true);
      },
      () => this._notifyChangeEnd(),
      blur
    );

    if (this._outsideClickTimer) clearTimeout(this._outsideClickTimer);
    this._outsideClickTimer = setTimeout(() => {
      this._outsideClickListener = (e) => {
        const anchor = this._getFreshAnchorEl();
        if (this.popoverEl && !this.popoverEl.contains(e.target) && !anchor?.contains(e.target)) {
          this.close();
        }
      };
      document.addEventListener('pointerdown', this._outsideClickListener);
    }, 0);

    this._escKeyDownListener = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.cancel();
      }
    };
    document.addEventListener('keydown', this._escKeyDownListener, true);
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

  _notifyChangeEnd() {
    if (typeof this.onChangeEnd === 'function') {
      this.onChangeEnd(ColorMath.hsbToHex(this.h, this.s, this.b), this.a, {
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
      const prefixLabel = this.format === 'HEX' ? '#' : this.format;

      container.innerHTML = `
        <div class="flex items-center bg-transparent w-full">
          <span class="text-zinc-500 text-[10px] select-none mr-1.5 font-sans font-medium shrink-0">${prefixLabel}</span>
          <input id="cpValueInput" type="text" class="bg-transparent text-zinc-200 text-[11px] font-sans tabular-nums outline-none w-full ${this.format === 'HEX' ? 'uppercase' : ''}" />
        </div>`;

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
      inputEl?.addEventListener('change', () => this._notifyChangeEnd());
    }

    const inputEl = container.querySelector('#cpValueInput');
    if (inputEl && document.activeElement !== inputEl) {
      inputEl.value = ColorMath.formatDisplay(this.format, this.h, this.s, this.b);
    }
  }

  cancel() {
    if (typeof this.onCancel === 'function') {
      this.onCancel();
    }
    this.close();
  }

  close() {
    if (this._outsideClickTimer) {
      clearTimeout(this._outsideClickTimer);
      this._outsideClickTimer = null;
    }
    if (this._outsideClickListener) {
      document.removeEventListener('pointerdown', this._outsideClickListener);
      this._outsideClickListener = null;
    }
    if (this._escKeyDownListener) {
      document.removeEventListener('keydown', this._escKeyDownListener, true);
      this._escKeyDownListener = null;
    }
    if (this.popoverEl) {
      this.popoverEl.remove();
      this.popoverEl = null;
    }
    if (typeof this.onClose === 'function') {
      this.onClose();
    }
  }
}