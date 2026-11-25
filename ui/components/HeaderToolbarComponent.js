/**
 * ui/components/HeaderToolbarComponent.js - Barra de acciones rápidas en la cabecera
 */

export class HeaderToolbarComponent {
  constructor(containerId = 'headerToolbarContainer') {
    this.containerId = containerId;
    this.hasHiddenEntities = false;
    this.hasLockedEntities = false;
  }

  render() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.innerHTML = `
      <button id="btnHeaderNew" class="cad-button cad-button-square h-8 w-8 tooltip-bottom" data-tooltip="Nuevo dibujo">
        <span class="iconify text-lg" data-icon="lucide:file"></span>
      </button>

      <button id="btnHeaderOpen" class="cad-button cad-button-square h-8 w-8 tooltip-bottom" data-tooltip="Abrir dibujo">
        <span class="iconify text-lg translate-y-[1.5px]" data-icon="lucide:folder-open"></span>
      </button>

      <button id="btnHeaderSave" class="cad-button cad-button-square h-8 w-8 tooltip-bottom" data-tooltip="Guardar dibujo">
        <span class="iconify text-lg translate-y-[1px]" data-icon="lucide:save"></span>
      </button>

      <button id="btnHeaderExportSVG" class="cad-button cad-button-square h-8 w-8 flex items-center text-xs tooltip-bottom" data-tooltip="Exportar dibujo a SVG">
        <span class="iconify text-lg translate-y-[1px]" data-icon="lucide:cloud-download"></span>
      </button>

      <div class="flat-divider h-4 mx-1"></div>

      <button id="btnHeaderUndo" class="cad-button cad-button-square h-8 w-8 tooltip-bottom" data-tooltip="Deshacer [{shortcut:undo}]">
        <span class="iconify text-xl" data-icon="lucide:undo-2"></span>
      </button>

      <button id="btnHeaderRedo" class="cad-button cad-button-square h-8 w-8 tooltip-bottom" data-tooltip="Rehacer [{shortcut:redo}]">
        <span class="iconify text-xl" data-icon="lucide:redo-2"></span>
      </button>

      <div class="flat-divider h-4 mx-1"></div>

      <button id="btnHeaderVisibility" class="cad-button cad-button-square h-8 w-8 tooltip-bottom tooltip-align-left" oncontextmenu="return false;">
        <span class="iconify text-lg translate-y-[1px]" data-icon="lucide:eye-closed"></span>
      </button>

      <button id="btnHeaderLock" class="cad-button cad-button-square h-8 w-8 tooltip-bottom tooltip-align-left" oncontextmenu="return false;">
        <span class="iconify text-lg" data-icon="lucide:lock"></span>
      </button>
    `;

    this.updateTooltips();
  }

  updateTooltips({ hasHidden = this.hasHiddenEntities, hasLocked = this.hasLockedEntities } = {}) {
    this.hasHiddenEntities = Boolean(hasHidden);
    this.hasLockedEntities = Boolean(hasLocked);

    const btnVisibility = document.getElementById('btnHeaderVisibility');
    if (btnVisibility) {
      btnVisibility.classList.toggle('text-zinc-200', this.hasHiddenEntities);

      const secondLine = this.hasHiddenEntities
        ? `{icon:lucide:mouse-right} Desocultar todo`
        : `<span class="cad-tooltip-line text-zinc-500">{icon:lucide:mouse-right} Desocultar todo</span>`;

      btnVisibility.setAttribute(
        'data-tooltip',
        `{icon:lucide:mouse-left} Ocultar selección\n${secondLine}`
      );
    }

    const btnLock = document.getElementById('btnHeaderLock');
    if (btnLock) {
      btnLock.classList.toggle('text-zinc-200', this.hasLockedEntities);

      const secondLine = this.hasLockedEntities
        ? `{icon:lucide:mouse-right} Desbloquear todo`
        : `<span class="cad-tooltip-line text-zinc-500">{icon:lucide:mouse-right} Desbloquear todo</span>`;

      btnLock.setAttribute(
        'data-tooltip',
        `{icon:lucide:mouse-left} Bloquear selección\n${secondLine}`
      );
    }
  }

  flashButtonIcon(btnId, activeIconName, minDurationMs = 220) {
    const btn = document.getElementById(btnId);
    const iconEl = btn?.querySelector('.iconify');
    if (!btn || !iconEl) return () => {};

    const defaultIconName = iconEl.getAttribute('data-default-icon') || iconEl.getAttribute('data-icon');
    if (!iconEl.hasAttribute('data-default-icon') && defaultIconName) {
      iconEl.setAttribute('data-default-icon', defaultIconName);
    }

    clearTimeout(btn._iconFlashTimer);
    iconEl.setAttribute('data-icon', activeIconName);
    if (window.Iconify?.scan) {
      window.Iconify.scan(btn);
    }

    const startedAt = performance.now();
    let released = false;

    const restore = () => {
      if (defaultIconName) {
        iconEl.setAttribute('data-icon', defaultIconName);
        if (window.Iconify?.scan) {
          window.Iconify.scan(btn);
        }
      }
    };

    return () => {
      if (released) return;
      released = true;
      const elapsed = performance.now() - startedAt;
      const remaining = Math.max(0, minDurationMs - elapsed);
      clearTimeout(btn._iconFlashTimer);
      if (remaining === 0) {
        restore();
      } else {
        btn._iconFlashTimer = setTimeout(restore, remaining);
      }
    };
  }
}