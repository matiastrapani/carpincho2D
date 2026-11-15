# CONSOLE_GUIDE.md — Guía de Diseño y Reglas de la Consola (Estilo Rhino 3D)

Este documento define cómo se comporta la consola del CAD, cómo dialoga con las herramientas y los paneles, y qué piezas compartidas deben reutilizarse para evitar duplicar código o criterios.

---

## 1. Filosofía: ¿Qué es (y qué NO es) nuestra consola?

| Lo que SÍ es | Lo que NO es (Errores a evitar) |
| :--- | :--- |
| **Un guía conversacional:** Acompaña cada paso de la herramienta activa indicando qué espera, qué opciones hay y cuál es el valor por defecto. | **Un formato de guardado:** No usamos el texto de la consola para reconstruir planos complejos desde cero ni reemplazar un futuro archivo de proyecto. |
| **Un bus único de acciones:** Toda acción importante (dibujar, editar, deshacer, cambiar capas o propiedades) pasa por el mismo flujo y deja rastro legible. | **Un grabador de clics del ratón:** No traducimos selecciones con el mouse ni movimientos de sliders a comandos artificiales tipo `SelName` o `-Properties`. |
| **Un ejecutor de macros simples:** Permite pegar secuencias directas de dibujo (ej. `Line 0,0 100,0 Circle 50,0 25`) porque el lector procesa coordenadas y números en orden. | **Un cuello de botella para la UI:** Cambiar un color o visibilidad en un panel debe ser inmediato y limpio, sin inundar el historial con ruido técnico. |

---

## 2. Anatomía de un Paso en Consola (Interacción Rhino)

Cada vez que una herramienta está activa y espera datos del usuario, la consola muestra una línea estructurada con cuatro elementos claros:

```text
Radio del círculo <25.00> [Diámetro] [3Puntos]:
```

1. **Instrucción clara (`Radio del círculo`):** Indica exactamente qué dato se espera ahora (un punto, una distancia, seleccionar una entidad, etc.).
2. **Valor por defecto (`<25.00>`):** Es el último valor numérico o distancia confirmada en esa herramienta durante la sesión. Si el usuario presiona `Enter` o `Espacio` sin escribir nada, se acepta automáticamente.
3. **Opciones contextuales (`[Diámetro] [3Puntos]`):**
   - Se renderizan como botones clickeables directamente en la barra de consola.
   - **Letra clave subrayada:** La letra activadora debe mostrarse subrayada en la interfaz (ej. `[<u>D</u>iámetro]`, `[<u>3</u>Puntos]`) y se dispara escribiendo esa letra + `Enter`.
4. **Entrada flexible:** En un mismo paso, el usuario puede hacer clic en el lienzo, escribir coordenadas (`100,50`, `@50,0`, `@50<45`), ingresar un número (`25`) o elegir una opción.

---

## 3. Piezas Reutilizables del Motor (Cero Duplicación entre Herramientas)

Ninguna herramienta puede implementar por su cuenta cómo se seleccionan entidades ni cómo se leen coordenadas. Todas consumen dos servicios compartidos:

### A. Selector Reutilizable de Entidades (`EntityPicker`)
Toda herramienta que necesite seleccionar objetos antes o durante su ejecución delega en un único mecanismo compartido con dos modos:
- **Modo Simple (`mode: 'single'`):** Selecciona 1 entidad con un clic (respetando filtros opcionales, ej. excluir puntos o imágenes) y avanza automáticamente al siguiente estado.
- **Modo Múltiple (`mode: 'multiple'`):** Permite acumular entidades mediante clic individual o recuadro (ventana/cruce), muestra el conteo en vivo (`3 entidades seleccionadas`) y confirma la selección con `Enter` o clic derecho.
- **Regla transversal:** En ambos modos se ignoran automáticamente entidades en capas ocultas (`visible: false`) o bloqueadas (`locked: true`).

### B. Lector Único de Entradas (`CommandInputParser`)
Centraliza la interpretación de todo lo que el usuario escribe mientras una herramienta está activa:
- Cadena vacía (`Enter` / `Espacio`) $\rightarrow$ `ACCEPT_DEFAULT`
- Letra clave o nombre de opción activa $\rightarrow$ `OPTION`
- Valor numérico (`25`, `12.5`) $\rightarrow$ `NUMBER`
- Coordenadas absolutas (`100,50`), relativas (`@50,0`) o polares (`@50<45`) $\rightarrow$ `POINT`

---

## 4. Teclas Rápidas vs. Alias de Comandos y Autocompletado

Para evitar colisiones de teclado y mantener la interfaz predecible, se separan estrictamente dos conceptos:

1. **Teclas Rápidas (`CAD_THEME.shortcuts` en `cadTheme.js`):**
   - Reservadas **exclusivamente** para ayudas de dibujo y acciones globales rápidas (ej. `F8` Ortho, `F3` OSNAP, `F7` Grid, `Ctrl+Z` Undo, `Ctrl+Y` Redo, `Escape`, `Delete`).
   - Prohibido asignar teclas sueltas del teclado a herramientas de dibujo o edición.
