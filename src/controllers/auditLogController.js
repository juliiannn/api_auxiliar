const auditLogModel = require('../models/auditLogModel');
const { ApiError, asyncHandler, send } = require('../utils/errors');
const { requireString, optionalString, parseId, oneOf, optionalDate, pagination } = require('../utils/validators');

const ACTIONS = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'OTHER'];

const present = (l) => ({
  id: l.id, uuid: l.uuid, usuario_email: l.usuario_email, rol: l.rol, accion: l.accion, modulo: l.modulo,
  recurso_id: l.recurso_id, detalle: l.detalle, ip: l.ip,
  estado: !!l.estado, creado: l.creado, actualizado: l.actualizado,
});

async function findOr404(id, includeArchived = false) {
  const log = await auditLogModel.getById(id, includeArchived);
  if (!log) throw new ApiError(404, `Audit log with id ${id} not found`);
  return log;
}

module.exports = {

  /**
   * Registra una acción. Dos formas de usarlo:
   *  - Con JWT de usuario: el correo y el rol salen del token (no se pueden falsear desde el body).
   *  - Con header x-api-key (la API principal, de servidor a servidor): el body debe traer usuario_email (y opcional rol, ip).
   */
  postAuditLog: asyncHandler(async (req, res) => {
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

    const id = await auditLogModel.create({ email, rol, accion, modulo, recursoId, detalle, ip });
    send(res, 201, 'Audit log registered successfully', present(await findOr404(id)));
  }),

  getAuditLogs: asyncHandler(async (req, res) => {
    const { page, limit, offset } = pagination(req.query);
    const archived = req.query.include_archived === 'true' && req.user.role === 'ADMIN';
    const accion = req.query.accion ? oneOf(req.query.accion, ACTIONS, 'accion') : null;
    const desde = optionalDate(req.query.desde, 'desde');
    const hasta = optionalDate(req.query.hasta, 'hasta');

    const { rows, total } = await auditLogModel.getAll({
      archived, usuarioEmail: req.query.usuario_email, modulo: req.query.modulo, accion, desde, hasta, limit, offset,
    });
    send(res, 200, 'Audit logs retrieved successfully', { items: rows.map(present), page, limit, total });
  }),

  getAuditLogById: asyncHandler(async (req, res) => {
    send(res, 200, 'Audit log retrieved successfully', present(await findOr404(parseId(req.params.id))));
  }),

  // Los registros de auditoría no se editan ni se borran: solo se archivan (estado = 0)
  deactivateAuditLog: asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    await findOr404(id);
    await auditLogModel.archive(id);
    send(res, 200, 'Audit log archived successfully', null);
  }),
};
