const mysql = require('mysql2');
const config = require('./config');

const basePool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  charset: 'utf8mb4',
  timezone: 'Z', // las fechas se guardan y leen en UTC
  waitForConnections: true,
  connectionLimit: 10,
  ssl: config.db.ssl ? { minVersion: 'TLSv1.2', rejectUnauthorized: true, ca: config.db.sslCa } : undefined,
});

// La sesión de MySQL también trabaja en UTC, así NOW() y CURRENT_TIMESTAMP son consistentes con el API.
basePool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

const pool = basePool.promise();

/** Ejecuta una consulta con parámetros (mysql2 los escapa) y devuelve las filas (o el ResultSetHeader en INSERT/UPDATE). */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Ejecuta varias consultas como una sola transacción: si algo falla, no se guarda nada.
 * `work` recibe una función q(sql, params) que usa la misma conexión.
 */
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const q = async (sql, params = []) => {
      const [rows] = await conn.query(sql, params);
      return rows;
    };
    const result = await work(q);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, withTransaction };
