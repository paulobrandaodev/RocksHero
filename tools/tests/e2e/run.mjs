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

await step('YouTube e Spotify só no painel da música, ao lado do botão de editar', async () => {
  assert.equal(await pageA.$('.song-row a[data-listen]'), null, 'a lista não tem mais os botões');
  await pageA.click(`.song-row[data-id="${SONG_A}"]`);
  await pageA.waitForSelector('.song-sheet.is-open .sheet-tools a[data-listen]');
  const links = await pageA.$$eval('.song-sheet.is-open .sheet-tools a[data-listen]', (els) => els.map((a) => ({ href: a.href, target: a.target })));
  assert.equal(links.length, 2);
  assert.ok(links[0].href.startsWith('https://www.youtube.com/results?search_query='), links[0].href);
  assert.ok(links[1].href.startsWith('https://open.spotify.com/search/'), links[1].href);
  assert.ok(links.every((l) => l.target === '_blank'), 'links devem abrir em nova guia');
  assert.ok(await pageA.$('.song-sheet.is-open .sheet-tools [data-toggle-edit]'), 'editar fica na mesma linha');
  await pageA.screenshot({ path: join(artifacts, 'painel-topo.png') });
  await pageA.keyboard.press('Escape');
  await pageA.waitForFunction(() => !document.querySelector('.song-sheet.is-open'));
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
  assert.equal(await pageA.evaluate(() => RH.store.status.pending), 2, 'progresso + histórico do dia');
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
  await page.$eval('.sl-list', (el) => el.scrollIntoView({ block: 'start' }));
  await sleep(200);
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

// ---------------------------------------------------------------------------
// Features novas: vários set lists, otimizar ordem, Modo Palco com letra, impressão por músico,
// "quero tocar", metrônomo/BPM, diário de ensaio e gráfico de evolução.

// Letras falsas no lugar do LRCLIB (o teste não depende da internet).
const LYRICS_HOSTS = /^https:\/\/(lrclib\.net|api\.lyrics\.ovh)\//;
const fakeLyrics = async (page) => {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (!LYRICS_HOSTS.test(req.url())) return req.continue();
    const track = new URL(req.url()).searchParams.get('track_name') || 'música';
    const lines = Array.from({ length: 80 }, (_, i) => `Linha ${i + 1} de ${track}`).join('\n');
    return req.respond({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ trackName: track, plainLyrics: lines, instrumental: false, duration: 200 }),
    });
  });
};

// Músicas com afinações conhecidas para montar um set com trocas.
const pickSongs = (page) => page.evaluate(() => {
  const by = (code) => Object.keys(RH.META).filter((id) => RH.META[id][0] === code && RH.META[id][1] === 1);
  // a primeira precisa de BPM (a velocidade padrão da letra sai dele)
  const e = by('E').sort((x, y) => !!(RH.EXTRA[y] && RH.EXTRA[y][1]) - !!(RH.EXTRA[x] && RH.EXTRA[x][1]));
  const d = by('dropD');
  const eb = by('Eb');
  return [e[0], d[0], e[1], eb[0], d[1], e[2]];
});

// Mesma conta do app: nível padrão da rolagem = BPM ÷ 24, de meio em meio, entre 1 e 10.
const RH_LEVEL = (bpm) => Math.min(10, Math.max(1, Math.round((bpm / 24) * 2) / 2));

let devF;
let pageF;
let setSongs;

