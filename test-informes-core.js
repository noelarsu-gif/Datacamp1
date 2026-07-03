/* Test unitario de informes-core.js — ejecutar con: node test-informes-core.js */
const assert = require('assert');
const C = require('./informes-core.js');

let pass = 0, fail = 0;
function test(nombre, fn) {
  try {
    fn();
    pass++;
    console.log('  ✔ ' + nombre);
  } catch (e) {
    fail++;
    console.log('  ✘ ' + nombre);
    console.log('    ' + e.message);
  }
}

/* ── Datos de prueba (calcados del modelo real de _guardarIncidencia) ── */
const incidencias = [
  { id: 1, tipus: 'senyalitzacio', carretera: 'N-240', km: 12, m: 400, sensePK: false, ts: '2026-07-01T08:00:00.000Z',
    subtipus: { senyals: [{ c: 'R-1', nEs: 'Ceda el paso' }] } },
  { id: 2, tipus: 'animal', carretera: 'N-240', km: 5, m: 100, sensePK: false, ts: '2026-07-02T09:00:00.000Z',
    subtipus: { especie: 'jabali', especieLabel: 'Jabalí' } },
  { id: 3, tipus: 'forat', carretera: 'C-14', km: 3, m: 50, sensePK: false, ts: '2026-06-30T07:00:00.000Z' },
  { id: 4, tipus: 'animal', carretera: 'N-240', km: 5, m: 900, sensePK: false, ts: '2026-07-03T10:00:00.000Z',
    subtipus: { especie: 'corzo', especieLabel: 'Corzo' } },
  { id: 5, tipus: 'altra', carretera: null, km: null, m: null, sensePK: true, ts: '2026-07-01T12:00:00.000Z',
    subtipus: { texto: 'Vertido de residuos' } },
  { id: 6, tipus: 'averia', carretera: 'C-14', km: 3, m: 10, sensePK: false, ts: '2026-07-01T15:00:00.000Z' },
];

console.log('InformesCore — suite de tests\n');

/* ── filtrarIncidencias ─────────────────────────────────────────── */
test('tipos:["todas"] devuelve todas las incidencias', () => {
  const r = C.filtrarIncidencias(incidencias, { tipos: ['todas'] });
  assert.strictEqual(r.length, 6);
});

test('filtra por un único tipo', () => {
  const r = C.filtrarIncidencias(incidencias, { tipos: ['animal'] });
  assert.strictEqual(r.length, 2);
  assert(r.every(i => i.tipus === 'animal'));
});

test('filtra por varios tipos a la vez', () => {
  const r = C.filtrarIncidencias(incidencias, { tipos: ['animal', 'forat'] });
  assert.strictEqual(r.length, 3);
});

test('filtro de fecha desde (inclusive)', () => {
  const r = C.filtrarIncidencias(incidencias, { tipos: ['todas'], fechaDesdeISO: '2026-07-01T00:00:00.000Z' });
  assert.strictEqual(r.length, 5); // todas menos la del 30/06
  assert(!r.some(i => i.id === 3));
});

test('filtro de fecha hasta (inclusive)', () => {
  const r = C.filtrarIncidencias(incidencias, { tipos: ['todas'], fechaHastaISO: '2026-07-01T23:59:59.999Z' });
  assert.strictEqual(r.length, 4); // 30/06, dos del 01/07 y la de altra del 01/07
});

test('rango de fechas combinado (un único día)', () => {
  const r = C.filtrarIncidencias(incidencias, {
    tipos: ['todas'],
    fechaDesdeISO: '2026-07-01T00:00:00.000Z',
    fechaHastaISO: '2026-07-01T23:59:59.999Z',
  });
  assert.strictEqual(r.length, 3); // ids 1, 5, 6
  assert.deepStrictEqual(r.map(i => i.id).sort(), [1, 5, 6]);
});

