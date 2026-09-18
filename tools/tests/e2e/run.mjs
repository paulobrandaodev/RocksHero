// Testes de ponta a ponta: app servido como no GitHub Pages + emuladores do Firebase + Chrome.
// Pré-requisito: `npm run emulators` rodando. Uso: node tests/e2e/run.mjs
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer, root } from './server.mjs';
import { ensureUser, loadRules, resetData, DB, NS, BAND_EMAIL, BAND_PASSWORD } from '../rules/rules.test.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const artifacts = join(here, 'artifacts');
await rm(artifacts, { recursive: true, force: true });
await mkdir(artifacts, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SONG_A = 'deep-purple--smoke-on-the-water';
const SONG_B = 'black-sabbath--iron-man';
const SONG_C = 'boston--more-than-a-feeling';

const serverRead = async (path) => {
  const res = await fetch(`${DB}/rockshero/${path}.json?ns=${NS}`, { headers: { Authorization: 'Bearer owner' } });
  return res.json();
};

const waitForServer = async (path, predicate, timeout = 10000) => {
  const start = Date.now();
  let value;
  while (Date.now() - start < timeout) {
    value = await serverRead(path);
    if (predicate(value)) return value;
    await sleep(150);
  }
  throw new Error(`Servidor não chegou ao valor esperado em ${path}: ${JSON.stringify(value)}`);
};

const band = await ensureUser(BAND_EMAIL, BAND_PASSWORD);
await loadRules(band.localId);
await resetData();

const { server, url } = await startServer();
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const externalRequests = new Set();
const consoleProblems = [];

async function newDevice(label, { mobile = false } = {}) {
  const context = await browser.createBrowserContext();
  const open = async (hash = '#/musicas/gh1') => {
    const page = await context.newPage();
    await page.setViewport(mobile
      ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { width: 1280, height: 860 });
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rh:v1:ui:asked-me', '1'); } catch {} });
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:')) externalRequests.add(u); });
    page.on('console', (m) => {
      if (m.type() === 'error' && !/WebSocket|net::ERR|Failed to load resource/.test(m.text())) consoleProblems.push(`${label}: ${m.text()}`);
    });
    page.on('pageerror', (e) => consoleProblems.push(`${label}: ${e.message}`));
    await page.goto(`${url}?emulator=1${hash}`, { waitUntil: 'domcontentloaded' });
    return page;
  };
  return { context, open };
}

const login = async (page, password = BAND_PASSWORD) => {
  await page.waitForSelector('#login-password', { visible: true });
  await page.$eval('#login-password', (el) => { el.value = ''; });
  await page.type('#login-password', password);
  await page.keyboard.press('Enter');
};

const waitSynced = (page) => page.waitForFunction(() => window.RH && RH.store && RH.store.status.synced && RH.store.members().length > 0, { timeout: 15000 });

const results = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`✔ ${name} (${Date.now() - started} ms)`);
  } catch (err) {
    results.push({ name, ok: false, error: err });
    console.log(`✘ ${name}\n    ${String(err.message).slice(0, 2000).split('\n').join('\n    ')}`);
  }
}

// ---------------------------------------------------------------------------
const devA = await newDevice('A');
const devB = await newDevice('B');
let pageA;
let pageB;

await step('senha errada é recusada e Hero@123 entra', async () => {
  pageA = await devA.open();
  await login(pageA, 'hero123');
  await pageA.waitForFunction(() => /Senha errada/.test(document.querySelector('.login-msg').textContent), { timeout: 10000 });
  assert.equal(await pageA.$eval('#app', (el) => el.hidden), true);
  await login(pageA);
  await waitSynced(pageA);
  await pageA.waitForSelector('#app:not([hidden]) .song-row');
});

await step('primeiro acesso cria exatamente os 4 membros', async () => {
  const members = await waitForServer('members', (v) => v && Object.keys(v).length === 4);
  assert.deepEqual(Object.keys(members).sort(), ['m-baixo', 'm-bateria', 'm-guitarra', 'm-vocal']);
});

await step('sessão continua depois de recarregar', async () => {
  await pageA.reload({ waitUntil: 'domcontentloaded' });
  await waitSynced(pageA);
  assert.equal(await pageA.$eval('.login', (el) => el.hidden).catch(() => true), true);
});

