require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDB } = require('./src/db');

const authRoutes = require('./src/routes/auth');
const sorteoRoutes = require('./src/routes/sorteos');
const cuponRoutes = require('./src/routes/cupones');
const reporteRoutes = require('./src/routes/reportes');
const configRoutes = require('./src/routes/config');
const inscripcionRoutes = require('./src/routes/inscripciones');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers (CSP desactivado para cargar CDNs)
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(cors());
app.use(express.json());

// Rate limiting para login (10 intentos por 15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de acceso. Espere 15 minutos.' },
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/sorteos', sorteoRoutes);
app.use('/api/cupones', cuponRoutes);
app.use('/api/reportes', reporteRoutes);
app.use('/api/config', configRoutes);
app.use('/api/inscripciones', inscripcionRoutes);

// Ventana pública de inscripción (sin autenticación)
app.get('/inscripcion', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'inscripcion.html'));
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Inicializar BD y arrancar servidor
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Error inicializando BD:', err);
    process.exit(1);
  });
