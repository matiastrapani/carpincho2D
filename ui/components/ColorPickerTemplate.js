/**
 * ui/components/ColorPickerTemplate.js
 * Plantillas HTML puras para el popover selector de color.
 */

export class ColorPickerTemplate {
  static buildPopoverHTML({ format, opacity, presets }) {
    const pct = Math.round(opacity * 100);
    const fmtBtnClass = (fmt) =>
      `cp-fmt-btn py-0.5 rounded transition-colors font-sans ${format === fmt ? 'bg-[#27272a] text-zinc-200' : 'hover:text-zinc-300'}`;

    return `
      <div id="cpHeader" class="flex items-center justify-between pb-1 border-b border-[#2a2a32] cursor-grab active:cursor-grabbing select-none">
        <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">SELECCIONAR COLOR</span>
        <button type="button" id="cpCloseBtn" class="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 text-xs rounded hover:bg-[#27272a] cursor-pointer tooltip-bottom" data-tooltip="Cerrar">
          <span class="iconify text-xs icon-crisp shrink-0" data-icon="lucide:x"></span>
        </button>
      </div>

      <div class="flex gap-2 h-[140px] w-full">
        <div class="relative flex-1 h-full rounded overflow-hidden cursor-crosshair border border-[#2a2a32] touch-none" id="cpSatValContainer">
          <canvas id="cpSatValCanvas" class="w-full h-full block"></canvas>
          <div id="cpSatValHandle" class="absolute w-3 h-3 border-2 border-white rounded-full shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>
        </div>

        <div class="relative w-3.5 h-full rounded overflow-hidden cursor-pointer border border-[#2a2a32] touch-none" id="cpHueContainer">
          <div class="w-full h-full" style="background: linear-gradient(to bottom, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%);"></div>
          <div id="cpHueHandle" class="absolute left-1/2 w-3 h-3 border-2 border-white rounded-full shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>
        </div>

        <div class="relative w-3.5 h-full rounded overflow-hidden cursor-pointer border border-[#2a2a32] touch-none" id="cpAlphaContainer">
          <div class="w-full h-full bg-[linear-gradient(45deg,#2a2a32_25%,transparent_25%),linear-gradient(-45deg,#2a2a32_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#2a2a32_75%),linear-gradient(-45deg,transparent_75%,#2a2a32_75%)] bg-[size:6px_6px] bg-[position:0_0,0_3px,3px_-3px,-3px_0]">
            <div id="cpAlphaGradient" class="w-full h-full"></div>
          </div>
          <div id="cpAlphaHandle" class="absolute left-1/2 w-3 h-3 border-2 border-white rounded-full shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"></div>
        </div>
      </div>

      <div class="grid grid-cols-4 bg-[#121215] p-0.5 rounded text-[10px] font-normal text-zinc-400 uppercase tracking-wider font-sans">
        <button type="button" data-fmt="HEX" class="${fmtBtnClass('HEX')}">Hex</button>
        <button type="button" data-fmt="RGB" class="${fmtBtnClass('RGB')}">RGB</button>
        <button type="button" data-fmt="HSL" class="${fmtBtnClass('HSL')}">HSL</button>
        <button type="button" data-fmt="HSB" class="${fmtBtnClass('HSB')}">HSB</button>
      </div>

      <div class="flex items-center gap-1.5">
        <button type="button" id="cpEyedropperBtn" class="cad-button cad-button-square h-6 w-6 text-zinc-400 hover:text-zinc-100 shrink-0 tooltip-top" data-tooltip="Cuentagotas">
          <span class="iconify text-xs icon-crisp shrink-0" data-icon="lucide:pipette"></span>
        </button>

        <div id="cpInputsContainer" class="flex-1 flex items-center bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded transition-colors"></div>

        <div id="cpAlphaContainerInput" class="flex items-center justify-end w-[50px] shrink-0 bg-[#17171c] hover:bg-[#27272a] text-[11px] px-2 py-1 rounded cursor-ew-resize border-0 outline-none transition-colors tooltip-top" data-tooltip="Haz clic para editar o arrastra">
          <input type="number" id="cpAlphaInput" min="0" max="100" value="${pct}" class="w-7 bg-transparent text-right outline-none border-0 text-zinc-300 text-[11px] font-sans tabular-nums p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-ew-resize focus:cursor-text" />
          <span class="text-[11px] text-zinc-500 font-sans tabular-nums ml-0.5 pointer-events-none">%</span>
        </div>
      </div>

      <div class="flex flex-col gap-1.5 pt-1 border-t border-[#2a2a32]">
        <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">MUESTRAS</span>
        <div class="grid grid-cols-10 gap-1.5 items-center">
          ${presets.map((c) => `
            <button type="button" class="cp-swatch w-full aspect-square rounded-sm hover:scale-110 transition-transform cursor-pointer shrink-0" style="background-color: ${c}" data-color="${c}"></button>
          `).join('')}
        </div>
      </div>
    `;
  }

  static buildValueInputHTML(format) {
    const prefixLabel = format === 'HEX' ? '#' : format;
    const extraClass = format === 'HEX' ? 'uppercase' : '';
    return `
      <div class="flex items-center bg-transparent w-full">
        <span class="text-zinc-500 text-[10px] select-none mr-1.5 font-sans font-medium shrink-0">${prefixLabel}</span>
        <input id="cpValueInput" type="text" class="bg-transparent text-zinc-200 text-[11px] font-sans tabular-nums outline-none w-full ${extraClass}" />
      </div>`;
  }
}