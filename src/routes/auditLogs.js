const crypto = require('crypto');
const express = require('express');
const { query } = require('../db');
const { ApiError, asyncHandler, send } = require('../errors');
const { authenticate, authenticateOrApiKey, requireRole } = require('../middleware/auth');
const { requireString, optionalString, parseId, oneOf, optionalDate, pagination } = require('../validators');

const router = express.Router();

const ACTIONS = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'OTHER'];

const present = (l) => ({
  id: l.id, uuid: l.uuid, usuario_email: l.usuario_email, rol: l.rol, accion: l.accion, modulo: l.modulo,
  recurso_id: l.recurso_id, detalle: l.detalle, ip: l.ip,
  estado: !!l.estado, creado: l.creado, actualizado: l.actualizado,
});

async function findOr404(id, includeArchived = false) {
  const rows = await query(`SELECT * FROM audit_logs WHERE id = ?${includeArchived ? '' : ' AND estado = 1'}`, [id]);
  if (rows.length === 0) throw new ApiError(404, `Audit log with id ${id} not found`);
  return rows[0];
}

/**
 * Registra una acción. Dos formas de usarlo:
 *  - Con JWT de usuario: el correo y el rol salen del token (no se pueden falsear desde el body).
 *  - Con header x-api-key (la API principal, de servidor a servidor): el body debe traer usuario_email (y opcional rol, ip).
 */
router.post('/', authenticateOrApiKey, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const accion = oneOf(body.accion, ACTIONS, 'accion');
  const modulo = requireString(body.modulo, 'modulo', { min: 1, max: 50 });
  const recursoId = optionalString(body.recurso_id === undefined || body.recurso_id === null ? null : String(body.recurso_id), 'recurso_id', 50);
  const detalle = optionalString(body.detalle, 'detalle', 5000);

  let email, rol, ip;
  if (req.service) {
    email = requireString(body.usuario_email, 'usuario_email', { min: 3, max: 255 });
    rol = optionalString(body.rol, 'rol', 30);
    ip = optionalString(body.ip, 'ip', 45) || req.ip;
  } else {
    email = req.user.email;
    rol = req.user.role;
    ip = req.ip;
  }

  const uuid = crypto.randomUUID();
  const result = await query(
    `INSERT INTO audit_logs (uuid, usuario_email, rol, accion, modulo, recurso_id, detalle, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid, email, rol, accion, modulo, recursoId, detalle, ip],
  );
  send(res, 201, 'Audit log registered successfully', present(await findOr404(result.insertId)));
}));

// A partir de aquí: solo usuarios con JWT
router.use(authenticate);

router.get('/', requireRole('ADMIN', 'RECTOR'), asyncHandler(async (req, res) => {
  const { page, limit, offset } = pagination(req.query);
  const where = [];
  const params = [];

  const archived = req.query.include_archived === 'true' && req.user.role === 'ADMIN';
  if (!archived) where.push('estado = 1');
  if (req.query.usuario_email) { where.push('usuario_email = ?'); params.push(String(req.query.usuario_email)); }
  if (req.query.modulo) { where.push('modulo = ?'); params.push(String(req.query.modulo)); }
  if (req.query.accion) { where.push('accion = ?'); params.push(oneOf(req.query.accion, ACTIONS, 'accion')); }
  const desde = optionalDate(req.query.desde, 'desde');
  const hasta = optionalDate(req.query.hasta, 'hasta');
  if (desde) { where.push('creado >= ?'); params.push(desde); }
  if (hasta) { where.push('creado <= ?'); params.push(hasta); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, count] = await Promise.all([
    query(`SELECT * FROM audit_logs ${whereSql} ORDER BY creado DESC, id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
    query(`SELECT COUNT(*) AS total FROM audit_logs ${whereSql}`, params),
  ]);
  send(res, 200, 'Audit logs retrieved successfully', { items: rows.map(present), page, limit, total: count[0].total });
}));

router.get('/:id', requireRole('ADMIN', 'RECTOR'), asyncHandler(async (req, res) => {
  send(res, 200, 'Audit log retrieved successfully', present(await findOr404(parseId(req.params.id))));
}));

// Los registros de auditoría no se editan ni se borran: solo se archivan (estado = 0)
router.put('/:id/deactivate', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  await findOr404(id);
  await query('UPDATE audit_logs SET estado = 0 WHERE id = ?', [id]);
  send(res, 200, 'Audit log archived successfully', null);
}));

module.exports = router;
