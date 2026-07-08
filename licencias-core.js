/* ══════════════════════════════════════════════════════════════════
   SISTEMA DE LICENCIAS v3 — CONTROL EXCLUSIVO POR DISPOSITIVO
   (archivo externo — los códigos viven en licencias.json, no aquí,
   para poder dar de alta gente nueva sin tocar el index.html)
   ────────────────────────────────────────────────────────────────
   Cada entrada del diccionario és un codi COMPOST: 'BASE-XXXX'
   on XXXX és el pk_device_unique_id de 4 dígits del dispositiu.
   Exemple: 'SACYR-5319' → codi base "SACYR", dispositiu "5319"

   FLUX DE VALIDACIÓ:
   ─────────────────────────────────────────
   1. L'usuari introdueix un codi BASE sense guió (ex: "SACYR"):
      → Es mostra l'avís amb el codi compost per enviar a Noel.
   2. L'usuari introdueix un codi COMPOST (ex: "SACYR-5319"):
      → Es comprova que els dígits finals coincideixen exactament
        amb el pk_device_unique_id d'aquest dispositiu.
      → Si coincideix i el codi és al diccionari → accés OK.
      → Si no coincideix → bloqueig amb missatge d'error.

   CLAUS localStorage:
   ─────────────────────────────────────────
   pk_device_unique_id  → ID numèric de 4 dígits d'aquest dispositiu
   pkgeoloc_session_v3  → sessió activa (v3 forçarà re-login als usuaris anteriors)
════════════════════════════════════════════════════════════════ */

let licenciasPiloto = {};

/* Carrega el diccionari de codis des de licencias.json.
   El Service Worker el precachea, així que també funciona offline
   un cop l'app s'ha obert almenys una vegada amb connexió. */
const _licenciasCargadasPromise = fetch('./licencias.json')
  .then(r => r.json())
  .then(data => { licenciasPiloto = data; return data; })
  .catch(err => {
    console.error('No se pudo cargar licencias.json', err);
    return {};
  });

const LS_SESSION = 'pkgeoloc_session_v3';   /* v3 → invalida sessions anteriors */
const LS_DEVICE  = 'pk_device_unique_id';

/* ── Genera o recupera l'ID de 4 dígits d'aquest dispositiu ── */
function _getOrCreateDeviceId() {
  try {
    const stored = localStorage.getItem(LS_DEVICE);
    if (stored && /^\d{4}$/.test(stored)) return stored;
  } catch (_) {}
  /* Genera un número aleatori de 4 dígits (1000–9999) */
  const id = String(Math.floor(1000 + Math.random() * 9000));
  try { localStorage.setItem(LS_DEVICE, id); } catch (_) {}
  return id;
}

/* ── Función principal de validación ── */
async function validarAcceso() {
  await _licenciasCargadasPromise;

  const input  = document.getElementById('accessCodeInput');
  const codigo = (input.value || '').trim().toUpperCase();

  _ocultarPaneles();

  if (!codigo) {
    _mostrarErrorAcceso('Introduce un código de activación.');
    return;
  }

  const deviceId = _getOrCreateDeviceId();

  /* ── CASO A: código sin guión → código BASE, mostrar aviso ── */
  if (!codigo.includes('-')) {
    const existeComoBase = Object.keys(licenciasPiloto).some(k => k.startsWith(codigo + '-'));
    if (!existeComoBase && !licenciasPiloto[codigo]) {
      _mostrarErrorAcceso('Código no reconocido. Contacta con el administrador.');
      input.value = '';
      return;
    }
    /* Mostrar panel ámbar con el código compuesto */
    _mostrarAviso(`${codigo}-${deviceId}`);
    return;
  }

  /* ── CASO B: código con guión → código COMPUESTO (BASE-DEVICEID) ── */
  const parts        = codigo.split('-');
  const deviceSuffix = parts[parts.length - 1];

  if (deviceSuffix !== deviceId) {
    _mostrarErrorAcceso('❌ Este código de acceso ya está vinculado a otro dispositivo móvil.');
    input.value = '';
    return;
  }

  const caducidad = licenciasPiloto[codigo];
  if (!caducidad) {
    _mostrarErrorAcceso('Código no autorizado. Contacta con el administrador para activarlo.');
    input.value = '';
    return;
  }

  const hoy = new Date().toISOString().slice(0, 10);
  if (hoy > caducidad) {
    _mostrarErrorAcceso(`Código caducado el ${caducidad}. Solicita renovación al administrador.`);
    input.value = '';
    return;
  }

  /* Todo OK → guarda sesión y abre la app */
  localStorage.setItem(LS_SESSION, JSON.stringify({ codigo, caducidad, deviceId, validadoEl: hoy }));
  _mostrarApp();
}

