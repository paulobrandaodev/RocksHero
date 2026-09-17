// Valida os dados do catálogo carregando os scripts clássicos do app num contexto isolado.
// Uso: node tools/data/validate.mjs [--update-lock]
import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const updateLock = process.argv.includes('--update-lock');

const exists = (p) => access(p).then(() => true, () => false);

const context = {};
context.window = context;
vm.createContext(context);
for (const file of ['js/constants.js', 'data/songs.js', 'data/games.js', 'data/song-meta.js']) {
  const path = join(root, file);
  if (!(await exists(path))) continue;
  vm.runInContext(await readFile(path, 'utf8'), context, { filename: file });
}
const RH = context.RH;

const errors = [];
const warnings = [];
const sources = JSON.parse(await readFile(join(here, 'sources.json'), 'utf8'));

// Jogos e contagens
if (RH.GAMES.length !== sources.length) errors.push(`${RH.GAMES.length} jogos (esperado ${sources.length})`);
let total = 0;
const referenced = new Set();
for (const src of sources) {
  const game = RH.GAMES.find((g) => g.id === src.game);
  if (!game) { errors.push(`jogo ausente: ${src.game}`); continue; }
  const entries = game.tiers.flatMap((t) => t.songs);
  total += entries.length;
  if (entries.length !== src.tracks) errors.push(`${src.game}: ${entries.length} faixas (esperado ${src.tracks})`);
  const ids = new Set();
  for (const e of entries) {
    if (!RH.SONGS[e.id]) errors.push(`${src.game}: id sem música: ${e.id}`);
    if (ids.has(e.id)) errors.push(`${src.game}: id repetido: ${e.id}`);
    ids.add(e.id);
    referenced.add(e.id);
  }
}
if (total !== 778) errors.push(`total de ${total} entradas (esperado 778)`);

// Músicas
const songIds = Object.keys(RH.SONGS);
for (const id of songIds) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*--[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || id.length > 120) errors.push(`id com formato inválido: ${id}`);
  if (!referenced.has(id)) errors.push(`música sem jogo: ${id}`);
  const s = RH.SONGS[id];
  if (!s.t || !s.a || !(s.y >= 1900 && s.y <= 2030)) errors.push(`música incompleta: ${id}`);
}

// Afinação e instrumentação
if (!RH.META) {
  warnings.push('data/song-meta.js ainda não existe');
} else {
  for (const id of songIds) {
    const meta = RH.META[id];
    if (!meta) { errors.push(`sem afinação/instrumentação: ${id}`); continue; }
    const [tuning, confidence, ins, note] = meta;
    if (tuning !== null && !RH.TUNINGS[tuning] && !String(tuning).startsWith('other:')) errors.push(`afinação inválida em ${id}: ${tuning}`);
    if (confidence !== 0 && confidence !== 1) errors.push(`confiança inválida em ${id}: ${confidence}`);
    if (tuning === null && confidence !== 0) errors.push(`afinação desconhecida precisa de confiança 0: ${id}`);
    if (ins !== null && !RH.parseIns(ins)) errors.push(`instrumentação inválida em ${id}: ${ins}`);
    if (note !== undefined && typeof note !== 'string') errors.push(`observação inválida em ${id}`);
  }
  for (const id of Object.keys(RH.META)) {
    if (!RH.SONGS[id]) errors.push(`meta para id inexistente: ${id}`);
  }
}

// Ids congelados: nenhum id publicado pode sumir (o progresso da banda é guardado por id).
const lockPath = join(here, 'ids.lock.json');
if (await exists(lockPath)) {
  const locked = JSON.parse(await readFile(lockPath, 'utf8'));
  const missing = locked.filter((id) => !RH.SONGS[id]);
  for (const id of missing) errors.push(`id congelado sumiu: ${id}`);
  const added = songIds.filter((id) => !locked.includes(id));
  if (added.length) {
    if (updateLock) await writeFile(lockPath, JSON.stringify([...locked, ...added].sort(), null, 1) + '\n');
    else warnings.push(`${added.length} ids novos (rode com --update-lock para congelar)`);
  }
} else {
  await writeFile(lockPath, JSON.stringify(songIds.sort(), null, 1) + '\n');
  warnings.push(`ids.lock.json criado com ${songIds.length} ids`);
}

for (const w of warnings) console.warn(`aviso: ${w}`);
if (errors.length) {
  console.error(`ERROS (${errors.length}):\n - ${errors.slice(0, 50).join('\n - ')}`);
  process.exit(1);
}
const metaCount = RH.META ? Object.keys(RH.META).length : 0;
const lowConfidence = RH.META ? Object.values(RH.META).filter((m) => m[1] === 0).length : 0;
console.log(`OK: ${RH.GAMES.length} jogos, ${total} entradas, ${songIds.length} músicas, ${metaCount} com meta (${lowConfidence} a confirmar)`);
