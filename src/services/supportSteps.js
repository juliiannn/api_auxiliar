const { ApiError } = require('../errors');
const { requireString, optionalString, optionalInt } = require('../validators');

const MAX_STEPS = 30;

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

/**
 * Guarda los pasos por posición: reutiliza las filas existentes (así no choca con el único (support_id, orden))
 * y desactiva las que sobran si ahora hay menos pasos.
 */
async function upsertSteps(q, supportId, steps) {
  const values = steps.map((s) => [supportId, s.orden, s.texto, s.pictogramaId, s.duracionMinutos]);
  await q(
    `INSERT INTO visual_support_steps (support_id, orden, texto, pictograma_id, duracion_minutos) VALUES ?
     ON DUPLICATE KEY UPDATE texto = VALUES(texto), pictograma_id = VALUES(pictograma_id),
       duracion_minutos = VALUES(duracion_minutos), estado = 1`,
    [values],
  );
  await q('UPDATE visual_support_steps SET estado = 0 WHERE support_id = ? AND orden > ?', [supportId, steps.length]);
}

module.exports = { parseSteps, upsertSteps, MAX_STEPS };
