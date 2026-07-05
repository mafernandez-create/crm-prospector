/* CRM Prospector · rediseño v1 — Autenticación (Supabase Auth / GoTrue)
 *
 * Cierra el acceso anónimo (hallazgo C1 de la auditoría). Con RLS exigiendo el
 * rol `authenticated`, TODA lectura/escritura requiere una sesión válida.
 *
 * Implementación sin SDK (raw GoTrue REST), acorde al estilo del proyecto:
 *   - signIn(email, password) → grant_type=password
 *   - getValidToken()         → devuelve el access_token, refrescándolo si caduca
 *   - signOut()               → revoca y limpia sesión
 *   - renderGate(onSuccess)   → pinta el formulario de login y llama onSuccess al entrar
 *
 * data-supabase.js usa getValidToken() como Bearer en cada petición REST
 * (la anon key sigue yendo en el header `apikey`, como exige Supabase).
 *
 * La sesión se persiste en localStorage. Nota: una vez cerrada la escritura
 * anónima, el vector de XSS-almacenado-vía-BD queda mitigado; aun así, conviene
 * mover el endurecimiento de XSS (hallazgos H2/H3/M3) como siguiente paso.
 */
(function () {
  'use strict';

  const SUPABASE_URL = 'https://zmelqffrkwxkbzzutjrg.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
    '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptZWxxZmZya3d4a2J6enV0anJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Mjg2MzAsImV4cCI6MjA5NTEwNDYzMH0' +
    '.v1_Isxz6-mZtz_DJs3k6qoH9mV9FNW21Z94tiew9cQE';
  const AUTH_BASE = SUPABASE_URL + '/auth/v1';
  const STORE_KEY = 'gpf_sb_auth';     // { access_token, refresh_token, expires_at(ms), email }
  const SKEW_MS   = 60 * 1000;          // refrescar 60s antes de caducar

  let _session = _load();
  let _refreshing = null;               // promesa de refresco en curso (evita carreras)

  function _load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function _save(s) {
    _session = s;
    try {
      if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORE_KEY);
    } catch (_) {}
  }

  async function _post(path, body, bearer) {
    const headers = { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    const res = await fetch(AUTH_BASE + path, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) });
    const json = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      const msg = json.error_description || json.msg || json.error || ('HTTP ' + res.status);
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return json;
  }

  function _store(tok) {
    if (!tok || !tok.access_token) throw new Error('Respuesta de auth inválida');
    _save({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: Date.now() + (tok.expires_in ? tok.expires_in * 1000 : 3600 * 1000),
      email: (tok.user && tok.user.email) || (_session && _session.email) || '',
    });
  }

  async function signIn(email, password) {
    const tok = await _post('/token?grant_type=password', { email: email, password: password });
    _store(tok);
    return _session;
  }

  async function _refresh() {
    if (!_session || !_session.refresh_token) return null;
    if (_refreshing) return _refreshing;
    _refreshing = (async function () {
      try {
        const tok = await _post('/token?grant_type=refresh_token', { refresh_token: _session.refresh_token });
        _store(tok);
        return _session.access_token;
      } catch (e) {
        // refresh_token inválido/expirado → sesión muerta
        _save(null);
        return null;
      } finally {
        _refreshing = null;
      }
    })();
    return _refreshing;
  }

  /* Devuelve un access_token válido (refrescando si hace falta) o null si no hay sesión. */
  async function getValidToken() {
    if (!_session || !_session.access_token) return null;
    if (Date.now() >= (_session.expires_at - SKEW_MS)) {
      return await _refresh();
    }
    return _session.access_token;
  }

  function isAuthenticated() { return !!(_session && _session.access_token); }
  function currentEmail() { return (_session && _session.email) || ''; }

  async function signOut() {
    const tok = _session && _session.access_token;
    _save(null);
    if (tok) { try { await _post('/logout', {}, tok); } catch (_) {} }
    location.reload();
  }

  /* Sesión caducada/rechazada a mitad de uso (p.ej. un 401 en sbFetch): limpia
     la sesión local (sin red) y repinta la verja de login. Al reautenticar,
     recarga para reanudar con la sesión nueva. Guard anti-reentrada para que
     varias peticiones fallidas en paralelo no repinten la verja varias veces. */
  let _expiring = false;
  function expire() {
    _save(null);
    if (_expiring) return;
    _expiring = true;
    renderGate(function () { location.reload(); });
  }

  /* ============================================================
     GATE — formulario de login (se muestra si no hay sesión)
     ============================================================ */
  function renderGate(onSuccess) {
    const app = document.getElementById('app');
    const loader = document.getElementById('app-loader');
    if (loader) loader.classList.add('hidden');
    if (!app) return;
    app.innerHTML =
      '<div class="auth-gate">' +
        '<form class="auth-card" id="auth-form" autocomplete="on">' +
          '<div class="auth-brand">CRM Prospector · GPF</div>' +
          '<h1 class="auth-title">Iniciar sesión</h1>' +
          '<p class="auth-sub">Acceso restringido. Introduce tus credenciales.</p>' +
          '<label class="auth-label" for="auth-email">Email</label>' +
          '<input class="auth-input" id="auth-email" type="email" name="email" autocomplete="username" required>' +
          '<label class="auth-label" for="auth-pass">Contraseña</label>' +
          '<input class="auth-input" id="auth-pass" type="password" name="password" autocomplete="current-password" required>' +
          '<div class="auth-error" id="auth-error" hidden></div>' +
          '<button class="auth-btn" id="auth-submit" type="submit">Entrar</button>' +
        '</form>' +
      '</div>';

    const form = document.getElementById('auth-form');
    const errEl = document.getElementById('auth-error');
    const btn = document.getElementById('auth-submit');
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      errEl.hidden = true;
      btn.disabled = true; btn.textContent = 'Entrando…';
      try {
        await signIn(document.getElementById('auth-email').value.trim(), document.getElementById('auth-pass').value);
        app.innerHTML = '';
        onSuccess();
      } catch (e) {
        errEl.textContent = e.status === 400 ? 'Email o contraseña incorrectos.' : ('No se pudo iniciar sesión: ' + e.message);
        errEl.hidden = false;
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    });
  }

  window.Auth = {
    signIn: signIn,
    signOut: signOut,
    expire: expire,
    getValidToken: getValidToken,
    isAuthenticated: isAuthenticated,
    currentEmail: currentEmail,
    renderGate: renderGate,
  };
})();
