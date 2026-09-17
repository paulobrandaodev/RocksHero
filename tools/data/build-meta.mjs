// Monta data/song-meta.js a partir de tools/data/meta/*.txt (afinação e instrumentação escritas à mão).
// Formato de cada linha: id|afinação|confiança|instrumentação|observação
// Uso: node data/build-meta.mjs (dentro de tools/)
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const context = {};
context.window = context;
vm.createContext(context);
for (const file of ['js/constants.js', 'data/songs.js']) {
  vm.runInContext(await readFile(join(root, file), 'utf8'), context, { filename: file });
}
const { RH } = context;

const errors = [];
const meta = {};
const files = (await readdir(join(here, 'meta'))).filter((f) => f.endsWith('.txt')).sort();
for (const file of files) {
  const lines = (await readFile(join(here, 'meta', file), 'utf8')).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim() || line.startsWith('#')) return;
    const where = `${file}:${i + 1}`;
    const [id, tuning = '', conf = '0', ins = '', note = ''] = line.split('|').map((s) => s.trim());
    if (!RH.SONGS[id]) return errors.push(`${where}: id desconhecido ${id}`);
    if (meta[id]) return errors.push(`${where}: id repetido ${id}`);
    if (tuning && !RH.TUNINGS[tuning] && !tuning.startsWith('other:')) errors.push(`${where}: afinação inválida ${tuning}`);
    if (conf !== '0' && conf !== '1') errors.push(`${where}: confiança inválida ${conf}`);
    if (!tuning && conf === '1') errors.push(`${where}: afinação vazia não pode ter confiança 1`);
    if (ins && !RH.INS_PATTERN.test(ins)) errors.push(`${where}: instrumentação inválida ${ins}`);
    const entry = [tuning || null, Number(conf), ins || null];
    if (note) entry.push(note);
    meta[id] = entry;
  });
}
for (const id of Object.keys(RH.SONGS)) if (!meta[id]) errors.push(`sem linha para ${id}`);

if (errors.length) {
  console.error(`ERROS (${errors.length}):\n - ${errors.slice(0, 60).join('\n - ')}`);
  process.exit(1);
}

const ids = Object.keys(meta).sort();
const body = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(meta[id])}`).join(',\n');
await writeFile(
  join(root, 'data', 'song-meta.js'),
  `/* Afinação da gravação original, confiança (1 = confirmada, 0 = a confirmar), instrumentação e observação.\n   Gerado por tools/data/build-meta.mjs a partir de tools/data/meta/*.txt. Corrija lá e rode o script. */\nwindow.RH = window.RH || {};\nRH.META = {\n${body}\n};\n`,
  'utf8',
);

const values = Object.values(meta);
const confirmed = values.filter((m) => m[1] === 1).length;
const unknownTuning = values.filter((m) => m[0] === null).length;
const unknownIns = values.filter((m) => m[2] === null).length;
const low = ids.filter((id) => meta[id][1] === 0).map((id) => `${RH.SONGS[id].a} – ${RH.SONGS[id].t}: ${meta[id][0] ?? '?'}`);
await writeFile(join(here, 'out', 'meta-a-confirmar.txt'), `${low.join('\n')}\n`, 'utf8');
console.log(`OK: ${ids.length} músicas · ${confirmed} afinações confirmadas · ${values.length - confirmed - unknownTuning} a confirmar · ${unknownTuning} desconhecidas · ${unknownIns} sem instrumentação`);
