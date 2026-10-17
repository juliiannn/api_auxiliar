const supportModel = require('../models/supportModel');
const pictogramModel = require('../models/pictogramModel');
const auditLogModel = require('../models/auditLogModel');
const { ApiError, asyncHandler, send } = require('../utils/errors');
const {
  requireString, optionalString, optionalInt, requireEmail, parseId, oneOf, pagination,
} = require('../utils/validators');

const STAFF = ['ADMIN', 'RECTOR', 'COORDINATOR', 'TEACHER'];
const TYPES = ['AGENDA_DIA', 'RUTINA', 'TAREA_PASOS', 'ANTICIPACION', 'NORMAS'];
const MODULE = 'Apoyos visuales';
const MAX_STEPS = 30;

// ===== Respuestas =====

const presentBase = (v) => ({
  id: v.id, codigo: v.codigo, tipo: v.tipo, titulo: v.titulo, descripcion: v.descripcion,
  estudiante_email: v.estudiante_email, general: v.estudiante_email === null, creado_por: v.creado_por,
  estado: !!v.estado, creado: v.creado, actualizado: v.actualizado,
});

const presentStep = (s) => ({
  orden: s.orden, texto: s.texto, duracion_minutos: s.duracion_minutos,
  pictograma: s.arasaac_id ? { arasaac_id: s.arasaac_id, palabra: s.palabra, imagen_url: s.imagen_url } : null,
});

async function presentFull(support) {
  const steps = await supportModel.getSteps(support.id);
  return {
    ...presentBase(support), total_pasos: steps.length, pasos: steps.map(presentStep),
    atribucion: pictogramModel.ATTRIBUTION,
  };
}

// ===== Acceso y auditoría =====

async function loadSupport(id) {
  const support = await supportModel.getById(id);
  if (!support) throw new ApiError(404, `Support with id ${id} not found`);
  return support;
}

/** El personal ve todo; el estudiante solo lo suyo y los apoyos generales del aula. */
function assertCanView(support, user) {
  if (STAFF.includes(user.role)) return;
  if (support.estudiante_email === null || support.estudiante_email === user.email) return;
  throw new ApiError(404, `Support with id ${support.id} not found`);
}

/** ADMIN y COORDINATOR modifican cualquiera; el docente solo los que él creó. */
function assertCanModify(support, user) {
  if (['ADMIN', 'COORDINATOR'].includes(user.role)) return;
  if (user.role === 'TEACHER' && support.creado_por === user.email) return;
  throw new ApiError(403, 'You can only modify supports you created');
}

const audit = (req, accion, recursoId = null, detalle = null) =>
  auditLogModel.record({
    email: req.user.email, rol: req.user.role, accion, modulo: MODULE, recursoId, detalle, ip: req.ip,
  });

// ===== Validación del body =====

function readBody(body = {}) {
  const tipo = oneOf(body.tipo, TYPES, 'tipo');
  const titulo = requireString(body.titulo, 'titulo', { min: 3, max: 150 });
  const descripcion = optionalString(body.descripcion, 'descripcion', 500);
  const estudianteEmail = body.estudiante_email ? requireEmail(body.estudiante_email, 'estudiante_email') : null;
  return { tipo, titulo, descripcion, estudianteEmail };
}

/** Valida el arreglo de pasos que llega en el body y le asigna el orden (1, 2, 3...). */
function parseSteps(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new ApiError(400, 'pasos must be a non-empty array');
  if (raw.length > MAX_STEPS) throw new ApiError(400, `pasos can have at most ${MAX_STEPS} items`);
  return raw.map((s, i) => {
    const item = s || {};
    return {
      orden: i + 1,
      texto: requireString(item.texto, `pasos[${i}].texto`, { min: 1, max: 200 }),
      arasaacId: optionalInt(item.arasaac_id, `pasos[${i}].arasaac_id`, { min: 1, max: 100000000 }),
      palabra: optionalString(item.palabra, `pasos[${i}].palabra`, 100),
      duracionMinutos: optionalInt(item.duracion_minutos, `pasos[${i}].duracion_minutos`, { min: 1, max: 240 }),
    };
  });
}

/** Convierte los pasos validados en pasos con el id interno del pictograma (registrándolo si hace falta). */
async function resolvePictograms(steps) {
  for (const step of steps) {
    step.pictogramaId = step.arasaacId ? await pictogramModel.ensure(step.arasaacId, step.palabra) : null;
  }
  return steps;
}

module.exports = {

  postSupport: asyncHandler(async (req, res) => {
    const d = readBody(req.body);
    const steps = await resolvePictograms(parseSteps((req.body || {}).pasos));

    const id = await supportModel.create({ ...d, creadoPor: req.user.email }, steps);
    await audit(req, 'CREATE', id, d.estudianteEmail ? `Apoyo para ${d.estudianteEmail}` : 'Apoyo general');
    send(res, 201, 'Visual support created successfully', await presentFull(await loadSupport(id)));
  }),

  getSupports: asyncHandler(async (req, res) => {
    const { page, limit, offset } = pagination(req.query);
    const estudianteEmail = req.query.estudiante_email ? requireEmail(req.query.estudiante_email, 'estudiante_email') : null;
    const tipo = req.query.tipo ? oneOf(req.query.tipo, TYPES, 'tipo') : null;

    const { rows, total } = await supportModel.getAll({
      estudianteEmail, general: req.query.general === 'true', tipo, limit, offset,
    });
    if (req.query.estudiante_email) await audit(req, 'READ', null, `Apoyos de ${req.query.estudiante_email}`);
    send(res, 200, 'Supports retrieved successfully', {
      items: rows.map((v) => ({ ...presentBase(v), total_pasos: v.total_pasos })), page, limit, total,
    });
  }),

  // El estudiante ve sus apoyos y los generales del aula, con todos sus pasos
  getMySupports: asyncHandler(async (req, res) => {
    const rows = await supportModel.getForStudent(req.user.email);
    const items = await Promise.all(rows.map(presentFull));
    send(res, 200, 'Supports retrieved successfully', items);
  }),

  getSupportById: asyncHandler(async (req, res) => {
    const support = await loadSupport(parseId(req.params.id));
    assertCanView(support, req.user);
    if (STAFF.includes(req.user.role) && support.estudiante_email) {
      await audit(req, 'READ', support.id, `Apoyo de ${support.estudiante_email}`);
    }
    send(res, 200, 'Support retrieved successfully', await presentFull(support));
  }),

  putSupport: asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const support = await loadSupport(id);
    assertCanModify(support, req.user);
    const d = readBody(req.body);
    const rawSteps = (req.body || {}).pasos;
    const steps = rawSteps === undefined ? null : await resolvePictograms(parseSteps(rawSteps)); // sin "pasos" se conservan los actuales

    await supportModel.update(id, d, steps);
    await audit(req, 'UPDATE', id);
    send(res, 200, 'Visual support updated successfully', await presentFull(await loadSupport(id)));
  }),

  deactivateSupport: asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    assertCanModify(await loadSupport(id), req.user);
    await supportModel.deactivate(id);
    await audit(req, 'DELETE', id);
    send(res, 200, 'Visual support deactivated successfully', null);
  }),
};
