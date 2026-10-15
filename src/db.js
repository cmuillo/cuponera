const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const DEFAULT_PAQUETES = [
  { monto: 5000, cupones: 1 },
  { monto: 8000, cupones: 2 },
  { monto: 10000, cupones: 3 },
];

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Tabla de usuarios
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Tabla de sorteos
    await client.query(`
      CREATE TABLE IF NOT EXISTS sorteos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        descripcion TEXT,
        fecha_sorteo DATE NOT NULL,
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Tabla de cupones
    await client.query(`
      CREATE TABLE IF NOT EXISTS cupones (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(30) UNIQUE NOT NULL,
        sorteo_id INTEGER NOT NULL REFERENCES sorteos(id) ON DELETE CASCADE,
        celular VARCHAR(25) NOT NULL,
        cedula VARCHAR(25) NOT NULL,
        nombre_persona VARCHAR(255),
        ganador BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Tabla de configuración del sistema (clave/valor)
    await client.query(`
      CREATE TABLE IF NOT EXISTS configuracion (
        clave VARCHAR(60) PRIMARY KEY,
        valor TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Padrón autorizado por sorteo (listado previo de cédulas)
    await client.query(`
      CREATE TABLE IF NOT EXISTS sorteo_padron (
        id SERIAL PRIMARY KEY,
        sorteo_id INTEGER NOT NULL REFERENCES sorteos(id) ON DELETE CASCADE,
        cedula VARCHAR(25) NOT NULL,
        nombre VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (sorteo_id, cedula)
      )
    `);

    // Inscripciones realizadas desde la ventana pública de invitado
    await client.query(`
      CREATE TABLE IF NOT EXISTS inscripciones (
        id SERIAL PRIMARY KEY,
        sorteo_id INTEGER NOT NULL REFERENCES sorteos(id) ON DELETE CASCADE,
        cedula VARCHAR(25) NOT NULL,
        nombre VARCHAR(255),
        celular VARCHAR(25) NOT NULL,
        acompanante BOOLEAN DEFAULT FALSE,
        acompanante_nombre VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (sorteo_id, cedula)
      )
    `);

    await client.query('COMMIT');

    // Migraciones no destructivas (columnas nuevas)
    await pool.query(`
      ALTER TABLE sorteos ADD COLUMN IF NOT EXISTS monto_minimo INTEGER DEFAULT 0
    `);
    await pool.query(`
      ALTER TABLE cupones ADD COLUMN IF NOT EXISTS monto_venta INTEGER DEFAULT 0
    `);
    await pool.query(`
      ALTER TABLE sorteos ADD COLUMN IF NOT EXISTS modo_inscripcion BOOLEAN DEFAULT FALSE
    `);
    await pool.query(`
      ALTER TABLE sorteos ADD COLUMN IF NOT EXISTS restringir_padron BOOLEAN DEFAULT FALSE
    `);
    await pool.query(`
      ALTER TABLE cupones ADD COLUMN IF NOT EXISTS origen VARCHAR(20) DEFAULT 'admin'
    `);
    await pool.query(`
      ALTER TABLE cupones ADD COLUMN IF NOT EXISTS estado_pago VARCHAR(20) DEFAULT 'confirmado'
    `);
    await pool.query(`
      ALTER TABLE inscripciones ADD COLUMN IF NOT EXISTS acompanante_nombre VARCHAR(255)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cupones_sorteo_cedula ON cupones (sorteo_id, cedula)
    `);

    // Configuración por defecto
    await pool.query(
      `INSERT INTO configuracion (clave, valor) VALUES
         ('whatsapp_comprobantes', ''),
         ('compras_adicionales_habilitadas', 'true'),
         ('paquetes_cupones', $1)
       ON CONFLICT (clave) DO NOTHING`,
      [JSON.stringify(DEFAULT_PAQUETES)]
    );

    // Crear usuario admin si no existe
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'Admin123!';
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [adminUser]);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(adminPass, 12);
      await pool.query('INSERT INTO users (username, password_hash) VALUES ($1, $2)', [adminUser, hash]);
      console.log(`✅ Usuario admin creado: ${adminUser} / ${adminPass}`);
      console.log('⚠️  Cambie la contraseña en la sección "Mi Cuenta" tras el primer inicio de sesión.');
    }

    console.log('✅ Base de datos inicializada correctamente.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB, DEFAULT_PAQUETES };
