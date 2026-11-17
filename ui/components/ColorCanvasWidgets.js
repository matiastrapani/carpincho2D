/**
 * ColorCanvasWidgets.js - Control visual de los sliders 2D/1D (Saturación/Brillo,
 * Matiz y Opacidad) y gestión de arrastre suavizado con PointerCapture.
 */

import { ColorMath } from './ColorMath.js';
import { PropertyControls } from './PropertyControls.js';

export class ColorCanvasWidgets {
  constructor(popoverEl) {
    this.popoverEl = popoverEl;
    this.satValCanvas = popoverEl.querySelector('#cpSatValCanvas');
    this.satValHandle = popoverEl.querySelector('#cpSatValHandle');
    this.hueHandle = popoverEl.querySelector('#cpHueHandle');
    this.alphaHandle = popoverEl.querySelector('#cpAlphaHandle');
    this.alphaGradient = popoverEl.querySelector('#cpAlphaGradient');
    this._dragCancelers = [];
  }

  drawSatValCanvas(hue) {
    const canvas = this.satValCanvas;
    if (!canvas) return;

    if (!canvas.width || canvas.width !== canvas.clientWidth) {
      canvas.width = canvas.clientWidth || 180;
      canvas.height = canvas.clientHeight || 140;
    }

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
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

  updateHandlesAndAlpha(h, s, b, a) {
    if (this.satValHandle) {
      this.satValHandle.style.left = `${s}%`;
      this.satValHandle.style.top = `${100 - b}%`;
    }
    if (this.hueHandle) {
      this.hueHandle.style.top = `${(h / 360) * 100}%`;
    }
    if (this.alphaHandle) {
      this.alphaHandle.style.top = `${a * 100}%`;
    }
    if (this.alphaGradient) {
      const solidHex = ColorMath.hsbToHex(h, s, b);
      this.alphaGradient.style.background = `linear-gradient(to bottom, rgba(0,0,0,0) 0%, ${solidHex} 100%)`;
    }
  }

  static attachDrag(container, onMove, onEnd, onBeforeStart = null) {
    if (!container) return () => {};
    let isDragging = false;
    let isAborted = false;
    let rafId = null;
    let lastCoords = null;
    let activeMove = null;
    let activeUp = null;

    const cleanupListeners = () => {
      if (activeMove) {
        container.removeEventListener('pointermove', activeMove);
        activeMove = null;
      }
      if (activeUp) {
        container.removeEventListener('pointerup', activeUp);
        container.removeEventListener('pointercancel', activeUp);
        activeUp = null;
      }
    };

    const handleMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      lastCoords = { x, y };

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!isAborted && lastCoords) {
          onMove(lastCoords.x, lastCoords.y);
        }
      });
    };

    container.addEventListener('pointerdown', (e) => {
      if (typeof onBeforeStart === 'function') onBeforeStart();
      e.preventDefault();
      e.stopPropagation();
      cleanupListeners();
      isAborted = false;
      isDragging = true;
      container.setPointerCapture(e.pointerId);
      handleMove(e);

      activeMove = (moveEvt) => {
        if (isDragging) handleMove(moveEvt);
      };

      activeUp = (upEvt) => {
        if (!isDragging) return;
        isDragging = false;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
          if (!isAborted && lastCoords) {
            onMove(lastCoords.x, lastCoords.y);
          }
        }
        try {
          container.releasePointerCapture(upEvt.pointerId);
        } catch (_) {}
        cleanupListeners();
        if (!isAborted && typeof onEnd === 'function') onEnd();
      };

      container.addEventListener('pointermove', activeMove);
      container.addEventListener('pointerup', activeUp);
      container.addEventListener('pointercancel', activeUp);
    });

    return () => {
      isAborted = true;
      isDragging = false;
      lastCoords = null;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      cleanupListeners();
    };
  }

  bindSliders({ onSatVal, onHue, onAlpha, onEnd, onBeforeStart }) {
    this.cancelDrags();
    if (!this.popoverEl) return;

    const satValEl = this.popoverEl.querySelector('#cpSatValContainer');
    const hueEl = this.popoverEl.querySelector('#cpHueContainer');
    const alphaEl = this.popoverEl.querySelector('#cpAlphaContainer');

    this._dragCancelers = [
      ColorCanvasWidgets.attachDrag(satValEl, onSatVal, onEnd, onBeforeStart),
      ColorCanvasWidgets.attachDrag(
        hueEl,
        (x, y) => {
          const pos = hueEl && hueEl.offsetWidth >= hueEl.offsetHeight ? x : y;
          onHue?.(pos);
        },
        onEnd,
        onBeforeStart
      ),
      ColorCanvasWidgets.attachDrag(
        alphaEl,
        (x, y) => {
          const pos = alphaEl && alphaEl.offsetWidth >= alphaEl.offsetHeight ? x : y;
          onAlpha?.(pos);
        },
        onEnd,
        onBeforeStart
      )
    ];
  }

  bindAlphaInput(onLiveAlpha, onCommitAlpha) {
    const container = this.popoverEl?.querySelector('#cpAlphaContainerInput');
    const input = this.popoverEl?.querySelector('#cpAlphaInput');
    if (!container || !input) return;

    PropertyControls.attachScrubInput(container, input, (pctVal) => {
      onCommitAlpha?.(Math.max(0, Math.min(1, pctVal / 100)));
    }, {
      min: 0,
      max: 100,
      step: 1,
      precision: 0,
      onLiveChange: (pctVal) => {
        onLiveAlpha?.(Math.max(0, Math.min(1, pctVal / 100)));
      }
    });
  }

  static blurActiveInput() {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT')) {
      el.blur();
    }
  }

  cancelDrags() {
    this._dragCancelers.forEach((cancelFn) => {
      if (typeof cancelFn === 'function') cancelFn();
    });
    this._dragCancelers = [];
  }

  static attachModalDrag(headerEl, modalEl, ignoreSelector = null) {
    if (!headerEl || !modalEl) return;

    let isDraggingModal = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    headerEl.addEventListener('pointerdown', (e) => {
      if (ignoreSelector && e.target.closest(ignoreSelector)) return;
      isDraggingModal = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = modalEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      headerEl.setPointerCapture(e.pointerId);
    });

    headerEl.addEventListener('pointermove', (e) => {
      if (!isDraggingModal) return;
      modalEl.style.left = `${initialLeft + (e.clientX - startX)}px`;
      modalEl.style.top = `${initialTop + (e.clientY - startY)}px`;
    });

    const stopModalDrag = (e) => {
      if (!isDraggingModal) return;
      isDraggingModal = false;
      try {
        headerEl.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };

    headerEl.addEventListener('pointerup', stopModalDrag);
    headerEl.addEventListener('pointercancel', stopModalDrag);
  }
}