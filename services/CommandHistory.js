/**
 * Gestor del historial de comandos para Undo / Redo
 */

export class CommandHistory {
  constructor(maxHistory = 50) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = maxHistory;
  }

  execute(command) {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // Al ejecutar una nueva acción, se descarta la rama Redo

    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift(); // Evitar fugas de memoria limitando la pila
    }
  }

  undo() {
    if (!this.canUndo()) return false;
    const command = this.undoStack.pop();
    command.undo();
    this.redoStack.push(command);
    if (typeof paper !== 'undefined' && paper.view) paper.view.update();
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    const command = this.redoStack.pop();
    command.execute();
    this.undoStack.push(command);
    if (typeof paper !== 'undefined' && paper.view) paper.view.update();
    return true;
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
