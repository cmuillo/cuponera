const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL_TEST;
const port = Number(process.env.TEST_PORT || 3108);
const baseUrl = `http://127.0.0.1:${port}`;

if (!databaseUrl) {
  throw new Error('DATABASE_URL_TEST debe apuntar a una base PostgreSQL aislada.');
}

let server;
let pool;
let token;
let sorteo;

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  return { status: response.status, body: await response.json() };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/me`);
      if (response.status === 401) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('El servidor de integración no inició.');
}

async function waitForDeleteLock() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = await pool.query(`
      SELECT query
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND state = 'active'
        AND pid <> pg_backend_pid()
        AND (query LIKE 'SELECT id FROM sorteos%' OR query LIKE 'DELETE FROM sorteos%')
      LIMIT 1
    `);
    if (result.rows.length > 0) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('La eliminación no quedó esperando el bloqueo de la actividad.');
}

test.before(async () => {
  pool = new Pool({ connectionString: databaseUrl });
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');

  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      NODE_ENV: 'test',
      ADMIN_USER: 'admin',
      ADMIN_PASSWORD: 'Admin123!',
    },
    stdio: 'pipe',
  });
  await waitForServer();

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'Admin123!' }),
  });
  assert.equal(login.status, 200);
  token = login.body.token;

  const created = await api('/api/sorteos', {
    method: 'POST',
    body: JSON.stringify({
      nombre: 'Actividad con cupo',
      fecha_sorteo: '2027-01-15',
      activo: true,
      monto_minimo: 0,
      modo_inscripcion: true,
      restringir_padron: false,
      tipo_inscripcion: 'cupo_limitado',
      capacidad_total: 4,
      precio_espacio: 5000,
    }),
  });
  assert.equal(created.status, 201);
  sorteo = created.body;

  await pool.query(
    `INSERT INTO reservas_cupo
       (sorteo_id, cedula, nombre, celular, espacios_reservados, monto_total)
     VALUES ($1, '111', 'Ana', '88888888', 1, 5000),
            ($1, '222', 'Bea', '87777777', 1, 5000)`,
    [sorteo.id]
  );
});

test.after(async () => {
  if (server && !server.killed) {
    server.kill();
    await once(server, 'exit');
  }
  await pool?.end();
});

test('impide reducir el cupo por debajo de los espacios reservados y conserva los montos congelados', async () => {
  const updateResponse = await api(`/api/sorteos/${sorteo.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...sorteo,
      capacidad_total: 1,
      precio_espacio: 6000,
    }),
  });

  assert.equal(updateResponse.status, 400);
  assert.match(updateResponse.body.error, /capacidad.*espacios reservados/i);

  const priceUpdateResponse = await api(`/api/sorteos/${sorteo.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...sorteo,
      capacidad_total: 4,
      precio_espacio: 6000,
    }),
  });
  assert.equal(priceUpdateResponse.status, 200);
  assert.equal(priceUpdateResponse.body.precio_espacio, 6000);

  const savedReservation = await pool.query(
    'SELECT monto_total FROM reservas_cupo WHERE sorteo_id = $1 AND cedula = $2',
    [sorteo.id, '111']
  );
  assert.equal(savedReservation.rows[0].monto_total, 5000);
});

test('expone ocupación, no elimina actividades reservadas y permite desactivarlas', async () => {
  const listResponse = await api('/api/sorteos');
  assert.equal(listResponse.status, 200);
  const listed = listResponse.body.find(item => item.id === sorteo.id);
  assert.equal(listed.espacios_ocupados, 2);
  assert.equal(listed.espacios_disponibles, 2);
  assert.equal(listed.reservas_total, 2);

  const deleteResponse = await api(`/api/sorteos/${sorteo.id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 400);
  assert.match(deleteResponse.body.error, /reservas/i);

  const deactivateResponse = await api(`/api/sorteos/${sorteo.id}/toggle`, { method: 'PATCH' });
  assert.equal(deactivateResponse.status, 200);
  assert.equal(deactivateResponse.body.activo, false);
});

test('no elimina una actividad cuando una reserva se confirma mientras espera el bloqueo', async () => {
  const created = await api('/api/sorteos', {
    method: 'POST',
    body: JSON.stringify({
      nombre: 'Actividad protegida por bloqueo',
      fecha_sorteo: '2027-01-16',
      activo: true,
      tipo_inscripcion: 'cupo_limitado',
      capacidad_total: 4,
      precio_espacio: 5000,
    }),
  });
  assert.equal(created.status, 201);

  const lockClient = await pool.connect();
  try {
    await lockClient.query('BEGIN');
    await lockClient.query('SELECT id FROM sorteos WHERE id = $1 FOR KEY SHARE', [created.body.id]);

    const deletePromise = api(`/api/sorteos/${created.body.id}`, { method: 'DELETE' });
    await waitForDeleteLock();

    await lockClient.query(
      `INSERT INTO reservas_cupo
         (sorteo_id, cedula, nombre, celular, espacios_reservados, monto_total)
       VALUES ($1, '333', 'Carla', '86666666', 1, 5000)`,
      [created.body.id]
    );
    await lockClient.query('COMMIT');

    const deleteResponse = await deletePromise;
    assert.equal(deleteResponse.status, 400);
    assert.match(deleteResponse.body.error, /reservas/i);

    const reservation = await pool.query(
      'SELECT COUNT(*)::int AS total FROM reservas_cupo WHERE sorteo_id = $1',
      [created.body.id]
    );
    assert.equal(reservation.rows[0].total, 1);
  } finally {
    await lockClient.query('ROLLBACK').catch(() => {});
    lockClient.release();
  }
});

