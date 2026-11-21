/**
 * services/input/ShortcutResolver.js - Resolución de atajos de teclado por plataforma
 */

import { CAD_THEME } from '../../config/cadTheme.js';

export function isMacPlatform() {
  if (typeof navigator === 'undefined') return false;
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function getShortcutLabel(actionKey, theme = CAD_THEME) {
  const shortcuts = theme && theme.shortcuts ? theme.shortcuts : {};
  const entry = shortcuts[actionKey];
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  return isMacPlatform() ? (entry.mac || entry.win || '') : (entry.win || entry.mac || '');
}