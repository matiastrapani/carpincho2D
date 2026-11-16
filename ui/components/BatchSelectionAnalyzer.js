/**
 * BatchSelectionAnalyzer.js - Cálculo agregado de propiedades para selección múltiple.
 */

import { CAD_THEME } from '../../config/cadTheme.js';

export function analyzeBatchSelection(selectedEntities, { getLayer, activeLayer, getHexColor }) {
  const { defaultColor } = CAD_THEME.properties;

  const state = {
    sharedLayerId: null,
    allSameLayer: true,
    sharedColor: null,
    allSameColor: true,
    allColorByLayer: true,
    allColorCustom: true,
    sharedOpacity: null,
    allSameOpacity: true,
    allOpacityByLayer: true,
    allOpacityCustom: true,
    sharedWidth: null,
    allSameWidth: true,
    allWidthByLayer: true,
    allWidthCustom: true
  };

  for (const ent of selectedEntities) {
    const entLayerId = String(ent.data?.layerId ?? '0');
    if (state.sharedLayerId === null) {
      state.sharedLayerId = entLayerId;
    } else if (state.sharedLayerId !== entLayerId) {
      state.allSameLayer = false;
    }

    const layerOfEnt = getLayer?.(ent.data?.layerId) || activeLayer;

    // Color
    const colorByLayer = ent.data?.colorByLayer !== false;
    if (colorByLayer) state.allColorCustom = false;
    else state.allColorByLayer = false;

    const entColor = colorByLayer
      ? (layerOfEnt ? layerOfEnt.color : defaultColor)
      : (ent.data?.origStrokeColor || ent.strokeColor || defaultColor);
    const hex = getHexColor(entColor);

    if (state.sharedColor === null) {
      state.sharedColor = hex;
    } else if (state.sharedColor.toLowerCase() !== hex.toLowerCase()) {
      state.allSameColor = false;
    }

    // Opacidad
    const opacityByLayer = ent.data?.opacityByLayer !== false;
    if (opacityByLayer) state.allOpacityCustom = false;
    else state.allOpacityByLayer = false;

    const entOp = opacityByLayer
      ? (layerOfEnt && layerOfEnt.opacity !== undefined ? layerOfEnt.opacity : 1)
      : (ent.data?.origOpacity !== undefined ? ent.data.origOpacity : (ent.opacity !== undefined ? ent.opacity : 1));

    if (state.sharedOpacity === null) {
      state.sharedOpacity = entOp;
    } else if (Math.abs(state.sharedOpacity - entOp) > 0.01) {
      state.allSameOpacity = false;
    }

    // Grosor
    const widthByLayer = ent.data?.widthByLayer !== false;
    if (widthByLayer) state.allWidthCustom = false;
    else state.allWidthByLayer = false;

    const entW = widthByLayer
      ? (layerOfEnt && layerOfEnt.strokeWidth !== undefined ? layerOfEnt.strokeWidth : 1)
      : (ent.data?.baseStrokeWidth !== undefined ? ent.data.baseStrokeWidth : (ent.strokeWidth !== undefined ? ent.strokeWidth : 1));

    if (state.sharedWidth === null) {
      state.sharedWidth = entW;
    } else if (Math.abs(state.sharedWidth - entW) > 0.001) {
      state.allSameWidth = false;
    }
  }

  return state;
}