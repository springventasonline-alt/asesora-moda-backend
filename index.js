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
const RAILWAY_GRAPHQL_URL = 'https://backboard.railway.com/graphql/v2';
const RAILWAY_PROJECT_ID = (
  process.env.RAILWAY_PROJECT_ID || 'c6d8f12d-2f4d-4c90-8028-639da0141fd2'
).trim();
const RAILWAY_ENVIRONMENT_ID = (process.env.RAILWAY_ENVIRONMENT_ID || '').trim();
const RAILWAY_SERVICE_ID = (process.env.RAILWAY_SERVICE_ID || '').trim();
const RAILWAY_API_TOKEN = (process.env.RAILWAY_API_TOKEN || '').trim();
const RAILWAY_TOKEN = (process.env.RAILWAY_TOKEN || '').trim();
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

function isWebhookPath(pathname) {
  return (
    pathname === '/webhooks/redact-store' ||
    pathname === '/webhooks/redact-customer' ||
    pathname === '/webhooks/data-request'
  );
}

function extractStoreIdFromWebhook(body) {
  const raw = body?.store_id ?? body?.user_id;
  if (raw == null || raw === '') return null;
  return String(raw).trim();
}

function redactStoreData(storeId) {
  const id = String(storeId || '').trim();
  if (!id) return { removed: false, reason: 'missing_store_id' };

  let removedStore = false;
  if (stores[id]) {
    delete stores[id];
    saveStores(stores);
    removedStore = true;
  }

  const configs = loadConfigs();
  let removedConfig = false;
  if (configs[id]) {
    delete configs[id];
    saveConfigsFile(configs);
    removedConfig = true;
  }

  return { removed: removedStore || removedConfig, removedStore, removedConfig, store_id: id };
}

function handleLgpdWebhook(req, res, event) {
  const storeId = extractStoreIdFromWebhook(req.body);
  console.log(`[webhook:${event}]`, { store_id: storeId, body: req.body });

  let redaction = null;
  if (event === 'store/redact' && storeId) {
    redaction = redactStoreData(storeId);
  }

  res.status(200).json({ ok: true, event, store_id: storeId, redaction });
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
    railway: {
      project_id: RAILWAY_PROJECT_ID || null,
      environment_id: RAILWAY_ENVIRONMENT_ID || null,
      service_id: RAILWAY_SERVICE_ID || null,
      has_api_token: Boolean(RAILWAY_API_TOKEN),
      has_project_token: Boolean(RAILWAY_TOKEN),
    },
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
  if (isPublicAssetPath(req.path) || isWebhookPath(req.path)) return next();
  return apiCors(req, res, next);
});
app.use(express.json());

app.post('/webhooks/redact-store', (req, res) => {
  handleLgpdWebhook(req, res, 'store/redact');
});

app.post('/webhooks/redact-customer', (req, res) => {
  handleLgpdWebhook(req, res, 'customers/redact');
});

app.post('/webhooks/data-request', (req, res) => {
  handleLgpdWebhook(req, res, 'customers/data_request');
});

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
    webhooks: {
      redact_store: `${APP_URL}/webhooks/redact-store`,
      redact_customer: `${APP_URL}/webhooks/redact-customer`,
      data_request: `${APP_URL}/webhooks/data-request`,
    },
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

app.get('/auth/store-scripts/:store_id', async (req, res) => {
  const storeId = String(req.params.store_id || '').trim();
  const store = stores[storeId];
  if (!store?.access_token) {
    return res.status(404).json({ error: 'Tienda no conectada', store_id: storeId });
  }

  try {
    const scripts = await listStoreScriptsFromApi(storeId, store.access_token);
    res.json({
      store_id: storeId,
      script_id: TN_SCRIPT_ID,
      total: scripts.length,
      scripts,
      asesora_active: scripts.some(
        (item) => String(item.id || item.script_id) === String(TN_SCRIPT_ID),
      ),
    });
  } catch (err) {
    res.status(502).json({ error: err.message, store_id: storeId });
  }
});