test('crea una reserva pendiente de dos espacios sin inscripción ni cupón', async () => {
  const created = await api('/api/sorteos', {
    method: 'POST',
    body: JSON.stringify({
      nombre: 'Actividad pública de dos espacios',
      fecha_sorteo: '2027-01-17',
      activo: true,
      modo_inscripcion: true,
      tipo_inscripcion: 'cupo_limitado',
      capacidad_total: 2,
      precio_espacio: 5000,
    }),
  });
  assert.equal(created.status, 201);

  const reservationResponse = await api('/api/inscripciones', {
    method: 'POST',
    body: JSON.stringify({
      sorteo_id: created.body.id,
      cedula: '444',
      nombre: 'Diana',
      celular: '85555555',
      acompanante: true,
      acompanante_nombre: 'Ernesto',
    }),
  });

  assert.equal(reservationResponse.status, 201);
  assert.equal(reservationResponse.body.reserva.estado_pago, 'pendiente');
  assert.equal(reservationResponse.body.reserva.espacios_reservados, 2);
  assert.equal(reservationResponse.body.reserva.monto_total, 10000);
  assert.ok(Object.hasOwn(reservationResponse.body, 'whatsapp_comprobantes'));

  const [cupones, inscripciones, reserva] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM cupones WHERE sorteo_id = $1', [created.body.id]),
    pool.query('SELECT COUNT(*)::int AS total FROM inscripciones WHERE sorteo_id = $1', [created.body.id]),
    pool.query('SELECT * FROM reservas_cupo WHERE sorteo_id = $1 AND cedula = $2', [created.body.id, '444']),
  ]);
  assert.equal(cupones.rows[0].total, 0);
  assert.equal(inscripciones.rows[0].total, 0);
  assert.equal(reserva.rows.length, 1);
});

test('solo permite una reserva concurrente para el último espacio', async () => {
  const created = await api('/api/sorteos', {
    method: 'POST',
    body: JSON.stringify({
      nombre: 'Actividad con último espacio',
      fecha_sorteo: '2027-01-18',
      activo: true,
      modo_inscripcion: true,
      tipo_inscripcion: 'cupo_limitado',
      capacidad_total: 2,
      precio_espacio: 5000,
    }),
  });
  assert.equal(created.status, 201);
  await pool.query(
    `INSERT INTO reservas_cupo
       (sorteo_id, cedula, nombre, celular, espacios_reservados, monto_total)
     VALUES ($1, '555', 'Francisca', '84444444', 1, 5000)`,
    [created.body.id]
  );

  const reserva = (cedula, nombre) => api('/api/inscripciones', {
    method: 'POST',
    body: JSON.stringify({
      sorteo_id: created.body.id,
      cedula,
      nombre,
      celular: '83333333',
      acompanante: false,
      acompanante_nombre: '',
    }),
  });
  const responses = await Promise.all([
    reserva('556', 'Gabriel'),
    reserva('557', 'Helena'),
  ]);
  assert.equal(responses.filter(response => response.status === 201).length, 1);
  assert.equal(responses.filter(response => response.status === 409).length, 1);

  const ocupados = await pool.query(
    'SELECT COALESCE(SUM(espacios_reservados), 0)::int AS total FROM reservas_cupo WHERE sorteo_id = $1',
    [created.body.id]
  );
  assert.equal(ocupados.rows[0].total, 2);
});

test('rechaza acompañante cuando queda un espacio y oculta cédulas reservadas del padrón', async () => {
  const created = await api('/api/sorteos', {
    method: 'POST',
    body: JSON.stringify({
      nombre: 'Actividad limitada con padrón',
      fecha_sorteo: '2027-01-19',
      activo: true,
      modo_inscripcion: true,
      restringir_padron: true,
      tipo_inscripcion: 'cupo_limitado',
      capacidad_total: 3,
      precio_espacio: 5000,
    }),
  });
  assert.equal(created.status, 201);
  await pool.query(
    `INSERT INTO sorteo_padron (sorteo_id, cedula, nombre)
     VALUES ($1, '666', 'Inés Reservada'),
            ($1, '667', 'Ismael Disponible'),
            ($1, '668', 'Irene Acompañada')`,
    [created.body.id]
  );
  await pool.query(
    `INSERT INTO reservas_cupo
       (sorteo_id, cedula, nombre, celular, acompanante, acompanante_nombre, espacios_reservados, monto_total)
     VALUES ($1, '666', 'Inés Reservada', '82222222', true, 'Laura', 2, 10000)`,
    [created.body.id]
  );

  const padron = await api(`/api/inscripciones/padron?sorteo_id=${created.body.id}&buscar=In`);
  assert.equal(padron.status, 200);
  assert.deepEqual(padron.body.map(persona => persona.cedula), []);

  const insufficient = await api('/api/inscripciones', {
    method: 'POST',
    body: JSON.stringify({
      sorteo_id: created.body.id,
      cedula: '668',
      nombre: 'Irene Acompañada',
      celular: '81111111',
      acompanante: true,
      acompanante_nombre: 'José',
    }),
  });
  assert.equal(insufficient.status, 409);

  const rejected = await pool.query(
    'SELECT COUNT(*)::int AS total FROM reservas_cupo WHERE sorteo_id = $1 AND cedula = $2',
    [created.body.id, '668']
  );
  assert.equal(rejected.rows[0].total, 0);
});
