const crypto = require('crypto');
const { query } = require('../config/dbConfig');

class AuditLog {
  /** Inserta un registro de auditoría y devuelve su id. */
  async create({ email, rol = null, accion, modulo, recursoId = null, detalle = null, ip = null }) {
    const result = await query(
      `INSERT INTO audit_logs (uuid, usuario_email, rol, accion, modulo, recurso_id, detalle, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(), email, rol, accion, modulo,
        recursoId === null || recursoId === undefined ? null : String(recursoId).slice(0, 50),
        detalle ? String(detalle).slice(0, 5000) : null, ip,
      ],
    );
    return result.insertId;
  }

  /** Registra una acción. Si falla, no tumba la petición: solo deja el error en el log del servidor. */
  async record(entry) {
    try {
      await this.create(entry);
    } catch (err) {
      console.error('No se pudo registrar la auditoría:', err.message);
    }
  }

  async getById(id, includeArchived = false) {
    const rows = await query(`SELECT * FROM audit_logs WHERE id = ?${includeArchived ? '' : ' AND estado = 1'}`, [id]);
    return rows[0] || null;
  }

  async getAll({ archived = false, usuarioEmail, modulo, accion, desde, hasta, limit, offset }) {
    const where = [];
    const params = [];
    if (!archived) where.push('estado = 1');
    if (usuarioEmail) { where.push('usuario_email = ?'); params.push(String(usuarioEmail)); }
    if (modulo) { where.push('modulo = ?'); params.push(String(modulo)); }
    if (accion) { where.push('accion = ?'); params.push(accion); }
    if (desde) { where.push('creado >= ?'); params.push(desde); }
    if (hasta) { where.push('creado <= ?'); params.push(hasta); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows, count] = await Promise.all([
      query(`SELECT * FROM audit_logs ${whereSql} ORDER BY creado DESC, id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
      query(`SELECT COUNT(*) AS total FROM audit_logs ${whereSql}`, params),
    ]);
    return { rows, total: count[0].total };
  }

  /** Los registros de auditoría no se editan ni se borran: solo se archivan (estado = 0). */
  async archive(id) {
    await query('UPDATE audit_logs SET estado = 0 WHERE id = ?', [id]);
  }
}

module.exports = new AuditLog();