/* ── Oculta ambos paneles de feedback ── */
function _ocultarPaneles() {
  document.getElementById('accessError').style.display = 'none';
  document.getElementById('accessWarn').style.display  = 'none';
}

/* ── Panel rojo: error de bloqueo ── */
function _mostrarErrorAcceso(msg) {
  const el = document.getElementById('accessError');
  el.textContent = msg;
  el.style.display = 'block';
}

/* ── Panel ámbar: aviso de activación con botones ── */
let _codigoWarnActual = '';
function _mostrarAviso(codigoCompuesto) {
  _codigoWarnActual = codigoCompuesto;
  document.getElementById('warnCodigo').textContent = codigoCompuesto;
  document.getElementById('accessWarn').style.display = 'block';
}

/* ── Copiar código al portapapeles ── */
function _copiarCodigoWarn() {
  if (!_codigoWarnActual) return;
  navigator.clipboard.writeText(_codigoWarnActual).then(() => {
    const btn = document.getElementById('btnCopiarCodigo');
    btn.textContent = '✅ COPIADO';
    btn.style.color = '#22D97A';
    btn.style.borderColor = 'rgba(34,217,122,.5)';
    setTimeout(() => {
      btn.textContent = '📋 COPIAR';
      btn.style.color = '#C4C9D4';
      btn.style.borderColor = 'rgba(255,255,255,.2)';
    }, 2000);
  }).catch(() => {
    /* Fallback para navegadores sin clipboard API */
    const ta = document.createElement('textarea');
    ta.value = _codigoWarnActual;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

/* ── Compartir por WhatsApp ── */
function _compartirWhatsApp() {
  if (!_codigoWarnActual) return;
  const msg = encodeURIComponent(
    'Hola Noel, mi código de activación para PK-GEOLOC es: ' + _codigoWarnActual
  );
  window.open('https://wa.me/?text=' + msg, '_blank');
}

function _mostrarApp() {
  document.getElementById('accessWall').style.display = 'none';
  document.getElementById('appContent').style.display = 'block';
}

/* ── Forçar actualització de l'app (buida caché SW + reload) ── */
async function _forzarActualizacion() {
  const btn = document.getElementById('btnForceUpdate');
  btn.textContent = '⏳ Actualizando...';
  btn.style.pointerEvents = 'none';
  btn.style.color = '#F5A623';
  btn.style.borderColor = 'rgba(245,166,35,.4)';

  try {
    /* 1. Dile al Service Worker activo que tome el control inmediatamente */
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          await new Promise(r => setTimeout(r, 800));
        }
      }
    }

    /* 2. Borra todas las cachés de la app */
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }

    /* 3. Recarga forzada desde red */
    btn.textContent = '✅ Recargando...';
    btn.style.color = '#22D97A';
    await new Promise(r => setTimeout(r, 600));
    location.reload(true);

  } catch (e) {
    btn.textContent = '🔄 ACTUALIZAR APP';
    btn.style.pointerEvents = 'auto';
    btn.style.color = '#FF5A6E';
    btn.style.borderColor = 'rgba(255,90,110,.4)';
    setTimeout(() => {
      btn.style.color = '#8A909E';
      btn.style.borderColor = 'rgba(255,255,255,.15)';
    }, 2500);
  }
}

/* ── Comprovació automàtica en carregar (si ja hi ha sessió guardada) ── */
(async function comprobarSesionGuardada() {
  try {
    await _licenciasCargadasPromise;
    const session = JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
    if (!session?.codigo || !session?.caducidad || !session?.deviceId) return;

    const hoy = new Date().toISOString().slice(0, 10);

    /* Caducada? */
    if (hoy > session.caducidad) {
      localStorage.removeItem(LS_SESSION);
      return;
    }

    /* El codi segueix al diccionari i vigent? */
    const caducidadActual = licenciasPiloto[session.codigo];
    if (!caducidadActual || hoy > caducidadActual) {
      localStorage.removeItem(LS_SESSION);
      return;
    }

    /* El deviceId d'aquesta sessió coincideix amb el del dispositiu actual? */
    const deviceIdActual = localStorage.getItem(LS_DEVICE) || null;
    if (!deviceIdActual || deviceIdActual !== session.deviceId) {
      localStorage.removeItem(LS_SESSION);
      return;
    }

    /* Tot OK → obre l'app directament */
    _mostrarApp();
  } catch (_) {
    localStorage.removeItem(LS_SESSION);
  }
})();
