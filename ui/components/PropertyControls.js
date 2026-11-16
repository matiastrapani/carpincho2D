/**
 * PropertyControls.js - Controles de UI reutilizables (Selects personalizados y Scrub Inputs)
 * Encapsula la manipulación del DOM de controles y la gestión limpia de listeners globales.
 */

export class PropertyControls {
  static _listenersAttached = false;

  static closeAllDropdowns() {
    document.querySelectorAll('.cad-custom-dropdown').forEach((d) => d.classList.add('hidden'));
  }

  static _onDropdownClose = () => {
    PropertyControls.closeAllDropdowns();
  };

  static _onDropdownSync = () => {
    document.querySelectorAll('.cad-custom-dropdown:not(.hidden)').forEach((d) => {
      if (typeof d._updatePos === 'function') d._updatePos();
    });
  };

  static _onDropdownKeyDown = (e) => {
    if (e.key === 'Escape') PropertyControls._onDropdownClose();
  };

  static ensureGlobalListeners() {
    if (PropertyControls._listenersAttached) return;
    PropertyControls._listenersAttached = true;
    document.addEventListener('click', PropertyControls._onDropdownClose);
    window.addEventListener('scroll', PropertyControls._onDropdownSync, true);
    window.addEventListener('resize', PropertyControls._onDropdownSync);
    document.addEventListener('keydown', PropertyControls._onDropdownKeyDown);
  }

  static cleanup() {
    document.querySelectorAll('.cad-custom-dropdown').forEach((d) => d.remove());

    if (PropertyControls._listenersAttached) {
      document.removeEventListener('click', PropertyControls._onDropdownClose);
      window.removeEventListener('scroll', PropertyControls._onDropdownSync, true);
      window.removeEventListener('resize', PropertyControls._onDropdownSync);
      document.removeEventListener('keydown', PropertyControls._onDropdownKeyDown);
      PropertyControls._listenersAttached = false;
    }
  }

  static updateSelectValue(selectEl, value) {
    if (!selectEl) return;
    PropertyControls.updateSelectValueSilently(selectEl, value);
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  static updateSelectValueSilently(selectEl, value) {
    if (!selectEl) return;
    selectEl.value = value;

    const wrapper = selectEl.nextElementSibling;
    if (wrapper && wrapper.classList.contains('custom-select-wrapper')) {
      const label = wrapper.querySelector('.select-label');
      const opt = selectEl.options[selectEl.selectedIndex];
      if (label && opt && label.textContent !== opt.text) {
        label.textContent = opt.text;
      }
    }
  }

  static convertSelectsToCustom(container) {
    if (!container) return;

    // Eliminar dropdowns flotantes cuyos botones disparadores ya no estén en el DOM
    document.querySelectorAll('.cad-custom-dropdown').forEach((d) => {
      if (d._triggerEl && !d._triggerEl.isConnected) {
        d.remove();
      }
    });

    container.querySelectorAll('select').forEach((select) => {
      if (select.dataset.customized) return;
      select.dataset.customized = 'true';
      select.style.display = 'none';

      const wrapper = document.createElement('div');
      wrapper.className = 'custom-select-wrapper flex-1 min-w-0';

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'w-full flex items-center justify-between bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2.5 py-1 rounded border-none cursor-pointer outline-none';
      trigger.innerHTML = `<span class="select-label truncate pr-1 text-left"></span><span class="iconify text-xs text-zinc-500 icon-crisp shrink-0" data-icon="lucide:chevron-down"></span>`;

      const labelSpan = trigger.querySelector('.select-label');

      const dropdown = document.createElement('div');
      dropdown.className = 'cad-custom-dropdown hidden bg-[#17171c] rounded-b shadow-2xl max-h-48 overflow-y-auto py-1 border border-[#27272a] border-t-0';
      dropdown._triggerEl = trigger;

      const syncTrigger = () => {
        const opt = select.options[select.selectedIndex];
        const nextText = opt ? opt.text : '';
        if (labelSpan && labelSpan.textContent !== nextText) {
          labelSpan.textContent = nextText;
        }
      };

      const updatePosition = () => {
        const rect = trigger.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = `${rect.bottom}px`;
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.width = `${rect.width}px`;
        dropdown.style.zIndex = '99999';
      };

      const renderOptions = () => {
        dropdown.innerHTML = '';
        Array.from(select.options).forEach((opt) => {
          const item = document.createElement('div');
          const active = opt.selected;
          item.className = `px-2.5 py-1.5 text-[11px] cursor-pointer ${
            active ? 'font-bold text-white bg-[#27272a]' : 'font-normal text-zinc-400 hover:text-white hover:bg-[#222226]'
          }`;
          item.textContent = opt.text;

          item.addEventListener('click', (e) => {
            e.stopPropagation();
            select.value = opt.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            dropdown.classList.add('hidden');
            syncTrigger();
          });
          dropdown.appendChild(item);
        });
      };

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !dropdown.classList.contains('hidden');
        PropertyControls.closeAllDropdowns();

        if (!isOpen) {
          renderOptions();
          updatePosition();
          dropdown.classList.remove('hidden');
          dropdown._updatePos = updatePosition;
        }
      });

      select.addEventListener('change', syncTrigger);

      wrapper.appendChild(trigger);
      document.body.appendChild(dropdown);
      select.parentNode.insertBefore(wrapper, select.nextSibling);
      syncTrigger();
    });

