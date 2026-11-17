/**
 * ui/components/ColorPickerHistory.js
 * Pila de historial local (Undo/Redo) de estados HSBA para ColorPickerPopover.
 */

export class ColorPickerHistory {
  constructor(initialState) {
    this._entries = [{ ...initialState }];
    this._index = 0;
  }

  push(state) {
    const current = this._entries[this._index];
    const isSame = current
      && current.h === state.h
      && current.s === state.s
      && current.b === state.b
      && Math.abs(current.a - state.a) <= 0.001;
    if (isSame) return false;

    this._entries = this._entries.slice(0, this._index + 1);
    this._entries.push({
      h: state.h,
      s: state.s,
      b: state.b,
      a: state.a
    });
    this._index = this._entries.length - 1;
    return true;
  }

  canUndo() {
    return this._index > 0;
  }

  canRedo() {
    return this._index < this._entries.length - 1;
  }

  undo() {
    if (!this.canUndo()) return null;
    this._index -= 1;
    return { ...this._entries[this._index] };
  }

  redo() {
    if (!this.canRedo()) return null;
    this._index += 1;
    return { ...this._entries[this._index] };
  }
}