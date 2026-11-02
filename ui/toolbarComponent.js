/**
 * modules/toolbarComponent.js - Componente que genera e inyecta la UI dinámicamente
 */
class CADToolbarComponent {
  constructor(containerId = 'app-ui-container') {
    this.container = document.getElementById(containerId);
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `    
      <!-- Barra Inferior de Control -->
      <div class="absolute bottom-0 left-0 right-0 p-2 bg-[#121215] flex flex-col gap-2 z-60 pointer-events-auto">
        <div class="flex flex-wrap items-center justify-between gap-2 w-full h-6 min-h-[24px]">
          
          <!-- OSNAP & Filtros -->
          <div class="h-6 flex items-center gap-1.5 overflow-x-auto max-w-full shrink-0">
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
                <span class="text-[11px] font-medium leading-none">Endpoint</span>
              </div>

              <div id="chipMidpoint" class="snap-chip active rounded px-2 h-6 flex items-center justify-center gap-1.5 shrink-0">
                <span class="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[6px] border-b-zinc-300"></span>
                <span class="text-[11px] font-medium leading-none">Midpoint</span>
              </div>

              <div id="chipCenter" class="snap-chip active rounded px-2 h-6 flex items-center justify-center gap-1.5 shrink-0">
                <span class="w-1.5 h-1.5 rounded-full border border-zinc-300"></span>
                <span class="text-[11px] font-medium leading-none">Center</span>
              </div>

              <div id="chipQuadrant" class="snap-chip active rounded px-2 h-6 flex items-center justify-center gap-1.5 shrink-0">
                <span class="w-1.5 h-1.5 bg-zinc-300 rotate-45 transform"></span>
                <span class="text-[11px] font-medium leading-none">Quadrant</span>
              </div>

              <div id="chipNode" class="snap-chip active rounded px-2 h-6 flex items-center justify-center gap-1.5 shrink-0">
                <span class="w-1.5 h-1.5 rounded-full bg-zinc-300"></span>
                <span class="text-[11px] font-medium leading-none">Node</span>
              </div>

              <div id="chipIntersection" class="snap-chip active rounded px-2 h-6 flex items-center justify-center gap-1.5 shrink-0">
                <span class="text-zinc-300 text-[10px] font-bold leading-none">✕</span>
                <span class="text-[11px] font-medium leading-none">Intersect</span>
              </div>

              <div id="chipGrid" class="snap-chip rounded px-2 h-6 flex items-center justify-center gap-1.5 shrink-0">
                <span class="w-1.5 h-1.5 rounded-full bg-zinc-500"></span>
                <span class="text-[11px] font-medium leading-none">Grid Snap</span>
              </div>
            </div>
          </div>

          <!-- Coordenadas & Zoom -->
          <div class="h-6 flex items-center gap-2 text-xs shrink-0 font-sans ml-auto">
            <div class="hidden sm:flex items-center gap-2 px-1 h-6 shrink-0">
              <div class="flex items-center gap-1 h-6">
                <span class="text-zinc-500 font-bold leading-none">X:</span>
                <span id="hudX" class="hud-value text-zinc-300 min-w-[55px] text-right font-medium text-[11px] leading-none">0.00</span>
              </div>
              <div class="flex items-center gap-1 h-6">
                <span class="text-zinc-500 font-bold leading-none">Y:</span>
                <span id="hudY" class="hud-value text-zinc-300 min-w-[55px] text-right font-medium text-[11px] leading-none">0.00</span>
              </div>
            </div>

            <div class="flat-divider h-4 shrink-0 hidden sm:block"></div>

            <div class="hidden md:flex items-center gap-1.5 h-6 shrink-0">
              <span class="text-zinc-500 font-medium text-[10px] leading-none">ZOOM:</span>
              <span id="hudZoom" class="hud-value text-zinc-300 min-w-[40px] text-right font-medium text-[11px] leading-none">100%</span>
              
              <button id="btnExtents" class="cad-button cad-button-square h-6 w-6 text-zinc-400 hover:text-zinc-100 tooltip-top shrink-0" data-tooltip="Ajustar Vista (Extents)">
                <i class="fa-solid fa-compress-arrows-alt text-[10px]"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Barra de Comandos (2 RENGLONES) -->
        <div class="cad-panel p-2 rounded text-xs text-zinc-300 flex flex-col gap-1.5 w-full font-sans">
          <!-- RENGLÓN 1: Muestra de Salida / Prompt -->
          <div class="flex items-center gap-1.5 text-zinc-400 font-medium px-1 py-0.5 text-[11px] min-h-[20px] truncate">
            <i class="fa-solid fa-terminal text-[10px] text-zinc-500"></i>
            <span id="commandPrompt" class="text-zinc-300 font-sans leading-none">Command:</span>
          </div>

          <!-- RENGLÓN 2: Input para Ingresar Comandos + Botón Modal de Historial -->
          <div class="flex items-center gap-2 w-full">
            <input id="cmdInput" type="text" autocomplete="off" placeholder="Escribe comando o valor..." class="command-input flex-1 px-2.5 py-1 rounded text-xs w-full h-7" />
            
            <button id="btnToggleConsole" class="cad-button cad-button-square h-7 w-7 rounded bg-[#27272a] hover:bg-[#3f3f46] text-zinc-300 tooltip-top shrink-0" data-tooltip="Historial de Consola [F2]">
              <i class="fa-solid fa-list-ul text-xs"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Emergente Flotante de Consola CAD (Centrado / Arrastrable) -->
      <div id="cmdConsoleModal" class="hidden fixed inset-0 z-[100] pointer-events-none flex items-center justify-center">
        <div id="cmdConsoleWindow" class="cad-panel w-[580px] h-[380px] rounded-lg shadow-2xl flex flex-col pointer-events-auto border border-[#2a2a32] overflow-hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          
          <!-- Header del Modal (Arrastrable) -->
          <div id="cmdConsoleHeader" class="bg-[#17171c] px-3.5 py-2 flex items-center justify-between cursor-grab active:cursor-grabbing border-b border-[#2a2a32] shrink-0 select-none">
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-terminal text-xs text-emerald-500"></i>
              <span class="text-xs font-semibold text-zinc-200 tracking-wide uppercase">Historial de Consola CAD</span>
              <span class="text-[10px] text-zinc-500 font-mono bg-[#121215] px-1.5 py-0.5 rounded border border-[#2a2a32]">F2</span>
            </div>
            <button id="btnCloseConsoleModal" class="text-zinc-400 hover:text-white text-xs w-6 h-6 flex items-center justify-center rounded hover:bg-[#27272a] transition-colors">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- Log de Entradas y Salidas de Consola -->
          <div id="cmdConsoleLog" class="flex-1 p-3.5 overflow-y-auto bg-[#10141d] font-mono text-[11px] flex flex-col gap-1.5 text-zinc-300 select-text">
            <div class="text-zinc-500 italic text-[10px] pb-1 border-b border-zinc-800/60">--- Sesión CAD Iniciada ---</div>
          </div>

          <!-- Footer Informativo -->
          <div class="bg-[#17171c] px-3.5 py-1.5 border-t border-[#2a2a32] flex items-center justify-between text-[10px] text-zinc-500 shrink-0">
            <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Consola Lista</span>
            <span>Usa F2 o ESC para cerrar</span>
          </div>
        </div>
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

window.CADToolbarComponent = CADToolbarComponent;