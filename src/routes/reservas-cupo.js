const express = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/reservas-cupo
router.get('/', async (req, res) => {
  const { sorteoId, celular, cedula, estadoPago } = req.query;
  let query = `
    SELECT r.*, s.nombre AS sorteo_nombre, s.fecha_sorteo,
           s.descripcion AS sorteo_descripcion, s.capacidad_total, s.precio_espacio
    FROM reservas_cupo r
    JOIN sorteos s ON s.id = r.sorteo_id
    WHERE 1 = 1
  `;
  const params = [];
  let index = 1;

  if (sorteoId) { query += ` AND r.sorteo_id = $${index++}`; params.push(sorteoId); }
  if (celular) { query += ` AND r.celular ILIKE $${index++}`; params.push(`%${celular}%`); }
  if (cedula) { query += ` AND r.cedula ILIKE $${index++}`; params.push(`%${cedula}%`); }
  if (estadoPago) { query += ` AND r.estado_pago = $${index++}`; params.push(estadoPago); }
  query += ' ORDER BY r.created_at DESC';

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las reservas.' });
  }
});

// PATCH /api/reservas-cupo/:id/pago
router.patch('/:id/pago', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE reservas_cupo
       SET estado_pago = 'confirmado'
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al confirmar el pago de la reserva.' });
  }
});

// DELETE /api/reservas-cupo/:id
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const reservation = await client.query(
      'SELECT id, sorteo_id FROM reservas_cupo WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (reservation.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    await client.query('SELECT id FROM sorteos WHERE id = $1 FOR UPDATE', [reservation.rows[0].sorteo_id]);
    await client.query('DELETE FROM reservas_cupo WHERE id = $1', [reservation.rows[0].id]);
    await client.query('COMMIT');
    transactionStarted = false;
    res.json({ message: 'Reserva eliminada.' });
  } catch (err) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la reserva.' });
  } finally {
    client.release();
  }
});

module.exports = router;
