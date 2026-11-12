/**
 * PropertyControls.js - Controles de UI reutilizables (Selects personalizados y Scrub Inputs)
 * Encapsula la manipulación del DOM de controles y la gestión limpia de listeners globales.
 */

export class PropertyControls {
  static _listenersAttached = false;

  static _onDropdownClose = () => {
    document.querySelectorAll('.cad-custom-dropdown').forEach((d) => d.classList.add('hidden'));
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
      const trigger = wrapper.querySelector('button');
      const opt = selectEl.options[selectEl.selectedIndex];
      if (trigger && opt) {
        trigger.innerHTML = `<span class="truncate pr-1 text-left">${opt.text}</span><i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 shrink-0"></i>`;
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

      const originalIcon = select.parentNode ? select.parentNode.querySelector('i.fa-chevron-down') : null;
      if (originalIcon) originalIcon.style.display = 'none';

      const wrapper = document.createElement('div');
      wrapper.className = 'custom-select-wrapper flex-1 min-w-0';

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'w-full flex items-center justify-between bg-[#17171c] hover:bg-[#27272a] text-zinc-200 text-[11px] px-2.5 py-1 rounded border-none cursor-pointer outline-none';

      const dropdown = document.createElement('div');
      dropdown.className = 'cad-custom-dropdown hidden bg-[#17171c] rounded-b shadow-2xl max-h-48 overflow-y-auto py-1 border border-[#27272a] border-t-0';
      dropdown._triggerEl = trigger;

      const syncTrigger = () => {
        const opt = select.options[select.selectedIndex];
        trigger.innerHTML = `<span class="truncate pr-1 text-left">${opt ? opt.text : ''}</span><i class="fa-solid fa-chevron-down text-[8px] text-zinc-500 shrink-0"></i>`;
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
        PropertyControls._onDropdownClose();

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

  static attachScrubInput(
    containerEl,
    inputEl,
    onChange,
    { min = 0, max = null, step = 1, precision = 0, formatValue = null, onLiveChange = null } = {}
  ) {
    if (!containerEl || !inputEl) return;

    let isDragging = false;
    let startX = 0;
    let startVal = 0;
    let hasDragged = false;

    const parseInputValue = (v) => {
      if (v === '-' || v === '0') return 0;
      const parsed = parseFloat(v);
      return isNaN(parsed) ? 0 : parsed;
    };

    const formatOutput = (val) => {
      if (typeof formatValue === 'function') return formatValue(val);
      return precision > 0 ? val.toFixed(precision) : String(val);
    };

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      if (document.activeElement === inputEl) return;

      isDragging = true;
      hasDragged = false;
      startX = e.clientX;
      startVal = parseInputValue(inputEl.value);

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      window.addEventListener('blur', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;

      if (Math.abs(deltaX) > 2) {
        hasDragged = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';

        const sensitivity = precision > 0 ? 0.05 : 0.7;
        let newVal = startVal + deltaX * sensitivity;
        if (min !== null) newVal = Math.max(min, newVal);
        if (max !== null) newVal = Math.min(max, newVal);

        if (precision > 0) {
          newVal = parseFloat(newVal.toFixed(precision));
        } else {
          newVal = Math.round(newVal);
        }

        const formatted = formatOutput(newVal);

        if (inputEl.value !== formatted) {
          inputEl.value = formatted;
          if (typeof onLiveChange === 'function') onLiveChange(newVal);
        }
      }
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (hasDragged) {
        const finalVal = parseInputValue(inputEl.value);
        onChange(finalVal);
      } else {
        inputEl.focus();
        if (inputEl.select) inputEl.select();
      }
    };

    containerEl.addEventListener('mousedown', onMouseDown);

    inputEl.addEventListener('change', () => {
      let val = parseInputValue(inputEl.value);
      if (min !== null) val = Math.max(min, val);
      if (max !== null) val = Math.min(max, val);
      inputEl.value = formatOutput(val);
      onChange(val);
    });
  }
}