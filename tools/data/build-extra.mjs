// Monta data/song-extra.js (duração e BPM de cada música) a partir de:
//   tools/data/extra/deezer.tsv  (fetch-extra.mjs)  duração e BPM da gravação de estúdio no Deezer
//   tools/data/extra/lrclib.tsv  (fetch-lrclib.mjs) duração mais comum no LRCLIB, para conferir
//   tools/data/extra/manual.txt  correções à mão (valem por cima de tudo)
// Vale a duração do Deezer; o LRCLIB só completa quando o Deezer não achou (e é ignorado abaixo de 45 s,
// que são registros quebrados). Quando os dois discordam em mais de 30 s, o caso vai para
// tools/data/out/extra-divergencias.txt: confira e, se o Deezer errou, corrija em manual.txt.
// Uso: node data/build-extra.mjs (dentro de tools/)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const context = {};
context.window = context;
vm.createContext(context);
vm.runInContext(await readFile(join(root, 'data/songs.js'), 'utf8'), context);
const SONGS = context.RH.SONGS;

const table = async (file) => {
  const rows = new Map();
  let text = '';
  try { text = await readFile(join(here, 'extra', file), 'utf8'); } catch { return rows; }
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    const cols = line.split('|').map((s) => s.trim());
    if (!SONGS[cols[0]]) throw new Error(`${file}:${i + 1}: id desconhecido ${cols[0]}`);
    if (rows.has(cols[0])) throw new Error(`${file}:${i + 1}: id repetido ${cols[0]}`);
    rows.set(cols[0], cols);
  });
  return rows;
};

const deezer = await table('deezer.tsv');
const lrclib = await table('lrclib.tsv');
const manual = await table('manual.txt');

const parseDur = (text) => {
  const m = String(text).match(/^(\d+):(\d{2})$/);
  if (!m) throw new Error(`manual.txt: duração inválida ${text}`);
  return Number(m[1]) * 60 + Number(m[2]);
};

const extra = {};
const diverge = [];
let fromManualBpm = 0;
for (const id of Object.keys(SONGS).sort()) {
  const dz = deezer.get(id) || [];
  const lr = lrclib.get(id) || [];
  const man = manual.get(id) || [];
  const dzDur = Number(dz[2]) || null;
  const lrDur = Number(lr[1]) >= 45 ? Number(lr[1]) : null;
  let dur = dzDur || lrDur;
  if (dzDur && lrDur && Math.abs(dzDur - lrDur) > 30 && !man[1]) {
    diverge.push(`${SONGS[id].a} – ${SONGS[id].t}: Deezer ${dzDur}s × LRCLIB ${lrDur}s (${dz[4] || ''})`);
  }
  if (man[1]) dur = parseDur(man[1]);
  let bpm = Number(dz[3]) > 0 ? Math.round(Number(dz[3])) : null;
  let conf = bpm ? 1 : 0;
  if (man[2]) {
    const v = Number(man[2]);
    if (!(v >= 20 && v <= 300)) throw new Error(`manual.txt: BPM inválido para ${id}: ${man[2]}`);
    bpm = Math.round(v);
    conf = 0;
    fromManualBpm++;
  }
  if (dur || bpm) extra[id] = [dur || null, bpm || null, conf];
}

const ids = Object.keys(extra);
const body = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(extra[id])}`).join(',\n');
await writeFile(
  join(root, 'data', 'song-extra.js'),
  `/* Duração (s) e BPM da gravação original, com a confiança do BPM (1 = medido no Deezer, 0 = a confirmar).\n   Gerado por tools/data/build-extra.mjs a partir de tools/data/extra/. Corrija lá e rode o script. */\nwindow.RH = window.RH || {};\nRH.EXTRA = {\n${body}\n};\n`,
  'utf8',
);
await mkdir(join(here, 'out'), { recursive: true });
await writeFile(join(here, 'out', 'extra-divergencias.txt'), `${diverge.join('\n')}\n`, 'utf8');
const total = Object.keys(SONGS).length;
console.log(`OK: ${ids.filter((id) => extra[id][0]).length}/${total} com duração · ${ids.filter((id) => extra[id][1]).length} com BPM (${fromManualBpm} à mão) · ${diverge.length} durações divergentes a conferir`);
