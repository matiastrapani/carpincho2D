/**
 * ColorMath.js - Funciones puras de conversión entre espacios de color (HEX, RGB, HSL, HSB)
 * y parseo de cadenas ingresadas por el usuario.
 */

export class ColorMath {
  static hsbToRgb(h, s, b) {
    s /= 100;
    b /= 100;
    const k = (n) => (n + h / 60) % 6;
    const f = (n) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
    return {
      r: Math.round(255 * f(5)),
      g: Math.round(255 * f(3)),
      b: Math.round(255 * f(1))
    };
  }

  static rgbToHsb(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : (d / max) * 100;
    const v = max * 100;

    if (max !== min) {
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s), b: Math.round(v) };
  }

  static hsbToHsl(h, s, b) {
    s /= 100;
    b /= 100;
    const l = b * (1 - s / 2);
    const sl = (l === 0 || l === 1) ? 0 : (b - l) / Math.min(l, 1 - l);
    return { h: Math.round(h), s: Math.round(sl * 100), l: Math.round(l * 100) };
  }

  static hslToHsb(h, s, l) {
    s /= 100;
    l /= 100;
    const b = l + s * Math.min(l, 1 - l);
    const sb = b === 0 ? 0 : 2 * (1 - l / b);
    return { h: Math.round(h), s: Math.round(sb * 100), b: Math.round(b * 100) };
  }

  static hsbToHex(h, s, b) {
    const { r, g, b: blue } = ColorMath.hsbToRgb(h, s, b);
    return `#${[r, g, blue].map((x) => x.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }

  static hexToHsb(hex) {
    let c = (hex || '#000000').replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const r = parseInt(c.substring(0, 2), 16) || 0;
    const g = parseInt(c.substring(2, 4), 16) || 0;
    const b = parseInt(c.substring(4, 6), 16) || 0;
    return ColorMath.rgbToHsb(r, g, b);
  }

  static formatDisplay(format, h, s, b) {
    const pad3 = (n) => String(n).padStart(3, ' ');
    if (format === 'HEX') {
      return ColorMath.hsbToHex(h, s, b).replace('#', '').toUpperCase();
    }
    if (format === 'RGB') {
      const { r, g, b: blue } = ColorMath.hsbToRgb(h, s, b);
      return `${pad3(r)}, ${pad3(g)}, ${pad3(blue)}`;
    }
    if (format === 'HSL' || format === 'HLS') {
      const { h: hh, s: ss, l } = ColorMath.hsbToHsl(h, s, b);
      return `${pad3(hh)}, ${pad3(ss)}%, ${pad3(l)}%`;
    }
    return `${pad3(Math.round(h))}, ${pad3(Math.round(s))}%, ${pad3(Math.round(b))}%`;
  }

  static parseInput(format, rawStr) {
    const val = rawStr.trim();
    if (!val) return null;

    if (format === 'HEX') {
      const cleanHex = val.replace('#', '');
      return /^[0-9A-Fa-f]{6}$/.test(cleanHex) ? ColorMath.hexToHsb(`#${cleanHex}`) : null;
    }

    const cleanStr = val.replace(/(RGB|HSL|HLS|HSV|HSB|%|#)/gi, '');
    const nums = cleanStr.split(/[\s,]+/).map((n) => parseFloat(n)).filter((n) => !isNaN(n));
    if (nums.length < 3) return null;

    if (format === 'RGB') {
      return ColorMath.rgbToHsb(
        Math.max(0, Math.min(255, nums[0])),
        Math.max(0, Math.min(255, nums[1])),
        Math.max(0, Math.min(255, nums[2]))
      );
    }
    if (format === 'HSL' || format === 'HLS') {
      return ColorMath.hslToHsb(
        Math.max(0, Math.min(360, nums[0])),
        Math.max(0, Math.min(100, nums[1])),
        Math.max(0, Math.min(100, nums[2]))
      );
    }
    return {
      h: Math.max(0, Math.min(360, nums[0])),
      s: Math.max(0, Math.min(100, nums[1])),
      b: Math.max(0, Math.min(100, nums[2]))
    };
  }
}