/**
 * Cliente del servicio externo ARASAAC (https://arasaac.org): pictogramas gratuitos para comunicación aumentativa.
 *   GET {api}/pictograms/{idioma}/search/{texto}   -> [{ _id, keywords: [{ keyword, ... }], ... }]
 *   Imagen: {static}/pictograms/{id}/{id}_{tamaño}.png
 * Los pictogramas son propiedad del Gobierno de Aragón (autor: Sergio Palao) y se distribuyen con licencia CC BY-NC-SA:
 * hay que mostrar el crédito y no usarlos con fines comerciales.
 */
const config = require('../config');
const { ApiError } = require('../errors');

const TIMEOUT_MS = 10000;
const ATTRIBUTION =
  'Pictogramas: ARASAAC (https://arasaac.org), propiedad del Gobierno de Aragón, autor Sergio Palao. Licencia CC BY-NC-SA.';

const imageUrl = (arasaacId) => `${config.arasaacStaticUrl}/pictograms/${arasaacId}/${arasaacId}_${config.arasaacImageSize}.png`;

async function searchPictograms(term, lang = 'es') {
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
        return { arasaac_id: p.id, palabra: words[0] || term, palabras_clave: words.slice(0, 10), imagen_url: imageUrl(p.id) };
      });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, 'The pictogram service is unavailable, try again later');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { searchPictograms, imageUrl, ATTRIBUTION };