await step('progresso editado no aparelho A aparece no B', async () => {
  pageB = await devB.open();
  await login(pageB);
  await waitSynced(pageB);
  await pageA.click(`.song-row[data-id="${SONG_A}"]`);
  await pageA.waitForSelector('.song-sheet.is-open [data-member="m-guitarra"]');
  await pageA.click('.song-sheet.is-open [data-member="m-guitarra"]');
  await pageA.click('.song-sheet.is-open [data-set="75"]');
  await waitForServer(`progress/${SONG_A}/m-guitarra`, (v) => v && v.v === 75);
  await pageB.waitForFunction((id) => {
    const row = document.querySelector(`.song-row[data-id="${id}"]`);
    return row && row.querySelector('.mbar.inst-guitarra b').textContent === '75';
  }, { timeout: 10000 }, SONG_A);
  await pageA.keyboard.press('Escape');
});

await step('observação de um músico digitada no A aparece no B', async () => {
  await pageA.click(`.song-row[data-id="${SONG_A}"]`);
  await pageA.waitForSelector('.song-sheet.is-open [data-member="m-baixo"]');
  await pageA.click('.song-sheet.is-open [data-member="m-baixo"]');
  await pageA.waitForSelector('.song-sheet.is-open [data-note]');
  await pageA.type('.song-sheet.is-open [data-note]', 'Usar palheta na ponte');
  await waitForServer(`notes/${SONG_A}/m-baixo`, (v) => v && v.v === 'Usar palheta na ponte');
  await pageA.keyboard.press('Escape');
  await pageB.click(`.song-row[data-id="${SONG_A}"]`);
  await pageB.waitForSelector('.song-sheet.is-open [data-member="m-baixo"] .mc-note');
  await pageB.click('.song-sheet.is-open [data-member="m-baixo"]');
  const text = await pageB.$eval('.song-sheet.is-open [data-note]', (el) => el.value);
  if (text !== 'Usar palheta na ponte') throw new Error(`observação no B: "${text}"`);
  await pageB.keyboard.press('Escape');
});

await step('botões do YouTube e do Spotify apontam para a busca e não abrem o painel', async () => {
  const links = await pageA.$$eval(`.song-row[data-id="${SONG_A}"] a[data-listen]`, (els) => els.map((a) => ({ href: a.href, target: a.target })));
  if (links.length !== 2) throw new Error(`esperava 2 links, veio ${links.length}`);
  if (!links[0].href.startsWith('https://www.youtube.com/results?search_query=')) throw new Error(links[0].href);
  if (!links[1].href.startsWith('https://open.spotify.com/search/')) throw new Error(links[1].href);
  if (links.some((l) => l.target !== '_blank')) throw new Error('links devem abrir em nova guia');
  // Clique no YouTube sem sair da página: a nova guia é bloqueada e o painel não pode abrir.
  await pageA.evaluate((id) => {
    const a = document.querySelector(`.song-row[data-id="${id}"] a[data-listen="youtube"]`);
    a.addEventListener('click', (e) => e.preventDefault(), { once: true });
    a.click();
  }, SONG_A);
  await new Promise((r) => setTimeout(r, 300));
  if (await pageA.$('.song-sheet.is-open')) throw new Error('o clique no link abriu o painel da música');
});

