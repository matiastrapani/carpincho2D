/**
 * ui/components/LayerDeleteModal.js
 * Diálogo modal desacoplado para confirmar eliminación de capas con contenido.
 */

export class LayerDeleteModal {
  static _activeCleanup = null;

  static close() {
    if (typeof LayerDeleteModal._activeCleanup === 'function') {
      LayerDeleteModal._activeCleanup();
    }
  }

  static open({ layer, availableLayers, defaultTargetId, onConfirm }) {
    LayerDeleteModal.close();

    const overlay = document.createElement('div');
    overlay.id = 'deleteLayerModalOverlay';
    overlay.className = 'fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center select-none';

    overlay.innerHTML = `
      <div class="bg-[#17171c] border border-[#27272a] rounded-md shadow-2xl w-[320px] p-4 text-zinc-300 font-sans text-xs">
        <div class="flex items-center justify-between mb-2">
          <span data-modal-title class="font-bold text-zinc-200 uppercase tracking-wider text-[11px] truncate pr-2"></span>
          <button type="button" data-modal-action="close" data-tooltip="Cerrar" class="tooltip-top-right text-zinc-500 hover:text-zinc-200 cursor-pointer flex items-center justify-center w-5 h-5">
            <span class="iconify text-sm" data-icon="lucide:x"></span>
          </button>
        </div>
        <p class="text-zinc-400 text-[11px] mb-3 leading-relaxed">
          Esta capa contiene elementos en el dibujo. ¿Qué deseás hacer con ellos?
        </p>

        <div class="space-y-2 mb-4">
          <label class="flex items-center gap-2 cursor-pointer text-[11px] text-zinc-200">
            <input type="radio" name="delLayerAction" value="move" checked class="accent-[#008800] cursor-pointer">
            <span>Mover contenido a:</span>
          </label>
          <div class="pl-5">
            <select id="dlgTargetLayerSelect" class="w-full bg-[#121215] border border-[#27272a] text-zinc-200 text-[11px] px-2 py-1.5 rounded outline-none cursor-pointer"></select>
          </div>

          <label class="flex items-center gap-2 cursor-pointer text-[11px] text-red-400 pt-1">
            <input type="radio" name="delLayerAction" value="delete" class="accent-red-500 cursor-pointer">
            <span>Eliminar también el contenido</span>
          </label>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-[#27272a]">
          <button type="button" data-modal-action="close" class="px-3 py-1 rounded bg-[#27272a] hover:bg-[#323238] text-zinc-300 text-[11px] cursor-pointer transition-colors">
            Cancelar
          </button>
          <button type="button" data-modal-action="accept" class="px-3 py-1 rounded bg-[#008800] hover:brightness-110 text-white font-semibold text-[11px] cursor-pointer transition-colors">
            Aceptar
          </button>
        </div>
      </div>
    `;

    const titleEl = overlay.querySelector('[data-modal-title]');
    if (titleEl) {
      titleEl.textContent = `Eliminar capa "${layer.name}"`;
    }

    const selectEl = overlay.querySelector('#dlgTargetLayerSelect');
    availableLayers.forEach((l) => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      if (String(l.id) === String(defaultTargetId)) {
        opt.selected = true;
      }
      selectEl.appendChild(opt);
    });

    const radios = overlay.querySelectorAll('input[name="delLayerAction"]');

    const onKeyDown = (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') {
        ev.preventDefault();
        LayerDeleteModal.close();
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        confirmModal();
      }
    };

    LayerDeleteModal._activeCleanup = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
      LayerDeleteModal._activeCleanup = null;
    };

    const confirmModal = () => {
      const action = overlay.querySelector('input[name="delLayerAction"]:checked')?.value;
      const targetId = action === 'move' ? selectEl.value : null;
      LayerDeleteModal.close();
      if (typeof onConfirm === 'function') onConfirm(targetId);
    };

    document.addEventListener('keydown', onKeyDown, true);

    radios.forEach((radio) => {
      radio.addEventListener('change', () => {
        const isMove = radio.value === 'move' && radio.checked;
        selectEl.disabled = !isMove;
        selectEl.classList.toggle('opacity-40', !isMove);
      });
    });

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) {
        LayerDeleteModal.close();
        return;
      }
      const actionBtn = ev.target.closest('[data-modal-action]');
      if (!actionBtn) return;
      if (actionBtn.dataset.modalAction === 'close') LayerDeleteModal.close();
      if (actionBtn.dataset.modalAction === 'accept') confirmModal();
    });

    document.body.appendChild(overlay);
    overlay.querySelector('[data-modal-action="accept"]')?.focus();
  }
}