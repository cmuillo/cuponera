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
