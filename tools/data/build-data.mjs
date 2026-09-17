// Gera data/songs.js e data/games.js a partir do wikitext em cache.
// Uso: node tools/data/build-data.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAll } from './parse.mjs';
import { slug } from './wikitext.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const aliases = JSON.parse(await readFile(join(here, 'aliases.json'), 'utf8'));
const games = await parseAll();
const errors = [];

// 1. Correções pontuais
for (const fix of aliases.fix) {
  const g = games.find((x) => x.game === fix.game);
  const hits = g ? g.entries.filter((e) => e.title === fix.title) : [];
  if (hits.length !== 1) errors.push(`fix sem correspondência única: ${fix.game} "${fix.title}" (${hits.length})`);
  for (const e of hits) Object.assign(e, fix.set);
}

// 2. Ids e músicas únicas
const songs = new Map();
for (const g of games) {
  if (g.entries.length !== g.tracks) {
    errors.push(`${g.game}: ${g.entries.length} faixas (esperado ${g.tracks})`);
  }
  const seen = new Set();
  for (const e of g.entries) {
    let id = `${slug(e.artist)}--${slug(e.title)}`;
    id = aliases.merge[id] ?? id;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*--[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || id.length > 120) errors.push(`id inválido: ${id}`);
    if (seen.has(id)) errors.push(`${g.game}: id repetido no mesmo jogo: ${id}`);
    seen.add(id);
    e.id = id;
    const song = songs.get(id);
    if (!song) {
      songs.set(id, { t: e.title, a: e.artist, y: e.year, games: [g.game] });
    } else {
      if (e.year && (!song.y || e.year < song.y)) song.y = e.year;
      song.games.push(g.game);
    }
  }
}
for (const [id, year] of Object.entries(aliases.songYear)) {
  if (!songs.has(id)) errors.push(`songYear para id inexistente: ${id}`);
  else songs.get(id).y = year;
}

// 3. Checagem cruzada do Smash Hits
const idsByGame = Object.fromEntries(games.map((g) => [g.game, new Set(g.entries.map((e) => e.id))]));
for (const e of games.find((g) => g.game === 'ghsh').entries) {
  if (!idsByGame[e.origGame].has(e.id)) errors.push(`Smash Hits: "${e.title}" (${e.id}) não encontrado em ${e.origGame}`);
}

