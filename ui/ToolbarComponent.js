/**
 * ui/ToolbarComponent.js - Componente de UI (OSNAP, HUD, Toolbar Vertical y Slots)
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
            <button id="btnSnap" type="button" class="cad-button cad-button-square snap-btn active h-5 w-6 tooltip-top-left" data-tooltip="Refobj [{shortcut:osnap}]">
              <span class="iconify text-xs icon-crisp shrink-0" data-icon="lucide:magnet"></span>
            </button>

            <button id="btnGrid" type="button" class="cad-button cad-button-square snap-btn active h-5 w-6 tooltip-top" data-tooltip="Grilla [{shortcut:grid}]">
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

            <button id="btnOrtho" type="button" class="snap-chip rounded px-2 h-5 flex items-center justify-center gap-1.5 tooltip-top shrink-0" data-tooltip="Ortogonal [{shortcut:ortho}]">
              <span class="text-[11px] font-medium leading-none">Orto</span>
            </button>

            <button id="chipGrid" type="button" class="snap-chip rounded px-2 h-5 flex items-center justify-center gap-1.5 tooltip-top shrink-0" data-tooltip="Ajustar a grilla [{shortcut:gridSnap}]">
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

            <button id="btnZoomReset" class="hidden md:flex cad-button rounded items-center gap-1.5 px-2 h-5 shrink-0 text-zinc-400 hover:text-zinc-100 tooltip-top cursor-pointer" data-tooltip="Restablecer vista a 100%\n(Origen 0,0) [{shortcut:zoomReset}]">
              <span class="text-zinc-500 font-medium text-[10px] leading-none pointer-events-none">ZOOM:</span>
              <span id="hudZoom" class="hud-value text-zinc-300 min-w-[32px] text-right font-medium text-[11px] leading-none pointer-events-none">100%</span>
            </button>

            <div class="flat-divider h-4 shrink-0 hidden sm:block"></div>

            <div class="hidden md:flex items-center gap-1 h-5 shrink-0">
              <button id="btnExtents" class="cad-button cad-button-square h-5 w-6 text-zinc-400 hover:text-zinc-100 tooltip-top shrink-0" data-tooltip="Ajustar a vista (extensión)\n[{shortcut:zoomExtents}]">
                
                 <span id="btnSnapIcon" class="iconify text-zinc-200 text-sm shrink-0" data-icon="lucide:shrink"></span> 
              </button>
            </div>
          </div>
        </div>

        <!-- Slot reservado para la Consola Fija -->
        <div id="fixedConsoleSlot" class="w-full"></div>
      </div>



      <!-- Barra de Herramientas Flotante/Acoplada (2 Columnas por defecto) -->
      <div id="verticalToolbar" style="top: 16px; left: 16px; --tool-cols: 3;" class="toolbar-floating dock-left absolute cad-panel p-1 flex flex-col items-center gap-1 z-50 transition-none pointer-events-auto">
        <div id="toolbarDragHandle" class="drag-handle w-full h-4 pb-1 flex items-center justify-center text-zinc-500 select-none tracking-widest text-[10px] font-bold leading-none" data-tooltip="Arrastrar para mover">
          ::::
        </div>

        <div id="toolbarWidthResizer" class="toolbar-resizer" data-tooltip="Arrastrar para cambiar ancho y columnas"></div>

        <div id="toolGridContainer" class="tool-grid">
          <!-- Fila 1: Selección, Punto, Imagen -->
          <button id="btnSelect" class="cad-button cad-button-square" data-tooltip="Seleccionar">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:flecha"></span>
          </button>

          <div class="relative">
            <button id="btnPointGroup" class="cad-button cad-button-square has-flyout" data-default-tool="point" data-tooltip="Punto">
              <span id="currentPointIcon" class="iconify text-2xl leading-none shrink-0" data-icon="custom:punto"></span>
            </button>
            <div id="pointFlyoutMenu" class="flyout-menu">
              <div class="flyout-item" data-tool="point">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:punto"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Colocar punto</span>
                  <span class="text-[10px] text-zinc-400">Puntos independientes</span>
                </div>
              </div>
              <div class="flyout-item" data-tool="divide">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:dividir"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Dividir</span>
                  <span class="text-[10px] text-zinc-400">Por cantidad o distancia</span>
                </div>
              </div>
            </div>
          </div>

          <div class="relative">
            <button id="btnImportImage" class="cad-button cad-button-square" data-tooltip="Importar imagen">
              <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:imagen"></span>
            </button>
            <input type="file" id="inputImageFile" accept="image/*" style="display: none;" />
          </div>

          <div class="tool-divider"></div>

          <!-- Fila 2: Línea, Rectángulo/Polígono, Círculo -->
          <div class="relative">
            <button id="btnLineGroup" class="cad-button cad-button-square has-flyout" data-default-tool="line" data-tooltip="Línea">
              <span id="currentLineIcon" class="iconify text-2xl leading-none shrink-0" data-icon="custom:linea"></span>
            </button>
            <div id="lineFlyoutMenu" class="flyout-menu">
              <div class="flyout-item" data-tool="line">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:linea"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Línea simple</span>
                  <span class="text-[10px] text-zinc-400">Segmentos rectos individuales</span>
                </div>
              </div>
              <div class="flyout-item" data-tool="polyline">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:polilinea"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Polilínea continua</span>
                  <span class="text-[10px] text-zinc-400">Secuencia de segmentos</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="line_tan">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:lineatangente"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Línea tangente a 2 curvas</span>
                  <span class="text-[10px] text-zinc-400">Tangente dinámica entre curvas</span>
                </div>
              </div>
              <div class="flyout-item" data-tool="line_tangent">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:tangentedesde"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Línea tangente desde</span>
                  <span class="text-[10px] text-zinc-400">Tangente dinámica desde curva</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="line_perp">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:perpendiculardesde"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Línea perpendicular desde</span>
                  <span class="text-[10px] text-zinc-400">Normal a una curva</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="line_bisector">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:bisectriz"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Bisectriz</span>
                  <span class="text-[10px] text-zinc-400">Divide un ángulo en dos</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="line_mediatrix">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:mediatriz"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Mediatriz</span>
                  <span class="text-[10px] text-zinc-400">Perpendicular por punto medio</span>
                </div>
              </div>
            </div>
          </div>

          <div class="relative">
            <button id="btnRectGroup" class="cad-button cad-button-square has-flyout disabled" data-default-tool="rectangle" data-tooltip="Rectángulo">
              <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:rectangulo"></span>
            </button>
            <div class="flyout-menu">
              <div class="flyout-item disabled" data-tool="rectangle">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:rectangulo"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Rectángulo por extremos</span>
                  <span class="text-[10px] text-zinc-400">Esquina a esquina opuesta</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="rectangle_center">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:rectangulocentro"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Rectángulo por centro</span>
                  <span class="text-[10px] text-zinc-400">Centro y una esquina</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="rectangle_3pt">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:rectangulo3p"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Rectángulo por 3 puntos</span>
                  <span class="text-[10px] text-zinc-400">Base orientada y altura</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="polygon">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:poligono"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Polígono regular</span>
                  <span class="text-[10px] text-zinc-400">Inscrito o circunscrito</span>
                </div>
              </div>
            </div>
          </div>

          <div class="relative">
            <button id="btn-circle-tool" class="cad-button cad-button-square has-flyout" data-default-tool="circle" data-tooltip="Círculo">
              <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:circulo"></span>
            </button>
            <div class="flyout-menu">
              <div class="flyout-item" data-tool="circle">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:circulo"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Centro y radio</span>
                  <span class="text-[10px] text-zinc-400">Círculo por centro y radio o diámetro</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="circle_2pt">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:circulo2p"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Círculo por 2 puntos</span>
                  <span class="text-[10px] text-zinc-400">Por extremos opuestos del diámetro</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="circle_3pt">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:circulo3p"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Círculo por 3 puntos</span>
                  <span class="text-[10px] text-zinc-400">Por tres puntos de la curva</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="circle_3tan">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:circulo3tang"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Tangente a 3 curvas</span>
                  <span class="text-[10px] text-zinc-400">Inscrito entre tres entidades</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="circle_ttr">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:circulotangenteradio"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">2 tangentes y radio</span>
                  <span class="text-[10px] text-zinc-400">Tangente a dos curvas y radio</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Fila 3: Arco, Curva, Elipse -->
          <div class="relative">
            <button id="btnArcGroup" class="cad-button cad-button-square has-flyout disabled" data-default-tool="arc" data-tooltip="Arco">
              <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:arco"></span>
            </button>
            <div class="flyout-menu">
              <div class="flyout-item disabled" data-tool="arc">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:arco"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Arco por centro</span>
                  <span class="text-[10px] text-zinc-400">Centro, inicio y fin</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="arc_3pt">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:arco3p"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Arco por 3 puntos</span>
                  <span class="text-[10px] text-zinc-400">Inicio, fin y punto en arco</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="arc_semicircle">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:semicirculo"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Semicírculo (2 puntos)</span>
                  <span class="text-[10px] text-zinc-400">Arco por extremos del diámetro</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="arc_tangent">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:arcotangente"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Arco por tangente</span>
                  <span class="text-[10px] text-zinc-400">Inicio, fin y dirección tangente</span>
                </div>
              </div>
            </div>
          </div>

          <div class="relative">
            <button id="btnCurveGroup" class="cad-button cad-button-square has-flyout" data-default-tool="spline" data-tooltip="Curvas">
              <span id="currentCurveIcon" class="iconify text-2xl leading-none shrink-0" data-icon="custom:spline"></span>
            </button>
            <div id="curveFlyoutMenu" class="flyout-menu">
              <div class="flyout-item" data-tool="spline">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:spline"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Curva Spline</span>
                  <span class="text-[10px] text-zinc-400">Curva suave por nodos</span>
                </div>
              </div>
              <div class="flyout-item" data-tool="bezier">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:bezier"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Curva Bézier</span>
                  <span class="text-[10px] text-zinc-400">Bézier con manejadores</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="bspline">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:b-spline"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Curva B-Spline</span>
                  <span class="text-[10px] text-zinc-400">Por polígono de control</span>
                </div>
              </div>
            </div>
          </div>

          <div class="relative">
            <button id="btnEllipseGroup" class="cad-button cad-button-square has-flyout disabled" data-default-tool="ellipse" data-tooltip="Elipse">
              <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:elipse"></span>
            </button>
            <div class="flyout-menu">
              <div class="flyout-item disabled" data-tool="ellipse">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:elipse"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Elipse por centro</span>
                  <span class="text-[10px] text-zinc-400">Centro, semieje y un punto de la curva</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="ellipse_vertices">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:elipseeje"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Por vértices y punto</span>
                  <span class="text-[10px] text-zinc-400">Extremos de uno de los ejes y un punto de la curva</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="ellipse_foci">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:elipsefocos"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Desde focos y punto</span>
                  <span class="text-[10px] text-zinc-400">Dos focos y un punto de la curva</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="ellipse_quad">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:elipsecuadrilatero"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">En cuadrilátero</span>
                  <span class="text-[10px] text-zinc-400">Inscrita en polígono</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="ellipse_rect">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:elipserectangulo"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">En rectángulo</span>
                  <span class="text-[10px] text-zinc-400">Inscrita en rectángulo definido por esquinas</span>
                </div>
              </div>
            </div>
          </div>

          <div class="tool-divider"></div>

          <!-- Fila 4: Mover, Copiar (sin flyout), Rotar -->
          <button id="btnMove" class="cad-button cad-button-square" data-tooltip="Mover">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:mover"></span>
          </button>

          <button id="btnCopy" class="cad-button cad-button-square disabled" data-tooltip="Copiar">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:copiar"></span>
          </button>

          <button id="btnRotate" class="cad-button cad-button-square disabled" data-tooltip="Rotar">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:rotar"></span>
          </button>

          <!-- Fila 5: Escalar (flyout), Simetría (flyout), Offset -->
          <div class="relative">
            <button id="btnScale" class="cad-button cad-button-square has-flyout disabled" data-default-tool="scale" data-tooltip="Escalar">
              <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:escalar"></span>
            </button>
            <div class="flyout-menu">
              <div class="flyout-item disabled" data-tool="scale">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:escalar"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Escala uniforme</span>
                  <span class="text-[10px] text-zinc-400">Escala proporcional</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="scale_1d">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:escalar1D"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Escala 1D</span>
                  <span class="text-[10px] text-zinc-400">Escala en una dirección</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="scale_nu">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:escalarNu"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Escala no uniforme</span>
                  <span class="text-[10px] text-zinc-400">Factores independientes X / Y</span>
                </div>
              </div>
            </div>
          </div>

          <div class="relative">
            <button id="btnMirror" class="cad-button cad-button-square has-flyout disabled" data-default-tool="mirror" data-tooltip="Simetría">
              <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:simetria"></span>
            </button>
            <div class="flyout-menu">
              <div class="flyout-item disabled" data-tool="mirror">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:simetria"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Simetría axial</span>
                  <span class="text-[10px] text-zinc-400">Reflejar respecto a un eje</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="mirror_central">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:simetriacentral"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Simetría central</span>
                  <span class="text-[10px] text-zinc-400">Reflejar respecto a un punto</span>
                </div>
              </div>
            </div>
          </div>

          <button id="btnOffset" class="cad-button cad-button-square disabled" data-tooltip="Desfasar">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:offset"></span>
          </button>

          <div class="tool-divider"></div>

          <!-- Fila 6: Recortar | Partir | Extender -->
          <button id="btnTrim" class="cad-button cad-button-square" data-tooltip="Recortar">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:recortar"></span>
          </button>

          <button id="btnSplit" class="cad-button cad-button-square disabled" data-tooltip="Partir">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:partir"></span>
          </button>

          <button id="btnExtend" class="cad-button cad-button-square" data-tooltip="Extender">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:extender"></span>
          </button>

          <!-- Fila 7: Unir | Explotar | Redondear (con Chanfle) -->
          <button id="btnJoin" class="cad-button cad-button-square disabled" data-tooltip="Unir">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:unir"></span>
          </button>

          <button id="btnExplode" class="cad-button cad-button-square disabled" data-tooltip="Explotar">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:explotar"></span>
          </button>

          <div class="relative">
            <button id="btnFillet" class="cad-button cad-button-square has-flyout disabled" data-default-tool="fillet" data-tooltip="Redondear">
              <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:fillet"></span>
            </button>
            <div class="flyout-menu">
              <div class="flyout-item disabled" data-tool="fillet">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:fillet"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Redondear (Fillet)</span>
                  <span class="text-[10px] text-zinc-400">Empalme curvo con radio</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="chamfer">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:chamfer"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Chanfle (Chamfer)</span>
                  <span class="text-[10px] text-zinc-400">Bisel recto en esquina</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Fila 8: Agrupar | Desagrupar | Conectar -->
          <button id="btnGroup" class="cad-button cad-button-square disabled" data-tooltip="Agrupar">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:agrupar"></span>
          </button>

          <button id="btnUngroup" class="cad-button cad-button-square disabled" data-tooltip="Desagrupar">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:desagrupar"></span>
          </button>

          <button id="btnConnect" class="cad-button cad-button-square disabled" data-tooltip="Conectar">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:conectar"></span>
          </button>

          <div class="tool-divider"></div>

          <!-- Fila 9: Cotas | Lista (ID) | Medir -->
          <div class="relative">
            <button id="btnDimensionGroup" class="cad-button cad-button-square has-flyout disabled" data-default-tool="dim_linear" data-tooltip="Cotas">
              <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:cotas"></span>
            </button>
            <div class="flyout-menu">
              <div class="flyout-item disabled" data-tool="dim_linear">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:cotas"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Cota lineal</span>
                  <span class="text-[10px] text-zinc-400">Horizontal, vertical u oblicua</span>
                </div>
              </div>

              <div class="flyout-item disabled" data-tool="dim_angular">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:cotaangulo"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Cota angular</span>
                  <span class="text-[10px] text-zinc-400">Ángulo entre líneas</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="dim_radius">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:cotaradio"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Cota radial</span>
                  <span class="text-[10px] text-zinc-400">Acota radio o diámetro</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="dim_directriz">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:directriz"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Directriz</span>
                  <span class="text-[10px] text-zinc-400">Anotación directriz con texto</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="dim_aligned">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:cotatexto"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Texto</span>
                  <span class="text-[10px] text-zinc-400">Crea o edita texto de anotación</span>
                </div>
              </div>
            </div>
          </div>

          

          <div class="relative">
            <button id="btnDistance" class="cad-button cad-button-square has-flyout" data-default-tool="distance" data-tooltip="Medir">
              <span id="currentMeasureIcon" class="iconify text-2xl leading-none shrink-0" data-icon="custom:medir"></span>
            </button>
            <div class="flyout-menu">
              <div class="flyout-item" data-tool="distance">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:medir"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Medir distancia</span>
                  <span class="text-[10px] text-zinc-400">Distancia entre dos puntos</span>
                </div>
              </div>
              <div class="flyout-item disabled" data-tool="measure_angle">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:anguloid"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Medir ángulo</span>
                  <span class="text-[10px] text-zinc-400">Ángulo entre dos direcciones</span>
                </div>
              </div>
              <div class="flyout-item" data-tool="point_coords">
                <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:puntoid"></span>
                <div class="flex flex-col">
                  <span class="font-medium text-zinc-200">Posición de punto</span>
                  <span class="text-[10px] text-zinc-400">Coordenadas X, Y en consola</span>
                </div>
              </div>
            </div>
          </div>

          <button id="btnList" class="cad-button cad-button-square disabled" data-tooltip="Lista / Propiedades de entidad">
            <span class="iconify text-2xl leading-none shrink-0" data-icon="custom:id"></span>
          </button>


        </div>
    `;
  }
}