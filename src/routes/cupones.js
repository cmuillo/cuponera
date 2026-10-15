const express = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');
const { generateUniqueCouponCode } = require('../utils/cupones');

const router = express.Router();
router.use(authMiddleware);

// GET /api/cupones
router.get('/', async (req, res) => {
  const { sorteoId, celular, cedula, estadoPago } = req.query;
  let query = `
    SELECT c.*, s.nombre AS sorteo_nombre, s.fecha_sorteo, s.descripcion AS sorteo_descripcion,
           i.acompanante, i.acompanante_nombre
    FROM cupones c
    JOIN sorteos s ON c.sorteo_id = s.id
    LEFT JOIN inscripciones i ON i.sorteo_id = c.sorteo_id AND i.cedula = c.cedula
    WHERE 1=1
  `;
  const params = [];
  let idx = 1;
  if (sorteoId) { query += ` AND c.sorteo_id = $${idx++}`; params.push(sorteoId); }
  if (celular)  { query += ` AND c.celular ILIKE $${idx++}`; params.push(`%${celular}%`); }
  if (cedula)   { query += ` AND c.cedula ILIKE $${idx++}`; params.push(`%${cedula}%`); }
  if (estadoPago) { query += ` AND c.estado_pago = $${idx++}`; params.push(estadoPago); }
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
  const { sorteo_id, celular, cedula, nombre_persona, monto_venta } = req.body;
  if (!sorteo_id || !celular || !cedula) {
    return res.status(400).json({ error: 'Sorteo, celular y cédula son requeridos.' });
  }
  const cleanCelular = celular.replace(/\s/g, '');
  if (!/^[\d+\-]{8,15}$/.test(cleanCelular)) {
    return res.status(400).json({ error: 'Formato de celular inválido.' });
  }

  try {
    // Verificar que el sorteo existe
    const sorteoResult = await pool.query('SELECT * FROM sorteos WHERE id = $1', [sorteo_id]);
    if (sorteoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sorteo no encontrado.' });
    }
    const sorteo = sorteoResult.rows[0];

    // Calcular cantidad de cupones según monto
    const montoVenta = parseInt(monto_venta) || 0;
    const montoMinimo = parseInt(sorteo.monto_minimo) || 0;
    let cantidad = 1;
    if (montoMinimo > 0 && montoVenta > 0) {
      cantidad = Math.floor(montoVenta / montoMinimo);
      if (cantidad < 1) {
        return res.status(400).json({
          error: `El monto de venta (₡${montoVenta.toLocaleString()}) es menor al monto mínimo por cupón (₡${montoMinimo.toLocaleString()}).`
        });
      }
    }

    // Crear N cupones
    const creados = [];
    const nombreLimpio = nombre_persona?.trim() || null;
    for (let i = 0; i < cantidad; i++) {
      const codigo = await generateUniqueCouponCode(sorteo_id);
      const result = await pool.query(
        `INSERT INTO cupones (codigo, sorteo_id, celular, cedula, nombre_persona, monto_venta)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [codigo, sorteo_id, cleanCelular, cedula.trim(), nombreLimpio, montoVenta]
      );
      creados.push({
        ...result.rows[0],
        sorteo_nombre: sorteo.nombre,
        fecha_sorteo: sorteo.fecha_sorteo,
        sorteo_descripcion: sorteo.descripcion,
        monto_minimo: montoMinimo,
      });
    }

    res.status(201).json(creados);
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

// PATCH /api/cupones/:id/pago  — confirmar o revertir el pago de un cupón comprado
router.patch('/:id/pago', async (req, res) => {
  const { id } = req.params;
  const estado = req.body.estado_pago === 'pendiente' ? 'pendiente' : 'confirmado';
  try {
    const result = await pool.query(
      'UPDATE cupones SET estado_pago = $1 WHERE id = $2 RETURNING *',
      [estado, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cupón no encontrado.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el estado de pago.' });
  }
});

// POST /api/cupones/confirmar-pago-lote — confirma todos los cupones pendientes de una cédula
router.post('/confirmar-pago-lote', async (req, res) => {
  const { sorteo_id, cedula } = req.body;
  if (!sorteo_id || !cedula) {
    return res.status(400).json({ error: 'sorteo_id y cédula son requeridos.' });
  }
  try {
    const result = await pool.query(
      `UPDATE cupones SET estado_pago = 'confirmado'
       WHERE sorteo_id = $1 AND cedula = $2 AND estado_pago = 'pendiente' RETURNING id`,
      [sorteo_id, cedula]
    );
    res.json({ confirmados: result.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al confirmar los pagos.' });
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
