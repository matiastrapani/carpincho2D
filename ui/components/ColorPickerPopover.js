/**
 * ui/components/ColorPickerPopover.js
 * Componente modular de selector de color con soporte completo de edición RGB/HSL/HSB y estilo unificado.
 */

export class ColorPickerPopover {
  static DEFAULT_PRESETS = [
      '#008800', '#4c72fb', '#f35c54', '#ffcc00', 
      '#3bcf1d', '#e148ae', '#93a115', '#7877d5', 
  ];

  static getPresets() {
      return ColorPickerPopover.DEFAULT_PRESETS;
  }

  static setPresets(newPresets) {
      ColorPickerPopover.DEFAULT_PRESETS = newPresets;
  }

  constructor({ color = '#00e5ff', opacity = 1.0, onChange, onChangeEnd, onCancel, onClose, anchorEl, presets = null }) {
    this.onChange = onChange;
    this.onChangeEnd = onChangeEnd;
    this.onCancel = onCancel;
    this.onClose = onClose;
    this.anchorEl = anchorEl;

    // Si se pasa una lista personalizada se usa; de lo contrario, se usa la centralizada
    this.presets = (presets && presets.length > 0) ? presets : ColorPickerPopover.DEFAULT_PRESETS;

    this.format = 'HEX';
    this.popoverEl = null;

    const hsb = this._hexToHsb(color);
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

    const rect = this.anchorEl ? this.anchorEl.getBoundingClientRect() : { top: 100, left: 100 };

    const popover = document.createElement('div');
    popover.id = 'figmaColorPickerPopover';
    popover.className = 'fixed z-50 bg-[#1e1e24] border border-[#2a2a32] rounded-lg shadow-2xl p-3 w-[260px] text-zinc-300 font-sans text-xs flex flex-col gap-2.5 select-none';

    const topPos = Math.min(rect.bottom + 6, window.innerHeight - 410);
    const leftPos = Math.max(12, Math.min(rect.left - 210, window.innerWidth - 280));

    popover.style.top = `${topPos}px`;
    popover.style.left = `${leftPos}px`;

    popover.innerHTML = `
      <!-- Encabezado Arrastrable con Estilo Exacto de Propiedades -->
      <div id="cpHeader" class="flex items-center justify-between pb-1 border-b border-[#2a2a32] cursor-grab active:cursor-grabbing select-none" title="Arrastrar ventana">
        <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">SELECCIONAR COLOR</span>
        <button id="cpCloseBtn" class="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 text-xs rounded hover:bg-[#27272a] cursor-pointer">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Área de Selección: Canvas Sat/Brillo + Sliders -->
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

      <!-- Selector de Formato (Sin Borde) -->
      <div class="grid grid-cols-4 bg-[#121215] p-0.5 rounded text-[10px] font-normal text-zinc-400 uppercase tracking-wider font-sans">
        <button data-fmt="HEX" class="cp-fmt-btn py-0.5 rounded transition-colors ${this.format === 'HEX' ? 'bg-[#27272a] text-zinc-200' : 'hover:text-zinc-300'}">Hex</button>
        <button data-fmt="RGB" class="cp-fmt-btn py-0.5 rounded transition-colors ${this.format === 'RGB' ? 'bg-[#27272a] text-zinc-200' : 'hover:text-zinc-300'}">RGB</button>
        <button data-fmt="HSL" class="cp-fmt-btn py-0.5 rounded transition-colors ${this.format === 'HSL' ? 'bg-[#27272a] text-zinc-200' : 'hover:text-zinc-300'}">HSL</button>
        <button data-fmt="HSB" class="cp-fmt-btn py-0.5 rounded transition-colors ${this.format === 'HSB' ? 'bg-[#27272a] text-zinc-200' : 'hover:text-zinc-300'}">HSB</button>
      </div>

      <!-- Controles e Inputs Estilo Properties -->
      <div class="flex items-center gap-1.5">
        <!-- Cuentagotas con Ícono Ampliado -->
        <button id="cpEyedropperBtn" class="cad-button cad-button-square h-6 w-6 text-zinc-400 hover:text-zinc-100 shrink-0" title="Cuentagotas">
          <i class="fa-solid fa-eye-dropper text-xs"></i>
        </button>

        <!-- Grupo de Valor del Color -->
        <div id="cpInputsContainer" class="flex-1 flex items-center bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded transition-colors">
        </div>

        <!-- Input de Opacidad -->
        <div id="cpAlphaContainerInput" class="flex items-center justify-end w-[50px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors" title="Haz clic para editar o arrastra">
          <input 
            type="number" 
            id="cpAlphaInput" 
            min="0" 
            max="100" 
            value="${Math.round(this.a * 100)}" 
            class="w-7 bg-transparent text-right outline-none border-0 text-zinc-300 text-[11px] font-sans tabular-nums p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ew-resize focus:cursor-text"
          />
          <span class="text-[11px] text-zinc-500 font-sans tabular-nums ml-0.5 pointer-events-none">%</span>
        </div>
      </div>

      <!-- Paleta Flotante de Muestras (10 Por Renglón) -->
      <div class="flex flex-col gap-1.5 pt-1 border-t border-[#2a2a32]">
        <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">MUESTRAS</span>
        <div class="grid grid-cols-10 gap-1.5 items-center">
          ${this.presets.map(c => `
            <button class="cp-swatch w-full aspect-square rounded-sm hover:scale-110 transition-transform cursor-pointer shrink-0" style="background-color: ${c}" data-color="${c}"></button>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(popover);
    this.popoverEl = popover;

    this.satValCanvas = this.popoverEl.querySelector('#cpSatValCanvas');
    this.satValHandle = this.popoverEl.querySelector('#cpSatValHandle');
    this.hueHandle = this.popoverEl.querySelector('#cpHueHandle');
    this.alphaHandle = this.popoverEl.querySelector('#cpAlphaHandle');
    this.alphaGradient = this.popoverEl.querySelector('#cpAlphaGradient');

    this._bindEvents();
    this._makeModalDraggable();
    this._attachAlphaScrubbing();
    this._drawSatValCanvas();
    this._updateUI(false);
  }