    PropertyControls.ensureGlobalListeners();
  }

  static attachInputIsolation(container) {
    if (!container) return;

    container.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('focus', () => {
        if (el.tagName === 'INPUT' && el.type === 'text') el.select();
      });
      el.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') el.blur();
      });
      el.addEventListener('keyup', (e) => e.stopPropagation());
    });
  }

  static attachScrubInput(container, input, onChange, options = {}) {
    if (!container || !input || typeof onChange !== 'function') return;

    const {
      min = 0,
      max = null,
      step = 1,
      precision = 0,
      formatValue = null,
      onLiveChange = null,
      onScrubStart = null
    } = options;

    const factor = Math.pow(10, precision);
    const clampAndRound = (raw) => {
      const num = parseFloat(String(raw).replace(',', '.'));
      if (Number.isNaN(num)) return null;
      let clamped = num;
      if (min !== null && clamped < min) clamped = min;
      if (max !== null && clamped > max) clamped = max;
      return Math.round(clamped * factor) / factor;
    };

    const formatDisplay = (val) => {
      if (typeof formatValue === 'function') return formatValue(val);
      return precision > 0 ? val.toFixed(precision) : String(Math.round(val));
    };

    let startX = 0;
    let startVal = 0;
    let isDragging = false;
    let hasMoved = false;
    let hasStarted = false;

    const triggerStart = () => {
      if (!hasStarted) {
        hasStarted = true;
        onScrubStart?.();
      }
    };

    input.addEventListener('focus', () => {
      triggerStart();
    });

    input.addEventListener('change', () => {
      const validVal = clampAndRound(input.value);
      hasStarted = false;
      if (validVal === null) return;
      input.value = formatDisplay(validVal);
      onChange(validVal);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        hasStarted = false;
        input.blur();
      }
    });

    container.addEventListener('pointerdown', (e) => {
      if (document.activeElement === input && e.target === input) return;

      e.preventDefault();
      triggerStart();

      startX = e.clientX;
      const parsed = clampAndRound(input.value);
      startVal = parsed !== null ? parsed : (min !== null ? min : 0);
      isDragging = true;
      hasMoved = false;

      container.setPointerCapture?.(e.pointerId);
      document.body.style.cursor = 'ew-resize';
    });

    container.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      if (!hasMoved && Math.abs(dx) < 3) return;

      hasMoved = true;
      const multiplier = e.shiftKey ? 0.25 : 0.5;
      const nextVal = clampAndRound(startVal + dx * multiplier * step);
      if (nextVal === null) return;

      input.value = formatDisplay(nextVal);
      onLiveChange?.(nextVal);
    });

    const finishDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      container.releasePointerCapture?.(e.pointerId);
      document.body.style.cursor = '';

      if (!hasMoved) {
        hasStarted = false;
        triggerStart();
        input.focus();
        input.select();
        return;
      }

      hasStarted = false;
      const finalVal = clampAndRound(input.value);
      if (finalVal !== null) {
        input.value = formatDisplay(finalVal);
        onChange(finalVal);
      }
    };

    container.addEventListener('pointerup', finishDrag);
    container.addEventListener('pointercancel', finishDrag);
  }
}