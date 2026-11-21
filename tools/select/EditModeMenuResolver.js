/**
 * tools/select/EditModeMenuResolver.js - Detección, prioridad y menú de superposición en modo edición
 */

import { CAD_THEME } from '../../config/cadTheme.js';

export class EditModeMenuResolver {
  constructor(cadService, cadUtils, handleModule, segmentEditHandler, selectionMenuHandler) {
    this.service = cadService;
    this.utils = cadUtils;
    this.handleModule = handleModule;
    this.segmentEditHandler = segmentEditHandler;
    this.selectionMenuHandler = selectionMenuHandler;
  }

  _getPaper() {
    return this.utils?.paper || (typeof paper !== 'undefined' ? paper : null);
  }

  _getEntityName(entity) {
    if (!entity) return 'Entidad';
    if (entity.data?.name || entity.name) return entity.data?.name || entity.name;

    const paperInst = this._getPaper();
    if (entity.data?.isPointEntity) return 'Punto';
    if (entity.data?.isCircleEntity) return 'Círculo';
    if (paperInst && entity instanceof paperInst.CompoundPath) return 'Trazado compuesto';
    if (paperInst && entity instanceof paperInst.Path) {
      return entity.segments?.length === 2 && !entity.closed ? 'Línea' : 'Curva';
    }
    return 'Entidad';
  }

  _getEntityColor(entity) {
    const layerId = String(entity?.data?.layerId || '0');
    const layer = this.utils.layerManager?.layers?.get(layerId);
    return this.utils.propertyManager?.getResolvedColor(entity)
      || layer?.color
      || entity?.strokeColor?.toCSS?.(true)
      || CAD_THEME.handles?.anchorStrokeSelected
      || '#aaff00';
  }

