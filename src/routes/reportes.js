const express = require('express');
const PDFDocument = require('pdfkit');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/reportes/estadisticas?sorteoId=&buscar=
router.get('/estadisticas', async (req, res) => {
  const { sorteoId, buscar } = req.query;
  let query = `
    SELECT
      c.cedula,
      c.celular,
      MAX(c.nombre_persona) AS nombre_persona,
      s.id AS sorteo_id,
      s.nombre AS sorteo_nombre,
      s.fecha_sorteo,
      COUNT(c.id) AS total_cupones,
      ARRAY_AGG(c.codigo ORDER BY c.created_at) AS codigos
    FROM cupones c
    JOIN sorteos s ON c.sorteo_id = s.id
    WHERE 1=1
  `;
  const params = [];
  let idx = 1;
  if (sorteoId) { query += ` AND s.id = $${idx++}`; params.push(sorteoId); }
  if (buscar) {
    query += ` AND (c.cedula ILIKE $${idx} OR c.celular ILIKE $${idx})`;
    params.push(`%${buscar}%`);
    idx++;
  }
  query += ' GROUP BY c.cedula, c.celular, s.id, s.nombre, s.fecha_sorteo ORDER BY total_cupones DESC, c.cedula';

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener estadísticas.' });
  }
});

// GET /api/reportes/pdf/:sorteoId
router.get('/pdf/:sorteoId', async (req, res) => {
  const { sorteoId } = req.params;
  try {
    const sorteoResult = await pool.query('SELECT * FROM sorteos WHERE id = $1', [sorteoId]);
    if (sorteoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sorteo no encontrado.' });
    }
    const sorteo = sorteoResult.rows[0];

    const cuponesResult = await pool.query(
      'SELECT * FROM cupones WHERE sorteo_id = $1 ORDER BY codigo',
      [sorteoId]
    );
    const cupones = cuponesResult.rows;

    if (cupones.length === 0) {
      return res.status(400).json({ error: 'El sorteo no tiene cupones.' });
    }

    // Configurar PDF
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cupones-${sorteo.nombre.replace(/[^a-z0-9]/gi, '_')}.pdf"`
    );
    doc.pipe(res);

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const COLS = 3;
    const ROWS = 5;
    const PER_PAGE = COLS * ROWS;
    const MARGIN = 20;
    const GAP = 8;
    const COUPON_W = (PAGE_W - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
    const COUPON_H = (PAGE_H - MARGIN * 2 - GAP * (ROWS - 1)) / ROWS;

    const fechaStr = new Date(sorteo.fecha_sorteo).toLocaleDateString('es-ES', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
    });

    cupones.forEach((cupon, index) => {
      const pageIndex = Math.floor(index / PER_PAGE);
      const posInPage = index % PER_PAGE;

      if (posInPage === 0 && index > 0) {
        doc.addPage();
      }

      const col = posInPage % COLS;
      const row = Math.floor(posInPage / COLS);
      const x = MARGIN + col * (COUPON_W + GAP);
      const y = MARGIN + row * (COUPON_H + GAP);

      // Fondo del cupón
      doc.save();
      doc.roundedRect(x, y, COUPON_W, COUPON_H, 6).fillAndStroke('#f8f9fa', '#dee2e6');

      // Borde punteado interno (decorativo)
      doc.rect(x + 4, y + 4, COUPON_W - 8, COUPON_H - 8)
        .dash(4, { space: 3 })
        .stroke('#adb5bd');
      doc.undash();

      // Encabezado coloreado
      doc.roundedRect(x, y, COUPON_W, 28, 6).fill('#4f46e5');
      doc.rect(x, y + 16, COUPON_W, 12).fill('#4f46e5'); // Fix esquinas inferiores

      doc.fillColor('#ffffff')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(sorteo.nombre.toUpperCase().substring(0, 35), x + 6, y + 9, {
          width: COUPON_W - 12,
          align: 'center',
          lineBreak: false,
        });

      // Código del cupón (grande, centrado)
      doc.fillColor('#1e1b4b')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text(cupon.codigo, x, y + 35, { width: COUPON_W, align: 'center' });

      // Datos de la persona
      const nombre = cupon.nombre_persona || '—';
      doc.fillColor('#374151').fontSize(7).font('Helvetica-Bold')
        .text('TITULAR:', x + 8, y + 68, { continued: true })
        .font('Helvetica')
        .text(` ${nombre.substring(0, 25)}`);

      doc.font('Helvetica-Bold')
        .text('CÉD:', x + 8, y + 79, { continued: true })
        .font('Helvetica')
        .text(` ${cupon.cedula}   `, { continued: true })
        .font('Helvetica-Bold')
        .text('CEL:', { continued: true })
        .font('Helvetica')
        .text(` ${cupon.celular}`);

      // Fecha sorteo
      doc.fillColor('#6b7280').fontSize(6.5)
        .text(`📅 Sorteo: ${fechaStr}`, x + 8, y + 90, { width: COUPON_W - 16, align: 'center' });

      doc.restore();
    });

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al generar el PDF.' });
    }
  }
});

module.exports = router;
