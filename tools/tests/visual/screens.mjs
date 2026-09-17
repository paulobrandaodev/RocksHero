// Capturas de tela das principais telas (modo local), em desktop e celular.
// Uso: node tests/visual/screens.mjs <pasta-de-saída> [desktop|mobile|all]
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { startServer } from '../e2e/server.mjs';

const outDir = process.argv[2];
const which = process.argv[3] || 'all';
await mkdir(outDir, { recursive: true });
const { server, url } = await startServer();
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });

const VIEWPORTS = {
  desktop: { width: 1366, height: 860, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  if (which !== 'all' && which !== name) continue;
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  const problems = [];
  page.on('console', (m) => { if (['error', 'warn'].includes(m.type())) problems.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`[requestfailed] ${r.url()}`));
  const shot = async (label) => {
    await sleep(350);
    await page.screenshot({ path: join(outDir, `${name}-${label}.png`) });
  };

  await page.goto(url, { waitUntil: 'networkidle0' });
  await shot('01-login');
  await page.type('#login-password', 'Hero@123');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#app:not([hidden]) .song-row', { timeout: 10000 });
  await sleep(900);
  // fecha o "Quem é você?" escolhendo o guitarrista
  const pick = await page.$('[data-pick="m-guitarra"]');
  if (pick) await pick.click();
  await sleep(500);
  await shot('02-catalogo-gh1');

  await page.evaluate(() => {
    const s = RH.store;
    const ids = ['deep-purple--smoke-on-the-water', 'black-sabbath--iron-man', 'boston--more-than-a-feeling', 'ozzy-osbourne--bark-at-the-moon', 'nirvana--heart-shaped-box'];
    ids.forEach((id, i) => {
      s.addToSetlist(id);
      ['m-vocal', 'm-guitarra', 'm-baixo', 'm-bateria'].forEach((m, j) => s.setProgress(id, m, Math.min(100, (i + 1) * 15 + j * 10)));
    });
    s.setOverride('deep-purple--smoke-on-the-water', 'tun', 'E');
    s.setOverride('deep-purple--smoke-on-the-water', 'ins', 'vgbdk');
    s.setOverride('black-sabbath--iron-man', 'tun', 'Eb');
    s.setOverride('black-sabbath--iron-man', 'ins', 'vgbd');
    s.setOverride('nirvana--heart-shaped-box', 'tun', 'dropD');
    s.setOverride('nirvana--heart-shaped-box', 'ins', 'vgbd');
  });
  await sleep(600);
  await shot('03-catalogo-com-progresso');

  await page.click('.song-row[data-id="deep-purple--smoke-on-the-water"]');
  await sleep(500);
  await shot('04-painel-musica');
  await page.keyboard.press('Escape');
  await sleep(300);

  await page.evaluate(() => { location.hash = '#/musicas/todas'; });
  await page.waitForFunction(() => document.querySelectorAll('.song-row').length > 700, { timeout: 15000 });
  await shot('05-todas');

  await page.evaluate(() => { location.hash = '#/setlist'; });
  await page.waitForSelector('.sl-item');
  await shot('06-setlist');
  await page.screenshot({ path: join(outDir, `${name}-06b-setlist-full.png`), fullPage: true });

  await page.evaluate(() => { location.hash = '#/banda'; });
  await page.waitForSelector('.member-card');
  await shot('07-banda');
  await page.screenshot({ path: join(outDir, `${name}-07b-banda-full.png`), fullPage: true });

  console.log(`${name}: ${problems.length ? `\n  ${problems.join('\n  ')}` : 'sem erros de console'}`);
  await ctx.close();
}

await browser.close();
server.close();
