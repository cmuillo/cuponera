# Cupo limitado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir actividades de cupo limitado que reserven uno o dos espacios, cobren por espacio y administren el pago sin crear cupones participantes.

**Architecture:** Se introduce una tabla `reservas_cupo` independiente de `cupones`; una reserva guarda su importe congelado, espacios, acompañante y pago. Los endpoints públicos de inscripción bifurcan por `tipo_inscripcion`, y la creación de reserva bloquea la actividad dentro de una transacción para contar espacios pendientes y confirmados antes de insertar. El historial y reportes consultan reservas por rutas administrativas separadas y las presentan diferenciadas de los cupones.

**Tech Stack:** Node.js 18+, Express 4, PostgreSQL (`pg`), JavaScript ES2022, Bootstrap 5, `node:test`, SheetJS CDN.

**Spec:** `docs/superpowers/specs/2026-10-22-cupo-limitado-design.md`

## Global Constraints

- Mantener las migraciones PostgreSQL no destructivas mediante `ADD COLUMN IF NOT EXISTS` y `CREATE TABLE IF NOT EXISTS`.
- No añadir dependencias npm; conservar Bootstrap, SheetJS y el cliente API existentes.
- El tipo `cupo_limitado` requiere capacidad total y precio por espacio enteros estrictamente mayores que cero.
- Un titular reserva un espacio; con acompañante reserva dos espacios y exige nombre del acompañante.
- Reservas pendientes y confirmadas ocupan capacidad hasta que se eliminen.
- Una reserva no crea ni altera registros de `cupones`; no participa en tómbola, ganadores o PDF de cupones.
- El importe de una reserva se congela al crearla; los cambios posteriores de precio afectan solo reservas nuevas.
- No permitir reducir la capacidad por debajo de los espacios reservados ni eliminar una actividad con reservas.
- Mantener el padrón: excluir tanto inscripciones normales como reservas existentes para la misma actividad y cédula.

## Review Focus

- Solicitudes concurrentes por los últimos espacios: probar que solo una reserva llega a crearse y no se excede capacidad en la **Task 3**.
- Acompañante cuando solo queda un espacio: probar rechazo atómico sin crear reserva parcial en la **Task 3**.
- Cambio de precio después de reservar: probar que `monto_total` histórico no cambia en la **Task 2**.
- Reducción de capacidad bajo espacios ocupados: probar error 400 y persistencia intacta en la **Task 2**.
- Persona de padrón ya reservada: probar que deja de aparecer en búsqueda pública en la **Task 3**.

---

## File Structure

- `src/db.js` — migraciones y creación de `reservas_cupo`.
- `src/utils/reservas-cupo.js` — reglas puras de tipo, capacidad, precio y cálculo de espacios/monto.
- `src/routes/sorteos.js` — validación de configuración, métricas de ocupación y bloqueo de eliminación.
- `src/routes/inscripciones.js` — disponibilidad pública, exclusión de padrón y creación transaccional de reservas.
- `src/routes/reservas-cupo.js` — listado, confirmación, eliminación y datos de notificación para administradores.
- `server.js` — registro del router administrativo de reservas.
- `public/js/page-sorteos.js` — campos condicionales de cupo limitado y métricas en tarjetas.
- `public/inscripcion.html` — bloque de disponibilidad y resumen de reserva.
- `public/js/inscripcion.js` — render de barra, cálculo visual y comprobante WhatsApp.
- `public/js/page-historial.js` — tabla unificada de cupones y reservas, acciones de pago/notificación/eliminación.
- `src/routes/reportes.js` / `public/js/page-reportes.js` — detalle, totales y exportación de reservas.
- `test/reservas-cupo.test.js` — reglas puras y validación de configuración.
- `test/reservas-cupo.integration.test.js` — casos PostgreSQL opcionales, ejecutados con `DATABASE_URL_TEST`.
- `README.md` — documentación de configuración, reserva y administración.

