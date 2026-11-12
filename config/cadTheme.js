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
    customFallbackColor: '#00e5ff',
    strokeWidthPresets: [0, 1, 1.5, 2, 3],
    colorPresets: [
      '#001988', '#4c72fb', '#f35c54', '#ffcc00',
      '#3bcf1d', '#e148ae', '#93a115', '#7877d5'
    ]
  }
};