require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

const CLIENT_ID = (process.env.TIENDANUBE_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.TIENDANUBE_CLIENT_SECRET || '').trim();
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const USER_AGENT = process.env.TIENDANUBE_USER_AGENT || 'AsesoraModa/1.0 (soporte@asesoramoda.com)';
const STORES_FILE = path.join(__dirname, 'data', 'stores.json');
const CONFIGS_FILE = path.join(__dirname, 'data', 'configs.json');
const ADMIN_PANEL_FILE = path.join(__dirname, 'public', 'admin', 'index.html');
const TN_SCRIPT_ID = (process.env.TN_SCRIPT_ID || '7169').trim();
const TN_SCRIPT_AUTO_INSTALL = process.env.TN_SCRIPT_AUTO_INSTALL !== 'false';
const INSTALL_SECRET = (process.env.INSTALL_SECRET || '').trim();
const SETUP_KEY = (process.env.SETUP_KEY || 'springdemo-7793118-setup').trim();
const DEMO_STORE_ID = '7793118';
const DEMO_STORE_DOMAIN = 'springdemo.mitiendanube.com';

const stores = loadStores();
hydrateStoresFromEnv(stores);

app.set('trust proxy', 1);

const PUBLIC_DIR = path.join(__dirname, 'public');
const WIDGET_DIR = path.join(PUBLIC_DIR, 'widget');

function setPublicAssetHeaders(res, filePath) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (filePath && filePath.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  }
}

function isPublicAssetPath(pathname) {
  return (
    pathname === '/widget' ||
    pathname.startsWith('/widget/') ||
    pathname === '/public' ||
    pathname.startsWith('/public/')
  );
}

// Archivos públicos ANTES de CORS — accesibles desde cualquier tienda Tiendanube
app.use('/widget', express.static(WIDGET_DIR, { setHeaders: setPublicAssetHeaders }));
app.use('/public', express.static(PUBLIC_DIR, { setHeaders: setPublicAssetHeaders }));

app.options(['/widget', '/widget/*', '/public', '/public/*'], (req, res) => {
  setPublicAssetHeaders(res);
  res.sendStatus(204);
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    listenPort: Number(process.env.PORT) || 3000,
    stores: Object.keys(stores).length,
    oauthConfigured: Boolean(CLIENT_ID && CLIENT_SECRET),
    clientIdValid: /^\d+$/.test(CLIENT_ID),
  });
});

