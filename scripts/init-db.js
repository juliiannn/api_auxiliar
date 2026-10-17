/**
 * Crea las tablas de sql/schema_mysql.sql en la base configurada en el .env (local o en la nube, p. ej. Aiven).
 * Uso:  npm run init-db
 * Es seguro repetirlo: si las tablas ya existen, no hace nada.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config/config');

const TABLES = ['pictograms', 'visual_supports', 'visual_support_steps', 'audit_logs'];

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema_mysql.sql'), 'utf8');

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    multipleStatements: true, // el archivo SQL trae varias sentencias
    ssl: config.db.ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true, ca: config.db.sslCa } : undefined,
  });

  try {
    console.log(`Conectado a ${config.db.host}:${config.db.port}, base "${config.db.database}"`);
    const [existing] = await conn.query(
      'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (?)',
      [TABLES],
    );
    if (existing.length > 0) {
      console.log(`Ya existen tablas (${existing.map((r) => r.t).join(', ')}). No se hizo ningún cambio.`);
      return;
    }
    await conn.query(sql);
    console.log(`Listo: se crearon ${TABLES.length} tablas (${TABLES.join(', ')}).`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('No se pudieron crear las tablas:', err.message);
  if (/self.signed|certificate/i.test(err.message)) {
    console.error('Pista: falta el certificado del proveedor. Configura DB_SSL=true y DB_SSL_CA_PATH (o DB_SSL_CA) en el .env.');
  } else if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(err.message)) {
    console.error('Pista: revisa DB_HOST y DB_PORT, y que tu IP esté permitida en el panel del proveedor.');
  } else if (/Access denied/i.test(err.message)) {
    console.error('Pista: revisa DB_USER y DB_PASSWORD.');
  }
  process.exit(1);
});
