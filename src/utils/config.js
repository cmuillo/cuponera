const { pool, DEFAULT_PAQUETES } = require('../db');

/** Valida y ordena la lista de paquetes. Lanza Error si es inválida. */
function sanitizePaquetes(paquetes) {
  if (!Array.isArray(paquetes) || paquetes.length === 0) {
    throw new Error('Debe definir al menos un paquete de cupones.');
  }
  const limpio = paquetes.map((p) => {
    const monto = parseInt(p.monto, 10);
    const cupones = parseInt(p.cupones, 10);
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new Error('Cada paquete debe tener un monto mayor a cero.');
    }
    if (!Number.isFinite(cupones) || cupones <= 0 || cupones > 100) {
      throw new Error('Cada paquete debe otorgar entre 1 y 100 cupones.');
    }
    return { monto, cupones };
  });
  limpio.sort((a, b) => a.monto - b.monto);

  const montos = new Set(limpio.map((p) => p.monto));
  if (montos.size !== limpio.length) {
    throw new Error('No puede repetir el monto de un paquete.');
  }
  return limpio;
}

/** Lee la configuración del sistema como objeto plano ya normalizado. */
async function getConfig() {
  const result = await pool.query('SELECT clave, valor FROM configuracion');
  const map = {};
  result.rows.forEach((r) => { map[r.clave] = r.valor; });

  let paquetes;
  try {
    paquetes = sanitizePaquetes(JSON.parse(map.paquetes_cupones || '[]'));
  } catch {
    paquetes = DEFAULT_PAQUETES;
  }

  return {
    whatsapp_comprobantes: map.whatsapp_comprobantes || '',
    paquetes_cupones: paquetes,
  };
}

async function setConfig(clave, valor) {
  await pool.query(
    `INSERT INTO configuracion (clave, valor, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()`,
    [clave, valor]
  );
}

module.exports = { getConfig, setConfig, sanitizePaquetes };
