const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { getConfig } = require('../utils/config');
const { generateUniqueCouponCode, normalizeCelular } = require('../utils/cupones');

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
async function loadSorteoInscripcion(sorteoId) {
  const result = await pool.query('SELECT * FROM sorteos WHERE id = $1', [sorteoId]);
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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar la actividad.' });
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
  const acompanante = req.body.acompanante === true;

  if (!Number.isInteger(sorteoId) || !cedula || !nombre || !req.body.celular) {
    return res.status(400).json({ error: 'Nombre, cédula y teléfono son requeridos.' });
  }
  if (nombre.length > 255 || cedula.length > 25) {
    return res.status(400).json({ error: 'Nombre o cédula demasiado largos.' });
  }
  if (!celular) {
    return res.status(400).json({ error: 'Formato de teléfono inválido.' });
  }

  const client = await pool.connect();
  try {
    const { sorteo, error, status } = await loadSorteoInscripcion(sorteoId);
    if (error) return res.status(status).json({ error });

    if (sorteo.restringir_padron) {
      const autorizado = await pool.query(
        'SELECT id FROM sorteo_padron WHERE sorteo_id = $1 AND cedula = $2',
        [sorteo.id, cedula]
      );
      if (autorizado.rows.length === 0) {
        return res.status(403).json({
          error: 'La cédula ingresada no se encuentra en el listado autorizado para esta actividad.',
        });
      }
    }

    const yaInscrito = await pool.query(
      'SELECT id FROM inscripciones WHERE sorteo_id = $1 AND cedula = $2',
      [sorteo.id, cedula]
    );
    if (yaInscrito.rows.length > 0) {
      return res.status(409).json({
        error: 'Esta cédula ya está inscrita. Use la pestaña "Comprar cupones" para obtener cupones adicionales.',
      });
    }

    const codigo = await generateUniqueCouponCode(sorteo.id);

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO inscripciones (sorteo_id, cedula, nombre, celular, acompanante)
       VALUES ($1, $2, $3, $4, $5)`,
      [sorteo.id, cedula, nombre, celular, acompanante]
    );
    const cupon = await client.query(
      `INSERT INTO cupones (codigo, sorteo_id, celular, cedula, nombre_persona, monto_venta, origen, estado_pago)
       VALUES ($1, $2, $3, $4, $5, 0, 'inscripcion', 'confirmado') RETURNING *`,
      [codigo, sorteo.id, celular, cedula, nombre]
    );
    await client.query('COMMIT');

    res.status(201).json({
      inscripcion: { nombre, cedula, celular, acompanante },
      sorteo: {
        id: sorteo.id,
        nombre: sorteo.nombre,
        descripcion: sorteo.descripcion,
        fecha_sorteo: sorteo.fecha_sorteo,
      },
      cupones: [cupon.rows[0]],
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
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
