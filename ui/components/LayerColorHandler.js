/**
 * ui/components/LayerColorHandler.js
 * Gestiona el selector de color/opacidad de capas y la generación de colores distinguibles.
 */

import { CAD_THEME } from '../../config/cadTheme.js';
import { ColorPickerPopover } from './ColorPickerPopover.js';
import { UpdateLayerPropertyCommand } from '../../services/commands/LayerCommands.js';
import { ColorMath } from './ColorMath.js';

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
      .map((l) => {
        const hex = ColorMath.normalizeToHex(l.color, null);
        return hex ? ColorMath.hexToHsb(hex).h : null;
      })
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

    return ColorMath.hslToHex(bestHue, 85, 55);
  }

  open(layer, triggerEl) {
    this.close();

    const fallbackColor = this.getDefaultColor().toUpperCase();
    const initialColor = ColorMath.normalizeToHex(layer.color, fallbackColor);
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
        const oldProps = {};
        const newProps = {};

        if (flags.colorChanged && initialColor !== hexColor) {
          oldProps.color = initialColor;
          newProps.color = hexColor;
        }

        if (flags.opacityChanged && Math.abs(initialOpacity - alphaValue) > 0.001) {
          oldProps.opacity = initialOpacity;
          newProps.opacity = alphaValue;
        }

        if (Object.keys(newProps).length > 0) {
          this.service.executeCommand(
            new UpdateLayerPropertyCommand(this.manager, layer.id, oldProps, newProps)
          );
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

}