2. **Comandos y Alias Cortos (`CommandRegistry`):**
   - Las herramientas y acciones se invocan escribiendo su nombre o su **alias corto** en consola + `Enter` (ej. `l` $\rightarrow$ `Line`, `pl` $\rightarrow$ `Polyline`, `c` $\rightarrow$ `Circle`, `m` $\rightarrow$ `Move`, `u` $\rightarrow$ `Undo`).
3. **Autocompletado en Consola:**
   - Al escribir en la consola, se despliega una lista filtrada de comandos y alias coincidentes.
   - Se navega con flechas `↑` / `↓` y se completa/acepta con **`Enter`** o **`Flecha Derecha (→)`**.

---

## 5. Unificación de `Undo / Redo` y Paneles (`Capas` y `Propiedades`)

- **`Undo` y `Redo` unificados:** Funcionan con `Ctrl+Z` / `Ctrl+Y`, desde los botones del header y escribiendo `undo` (`u`) / `redo` en consola. Siempre imprimen rastro claro:

```text
Comando: Undo
Deshecho: Mover 2 entidades
```

- **Paneles desacoplados:** `LayerPanelUI` y `PropertyPanelUI` solo disparan comandos (`cadService.executeCommand(...)`). Cada `Command` implementa `getDescription()` y `ConsoleManager` escucha las transacciones de `CADService` para imprimir confirmaciones limpias (ej. `Capa "Muros" creada` o `Grosor actualizado a 2.0 px`).

---

## 6. Formato Unificado de Herramientas (`ToolFSM`)

Todas las herramientas del sistema deben compartir exactamente la misma estructura de opciones y salidas en consola:

1. **Estados explícitos:** Cada herramienta define sus etapas (`SELECCIONAR_ENTIDADES`, `PEDIR_CENTRO`, `PEDIR_RADIO`, etc.) mediante `BaseTool`, sin banderas dispersas ni acceso directo al DOM (`document.getElementById`).
2. **Formato estándar de opciones:** Toda opción declarada en un paso usa el contrato `{ key: 'D', label: 'Diámetro', active: boolean }`, garantizando que la consola siempre subraye la `key` (`[<u>D</u>iámetro]`) y la acepte por clic o teclado.
3. **Formato estándar de salida (`logResult`):** Al finalizar, toda herramienta imprime una única línea de resultado con el formato `<Entidad/Acción>: <Resumen métrico>`:
   - `Línea #1 creada: Longitud = 120.50, Ángulo = 30.0°`
   - `Círculo #1 creado: Radio = 25.00, Diámetro = 50.00`
   - `3 entidades movidas: Distancia = 45.00 (dx = 45.00, dy = 0.00)`
4. **Salida limpia:** `Escape` o clic derecho cancelan el paso actual si hay una operación en curso, o regresan a `SelectTool` si está en reposo, eliminando cualquier guía visual temporal.

---

## 7. Checklists de Control (Inicio y Cierre)

### Checklist ANTES de programar una herramienta o bloque
- [ ] **¿Reutilizo piezas existentes?** Si necesito seleccionar 1 o varias entidades, ¿uso el `EntityPicker` compartido en lugar de programar hit-tests o recuadros nuevos?
- [ ] **¿Uso el parser común?** ¿Delego coordenadas, números y opciones en `CommandInputParser` en lugar de parsear strings manualmente?
- [ ] **¿Los estados y opciones siguen el contrato?** ¿Definí los estados de la herramienta con `{ key, label, active }` para que la consola subraye la letra clave?
- [ ] **¿Respeto `cadTheme.js`?** ¿Todas las guías visuales usan colores/estilos de `cadTheme.js` y evito agregar teclas rápidas innecesarias?

### Checklist AL FINALIZAR un bloque de programación o herramienta
- [ ] **¿Consola y Undo/Redo trazables?** ¿La acción imprime inicio, opciones con letra subrayada, `<default>` funcional con `Enter`/`Espacio` y salida unificada (`logResult`), además de funcionar con `Undo`/`Redo` (`u` + `Enter` / `Ctrl+Z`)?
- [ ] **¿Cero acoplamiento DOM / Globales?** ¿No hay `document.getElementById`, colores hex hardcodeados ni llamadas nuevas a `window.cad*` o `panelUI.refresh()`?
- [ ] **¿Limpieza completa?** ¿Al cancelar con `Escape` o clic derecho se borran todas las previsualizaciones y listeners temporales?
- [ ] **¿Límites de tamaño respetados?** ¿Cada archivo se mantiene bajo **350 líneas** y cada método bajo **80 líneas**?
- [ ] **¿Documentación al día?** ¿Marqué la tarea como completada en `BACKLOG.md` antes del `git commit`?