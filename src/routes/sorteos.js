const express = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Todos los endpoints requieren auth
router.use(authMiddleware);

// GET /api/sorteos
router.get('/', async (req, res) => {
  const { activo } = req.query;
  let query = 'SELECT * FROM sorteos';
  const params = [];
  if (activo !== undefined) {
    query += ' WHERE activo = $1';
    params.push(activo === 'true');
  }
  query += ' ORDER BY created_at DESC';
  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener sorteos.' });
  }
});

// POST /api/sorteos
router.post('/', async (req, res) => {
  const { nombre, descripcion, fecha_sorteo, activo, monto_minimo } = req.body;
  if (!nombre || !fecha_sorteo) {
    return res.status(400).json({ error: 'Nombre y fecha del sorteo son requeridos.' });
  }
  if (nombre.length > 255) {
    return res.status(400).json({ error: 'El nombre no puede superar 255 caracteres.' });
  }
  const montoMin = parseInt(monto_minimo) || 0;
  if (montoMin < 0) return res.status(400).json({ error: 'El monto mínimo no puede ser negativo.' });
  try {
    const result = await pool.query(
      `INSERT INTO sorteos (nombre, descripcion, fecha_sorteo, activo, monto_minimo)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nombre.trim(), descripcion || null, fecha_sorteo, activo !== false, montoMin]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear el sorteo.' });
  }
});

// PUT /api/sorteos/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, fecha_sorteo, activo, monto_minimo } = req.body;
  if (!nombre || !fecha_sorteo) {
    return res.status(400).json({ error: 'Nombre y fecha del sorteo son requeridos.' });
  }
  const montoMin = parseInt(monto_minimo) || 0;
  if (montoMin < 0) return res.status(400).json({ error: 'El monto mínimo no puede ser negativo.' });
  try {
    const result = await pool.query(
      `UPDATE sorteos SET nombre=$1, descripcion=$2, fecha_sorteo=$3, activo=$4, monto_minimo=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [nombre.trim(), descripcion || null, fecha_sorteo, activo !== false, montoMin, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sorteo no encontrado.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el sorteo.' });
  }
});

// PATCH /api/sorteos/:id/toggle
router.patch('/:id/toggle', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'UPDATE sorteos SET activo = NOT activo, updated_at=NOW() WHERE id=$1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sorteo no encontrado.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el sorteo.' });
  }
});

// DELETE /api/sorteos/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query('SELECT COUNT(*) FROM cupones WHERE sorteo_id = $1', [id]);
    if (parseInt(check.rows[0].count) > 0) {
      return res
        .status(400)
        .json({ error: 'No se puede eliminar: el sorteo tiene cupones registrados.' });
    }
    const result = await pool.query('DELETE FROM sorteos WHERE id=$1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sorteo no encontrado.' });
    }
    res.json({ message: 'Sorteo eliminado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el sorteo.' });
  }
});

module.exports = router;