test('idsSeleccionados restringe a una selección manual concreta', () => {
  const r = C.filtrarIncidencias(incidencias, { tipos: ['todas'], idsSeleccionados: [2, 4] });
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r.map(i => i.id).sort(), [2, 4]);
});

test('idsSeleccionados + filtro de tipo se combinan correctamente', () => {
  const r = C.filtrarIncidencias(incidencias, { tipos: ['animal'], idsSeleccionados: [1, 2] });
  assert.strictEqual(r.length, 1); // solo la 2 es animal Y está en la selección
  assert.strictEqual(r[0].id, 2);
});

/* ── ordenarIncidencias ─────────────────────────────────────────── */
test('orden por carretera + PK, ascendente, agrupa por carretera y sub-ordena por PK', () => {
  const soloN240 = incidencias.filter(i => i.carretera === 'N-240');
  const r = C.ordenarIncidencias(soloN240, 'carretera_pk', 'asc');
  assert.deepStrictEqual(r.map(i => i.id), [2, 4, 1]); // PK 5+100, 5+900, 12+400
});

test('orden por carretera + PK, descendente, invierte el resultado', () => {
  const soloN240 = incidencias.filter(i => i.carretera === 'N-240');
  const r = C.ordenarIncidencias(soloN240, 'carretera_pk', 'desc');
  assert.deepStrictEqual(r.map(i => i.id), [1, 4, 2]);
});

test('las incidencias sin PK (sensePK) van siempre al final al ordenar por carretera+PK', () => {
  const r = C.ordenarIncidencias(incidencias, 'carretera_pk', 'asc');
  assert.strictEqual(r[r.length - 1].id, 5); // la única con sensePK:true
});

test('las incidencias sin PK siguen al final incluso en orden descendente', () => {
  const r = C.ordenarIncidencias(incidencias, 'carretera_pk', 'desc');
  assert.strictEqual(r[r.length - 1].id, 5);
  assert.strictEqual(r[0].id, 1); // N-240 12+400 es el PK más alto -> primero en desc
});

test('orden por fecha ascendente', () => {
  const r = C.ordenarIncidencias(incidencias, 'fecha', 'asc');
  assert.strictEqual(r[0].id, 3);              // 30/06 — la más antigua
  assert.strictEqual(r[r.length - 1].id, 4);   // 03/07 10:00 — la más nueva
});

test('orden por especie (solo tiene sentido si el filtro es de animales, pero la función es agnóstica)', () => {
  const soloAnimales = incidencias.filter(i => i.tipus === 'animal');
  const r = C.ordenarIncidencias(soloAnimales, 'especie', 'asc');
  assert.deepStrictEqual(r.map(i => i.id), [4, 2]); // Corzo antes que Jabalí alfabéticamente
});

test('orden por código de señal', () => {
  const soloSenyal = incidencias.filter(i => i.tipus === 'senyalitzacio');
  const r = C.ordenarIncidencias(soloSenyal, 'senyal', 'asc');
  assert.strictEqual(r[0].id, 1);
});

/* ── opcionesOrdenParaTipos ─────────────────────────────────────── */
test('con "todas" seleccionadas solo ofrece los 2 criterios genéricos (carretera+PK y fecha)', () => {
  const opts = C.opcionesOrdenParaTipos(['todas']);
  assert.deepStrictEqual(opts.map(o => o.value), ['carretera_pk', 'fecha']);
});

test('con un único tipo "animal" añade el criterio "especie"', () => {
  const opts = C.opcionesOrdenParaTipos(['animal']);
  assert(opts.some(o => o.value === 'especie'));
  assert(!opts.some(o => o.value === 'senyal'));
});

test('con un único tipo "senyalitzacio" añade el criterio "senyal"', () => {
  const opts = C.opcionesOrdenParaTipos(['senyalitzacio']);
  assert(opts.some(o => o.value === 'senyal'));
});

test('con varios tipos mezclados no añade criterios de subtipo', () => {
  const opts = C.opcionesOrdenParaTipos(['animal', 'senyalitzacio']);
  assert(!opts.some(o => o.value === 'especie' || o.value === 'senyal'));
});

