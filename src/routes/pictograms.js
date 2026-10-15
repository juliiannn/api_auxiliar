const express = require('express');
const { query } = require('../db');
const { ApiError, asyncHandler, send } = require('../errors');
const { authenticate, requireRole } = require('../middleware/auth');
const { requireString, parseId, pagination } = require('../validators');
const { searchPictograms, ATTRIBUTION } = require('../services/arasaacClient');
const { upsertPictograms } = require('../services/pictogramCatalog');

const router = express.Router();
router.use(authenticate);

const CREATORS = ['ADMIN', 'COORDINATOR', 'TEACHER'];
const MAX_RESULTS = 24;

const present = (p) => ({
  id: p.id, arasaac_id: p.arasaac_id, palabra: p.palabra,
  palabras_clave: p.palabras_clave ? p.palabras_clave.split(', ') : [], imagen_url: p.imagen_url, fuente: p.fuente,
  estado: !!p.estado, creado: p.creado, actualizado: p.actualizado,
});

// Busca pictogramas en el servicio externo (ARASAAC) y los guarda en MySQL
router.get('/search', requireRole(...CREATORS), asyncHandler(async (req, res) => {
  const term = requireString(req.query.q, 'q', { min: 2, max: 50 });
  const lang = req.query.lang === undefined ? 'es' : String(req.query.lang).toLowerCase();
  if (!/^[a-z]{2}$/.test(lang)) throw new ApiError(400, 'lang must be a 2-letter language code (e.g. es)');

  const results = (await searchPictograms(term, lang)).slice(0, MAX_RESULTS);
  await upsertPictograms(results);
  send(res, 200, 'Pictograms retrieved successfully', { items: results, total: results.length, atribucion: ATTRIBUTION });
}));

// Catálogo ya guardado (sin llamar al servicio externo)
router.get('/', requireRole(...CREATORS), asyncHandler(async (req, res) => {
  const { page, limit, offset } = pagination(req.query);
  const where = ['estado = 1'];
  const params = [];
  if (req.query.q) {
    where.push('(palabra LIKE ? OR palabras_clave LIKE ?)');
    params.push(`%${String(req.query.q).trim()}%`, `%${String(req.query.q).trim()}%`);
  }
  const whereSql = where.join(' AND ');
  const [rows, count] = await Promise.all([
    query(`SELECT * FROM pictograms WHERE ${whereSql} ORDER BY palabra LIMIT ? OFFSET ?`, [...params, limit, offset]),
    query(`SELECT COUNT(*) AS total FROM pictograms WHERE ${whereSql}`, params),
  ]);
  send(res, 200, 'Pictograms retrieved successfully', {
    items: rows.map(present), page, limit, total: count[0].total, atribucion: ATTRIBUTION,
  });
}));

router.get('/:id', requireRole(...CREATORS), asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const rows = await query('SELECT * FROM pictograms WHERE id = ? AND estado = 1', [id]);
  if (rows.length === 0) throw new ApiError(404, `Pictogram with id ${id} not found`);
  send(res, 200, 'Pictogram retrieved successfully', { ...present(rows[0]), atribucion: ATTRIBUTION });
}));

router.put('/:id/deactivate', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const inUse = await query('SELECT id FROM visual_support_steps WHERE pictograma_id = ? AND estado = 1 LIMIT 1', [id]);
  if (inUse.length > 0) throw new ApiError(400, 'Cannot deactivate a pictogram used by active supports');
  const result = await query('UPDATE pictograms SET estado = 0 WHERE id = ? AND estado = 1', [id]);
  if (result.affectedRows === 0) throw new ApiError(404, `Pictogram with id ${id} not found`);
  send(res, 200, 'Pictogram deactivated successfully', null);
}));

module.exports = router;
