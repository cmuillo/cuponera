const { pool } = require('../db');

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

/** Normaliza y valida un número de celular. Devuelve null si es inválido. */
function normalizeCelular(celular) {
  if (!celular) return null;
  const clean = String(celular).replace(/\s/g, '');
  if (!/^[\d+\-]{8,15}$/.test(clean)) return null;
  return clean;
}

module.exports = { generateUniqueCouponCode, normalizeCelular };
