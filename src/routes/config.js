const express = require('express');
const authMiddleware = require('../middleware/auth');
const { getConfig, setConfig, sanitizePaquetes } = require('../utils/config');
const { normalizeCelular } = require('../utils/cupones');

const router = express.Router();

// GET /api/config/publica — datos necesarios en la ventana de invitado (sin auth)
router.get('/publica', async (req, res) => {
  try {
    const config = await getConfig();
    res.json({
      whatsapp_comprobantes: config.whatsapp_comprobantes,
      paquetes_cupones: config.paquetes_cupones,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener la configuración.' });
  }
});

// GET /api/config
router.get('/', authMiddleware, async (req, res) => {
  try {
    res.json(await getConfig());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener la configuración.' });
  }
});

// PUT /api/config
router.put('/', authMiddleware, async (req, res) => {
  const { whatsapp_comprobantes, paquetes_cupones } = req.body;

  let whatsapp = '';
  if (whatsapp_comprobantes) {
    whatsapp = normalizeCelular(whatsapp_comprobantes);
    if (!whatsapp) {
      return res.status(400).json({ error: 'Formato de número de WhatsApp inválido.' });
    }
  }

  let paquetes;
  try {
    paquetes = sanitizePaquetes(paquetes_cupones);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    await setConfig('whatsapp_comprobantes', whatsapp);
    await setConfig('paquetes_cupones', JSON.stringify(paquetes));
    res.json(await getConfig());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar la configuración.' });
  }
});

module.exports = router;
