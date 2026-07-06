const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

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

    await client.query('COMMIT');

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

module.exports = { pool, initDB };
