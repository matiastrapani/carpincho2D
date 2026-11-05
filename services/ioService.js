/**
 * modules/ioService.js - Exportación e Importación de archivos
 */

export class CADIOService {
  async exportSVG(defaultFileName = 'dibujo_carpincho.svg') {
    if (!paper || !paper.project) return;

    // Array para almacenar y restaurar lo que desconectaremos del proyecto
    const detachedItems = [];

    // 1. DESCONECTAR temporalmente del proyecto la capa HUD, la Grilla y las Guías
    // (Simplemente hacer `visible = false` no impide que Paper.js los guarde en el XML)
    
    // A) Capa HUD
    const hudLayer = paper.project.layers.find(l => l.name === 'hudLayer');
    if (hudLayer) {
      hudLayer.remove();
      detachedItems.push({ item: hudLayer, parent: paper.project, isLayer: true });
    }

    // B) Grupo de Grilla y Ejes Principales
    if (window.cadUtils && window.cadUtils.gridGroup) {
      const grid = window.cadUtils.gridGroup;
      const parent = grid.parent;
      if (parent) {
        grid.remove();
        detachedItems.push({ item: grid, parent: parent, isLayer: false });
      }
    }

    // C) Controles visuales y manejadores temporales
    if (window.cadUtils && window.cadUtils.controlHandlesGroup) {
      const handles = window.cadUtils.controlHandlesGroup;
      const parent = handles.parent;
      if (parent) {
        handles.remove();
        detachedItems.push({ item: handles, parent: parent, isLayer: false });
      }
    }

    // 2. Exportación limpia: ahora el proyecto SOLO contiene las geometrías dibujadas
    const svgString = paper.project.exportSVG({
      asString: true,
      bounds: 'content',   // Enmarca exclusivamente el dibujo real
      matchShapes: true,   // Mantiene etiquetas SVG nativas (<circle>, <rect>)
      precision: 4
    });

    // 3. RE-CONECTAR inmediatamente la interfaz y la grilla al Canvas
    detachedItems.forEach(({ item, parent, isLayer }) => {
      if (isLayer) {
        paper.project.addLayer(item);
      } else if (parent) {
        parent.addChild(item);
      }
    });

    paper.view.update();

    // 4. Guardar archivo con la API nativa "Guardar como..." del SO
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultFileName,
          types: [{
            description: 'Archivo Vectorial SVG',
            accept: { 'image/svg+xml': ['.svg'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // Cancelado por el usuario
        console.warn('Fallback a descarga tradicional:', err);
      }
    }

    // Respaldo para navegadores que no soportan File System Access API
    let chosenName = prompt('Ingrese el nombre para guardar el archivo:', defaultFileName);
    if (!chosenName) return;
    if (!chosenName.toLowerCase().endsWith('.svg')) {
      chosenName += '.svg';
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = chosenName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Alias de compatibilidad
  exportToSVG(fileName) {
    this.exportSVG(fileName);
  }
}