// Confere a duração no LRCLIB (base pública de letras) e anota se a letra existe lá.
// Resultado: tools/data/extra/lrclib.tsv (id | duração em s, vazio = não achou | letra: 1 sim, 0 não, i instrumental).
// Uso: node data/fetch-lrclib.mjs [--force]   (dentro de tools/; retoma de onde parou)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outFile = join(here, 'extra', 'lrclib.tsv');
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
const BAD = /live|demo|remix|acoustic|unplugged|karaoke|edit\b|version|instrumental/i;
const headers = { 'User-Agent': 'RocksHeroSetlist/1.0 (band fan project)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const search = async (q) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, { headers }).catch(() => null);
    if (res && res.ok) return res.json();
    await sleep(1500 * (attempt + 1));
  }
  return [];
};

// Duração mais comum entre as versões de estúdio que batem artista e título (a moda descarta edições de rádio).
const pick = (song, list) => {
  const title = fold(song.t);
  const artist = fold(song.a.replace(/ featuring .*/i, ''));
  const ok = (list || []).filter((r) => {
    const a = fold(r.artistName);
    const t = fold(r.trackName);
    return a && t && (a === artist || a.includes(artist) || artist.includes(a)) && (t === title || t.startsWith(title) || title.startsWith(t));
  });
  const studio = ok.filter((r) => !BAD.test(`${r.trackName} ${r.albumName}`));
  const use = studio.length ? studio : ok;
  if (!use.length) return null;
  const votes = new Map();
  for (const r of use) {
    const d = Math.round(r.duration);
    const key = [...votes.keys()].find((k) => Math.abs(k - d) <= 3) ?? d;
    votes.set(key, (votes.get(key) || 0) + 1);
  }
  const dur = [...votes.entries()].sort((x, y) => y[1] - x[1])[0][0];
  const lyrics = use.some((r) => r.plainLyrics) ? '1' : use.every((r) => r.instrumental) ? 'i' : '0';
  return { dur, lyrics };
};

const ids = Object.keys(SONGS).sort();
let n = 0;
for (const id of ids) {
  n++;
  if (done.has(id)) continue;
  const song = SONGS[id];
  const found = pick(song, await search(`${song.a.replace(/ featuring .*/i, '').replace(/^\./, '')} ${song.t.replace(/\(.*?\)/g, '')}`));
  const line = found ? `${id}|${found.dur}|${found.lyrics}` : `${id}||0`;
  done.set(id, line);
  console.log(`${n}/${ids.length} ${line}`);
  if (n % 25 === 0) await save();
  await sleep(120);
}
await save();

async function save() {
  const body = ids.filter((id) => done.has(id)).map((id) => done.get(id)).join('\n');
  await writeFile(outFile, `# id | duração no LRCLIB (s) | letra (1 tem, 0 não achou, i instrumental). Gerado por tools/data/fetch-lrclib.mjs.\n${body}\n`, 'utf8');
}
const lines = [...done.values()];
console.log(`OK: ${lines.filter((l) => l.split('|')[1]).length}/${ids.length} com duração · ${lines.filter((l) => l.endsWith('|1')).length} com letra`);