await step('slider no painel grava ao soltar', async () => {
  await pageA.click(`.song-row[data-id="${SONG_B}"]`);
  await pageA.waitForSelector('.song-sheet.is-open [data-slider]');
  await pageA.click('.song-sheet.is-open [data-member="m-vocal"]');
  await pageA.$eval('.song-sheet.is-open [data-slider]', (el) => {
    el.value = '40';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await waitForServer(`progress/${SONG_B}/m-vocal`, (v) => v && v.v === 40);
  await pageA.keyboard.press('Escape');
});

await step('edição offline sobrevive a fechar o app e sincroniza depois', async () => {
  await pageA.waitForFunction(() => RH.store.status.pending === 0, { timeout: 10000 });
  await pageA.evaluate(() => RH.store.adapter.goOffline());
  await sleep(300);
  await pageA.evaluate((id) => RH.store.setProgress(id, 'm-baixo', 55), SONG_A);
  await sleep(500);
  assert.equal(await serverRead(`progress/${SONG_A}/m-baixo`), null, 'não deveria ter chegado ao servidor');
  assert.equal(await pageA.evaluate(() => RH.store.status.pending), 1);
  await pageA.close();
  pageA = await devA.open();
  await waitSynced(pageA);
  await waitForServer(`progress/${SONG_A}/m-baixo`, (v) => v && v.v === 55);
  await pageA.waitForFunction(() => RH.store.status.pending === 0);
});

await step('edição antiga feita offline não apaga uma mais nova', async () => {
  await pageA.evaluate(() => RH.store.adapter.goOffline());
  await sleep(300);
  await pageA.evaluate((id) => RH.store.setProgress(id, 'm-bateria', 10), SONG_A);
  await sleep(400);
  await pageB.evaluate((id) => RH.store.setProgress(id, 'm-bateria', 90), SONG_A);
  await waitForServer(`progress/${SONG_A}/m-bateria`, (v) => v && v.v === 90);
  await pageA.close();
  pageA = await devA.open();
  await waitSynced(pageA);
  await sleep(1500);
  assert.equal((await serverRead(`progress/${SONG_A}/m-bateria`)).v, 90);
  assert.equal(await pageA.evaluate((id) => RH.store.progress(id, 'm-bateria').v, SONG_A), 90);
  assert.equal(await pageA.evaluate(() => RH.store.status.pending), 0);
});

await step('adicionar e reordenar o set list ao mesmo tempo preserva as duas mudanças', async () => {
  await pageA.evaluate((a, b) => { RH.store.addToSetlist(a); RH.store.addToSetlist(b); }, SONG_A, SONG_B);
  await pageB.waitForFunction(() => RH.store.setlist().items.length === 2, { timeout: 10000 });
  await pageA.evaluate(() => RH.store.adapter.goOffline());
  await sleep(300);
  await pageA.evaluate((c) => RH.store.addToSetlist(c), SONG_C);
  await pageB.evaluate((b) => RH.store.moveSetlistItem(b, 0), SONG_B);
  await sleep(500);
  await pageA.evaluate(() => RH.store.adapter.goOnline());
  const items = await waitForServer('setlists/main/items', (v) => v && Object.keys(v).length === 3);
  const order = Object.entries(items).sort((x, y) => x[1].pos - y[1].pos).map(([id]) => id);
  assert.deepEqual(order, [SONG_B, SONG_A, SONG_C]);
  await pageA.waitForFunction((expected) => JSON.stringify(RH.store.setlist().items.map((i) => i.id)) === expected, { timeout: 10000 }, JSON.stringify(order));
});

await step('arrastar e soltar com mouse reordena e persiste', async () => {
  await pageA.evaluate(() => { location.hash = '#/setlist'; });
  await pageA.waitForSelector('.sl-item');
  const grips = await pageA.$$('.sl-grip');
  const from = await grips[2].boundingBox();
  const to = await grips[0].boundingBox();
  await pageA.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await pageA.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await pageA.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y - from.y - 10) * i) / 12);
    await sleep(30);
  }
  await pageA.mouse.up();
  await pageA.waitForFunction((c) => RH.store.setlist().items[0].id === c, { timeout: 5000 }, SONG_C);
  const items = await waitForServer('setlists/main/items', (v) => v && Object.entries(v).sort((x, y) => x[1].pos - y[1].pos)[0][0] === SONG_C);
  assert.equal(Object.keys(items).length, 3);
  await pageA.reload({ waitUntil: 'domcontentloaded' });
  await waitSynced(pageA);
  await pageA.waitForSelector('.sl-item');
  const domOrder = await pageA.$$eval('.sl-item', (els) => els.map((e) => e.dataset.id));
  assert.deepEqual(domOrder, [SONG_C, SONG_B, SONG_A]);
  await pageA.screenshot({ path: join(artifacts, 'setlist-apos-arrastar.png') });
});

await step('arrastar e soltar com toque no celular (com rolagem da página)', async () => {
  const devM = await newDevice('M', { mobile: true });
  const page = await devM.open('#/setlist');
  await login(page);
  await waitSynced(page);
  await page.waitForSelector('.sl-item');
  const grips = await page.$$('.sl-grip');
  const from = await grips[0].boundingBox();
  const to = await grips[2].boundingBox();
  const x = from.x + from.width / 2;
  await page.touchscreen.touchStart(x, from.y + from.height / 2);
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    await page.touchscreen.touchMove(x, from.y + from.height / 2 + ((to.y + to.height - from.y) * i) / steps);
    await sleep(30);
  }
  await page.touchscreen.touchEnd();
  await page.waitForFunction((c) => { const it = RH.store.setlist().items; return it[it.length - 1].id === c; }, { timeout: 5000 }, SONG_C);
  await waitForServer('setlists/main/items', (v) => v && Object.entries(v).sort((a, b) => a[1].pos - b[1].pos)[2][0] === SONG_C);
  await page.screenshot({ path: join(artifacts, 'celular-setlist-apos-toque.png') });
  await devM.context.close();
});

await step('rolar a lista com o dedo não muda valores nem abre o painel', async () => {
  const devM = await newDevice('M2', { mobile: true });
  const page = await devM.open('#/musicas/gh1');
  await login(page);
  await waitSynced(page);
  await page.waitForSelector('.song-row');
  const before = await serverRead('progress');
  const row = await (await page.$$('.song-row'))[3].boundingBox();
  await page.touchscreen.touchStart(200, row.y + 20);
  for (let i = 1; i <= 10; i++) { await page.touchscreen.touchMove(200, row.y + 20 - i * 25); await sleep(16); }
  await page.touchscreen.touchEnd();
  await sleep(600);
  assert.equal(await page.$('.song-sheet'), null, 'painel não deveria abrir');
  assert.deepEqual(await serverRead('progress'), before);
  await devM.context.close();
});

