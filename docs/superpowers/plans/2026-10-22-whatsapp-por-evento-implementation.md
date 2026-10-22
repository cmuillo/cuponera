# Número de WhatsApp por evento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cada Sorteo/Actividad use un número propio de WhatsApp para comprobantes, con respaldo en la configuración global.

**Architecture:** La columna opcional de `sorteos` almacenará el número específico normalizado. La API administrativa lo validará al crear o editar, y las respuestas públicas de reservas y compras resolverán el destinatario del evento antes de usar el global. La interfaz administrativa lo gestionará desde el formulario de la actividad.

**Tech Stack:** Node.js 18+, Express, PostgreSQL, JavaScript de navegador, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-22-whatsapp-por-evento-design.md`

## Global Constraints

- Conservar `configuracion.whatsapp_comprobantes` como respaldo temporal para actividades existentes.
- Reutilizar `normalizeCelular` para validar y normalizar el número del evento.
- No modificar paquetes, la bandera global de compras, tómbola, historial ni reportes.
- Las notificaciones administrativas al teléfono del participante no cambian.

## Review Focus

- Evento con número propio y número global distinto: reserva y compra deben devolver exactamente el número del evento.
- Evento existente sin número propio: reserva y compra deben conservar el respaldo global.
- Cadena no telefónica, demasiado corta o demasiado larga: POST y PUT deben responder 400 sin escribir el evento.
- Campo vacío: POST y PUT deben guardar `NULL` y permitir el respaldo global.
- Editar otros campos de un evento antiguo: debe conservar o actualizar explícitamente el número sin romper restricciones de cupo.

---

### Task 1: Persistencia y API administrativa por evento

**Files:**
- Modify: `src/db.js`
- Modify: `src/routes/sorteos.js`
- Test: `test/reservas-cupo.integration.test.js`

**Interfaces:**
- Consumes: `normalizeCelular(celular) -> string | null` desde `src/utils/cupones.js`.
- Produces: `sorteos.whatsapp_comprobantes` (`VARCHAR(25) NULL`) y POST/PUT `/api/sorteos` que aceptan `whatsapp_comprobantes` opcional y devuelven el valor normalizado.

- [ ] **Step 1: Escribir pruebas HTTP fallidas de creación y edición**

Agregar pruebas a `test/reservas-cupo.integration.test.js` que creen un evento con `whatsapp_comprobantes: '8800 1234'` y esperen `'88001234'`; que actualicen otro evento con `'+506 8111-2222'` y esperen `'+5068111-2222'`; y que esperen 400 ante `'abc'`.

- [ ] **Step 2: Ejecutar las pruebas para verificar que fallan**

Run: `npm test`

Expected: FAIL porque la columna o el campo de respuesta aún no existen.

- [ ] **Step 3: Agregar la migración aditiva y la validación administrativa**

En `src/db.js`, ejecutar `ALTER TABLE sorteos ADD COLUMN IF NOT EXISTS whatsapp_comprobantes VARCHAR(25)`. En `src/routes/sorteos.js`, normalizar el campo cuando sea no vacío, responder `400 { error: 'Formato de número de WhatsApp inválido.' }` si falla, y añadir el valor a los `INSERT` y `UPDATE`; un valor vacío se persiste como `NULL`.

- [ ] **Step 4: Ejecutar las pruebas para verificar que pasan**

Run: `npm test`

Expected: PASS, incluida la normalización y el rechazo de formatos inválidos.

- [ ] **Step 5: Commit**

```bash
git add src/db.js src/routes/sorteos.js test/reservas-cupo.integration.test.js
git commit -m "feat: configure WhatsApp per event"
```

### Task 2: Resolver el destinatario público por evento

**Files:**
- Modify: `src/routes/inscripciones.js`
- Test: `test/reservas-cupo.integration.test.js`

**Interfaces:**
- Consumes: `sorteo.whatsapp_comprobantes` desde las cargas existentes de la actividad y `getConfig().whatsapp_comprobantes`.
- Produces: respuestas 201 de `POST /api/inscripciones` (cupo limitado) y `POST /api/inscripciones/compra` con `whatsapp_comprobantes` del evento o, si es `NULL`, del respaldo global.

- [ ] **Step 1: Escribir pruebas HTTP fallidas de prioridad y respaldo**

En `test/reservas-cupo.integration.test.js`, configurar el valor global mediante `PUT /api/config`; crear una actividad limitada con un número distinto y verificar que su reserva devuelve el número propio; crear o usar una actividad normal sin número y verificar que su compra devuelve el global.

- [ ] **Step 2: Ejecutar las pruebas para verificar que fallan**

Run: `npm test`

Expected: FAIL porque ambas rutas aún devuelven siempre la configuración global.

- [ ] **Step 3: Aplicar la resolución de destino en ambas rutas**

En `src/routes/inscripciones.js`, después de cargar la configuración, resolver `const whatsappComprobantes = sorteo.whatsapp_comprobantes || config.whatsapp_comprobantes` y usarlo exclusivamente en las respuestas de reserva y compra. No cambiar los números de notificaciones administrativas.

- [ ] **Step 4: Ejecutar las pruebas para verificar que pasan**

Run: `npm test`

Expected: PASS; el evento propio prevalece y una actividad antigua usa el respaldo.

- [ ] **Step 5: Commit**

```bash
git add src/routes/inscripciones.js test/reservas-cupo.integration.test.js
git commit -m "fix: use event WhatsApp for receipts"
```

### Task 3: Configurar el número desde Sorteos y Actividades

**Files:**
- Modify: `public/js/page-sorteos.js`
- Modify: `public/js/page-config.js`
- Modify: `docs/superpowers/specs/2026-10-22-whatsapp-por-evento-design.md`

**Interfaces:**
- Consumes: la propiedad `whatsapp_comprobantes` devuelta por `GET /api/sorteos`.
- Produces: el payload de `PageSorteos.saveSorteo()` contiene `whatsapp_comprobantes`; editar un evento rellena el campo; cancelarlo lo limpia.

- [ ] **Step 1: Definir la comprobación manual fallida**

Con el servidor en desarrollo, abrir **Sorteos y Actividades**: confirmar que no existe todavía un campo por evento, que al editar no puede verse un valor previo y que Configuración aún describe el número global como único destinatario.

- [ ] **Step 2: Añadir el control y enlazarlo al formulario**

En `public/js/page-sorteos.js`, añadir un `input type="tel"` identificado como `sorteoWhatsapp`, con etiqueta “WhatsApp para comprobantes” y ayuda que indique que vacío usa el valor global. Incluirlo en `saveSorteo`, rellenarlo en `editSorteo` y asegurar que `cancelEdit` lo deja vacío mediante el `reset` existente.

- [ ] **Step 3: Aclarar el rol del número global**

En `public/js/page-config.js`, conservar el control global y cambiar su texto a “WhatsApp de respaldo para comprobantes”; explicar que se usa únicamente cuando la actividad no tiene un número propio. Actualizar el texto equivalente del spec si la redacción final cambia.

- [ ] **Step 4: Ejecutar la verificación manual y la suite**

Run: `npm test`

Expected: PASS.

Verificar manualmente que crear/editar una actividad conserva su número, que dejarlo vacío funciona y que la pantalla Configuración comunica explícitamente el respaldo.

- [ ] **Step 5: Commit**

```bash
git add public/js/page-sorteos.js public/js/page-config.js docs/superpowers/specs/2026-10-22-whatsapp-por-evento-design.md
git commit -m "feat: manage receipt WhatsApp per event"
```

### Task 4: Verificación de integración y documentación de entrega

**Files:**
- Modify: `docs/superpowers/plans/2026-10-22-whatsapp-por-evento-implementation.md`

**Interfaces:**
- Consumes: los contratos de los Tasks 1 a 3.
- Produces: evidencia de la suite completa para la entrega.

- [ ] **Step 1: Ejecutar la suite completa contra PostgreSQL de prueba**

Run: `npm test`

Expected: PASS para todas las pruebas, incluidas `reservas-cupo.integration.test.js`.

- [ ] **Step 2: Revisar únicamente los cambios de esta característica**

Run: `git diff HEAD~3..HEAD -- src/db.js src/routes/sorteos.js src/routes/inscripciones.js public/js/page-sorteos.js public/js/page-config.js test/reservas-cupo.integration.test.js`

Expected: sin cambios fuera de la migración, validación, resolución, interfaz y pruebas descritas.

- [ ] **Step 3: Commit**

No se requiere un commit adicional si los commits de cada tarea ya contienen todos los cambios verificados.
