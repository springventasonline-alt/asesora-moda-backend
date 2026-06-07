#!/usr/bin/env node
/**
 * Diagnóstico profundo: red + consola tras interacción en springvm.
 */
import { chromium } from 'playwright';

const STORE_URL = process.env.STORE_URL || 'https://www.springvm.com.ar/';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const requests = [];

  page.on('request', (req) => requests.push({ url: req.url(), type: req.resourceType() }));
  page.on('console', (msg) => {
    if (/asesora|nube|7169|error/i.test(msg.text())) {
      console.log('[console]', msg.type(), msg.text());
    }
  });

  await page.goto(STORE_URL, { waitUntil: 'networkidle', timeout: 90000 });
  for (let i = 0; i < 5; i += 1) {
    await page.mouse.wheel(0, 600);
    await page.mouse.click(200 + i * 50, 300);
    await page.waitForTimeout(1500);
  }

  const interesting = requests
    .map((r) => r.url)
    .filter((u) => /apps-scripts|asesora|nube|railway|desbloquear|7169|33646/i.test(u));

  const dom = await page.evaluate(() => ({
    scriptLoader: typeof window.scriptLoaderService !== 'undefined',
    nubeSDK: typeof window.nubeSDK !== 'undefined',
    slots: Array.from(document.querySelectorAll('[data-nubesdk-slot="corner_bottom_right"], nubesdk-slot[type="corner_bottom_right"]'))
      .map((el) => el.innerHTML?.slice(0, 200)),
    trigger: document.getElementById('asesora-moda-trigger')?.textContent?.trim() || null,
  }));

  await browser.close();
  console.log(JSON.stringify({ interesting, dom, total_requests: requests.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
