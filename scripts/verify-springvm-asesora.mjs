#!/usr/bin/env node
/**
 * Verifica carga del widget Asesora en springvm.com.ar (store 6125057).
 */
import { chromium } from 'playwright';

const STORE_URL = process.env.STORE_URL || 'https://www.springvm.com.ar/';
const INJECT_LEGACY = process.env.INJECT_LEGACY === '1';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const requests = [];

  page.on('request', (req) => {
    const url = req.url();
    if (/asesora|railway\.app\/widget|asesor-virtual|apps-scripts.*asesor/i.test(url)) {
      requests.push(url);
    }
  });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(STORE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.mouse.wheel(0, 800);
  await page.mouse.click(400, 400);
  await page.waitForTimeout(4000);

  if (INJECT_LEGACY) {
    await page.addScriptTag({
      url: 'https://asesora-moda-backend-production.up.railway.app/widget/asesora.js',
    });
    await page.waitForTimeout(2000);
  }

  const result = await page.evaluate(() => {
    const trigger = document.getElementById('asesora-moda-trigger');
    const nubeBtn = document.querySelector('[data-nubesdk-slot="corner_bottom_right"] button, nubesdk-slot[type="corner_bottom_right"] button');
    return {
      legacyTrigger: trigger
        ? { id: trigger.id, text: trigger.textContent?.trim() }
        : null,
      nubeButton: nubeBtn
        ? { text: nubeBtn.textContent?.trim() }
        : null,
      htmlScripts: Array.from(document.querySelectorAll('script[src]'))
        .map((s) => s.src)
        .filter((src) => /asesora|asesor-virtual|railway.*widget/i.test(src)),
    };
  });

  await browser.close();

  console.log(JSON.stringify({
    store_url: STORE_URL,
    inject_legacy: INJECT_LEGACY,
    network_requests: requests,
    console_errors: consoleErrors.filter((e) => /asesora|nube/i.test(e)),
    dom: result,
    ok: Boolean(result.legacyTrigger || result.nubeButton),
  }, null, 2));

  if (!result.legacyTrigger && !result.nubeButton && !INJECT_LEGACY) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error('[verify-springvm]', err.message);
  process.exit(1);
});
