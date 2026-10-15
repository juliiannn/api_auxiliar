require('dotenv').config();
const fs = require('fs');

const config = {
  port: Number(process.env.PORT || 4000),
  isProduction: process.env.NODE_ENV === 'production',
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true',
    // Certificado de la autoridad (CA) del proveedor, si lo exige (p. ej. Aiven entrega un ca.pem).
    // Se puede pegar el contenido en DB_SSL_CA (los saltos de línea pueden ir como \n) o indicar la ruta del archivo en DB_SSL_CA_PATH.
    sslCa: process.env.DB_SSL_CA_PATH
      ? fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8')
      : process.env.DB_SSL_CA
        ? process.env.DB_SSL_CA.replace(/\\n/g, '\n')
        : undefined,
  },
  // Por defecto la API es LIBRE (sin token ni roles). Con AUTH_ENABLED=true exige el token de la API principal (ver middleware/auth.js).
  authEnabled: process.env.AUTH_ENABLED === 'true',
  jwtSecret: process.env.JWT_SECRET,
  apiKey: process.env.AUX_API_KEY || null,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  arasaacApiUrl: (process.env.ARASAAC_API_URL || 'https://api.arasaac.org/v1').replace(/\/+$/, ''),
  arasaacStaticUrl: (process.env.ARASAAC_STATIC_URL || 'https://static.arasaac.org').replace(/\/+$/, ''),
  arasaacImageSize: Number(process.env.ARASAAC_IMAGE_SIZE || 500),
};

// JWT_SECRET solo hace falta si la validación del token está activa
const required = ['DB_HOST', 'DB_USER', 'DB_NAME'].concat(config.authEnabled ? ['JWT_SECRET'] : []);
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  throw new Error(`Faltan variables de entorno: ${missing.join(', ')}. Revisa tu archivo .env`);
}
if (config.authEnabled && config.jwtSecret === 'change-me') {
  if (config.isProduction) {
    throw new Error('JWT_SECRET no puede ser "change-me" en producción. Cambia el secreto en ambas APIs.');
  }
  console.warn('[aviso] JWT_SECRET usa el valor por defecto "change-me". Cámbialo antes de desplegar.');
}
if (!config.authEnabled) {
  console.warn(
    '[aviso] API en modo libre (AUTH_ENABLED no es "true"): no se pide token ni se restringe por rol. ' +
    'Usa solo datos de prueba' + (config.isProduction ? ' (estás en producción).' : '.'),
  );
}

module.exports = config;