await step('vários set lists: criar, trocar e o + do catálogo vai para a lista escolhida', async () => {
  devF = await newDevice('F');
  pageF = await devF.open('#/setlist');
  await login(pageF);
  await waitSynced(pageF);
  await pageF.evaluate(() => RH.store.setMe('m-vocal'));
  await pageF.click('[data-new-list]');
  await pageF.waitForSelector('[data-new-form] input[name=name]', { visible: true });
  await pageF.type('[data-new-form] input[name=name]', 'Estreia no Bar');
  await pageF.select('[data-new-form] select[name=kind]', 'show');
  await pageF.click('[data-new-form] button[type=submit]');
  const listId = await pageF.waitForFunction(() => { const id = RH.store.currentSetlistId(); return id.startsWith('sl-') && id; }).then((h) => h.jsonValue());
  await waitForServer(`setlists/${listId}`, (v) => v && v.name === 'Estreia no Bar' && v.kind === 'show');
  assert.match(await pageF.$eval('[data-pick-list]', (el) => el.selectedOptions[0].textContent), /Estreia no Bar/);
  // "+" no catálogo adiciona na lista escolhida, não na principal
  await pageF.evaluate(() => { location.hash = '#/musicas/gh1'; });
  await pageF.waitForSelector('.song-row [data-toggle]');
  const firstId = await pageF.$eval('.song-row', (el) => el.dataset.id);
  await pageF.click('.song-row [data-toggle]');
  await waitForServer(`setlists/${listId}/items`, (v) => v && v[firstId]);
  assert.equal(await serverRead(`setlists/main/items/${firstId}`), null);
  await pageF.evaluate((id) => RH.store.removeFromSetlist(id), firstId);
});

await step('otimizar ordem mostra antes e depois e aplica', async () => {
  setSongs = await pickSongs(pageF);
  assert.ok(setSongs.every(Boolean), `faltou música com afinação para o teste: ${setSongs}`);
  await pageF.evaluate((ids) => ids.forEach((id) => RH.store.addToSetlist(id)), setSongs);
  await pageF.evaluate(() => { location.hash = '#/setlist'; });
  await pageF.waitForSelector('.sl-item');
  const before = await pageF.evaluate(() => RH.store.tuningChanges(RH.store.setlist().items).length);
  await pageF.click('.summary-actions [data-optimize]');
  await pageF.waitForSelector('.sheet.is-open [data-apply]', { visible: true });
  const subtitle = await pageF.$eval('.sheet.is-open .sub', (el) => el.textContent);
  assert.match(subtitle, new RegExp(`De ${before} para \\d+ troca`));
  await pageF.click('[data-apply]');
  await pageF.waitForFunction((b) => RH.store.tuningChanges(RH.store.setlist().items).length < b, {}, before);
  const order = await pageF.evaluate(() => RH.store.setlist().items.map((i) => i.id));
  assert.equal(order[0], setSongs[0], 'abertura fica');
  assert.equal(order[order.length - 1], setSongs[setSongs.length - 1], 'encerramento fica');
  const listId = await pageF.evaluate(() => RH.store.currentSetlistId());
  await waitForServer(`setlists/${listId}/items`, (v) => v && Object.entries(v).sort((a, b) => a[1].pos - b[1].pos).map((e) => e[0]).join() === order.join());
  // o resumo mostra a duração total do set
  assert.match(await pageF.$eval('.summary-stats', (el) => el.textContent), /\d+ min/);
  await pageF.screenshot({ path: join(artifacts, 'setlist-desktop.png'), fullPage: true });
});

