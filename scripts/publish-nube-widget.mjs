#!/usr/bin/env node
/**
 * Publica asesora-nube.min.js en script #7169 (app 33646) vía Partner Portal UI.
 * Requiere sesión activa en partners.tiendanube.com.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDGET = path.resolve(__dirname, '../public/widget/asesora-nube.min.js');
const PORTAL_URL = 'https://partners.tiendanube.com/applications/details/33646/script/7169';
const DEV_URL = 'https://asesora-moda-backend-production.up.railway.app/widget/asesora-nube.min.js';

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 40 });
  const page = await browser.newPage();
  let bearer = process.env.PARTNER_BEARER_TOKEN || null;

  page.on('request', (req) => {
    if (bearer) return;
    if (!req.url().includes('services-ecosystem.ms.tiendanube.com')) return;
    const auth = req.headers().authorization || req.headers().Authorization;
    if (auth?.startsWith('Bearer ')) bearer = auth.slice(7);
  });

  console.log('[publish] Partner Portal script 7169 — logueate si hace falta…');
  await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

  for (let i = 0; i < 120; i += 1) {
    await page.waitForTimeout(1000);
    if (page.url().includes('script/7169') && !page.url().includes('login')) break;
  }

  const devInput = page.locator('input[type="url"], input[placeholder*="localhost"], input[name*="development"]').first();
  if (await devInput.isVisible().catch(() => false)) {
    await devInput.fill(DEV_URL);
    console.log('[publish] Dev URL:', DEV_URL);
  }

  await page.getByRole('button', { name: /agregar versi[oó]n/i }).first().click({ timeout: 30000 });
  await page.locator('input[type="file"]').first().setInputFiles(WIDGET);
  console.log('[publish] Subido:', WIDGET);
  await page.waitForTimeout(5000);

  const installBtn = page.getByRole('button', { name: /instalar en las tiendas/i }).first();
  if (await installBtn.isVisible().catch(() => false)) {
    await installBtn.click();
    console.log('[publish] Instalar en las tiendas');
    await page.waitForTimeout(5000);
  }

  const saveBtn = page.getByRole('button', { name: /guardar cambios/i }).first();
  if (await saveBtn.isVisible().catch(() => false)) {
    await saveBtn.click();
    console.log('[publish] Guardar cambios');
    await page.waitForTimeout(3000);
  }

  if (bearer) console.log('[publish] Bearer capturado len=%d', bearer.length);
  console.log('[publish] DONE');
  await browser.close();
}

main().catch((err) => {
  console.error('[publish]', err.message);
  process.exit(1);
});
