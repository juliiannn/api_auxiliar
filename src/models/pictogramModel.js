const config = require('../config/config');
const { query } = require('../config/dbConfig');
const { ApiError } = require('../utils/errors');

/**
 * Pictogramas de ARASAAC (https://arasaac.org): pictogramas gratuitos para comunicación aumentativa.
 *   GET {api}/pictograms/{idioma}/search/{texto}   -> [{ _id, keywords: [{ keyword, ... }], ... }]
 *   Imagen: {static}/pictograms/{id}/{id}_{tamaño}.png
 * Los pictogramas son propiedad del Gobierno de Aragón (autor: Sergio Palao) y se distribuyen con licencia CC BY-NC-SA:
 * hay que mostrar el crédito y no usarlos con fines comerciales.
 *
 * Este modelo consulta el servicio externo y guarda en MySQL los pictogramas que se consumen,
 * para no depender del servicio cada vez.
 */
const TIMEOUT_MS = 10000;
const ATTRIBUTION =
  'Pictogramas: ARASAAC (https://arasaac.org), propiedad del Gobierno de Aragón, autor Sergio Palao. Licencia CC BY-NC-SA.';

class Pictogram {
  constructor() {
    this.ATTRIBUTION = ATTRIBUTION;
  }

  imageUrl(arasaacId) {
    return `${config.arasaacStaticUrl}/pictograms/${arasaacId}/${arasaacId}_${config.arasaacImageSize}.png`;
  }

  /** Busca en el servicio externo (ARASAAC). No guarda nada. */
  async searchExternal(term, lang = 'es') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${config.arasaacApiUrl}/pictograms/${lang}/search/${encodeURIComponent(term)}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (response.status === 404) return []; // sin coincidencias
      if (response.status === 429) throw new ApiError(502, 'The pictogram service is rate limiting requests, try again in a minute');
      if (!response.ok) throw new ApiError(502, `The pictogram service responded with status ${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body)) throw new ApiError(502, 'Unexpected response from the pictogram service');

      return body
        .map((p) => ({ id: Number(p && p._id), keywords: Array.isArray(p && p.keywords) ? p.keywords : [] }))
        .filter((p) => Number.isInteger(p.id) && p.id > 0)
        .map((p) => {
          const words = p.keywords.map((k) => k && k.keyword).filter((w) => typeof w === 'string' && w.trim());
          return { arasaac_id: p.id, palabra: words[0] || term, palabras_clave: words.slice(0, 10), imagen_url: this.imageUrl(p.id) };
        });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(502, 'The pictogram service is unavailable, try again later');
    } finally {
      clearTimeout(timer);
    }
  }

  /** Guarda (o actualiza) varios pictogramas del catálogo local. */
  async upsertMany(items) {
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
  async ensure(arasaacId, palabra) {
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
      [arasaacId, String(palabra).slice(0, 100), this.imageUrl(arasaacId)],
    );
    return result.insertId;
  }

  /** Catálogo ya guardado (activos), con búsqueda opcional por palabra o palabras clave. */
  async getAll({ q, limit, offset }) {
    const where = ['estado = 1'];
    const params = [];
    if (q) {
      where.push('(palabra LIKE ? OR palabras_clave LIKE ?)');
      params.push(`%${String(q).trim()}%`, `%${String(q).trim()}%`);
    }
    const whereSql = where.join(' AND ');
    const [rows, count] = await Promise.all([
      query(`SELECT * FROM pictograms WHERE ${whereSql} ORDER BY palabra LIMIT ? OFFSET ?`, [...params, limit, offset]),
      query(`SELECT COUNT(*) AS total FROM pictograms WHERE ${whereSql}`, params),
    ]);
    return { rows, total: count[0].total };
  }

  async getById(id) {
    const rows = await query('SELECT * FROM pictograms WHERE id = ? AND estado = 1', [id]);
    return rows[0] || null;
  }

  async isUsedByActiveSteps(id) {
    const rows = await query('SELECT id FROM visual_support_steps WHERE pictograma_id = ? AND estado = 1 LIMIT 1', [id]);
    return rows.length > 0;
  }

  /** Desactiva el pictograma; devuelve cuántas filas cambió (0 si no existe o ya estaba inactivo). */
  async deactivate(id) {
    const result = await query('UPDATE pictograms SET estado = 0 WHERE id = ? AND estado = 1', [id]);
    return result.affectedRows;
  }
}

module.exports = new Pictogram();