await step('Modo Palco: pedal/teclado avança, avisa troca, mostra observação e rola a letra', async () => {
  await fakeLyrics(pageF);
  const items = await pageF.evaluate(() => RH.store.setlist().items.map((i) => i.id));
  const changeAt = await pageF.evaluate(() => RH.store.tuningChanges(RH.store.setlist().items)[0].index);
  await pageF.evaluate((id) => RH.store.setNote(id, 'm-vocal', 'Entrar depois da virada'), items[0]);
  await pageF.click('[data-stage]');
  await pageF.waitForSelector('.stage .stage-title');
  const title = (i) => pageF.evaluate((id) => RH.SONGS[id].t, items[i]);
  assert.equal(await pageF.$eval('.stage-title', (el) => el.textContent), await title(0));
  assert.match(await pageF.$eval('.stage-notes', (el) => el.textContent), /Entrar depois da virada/);
  assert.match(await pageF.$eval('.stage-next b', (el) => el.textContent), new RegExp((await title(1)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await pageF.waitForFunction(() => /Linha 1 de/.test(document.querySelector('.stage .lyrics-body').textContent), { timeout: 10000 });
  // o padrão da velocidade vem do BPM (BPM ÷ 24)
  const { level, bpm } = await pageF.evaluate((id) => ({ level: Number(document.querySelector('[data-ly-slider]').value), bpm: RH.store.bpm(id).val }), items[0]);
  assert.equal(level, RH_LEVEL(bpm));
  // espaço liga a rolagem; a letra desce sozinha
  await pageF.keyboard.press('Space');
  await pageF.waitForSelector('.stage .lyrics.is-playing');
  await sleep(1500);
  assert.ok(await pageF.$eval('.stage [data-ly-scroll]', (el) => el.scrollTop > 5), 'a letra deveria ter rolado');
  // slider de 0 a 10 guarda a velocidade da música neste aparelho
  await pageF.$eval('[data-ly-slider]', (el) => { el.value = '7.5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await pageF.evaluate((id) => JSON.parse(localStorage.getItem('rh:v1:ui:lyrics-speed'))[id], items[0]), 7.5);
  // Page Down (pedal) avança; o cronômetro começa
  for (let i = 0; i < changeAt; i++) await pageF.keyboard.press('PageDown');
  assert.equal(await pageF.$eval('.stage-title', (el) => el.textContent), await title(changeAt));
  assert.ok(await pageF.$('.stage-change'), 'aviso de troca de afinação');
  assert.ok(await pageF.$('.stage.timer-on'), 'cronômetro ligado ao avançar');
  await pageF.keyboard.press('ArrowLeft');
  assert.equal(await pageF.$eval('.stage-title', (el) => el.textContent), await title(changeAt - 1));
  await pageF.screenshot({ path: join(artifacts, 'palco-desktop.png') });
  // as letras do set ficam no aparelho para o show sem internet
  await pageF.waitForFunction((n) => /Letras (\d+)\//.test(document.querySelector('[data-st-offline]').textContent)
    && Number(document.querySelector('[data-st-offline]').textContent.match(/Letras (\d+)/)[1]) === n, { timeout: 15000 }, items.length);
  await pageF.keyboard.press('Escape');
  assert.equal(await pageF.$('.stage'), null);
  await pageF.setOfflineMode(true);
  await pageF.click('[data-stage]');
  await pageF.waitForFunction(() => /Linha 1 de/.test(document.querySelector('.stage .lyrics-body').textContent), { timeout: 5000 });
  // até o fim do show
  for (let i = 0; i < items.length + 1; i++) await pageF.keyboard.press('ArrowRight');
  await pageF.waitForSelector('[data-st-played]');
  await pageF.click('[data-st-played]');
  await pageF.setOfflineMode(false);
  const listId = await pageF.evaluate(() => RH.store.currentSetlistId());
  await waitForServer(`setlists/${listId}`, (v) => v && v.played === true && /^\d{4}-\d{2}-\d{2}$/.test(v.date));
  await pageF.click('.stage-end [data-st-close]');
  assert.equal(await pageF.evaluate((id) => RH.store.songPlays(id).count, items[0]), 1);
  await pageF.waitForSelector('.show-item');
});

await step('Modo Palco no celular (retrato)', async () => {
  const devM = await newDevice('PM', { mobile: true });
  const page = await devM.open('#/setlist');
  await login(page);
  await waitSynced(page);
  await fakeLyrics(page);
  await page.evaluate(() => RH.store.setMe('m-vocal'));
  await page.evaluate((ids) => ids.forEach((id) => RH.store.addToSetlist(id, 'main')), setSongs);
  await page.evaluate(() => RH.store.selectSetlist('main'));
  await page.waitForSelector('[data-stage]:not([disabled])');
  await page.screenshot({ path: join(artifacts, 'setlist-celular.png'), fullPage: true });
  await page.evaluate((id) => RH.songSheet.open(id), setSongs[0]);
  await page.waitForSelector('.song-sheet.is-open .sheet-tools');
  await sleep(400);
  await page.screenshot({ path: join(artifacts, 'painel-celular.png') });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.song-sheet.is-open'));
  await page.click('[data-stage]');
  await page.waitForFunction(() => /Linha 1 de/.test(document.querySelector('.stage .lyrics-body').textContent), { timeout: 10000 });
  // deslizar para a esquerda na área da música avança
  const box = await (await page.$('.stage-now')).boundingBox();
  const y = box.y + Math.min(60, box.height / 2);
  await page.touchscreen.touchStart(box.x + box.width - 30, y);
  for (let i = 1; i <= 8; i++) { await page.touchscreen.touchMove(box.x + box.width - 30 - i * 30, y); await sleep(16); }
  await page.touchscreen.touchEnd();
  await page.waitForFunction((t) => document.querySelector('.stage-title').textContent === t, { timeout: 3000 }, await page.evaluate(() => RH.SONGS[RH.store.setlist().items[1].id].t));
  await page.screenshot({ path: join(artifacts, 'palco-celular.png') });
  await devM.context.close();
});

await step('imprimir a folha de um músico com as observações dele', async () => {
  const listId = 'main';
  await pageF.evaluate((id) => RH.store.selectSetlist(id), listId);
  await pageF.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
  await pageF.evaluate((id) => RH.store.setNote(id, 'm-guitarra', 'Solo com wah'), setSongs[0]);
  await pageF.click('.summary-actions [data-print]');
  await pageF.waitForSelector('[data-print-form] input[value="m-guitarra"]', { visible: true });
  await pageF.click('[data-print-form] input[value="m-guitarra"]');
  await pageF.click('[data-print-form] button[type=submit]');
  await pageF.waitForFunction(() => window.__printed === 1, { timeout: 5000 });
  await pageF.emulateMediaType('print');
  const notes = await pageF.$$eval('.sl-notes', (els) => els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.textContent.trim()));
  assert.deepEqual(notes, ['Solo com wah'], 'só as observações do guitarrista');
  assert.match(await pageF.$eval('[data-print-date]', (el) => el.textContent), /Folha de Guitarra/);
  await pageF.pdf({ path: join(artifacts, 'setlist-folha-guitarra.pdf'), format: 'A4' });
  await pageF.emulateMediaType('screen');
  await pageF.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  assert.equal(await pageF.$('.sl-notes'), null, 'as observações saem depois de imprimir');
});

await step('quero tocar, metrônomo e correção do BPM no painel da música', async () => {
  const id = setSongs[0];
  await pageF.evaluate((songId) => RH.songSheet.open(songId), id);
  await pageF.waitForSelector('.song-sheet [data-want]');
  await pageF.click('.song-sheet [data-want]');
  await waitForServer(`wants/${id}/m-vocal`, (v) => v && v.v === true);
  await pageF.waitForSelector('.song-sheet [data-want][aria-pressed="true"]');
  const bpm = await pageF.evaluate((songId) => RH.store.bpm(songId).val, id);
  assert.equal(await pageF.$eval('.song-sheet [data-m-bpm]', (el) => Number(el.value)), bpm);
  await pageF.click('.song-sheet [data-m-play]');
  await pageF.waitForSelector('.song-sheet .metro.is-running');
  await sleep(700);
  assert.ok(await pageF.$('.song-sheet .metro-dots i.is-on'), 'pulso visual do metrônomo');
  await pageF.screenshot({ path: join(artifacts, 'painel-musica.png') });
  await pageF.click('.song-sheet [data-m-play]');
  await pageF.waitForSelector('.song-sheet .metro:not(.is-running)');
  // corrige BPM e duração
  await pageF.click('.song-sheet [data-toggle-edit]');
  await pageF.waitForSelector('[data-edit-form] input[name=bpm]');
  await pageF.$eval('[data-edit-form] input[name=bpm]', (el) => { el.value = '133'; });
  await pageF.$eval('[data-edit-form] input[name=dur]', (el) => { el.value = '4:05'; });
  await pageF.click('[data-edit-form] button[type=submit]');
  await waitForServer(`overrides/${id}`, (v) => v && v.bpm && v.bpm.val === 133 && v.dur && v.dur.val === 245);
  await pageF.keyboard.press('Escape');
  // o catálogo mostra quem quer tocar e ordena pela prioridade
  await pageF.evaluate(() => { location.hash = '#/musicas/todas'; });
  await pageF.waitForFunction((songId) => document.querySelector(`.song-row[data-id="${songId}"] .want.is-mine`), { timeout: 15000 }, id);
  await pageF.select('[data-filter="sort"]', 'priority');
  await pageF.waitForFunction((songId) => { const r = document.querySelector('.song-row'); return r && r.dataset.id === songId; }, { timeout: 15000 }, id);
  // coluna própria dos likes, antes da mediana
  const cols = await pageF.$eval('.song-row', (row) => [...row.children].map((c) => c.className.split(' ')[0]));
  assert.equal(cols[cols.indexOf('score') - 1], 'song-likes');
  await pageF.screenshot({ path: join(artifacts, 'catalogo-likes.png') });
  await pageF.select('[data-filter="sort"]', 'game');
});

await step('diário de ensaio e gráfico de evolução', async () => {
  // dois dias de progresso para o gráfico
  await pageF.evaluate((ids) => {
    const yesterday = RH.util.dayKey(Date.now() - 86400000);
    for (const m of ['m-vocal', 'm-guitarra', 'm-baixo', 'm-bateria']) {
      RH.store.write({ [`history/${ids[1]}/${m}/${yesterday}`]: { v: 40, t: Date.now() - 86400000 } });
      RH.store.setProgress(ids[1], m, 90);
    }
  }, setSongs);
  await pageF.evaluate(() => { location.hash = '#/ensaios'; });
  await pageF.waitForSelector('[data-new]');
  await pageF.waitForSelector('.reh-chart .chart-line');
  assert.ok((await pageF.$$('.reh-chart .chart-line')).length >= 2, 'uma linha por membro e a da banda');
  await pageF.click('[data-new]');
  await pageF.waitForSelector('[data-form] [data-toggle]', { visible: true });
  await pageF.click('[data-form] [data-toggle]');
  await pageF.type('[data-form] textarea[name=note]', 'Virada de Iron Man ainda escapa');
  await pageF.click('[data-form] button[type=submit]');
  const reh = await waitForServer('rehearsals', (v) => v && Object.keys(v).length === 1);
  const r = Object.values(reh)[0];
  assert.equal(r.note, 'Virada de Iron Man ainda escapa');
  assert.equal(Object.keys(r.songs).length, 1);
  assert.equal(r.by, 'm-vocal');
  await pageF.waitForSelector('.reh-item');
  await pageF.screenshot({ path: join(artifacts, 'ensaios-desktop.png'), fullPage: true });
  // o painel da música mostra o gráfico dela
  await pageF.evaluate((id) => RH.songSheet.open(id), setSongs[1]);
  await pageF.waitForSelector('.song-sheet [data-chart] .chart-line');
  await pageF.keyboard.press('Escape');
  await devF.context.close();
});

await step('nenhuma requisição externa (sem scripts do Google; só as bases públicas de letras)', async () => {
  assert.deepEqual([...externalRequests].filter((u) => !LYRICS_HOSTS.test(u)), []);
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
