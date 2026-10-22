# Campos bloqueados para inscripción con padrón Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloquear Nombre y Cédula después de seleccionar una persona del padrón, dejando el celular editable.

**Architecture:** La página pública aplicará el estado `disabled` exclusivamente al seleccionar un resultado de padrón. El buscador seguirá operativo para permitir una nueva selección, que reemplazará los valores bloqueados. No se modifica la API porque ya valida que la cédula pertenece al padrón.

**Tech Stack:** JavaScript de navegador, HTML, Node.js `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-22-padron-campos-bloqueados-design.md`

## Global Constraints

- Aplicar el bloqueo solo a actividades con `restringir_padron`.
- Mantener editables celular, acompañante y nombre del acompañante.
- No modificar el contrato ni la validación de API.

## Review Focus

- Una actividad sin padrón debe conservar Nombre y Cédula editables.
- Elegir una segunda persona desde el buscador debe actualizar ambos valores y mantenerlos bloqueados.
- Una selección de padrón debe permitir enviar Nombre y Cédula desde JavaScript aunque los controles HTML estén deshabilitados.
- La búsqueda debe permanecer disponible después de elegir una persona.

---

### Task 1: Bloqueo de identidad seleccionada desde padrón

**Files:**
- Modify: `public/js/inscripcion.js`
- Test: validación manual en `public/inscripcion.html` con una actividad de padrón

**Interfaces:**
- Consumes: `Inscripcion.seleccionarDelPadron(index)` y los controles `#inscNombre`, `#inscCedula`, `#inscPadronSearch`, `#inscCelular`.
- Produces: los campos Nombre y Cédula con `disabled = true` después de una selección válida del padrón.

- [ ] **Step 1: Definir la comprobación manual fallida**

Abrir una inscripción con padrón, seleccionar una persona y confirmar que actualmente Nombre y Cédula siguen permitiendo edición.

- [ ] **Step 2: Bloquear la identidad al seleccionar el registro**

En `Inscripcion.seleccionarDelPadron(index)`, después de asignar `persona.nombre` y `persona.cedula`, establecer `disabled = true` para `#inscNombre` y `#inscCedula`. No deshabilitar `#inscPadronSearch` ni `#inscCelular`.

- [ ] **Step 3: Verificar manualmente los dos estados**

En una actividad con padrón, seleccionar una persona y comprobar que Nombre/Cédula están bloqueados mientras el celular y el buscador continúan editables. Seleccionar otra persona y comprobar que los valores bloqueados se reemplazan. En una actividad sin padrón, confirmar que Nombre/Cédula siguen editables.

- [ ] **Step 4: Ejecutar la suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/js/inscripcion.js docs/superpowers/specs/2026-10-22-padron-campos-bloqueados-design.md docs/superpowers/plans/2026-10-22-padron-campos-bloqueados-implementation.md
git commit -m "fix: lock padrón identity fields"
```
