const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { getConfig } = require('../utils/config');
const { generateUniqueCouponCode, normalizeCelular } = require('../utils/cupones');
const { parseAcompanante, normalizePadronSearch } = require('../utils/inscripciones');
const { calcularReserva } = require('../utils/reservas-cupo');

const router = express.Router();

// Endpoints públicos: límite para evitar abuso desde la ventana de invitado
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intente de nuevo en unos minutos.' },
});
router.use(publicLimiter);

function cleanCedula(cedula) {
  return String(cedula || '').replace(/[\s-]/g, '').trim();
}

/** Carga el sorteo verificando que esté habilitado para inscripción pública. */
async function loadSorteoInscripcion(sorteoId, queryable = pool, forUpdate = false) {
  const result = await queryable.query(
    `SELECT * FROM sorteos WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [sorteoId]
  );
  if (result.rows.length === 0) {
    return { error: 'La actividad no existe.', status: 404 };
  }
  const sorteo = result.rows[0];
  if (!sorteo.activo) {
    return { error: 'Esta actividad no está activa.', status: 400 };
  }
  if (!sorteo.modo_inscripcion) {
    return { error: 'Esta actividad no acepta inscripciones en línea.', status: 400 };
  }
  return { sorteo };
}

// GET /api/inscripciones/sorteo/:id — información pública de la actividad
router.get('/sorteo/:id', async (req, res) => {
  const sorteoId = parseInt(req.params.id, 10);
  if (!Number.isInteger(sorteoId)) {
    return res.status(400).json({ error: 'Actividad inválida.' });
  }
  try {
    const { sorteo, error, status } = await loadSorteoInscripcion(sorteoId);
    if (error) return res.status(status).json({ error });
    res.json({
      id: sorteo.id,
      nombre: sorteo.nombre,
      descripcion: sorteo.descripcion,
      fecha_sorteo: sorteo.fecha_sorteo,
      restringir_padron: sorteo.restringir_padron,
      tipo_inscripcion: sorteo.tipo_inscripcion,
      capacidad_total: sorteo.capacidad_total,
      precio_espacio: sorteo.precio_espacio,
      espacios_ocupados: sorteo.tipo_inscripcion === 'cupo_limitado'
        ? (await pool.query(
          'SELECT COALESCE(SUM(espacios_reservados), 0)::int AS total FROM reservas_cupo WHERE sorteo_id = $1',
          [sorteo.id]
        )).rows[0].total
        : null,
      espacios_disponibles: sorteo.tipo_inscripcion === 'cupo_limitado'
        ? sorteo.capacidad_total - (await pool.query(
          'SELECT COALESCE(SUM(espacios_reservados), 0)::int AS total FROM reservas_cupo WHERE sorteo_id = $1',
          [sorteo.id]
        )).rows[0].total
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar la actividad.' });
  }
});

// GET /api/inscripciones/padron?sorteo_id=&buscar= — personas autorizadas aún no inscritas
router.get('/padron', async (req, res) => {
  const sorteoId = parseInt(req.query.sorteo_id, 10);
  const buscar = normalizePadronSearch(req.query.buscar);
  if (!Number.isInteger(sorteoId) || !buscar) {
    return res.status(400).json({ error: 'Actividad y al menos dos letras del nombre son requeridas.' });
  }

  try {
    const { sorteo, error, status } = await loadSorteoInscripcion(sorteoId);
    if (error) return res.status(status).json({ error });
    if (!sorteo.restringir_padron) {
      return res.status(400).json({ error: 'Esta actividad no utiliza un listado previo.' });
    }

    const result = await pool.query(
      `SELECT p.cedula, p.nombre
       FROM sorteo_padron p
       WHERE p.sorteo_id = $1
         AND p.nombre ILIKE $2
         AND NOT EXISTS (
           SELECT 1 FROM inscripciones i
           WHERE i.sorteo_id = p.sorteo_id AND i.cedula = p.cedula
         )
         AND NOT EXISTS (
           SELECT 1 FROM reservas_cupo r
           WHERE r.sorteo_id = p.sorteo_id AND r.cedula = p.cedula
         )
       ORDER BY p.nombre, p.cedula
       LIMIT 10`,
      [sorteo.id, `%${buscar}%`]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al buscar en el listado autorizado.' });
  }
});

// GET /api/inscripciones/estado?sorteo_id=&cedula= — consulta si la cédula ya está inscrita
router.get('/estado', async (req, res) => {
  const sorteoId = parseInt(req.query.sorteo_id, 10);
  const cedula = cleanCedula(req.query.cedula);
  if (!Number.isInteger(sorteoId) || !cedula) {
    return res.status(400).json({ error: 'Actividad y cédula son requeridas.' });
  }
  try {
    const { sorteo, error, status } = await loadSorteoInscripcion(sorteoId);
    if (error) return res.status(status).json({ error });

    const insc = await pool.query(
      'SELECT * FROM inscripciones WHERE sorteo_id = $1 AND cedula = $2',
      [sorteo.id, cedula]
    );
    if (insc.rows.length === 0) {
      return res.json({ inscrito: false });
    }

    const cupones = await pool.query(
      `SELECT codigo, estado_pago, origen FROM cupones
       WHERE sorteo_id = $1 AND cedula = $2 ORDER BY created_at`,
      [sorteo.id, cedula]
    );
    const inscripcion = insc.rows[0];
    res.json({
      inscrito: true,
      nombre: inscripcion.nombre,
      celular: inscripcion.celular,
      acompanante: inscripcion.acompanante,
      acompanante_nombre: inscripcion.acompanante_nombre,
      cupones: cupones.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar la inscripción.' });
  }
});

// POST /api/inscripciones — inscripción de invitado (genera 1 cupón)
router.post('/', async (req, res) => {
  const sorteoId = parseInt(req.body.sorteo_id, 10);
  const cedula = cleanCedula(req.body.cedula);
  const nombre = String(req.body.nombre || '').trim();
  const celular = normalizeCelular(req.body.celular);
  const acomp = parseAcompanante(req.body);

  if (!Number.isInteger(sorteoId) || !cedula || !nombre || !req.body.celular) {
    return res.status(400).json({ error: 'Nombre, cédula y teléfono son requeridos.' });
  }
  if (nombre.length > 255 || cedula.length > 25) {
    return res.status(400).json({ error: 'Nombre o cédula demasiado largos.' });
  }
  if (!celular) {
    return res.status(400).json({ error: 'Formato de teléfono inválido.' });
  }
  if (acomp.error) {
    return res.status(400).json({ error: acomp.error });
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const { sorteo, error, status } = await loadSorteoInscripcion(sorteoId, client, true);
    if (error) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(status).json({ error });
    }

    if (sorteo.restringir_padron) {
      const autorizado = await client.query(
        'SELECT id FROM sorteo_padron WHERE sorteo_id = $1 AND cedula = $2',
        [sorteo.id, cedula]
      );
      if (autorizado.rows.length === 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(403).json({
          error: 'La cédula ingresada no se encuentra en el listado autorizado para esta actividad.',
        });
      }
    }

    if (sorteo.tipo_inscripcion === 'cupo_limitado') {
      const yaReservado = await client.query(
        'SELECT id FROM reservas_cupo WHERE sorteo_id = $1 AND cedula = $2',
        [sorteo.id, cedula]
      );
      if (yaReservado.rows.length > 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ error: 'Esta cédula ya tiene una reserva para la actividad.' });
      }

      const reservaCalculada = calcularReserva(acomp.acompanante, sorteo.precio_espacio);
      const ocupacion = await client.query(
        `SELECT COALESCE(SUM(espacios_reservados), 0)::int AS espacios_ocupados
         FROM reservas_cupo WHERE sorteo_id = $1`,
        [sorteo.id]
      );
      const espaciosDisponibles = sorteo.capacidad_total - ocupacion.rows[0].espacios_ocupados;
      if (reservaCalculada.espacios_reservados > espaciosDisponibles) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ error: 'No hay espacios suficientes para esta reserva.' });
      }

      const reservation = await client.query(
        `INSERT INTO reservas_cupo (
           sorteo_id, cedula, nombre, celular, acompanante, acompanante_nombre,
           espacios_reservados, monto_total
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          sorteo.id, cedula, nombre, celular, acomp.acompanante, acomp.acompanante_nombre,
          reservaCalculada.espacios_reservados, reservaCalculada.monto_total,
        ]
      );
      await client.query('COMMIT');
      transactionStarted = false;
      const config = await getConfig();
      return res.status(201).json({
        reserva: reservation.rows[0],
        sorteo: {
          id: sorteo.id,
          nombre: sorteo.nombre,
          descripcion: sorteo.descripcion,
          fecha_sorteo: sorteo.fecha_sorteo,
          tipo_inscripcion: sorteo.tipo_inscripcion,
          capacidad_total: sorteo.capacidad_total,
          precio_espacio: sorteo.precio_espacio,
          espacios_ocupados: ocupacion.rows[0].espacios_ocupados + reservaCalculada.espacios_reservados,
          espacios_disponibles: espaciosDisponibles - reservaCalculada.espacios_reservados,
        },
        whatsapp_comprobantes: config.whatsapp_comprobantes,
      });
    }

    const yaInscrito = await client.query(
      'SELECT id FROM inscripciones WHERE sorteo_id = $1 AND cedula = $2',
      [sorteo.id, cedula]
    );
    if (yaInscrito.rows.length > 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({
        error: 'Esta cédula ya está inscrita. Use la pestaña "Comprar cupones" para obtener cupones adicionales.',
      });
    }

    const codigo = await generateUniqueCouponCode(sorteo.id);

    await client.query(
      `INSERT INTO inscripciones (sorteo_id, cedula, nombre, celular, acompanante, acompanante_nombre)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sorteo.id, cedula, nombre, celular, acomp.acompanante, acomp.acompanante_nombre]
    );
    const cupon = await client.query(
      `INSERT INTO cupones (codigo, sorteo_id, celular, cedula, nombre_persona, monto_venta, origen, estado_pago)
       VALUES ($1, $2, $3, $4, $5, 0, 'inscripcion', 'confirmado') RETURNING *`,
      [codigo, sorteo.id, celular, cedula, nombre]
    );
    await client.query('COMMIT');
    transactionStarted = false;

    res.status(201).json({
      inscripcion: {
        nombre,
        cedula,
        celular,
        acompanante: acomp.acompanante,
        acompanante_nombre: acomp.acompanante_nombre,
      },
      sorteo: {
        id: sorteo.id,
        nombre: sorteo.nombre,
        descripcion: sorteo.descripcion,
        fecha_sorteo: sorteo.fecha_sorteo,
      },
      cupones: [cupon.rows[0]],
    });
  } catch (err) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esta cédula ya está inscrita en la actividad.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al registrar la inscripción.' });
  } finally {
    client.release();
  }
});

// POST /api/inscripciones/compra — cupones adicionales para una cédula ya inscrita
router.post('/compra', async (req, res) => {
  const sorteoId = parseInt(req.body.sorteo_id, 10);
  const cedula = cleanCedula(req.body.cedula);
  const monto = parseInt(req.body.monto, 10);

  if (!Number.isInteger(sorteoId) || !cedula || !Number.isInteger(monto)) {
    return res.status(400).json({ error: 'Actividad, cédula y paquete son requeridos.' });
  }

  try {
    const { sorteo, error, status } = await loadSorteoInscripcion(sorteoId);
    if (error) return res.status(status).json({ error });

    const insc = await pool.query(
      'SELECT * FROM inscripciones WHERE sorteo_id = $1 AND cedula = $2',
      [sorteo.id, cedula]
    );
    if (insc.rows.length === 0) {
      return res.status(404).json({
        error: 'Esta cédula no está inscrita en la actividad. Primero debe inscribirse.',
      });
    }
    const inscripcion = insc.rows[0];

    const config = await getConfig();
    if (!config.compras_adicionales_habilitadas) {
      return res.status(403).json({ error: 'Las compras adicionales están deshabilitadas.' });
    }
    const { paquetes_cupones: paquetes, whatsapp_comprobantes } = config;
    const paquete = paquetes.find((p) => p.monto === monto);
    if (!paquete) {
      return res.status(400).json({ error: 'El paquete seleccionado no está disponible.' });
    }

    const creados = [];
    for (let i = 0; i < paquete.cupones; i++) {
      const codigo = await generateUniqueCouponCode(sorteo.id);
      const result = await pool.query(
        `INSERT INTO cupones (codigo, sorteo_id, celular, cedula, nombre_persona, monto_venta, origen, estado_pago)
         VALUES ($1, $2, $3, $4, $5, $6, 'compra', 'pendiente') RETURNING *`,
        [codigo, sorteo.id, inscripcion.celular, cedula, inscripcion.nombre, i === 0 ? paquete.monto : 0]
      );
      creados.push(result.rows[0]);
    }

    res.status(201).json({
      inscripcion: {
        nombre: inscripcion.nombre,
        cedula: inscripcion.cedula,
        celular: inscripcion.celular,
      },
      sorteo: {
        id: sorteo.id,
        nombre: sorteo.nombre,
        descripcion: sorteo.descripcion,
        fecha_sorteo: sorteo.fecha_sorteo,
      },
      paquete,
      whatsapp_comprobantes,
      cupones: creados,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar los cupones.' });
  }
});

module.exports = router;
