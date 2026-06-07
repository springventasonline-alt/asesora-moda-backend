#!/usr/bin/env node
/**
 * Captura PARTNER_BEARER_TOKEN desde Chrome y publica asesora-nube.min.js en script #7169.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDGET = path.resolve(__dirname, '../public/widget/asesora-nube.min.js');
const APP_ID = '33646';
const SCRIPT_ID = '7169';
const ECOSYSTEM_BASE = `https://services-ecosystem.ms.tiendanube.com/apps/${APP_ID}/scripts/${SCRIPT_ID}`;
const PORTAL_SCRIPT_URL = `https://partners.tiendanube.com/applications/details/${APP_ID}/script/${SCRIPT_ID}`;
const DEV_WIDGET_URL = 'https://asesora-moda-backend-production.up.railway.app/widget/asesora-nube.min.js';

const CHROME_PROFILES = [
  path.join(process.env.HOME || '', 'Library/Application Support/Google/Chrome/Default'),
  path.join(process.env.HOME || '', 'Library/Application Support/Google/Chrome/Profile 1'),
  path.join(process.env.HOME || '', 'Library/Application Support/Arc/User Data/Default'),
];

async function publishWithToken(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const body = new FormData();
  const blob = new Blob([fs.readFileSync(WIDGET)], { type: 'application/javascript' });
  body.append('file', blob, 'asesora-nube.min.js');

  const upload = await fetch(`${ECOSYSTEM_BASE}/versions`, { method: 'POST', headers, body });
  const uploadText = await upload.text();
  if (!upload.ok) {
    throw new Error(`Upload ${upload.status}: ${uploadText.slice(0, 400)}`);
  }

  let version;
  try {
    version = JSON.parse(uploadText);
  } catch {
    version = {};
  }
  const versionId = version?.id ?? version?.data?.id ?? null;

  const patchBody = versionId ? { activeVersionId: versionId } : { installLatest: true };
  const activate = await fetch(ECOSYSTEM_BASE, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(patchBody),
  });
  const activateText = await activate.text();
  if (!activate.ok) {
    throw new Error(`Activate ${activate.status}: ${activateText.slice(0, 400)}`);
  }

  return {
    version_id: versionId,
    upload: uploadText.slice(0, 300),
    activate: activateText.slice(0, 300),
    widget_url: DEV_WIDGET_URL,
  };
}

async function captureBearer(page) {
  let bearer = null;
  page.on('request', (req) => {
    const url = req.url();
    if (!url.includes('services-ecosystem.ms.tiendanube.com')) return;
    const auth = req.headers().authorization || req.headers().Authorization;
    if (auth && auth.startsWith('Bearer ')) {
      bearer = auth.slice(7);
    }
  });

  console.log('[capture] Navegando al Partner Portal…');
  await page.goto(PORTAL_SCRIPT_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

  for (let i = 0; i < 120; i += 1) {
    await page.waitForTimeout(1000);
    if (bearer) break;
    const url = page.url();
    if (url.includes(`script/${SCRIPT_ID}`) && !url.includes('login')) {
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }

  return bearer;
}

async function tryPersistentProfile(profilePath) {
  if (!fs.existsSync(profilePath)) return null;
  console.log('[capture] Probando perfil:', profilePath);
  let context;
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      headless: true,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
    });
    const page = context.pages()[0] || (await context.newPage());
    const bearer = await captureBearer(page);
    await context.close();
    return bearer;
  } catch (err) {
    console.warn('[capture] Perfil falló:', err.message);
    if (context) await context.close().catch(() => {});
    return null;
  }
}

async function main() {
  if (!fs.existsSync(WIDGET)) {
    throw new Error(`No existe ${WIDGET} — corré: cd nube-widget && npm run build`);
  }

  let bearer = process.env.PARTNER_BEARER_TOKEN || null;

  if (!bearer) {
    for (const profile of CHROME_PROFILES) {
      bearer = await tryPersistentProfile(profile);
      if (bearer) break;
    }
  }

  if (!bearer) {
    throw new Error(
      'No se capturó PARTNER_BEARER_TOKEN. Logueate en partners.tiendanube.com o exportá PARTNER_BEARER_TOKEN=eyJ…',
    );
  }

  console.log('[capture] Bearer OK (len=%d)', bearer.length);
  const result = await publishWithToken(bearer);
  console.log('[publish] OK', JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('[capture/publish]', err.message);
  process.exit(1);
});