app.post('/auth/associate-script/:store_id', async (req, res) => {
  const storeId = String(req.params.store_id || '').trim();
  const store = stores[storeId];
  if (!store?.access_token) {
    return res.status(404).json({ error: 'Tienda no conectada', store_id: storeId });
  }

  try {
    const script = await associateScriptWithStore(storeId, store.access_token);
    res.json({ ok: true, store_id: storeId, script });
  } catch (err) {
    res.status(502).json({ ok: false, store_id: storeId, error: err.message });
  }
});

function getPartnerAuthTokens() {
  const tokens = [];
  const partnerBearer = (process.env.PARTNER_BEARER_TOKEN || '').trim();
  if (partnerBearer) tokens.push({ label: 'partner_bearer', value: partnerBearer });
  if (CLIENT_SECRET) tokens.push({ label: 'client_secret', value: CLIENT_SECRET });
  return tokens;
}

async function publishNubeWidgetToPartnerPortal() {
  const widgetPath = path.join(WIDGET_DIR, 'asesora-nube.min.js');
  const ecosystemBase = `https://services-ecosystem.ms.tiendanube.com/apps/${CLIENT_ID}/scripts/${TN_SCRIPT_ID}`;
  const tokens = getPartnerAuthTokens();

  if (!tokens.length) {
    return { ok: false, error: 'Faltan PARTNER_BEARER_TOKEN o TIENDANUBE_CLIENT_SECRET' };
  }
  if (!fs.existsSync(widgetPath)) {
    return { ok: false, error: `No existe ${widgetPath}` };
  }

  const attempts = [];
  for (const token of tokens) {
    const attempt = { auth: token.label, upload: null, activate: null };
    const body = new FormData();
    const blob = new Blob([fs.readFileSync(widgetPath)], { type: 'application/javascript' });
    body.append('file', blob, 'asesora-nube.min.js');

    const uploadRes = await fetch(`${ecosystemBase}/versions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}`, 'User-Agent': USER_AGENT },
      body,
    });
    const uploadText = await uploadRes.text();
    let uploadBody = null;
    try { uploadBody = JSON.parse(uploadText); } catch { uploadBody = { raw: uploadText }; }
    attempt.upload = { status: uploadRes.status, ok: uploadRes.ok, body: uploadBody };

    if (!uploadRes.ok) {
      attempts.push(attempt);
      continue;
    }

    const versionId = uploadBody?.id ?? uploadBody?.data?.id ?? null;
    const patchRes = await fetch(ecosystemBase, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token.value}`,
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(versionId ? { activeVersionId: versionId } : { installLatest: true }),
    });
    const patchText = await patchRes.text();
    let patchBody = null;
    try { patchBody = JSON.parse(patchText); } catch { patchBody = { raw: patchText }; }
    attempt.activate = { status: patchRes.status, ok: patchRes.ok, body: patchBody };
    attempts.push(attempt);

    if (uploadRes.ok && patchRes.ok) {
      return {
        ok: true,
        auth: token.label,
        version_id: versionId,
        widget_url: `${APP_URL}/widget/asesora-nube.min.js`,
        attempts,
      };
    }
  }

  return { ok: false, error: 'No se pudo publicar asesora-nube.min.js', attempts };
}

app.get('/auth/publish-nube-widget/capabilities', (req, res) => {
  const widgetPath = path.join(WIDGET_DIR, 'asesora-nube.min.js');
  res.json({
    app_id: CLIENT_ID,
    script_id: TN_SCRIPT_ID,
    widget_path: widgetPath,
    widget_exists: fs.existsSync(widgetPath),
    widget_bytes: fs.existsSync(widgetPath) ? fs.statSync(widgetPath).size : 0,
    auth_methods: getPartnerAuthTokens().map((t) => t.label),
  });
});

app.post('/auth/publish-nube-widget', async (req, res) => {
  const setupKey = String(req.body?.key || req.headers['x-setup-key'] || req.query?.key || '').trim();
  if (setupKey !== SETUP_KEY) {
    return res.status(403).json({ error: 'Setup key inválida' });
  }

  try {
    const result = await publishNubeWidgetToPartnerPortal();
    res.status(result.ok ? 200 : 502).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
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

app.get('/auth/setup/token/:store_id', (req, res) => {
  const setupKey = String(req.query.key || req.headers['x-setup-key'] || '').trim();
  if (!SETUP_KEY || setupKey !== SETUP_KEY) {
    return res.status(403).json({ error: 'Setup key inválida' });
  }

  const storeId = String(req.params.store_id || '').trim();
  const store = stores[storeId];
  if (!store?.access_token) {
    return res.status(404).json({ error: 'Tienda no conectada o sin token', store_id: storeId });
  }

  const storesJson = {};
  Object.entries(stores).forEach(([id, entry]) => {
    if (entry?.access_token) storesJson[id] = entry.access_token;
  });

  res.json({
    store_id: storeId,
    access_token: store.access_token,
    scope: store.scope || null,
    source: store.source || null,
    connected_at: store.connected_at || null,
    tn_stores_json: JSON.stringify(storesJson),
  });
});

app.post('/auth/setup/persist-railway', async (req, res) => {
  const setupKey = String(req.query.key || req.body?.key || req.headers['x-setup-key'] || '').trim();
  if (!SETUP_KEY || setupKey !== SETUP_KEY) {
    return res.status(403).json({ error: 'Setup key inválida' });
  }

  const storesJson = buildStoresJsonFromMemory();
  if (!Object.keys(storesJson).length) {
    return res.status(404).json({
      error: 'No hay tokens OAuth en memoria',
      hint: 'Reconectá la tienda con /auth/install?store=spring29.mitiendanube.com',
    });
  }

  try {
    const result = await persistTnStoresJsonToRailway(JSON.stringify(storesJson));
    res.json({
      ok: true,
      variable: 'TN_STORES_JSON',
      stores: Object.keys(storesJson),
      ...result,
    });
  } catch (err) {
    console.error('Error en /auth/setup/persist-railway:', err);
    res.status(502).json({
      ok: false,
      error: err.message,
      tn_stores_json: JSON.stringify(storesJson),
      hint:
        'Configurá RAILWAY_API_TOKEN (account) o RAILWAY_TOKEN (project) en el servicio, o ejecutá: railway variable set TN_STORES_JSON=... --stdin',
    });
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
    trigger_text: '👗 ¿Qué me queda bien?',
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

function buildStoresJsonFromMemory() {
  const storesJson = {};
  Object.entries(stores).forEach(([id, entry]) => {
    if (entry?.access_token) storesJson[id] = entry.access_token;
  });
  return storesJson;
}

async function railwayGraphql(query, variables, auth) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth.type === 'project') {
    headers['Project-Access-Token'] = auth.token;
  } else {
    headers.Authorization = `Bearer ${auth.token}`;
  }

  const response = await fetch(RAILWAY_GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Railway GraphQL HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((item) => item.message).join('; '));
  }
  return payload.data;
}

async function resolveRailwayTargets(auth) {
  if (auth.type === 'project') {
    const data = await railwayGraphql(
      'query { projectToken { projectId environmentId } }',
      {},
      auth,
    );
    return {
      projectId: data?.projectToken?.projectId || RAILWAY_PROJECT_ID,
      environmentId: data?.projectToken?.environmentId || RAILWAY_ENVIRONMENT_ID,
      serviceId: RAILWAY_SERVICE_ID || null,
    };
  }

  return {
    projectId: RAILWAY_PROJECT_ID,
    environmentId: RAILWAY_ENVIRONMENT_ID,
    serviceId: RAILWAY_SERVICE_ID || null,
  };
}

async function persistTnStoresJsonToRailway(value) {
  const authCandidates = [];
  if (RAILWAY_API_TOKEN) authCandidates.push({ type: 'account', token: RAILWAY_API_TOKEN });
  if (RAILWAY_TOKEN) authCandidates.push({ type: 'project', token: RAILWAY_TOKEN });

  if (!authCandidates.length) {
    throw new Error('Falta RAILWAY_API_TOKEN o RAILWAY_TOKEN en variables de entorno del servicio');
  }

  let lastError = null;
  for (const auth of authCandidates) {
    try {
      const targets = await resolveRailwayTargets(auth);
      if (!targets.projectId || !targets.environmentId) {
        throw new Error('No se pudo resolver projectId/environmentId para Railway');
      }

      const input = {
        projectId: targets.projectId,
        environmentId: targets.environmentId,
        name: 'TN_STORES_JSON',
        value,
        skipDeploys: false,
      };
      if (targets.serviceId) input.serviceId = targets.serviceId;

      const data = await railwayGraphql(
        `mutation variableUpsert($input: VariableUpsertInput!) {
          variableUpsert(input: $input)
        }`,
        { input },
        auth,
      );

      return {
        auth: auth.type,
        project_id: targets.projectId,
        environment_id: targets.environmentId,
        service_id: targets.serviceId,
        variableUpsert: data?.variableUpsert ?? true,
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('No se pudo persistir TN_STORES_JSON en Railway');
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

function tiendanubeApiHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
  };
}

async function listStoreScriptsFromApi(storeId, accessToken) {
  const listRes = await fetch(
    `https://api.tiendanube.com/2025-03/${storeId}/scripts?per_page=100`,
    { headers: tiendanubeApiHeaders(accessToken) },
  );

  if (!listRes.ok) {
    const detail = await listRes.text();
    throw new Error(`No se pudo listar scripts: ${detail}`);
  }

  const data = await listRes.json();
  return Array.isArray(data) ? data : (data.result ?? []);
}