const allowedOrigins = (process.env.FRONTEND_URL || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const apiCors = cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

app.use((req, res, next) => {
  if (isPublicAssetPath(req.path)) return next();
  return apiCors(req, res, next);
});
app.use(express.json());

app.get('/admin', (req, res) => {
  if (!fs.existsSync(ADMIN_PANEL_FILE)) {
    return res.status(404).json({ error: 'Panel admin no encontrado' });
  }
  res.sendFile(ADMIN_PANEL_FILE);
});

app.get('/widget/install', (req, res) => {
  res.json({
    script_url: `${APP_URL}/widget/asesora.js`,
    popup_url: `${APP_URL}/widget/popup.html`,
    oauth_install: `${APP_URL}/auth/install`,
    health: `${APP_URL}/health`,
  });
});

app.get('/', (req, res) => {
  res.json({
    status: 'Asesora de Moda Backend funcionando',
    stores_conectadas: Object.keys(stores).length,
    install_url: CLIENT_ID ? `${APP_URL}/auth/install` : null,
    install_demo: CLIENT_ID
      ? `${APP_URL}/auth/install?store=springdemo.mitiendanube.com`
      : null,
    install_demo_guide: `${APP_URL}/auth/demo`,
    install_spring: CLIENT_ID
      ? `${APP_URL}/auth/install?store=spring29.mitiendanube.com`
      : null,
    admin_panel: `${APP_URL}/admin?store=6125057`,
    config_api: `${APP_URL}/config/:store_id`,
  });
});

app.get('/auth/status', (req, res) => {
  res.json({
    connected_stores: Object.keys(stores).map((id) => ({
      store_id: id,
      source: stores[id].source || null,
      connected_at: stores[id].connected_at || null,
      scope: stores[id].scope || null,
    })),
    script_id: TN_SCRIPT_ID,
  });
});

app.post('/auth/setup-scripts', async (req, res) => {
  const results = [];
  for (const [storeId, store] of Object.entries(stores)) {
    if (!store.access_token) continue;
    try {
      const script = await associateScriptWithStore(storeId, store.access_token);
      results.push({ store_id: storeId, ok: true, script });
    } catch (err) {
      results.push({ store_id: storeId, ok: false, error: err.message });
    }
  }
  res.json({ results });
});

app.get('/auth/demo', (req, res) => {
  const installUrl = `${APP_URL}/auth/install?store=${DEMO_STORE_DOMAIN}`;
  const directAuthorizeUrl = `https://${DEMO_STORE_DOMAIN}/admin/apps/${CLIENT_ID}/authorize`;
  res.type('html').send(renderInstallGuideHtml({ installUrl, directAuthorizeUrl }));
});

app.get('/auth/install', (req, res) => {
  if (!CLIENT_ID) {
    return res.status(500).json({ error: 'Falta TIENDANUBE_CLIENT_ID en variables de entorno' });
  }

  if (!/^\d+$/.test(CLIENT_ID)) {
    return res.status(500).json({
      error: 'TIENDANUBE_CLIENT_ID inválido',
      hint: 'Debe ser solo números, sin espacios. Revisá la variable en Railway.',
      received: CLIENT_ID,
    });
  }

  if (req.query.help === '1' || req.query.guide === '1') {
    const storeDomain = normalizeStoreDomain(req.query.store || DEMO_STORE_DOMAIN);
    const installUrl = `${APP_URL}/auth/install?store=${storeDomain}`;
    const directAuthorizeUrl = `https://${storeDomain}/admin/apps/${CLIENT_ID}/authorize`;
    return res.type('html').send(renderInstallGuideHtml({ installUrl, directAuthorizeUrl, storeDomain }));
  }

  const params = new URLSearchParams();
  if (req.query.state) {
    params.set('state', String(req.query.state));
  }

  const query = params.toString();
  const storeDomain = normalizeStoreDomain(req.query.store || req.query.domain || '');

  // Instalar en una tienda específica (recomendado para tienda demo del Partner Portal)
  if (storeDomain) {
    if (!/^[a-z0-9-]+\.mitiendanube\.com$/i.test(storeDomain)) {
      return res.status(400).json({
        error: 'Dominio de tienda inválido',
        example: `${APP_URL}/auth/install?store=springdemo.mitiendanube.com`,
        guide: `${APP_URL}/auth/demo`,
      });
    }

    const authorizeUrl = `https://${storeDomain}/admin/apps/${CLIENT_ID}/authorize${query ? `?${query}` : ''}`;
    console.log(`OAuth install (tienda ${storeDomain}) → ${authorizeUrl}`);
    return res.redirect(302, authorizeUrl);
  }

  const authorizeUrl = `https://www.tiendanube.com/apps/${CLIENT_ID}/authorize${query ? `?${query}` : ''}`;

  console.log(`OAuth install → ${authorizeUrl}`);
  res.redirect(302, authorizeUrl);
});

app.get('/auth/exchange', async (req, res) => {
  const code = req.query.code ? String(req.query.code) : '';
  if (!code) {
    return res.status(400).json({
      error: 'Falta ?code= del callback OAuth',
      hint: 'Copiá el code de la URL después de autorizar la app (vence en 5 minutos)',
      demo_guide: `${APP_URL}/auth/demo`,
    });
  }

  try {
    const result = await connectStoreFromOAuthCode(code);
    res.json(result);
  } catch (err) {
    console.error('Error en /auth/exchange:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/auth/register-token', async (req, res) => {
  const setupKey = String(req.body?.key || req.headers['x-setup-key'] || '').trim();
  const secret = req.headers['x-install-secret'] || req.body?.secret || '';
  const allowedByInstallSecret = INSTALL_SECRET && secret === INSTALL_SECRET;
  const allowedBySetupKey = SETUP_KEY && setupKey === SETUP_KEY;

  if (!allowedByInstallSecret && !allowedBySetupKey) {
    if (!INSTALL_SECRET && !SETUP_KEY) {
      return res.status(501).json({
        error: 'Endpoint deshabilitado',
        hint: 'Configurá INSTALL_SECRET o SETUP_KEY en Railway para registrar tokens manualmente',
      });
    }
    return res.status(403).json({ error: 'Secret inválido' });
  }

  const storeId = String(req.body?.store_id || '').trim();
  const accessToken = String(req.body?.access_token || '').trim();
  if (!storeId || !accessToken) {
    return res.status(400).json({ error: 'Faltan store_id y access_token' });
  }

  try {
    const result = await connectStoreFromAccessToken(storeId, accessToken, 'manual');
    res.json(result);
  } catch (err) {
    console.error('Error en /auth/register-token:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code ? String(req.query.code) : '';

  if (!code) {
    return res.status(400).send('Falta el parámetro code');
  }

  try {
    const result = await connectStoreFromOAuthCode(code);
    res.send(renderConnectedHtml(result.store_id, result.script));
  } catch (err) {
    console.error('Error en /auth/callback:', err);
    res.status(500).send(`Error interno: ${err.message}`);
  }
});

app.get('/productos/:store_id', async (req, res) => {
  const { store_id } = req.params;
  const { tipo_cuerpo, estilo, altura } = req.query;

  const store = stores[String(store_id)];
  if (!store) {
    return res.status(404).json({
      error: 'Tienda no conectada',
      store_id,
      hint: 'Instalá la app con GET /auth/install o configurá TN_STORE_ID + TN_ACCESS_TOKEN',
    });
  }

  try {
    const productsRes = await fetch(
      `https://api.tiendanube.com/v1/${store_id}/products?per_page=200&published=true`,
      {
        headers: {
          Authentication: `bearer ${store.access_token}`,
          'User-Agent': USER_AGENT,
        },
      }
    );

    if (!productsRes.ok) {
      const detail = await productsRes.text();
      console.error('Error API Tiendanube:', detail);
      return res.status(productsRes.status).json({
        error: 'Error al obtener productos de Tiendanube',
        detail,
      });
    }

    const allProducts = await productsRes.json();
    const filtered = filterByProfile(allProducts, { tipo_cuerpo, estilo, altura });

    const formatted = filtered.map((product) => ({
      id: product.id,
      name: product.name?.es || product.name,
      price: formatPrice(product.variants?.[0]?.price || product.price),
      image: product.images?.[0]?.src || null,
      url: product.canonical_url || product.permalink || null,
      tags: product.tags || '',
      category: inferCategory(product.tags || '', product.name?.es || product.name || ''),
    }));

    res.json({
      store_id,
      perfil: { tipo_cuerpo, estilo, altura },
      tags_buscados: buildTags({ tipo_cuerpo, estilo, altura }),
      total: formatted.length,
      productos: formatted,
    });
  } catch (err) {
    console.error('Error en /productos:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/config/:store_id', (req, res) => {
  const storeId = String(req.params.store_id).trim();
  if (!storeId) {
    return res.status(400).json({ error: 'store_id inválido' });
  }

  const merged = setConfigForStore(storeId, req.body || {});
  res.json({ ok: true, store_id: storeId, config: merged });
});

app.get('/config/:store_id', (req, res) => {
  const storeId = String(req.params.store_id).trim();
  if (!storeId) {
    return res.status(400).json({ error: 'store_id inválido' });
  }

  res.set('Cache-Control', 'public, max-age=30');
  res.json(getConfigForStore(storeId));
});

function loadConfigs() {
  try {
    if (fs.existsSync(CONFIGS_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIGS_FILE, 'utf8'));
    }
  } catch (err) {
    console.warn('No se pudo leer configs.json:', err.message);
  }
  return {};
}

function saveConfigsFile(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIGS_FILE), { recursive: true });
    fs.writeFileSync(CONFIGS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('No se pudo persistir configs.json:', err.message);
  }
}

function getDefaultConfig() {
  return {
    advisor_name: 'Valentina',
    advisor_role: 'Tu asesora de moda',
    trigger_text: '✨ Encontrá tu look',
    welcome_msg: '¡Hola! 👋 Te ayudo a encontrar exactamente lo que más te favorece según tu cuerpo y estilo.',
    welcome_msg2: 'Solo te hago unas preguntas rápidas y te armo una selección personalizada 🎯',
    cta_text: '¡Empezar mi asesoramiento! →',
    color_primary: '#1A1A2E',
    color_accent: '#C8956C',
    font: 'Cormorant Garamond',
    show_video: true,
    show_popup: true,
    show_price: true,
    new_tab: true,
  };
}

function getConfigForStore(storeId) {
  const configs = loadConfigs();
  const fromFile = configs[storeId] || {};
  const fromStore = stores[storeId]?.config || {};
  return { ...getDefaultConfig(), ...fromStore, ...fromFile };
}

function setConfigForStore(storeId, patch) {
  const configs = loadConfigs();
  const current = getConfigForStore(storeId);
  const merged = { ...current, ...patch, updated_at: new Date().toISOString() };

  configs[storeId] = merged;
  saveConfigsFile(configs);

  if (stores[storeId]) {
    stores[storeId].config = merged;
    saveStores(stores);
  }

  return merged;
}

function loadStores() {
  try {
    if (fs.existsSync(STORES_FILE)) {
      return JSON.parse(fs.readFileSync(STORES_FILE, 'utf8'));
    }
  } catch (err) {
    console.warn('No se pudo leer stores.json:', err.message);
  }
  return {};
}

function hydrateStoresFromEnv(target) {
  if (process.env.TN_STORE_ID && process.env.TN_ACCESS_TOKEN) {
    target[String(process.env.TN_STORE_ID)] = {
      access_token: process.env.TN_ACCESS_TOKEN,
      store_id: String(process.env.TN_STORE_ID),
      connected_at: new Date().toISOString(),
      config: {},
      source: 'env',
    };
  }

  if (process.env.TN_STORES_JSON) {
    try {
      const parsed = JSON.parse(process.env.TN_STORES_JSON);
      Object.entries(parsed).forEach(([storeId, accessToken]) => {
        if (!storeId || !accessToken) return;
        target[String(storeId)] = {
          access_token: String(accessToken),
          store_id: String(storeId),
          connected_at: new Date().toISOString(),
          config: target[String(storeId)]?.config || {},
          source: 'env_json',
        };
      });
    } catch (err) {
      console.warn('TN_STORES_JSON inválido:', err.message);
    }
  }
}

function normalizeStoreDomain(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

async function exchangeOAuthCode(code) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('OAuth no configurado: faltan CLIENT_ID o CLIENT_SECRET');
  }

  const tokenRes = await fetch('https://www.tiendanube.com/apps/authorize/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(`Error al obtener token: ${JSON.stringify(tokenData)}`);
  }

  return tokenData;
}

async function associateScriptWithStore(storeId, accessToken) {
  if (!TN_SCRIPT_ID) {
    return { skipped: true, reason: 'TN_SCRIPT_ID no configurado' };
  }

  if (TN_SCRIPT_AUTO_INSTALL) {
    return {
      ok: true,
      action: 'auto_install',
      script_id: TN_SCRIPT_ID,
      message:
        'Script con Auto instalado en Partner Portal: Tiendanube lo carga al instalar la app. No hace falta POST /scripts.',
    };
  }

  const listRes = await fetch(`https://api.tiendanube.com/v1/${storeId}/scripts`, {
    headers: {
      Authentication: `bearer ${accessToken}`,
      'User-Agent': USER_AGENT,
    },
  });

  if (listRes.ok) {
    const existing = await listRes.json();
    const alreadyLinked = Array.isArray(existing)
      && existing.some((item) => String(item.script_id || item.id) === String(TN_SCRIPT_ID));
    if (alreadyLinked) {
      return { ok: true, action: 'already_associated', script_id: TN_SCRIPT_ID };
    }
  }

  const createRes = await fetch(`https://api.tiendanube.com/v1/${storeId}/scripts`, {
    method: 'POST',
    headers: {
      Authentication: `bearer ${accessToken}`,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ script_id: Number(TN_SCRIPT_ID) }),
  });

  const createData = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    const detail = JSON.stringify(createData);
    if (
      createRes.status === 422
      && /auto installed|auto.install/i.test(detail)
    ) {
      return {
        ok: true,
        action: 'auto_install',
        script_id: TN_SCRIPT_ID,
        message: 'Script auto-instalado: Tiendanube lo gestiona sin POST /scripts.',
      };
    }
    throw new Error(`No se pudo asociar script ${TN_SCRIPT_ID}: ${detail}`);
  }

  return { ok: true, action: 'associated', script_id: TN_SCRIPT_ID, data: createData };
}

async function connectStoreFromAccessToken(storeId, accessToken, source = 'manual') {
  stores[String(storeId)] = {
    access_token: accessToken,
    store_id: String(storeId),
    connected_at: new Date().toISOString(),
    config: stores[String(storeId)]?.config || {},
    source,
  };
  saveStores(stores);

  let script = { skipped: true, reason: 'sin scope write_scripts o app no instalada' };
  try {
    script = await associateScriptWithStore(storeId, accessToken);
  } catch (err) {
    console.warn(`Script ${TN_SCRIPT_ID} no asociado en tienda ${storeId}:`, err.message);
    script = { ok: false, error: err.message };
  }

  console.log(`Tienda ${storeId} conectada (${source})`);
  return { ok: true, store_id: String(storeId), script, source };
}

async function connectStoreFromOAuthCode(code) {
  const tokenData = await exchangeOAuthCode(code);
  const storeId = String(tokenData.user_id || '');
  if (!storeId) {
    throw new Error('No se pudo determinar el store_id desde OAuth');
  }

  stores[storeId] = {
    access_token: tokenData.access_token,
    store_id: storeId,
    scope: tokenData.scope || null,
    connected_at: new Date().toISOString(),
    config: stores[storeId]?.config || {},
    source: 'oauth',
  };
  saveStores(stores);

  let script = { skipped: true };
  try {
    script = await associateScriptWithStore(storeId, tokenData.access_token);
  } catch (err) {
    console.warn(`Script ${TN_SCRIPT_ID} no asociado en tienda ${storeId}:`, err.message);
    script = { ok: false, error: err.message };
  }

  console.log(`Tienda ${storeId} conectada correctamente`);
  return { ok: true, store_id: storeId, script, scope: tokenData.scope || null };
}

function renderConnectedHtml(storeId, scriptInfo) {
  const scriptText = scriptInfo?.ok
    ? `Script #${TN_SCRIPT_ID}: ${scriptInfo.action || 'asociado'}`
    : scriptInfo?.error
      ? `Script #${TN_SCRIPT_ID}: ${scriptInfo.error}`
      : 'Script: sin cambios';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conectado</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #FAF9F6; }
    .card { background: white; border-radius: 20px; padding: 2.5rem; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 420px; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #1A1A2E; }
    p { color: #888; font-size: 0.9rem; line-height: 1.5; }
    .store-id { background: #F0EDE8; border-radius: 8px; padding: 0.4rem 0.8rem; font-size: 0.8rem; font-family: monospace; margin-top: 1rem; display: inline-block; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🎉</div>
    <h1>Tu tienda está conectada</h1>
    <p>La Asesora de Moda ya puede leer tus productos y dar recomendaciones personalizadas.</p>
    <div class="store-id">Store ID: ${storeId}</div>
    <p style="margin-top:1rem; font-size:0.78rem; color:#666;">${scriptText}</p>
    <p style="margin-top:1rem; font-size:0.78rem; color:#aaa;">Podés cerrar esta ventana y volver a tu tienda.</p>
  </div>
</body>
</html>`;
}

function renderInstallGuideHtml({ installUrl, directAuthorizeUrl, storeDomain = DEMO_STORE_DOMAIN }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Instalar en ${storeDomain}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1A1A2E; background: #FAF9F6; }
    .card { background: #fff; border-radius: 16px; padding: 1.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.06); margin-bottom: 1rem; }
    h1 { font-size: 1.4rem; margin-top: 0; }
    code, .mono { font-family: ui-monospace, monospace; background: #F0EDE8; padding: 0.15rem 0.4rem; border-radius: 6px; }
    a.button { display: inline-block; margin: 0.5rem 0.5rem 0.5rem 0; padding: 0.75rem 1rem; background: #1A1A2E; color: #fff; text-decoration: none; border-radius: 999px; }
    ol { padding-left: 1.2rem; }
    .warn { background: #FFF4E5; border-left: 4px solid #C4785A; padding: 0.75rem 1rem; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Instalar Asesora en ${storeDomain}</h1>
    <p>Store ID demo: <span class="mono">${DEMO_STORE_ID}</span>. Tiendanube <strong>no permite</strong> instalar una app en otra tienda usando el token de spring29: cada tienda necesita su propio OAuth.</p>
    <div class="warn">
      Si OAuth te manda a <strong>spring29</strong>, estás logueada en la tienda equivocada. Usá ventana privada o entrá al admin de springdemo desde el Partner Portal.
    </div>
  </div>
  <div class="card">
    <h2>Método recomendado (Partner Portal)</h2>
    <ol>
      <li>Entrá a <a href="https://partners.tiendanube.com">partners.tiendanube.com</a></li>
      <li>Apps → Asesora de Moda → verificá que la tienda demo sea <strong>springdemo</strong></li>
      <li>Partner Portal → <strong>Tiendas</strong> → springdemo → ícono ⚙️ (abre el admin de springdemo)</li>
      <li>En el admin: <strong>Mis aplicaciones</strong> → instalá la app, o usá el botón de abajo</li>
    </ol>
    <a class="button" href="${installUrl}">Instalar vía backend</a>
    <a class="button" href="${directAuthorizeUrl}" style="background:#C4785A">Abrir authorize directo</a>
  </div>
  <div class="card">
    <h2>Si ya autorizaste y tenés el code</h2>
    <p>Copiá el parámetro <code>code</code> de la URL de callback (vence en 5 min) y pegalo acá:</p>
    <p><code>${APP_URL}/auth/exchange?code=TU_CODE</code></p>
    <p>O registrá manualmente un token de springdemo con <code>POST /auth/register-token</code> si configuraste <code>INSTALL_SECRET</code> en Railway.</p>
  </div>
</body>
</html>`;
}

function saveStores(data) {
  try {
    fs.mkdirSync(path.dirname(STORES_FILE), { recursive: true });
    fs.writeFileSync(STORES_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('No se pudo persistir stores.json:', err.message);
  }
}

function buildTags({ tipo_cuerpo, estilo, altura }) {
  const tags = [];
  if (tipo_cuerpo) tags.push(`tipo-${String(tipo_cuerpo).toLowerCase()}`);
  if (estilo) tags.push(normalizeEstilo(estilo));
  if (altura) tags.push(`altura-${String(altura).toLowerCase()}`);
  return tags;
}

function normalizeTags(rawTags) {
  return String(rawTags || '')
    .toLowerCase()
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function hasAnyTag(tags, candidates) {
  return candidates.some((candidate) => tags.includes(candidate));
}

const ESTILO_ALIASES = {
  arreglada: 'elegante',
  elegante: 'elegante',
  romantica: 'romantica',
  romántica: 'romantica',
};

function normalizeEstilo(estilo) {
  const key = String(estilo || '').toLowerCase();
  return ESTILO_ALIASES[key] || key;
}

function filterByProfile(products, { tipo_cuerpo, estilo, altura }) {
  const estiloTag = normalizeEstilo(estilo);

  return products.filter((product) => {
    const tags = normalizeTags(product.tags);

    const matchesCuerpo =
      !tipo_cuerpo ||
      hasAnyTag(tags, [
        `tipo-${String(tipo_cuerpo).toLowerCase()}`,
        'todos-los-cuerpos',
        'universal',
      ]);

    const matchesEstilo =
      !estiloTag ||
      hasAnyTag(tags, [estiloTag, 'todos-los-estilos']);

    const matchesAltura =
      !altura ||
      hasAnyTag(tags, [
        `altura-${String(altura).toLowerCase()}`,
        'todas-las-alturas',
        'universal',
      ]);

    return matchesCuerpo && matchesEstilo && matchesAltura;
  });
}

function inferCategory(tags, name) {
  const text = `${tags} ${name}`.toLowerCase();
  if (text.includes('pantalon') || text.includes('jean') || text.includes('legging')) return 'pantalones';
  if (text.includes('vestido') || text.includes('mono') || text.includes('conjunto')) return 'vestidos';
  if (text.includes('remera') || text.includes('blusa') || text.includes('top') || text.includes('camisa')) {
    return 'tops';
  }
  if (text.includes('falda') || text.includes('pollera')) return 'faldas';
  if (text.includes('campera') || text.includes('abrigo') || text.includes('blazer')) return 'abrigos';
  return 'otros';
}

function formatPrice(price) {
  if (!price) return '';
  return `$${Number(price).toLocaleString('es-AR')}`;
}

app.use((err, req, res, next) => {
  if (err && String(err.message || '').includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  next(err);
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Asesora de Moda Backend en http://${HOST}:${PORT}`);
  console.log(`CLIENT_ID: ${CLIENT_ID ? (CLIENT_ID.length <= 6 ? CLIENT_ID : `${CLIENT_ID.slice(0, 3)}…`) : 'FALTA'}`);
  if (CLIENT_ID && !/^\d+$/.test(CLIENT_ID)) {
    console.warn('⚠️  TIENDANUBE_CLIENT_ID inválido — revisá espacios en Railway');
  }
  console.log(`CLIENT_SECRET: ${CLIENT_SECRET ? 'ok' : 'FALTA'}`);
  console.log(`APP_URL: ${APP_URL}`);
  console.log(`CORS: ${allowedOrigins.join(', ')}`);
});
