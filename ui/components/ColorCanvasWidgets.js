/**
 * ColorCanvasWidgets.js - Control visual de los sliders 2D/1D (Saturación/Brillo,
 * Matiz y Opacidad) y gestión de arrastre suavizado con PointerCapture.
 */

import { ColorMath } from './ColorMath.js';

export class ColorCanvasWidgets {
  constructor(popoverEl) {
    this.satValCanvas = popoverEl.querySelector('#cpSatValCanvas');
    this.satValHandle = popoverEl.querySelector('#cpSatValHandle');
    this.hueHandle = popoverEl.querySelector('#cpHueHandle');
    this.alphaHandle = popoverEl.querySelector('#cpAlphaHandle');
    this.alphaGradient = popoverEl.querySelector('#cpAlphaGradient');
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
    if (!container) return;
    let isDragging = false;
    let rafId = null;

    const handleMove = (e) => {
      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => onMove(x, y));
    };

    container.addEventListener('pointerdown', (e) => {
      if (typeof onBeforeStart === 'function') onBeforeStart();
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      container.setPointerCapture(e.pointerId);
      handleMove(e);

      const onPointerMove = (moveEvt) => {
        if (isDragging) handleMove(moveEvt);
      };

      const onPointerUp = (upEvt) => {
        if (!isDragging) return;
        isDragging = false;
        if (rafId) cancelAnimationFrame(rafId);
        try {
          container.releasePointerCapture(upEvt.pointerId);
        } catch (_) {}
        container.removeEventListener('pointermove', onPointerMove);
        container.removeEventListener('pointerup', onPointerUp);
        container.removeEventListener('pointercancel', onPointerUp);
        if (typeof onEnd === 'function') onEnd();
      };

      container.addEventListener('pointermove', onPointerMove);
      container.addEventListener('pointerup', onPointerUp);
      container.addEventListener('pointercancel', onPointerUp);
    });
  }
}