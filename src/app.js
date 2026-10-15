const express = require('express');
const cors = require('cors');
const config = require('./config');
const { query } = require('./db');
const { asyncHandler } = require('./errors');
const { notFound, errorHandler } = require('./middleware/errorHandler');

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

app.use('/pictograms', require('./routes/pictograms'));
app.use('/supports', require('./routes/supports'));
app.use('/audit-logs', require('./routes/auditLogs'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
