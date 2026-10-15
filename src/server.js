const config = require('./config');
const { query } = require('./db');
const app = require('./app');

app.listen(config.port, '0.0.0.0', async () => {
  console.log(`API auxiliar escuchando en el puerto ${config.port}`);
  try {
    await query('SELECT 1');
    console.log('Conexión a MySQL OK');
  } catch (e) {
    console.error('No se pudo conectar a MySQL:', e.message);
  }
});
