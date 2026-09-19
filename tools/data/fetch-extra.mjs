// Busca a duração e o BPM de cada música na API pública do Deezer (sem chave).
// Prefere a gravação de estúdio (descarta ao vivo, demo, remix, acústica...) e a mais ouvida.
// Resultado: tools/data/extra/deezer.tsv (id | id no Deezer | duração em s | BPM, 0 = sem BPM | título achado).
// Uso: node data/fetch-extra.mjs [--force]   (dentro de tools/; retoma de onde parou)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outFile = join(here, 'extra', 'deezer.tsv');
const force = process.argv.includes('--force');

const context = {};
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(join(root, 'data/songs.js'), 'utf8'), context);
const SONGS = context.RH.SONGS;

await mkdir(join(here, 'extra'), { recursive: true });
const done = new Map();
if (!force) {
  try {
    for (const line of (await readFile(outFile, 'utf8')).split(/\r?\n/)) {
      if (line && !line.startsWith('#')) done.set(line.split('|')[0], line);
    }
  } catch { /* primeira vez */ }
}

const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&/g, ' and ').replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
const BAD_VERSION = /live|ao vivo|demo|remix|mix\b|acoustic|unplugged|instrumental|karaoke|edit\b|version|rehearsal|session|cover|tribute|re-?recorded|mono|bbc|take\b/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
const get = async (url) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = 130 - (Date.now() - last); // ~7 pedidos/s (limite do Deezer: 50 a cada 5 s)
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(url).catch(() => null);
    if (res && res.ok) {
      const json = await res.json();
      if (!json.error) return json;
      if (json.error.code !== 4) return null; // 4 = limite de pedidos: espera e tenta de novo
    }
    await sleep(1500 * (attempt + 1));
  }
  return null;
};

const pick = (song, data) => {
  const title = fold(song.t);
  const artist = fold(song.a);
  const ok = (data || []).filter((tr) => {
    const a = fold(tr.artist && tr.artist.name);
    const t = fold(tr.title_short || tr.title);
    return (a === artist || a.includes(artist) || artist.includes(a)) && a && (t === title || t.startsWith(title) || title.startsWith(t)) && t;
  });
  const studio = ok.filter((tr) => !BAD_VERSION.test(`${tr.title_version || ''} ${tr.title} ${tr.album ? tr.album.title : ''}`));
  return (studio.length ? studio : ok).sort((x, y) => y.rank - x.rank);
};

const ids = Object.keys(SONGS).sort();
let n = 0;
for (const id of ids) {
  n++;
  if (done.has(id)) continue;
  const song = SONGS[id];
  const q = encodeURIComponent(`${song.a.replace(/^\./, '')} ${song.t.replace(/\(.*?\)/g, '')}`);
  const res = await get(`https://api.deezer.com/search?q=${q}&limit=25`);
  const candidates = pick(song, res && res.data);
  let line = `${id}|||0|`;
  if (candidates.length) {
    const best = candidates[0];
    let bpm = 0;
    // O BPM só vem no detalhe da faixa e muitas vezes é 0: tenta as versões de estúdio mais ouvidas.
    for (const tr of candidates.slice(0, 4)) {
      const detail = await get(`https://api.deezer.com/track/${tr.id}`);
      if (detail && detail.bpm > 0 && Math.abs(detail.duration - best.duration) <= 20) { bpm = Math.round(detail.bpm * 10) / 10; break; }
    }
    line = `${id}|${best.id}|${best.duration}|${bpm}|${String(best.title).replace(/\|/g, '/')}`;
  }
  done.set(id, line);
  console.log(`${n}/${ids.length} ${line}`);
  if (n % 20 === 0) await save();
}
await save();

async function save() {
  const body = ids.filter((id) => done.has(id)).map((id) => done.get(id)).join('\n');
  await writeFile(outFile, `# id | id no Deezer | duração (s) | BPM do Deezer (0 = sem) | título achado. Gerado por tools/data/fetch-extra.mjs.\n${body}\n`, 'utf8');
}
const found = [...done.values()].filter((l) => l.split('|')[2]).length;
const withBpm = [...done.values()].filter((l) => Number(l.split('|')[3]) > 0).length;
console.log(`OK: ${found}/${ids.length} com duração · ${withBpm} com BPM`);
