/* ═══════════════════════════════════════════════════════════════════
   INFORMES-CORE — lógica pura (sin DOM) del generador de informes PDF
   Se carga como <script> normal en la app (expone window.InformesCore)
   y también es require()-able desde Node para los tests unitarios.
═══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InformesCore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── Catálogo de tipos de incidencia (debe reflejar CFG del resto de la app) ── */
  var TIPOS_INCIDENCIA = [
    { value: 'animal',        label: 'Animal',              icon: '🐗' },
    { value: 'senyalitzacio', label: 'Señalización',        icon: '🛑' },
    { value: 'averia',        label: 'Avería / Accidente',  icon: '🚨' },
    { value: 'bionda',        label: 'Bionda',               icon: '🛡️' },
    { value: 'forat',         label: 'Bache / Grieta',       icon: '🕳️' },
    { value: 'altra',         label: 'Otras',                icon: '⚠️' },
  ];

  function tipoInfo(value) {
    for (var i = 0; i < TIPOS_INCIDENCIA.length; i++) {
      if (TIPOS_INCIDENCIA[i].value === value) return TIPOS_INCIDENCIA[i];
    }
    return { value: value || '?', label: value || 'Sin tipo', icon: '❔' };
  }

  /* ── Extracción de subtipo ─────────────────────────────────────── */
  function especieDe(inc) {
    return (inc && inc.subtipus && inc.subtipus.especieLabel) || '';
  }
  function senyalDe(inc) {
    var s = inc && inc.subtipus && inc.subtipus.senyals && inc.subtipus.senyals[0];
    if (!s) return '';
    return s.c || s.nEs || s.n || '';
  }
  function subtipoTexto(inc) {
    if (!inc || !inc.subtipus) return '';
    if (inc.tipus === 'animal') return especieDe(inc);
    if (inc.tipus === 'senyalitzacio') {
      var lista = (inc.subtipus.senyals || []).map(function (s) { return s.c || s.nEs || s.n; });
      return lista.join(', ');
    }
    if (inc.tipus === 'altra') return inc.subtipus.texto || '';
    return '';
  }

  /* ── Filtrado ───────────────────────────────────────────────────
     filtros = {
       tipos: ['todas'] | ['animal','forat',...],
       fechaDesdeISO: '2026-07-01T00:00:00.000Z' | null,
       fechaHastaISO: '2026-07-03T23:59:59.999Z' | null,
       idsSeleccionados: [1,2,7] | null   // null = todas las que cumplan el resto
     }
  ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── */
  function filtrarIncidencias(incidencias, filtros) {
    filtros = filtros || {};
    var tipos = filtros.tipos || ['todas'];
    var todasTipos = tipos.length === 0 || tipos.indexOf('todas') !== -1;
    var idsSel = filtros.idsSeleccionados || null;
    return (incidencias || []).filter(function (inc) {
      if (!todasTipos && tipos.indexOf(inc.tipus) === -1) return false;
      if (filtros.fechaDesdeISO && (!inc.ts || inc.ts < filtros.fechaDesdeISO)) return false;
      if (filtros.fechaHastaISO && (!inc.ts || inc.ts > filtros.fechaHastaISO)) return false;
      if (idsSel && idsSel.indexOf(inc.id) === -1) return false;
      return true;
    });
  }

  /* ── Orden ──────────────────────────────────────────────────────── */
  function pkDecimal(inc) {
    if (!inc || inc.sensePK || inc.km === null || inc.km === undefined) return null;
    return inc.km + (inc.m || 0) / 1000;
  }

  function cmpTexto(a, b) {
    return (a || '').toString().localeCompare((b || '').toString(), 'es', { numeric: true, sensitivity: 'base' });
  }

  function compararIncidencias(a, b, criterio) {
    switch (criterio) {
      case 'fecha':
        return cmpTexto(a.ts, b.ts);
      case 'tipo':
        return cmpTexto(tipoInfo(a.tipus).label, tipoInfo(b.tipus).label);
      case 'especie':
        return cmpTexto(especieDe(a), especieDe(b));
      case 'senyal':
        return cmpTexto(senyalDe(a), senyalDe(b));
      case 'carretera_pk':
      default: {
        var aSinPK = !!a.sensePK || pkDecimal(a) === null;
        var bSinPK = !!b.sensePK || pkDecimal(b) === null;
        if (aSinPK && bSinPK) return 0;
        if (aSinPK) return 1;
        if (bSinPK) return -1;
        var cCmp = cmpTexto(a.carretera, b.carretera);
        if (cCmp !== 0) return cCmp;
        return pkDecimal(a) - pkDecimal(b);
      }
    }
  }

  function ordenarIncidencias(lista, criterio, direccion) {
    var copia = (lista || []).slice();
    if (criterio === 'carretera_pk') {
      // Las incidencias sin PK no tienen un lugar "natural" en un orden por
      // carretera+PK, así que se quedan siempre al final, independientemente
      // de si el resto se pide ascendente o descendente.
      var conPK = copia.filter(function (i) { return !(i.sensePK || pkDecimal(i) === null); });
      var sinPK = copia.filter(function (i) { return (i.sensePK || pkDecimal(i) === null); });
      conPK.sort(function (a, b) { return compararIncidencias(a, b, criterio); });
      if (direccion === 'desc') conPK.reverse();
      return conPK.concat(sinPK);
    }
    copia.sort(function (a, b) { return compararIncidencias(a, b, criterio); });
    if (direccion === 'desc') copia.reverse();
    return copia;
  }

  /* Qué criterios de orden tiene sentido ofrecer según el/los tipo(s) elegidos */
  function opcionesOrdenParaTipos(tiposSeleccionados) {
    var base = [
      { value: 'carretera_pk', label: 'Carretera + PK' },
      { value: 'fecha',        label: 'Fecha' },
    ];
    var soloUnTipo = (Array.isArray(tiposSeleccionados) && tiposSeleccionados.length === 1 && tiposSeleccionados[0] !== 'todas')
      ? tiposSeleccionados[0] : null;
    if (soloUnTipo === 'animal') base.push({ value: 'especie', label: 'Especie' });
    if (soloUnTipo === 'senyalitzacio') base.push({ value: 'senyal', label: 'Código de señal' });
    return base;
  }

  /* ── Nomenclatura de archivos ──────────────────────────────────── */
  function sanitizarNombreArchivo(str) {
    return (str || '')
      .toString()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_\-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'SD';
  }

  function fechaCorta(isoOrDate) {
    var d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate || Date.now());
    if (isNaN(d.getTime())) d = new Date();
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yy = String(d.getFullYear()).slice(-2);
    return dd + mm + yy;
  }

  function nombreFotoInforme(inc, sufijo) {
    sufijo = sufijo || '';
    var carr = inc.sensePK ? 'GPS' : sanitizarNombreArchivo(inc.carretera || 'SINCARR');
    var pk = inc.sensePK ? '' : ('_PK' + (inc.km != null ? inc.km : 0) + '-' + String(inc.m != null ? inc.m : 0).padStart(3, '0'));
    return carr + pk + '_' + fechaCorta(inc.ts) + sufijo + '.jpg';
  }

  function resumenCarreteras(incidencias, max) {
    max = max || 3;
    var vistos = [];
    (incidencias || []).forEach(function (i) {
      var c = i.sensePK ? null : (i.carretera || null);
      if (c && vistos.indexOf(c) === -1) vistos.push(c);
    });
    if (vistos.length === 0) return 'VARIAS';
    if (vistos.length <= max) return vistos.join('-');
    return vistos.slice(0, max).join('-') + '+' + (vistos.length - max);
  }

  function nombreInforme(prefijo, incidenciasFiltradas, ext) {
    var carrs = sanitizarNombreArchivo(resumenCarreteras(incidenciasFiltradas));
    return prefijo + '_' + carrs + '_' + fechaCorta(new Date()) + '.' + ext;
  }

  function contarPorTipo(incidencias) {
    var out = {};
    (incidencias || []).forEach(function (i) { out[i.tipus] = (out[i.tipus] || 0) + 1; });
    return out;
  }

  function pkTexto(inc) {
    if (!inc || inc.sensePK) return 'Sin PK';
    return (inc.carretera || '—') + ' PK ' + (inc.km != null ? inc.km : 0) + '+' + String(inc.m != null ? inc.m : 0).padStart(3, '0');
  }

  /* ── Pipeline completo: filtrar + ordenar en un solo paso ────────── */
  function filtrarYOrdenar(incidencias, filtros, criterio, direccion) {
    var filtradas = filtrarIncidencias(incidencias, filtros);
    return ordenarIncidencias(filtradas, criterio, direccion);
  }

  return {
    TIPOS_INCIDENCIA: TIPOS_INCIDENCIA,
    tipoInfo: tipoInfo,
    especieDe: especieDe,
    senyalDe: senyalDe,
    subtipoTexto: subtipoTexto,
    filtrarIncidencias: filtrarIncidencias,
    ordenarIncidencias: ordenarIncidencias,
    compararIncidencias: compararIncidencias,
    opcionesOrdenParaTipos: opcionesOrdenParaTipos,
    sanitizarNombreArchivo: sanitizarNombreArchivo,
    fechaCorta: fechaCorta,
    nombreFotoInforme: nombreFotoInforme,
    resumenCarreteras: resumenCarreteras,
    nombreInforme: nombreInforme,
    contarPorTipo: contarPorTipo,
    pkTexto: pkTexto,
    pkDecimal: pkDecimal,
    filtrarYOrdenar: filtrarYOrdenar,
  };
}));
