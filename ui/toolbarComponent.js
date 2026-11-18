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
      <div class="relative w-full p-2 bg-[#121215] flex flex-col gap-hud z-10 pointer-events-auto">
        <div class="flex flex-wrap items-center justify-between gap-2 w-full h-5">
          
          <!-- OSNAP & Filtros -->
          <div class="h-5 flex items-center gap-1 max-w-full shrink-0 z-11">
            <button id="btnSnap" type="button" class="cad-button cad-button-square snap-btn active h-5 w-6 tooltip-top-left" data-tooltip="Refobj [F3]">
              <span class="iconify text-xs icon-crisp shrink-0" data-icon="lucide:magnet"></span>
            </button>

            <button id="btnGrid" type="button" class="cad-button cad-button-square snap-btn active h-5 w-6 tooltip-top" data-tooltip="Grilla [F7]">
              <span class="iconify text-xs shrink-0" data-icon="lucide:grid-3x3"></span>
            </button>

            <div class="flat-divider h-4"></div>

            <div class="flex items-center gap-1 text-xs h-5">
              <button id="chipEndpoint" type="button" class="snap-chip active rounded px-2 h-5 flex items-center justify-center gap-1.5 tooltip-top shrink-0">
                <svg class="shrink-0" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="2" width="8" height="8"/>
                </svg>
                <span class="text-[11px] font-medium leading-none">Fin</span>
              </button>

              <button id="chipNearest" type="button" class="snap-chip rounded px-2 h-5 flex items-center justify-center gap-1.5 tooltip-top shrink-0">
                <svg class="shrink-0" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 2h8L2 10h8L2 2z"/>
                </svg>
                <span class="text-[11px] font-medium leading-none">Cerca</span>
              </button>

              <button id="chipNode" type="button" class="snap-chip active rounded px-2 h-5 flex items-center justify-center gap-1.5 tooltip-top shrink-0">
                <svg class="shrink-0" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="6" cy="6" r="3.5"/>
                  <circle cx="6" cy="6" r="1.1" fill="currentColor" stroke="none"/>
                </svg>
                <span class="text-[11px] font-medium leading-none">Punto</span>
              </button>

              <button id="chipMidpoint" type="button" class="snap-chip active rounded px-2 h-5 flex items-center justify-center gap-1.5 tooltip-top shrink-0">
                <svg class="shrink-0" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="6,2 10.5,10 1.5,10"/>
                </svg>
                <span class="text-[11px] font-medium leading-none">Medio</span>
              </button>

              <button id="chipCenter" type="button" class="snap-chip active rounded px-2 h-5 flex items-center justify-center gap-1.5 tooltip-top shrink-0">
                <svg class="shrink-0" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="6" cy="6" r="4"/>
                </svg>
                <span class="text-[11px] font-medium leading-none">Centro</span>
              </button>

              <button id="chipIntersection" type="button" class="snap-chip active rounded px-2 h-5 flex items-center justify-center gap-1.5 tooltip-top shrink-0">
                <svg class="shrink-0" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/>
                </svg>
                <span class="text-[11px] font-medium leading-none">Int</span>
              </button>

              <button id="chipPerpendicular" type="button" class="snap-chip active rounded px-2 h-5 flex items-center justify-center gap-1.5 tooltip-top shrink-0">
                <svg class="shrink-0" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2.5 2v7.5H10M2.5 6H6v3.5"/>
                </svg>
                <span class="text-[11px] font-medium leading-none">Perp</span>
              </button>

              <button id="chipTangent" type="button" class="snap-chip rounded px-2 h-5 flex items-center justify-center gap-1.5 tooltip-top shrink-0">
                <svg class="shrink-0" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="1.5" y1="2.2" x2="10.5" y2="2.2"/>
                  <circle cx="6" cy="6.8" r="3.4"/>
                </svg>
                <span class="text-[11px] font-medium leading-none">Tan</span>
              </button>

              <button id="chipQuadrant" type="button" class="snap-chip active rounded px-2 h-5 flex items-center justify-center gap-1.5 tooltip-top shrink-0">
                <svg class="shrink-0" width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="6,1.5 10.5,6 6,10.5 1.5,6"/>
                </svg>
                <span class="text-[11px] font-medium leading-none">Cuad</span>
              </button>
            </div>

            <div class="flat-divider h-4"></div>

            <button id="btnOrtho" type="button" class="snap-chip rounded px-2 h-5 flex items-center justify-center gap-1.5 tooltip-top shrink-0" data-tooltip="Ortogonal [F8]">
              <span class="text-[11px] font-medium leading-none">Orto</span>
            </button>

            <button id="chipGrid" type="button" class="snap-chip rounded px-2 h-5 flex items-center justify-center gap-1.5 tooltip-top shrink-0" data-tooltip="Ajustar a grilla [F9]">
              <span class="text-[11px] font-medium leading-none">Ajustar a grilla</span>
            </button>


          </div>

          <!-- Coordenadas & Zoom -->
          <div class="h-5 flex items-center gap-1 text-xs shrink-0 font-sans ml-auto">
            <div class="flat-divider h-4 shrink-0 hidden sm:block"></div>
            
            <div class="hidden sm:flex items-center gap-1 px-1 h-5 shrink-0">
              <div class="flex items-center gap-1 h-5">
                <span class="text-zinc-500 font-bold leading-none">X:</span>
                <span id="hudX" class="hud-value text-zinc-300 min-w-[55px] text-right font-medium text-[11px] leading-none">0.00</span>
              </div>
            </div>
            
            <div class="flat-divider h-4 shrink-0 hidden sm:block"></div>
            
            <div class="hidden sm:flex items-center gap-1 px-1 h-5 shrink-0">
              <div class="flex items-center gap-1 h-5">
                <span class="text-zinc-500 font-bold leading-none">Y:</span>
                <span id="hudY" class="hud-value text-zinc-300 min-w-[55px] text-right font-medium text-[11px] leading-none">0.00</span>
              </div>
            </div>

            <div class="flat-divider h-4 shrink-0 hidden sm:block"></div>

            <button id="btnZoomReset" class="hidden md:flex cad-button rounded items-center gap-1.5 px-2 h-5 shrink-0 text-zinc-400 hover:text-zinc-100 tooltip-top cursor-pointer" data-tooltip="Restablecer vista a 100% (Origen 0,0)">
              <span class="text-zinc-500 font-medium text-[10px] leading-none pointer-events-none">ZOOM:</span>
              <span id="hudZoom" class="hud-value text-zinc-300 min-w-[32px] text-right font-medium text-[11px] leading-none pointer-events-none">100%</span>
            </button>

            <div class="flat-divider h-4 shrink-0 hidden sm:block"></div>

            <div class="hidden md:flex items-center gap-1 h-5 shrink-0">
              <button id="btnExtents" class="cad-button cad-button-square h-5 w-6 text-zinc-400 hover:text-zinc-100 tooltip-top shrink-0" data-tooltip="Ajustar a vista (extensión)">
                
                 <span id="btnSnapIcon" class="iconify text-zinc-200 text-sm shrink-0" data-icon="lucide:shrink"></span> 
              </button>
            </div>
          </div>
        </div>

        <!-- Slot reservado para la Consola Fija -->
        <div id="fixedConsoleSlot" class="w-full"></div>
      </div>

      <!-- Barra de Herramientas Flotante/Acoplada -->
      <div id="verticalToolbar" style="top: 16px; left: 16px; --tool-cols: 1;" class="toolbar-floating dock-left absolute cad-panel p-1 flex flex-col items-center gap-1 z-50 transition-none pointer-events-auto">
        <div id="toolbarDragHandle" class="drag-handle w-full py-1 flex items-center justify-center text-zinc-500 select-none tracking-widest text-[10px] font-bold" data-tooltip-="Arrastrar para mover">
          ::::
        </div>

        <div id="toolbarWidthResizer" class="toolbar-resizer" data-tooltip-="Arrastrar para cambiar ancho y columnas"></div>

        <div id="toolGridContainer" class="tool-grid">
          <button id="btnSelect" class="cad-button cad-button-square" data-tooltip="Seleccionar">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:arrow"></span>
          </button>

          <div class="tool-divider"></div>

          <!-- Puntos Flyout -->
          <div class="relative">
            <button id="btnPointGroup" class="cad-button cad-button-square has-flyout" data-default-tool="point" data-tooltip="Herramientas de punto">
              <span id="currentPointIcon" class="iconify text-2xl leading-none shrink-0" data-icon="custom:dot"></span>
            </button>

            <div id="pointFlyoutMenu" class="flyout-menu">
              <div id="optPoint" class="flyout-item" data-tool="point">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:dot"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Colocar punto</span>
                  <span class="text-[10px] text-zinc-400">Puntos independientes</span>
                </div>
              </div>

              <div id="optDivideCount" class="flyout-item" data-tool="divide_count">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:divide"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Dividir por cantidad</span>
                  <span class="text-[10px] text-zinc-400">Puntos equidistantes</span>
                </div>
              </div>

              <div id="optDivideDist" class="flyout-item" data-tool="divide_dist">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:dividelength"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Dividir por distancia</span>
                  <span class="text-[10px] text-zinc-400">Puntos por intervalo</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Líneas Flyout -->
          <div class="relative">
            <button id="btnLineGroup" class="cad-button cad-button-square has-flyout" data-default-tool="line" data-tooltip="Líneas y polilíneas">
              <span id="currentLineIcon" class="iconify text-2xl leading-none shrink-0" data-icon="custom:line"></span>
            </button>

            <div id="lineFlyoutMenu" class="flyout-menu">
              <div id="optLine" class="flyout-item" data-tool="line">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:line"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Línea simple</span>
                  <span class="text-[10px] text-zinc-400">Segmento único</span>
                </div>
              </div>
              <div id="optPolyline" class="flyout-item" data-tool="polyline">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:polyline"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Polilínea continua</span>
                  <span class="text-[10px] text-zinc-400">Secuencia de segmentos</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Círculos Flyout -->
          <div class="relative">
            <button id="btn-circle-tool" class="cad-button cad-button-square" data-tooltip="Círculo (centro y radio)">
              <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:circle"></span>
            </button>
          </div>

          <!-- Importar Imagen -->
          <div class="relative">
            <button id="btnImportImage" class="cad-button cad-button-square" data-tooltip="Importar imagen">
              <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:image"></span>
            </button>
            <input type="file" id="inputImageFile" accept="image/*" style="display: none;" />
          </div>

          <div class="tool-divider"></div>

          <!-- Curvas Flyout -->
          <div class="relative">
            <button id="btnCurveGroup" class="cad-button cad-button-square has-flyout" data-default-tool="spline" data-tooltip="Curvas y arcos">
              <span id="currentCurveIcon" class="iconify text-2xl leading-none shrink-0" data-icon="custom:spline"></span>
            </button>

            <div id="curveFlyoutMenu" class="flyout-menu">
              <div id="optSpline" class="flyout-item" data-tool="spline">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:spline"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Curva Spline</span>
                  <span class="text-[10px] text-zinc-400">Curva suave por nodos</span>
                </div>
              </div>
              <div id="optBezier" class="flyout-item" data-tool="bezier">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:bezier"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Curva Bézier</span>
                  <span class="text-[10px] text-zinc-400">Bézier con manijas</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Edición -->
          <div class="tool-divider"></div>

          <button id="btnTrim" class="cad-button cad-button-square" data-tooltip="Recortar">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:trim"></span>
          </button>

          <button id="btnExtend" class="cad-button cad-button-square" data-tooltip="Extender">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:extend"></span>
          </button>

          <button id="btnOffset" class="cad-button cad-button-square" data-tooltip="Desfasar">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:offset"></span>
          </button>

          <button id="btnFillet" class="cad-button cad-button-square" data-tooltip="Empalme">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:fillet"></span>
          </button>
        </div>
      </div>
    `;
  }
}