// 4. Tiers
function mostCommon(labels) {
  const count = new Map();
  for (const l of labels) count.set(l, (count.get(l) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
}

function buildTiers(g) {
  const groups = new Map();
  g.entries.forEach((e, index) => {
    let key;
    if (e.bonus) key = 'bonus';
    else if (e.coop) key = 'coop';
    else if (e.group) key = `g:${e.group}`;
    else key = `t:${String(e.tier).padStart(3, '0')}`;
    if (!groups.has(key)) groups.set(key, { key, labels: [], entries: [] });
    const grp = groups.get(key);
    if (e.tierLabel) grp.labels.push(e.tierLabel);
    if (e.group) grp.labels.push(e.group);
    grp.entries.push({ e, index });
  });
  const rank = (k) => (k.startsWith('t:') ? 0 : k.startsWith('g:') ? 1 : k === 'coop' ? 2 : 3);
  const ordered = [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
  let n = 0;
  return ordered.map((grp) => {
    let name;
    if (grp.key === 'bonus') name = 'Músicas bônus';
    else if (grp.key === 'coop') name = 'Exclusivas da carreira co-op';
    else name = mostCommon(grp.labels);
    const tier = { name };
    if (grp.key.startsWith('t:') || grp.key.startsWith('g:')) tier.n = ++n;
    if (grp.key === 'bonus') tier.bonus = 1;
    if (grp.key === 'coop') tier.coop = 1;
    tier.songs = grp.entries
      .sort((a, b) => (a.e.pos ?? 1e9) - (b.e.pos ?? 1e9) || a.index - b.index)
      .map(({ e }) => {
        const out = { id: e.id };
        if (e.cover) out.cover = 1;
        if (e.coverBy) out.coverBy = e.coverBy;
        if (e.encore) out.encore = 1;
        if (e.boss) out.boss = 1;
        if (e.platform) out.plat = e.platform;
        if (e.version) out.ver = e.version;
        if (e.gameTitle) out.gameTitle = e.gameTitle;
        if (e.year && e.year !== songs.get(e.id).y) out.year = e.year;
        return out;
      });
    return tier;
  });
}

const outGames = games.map((g) => ({
  id: g.game,
  name: g.name,
  short: g.short,
  year: g.year,
  c1: g.c1,
  c2: g.c2,
  tiers: buildTiers(g),
}));

if (errors.length) {
  console.error('ERROS:\n - ' + errors.join('\n - '));
  process.exit(1);
}

// 5. Saída
const header = '/* Gerado por tools/data/build-data.mjs a partir da Wikipedia (CC BY-SA 4.0). Não edite à mão. */\n';
const sortedIds = [...songs.keys()].sort();
const songLines = sortedIds.map((id) => {
  const s = songs.get(id);
  return `  ${JSON.stringify(id)}: ${JSON.stringify({ t: s.t, a: s.a, y: s.y })}`;
});
await mkdir(join(root, 'data'), { recursive: true });
await writeFile(
  join(root, 'data', 'songs.js'),
  `${header}window.RH = window.RH || {};\nRH.SONGS = {\n${songLines.join(',\n')}\n};\n`,
  'utf8',
);
const gameBlocks = outGames.map((g) => {
  const tiers = g.tiers.map((t) => {
    const { songs: list, ...meta } = t;
    const items = list.map((s) => `        ${JSON.stringify(s)}`).join(',\n');
    return `      ${JSON.stringify(meta).slice(0, -1)}, "songs": [\n${items}\n      ]}`;
  });
  const { tiers: _, ...meta } = g;
  return `  ${JSON.stringify(meta).slice(0, -1)}, "tiers": [\n${tiers.join(',\n')}\n  ]}`;
});
await writeFile(
  join(root, 'data', 'games.js'),
  `${header}window.RH = window.RH || {};\nRH.GAMES = [\n${gameBlocks.join(',\n')}\n];\n`,
  'utf8',
);

// 6. Relatório para revisão
const report = [];
const total = games.reduce((n, g) => n + g.entries.length, 0);
report.push(`# Relatório do catálogo\n\n${total} entradas, ${songs.size} músicas únicas.\n`);
report.push('## Por jogo\n');
for (const g of outGames) report.push(`- ${g.id}: ${games.find((x) => x.game === g.id).entries.length} faixas, ${g.tiers.length} grupos`);
report.push('\n## Músicas em mais de um jogo (fora Smash Hits)\n');
for (const id of sortedIds) {
  const s = songs.get(id);
  const others = s.games.filter((x) => x !== 'ghsh');
  if (others.length > 1) report.push(`- ${s.a} – ${s.t}: ${others.join(', ')}`);
}
report.push('\n## Mesmo título, artistas diferentes (conferir)\n');
const byTitle = new Map();
for (const id of sortedIds) {
  const key = slug(songs.get(id).t);
  byTitle.set(key, [...(byTitle.get(key) ?? []), id]);
}
for (const ids of byTitle.values()) {
  if (ids.length > 1) report.push(`- ${ids.join('  |  ')}`);
}
report.push('\n## Versões\n');
for (const g of games) for (const e of g.entries) if (e.version) report.push(`- ${g.game}: ${e.artist} – ${e.title} [${e.version}] (${e.year})`);
await mkdir(join(here, 'out'), { recursive: true });
await writeFile(join(here, 'out', 'report.md'), report.join('\n') + '\n', 'utf8');
await writeFile(
  join(here, 'out', 'catalog.tsv'),
  ['id\ttitle\tartist\tyear\tgames', ...sortedIds.map((id) => { const s = songs.get(id); return [id, s.t, s.a, s.y, s.games.join(',')].join('\t'); })].join('\n') + '\n',
  'utf8',
);

console.log(`OK: ${total} entradas, ${songs.size} músicas únicas → data/songs.js, data/games.js`);
