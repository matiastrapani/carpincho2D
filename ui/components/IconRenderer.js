// ui/components/IconRenderer.js - Motor local de inyección SVG

import { CUSTOM_ICONS, LUCIDE_PATHS } from '../../icons/icons.js';

const ICON_REGISTRY = { ...CUSTOM_ICONS };

for (const [name, paths] of Object.entries(LUCIDE_PATHS)) {
  ICON_REGISTRY[`lucide:${name}`] = {
    width: 24,
    height: 24,
    body: `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`
  };
}

function renderIconElement(el) {
  const iconName = el.getAttribute('data-icon');
  if (!iconName) return;

  const icon = ICON_REGISTRY[iconName];
  if (!icon) {
    console.warn(`[icons.js] Ícono no registrado: "${iconName}"`);
    return;
  }

  // Si ya es un <svg> y cambió data-icon (ej. chevron-down <-> chevron-up), actualiza in-place
  if (el.tagName.toLowerCase() === 'svg') {
    el.setAttribute('viewBox', `0 0 ${icon.width} ${icon.height}`);
    el.innerHTML = icon.body;
    return;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${icon.width} ${icon.height}`);
  svg.setAttribute('width', '1em');
  svg.setAttribute('height', '1em');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-icon', iconName);

  if (el.id) svg.id = el.id;
  if (el.className) svg.setAttribute('class', el.className);
  svg.style.display = 'inline-block';
  svg.style.verticalAlign = '-0.125em';
  svg.innerHTML = icon.body;

  el.replaceWith(svg);
}

function renderAllIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(renderIconElement);
}

const iconObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === 'attributes' && m.attributeName === 'data-icon') {
      renderIconElement(m.target);
    } else if (m.type === 'childList') {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.hasAttribute?.('data-icon')) renderIconElement(node);
        node.querySelectorAll?.('[data-icon]').forEach(renderIconElement);
      }
    }
  }
});

iconObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-icon']
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => renderAllIcons());
} else {
  renderAllIcons();
}