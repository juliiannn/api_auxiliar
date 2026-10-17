const express = require('express');
const cors = require('cors');

const config = require('./src/config/config');
const { query } = require('./src/config/dbConfig');
const { asyncHandler } = require('./src/utils/errors');
const { notFound, errorHandler } = require('./src/middlewares/errorHandler');

const pictogramRoutes = require('./src/routes/pictogramRoutes');
const supportRoutes = require('./src/routes/supportRoutes');
const auditLogRoutes = require('./src/routes/auditLogRoutes');

const app = express();
app.set('trust proxy', 1); // detrás del proxy del hosting, req.ip es la IP real del cliente
app.disable('x-powered-by');

app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((o) => o.trim()) }));
app.use(express.json({ limit: '100kb' }));

app.get('/', (req, res) => res.json({ message: 'Colegio API Auxiliar - Express + MySQL' }));

// Para el health check del hosting: confirma que la API y la base de datos responden
app.get('/health', asyncHandler(async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: 'up' });
  } catch (e) {
    res.status(503).json({ status: 'error', database: 'down' });
  }
}));

// Rutas
app.use('/pictograms', pictogramRoutes);
app.use('/supports', supportRoutes);
app.use('/audit-logs', auditLogRoutes);

app.use(notFound);
app.use(errorHandler);

// Iniciar el servidor
app.listen(config.port, '0.0.0.0', async () => {
  console.log(`API auxiliar escuchando en el puerto ${config.port}`);
  try {
    await query('SELECT 1');
    console.log('Conexión a MySQL OK');
  } catch (e) {
    console.error('No se pudo conectar a MySQL:', e.message);
  }
});
