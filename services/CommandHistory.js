/**
 * Gestor del historial de comandos para Undo / Redo
 */

export class CommandHistory {
  constructor(maxHistory = 50) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = maxHistory;
    this.listeners = new Set();
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  _notify(type, command) {
    this.listeners.forEach((listener) => {
      listener({ type, command });
    });
  }

  execute(command) {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];

    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    this._notify('execute', command);
  }

  undo() {
    if (!this.canUndo()) return null;
    const command = this.undoStack.pop();
    command.undo();
    this.redoStack.push(command);
    if (typeof paper !== 'undefined' && paper.view) paper.view.update();
    this._notify('undo', command);
    return command;
  }

  redo() {
    if (!this.canRedo()) return null;
    const command = this.redoStack.pop();
    command.execute();
    this.undoStack.push(command);
    if (typeof paper !== 'undefined' && paper.view) paper.view.update();
    this._notify('redo', command);
    return command;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
