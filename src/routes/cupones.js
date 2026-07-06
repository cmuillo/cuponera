const express = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

/** Genera código único con formato: [SORTEO_ID_3]-[6_ALFANUM] */
async function generateUniqueCouponCode(sorteoId) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;
  let attempts = 0;
  const prefix = String(sorteoId).padStart(3, '0');

  while (exists && attempts < 20) {
    let random = '';
    for (let i = 0; i < 6; i++) {
      random += chars[Math.floor(Math.random() * chars.length)];
    }
    code = `${prefix}-${random}`;
    const result = await pool.query('SELECT id FROM cupones WHERE codigo = $1', [code]);
    exists = result.rows.length > 0;
    attempts++;
  }
  if (exists) throw new Error('No se pudo generar código único.');
  return code;
}

// GET /api/cupones
router.get('/', async (req, res) => {
  const { sorteoId, celular, cedula } = req.query;
  let query = `
    SELECT c.*, s.nombre AS sorteo_nombre, s.fecha_sorteo, s.descripcion AS sorteo_descripcion
    FROM cupones c
    JOIN sorteos s ON c.sorteo_id = s.id
    WHERE 1=1
  `;
  const params = [];
  let idx = 1;
  if (sorteoId) { query += ` AND c.sorteo_id = $${idx++}`; params.push(sorteoId); }
  if (celular)  { query += ` AND c.celular ILIKE $${idx++}`; params.push(`%${celular}%`); }
  if (cedula)   { query += ` AND c.cedula ILIKE $${idx++}`; params.push(`%${cedula}%`); }
  query += ' ORDER BY c.created_at DESC';

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener cupones.' });
  }
});

// POST /api/cupones
router.post('/', async (req, res) => {
  const { sorteo_id, celular, cedula, nombre_persona } = req.body;
  if (!sorteo_id || !celular || !cedula) {
    return res.status(400).json({ error: 'Sorteo, celular y cédula son requeridos.' });
  }
  // Validar celular: solo dígitos, +, espacios, guiones, min 7 chars
  const cleanCelular = celular.replace(/\s/g, '');
  if (!/^[\d+\-]{7,20}$/.test(cleanCelular)) {
    return res.status(400).json({ error: 'Formato de celular inválido.' });
  }

  try {
    // Verificar que el sorteo existe y está activo
    const sorteoResult = await pool.query('SELECT * FROM sorteos WHERE id = $1', [sorteo_id]);
    if (sorteoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sorteo no encontrado.' });
    }

    const codigo = await generateUniqueCouponCode(sorteo_id);
    const result = await pool.query(
      `INSERT INTO cupones (codigo, sorteo_id, celular, cedula, nombre_persona)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [codigo, sorteo_id, cleanCelular, cedula.trim(), nombre_persona?.trim() || null]
    );

    // Devolver con info del sorteo
    const cupon = result.rows[0];
    const sorteo = sorteoResult.rows[0];
    res.status(201).json({ ...cupon, sorteo_nombre: sorteo.nombre, fecha_sorteo: sorteo.fecha_sorteo, sorteo_descripcion: sorteo.descripcion });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el cupón.' });
  }
});

// PATCH /api/cupones/:id/ganador
router.patch('/:id/ganador', async (req, res) => {
  const { id } = req.params;
  const { ganador } = req.body;
  try {
    const result = await pool.query(
      'UPDATE cupones SET ganador = $1 WHERE id = $2 RETURNING *',
      [ganador === true, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cupón no encontrado.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el cupón.' });
  }
});

// POST /api/cupones/reset-ganadores  (reset para un sorteo)
router.post('/reset-ganadores', async (req, res) => {
  const { sorteo_id } = req.body;
  if (!sorteo_id) return res.status(400).json({ error: 'sorteo_id es requerido.' });
  try {
    await pool.query('UPDATE cupones SET ganador = FALSE WHERE sorteo_id = $1', [sorteo_id]);
    res.json({ message: 'Ganadores reiniciados.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al reiniciar ganadores.' });
  }
});

// DELETE /api/cupones/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM cupones WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cupón no encontrado.' });
    }
    res.json({ message: 'Cupón eliminado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el cupón.' });
  }
});

module.exports = router;
