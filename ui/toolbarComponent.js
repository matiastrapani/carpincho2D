/**
 * ui/toolbarComponent.js - Componente de UI (OSNAP, HUD, Toolbar Vertical y Slots)
 */
export class CADToolbarComponent {
  constructor(containerId = 'fixedConsoleContainer') {
    this.container = document.getElementById(containerId);
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `    
      <!-- Barra Inferior de Control -->
      <div class="relative w-full p-2 bg-[#121215] flex flex-col gap-1 pt-1 z-10 pointer-events-auto">
        <div class="flex flex-wrap items-center justify-between gap-2 w-full h-6 min-h-[24px]">
          
          <!-- OSNAP & Filtros -->
          <div class="h-6 flex items-center gap-1.5 overflow-x-auto max-w-full shrink-0 z-11">
            <button id="btnSnap" class="cad-button cad-button-square snap-btn active h-6 w-6 tooltip-top" data-tooltip="OSNAP [F3]">
              <i id="btnSnapIcon" class="fa-solid fa-magnet text-[10px]"></i>
            </button>

            <button id="btnGrid" class="cad-button cad-button-square snap-btn active h-6 w-6 tooltip-top" data-tooltip="GRID [F7]">
              <i class="fa-solid fa-border-all text-[10px]"></i>
            </button>

            <div class="flat-divider h-4"></div>

            <div class="flex items-center gap-1 text-xs h-6">
              <div id="chipEndpoint" class="snap-chip active rounded px-2 h-6 flex items-center justify-center gap-1.5 shrink-0">
                <span class="w-1.5 h-1.5 bg-zinc-300 rounded-none"></span>
                <span class="text-[11px] font-medium leading-none">Fin</span>
              </div>

              <div id="chipMidpoint" class="snap-chip active rounded px-2 h-6 flex items-center justify-center gap-1.5 shrink-0">
                <span class="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[6px] border-b-zinc-300"></span>
                <span class="text-[11px] font-medium leading-none">Medio</span>
              </div>

              <div id="chipCenter" class="snap-chip active rounded px-2 h-6 flex items-center justify-center gap-1.5 shrink-0">
                <span class="w-1.5 h-1.5 rounded-full border border-zinc-300"></span>
                <span class="text-[11px] font-medium leading-none">Centro</span>
              </div>

              <div id="chipQuadrant" class="snap-chip active rounded px-2 h-6 flex items-center justify-center gap-1.5 shrink-0">
                <span class="w-1.5 h-1.5 bg-zinc-300 rotate-45 transform"></span>
                <span class="text-[11px] font-medium leading-none">Cuad</span>
              </div>

              <div id="chipNode" class="snap-chip active rounded px-2 h-6 flex items-center justify-center gap-1.5 shrink-0">
                <span class="w-1.5 h-1.5 rounded-full bg-zinc-300"></span>
                <span class="text-[11px] font-medium leading-none">Punto</span>
              </div>

              <div id="chipIntersection" class="snap-chip active rounded px-2 h-6 flex items-center justify-center gap-1.5 shrink-0">
                <span class="text-zinc-300 text-[10px] font-bold leading-none">✕</span>
                <span class="text-[11px] font-medium leading-none">Int</span>
              </div>

              <div id="chipGrid" class="snap-chip rounded px-2 h-6 flex items-center justify-center gap-1.5 shrink-0">
                <span class="w-1.5 h-1.5 rounded-full bg-zinc-500"></span>
                <span class="text-[11px] font-medium leading-none">Ajustar a grilla</span>
              </div>
            </div>
          </div>

          <!-- Coordenadas & Zoom -->
          <div class="h-6 flex items-center gap-1 text-xs shrink-0 font-sans ml-auto">
            <div class="flat-divider h-4 shrink-0 hidden sm:block"></div>
            
            <div class="hidden sm:flex items-center gap-1 px-1 h-6 shrink-0">
              <div class="flex items-center gap-1 h-6">
                <span class="text-zinc-500 font-bold leading-none">X:</span>
                <span id="hudX" class="hud-value text-zinc-300 min-w-[55px] text-right font-medium text-[11px] leading-none">0.00</span>
              </div>
            </div>
            
            <div class="flat-divider h-4 shrink-0 hidden sm:block"></div>
            
            <div class="hidden sm:flex items-center gap-1 px-1 h-6 shrink-0">
              <div class="flex items-center gap-1 h-6">
                <span class="text-zinc-500 font-bold leading-none">Y:</span>
                <span id="hudY" class="hud-value text-zinc-300 min-w-[55px] text-right font-medium text-[11px] leading-none">0.00</span>
              </div>
            </div>

            <div class="flat-divider h-4 shrink-0 hidden sm:block"></div>

            <button id="btnZoomReset" class="hidden md:flex cad-button rounded items-center gap-1.5 px-2 h-6 shrink-0 text-zinc-400 hover:text-zinc-100 tooltip-top cursor-pointer" data-tooltip="Restablecer vista a 100% (Origen 0,0)">
              <span class="text-zinc-500 font-medium text-[10px] leading-none pointer-events-none">ZOOM:</span>
              <span id="hudZoom" class="hud-value text-zinc-300 min-w-[32px] text-right font-medium text-[11px] leading-none pointer-events-none">100%</span>
            </button>

            <div class="flat-divider h-4 shrink-0 hidden sm:block"></div>

            <div class="hidden md:flex items-center gap-1 h-6 shrink-0">
              <button id="btnExtents" class="cad-button cad-button-square h-6 w-6 text-zinc-400 hover:text-zinc-100 tooltip-top shrink-0" data-tooltip="Ajustar Vista (Extents)">
                <i class="fa-solid fa-compress-arrows-alt text-[10px]"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Slot reservado para la Consola Fija -->
        <div id="fixedConsoleSlot" class="w-full"></div>
      </div>

      <!-- Barra de Herramientas Flotante/Acoplada -->
      <div id="verticalToolbar" style="top: 16px; left: 16px; --tool-cols: 1;" class="toolbar-floating dock-left absolute cad-panel p-1 flex flex-col items-center gap-1 z-50 transition-none pointer-events-auto">
        <div id="toolbarDragHandle" class="drag-handle w-full py-1 flex items-center justify-center text-zinc-500 select-none tracking-widest text-[10px] font-bold" title="Arrastrar para mover">
          :::
        </div>

        <div id="toolbarWidthResizer" class="toolbar-resizer" title="Arrastrar para cambiar ancho y columnas"></div>

        <div id="toolGridContainer" class="tool-grid">
          <button id="btnSelect" class="cad-button cad-button-square" data-tooltip="Seleccionar & Mover Nodos">
            <span class="iconify" data-width="24" data-icon="custom:arrow"></span>
          </button>

          <div class="tool-divider"></div>

          <!-- Puntos Flyout -->
          <div class="relative">
            <button id="btnPointGroup" class="cad-button cad-button-square has-flyout" data-default-tool="point" data-tooltip="Herramientas de Punto">
              <span id="currentPointIcon" class="iconify" data-width="24" data-icon="custom:dot"></span>
            </button>

            <div id="pointFlyoutMenu" class="flyout-menu">
              <div id="optPoint" class="flyout-item" data-tool="point">
                <span class="iconify" data-width="24" data-icon="custom:dot"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Colocar Punto</span>
                  <span class="text-[10px] text-zinc-400">Puntos independientes</span>
                </div>
              </div>

              <div id="optDivideCount" class="flyout-item" data-tool="divide_count">
                <span class="iconify" data-width="24" data-icon="custom:divide"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Dividir por Cantidad</span>
                  <span class="text-[10px] text-zinc-400">Puntos equidistantes</span>
                </div>
              </div>

              <div id="optDivideDist" class="flyout-item" data-tool="divide_dist">
                <span class="iconify" data-width="24" data-icon="custom:dividelength"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Dividir por Distancia</span>
                  <span class="text-[10px] text-zinc-400">Puntos por intervalo</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Líneas Flyout -->
          <div class="relative">
            <button id="btnLineGroup" class="cad-button cad-button-square has-flyout" data-default-tool="line" data-tooltip="Líneas y Polilíneas">
              <span id="currentLineIcon" class="iconify" data-width="24" data-icon="custom:line"></span>
            </button>

            <div id="lineFlyoutMenu" class="flyout-menu">
              <div id="optLine" class="flyout-item" data-tool="line">
                <span class="iconify" data-width="24" data-icon="custom:line"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Línea Simple (L)</span>
                  <span class="text-[10px] text-zinc-400">Segmento único</span>
                </div>
              </div>
              <div id="optPolyline" class="flyout-item" data-tool="polyline">
                <span class="iconify" data-width="24" data-icon="custom:polyline"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Polilínea Continua (P)</span>
                  <span class="text-[10px] text-zinc-400">Secuencia de segmentos</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Círculos Flyout -->
          <div class="relative">
            <button id="btn-circle-tool" class="cad-button cad-button-square" data-tooltip="Círculo (Centro y Radio)">
              <span class="iconify" data-width="24" data-icon="custom:circle"></span>
            </button>
          </div>

          <!-- Importar Imagen -->
          <div class="relative">
            <button id="btnImportImage" class="cad-button cad-button-square" data-tooltip="Importar Imagen">
              <span class="iconify" data-width="24" data-icon="custom:image"></span>
            </button>
            <input type="file" id="inputImageFile" accept="image/*" style="display: none;" />
          </div>

          <div class="tool-divider"></div>

          <!-- Curvas Flyout -->
          <div class="relative">
            <button id="btnCurveGroup" class="cad-button cad-button-square has-flyout" data-default-tool="spline" data-tooltip="Curvas y Arcos">
              <span id="currentCurveIcon" class="iconify" data-width="24" data-icon="custom:spline"></span>
            </button>

            <div id="curveFlyoutMenu" class="flyout-menu">
              <div id="optSpline" class="flyout-item" data-tool="spline">
                <span class="iconify" data-width="24" data-icon="custom:spline"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Curva Spline (S)</span>
                  <span class="text-[10px] text-zinc-400">Curva suave por nodos</span>
                </div>
              </div>
              <div id="optBezier" class="flyout-item" data-tool="bezier">
                <i class="fa-solid fa-bezier-curve text-zinc-400 text-xs w-4 text-center"></i>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Curva Bézier (B)</span>
                  <span class="text-[10px] text-zinc-400">Bézier con manijas</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Edición -->
          <div class="tool-divider"></div>

          <button id="btnTrim" class="cad-button cad-button-square" data-tooltip="Recortar (Trim - T)">
            <span class="iconify" data-width="24" data-icon="custom:trim"></span>
          </button>

          <button id="btnExtend" class="cad-button cad-button-square" data-tooltip="Extender (Extend - EX)">
            <span class="iconify" data-width="24" data-icon="custom:extend"></span>
          </button>
        </div>
      </div>
    `;
  }
}