### Task 1: Modelo de dominio y migración de reservas

**Files:**
- Create: `src/utils/reservas-cupo.js`
- Modify: `src/db.js`
- Create: `test/reservas-cupo.test.js`

**Interfaces:**
- Produces `parseTipoInscripcion(body) -> { tipo_inscripcion, capacidad_total, precio_espacio } | { error }`.
- Produces `calcularReserva(acompanante, precioEspacio) -> { espacios_reservados, monto_total }`.
- Produces the `reservas_cupo` table and the `sorteos.tipo_inscripcion`, `sorteos.capacidad_total`, `sorteos.precio_espacio` columns.

- [ ] **Step 1: Write failing unit tests for limited-capacity rules**

```js
test('requiere capacidad y precio positivos para cupo limitado', () => {
  assert.deepEqual(parseTipoInscripcion({
    tipo_inscripcion: 'cupo_limitado', capacidad_total: 0, precio_espacio: 5000,
  }), { error: 'La cantidad total de espacios debe ser mayor a cero.' });
});

test('calcula dos espacios y dos precios con acompañante', () => {
  assert.deepEqual(calcularReserva(true, 5000), {
    espacios_reservados: 2, monto_total: 10000,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/reservas-cupo.test.js`  
Expected: FAIL because `reservas-cupo.js` does not exist.

- [ ] **Step 3: Implement domain helpers and non-destructive schema**

Implement `parseTipoInscripcion` with only `normal` and `cupo_limitado`; normal returns null capacity/price. Implement `calcularReserva` with exactly 1 or 2 spaces. In `src/db.js`, add the new `sorteos` columns and `reservas_cupo` with unique `(sorteo_id, cedula)`, `estado_pago` constrained by application values `pendiente|confirmado`, and indexes on `(sorteo_id, estado_pago)`.

- [ ] **Step 4: Run unit test to verify it passes**

Run: `node --test test/reservas-cupo.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db.js src/utils/reservas-cupo.js test/reservas-cupo.test.js
git commit -m "feat: add limited-capacity reservation schema"
```

### Task 2: Configure capacity and protect activity integrity

**Files:**
- Modify: `src/routes/sorteos.js`
- Modify: `public/js/page-sorteos.js`
- Modify: `test/reservas-cupo.integration.test.js`

**Interfaces:**
- Consumes `parseTipoInscripcion(body)` from Task 1.
- Produces `POST|PUT /api/sorteos` fields `tipo_inscripcion`, `capacidad_total`, `precio_espacio`.
- Produces list metrics `espacios_ocupados`, `espacios_disponibles`, and `reservas_total`.

- [ ] **Step 1: Write failing integration tests for activity edits with reservations**

Create two reservations totaling 2 spaces, then assert:

```js
assert.equal(updateResponse.status, 400);
assert.match(updateResponse.body.error, /capacidad.*espacios reservados/i);
assert.equal(savedReservation.monto_total, 5000);
```

Also assert deleting an activity with one reservation returns 400 while deactivation succeeds.

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `DATABASE_URL_TEST=<isolated-postgres-url> node --test test/reservas-cupo.integration.test.js`  
Expected: FAIL because activity configuration and deletion do not inspect reservations.

- [ ] **Step 3: Implement activity validation and UI fields**

In the POST/PUT handlers, validate via `parseTipoInscripcion`; when updating an existing limited activity, query `SUM(espacios_reservados)` from `reservas_cupo` before accepting a lower capacity. Preserve existing reservations’ `monto_total`. Extend the list query with reservation capacity metrics. Reject DELETE when either coupons or reservations exist. In `page-sorteos.js`, add a type selector under public registration and conditionally show capacity/price fields; show occupancy badges on limited-capacity activity cards.

- [ ] **Step 4: Run integration test to verify it passes**

