/**
 * Prueba de punta a punta de la API auxiliar: recorre los endpoints principales y dice qué funciona y qué no.
 * Con la API corriendo (npm run dev) en otra terminal:
 *     node scripts/smoke-test.js                       (prueba http://localhost:4000)
 *     node scripts/smoke-test.js https://tu-api.com    (prueba una API desplegada)
 * Si la API tiene AUTH_ENABLED=true, pasa un token:  TOKEN=eyJ... node scripts/smoke-test.js
 *
 * Deja datos de prueba en la base: el apoyo de la prueba queda desactivado (estado = 0), y hay pictogramas y registros de auditoría guardados.
 */
const BASE = (process.argv[2] || process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const TOKEN = process.env.TOKEN;
const STUDENT = 'prueba.automatica@colegio.com';

let passed = 0;
let failed = 0;

async function call(method, path, { body, headers = {} } = {}) {
  const h = { accept: 'application/json', ...headers };
  if (body !== undefined) h['content-type'] = 'application/json';
  if (TOKEN) h.authorization = `Bearer ${TOKEN}`;
  try {
    const res = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null;
    try { json = await res.json(); } catch { /* respuesta sin JSON */ }
    return { status: res.status, json };
  } catch (err) {
    return { status: 0, json: null, error: err.message };
  }
}

function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ✔ ${name}`); } else { failed += 1; console.log(`  ✘ ${name}${detail ? `  -> ${detail}` : ''}`); }
  return ok;
}

const msg = (r) => (r.error ? r.error : `HTTP ${r.status}${r.json && r.json.message ? ': ' + r.json.message : ''}`);

async function main() {
  console.log(`Probando ${BASE}\n`);

  console.log('1) La API y la base de datos');
  const health = await call('GET', '/health');
  if (!check('GET /health responde y la base está activa', health.status === 200 && health.json && health.json.database === 'up', msg(health))) {
    console.log('\nSin esto no se puede seguir. ¿Está corriendo la API (npm run dev) y bien configurado el .env?');
    return finish();
  }

  console.log('\n2) Servicio externo ARASAAC');
  const search = await call('GET', '/pictograms/search?q=casa');
  const items = search.json && search.json.data && search.json.data.items;
  const found = check('GET /pictograms/search?q=casa devuelve pictogramas', search.status === 200 && Array.isArray(items) && items.length > 0, msg(search));
  check('la respuesta incluye el crédito (atribucion) de ARASAAC', !!(search.json && search.json.data && search.json.data.atribucion));
  const pic = found ? items[0] : null;
  if (pic) console.log(`     primer resultado: "${pic.palabra}" (id ${pic.arasaac_id})  ${pic.imagen_url}`);
  const cached = await call('GET', '/pictograms?q=casa');
  check('los pictogramas quedaron guardados en MySQL (GET /pictograms)', cached.status === 200 && cached.json.data.total > 0, msg(cached));

  console.log('\n3) Apoyos visuales');
  const pasos = [{ texto: 'Paso uno de prueba', duracion_minutos: 2 }, { texto: 'Paso dos de prueba' }];
  if (pic) pasos[0].arasaac_id = pic.arasaac_id;
  const created = await call('POST', '/supports', {
    body: { tipo: 'TAREA_PASOS', titulo: 'Prueba automática', descripcion: 'Creado por smoke-test', estudiante_email: STUDENT, pasos },
  });
  const sup = created.json && created.json.data;
  const okCreate = check('POST /supports crea un apoyo con 2 pasos', created.status === 201 && sup && sup.pasos && sup.pasos.length === 2, msg(created));
  if (!okCreate) return finish();
  check('el apoyo tiene código único (APV-...)', /^APV-/.test(sup.codigo));
  if (pic) check('el primer paso trae su pictograma con imagen', !!(sup.pasos[0].pictograma && sup.pasos[0].pictograma.imagen_url));

  const one = await call('GET', `/supports/${sup.id}`);
  check('GET /supports/:id devuelve el apoyo con sus pasos', one.status === 200 && one.json.data.pasos.length === 2, msg(one));

  const list = await call('GET', `/supports?estudiante_email=${encodeURIComponent(STUDENT)}`);
  check('GET /supports filtra por estudiante', list.status === 200 && list.json.data.total >= 1, msg(list));

  const mine = await call('GET', '/supports/me', { headers: { 'x-user-email': STUDENT } });
  check('GET /supports/me muestra mis apoyos', mine.status === 200 && Array.isArray(mine.json.data) && mine.json.data.some((s) => s.id === sup.id), msg(mine));

  const upd = await call('PUT', `/supports/${sup.id}`, {
    body: { tipo: 'TAREA_PASOS', titulo: 'Prueba automática (editada)', estudiante_email: STUDENT, pasos: [{ texto: 'Un solo paso' }] },
  });
  check('PUT /supports/:id reemplaza los pasos (2 -> 1)', upd.status === 200 && upd.json.data.total_pasos === 1 && upd.json.data.pasos.length === 1, msg(upd));

  console.log('\n4) Validaciones y errores');
  const bad = await call('POST', '/supports', { body: { tipo: 'INVENTADO', titulo: 'x', pasos: [] } });
  check('datos inválidos responden 400', bad.status === 400, msg(bad));
  const missing = await call('GET', '/supports/99999999');
  check('un apoyo que no existe responde 404', missing.status === 404, msg(missing));

  console.log('\n5) Auditoría');
  const audit = await call('GET', '/audit-logs?modulo=' + encodeURIComponent('Apoyos visuales'));
  check('GET /audit-logs muestra lo que se hizo', audit.status === 200 && audit.json.data.total >= 1, msg(audit));

  console.log('\n6) Borrado lógico');
  const del = await call('PUT', `/supports/${sup.id}/deactivate`);
  check('PUT /supports/:id/deactivate desactiva el apoyo', del.status === 200, msg(del));
  const gone = await call('GET', `/supports/${sup.id}`);
  check('el apoyo desactivado ya no aparece (404)', gone.status === 404, msg(gone));

  finish();
}

function finish() {
  console.log(`\nResultado: ${passed} pruebas correctas, ${failed} con problemas.`);
  if (failed > 0) {
    console.log('Copia las líneas marcadas con ✘ (sin contraseñas) y revisamos qué ajustar.');
    process.exit(1);
  }
  console.log('¡Todo en orden! La API está lista para desplegar.');
}

main().catch((err) => {
  console.error('Error inesperado:', err.message);
  process.exit(1);
});
