const express = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');
const { parseTipoInscripcion } = require('../utils/reservas-cupo');

const router = express.Router();

// Todos los endpoints requieren auth
router.use(authMiddleware);

// GET /api/sorteos
router.get('/', async (req, res) => {
  const { activo } = req.query;
  let query = `
    SELECT s.*,
      (SELECT COUNT(*)::int FROM sorteo_padron p WHERE p.sorteo_id = s.id) AS padron_total,
      (SELECT COUNT(*)::int FROM inscripciones i WHERE i.sorteo_id = s.id) AS inscritos_total,
      (SELECT COUNT(*)::int FROM reservas_cupo r WHERE r.sorteo_id = s.id) AS reservas_total,
      COALESCE(
        (SELECT SUM(r.espacios_reservados)::int FROM reservas_cupo r WHERE r.sorteo_id = s.id),
        0
      ) AS espacios_ocupados,
      CASE WHEN s.tipo_inscripcion = 'cupo_limitado'
        THEN s.capacidad_total - COALESCE(
          (SELECT SUM(r.espacios_reservados)::int FROM reservas_cupo r WHERE r.sorteo_id = s.id),
          0
        )
        ELSE NULL
      END AS espacios_disponibles
    FROM sorteos s
  `;
  const params = [];
  if (activo !== undefined) {
    query += ' WHERE s.activo = $1';
    params.push(activo === 'true');
  }
  query += ' ORDER BY s.created_at DESC';
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
  const { nombre, descripcion, fecha_sorteo, activo, monto_minimo, modo_inscripcion, restringir_padron } = req.body;
  if (!nombre || !fecha_sorteo) {
    return res.status(400).json({ error: 'Nombre y fecha del sorteo son requeridos.' });
  }
  if (nombre.length > 255) {
    return res.status(400).json({ error: 'El nombre no puede superar 255 caracteres.' });
  }
  const montoMin = parseInt(monto_minimo) || 0;
  if (montoMin < 0) return res.status(400).json({ error: 'El monto mínimo no puede ser negativo.' });
  const modoInscripcion = modo_inscripcion === true;
  const restringirPadron = modoInscripcion && restringir_padron === true;
  const tipoInscripcion = parseTipoInscripcion({
    ...req.body,
    tipo_inscripcion: req.body.tipo_inscripcion || 'normal',
  });
  if (tipoInscripcion.error) {
    return res.status(400).json({ error: tipoInscripcion.error });
  }
  try {
    const result = await pool.query(
      `INSERT INTO sorteos (
         nombre, descripcion, fecha_sorteo, activo, monto_minimo, modo_inscripcion, restringir_padron,
         tipo_inscripcion, capacidad_total, precio_espacio
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        nombre.trim(), descripcion || null, fecha_sorteo, activo !== false, montoMin, modoInscripcion,
        restringirPadron, tipoInscripcion.tipo_inscripcion, tipoInscripcion.capacidad_total,
        tipoInscripcion.precio_espacio,
      ]
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
  const { nombre, descripcion, fecha_sorteo, activo, monto_minimo, modo_inscripcion, restringir_padron } = req.body;
  if (!nombre || !fecha_sorteo) {
    return res.status(400).json({ error: 'Nombre y fecha del sorteo son requeridos.' });
  }
  const montoMin = parseInt(monto_minimo) || 0;
  if (montoMin < 0) return res.status(400).json({ error: 'El monto mínimo no puede ser negativo.' });
  const modoInscripcion = modo_inscripcion === true;
  const restringirPadron = modoInscripcion && restringir_padron === true;
  const tipoInscripcion = parseTipoInscripcion({
    ...req.body,
    tipo_inscripcion: req.body.tipo_inscripcion || 'normal',
  });
  if (tipoInscripcion.error) {
    return res.status(400).json({ error: tipoInscripcion.error });
  }
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const existing = await client.query(
      'SELECT tipo_inscripcion FROM sorteos WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ error: 'Sorteo no encontrado.' });
    }
    if (
      existing.rows[0].tipo_inscripcion === 'cupo_limitado' &&
      tipoInscripcion.tipo_inscripcion === 'cupo_limitado'
    ) {
      const reservations = await client.query(
        `SELECT COALESCE(SUM(espacios_reservados), 0)::int AS espacios_reservados
         FROM reservas_cupo WHERE sorteo_id = $1`,
        [id]
      );
      const espaciosReservados = reservations.rows[0].espacios_reservados;
      if (tipoInscripcion.capacidad_total < espaciosReservados) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(400).json({
          error: `La capacidad no puede ser menor que los ${espaciosReservados} espacios reservados.`,
        });
      }
    }
    const result = await client.query(
      `UPDATE sorteos SET nombre=$1, descripcion=$2, fecha_sorteo=$3, activo=$4, monto_minimo=$5,
         modo_inscripcion=$6, restringir_padron=$7, tipo_inscripcion=$8, capacidad_total=$9,
         precio_espacio=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [
        nombre.trim(), descripcion || null, fecha_sorteo, activo !== false, montoMin, modoInscripcion,
        restringirPadron, tipoInscripcion.tipo_inscripcion, tipoInscripcion.capacidad_total,
        tipoInscripcion.precio_espacio, id,
      ]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ error: 'Sorteo no encontrado.' });
    }
    await client.query('COMMIT');
    transactionStarted = false;
    res.json(result.rows[0]);
  } catch (err) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el sorteo.' });
  } finally {
    client.release();
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sorteo = await client.query(
      'SELECT id FROM sorteos WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (sorteo.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sorteo no encontrado.' });
    }
    const check = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM cupones WHERE sorteo_id = $1) AS cupones_total,
         (SELECT COUNT(*)::int FROM reservas_cupo WHERE sorteo_id = $1) AS reservas_total`,
      [id]
    );
    if (check.rows[0].reservas_total > 0) {
      await client.query('ROLLBACK');
      return res
        .status(400)
        .json({ error: 'No se puede eliminar: la actividad tiene reservas registradas.' });
    }
    if (check.rows[0].cupones_total > 0) {
      await client.query('ROLLBACK');
      return res
        .status(400)
        .json({ error: 'No se puede eliminar: el sorteo tiene cupones registrados.' });
    }
    await client.query('DELETE FROM sorteos WHERE id=$1', [id]);
    await client.query('COMMIT');
    res.json({ message: 'Sorteo eliminado.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el sorteo.' });
  } finally {
    client.release();
  }
});

// GET /api/sorteos/:id/padron
router.get('/:id/padron', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, cedula, nombre FROM sorteo_padron WHERE sorteo_id = $1 ORDER BY nombre NULLS LAST, cedula',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el listado autorizado.' });
  }
});

// POST /api/sorteos/:id/padron — carga masiva desde Excel (ya convertido a JSON en el cliente)
router.post('/:id/padron', async (req, res) => {
  const { id } = req.params;
  const { registros, reemplazar } = req.body;

  if (!Array.isArray(registros) || registros.length === 0) {
    return res.status(400).json({ error: 'No se recibió ningún registro válido.' });
  }
  if (registros.length > 20000) {
    return res.status(400).json({ error: 'El listado no puede superar 20.000 registros.' });
  }

  // Normalizar y descartar duplicados dentro del propio archivo
  const vistos = new Set();
  const limpios = [];
  let descartados = 0;
  for (const r of registros) {
    const cedula = String(r?.cedula || '').replace(/[\s-]/g, '').trim();
    if (!cedula || cedula.length > 25 || vistos.has(cedula)) {
      descartados++;
      continue;
    }
    vistos.add(cedula);
    limpios.push({ cedula, nombre: String(r?.nombre || '').trim().substring(0, 255) || null });
  }
  if (limpios.length === 0) {
    return res.status(400).json({ error: 'Ninguna fila del archivo contiene una cédula válida.' });
  }

  const client = await pool.connect();
  try {
    const sorteo = await client.query('SELECT id FROM sorteos WHERE id = $1', [id]);
    if (sorteo.rows.length === 0) {
      return res.status(404).json({ error: 'Sorteo no encontrado.' });
    }

    await client.query('BEGIN');
    if (reemplazar === true) {
      await client.query('DELETE FROM sorteo_padron WHERE sorteo_id = $1', [id]);
    }
    for (const r of limpios) {
      await client.query(
        `INSERT INTO sorteo_padron (sorteo_id, cedula, nombre) VALUES ($1, $2, $3)
         ON CONFLICT (sorteo_id, cedula) DO UPDATE SET nombre = COALESCE(EXCLUDED.nombre, sorteo_padron.nombre)`,
        [id, r.cedula, r.nombre]
      );
    }
    await client.query('COMMIT');

    const total = await pool.query(
      'SELECT COUNT(*)::int AS total FROM sorteo_padron WHERE sorteo_id = $1',
      [id]
    );
    res.json({ procesados: limpios.length, descartados, total: total.rows[0].total });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Error al cargar el listado autorizado.' });
  } finally {
    client.release();
  }
});

// DELETE /api/sorteos/:id/padron — vacía el listado autorizado
router.delete('/:id/padron', async (req, res) => {
  try {
    await pool.query('DELETE FROM sorteo_padron WHERE sorteo_id = $1', [req.params.id]);
    res.json({ message: 'Listado autorizado eliminado.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el listado autorizado.' });
  }
});

module.exports = router;