async function associateScriptWithStore(storeId, accessToken) {
  if (!TN_SCRIPT_ID) {
    return { skipped: true, reason: 'TN_SCRIPT_ID no configurado' };
  }

  const numericScriptId = Number(TN_SCRIPT_ID);
  let existingScripts = [];

  try {
    existingScripts = await listStoreScriptsFromApi(storeId, accessToken);
  } catch (err) {
    console.warn(`No se pudo listar scripts en tienda ${storeId}:`, err.message);
  }

  const linked = existingScripts.find(
    (item) => Number(item.id || item.script_id) === numericScriptId,
  );

  if (linked) {
    return {
      ok: true,
      action: 'already_active',
      script_id: TN_SCRIPT_ID,
      status: linked.status || null,
      src: linked.current_version?.src || null,
    };
  }

  const createRes = await fetch(
    `https://api.tiendanube.com/2025-03/${storeId}/scripts`,
    {
      method: 'POST',
      headers: tiendanubeApiHeaders(accessToken),
      body: JSON.stringify({
        script_id: numericScriptId,
        query_params: JSON.stringify({}),
      }),
    },
  );

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
        message: 'Script auto-instalado en Partner Portal (POST /scripts no aplica).',
        scripts_in_store: existingScripts.map((item) => ({
          id: item.id,
          name: item.name,
          status: item.status,
        })),
      };
    }
    throw new Error(`No se pudo asociar script ${TN_SCRIPT_ID}: ${detail}`);
  }

  const refreshed = await listStoreScriptsFromApi(storeId, accessToken).catch(() => []);
  const installed = refreshed.find(
    (item) => Number(item.id || item.script_id) === numericScriptId,
  );

  return {
    ok: true,
    action: 'associated',
    script_id: TN_SCRIPT_ID,
    data: createData,
    status: installed?.status || null,
    src: installed?.current_version?.src || null,
  };
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
