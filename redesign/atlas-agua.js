/* ============================================================================
   atlas-agua.js — ¿quién gestiona el agua en el municipio de esta ficha?

   Lee la tabla `atlas_municipios` de Supabase, derivada del Atlas del Agua GPF
   (repo privado atlas-del-agua-gpf). SOLO LECTURA: ningún flujo del CRM escribe
   ahí, y la política RLS de la tabla únicamente concede SELECT.

   Por qué hace falta cruzar en JS y no en SQL: el CRM guarda el municipio a mano
   en studios.city y el Atlas usa el nombre oficial del INE («El Ejido» ↔ «Ejido,
   El», «Vélez-Málaga», «Alacant/Alicante»). La normalización vive en
   Util.normMuni / Util.clavesMunicipio (copia canónica en
   scripts/atlas-agua/lib-muni.mjs; el test test-muni-claves.js vigila que no
   divergan). Se baja la provincia entera —un centenar de filas— y se cruza aquí.

   Expone: window.AtlasAgua.deFicha(studio) → Promise<{ estado, fila }>
     estado: 'ok' | 'sin-municipio' | 'no-reconocido' | 'provincia-vacia' | 'error'
   ========================================================================== */
(function () {
  'use strict';

  // provincia normalizada → Promise<{ porClave: Map, filas: [] }>
  const _cache = new Map();

  function _U() { return window.Util || {}; }

  function _normProv(s) {
    const U = _U();
    return U.normProv ? U.normProv(s) : String(s || '').trim().toLowerCase();
  }

  /* Claves de un municipio con su rango de especificidad (0 = grafía propia,
     1 = derivada). Si la copia del navegador es vieja y no trae el rango, se
     degrada a todas rango 0, que es el comportamiento de antes. */
  function _clavesRango(U, nombre) {
    if (U.clavesMunicipioRango) return U.clavesMunicipioRango(nombre);
    const cs = U.clavesMunicipio ? U.clavesMunicipio(nombre)
                                 : [String(nombre || '').toLowerCase()];
    return cs.map(function (c) { return { clave: c, rango: 0 }; });
  }

  /* El nombre de provincia del CRM («Alicante») es un fragmento del que usa el
     INE en el Atlas («Alacant/Alicante»), así que se busca por ilike y no por
     igualdad. Sin esto, Alicante, Valencia, Castellón, Álava y A Coruña se
     quedarían fuera en silencio. */
  function _cargarProvincia(provincia) {
    const clave = _normProv(provincia);
    if (_cache.has(clave)) return _cache.get(clave);

    const q = '/atlas_municipios?select=*&provincia=ilike.' +
      encodeURIComponent('*' + String(provincia).trim() + '*') + '&order=municipio';

    const p = window.DataSupabase.sbGet(q).then(function (filas) {
      const U = _U();
      /* Se acumulan TODOS los municipios que reclaman cada clave y se decide al
         final; quedarse con el primero que llega dejaba que el `order=municipio`
         eligiera por nosotros, y «El Pinar» le robaba `pinar` a «Píñar» —otro
         pueblo, otra demarcación—, así que la ficha enseñaba el organismo de
         cuenca equivocado. Gana el rango más específico; si en ese rango siguen
         quedando municipios distintos, la clave no se usa: antes un hueco que el
         dato de otro. */
      const reclamos = new Map();
      (filas || []).forEach(function (f) {
        _clavesRango(U, f.municipio).forEach(function (c) {
          if (!reclamos.has(c.clave)) reclamos.set(c.clave, []);
          reclamos.get(c.clave).push({ fila: f, rango: c.rango });
        });
      });
      const porClave = new Map();
      reclamos.forEach(function (lista, k) {
        const mejor = Math.min.apply(null, lista.map(function (x) { return x.rango; }));
        const top = lista.filter(function (x) { return x.rango === mejor; });
        const ines = {};
        top.forEach(function (x) { ines[x.fila.ine] = 1; });
        if (Object.keys(ines).length === 1) porClave.set(k, top[0].fila);
      });
      return { porClave: porClave, filas: filas || [] };
    }).catch(function (e) {
      // Una provincia que falla no se queda cacheada como vacía para siempre:
      // así un fallo de red puntual no apaga el bloque el resto de la sesión.
      _cache.delete(clave);
      throw e;
    });

    _cache.set(clave, p);
    return p;
  }

  /** Municipio + provincia de la ficha → fila del Atlas, o el motivo de no haberla. */
  async function deFicha(s) {
    if (!s || !window.DataSupabase || !window.DataSupabase.sbGet) return { estado: 'error' };
    const city = (s.city || (s.data && s.data.city) || '').trim();
    const prov = (s.province || (s.data && s.data.province) || '').trim();
    if (!city || !prov) return { estado: 'sin-municipio' };

    let idx;
    try {
      idx = await _cargarProvincia(prov);
    } catch (e) {
      if (window.debugLog) window.debugLog('[atlas-agua] ' + e.message);
      return { estado: 'error', error: e.message };
    }
    if (!idx.filas.length) return { estado: 'provincia-vacia' };

    const U = _U();
    // Las claves de la ficha se prueban por especificidad: la propia antes que
    // la derivada, igual que en el índice.
    const claves = _clavesRango(U, city)
      .sort(function (a, b) { return a.rango - b.rango; })
      .map(function (x) { return x.clave; });
    for (const k of claves) {
      if (idx.porClave.has(k)) return { estado: 'ok', fila: idx.porClave.get(k) };
    }
    return { estado: 'no-reconocido', municipio: city };
  }

  window.AtlasAgua = {
    deFicha: deFicha,
    /* Para depurar: AtlasAgua.olvidar() fuerza a recargar del servidor. */
    olvidar: function () { _cache.clear(); },
  };
})();
