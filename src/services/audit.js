const crypto = require('crypto');
const { query } = require('../db');

/** Registra una acción en audit_logs. Si falla, no tumba la petición: solo deja el error en el log del servidor. */
async function record({ email, rol = null, accion, modulo, recursoId = null, detalle = null, ip = null }) {
  try {
    await query(
      `INSERT INTO audit_logs (uuid, usuario_email, rol, accion, modulo, recurso_id, detalle, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(), email, rol, accion, modulo,
        recursoId === null || recursoId === undefined ? null : String(recursoId).slice(0, 50),
        detalle ? String(detalle).slice(0, 5000) : null, ip,
      ],
    );
  } catch (err) {
    console.error('No se pudo registrar la auditoría:', err.message);
  }
}

const fromRequest = (req, accion, modulo, recursoId = null, detalle = null) =>
  record({ email: req.user.email, rol: req.user.role, accion, modulo, recursoId, detalle, ip: req.ip });

module.exports = { record, fromRequest };
