/**
 * ui/components/LayerColorHandler.js
 * Gestiona el selector de color/opacidad de capas y la generación de colores distinguibles.
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { ColorPickerPopover } from './ColorPickerPopover.js';
import { UpdateLayerPropertyCommand } from '../../services/commands/LayerCommands.js';

export class LayerColorHandler {
  constructor({ cadService, layerManager, onPreviewChange, onCommitChange }) {
    this.service = cadService;
    this.manager = layerManager;
    this.onPreviewChange = onPreviewChange;
    this.onCommitChange = onCommitChange;
    this.activePopover = null;
  }

  getDefaultColor() {
    return CAD_THEME.properties.customFallbackColor;
  }

  generateDistinctColor() {
    const fallback = this.getDefaultColor();
    if (!this.manager?.layers) return fallback;

    const existingHues = Array.from(this.manager.layers.values())
      .map((l) => this._hexToHue(l.color))
      .filter((h) => h !== null);

    let bestHue = Math.floor(Math.random() * 360);

    if (existingHues.length > 0) {
      let maxMinDist = -1;
      for (let cand = 0; cand < 360; cand += 10) {
        let minDist = 360;
        for (const h of existingHues) {
          let dist = Math.abs(cand - h);
          if (dist > 180) dist = 360 - dist;
          if (dist < minDist) minDist = dist;
        }
        if (minDist > maxMinDist) {
          maxMinDist = minDist;
          bestHue = cand;
        }
      }
    }

    return this._hslToHex(bestHue, 85, 55);
  }

  open(layer, triggerEl, panelRef) {
    this.close();

    const fallbackColor = this.getDefaultColor().toUpperCase();
    const initialColor = layer.color ? layer.color.substring(0, 7).toUpperCase() : fallbackColor;
    const initialOpacity = layer.opacity !== undefined ? layer.opacity : 1.0;
    let hasPreviewChanges = false;

    this.activePopover = new ColorPickerPopover({
      color: initialColor,
      opacity: initialOpacity,
      anchorEl: triggerEl,
      presets: ColorPickerPopover.getPresets(),

      onChange: (hexColor, alphaValue) => {
        this.manager.previewLayerVisuals(layer.id, { color: hexColor, opacity: alphaValue });
        if (triggerEl) triggerEl.style.backgroundColor = hexColor;
        hasPreviewChanges = true;
        this.onPreviewChange?.();
      },

      onChangeEnd: (hexColor, alphaValue, flags = {}) => {
        let committed = false;

        if (flags.colorChanged && initialColor !== hexColor) {
          this.service.executeCommand(
            new UpdateLayerPropertyCommand(this.manager, layer.id, 'color', initialColor, hexColor, panelRef)
          );
          committed = true;
        }

        if (flags.opacityChanged && Math.abs(initialOpacity - alphaValue) > 0.001) {
          this.service.executeCommand(
            new UpdateLayerPropertyCommand(this.manager, layer.id, 'opacity', initialOpacity, alphaValue, panelRef)
          );
          committed = true;
        }

        if (committed) {
          this.onCommitChange?.();
        }
      },

      onCancel: () => {
        if (!hasPreviewChanges) return;
        this.manager.previewLayerVisuals(layer.id, { color: initialColor, opacity: initialOpacity });
        if (triggerEl) triggerEl.style.backgroundColor = initialColor;
        this.onCommitChange?.();
      },

      onClose: () => {
        this.activePopover = null;
      }
    });
  }

  close() {
    if (this.activePopover && typeof this.activePopover.close === 'function') {
      this.activePopover.close();
      this.activePopover = null;
    }
  }

  _hexToHue(hex) {
    if (!hex || !hex.startsWith('#')) return null;
    let c = hex.substring(1);
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    if (c.length !== 6) return null;

    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;

    if (max !== min) {
      const d = max - min;
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return Math.round(h * 360);
  }

  _hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  }
}