Run: `DATABASE_URL_TEST=<isolated-postgres-url> node --test test/reservas-cupo.integration.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/sorteos.js public/js/page-sorteos.js test/reservas-cupo.integration.test.js
git commit -m "feat: configure limited-capacity activities"
```

### Task 3: Create public reservations transactionally

**Files:**
- Modify: `src/routes/inscripciones.js`
- Modify: `public/inscripcion.html`
- Modify: `public/js/inscripcion.js`
- Modify: `test/reservas-cupo.integration.test.js`

**Interfaces:**
- Consumes activity fields and `calcularReserva(acompanante, precioEspacio)`.
- Produces public activity details `{ tipo_inscripcion, capacidad_total, espacios_ocupados, espacios_disponibles, precio_espacio }`.
- Produces `POST /api/inscripciones` reservation response `{ reserva, sorteo, whatsapp_comprobantes }` for `cupo_limitado`.

- [ ] **Step 1: Write failing integration tests for reservation creation**

Add tests that create a capacity-2 activity and assert:

```js
assert.equal(reserva.estado_pago, 'pendiente');
assert.equal(reserva.espacios_reservados, 2);
assert.equal(reserva.monto_total, 10000);
assert.equal(cuponesCreados, 0);
```

Add parallel requests for the final single space and assert exactly one 201 response, plus an accompanying-reservation request when one space remains and assert 409 with no inserted row. Add a padrón search assertion proving a reserved cédula is absent.

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `DATABASE_URL_TEST=<isolated-postgres-url> node --test test/reservas-cupo.integration.test.js`  
Expected: FAIL because the current public endpoint always creates an inscription and coupon.

- [ ] **Step 3: Implement transactional reservation path and public UI**

In the public activity endpoint, include capacity values calculated from pending and confirmed reservations. In `POST /api/inscripciones`, branch only when `tipo_inscripcion === 'cupo_limitado'`: begin a transaction, lock the `sorteos` row with `FOR UPDATE`, validate padrón and duplicate reservation, sum occupied spaces, reject shortages, then insert `reservas_cupo`. Do not insert `inscripciones` or `cupones` in that branch. Update the public padrón query to exclude matching `reservas_cupo`.

In `inscripcion.html` and `inscripcion.js`, render a progress bar and availability text only for limited activities; update a reservation summary from accompaniment state; submit the existing form to the branch; display payment-pending confirmation and `wa.me` proof link. Hide the additional-coupon purchase tab and post-registration purchase button for limited activities.

- [ ] **Step 4: Run integration test and browser scenario to verify it passes**

Run: `DATABASE_URL_TEST=<isolated-postgres-url> node --test test/reservas-cupo.integration.test.js`  
Expected: PASS.

Browser check: create a two-space reservation with accompaniment; verify its pending state, total, WhatsApp link and reduced availability. Retry a person who already reserved and verify the list no longer offers them.

- [ ] **Step 5: Commit**

```bash
git add src/routes/inscripciones.js public/inscripcion.html public/js/inscripcion.js test/reservas-cupo.integration.test.js
git commit -m "feat: reserve limited event spaces publicly"
```

### Task 4: Manage payment and notification of reservations

**Files:**
- Create: `src/routes/reservas-cupo.js`
- Modify: `server.js`
- Modify: `public/js/page-historial.js`
- Modify: `test/reservas-cupo.integration.test.js`

**Interfaces:**
- Produces authenticated `GET /api/reservas-cupo`, `PATCH /api/reservas-cupo/:id/pago`, and `DELETE /api/reservas-cupo/:id`.
- Produces reservation fields `id`, activity metadata, holder, companion, spaces, amount and payment status.

- [ ] **Step 1: Write failing integration tests for reservation administration**

Assert that confirmation changes only one reservation from `pendiente` to `confirmado`, and that deletion removes it and restores availability. Assert the authenticated listing returns the stored amount and spaces.

- [ ] **Step 2: Run integration test to verify it fails**

