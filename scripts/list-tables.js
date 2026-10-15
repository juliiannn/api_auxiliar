/**
 * Muestra las tablas que hay en la base configurada en el .env, con su número de filas.
 * Uso:  node scripts/list-tables.js              (lista las tablas)
 *       node scripts/list-tables.js --columnas   (además, lista las columnas de cada una)
 */
const mysql = require('mysql2/promise');
const config = require('../src/config');

async function main() {
  const showColumns = process.argv.includes('--columnas');
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    ssl: config.db.ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true, ca: config.db.sslCa } : undefined,
  });

  try {
    console.log(`Base "${config.db.database}" en ${config.db.host}:${config.db.port}\n`);
    const [tables] = await conn.query(
      'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name',
    );
    if (tables.length === 0) {
      console.log('No hay tablas. Ejecuta primero: node scripts/init-db.js');
      return;
    }
    for (const { t } of tables) {
      const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
      const [columns] = await conn.query(`SHOW COLUMNS FROM \`${t}\``);
      console.log(`• ${t}  (${columns.length} columnas, ${n} filas)`);
      if (showColumns) {
        for (const c of columns) console.log(`    - ${c.Field}  ${c.Type}${c.Key === 'PRI' ? '  [llave primaria]' : c.Key === 'UNI' ? '  [único]' : ''}`);
      }
    }
    console.log(`\nTotal: ${tables.length} tablas`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('No se pudo leer la base:', err.message);
  process.exit(1);
});
