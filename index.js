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

const stores = loadStores();

if (process.env.TN_STORE_ID && process.env.TN_ACCESS_TOKEN) {
  stores[String(process.env.TN_STORE_ID)] = {
    access_token: process.env.TN_ACCESS_TOKEN,
    store_id: String(process.env.TN_STORE_ID),
    connected_at: new Date().toISOString(),
    config: {},
    source: 'env',
  };
}

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
    install_spring: CLIENT_ID
      ? `${APP_URL}/auth/install?store=spring29.mitiendanube.com`
      : null,
  });
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

  const params = new URLSearchParams();
  if (req.query.state) {
    params.set('state', String(req.query.state));
  }

  const query = params.toString();
  const storeDomain = (req.query.store || req.query.domain || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  // Instalar en una tienda específica (recomendado para tienda demo del Partner Portal)
  if (storeDomain) {
    if (!/^[a-z0-9-]+\.mitiendanube\.com$/i.test(storeDomain)) {
      return res.status(400).json({
        error: 'Dominio de tienda inválido',
        example: `${APP_URL}/auth/install?store=springdemo.mitiendanube.com`,
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

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  const storeIdFromQuery = req.query.store_id ? String(req.query.store_id) : null;

  if (!code) {
    return res.status(400).send('Falta el parámetro code');
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send('OAuth no configurado: faltan CLIENT_ID o CLIENT_SECRET');
  }

  try {
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
      console.error('Error obteniendo token:', tokenData);
      return res.status(500).send('Error al obtener el token de Tiendanube');
    }

    const storeId = String(tokenData.user_id || storeIdFromQuery);
    if (!storeId) {
      return res.status(500).send('No se pudo determinar el store_id');
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

    console.log(`Tienda ${storeId} conectada correctamente`);

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Conectado</title>
        <style>
          body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #FAF9F6; }
          .card { background: white; border-radius: 20px; padding: 2.5rem; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 380px; }
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
          <p style="margin-top:1rem; font-size:0.78rem; color:#aaa;">Podés cerrar esta ventana y volver a tu tienda.</p>
        </div>
      </body>
      </html>
    `);
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
  const storeId = String(req.params.store_id);
  if (!stores[storeId]) {
    return res.status(404).json({ error: 'Tienda no conectada' });
  }

  stores[storeId].config = { ...stores[storeId].config, ...req.body };
  saveStores(stores);
  res.json({ ok: true, config: stores[storeId].config });
});

app.get('/config/:store_id', (req, res) => {
  const storeId = String(req.params.store_id);
  if (!stores[storeId]) {
    return res.status(404).json({ error: 'Tienda no conectada' });
  }

  res.json(stores[storeId].config || {});
});

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