Run: `DATABASE_URL_TEST=<isolated-postgres-url> node --test test/reservas-cupo.integration.test.js`  
Expected: FAIL because reservation administration routes do not exist.

- [ ] **Step 3: Implement administrative routes and unified history UI**

Build the authenticated reservation router with parameterized SQL. Register it in `server.js`. In `page-historial.js`, request coupons and reservations, merge by creation time, and render reservation-specific rows (no coupon code) with spaces, amount, pending/confirmed badge, confirmation button, WhatsApp reminder link for pending payment, and WhatsApp “pago verificado y espacio reservado” link after confirmation. The delete control calls the reservation route so the transactionally stored capacity becomes available again.

- [ ] **Step 4: Run integration test and browser checks to verify it passes**

Run: `DATABASE_URL_TEST=<isolated-postgres-url> node --test test/reservas-cupo.integration.test.js`  
Expected: PASS.

Browser check: confirm a pending reservation, inspect the verified-payment WhatsApp message, delete another reservation, and verify the public availability rises by its spaces.

- [ ] **Step 5: Commit**

```bash
git add src/routes/reservas-cupo.js server.js public/js/page-historial.js test/reservas-cupo.integration.test.js
git commit -m "feat: manage limited-capacity reservation payments"
```

### Task 5: Report capacity reservations and document the workflow

**Files:**
- Modify: `src/routes/reportes.js`
- Modify: `public/js/page-reportes.js`
- Modify: `README.md`
- Modify: `test/reservas-cupo.integration.test.js`

**Interfaces:**
- Produces authenticated `GET /api/reportes/reservas-cupo?sorteoId=&buscar=`.
- Produces export rows with reservation spaces, amount and payment state.

- [ ] **Step 1: Write failing integration test for reservation reporting**

Assert the reporting endpoint returns both pending and confirmed reservations with `espacios_reservados`, `monto_total`, and `estado_pago`; assert it never returns a generated coupon code.

- [ ] **Step 2: Run integration test to verify it fails**

Run: `DATABASE_URL_TEST=<isolated-postgres-url> node --test test/reservas-cupo.integration.test.js`  
Expected: FAIL because no reservation report exists.

- [ ] **Step 3: Implement report and export presentation**

Add the parameterized reservation report route. In `page-reportes.js`, show reservation totals separately from coupon totals and include a `Reservas de cupo` worksheet in the Excel workbook with titular, companion, spaces, amount and payment state. Do not add reservations to the coupon PDF. Document public availability, accompaniment pricing, payment states, administrative constraints and the non-participation rule in `README.md`.

- [ ] **Step 4: Run integration, browser, and full unit tests**

Run: `DATABASE_URL_TEST=<isolated-postgres-url> node --test test/reservas-cupo.integration.test.js && npm test`  
Expected: all tests PASS.

Browser check: export reservation data and verify the new sheet contains amount, spaces and payment state; verify PDF Cupones excludes reservations.

- [ ] **Step 5: Commit**

```bash
git add src/routes/reportes.js public/js/page-reportes.js README.md test/reservas-cupo.integration.test.js
git commit -m "feat: report limited-capacity reservations"
```

## Self-Review

1. **Spec coverage:** Tasks 1–2 cover schema and administration; Task 3 covers public availability, accompaniment, payment pending, padrón, transaction safety and no coupons; Task 4 covers history, confirmation, deletion and notifications; Task 5 covers reporting, exports and documentation. No gaps found.
2. **Step scan:** Every task starts from a named failing behavior, specifies its concrete interface and ends with a verification command and commit.
3. **Type consistency:** `tipo_inscripcion`, `capacidad_total`, `precio_espacio`, `espacios_reservados`, `monto_total`, `estado_pago`, and `reservas_cupo` use the same names across schema, routes, UI and tests.
4. **Review Focus:** Each of the five listed risks is assigned to a precise test in Task 2 or Task 3.
5. **Proportion:** The plan describes interfaces, fixtures and verification while leaving implementation bodies to the executor.