/* ── Nomenclatura de archivos ──────────────────────────────────── */
test('sanitizarNombreArchivo elimina acentos y caracteres no válidos', () => {
  assert.strictEqual(C.sanitizarNombreArchivo('Carretera Ñ-240 / Sí'), 'Carretera_N-240_Si');
});

test('sanitizarNombreArchivo nunca devuelve una cadena vacía', () => {
  assert.strictEqual(C.sanitizarNombreArchivo('***'), 'SD');
  assert.strictEqual(C.sanitizarNombreArchivo(''), 'SD');
  assert.strictEqual(C.sanitizarNombreArchivo(null), 'SD');
});

test('nombreFotoInforme construye Carretera_PKkm-m_fecha.jpg', () => {
  const inc = { carretera: 'N-240', km: 12, m: 400, sensePK: false, ts: '2026-07-03T10:00:00.000Z' };
  assert.strictEqual(C.nombreFotoInforme(inc), 'N-240_PK12-400_030726.jpg');
});

test('nombreFotoInforme añade sufijo para segunda foto', () => {
  const inc = { carretera: 'N-240', km: 12, m: 400, sensePK: false, ts: '2026-07-03T10:00:00.000Z' };
  assert.strictEqual(C.nombreFotoInforme(inc, '_2'), 'N-240_PK12-400_030726_2.jpg');
});

test('nombreFotoInforme usa "GPS" cuando no hay PK', () => {
  const inc = { sensePK: true, ts: '2026-07-03T10:00:00.000Z' };
  assert.strictEqual(C.nombreFotoInforme(inc), 'GPS_030726.jpg');
});

test('resumenCarreteras concatena carreteras únicas y colapsa el exceso con "+N"', () => {
  const r = C.resumenCarreteras([
    { carretera: 'N-240' }, { carretera: 'N-240' }, { carretera: 'C-14' },
    { carretera: 'C-13' }, { carretera: 'C-12' },
  ], 3);
  assert.strictEqual(r, 'N-240-C-14-C-13+1');
});

test('resumenCarreteras devuelve VARIAS si no hay ninguna carretera (todo sensePK)', () => {
  const r = C.resumenCarreteras([{ carretera: null, sensePK: true }]);
  assert.strictEqual(r, 'VARIAS');
});

/* ── Otros helpers ──────────────────────────────────────────────── */
test('pkTexto formatea correctamente', () => {
  assert.strictEqual(C.pkTexto({ carretera: 'N-240', km: 12, m: 4, sensePK: false }), 'N-240 PK 12+004');
});

test('pkTexto devuelve "Sin PK" cuando sensePK es true', () => {
  assert.strictEqual(C.pkTexto({ sensePK: true }), 'Sin PK');
});

test('contarPorTipo agrupa correctamente', () => {
  const c = C.contarPorTipo(incidencias);
  assert.strictEqual(c.animal, 2);
  assert.strictEqual(c.senyalitzacio, 1);
  assert.strictEqual(c.forat, 1);
});

test('subtipoTexto devuelve la especie para animales', () => {
  assert.strictEqual(C.subtipoTexto(incidencias[1]), 'Jabalí');
});

test('subtipoTexto une varias señales con coma', () => {
  const inc = { tipus: 'senyalitzacio', subtipus: { senyals: [{ c: 'R-1' }, { c: 'R-2' }] } };
  assert.strictEqual(C.subtipoTexto(inc), 'R-1, R-2');
});

test('filtrarYOrdenar encadena ambos pasos', () => {
  const r = C.filtrarYOrdenar(incidencias, { tipos: ['animal'] }, 'especie', 'asc');
  assert.deepStrictEqual(r.map(i => i.id), [4, 2]);
});

console.log(`\n${pass} pasados, ${fail} fallidos`);
process.exit(fail > 0 ? 1 : 0);
