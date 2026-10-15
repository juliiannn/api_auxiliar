/** Guarda en MySQL los pictogramas que se consumen de ARASAAC, para no depender del servicio cada vez. */
const { query } = require('../db');
const { ApiError } = require('../errors');
const { imageUrl } = require('./arasaacClient');

async function upsertPictograms(items) {
  if (items.length === 0) return;
  const values = items.map((i) => [
    i.arasaac_id, String(i.palabra).slice(0, 100),
    i.palabras_clave && i.palabras_clave.length ? i.palabras_clave.join(', ').slice(0, 500) : null,
    String(i.imagen_url).slice(0, 255),
  ]);
  await query(
    `INSERT INTO pictograms (arasaac_id, palabra, palabras_clave, imagen_url) VALUES ?
     ON DUPLICATE KEY UPDATE palabra = VALUES(palabra), palabras_clave = VALUES(palabras_clave),
       imagen_url = VALUES(imagen_url), estado = 1`,
    [values],
  );
}

/** Devuelve el id interno de un pictograma de ARASAAC; si aún no está guardado, lo registra. */
async function ensurePictogram(arasaacId, palabra) {
  const found = await query('SELECT id, estado FROM pictograms WHERE arasaac_id = ?', [arasaacId]);
  if (found.length > 0) {
    if (!found[0].estado) await query('UPDATE pictograms SET estado = 1 WHERE id = ?', [found[0].id]);
    return found[0].id;
  }
  if (!palabra) {
    throw new ApiError(400, `Pictogram ${arasaacId} is not in the catalog yet: search it first (GET /pictograms/search) or send "palabra"`);
  }
  const result = await query(
    'INSERT INTO pictograms (arasaac_id, palabra, imagen_url) VALUES (?, ?, ?)',
    [arasaacId, String(palabra).slice(0, 100), imageUrl(arasaacId)],
  );
  return result.insertId;
}

module.exports = { upsertPictograms, ensurePictogram };