await step('impressão do set list gera PDF com as músicas', async () => {
  await pageA.emulateMediaType('print');
  const visible = await pageA.$$eval('.sl-title', (els) => els.map((e) => getComputedStyle(e).display !== 'none' && e.offsetHeight > 0));
  assert.ok(visible.length === 3 && visible.every(Boolean));
  assert.equal(await pageA.$eval('.app-header', (e) => getComputedStyle(e).display), 'none');
  await pageA.pdf({ path: join(artifacts, 'setlist.pdf'), format: 'A4' });
  await pageA.emulateMediaType('screen');
});

await step('dois aparelhos novos entrando juntos no banco vazio criam só 4 membros', async () => {
  await resetData();
  const d1 = await newDevice('S1');
  const d2 = await newDevice('S2');
  const [p1, p2] = await Promise.all([d1.open(), d2.open()]);
  await Promise.all([login(p1), login(p2)]);
  await Promise.all([waitSynced(p1), waitSynced(p2)]);
  await sleep(1500);
  const members = await serverRead('members');
  assert.equal(Object.keys(members).length, 4);
  assert.equal(await p1.evaluate(() => RH.store.members().length), 4);
  assert.equal(await p2.evaluate(() => RH.store.members().length), 4);
  await d1.context.close();
  await d2.context.close();
});

await step('desempenho da aba Todas no celular com CPU 4× mais lenta', async () => {
  const devM = await newDevice('P', { mobile: true });
  const page = await devM.open('#/musicas/gh1');
  await login(page);
  await waitSynced(page);
  const client = await page.createCDPSession();
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await page.evaluate(() => { location.hash = '#/musicas/todas'; });
  await page.waitForFunction(() => document.querySelectorAll('.song-row').length >= 719, { timeout: 30000, polling: 100 });
  const renderMs = Date.now() - t0;
  const nodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  const t1 = Date.now();
  await page.type('.toolbar input[type=search]', 'metallica');
  await page.waitForFunction(() => /^\d+ de 719 músicas$/.test(document.querySelector('[data-result-info]').textContent), { timeout: 10000, polling: 50 });
  const shown = await page.$$eval('.song-row:not([hidden])', (rows) => rows.length);
  assert.ok(shown >= 30 && shown < 60, `resultado inesperado para "metallica": ${shown}`);
  const filterMs = Date.now() - t1;
  console.log(`    render: ${renderMs} ms · nós no DOM: ${nodes} · digitar e filtrar: ${filterMs} ms`);
  assert.ok(renderMs < 8000, `render lento: ${renderMs} ms`);
  await devM.context.close();
});

await step('nenhuma requisição externa (sem scripts do Google)', async () => {
  assert.deepEqual([...externalRequests], []);
});

await step('sem erros de JavaScript no console', async () => {
  assert.deepEqual(consoleProblems, []);
});

await devA.context.close();
await devB.context.close();

// ---------------------------------------------------------------------------
await step('modo local abrindo index.html direto (file://)', async () => {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('requestfailed', (r) => problems.push(`falhou: ${r.url()}`));
  const fileUrl = `${pathToFileURL(join(root, 'index.html')).href}?local=1`;
  await page.goto(fileUrl, { waitUntil: 'load' });
  await login(page);
  await page.waitForFunction(() => RH.store.status.authenticated && RH.store.members().length === 4, { timeout: 10000 });
  await page.evaluate((id) => RH.store.setProgress(id, 'm-vocal', 65), SONG_A);
  await sleep(300);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction((id) => RH.store && RH.store.status.authenticated && RH.store.progress(id, 'm-vocal')?.v === 65, { timeout: 10000 }, SONG_A);
  const fontsOk = await page.evaluate(async () => {
    await document.fonts.ready;
    const families = ['Metal Mania', 'Oswald', 'Permanent Marker'];
    await Promise.all(families.map((f) => document.fonts.load(`16px "${f}"`)));
    return families.map((f) => document.fonts.check(`16px "${f}"`));
  });
  assert.deepEqual(fontsOk, [true, true, true]);
  const logoOk = await page.$eval('.brand img', (img) => img.complete && img.naturalWidth > 0);
  assert.ok(logoOk);
  assert.deepEqual(problems, []);
  await context.close();
});

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} cenários OK`);
if (failed.length) process.exit(1);