  _collectHandleCandidates(point, tolerance) {
    const group = this.utils?.controlHandlesGroup;
    if (!group) return [];

    const options = {
      fill: true,
      stroke: true,
      segments: true,
      tolerance,
      match: (res) => {
        const data = res.item?.data;
        if (!data || !data.segment) return false;
        if (data.type === 'arm') return false;

        const parentPath = data.segment.path;
        if (!parentPath || !this.service.editingEntities.includes(parentPath)) return false;
        if (this.service.selectedEntities.includes(parentPath)) return false;
        return true;
      }
    };

    const rawHits = typeof group.hitTestAll === 'function'
      ? group.hitTestAll(point, options)
      : [group.hitTest(point, options)].filter(Boolean);

    const uniqueMap = new Map();

    for (const res of rawHits) {
      const data = res?.item?.data;
      const seg = data?.segment;
      const parentPath = seg?.path;
      if (!data || !seg || !parentPath) continue;

      const key = `${data.type}:${parentPath.id}:${seg.index}`;
      if (uniqueMap.has(key)) continue;

      const targetPt = data.type === 'handleIn'
        ? seg.point.add(seg.handleIn)
        : (data.type === 'handleOut' ? seg.point.add(seg.handleOut) : seg.point);

      const dist = targetPt.getDistance(point);
      const segNumber = (seg.index ?? 0) + 1;
      const entityName = this._getEntityName(parentPath);
      const color = this._getEntityColor(parentPath);

      let label = `Nodo ${segNumber}`;
      if (data.type === 'handleIn') label = `Manija entrada (Nodo ${segNumber})`;
      else if (data.type === 'handleOut') label = `Manija salida (Nodo ${segNumber})`;

      const isSelected = data.type === 'anchor'
        ? Boolean(this.service.selectedSegments?.includes(seg))
        : Boolean(this.service.isSelectedHandle?.(seg, data.type));

      uniqueMap.set(key, {
        kind: data.type === 'anchor' ? 'anchor' : 'handle',
        handleData: data,
        segment: seg,
        entity: parentPath,
        label,
        sublabel: entityName,
        color,
        isSelected,
        distance: dist,
        onPreview: () => {
          this.utils.hoveredCurve = null;
          this.utils.hoveredHandle = data;
          this.utils.selectionRenderEngine?.renderBezierHandles?.();
        }
      });
    }

    const candidates = Array.from(uniqueMap.values());
    candidates.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'anchor' ? -1 : 1;
      }
      return a.distance - b.distance;
    });

    return candidates;
  }

  _collectCurveCandidates(point, tolerance) {
    const paperInst = this._getPaper();
    if (!paperInst) return [];

    const candidates = [];

    for (const ent of this.service.editingEntities) {
      if (!ent || ent.visible === false) continue;
      if (this.service.selectedEntities.includes(ent)) continue;
      if (!(ent instanceof paperInst.Path) || !ent.curves || ent.data?.isPointEntity) continue;
      if (ent.bounds && !ent.bounds.expand(tolerance * 2).contains(point)) continue;

      const entityName = this._getEntityName(ent);
      const color = this._getEntityColor(ent);

      for (const curve of ent.curves) {
        const loc = curve.getNearestLocation(point);
        if (!loc?.point) continue;

        const dist = loc.point.getDistance(point);
        if (dist > tolerance) continue;

        const s1 = (curve.segment1?.index ?? 0) + 1;
        const s2 = (curve.segment2?.index ?? 0) + 1;
        const isSelected = Boolean(
          curve.segment1 &&
          curve.segment2 &&
          this.service.selectedSegments?.includes(curve.segment1) &&
          this.service.selectedSegments?.includes(curve.segment2)
        );

        candidates.push({
          kind: 'curve',
          curve,
          entity: ent,
          label: `Segmento ${s1}–${s2}`,
          sublabel: entityName,
          color,
          isSelected,
          distance: dist,
          onPreview: () => {
            this.utils.hoveredHandle = null;
            this.utils.hoveredCurve = curve;
            this.utils.selectionRenderEngine?.renderBezierHandles?.();
          }
        });
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates;
  }

  getCandidates(point, tolerance) {
    if (!this.service.editingEntities || this.service.editingEntities.length === 0) {
      return [];
    }

    // 1. Prioridad absoluta: nodos y manijas Bézier (excluye segmentos y entidades externas)
    const handleCandidates = this._collectHandleCandidates(point, tolerance);
    if (handleCandidates.length > 0) {
      return handleCandidates;
    }

    // 2. Segundo nivel: segmentos de entidades en modo edición (excluye entidades fuera de edición)
    return this._collectCurveCandidates(point, tolerance);
  }

  _activateCandidateWithDrag(candidate, point, isShift, nativeEvent) {
    if (candidate.kind === 'anchor' || candidate.kind === 'handle') {
      this.handleModule.selectAndPrepareDrag(candidate.handleData, point, isShift, true, nativeEvent);
      return this.handleModule;
    }
    if (candidate.kind === 'curve') {
      this.segmentEditHandler.selectCurveAndPrepareDrag(candidate.curve, point, isShift, true, nativeEvent);
    }
    return null;
  }

  applyChoice(chosenHit, point, isShift) {
    if (!chosenHit) return;

    if (chosenHit.kind === 'anchor' || chosenHit.kind === 'handle') {
      this.handleModule.selectAndPrepareDrag(chosenHit.handleData, point, isShift, false);
    } else if (chosenHit.kind === 'curve') {
      this.segmentEditHandler.selectCurveAndPrepareDrag(chosenHit.curve, point, isShift, false);
    }

    const paperInst = this._getPaper();
    if (paperInst?.view) paperInst.view.update();
  }

  handleMouseDown(event, isShift, zoom) {
    if (!this.service.editingEntities || this.service.editingEntities.length === 0) {
      return null;
    }

    const candidates = this.getCandidates(event.point, 8 / zoom);
    if (candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      const activeModule = this._activateCandidateWithDrag(candidates[0], event.point, isShift, event.event);
      return { handled: true, activeModule };
    }

    if (isShift) {
      const unselected = candidates.filter((c) => !c.isSelected);

      if (unselected.length >= 2) {
        const clickPoint = event.point.clone();
        this.selectionMenuHandler.open(
          event.event,
          unselected,
          (chosenHit) => this.applyChoice(chosenHit, clickPoint, true),
          { title: 'Seleccionar elemento' }
        );
        return { handled: true, activeModule: null };
      }

      if (unselected.length === 1) {
        const activeModule = this._activateCandidateWithDrag(unselected[0], event.point, true, event.event);
        return { handled: true, activeModule };
      }

      this.applyChoice(candidates[0], event.point, true);
      return { handled: true, activeModule: null };
    }

    const alreadySelected = candidates.find((c) => c.isSelected);

    if (alreadySelected) {
      const activeModule = this._activateCandidateWithDrag(alreadySelected, event.point, false, event.event);

      this.selectionMenuHandler.setPendingMenu(
        {
          hits: candidates,
          event: event.event,
          point: event.point.clone(),
          shift: false,
          options: { title: 'Seleccionar elemento' }
        },
        (chosenHit, pt, shift) => this.applyChoice(chosenHit, pt, shift)
      );

      return { handled: true, activeModule };
    }

    const clickPoint = event.point.clone();
    this.selectionMenuHandler.open(
      event.event,
      candidates,
      (chosenHit) => this.applyChoice(chosenHit, clickPoint, false),
      { title: 'Seleccionar elemento' }
    );

    return { handled: true, activeModule: null };
  }
}