  _makeModalDraggable() {
    const header = this.popoverEl?.querySelector('#cpHeader');
    if (!header) return;

    let isDraggingModal = false;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

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
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.popoverEl.style.left = `${initialLeft + dx}px`;
      this.popoverEl.style.top = `${initialTop + dy}px`;
    });

    const stopModalDrag = (e) => {
      if (isDraggingModal) {
        isDraggingModal = false;
        try { header.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };

    header.addEventListener('pointerup', stopModalDrag);
    header.addEventListener('pointercancel', stopModalDrag);
  }

  _attachAlphaScrubbing() {
    const container = this.popoverEl?.querySelector('#cpAlphaContainerInput');
    const input = this.popoverEl?.querySelector('#cpAlphaInput');
    if (!container || !input) return;

    let isDragging = false;
    let startX = 0;
    let startAlpha = this.a;
    let hasMoved = false;

    container.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target === input) return;
      this._blurActiveInput(); // <-- Quita el foco
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startAlpha = this.a;

      container.setPointerCapture(e.pointerId);

      const onPointerMove = (moveEvt) => {
        if (!isDragging) return;
        const deltaX = moveEvt.clientX - startX;
        if (Math.abs(deltaX) > 2) {
          hasMoved = true;
        }
        if (hasMoved) {
          this.opacityChanged = true; // <-- Marcado de cambio en vivo desde el primer movimiento
          const newPct = Math.max(0, Math.min(100, Math.round(startAlpha * 100 + deltaX)));
          this.a = newPct / 100;
          input.value = newPct;
          this._updateUI(true);
        }
      };

      const onPointerUp = (upEvt) => {
        if (!isDragging) return;
        isDragging = false;
        try { container.releasePointerCapture(upEvt.pointerId); } catch (_) {}
        container.removeEventListener('pointermove', onPointerMove);
        container.removeEventListener('pointerup', onPointerUp);
        container.removeEventListener('pointercancel', onPointerUp);

        if (hasMoved) {
          this.opacityChanged = true;
          const newPct = Math.max(0, Math.min(100, Math.round(startAlpha * 100 + deltaX)));
          this.a = newPct / 100;
          input.value = newPct;
          this._updateUI(true);
        }
      };

      container.addEventListener('pointermove', onPointerMove);
      container.addEventListener('pointerup', onPointerUp);
      container.addEventListener('pointercancel', onPointerUp);
    });
  }

  // Helper para re-vincular anchorEl si el panel de propiedades se re-renderiza
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

  _bindEvents() {
    if (!this.popoverEl) return;

    this.popoverEl.querySelector('#cpCloseBtn')?.addEventListener('click', () => this.close());

    this.popoverEl.querySelectorAll('.cp-fmt-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.format = e.currentTarget.getAttribute('data-fmt');
        this.popoverEl.querySelectorAll('.cp-fmt-btn').forEach(b => {
          b.className = `cp-fmt-btn py-0.5 rounded transition-colors font-sans ${b.getAttribute('data-fmt') === this.format ? 'bg-[#27272a] text-zinc-200' : 'hover:text-zinc-300'}`;
        });
        this._renderInputs();
      });
    });

    // Cuentagotas
    this.popoverEl.querySelector('#cpEyedropperBtn')?.addEventListener('click', async () => {
      this._blurActiveInput();
      if ('EyeDropper' in window) {
        try {
          const eyeDropper = new EyeDropper();
          const result = await eyeDropper.open();
          if (result?.sRGBHex) {
            this.colorChanged = true;
            const hsb = this._hexToHsb(result.sRGBHex);
            this.h = hsb.h; this.s = hsb.s; this.b = hsb.b;
            this._drawSatValCanvas();
            this._updateUI(true);
            this._notifyChangeEnd();
          }
        } catch (e) {}
      }
    });

    // Swatches
    this.popoverEl.querySelectorAll('.cp-swatch').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this._blurActiveInput();
        this.colorChanged = true;
        const hex = e.currentTarget.getAttribute('data-color');
        const hsb = this._hexToHsb(hex);
        this.h = hsb.h; this.s = hsb.s; this.b = hsb.b;
        this._drawSatValCanvas();
        this._updateUI(true);
        this._notifyChangeEnd();
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
    alphaInput?.addEventListener('change', () => this._notifyChangeEnd());

    // --- Arrastres Suaves (Detección automática de orientación X / Y) ---
    const satContainer = this.popoverEl.querySelector('#cpSatValContainer');
    this._attachDrag(satContainer, 
      (x, y) => {
        this.colorChanged = true;
        this.s = Math.max(0, Math.min(100, x * 100));
        this.b = Math.max(0, Math.min(100, (1 - y) * 100));
        this._updateUI(true);
      },
      () => this._notifyChangeEnd()
    );

    const hueContainer = this.popoverEl.querySelector('#cpHueContainer');
    this._attachDrag(hueContainer, 
      (x, y) => {
        this.colorChanged = true;
        const isHorizontal = hueContainer.offsetWidth >= hueContainer.offsetHeight;
        const pos = isHorizontal ? x : y;
        this.h = Math.max(0, Math.min(360, pos * 360));
        this._drawSatValCanvas();
        this._updateUI(true);
      },
      () => this._notifyChangeEnd()
    );

    const alphaContainer = this.popoverEl.querySelector('#cpAlphaContainer');
    this._attachDrag(alphaContainer, 
      (x, y) => {
        this.opacityChanged = true;
        const isHorizontal = alphaContainer.offsetWidth >= alphaContainer.offsetHeight;
        const pos = isHorizontal ? x : y;
        this.a = Math.max(0, Math.min(1, pos));
        if (alphaInput) alphaInput.value = Math.round(this.a * 100);
        this._updateUI(true);
      },
      () => this._notifyChangeEnd()
    );

    // --- Cierre con Clic Exterior y tecla ESC ---
    setTimeout(() => {
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

  _attachDrag(container, onMove, onEnd) {
    if (!container) return;
    let isDragging = false;
    let rafId = null;

    const handleMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        onMove(x, y);
      });
    };

    container.addEventListener('pointerdown', (e) => {
      this._blurActiveInput(); // <-- Desenfoca el input al hacer clic/arrastrar
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      container.setPointerCapture(e.pointerId);
      handleMove(e);

      const onPointerMove = (moveEvt) => {
        if (isDragging) handleMove(moveEvt);
      };

      const onPointerUp = (upEvt) => {
        if (isDragging) {
          isDragging = false;
          if (rafId) cancelAnimationFrame(rafId);
          try { container.releasePointerCapture(upEvt.pointerId); } catch (_) {}
          container.removeEventListener('pointermove', onPointerMove);
          container.removeEventListener('pointerup', onPointerUp);
          container.removeEventListener('pointercancel', onPointerUp);
          if (typeof onEnd === 'function') onEnd();
        }
      };

      container.addEventListener('pointermove', onPointerMove);
      container.addEventListener('pointerup', onPointerUp);
      container.addEventListener('pointercancel', onPointerUp);
    });
  }

  _updateUI(triggerLiveChange = false) {
    this._positionHandles();
    this._drawAlphaSlider();
    this._renderInputs();

    if (triggerLiveChange && typeof this.onChange === 'function') {
      const hex = this._hsbToHex(this.h, this.s, this.b);
      this.onChange(hex, this.a, {
        colorChanged: this.colorChanged,
        opacityChanged: this.opacityChanged
      });
    }
  }

  _notifyChangeEnd() {
    if (typeof this.onChangeEnd === 'function') {
      const hex = this._hsbToHex(this.h, this.s, this.b);
      this.onChangeEnd(hex, this.a, {
        colorChanged: this.colorChanged,
        opacityChanged: this.opacityChanged
      });
    }
  }

  _drawSatValCanvas() {
    const canvas = this.satValCanvas;
    if (!canvas) return;

    if (!canvas.width || canvas.width !== canvas.clientWidth) {
      canvas.width = canvas.clientWidth || 180;
      canvas.height = canvas.clientHeight || 140;
    }

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `hsl(${this.h}, 100%, 50%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const whiteGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    whiteGrad.addColorStop(0, '#ffffff');
    whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const blackGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
    blackGrad.addColorStop(1, '#000000');
    ctx.fillStyle = blackGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  _drawAlphaSlider() {
    if (!this.alphaGradient) return;
    const solidHex = this._hsbToHex(this.h, this.s, this.b);
    this.alphaGradient.style.background = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, ${solidHex} 100%)`;
  }

  _positionHandles() {
    if (this.satValHandle) {
      this.satValHandle.style.left = `${this.s}%`;
      this.satValHandle.style.top = `${100 - this.b}%`;
    }
    if (this.hueHandle) {
      this.hueHandle.style.top = `${(this.h / 360) * 100}%`;
    }
    if (this.alphaHandle) {
      this.alphaHandle.style.top = `${this.a * 100}%`;
    }
  }

  // --- Renderizado y Sincronización Dinámica de Inputs ---
  _renderInputs() {
    const container = this.popoverEl?.querySelector('#cpInputsContainer');
    if (!container) return;

    if (container.getAttribute('data-fmt') !== this.format) {
      container.setAttribute('data-fmt', this.format);

      // Etiqueta en gris (#, RGB, HSL, HSB) fuera del campo editable
      const prefixLabel = this.format === 'HEX' ? '#' : this.format;

      container.innerHTML = `
        <div class="flex items-center bg-transparent w-full">
          <span class="text-zinc-500 text-[10px] select-none mr-1.5 font-sans font-medium shrink-0">${prefixLabel}</span>
          <input id="cpValueInput" type="text" class="bg-transparent text-zinc-200 text-[11px] font-sans tabular-nums outline-none w-full ${this.format === 'HEX' ? 'uppercase' : ''}" />
        </div>`;

      const inputEl = container.querySelector('#cpValueInput');
      inputEl?.addEventListener('keydown', (e) => e.stopPropagation());
      inputEl?.addEventListener('keyup', (e) => e.stopPropagation());
      inputEl?.addEventListener('input', (e) => this._parseInputValue(e.target.value));
      inputEl?.addEventListener('change', () => this._notifyChangeEnd());
    }

    const inputEl = container.querySelector('#cpValueInput');
    if (inputEl && document.activeElement !== inputEl) {
      const pad3 = (n) => String(n).padStart(3, ' ');

      if (this.format === 'HEX') {
        inputEl.value = this._hsbToHex(this.h, this.s, this.b).replace('#', '').toUpperCase();
      } else if (this.format === 'RGB') {
        const { r, g, b } = this._hsbToRgb(this.h, this.s, this.b);
        inputEl.value = `${pad3(r)}, ${pad3(g)}, ${pad3(b)}`;
      } else if (this.format === 'HSL' || this.format === 'HLS') {
        const { h, s, l } = this._hsbToHsl(this.h, this.s, this.b);
        inputEl.value = `${pad3(h)}, ${pad3(s)}%, ${pad3(l)}%`;
      } else if (this.format === 'HSV' || this.format === 'HSB') {
        const h = Math.round(this.h), s = Math.round(this.s), b = Math.round(this.b);
        inputEl.value = `${pad3(h)}, ${pad3(s)}%, ${pad3(b)}%`;
      }
    }
  }

  _attachFormatInputEvents(container) {
    container.querySelectorAll('input').forEach(inputEl => {
      inputEl.addEventListener('keydown', (e) => e.stopPropagation());
      inputEl.addEventListener('keyup', (e) => e.stopPropagation());
    });

    if (this.format === 'HEX') {
      const hexIn = container.querySelector('#cpHexInput');
      hexIn?.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (/^[0-9A-Fa-f]{6}$/.test(val)) {
          this.colorChanged = true;
          const hsb = this._hexToHsb('#' + val);
          this.h = hsb.h; this.s = hsb.s; this.b = hsb.b;
          this._drawSatValCanvas();
          this._updateUI(true);
        }
      });
      hexIn?.addEventListener('change', () => this._notifyChangeEnd());
    } else if (this.format === 'RGB') {
      const rIn = container.querySelector('#cpRInput');
      const gIn = container.querySelector('#cpGInput');
      const bIn = container.querySelector('#cpBInput');
      const updateRGB = () => {
        const r = Math.max(0, Math.min(255, parseInt(rIn?.value || 0, 10)));
        const g = Math.max(0, Math.min(255, parseInt(gIn?.value || 0, 10)));
        const b = Math.max(0, Math.min(255, parseInt(bIn?.value || 0, 10)));
        this.colorChanged = true;
        const hsb = this._rgbToHsb(r, g, b);
        this.h = hsb.h; this.s = hsb.s; this.b = hsb.b;
        this._drawSatValCanvas();
        this._updateUI(true);
      };
      [rIn, gIn, bIn].forEach(inEl => {
        inEl?.addEventListener('input', updateRGB);
        inEl?.addEventListener('change', () => this._notifyChangeEnd());
      });
    } else if (this.format === 'HSL' || this.format === 'HLS') {
      const hIn = container.querySelector('#cpHInput');
      const sIn = container.querySelector('#cpSInput');
      const lIn = container.querySelector('#cpLInput');
      const updateHSL = () => {
        const h = Math.max(0, Math.min(360, parseInt(hIn?.value || 0, 10)));
        const s = Math.max(0, Math.min(100, parseInt(sIn?.value || 0, 10)));
        const l = Math.max(0, Math.min(100, parseInt(lIn?.value || 0, 10)));
        this.colorChanged = true;
        const hsb = this._hslToHsb(h, s, l);
        this.h = hsb.h; this.s = hsb.s; this.b = hsb.b;
        this._drawSatValCanvas();
        this._updateUI(true);
      };
      [hIn, sIn, lIn].forEach(inEl => {
        inEl?.addEventListener('input', updateHSL);
        inEl?.addEventListener('change', () => this._notifyChangeEnd());
      });
    } else if (this.format === 'HSV' || this.format === 'HSB') {
      const hIn = container.querySelector('#cpHInput');
      const sIn = container.querySelector('#cpSInput');
      const vIn = container.querySelector('#cpVInput');
      const updateHSV = () => {
        this.colorChanged = true;
        this.h = Math.max(0, Math.min(360, parseInt(hIn?.value || 0, 10)));
        this.s = Math.max(0, Math.min(100, parseInt(sIn?.value || 0, 10)));
        this.b = Math.max(0, Math.min(100, parseInt(vIn?.value || 0, 10)));
        this._drawSatValCanvas();
        this._updateUI(true);
      };
      [hIn, sIn, vIn].forEach(inEl => {
        inEl?.addEventListener('input', updateHSV);
        inEl?.addEventListener('change', () => this._notifyChangeEnd());
      });
    }
  }

  _parseInputValue(rawStr) {
    const val = rawStr.trim();
    if (!val) return;

    if (this.format === 'HEX') {
      const cleanHex = val.replace('#', '');
      if (/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
        this.colorChanged = true;
        const hsb = this._hexToHsb(`#${cleanHex}`);
        this.h = hsb.h; this.s = hsb.s; this.b = hsb.b;
        this._drawSatValCanvas();
        this._updateUI(true);
      }
    } else {
      const cleanStr = val.replace(/(RGB|HSL|HLS|HSV|HSB|%|#)/gi, '');
      const nums = cleanStr.split(/[\s,]+/).map(n => parseFloat(n)).filter(n => !isNaN(n));

      if (nums.length >= 3) {
        this.colorChanged = true;
        if (this.format === 'RGB') {
          const hsb = this._rgbToHsb(
            Math.max(0, Math.min(255, nums[0])),
            Math.max(0, Math.min(255, nums[1])),
            Math.max(0, Math.min(255, nums[2]))
          );
          this.h = hsb.h; this.s = hsb.s; this.b = hsb.b;
        } else if (this.format === 'HSL' || this.format === 'HLS') {
          const hsb = this._hslToHsb(
            Math.max(0, Math.min(360, nums[0])),
            Math.max(0, Math.min(100, nums[1])),
            Math.max(0, Math.min(100, nums[2]))
          );
          this.h = hsb.h; this.s = hsb.s; this.b = hsb.b;
        } else if (this.format === 'HSV' || this.format === 'HSB') {
          this.h = Math.max(0, Math.min(360, nums[0]));
          this.s = Math.max(0, Math.min(100, nums[1]));
          this.b = Math.max(0, Math.min(100, nums[2]));
        }
        this._drawSatValCanvas();
        this._updateUI(true);
      }
    }
  }

  cancel() {
    if (typeof this.onCancel === 'function') {
      this.onCancel();
    }
    this.close();
  }

  close() {
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

  // --- Funciones Matemáticas de Conversión de Color ---
  _hsbToRgb(h, s, b) {
    s /= 100; b /= 100;
    const k = (n) => (n + h / 60) % 6;
    const f = (n) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
    return {
      r: Math.round(255 * f(5)),
      g: Math.round(255 * f(3)),
      b: Math.round(255 * f(1))
    };
  }

  _rgbToHsb(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : (d / max) * 100;
    const v = max * 100;

    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s), b: Math.round(v) };
  }

  _hsbToHsl(h, s, b) {
    s /= 100; b /= 100;
    const l = b * (1 - s / 2);
    const sl = (l === 0 || l === 1) ? 0 : (b - l) / Math.min(l, 1 - l);
    return { h: Math.round(h), s: Math.round(sl * 100), l: Math.round(l * 100) };
  }

  _hslToHsb(h, s, l) {
    s /= 100; l /= 100;
    const b = l + s * Math.min(l, 1 - l);
    const sb = b === 0 ? 0 : 2 * (1 - l / b);
    return { h: Math.round(h), s: Math.round(sb * 100), b: Math.round(b * 100) };
  }

  _hsbToHex(h, s, b) {
    const { r, g, b: blue } = this._hsbToRgb(h, s, b);
    return `#${[r, g, blue].map(x => x.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }

  _hexToHsb(hex) {
    let c = (hex || '#000000').replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = parseInt(c.substring(0, 2), 16) || 0;
    const g = parseInt(c.substring(2, 4), 16) || 0;
    const b = parseInt(c.substring(4, 6), 16) || 0;
    return this._rgbToHsb(r, g, b);
  }
}