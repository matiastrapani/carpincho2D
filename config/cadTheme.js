export const CAD_THEME = {
  // Fondo general del área de trabajo y ejes cartesianos
  canvas: {
    backgroundColor: '#10141D',
    axisXColor: 'rgba(181, 217, 255, 0.2)', // #b5d9ff con opacidad 0.2
    axisYColor: 'rgba(181, 217, 255, 0.2)',
    axisWidthPx: 1.5
  },

  // Grilla dinámica del canvas
  grid: {
    majorColor: 'rgba(255, 255, 255, 0.08)',
    minorColor: 'rgba(255, 255, 255, 0.03)',
    majorWidthPx: 1.2,
    minorWidthPx: 1.0
  },

  // Línea auxiliar elastizada de trazado activo
  rubberBand: {
    strokeColor: '#34d399',
    dashArrayPx: [2, 2]
  },

  node: {
    normalRadiusPx: 3.5,        
    selectedRadiusPx: 4.0,      
    strokeWidthPx: 1.0,         
    selectedStrokeWidthPx: 2.0, 
    defaultFillColor: '#10141D', 
    defaultStrokeColor: '#88ff00'
  },
  selection: {
    line: {
      strokeColor: '#88ff00',
      widthMultiplier: 1.5
    },
    node: {
      fillColor: '#10141D',       
      strokeColor: '#aaff00',     
      selectedRadiusPx: 4.0,      
      normalRadiusPx: 3.5,        
      selectedWidthPx: 2.0,
      normalWidthPx: 1.0
    },
    circle: {
      strokeColor: '#aaff00',
      widthMultiplier: 1.5
    },
    raster: {
      selectedOpacity: 0.8,
      normalOpacity: 1.0
    }
  },
  handles: {
    anchorSizeNormalPx: 7.0,            
    anchorSizeSelectedPx: 7.5,        
    anchorStrokeWidthNormalPx: 1.0,   
    anchorStrokeWidthSelectedPx: 1.5, 
    anchorStrokeWidthHoverPx: 1.5,    
    anchorFillNormal: '#10141D',      
    anchorFillSelected: '#10141D',    
    anchorStrokeSelected: '#aaff00',  
    bezierHandleSizePx: 6.0,            
    bezierHandleStrokeWidthPx: 1.0,   
    bezierHandleStrokeWidthHoverPx: 1.5, 
    bezierHandleFill: '#10141D',      
    bezierHandleStrokeSelected: '#aaff00',
    bezierArmStrokeWidthPx: 1.0,
    bezierArmStrokeSelected: '#aaff00'
  },
  hud: {
    snapStrokeColor: '#88ff00', //'#34d399'
    snapFillColor: '#88ff0050', //'#34d39933'
    snapBgColor: '#10141d',
    snapStrokeWidthPx: 1.7,
    snapMarkerSizePx: 12.0,
    extensionFactor: 1.3
  },
  properties: {
    defaultColor: '#ffffff',
    customFallbackColor: '#AAAAAA',
    strokeWidthPresets: [0, 1, 1.5, 2, 2.5, 3],
    colorPresets: [
      '#008800', '#4c72fb', '#f35c54', '#ffcc00',
      '#3bcf1d', '#e148ae', '#93a115', '#7877d5'
    ]
  },

  // Tokens de interfaz sincronizados con variables CSS (--cad-*)
  ui: {
    bgRoot: '#121215',
    bgInput: '#17171c',
    bgChip: '#19191f',
    bgPanel: '#1e1e24',
    bgHover: '#27272a',
    bgActiveChip: '#32323c',
    borderSubtle: '#2f2f38',
    textBase: '#94a3b8',
    textMuted: '#71717a',
    textDisabled: '#54545f',
    textBright: '#e4e4e7',
    accent: '#008800'
  }
};

export function applyThemeToDocument(theme = CAD_THEME, root = document.documentElement) {
  if (!root?.style) return;
  const { canvas, ui } = theme;
  const vars = {
    '--cad-bg-canvas': canvas.backgroundColor,
    '--cad-bg-root': ui.bgRoot,
    '--cad-bg-input': ui.bgInput,
    '--cad-bg-chip': ui.bgChip,
    '--cad-bg-panel': ui.bgPanel,
    '--cad-bg-hover': ui.bgHover,
    '--cad-bg-active-chip': ui.bgActiveChip,
    '--cad-border': ui.borderSubtle,
    '--cad-text-base': ui.textBase,
    '--cad-text-muted': ui.textMuted,
    '--cad-text-disabled': ui.textDisabled,
    '--cad-text-bright': ui.textBright,
    '--cad-accent': ui.accent
  };

  Object.entries(vars).forEach(([key, val]) => {
    root.style.setProperty(key, val);
  });
}