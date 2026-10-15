const crypto = require('crypto');
const express = require('express');
const { query, withTransaction } = require('../db');
const { ApiError, asyncHandler, send } = require('../errors');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireString, optionalString, requireEmail, parseId, oneOf, pagination } = require('../validators');
const { ATTRIBUTION } = require('../services/arasaacClient');
const { ensurePictogram } = require('../services/pictogramCatalog');
const { parseSteps, upsertSteps } = require('../services/supportSteps');
const { fromRequest } = require('../services/audit');

const router = express.Router();
router.use(authenticate);

const STAFF = ['ADMIN', 'RECTOR', 'COORDINATOR', 'TEACHER'];
const CREATORS = ['ADMIN', 'COORDINATOR', 'TEACHER'];
const TYPES = ['AGENDA_DIA', 'RUTINA', 'TAREA_PASOS', 'ANTICIPACION', 'NORMAS'];
const MODULE = 'Apoyos visuales';

const STEPS_SQL = `
  SELECT s.orden, s.texto, s.duracion_minutos, p.arasaac_id, p.palabra, p.imagen_url
  FROM visual_support_steps s LEFT JOIN pictograms p ON p.id = s.pictograma_id
  WHERE s.support_id = ? AND s.estado = 1 ORDER BY s.orden`;
const LIST_COLUMNS = `v.*, (SELECT COUNT(*) FROM visual_support_steps st WHERE st.support_id = v.id AND st.estado = 1) AS total_pasos`;

const presentBase = (v) => ({
  id: v.id, codigo: v.codigo, tipo: v.tipo, titulo: v.titulo, descripcion: v.descripcion,
  estudiante_email: v.estudiante_email, general: v.estudiante_email === null, creado_por: v.creado_por,
  estado: !!v.estado, creado: v.creado, actualizado: v.actualizado,
});

const presentStep = (s) => ({
  orden: s.orden, texto: s.texto, duracion_minutos: s.duracion_minutos,
  pictograma: s.arasaac_id ? { arasaac_id: s.arasaac_id, palabra: s.palabra, imagen_url: s.imagen_url } : null,
});

async function loadSupport(id) {
  const rows = await query(`SELECT ${LIST_COLUMNS} FROM visual_supports v WHERE v.id = ? AND v.estado = 1`, [id]);
  if (rows.length === 0) throw new ApiError(404, `Support with id ${id} not found`);
  return rows[0];
}

async function presentFull(support) {
  const steps = await query(STEPS_SQL, [support.id]);
  return { ...presentBase(support), total_pasos: steps.length, pasos: steps.map(presentStep), atribucion: ATTRIBUTION };
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

async function readBody(body = {}) {
  const tipo = oneOf(body.tipo, TYPES, 'tipo');
  const titulo = requireString(body.titulo, 'titulo', { min: 3, max: 150 });
  const descripcion = optionalString(body.descripcion, 'descripcion', 500);
  const estudianteEmail = body.estudiante_email ? requireEmail(body.estudiante_email, 'estudiante_email') : null;
  return { tipo, titulo, descripcion, estudianteEmail };
}

/** Convierte los pasos validados en pasos con el id interno del pictograma (registrándolo si hace falta). */
async function resolvePictograms(steps) {
  for (const step of steps) {
    step.pictogramaId = step.arasaacId ? await ensurePictogram(step.arasaacId, step.palabra) : null;
  }
  return steps;
}

router.post('/', requireRole(...CREATORS), asyncHandler(async (req, res) => {
  const d = await readBody(req.body);
  const steps = await resolvePictograms(parseSteps((req.body || {}).pasos));
  const codigo = `APV-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  const id = await withTransaction(async (q) => {
    const result = await q(
      `INSERT INTO visual_supports (codigo, tipo, titulo, descripcion, estudiante_email, creado_por) VALUES (?, ?, ?, ?, ?, ?)`,
      [codigo, d.tipo, d.titulo, d.descripcion, d.estudianteEmail, req.user.email],
    );
    await upsertSteps(q, result.insertId, steps);
    return result.insertId;
  });
  await fromRequest(req, 'CREATE', MODULE, id, d.estudianteEmail ? `Apoyo para ${d.estudianteEmail}` : 'Apoyo general');
  send(res, 201, 'Visual support created successfully', await presentFull(await loadSupport(id)));
}));

router.get('/', requireRole(...STAFF), asyncHandler(async (req, res) => {
  const { page, limit, offset } = pagination(req.query);
  const where = ['v.estado = 1'];
  const params = [];
  if (req.query.estudiante_email) { where.push('v.estudiante_email = ?'); params.push(requireEmail(req.query.estudiante_email, 'estudiante_email')); }
  if (req.query.general === 'true') where.push('v.estudiante_email IS NULL');
  if (req.query.tipo) { where.push('v.tipo = ?'); params.push(oneOf(req.query.tipo, TYPES, 'tipo')); }

  const whereSql = where.join(' AND ');
  const [rows, count] = await Promise.all([
    query(`SELECT ${LIST_COLUMNS} FROM visual_supports v WHERE ${whereSql} ORDER BY v.creado DESC, v.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]),
    query(`SELECT COUNT(*) AS total FROM visual_supports v WHERE ${whereSql}`, params),
  ]);
  if (req.query.estudiante_email) await fromRequest(req, 'READ', MODULE, null, `Apoyos de ${req.query.estudiante_email}`);
  send(res, 200, 'Supports retrieved successfully', {
    items: rows.map((v) => ({ ...presentBase(v), total_pasos: v.total_pasos })), page, limit, total: count[0].total,
  });
}));

// El estudiante ve sus apoyos y los generales del aula, con todos sus pasos
router.get('/me', requireRole('STUDENT'), asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT ${LIST_COLUMNS} FROM visual_supports v WHERE v.estado = 1 AND (v.estudiante_email = ? OR v.estudiante_email IS NULL)
     ORDER BY v.estudiante_email IS NULL, v.creado DESC`,
    [req.user.email],
  );
  const items = await Promise.all(rows.map(presentFull));
  send(res, 200, 'Supports retrieved successfully', items);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const support = await loadSupport(parseId(req.params.id));
  assertCanView(support, req.user);
  if (STAFF.includes(req.user.role) && support.estudiante_email) {
    await fromRequest(req, 'READ', MODULE, support.id, `Apoyo de ${support.estudiante_email}`);
  }
  send(res, 200, 'Support retrieved successfully', await presentFull(support));
}));

router.put('/:id', requireRole(...CREATORS), asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const support = await loadSupport(id);
  assertCanModify(support, req.user);
  const d = await readBody(req.body);
  const rawSteps = (req.body || {}).pasos;
  const steps = rawSteps === undefined ? null : await resolvePictograms(parseSteps(rawSteps)); // sin "pasos" se conservan los actuales

  await withTransaction(async (q) => {
    await q('UPDATE visual_supports SET tipo = ?, titulo = ?, descripcion = ?, estudiante_email = ? WHERE id = ?',
      [d.tipo, d.titulo, d.descripcion, d.estudianteEmail, id]);
    if (steps) await upsertSteps(q, id, steps);
  });
  await fromRequest(req, 'UPDATE', MODULE, id);
  send(res, 200, 'Visual support updated successfully', await presentFull(await loadSupport(id)));
}));

router.put('/:id/deactivate', requireRole(...CREATORS), asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  assertCanModify(await loadSupport(id), req.user);
  await query('UPDATE visual_supports SET estado = 0 WHERE id = ?', [id]);
  await fromRequest(req, 'DELETE', MODULE, id);
  send(res, 200, 'Visual support deactivated successfully', null);
}));

module.exports = router;
