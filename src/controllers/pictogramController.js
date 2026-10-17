const pictogramModel = require('../models/pictogramModel');
const { ApiError, asyncHandler, send } = require('../utils/errors');
const { requireString, parseId, pagination } = require('../utils/validators');

const MAX_RESULTS = 24;

const present = (p) => ({
  id: p.id, arasaac_id: p.arasaac_id, palabra: p.palabra,
  palabras_clave: p.palabras_clave ? p.palabras_clave.split(', ') : [], imagen_url: p.imagen_url, fuente: p.fuente,
  estado: !!p.estado, creado: p.creado, actualizado: p.actualizado,
});

module.exports = {

  // Busca pictogramas en el servicio externo (ARASAAC) y los guarda en MySQL
  searchPictograms: asyncHandler(async (req, res) => {
    const term = requireString(req.query.q, 'q', { min: 2, max: 50 });
    const lang = req.query.lang === undefined ? 'es' : String(req.query.lang).toLowerCase();
    if (!/^[a-z]{2}$/.test(lang)) throw new ApiError(400, 'lang must be a 2-letter language code (e.g. es)');

    const results = (await pictogramModel.searchExternal(term, lang)).slice(0, MAX_RESULTS);
    await pictogramModel.upsertMany(results);
    send(res, 200, 'Pictograms retrieved successfully', {
      items: results, total: results.length, atribucion: pictogramModel.ATTRIBUTION,
    });
  }),

  // Catálogo ya guardado (sin llamar al servicio externo)
  getPictograms: asyncHandler(async (req, res) => {
    const { page, limit, offset } = pagination(req.query);
    const { rows, total } = await pictogramModel.getAll({ q: req.query.q, limit, offset });
    send(res, 200, 'Pictograms retrieved successfully', {
      items: rows.map(present), page, limit, total, atribucion: pictogramModel.ATTRIBUTION,
    });
  }),

  getPictogramById: asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const pictogram = await pictogramModel.getById(id);
    if (!pictogram) throw new ApiError(404, `Pictogram with id ${id} not found`);
    send(res, 200, 'Pictogram retrieved successfully', { ...present(pictogram), atribucion: pictogramModel.ATTRIBUTION });
  }),

  deactivatePictogram: asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (await pictogramModel.isUsedByActiveSteps(id)) {
      throw new ApiError(400, 'Cannot deactivate a pictogram used by active supports');
    }
    if ((await pictogramModel.deactivate(id)) === 0) throw new ApiError(404, `Pictogram with id ${id} not found`);
    send(res, 200, 'Pictogram deactivated successfully', null);
  }),
};
