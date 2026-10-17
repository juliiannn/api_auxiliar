const crypto = require('crypto');
const { query, withTransaction } = require('../config/dbConfig');

const STEPS_SQL = `
  SELECT s.orden, s.texto, s.duracion_minutos, p.arasaac_id, p.palabra, p.imagen_url
  FROM visual_support_steps s LEFT JOIN pictograms p ON p.id = s.pictograma_id
  WHERE s.support_id = ? AND s.estado = 1 ORDER BY s.orden`;
const LIST_COLUMNS = `v.*, (SELECT COUNT(*) FROM visual_support_steps st WHERE st.support_id = v.id AND st.estado = 1) AS total_pasos`;

/**
 * Guarda los pasos por posición: reutiliza las filas existentes (así no choca con el único (support_id, orden))
 * y desactiva las que sobran si ahora hay menos pasos.
 */
async function upsertSteps(q, supportId, steps) {
  const values = steps.map((s) => [supportId, s.orden, s.texto, s.pictogramaId, s.duracionMinutos]);
  await q(
    `INSERT INTO visual_support_steps (support_id, orden, texto, pictograma_id, duracion_minutos) VALUES ?
     ON DUPLICATE KEY UPDATE texto = VALUES(texto), pictograma_id = VALUES(pictograma_id),
       duracion_minutos = VALUES(duracion_minutos), estado = 1`,
    [values],
  );
  await q('UPDATE visual_support_steps SET estado = 0 WHERE support_id = ? AND orden > ?', [supportId, steps.length]);
}

class Support {
  /** Apoyo activo (con el total de pasos) o null si no existe. */
  async getById(id) {
    const rows = await query(`SELECT ${LIST_COLUMNS} FROM visual_supports v WHERE v.id = ? AND v.estado = 1`, [id]);
    return rows[0] || null;
  }

  async getSteps(supportId) {
    return query(STEPS_SQL, [supportId]);
  }

  async getAll({ estudianteEmail, general, tipo, limit, offset }) {
    const where = ['v.estado = 1'];
    const params = [];
    if (estudianteEmail) { where.push('v.estudiante_email = ?'); params.push(estudianteEmail); }
    if (general) where.push('v.estudiante_email IS NULL');
    if (tipo) { where.push('v.tipo = ?'); params.push(tipo); }

    const whereSql = where.join(' AND ');
    const [rows, count] = await Promise.all([
      query(`SELECT ${LIST_COLUMNS} FROM visual_supports v WHERE ${whereSql} ORDER BY v.creado DESC, v.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
      query(`SELECT COUNT(*) AS total FROM visual_supports v WHERE ${whereSql}`, params),
    ]);
    return { rows, total: count[0].total };
  }

  /** Apoyos de un estudiante más los generales del aula. */
  async getForStudent(email) {
    return query(
      `SELECT ${LIST_COLUMNS} FROM visual_supports v WHERE v.estado = 1 AND (v.estudiante_email = ? OR v.estudiante_email IS NULL)
       ORDER BY v.estudiante_email IS NULL, v.creado DESC`,
      [email],
    );
  }

  /** Crea el apoyo y sus pasos en una sola transacción. Devuelve el id nuevo. */
  async create({ tipo, titulo, descripcion, estudianteEmail, creadoPor }, steps) {
    const codigo = `APV-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    return withTransaction(async (q) => {
      const result = await q(
        `INSERT INTO visual_supports (codigo, tipo, titulo, descripcion, estudiante_email, creado_por) VALUES (?, ?, ?, ?, ?, ?)`,
        [codigo, tipo, titulo, descripcion, estudianteEmail, creadoPor],
      );
      await upsertSteps(q, result.insertId, steps);
      return result.insertId;
    });
  }

  /** Actualiza el apoyo; si `steps` es null se conservan los pasos actuales. */
  async update(id, { tipo, titulo, descripcion, estudianteEmail }, steps) {
    await withTransaction(async (q) => {
      await q('UPDATE visual_supports SET tipo = ?, titulo = ?, descripcion = ?, estudiante_email = ? WHERE id = ?',
        [tipo, titulo, descripcion, estudianteEmail, id]);
      if (steps) await upsertSteps(q, id, steps);
    });
  }

  async deactivate(id) {
    await query('UPDATE visual_supports SET estado = 0 WHERE id = ?', [id]);
  }
}

module.exports = new Support();
