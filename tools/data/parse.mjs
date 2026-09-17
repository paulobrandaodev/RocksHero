// Extrai as entradas (músicas por jogo) do wikitext em cache.
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, section, tables, tableRows, parseCell, parseTitle, parseTier } from './wikitext.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const EXCLUDE = /guitar battle|guitar duel|battle vs/i;

// Uma lista por jogo; cada item descreve uma tabela.
// cols: índice de cada coluna; header: regex que o cabeçalho precisa casar.
const CONFIG = {
  gh1: [
    { section: /^Main set list$/, header: /Year.*Song title.*Artist.*Tier/, cols: { year: 0, title: 1, artist: 2, tier: 3 }, allCovers: true },
    { section: /^Bonus songs$/, header: /Year.*Song title.*Artist/, cols: { year: 0, title: 1, artist: 2 }, bonus: true },
  ],
  gh2: [
    { section: /^Main setlist$/, header: /Year.*Song title.*Artist.*Master.*PlayStation 2 Tier.*Xbox 360 Tier/, cols: { year: 0, title: 1, artist: 2, master: 3, tierAlt: 4, tier: 5 }, altMissingPlatform: 'Xbox 360' },
    { section: /^Bonus songs$/, header: /Year.*Song title.*Artist/, cols: { year: 0, title: 1, artist: 2 }, bonus: true, notePlatform: { b: 'Xbox 360' } },
  ],
  gh80: [
    { section: /^Soundtrack$/, header: /Year.*Song title.*Artist.*Master.*Tier/, cols: { year: 0, title: 1, artist: 2, master: 3, tier: 4 } },
  ],
  gh3: [
    { section: /^Main setlist$/, header: /Year.*Song title.*Artist.*Genre.*Master.*Solo tier.*Co-op tier/, cols: { year: 0, title: 1, artist: 2, master: 4, tier: 5, tierCoop: 6 } },
    { section: /^Bonus songs$/, header: /Year.*Song title.*Artist.*Genre.*Master/, cols: { year: 0, title: 1, artist: 2, master: 4 }, bonus: true },
  ],
  gha: [
    { section: /^Main setlist$/, header: /Year.*Song title.*Artist.*Master.*Tier/, cols: { year: 0, title: 1, artist: 2, master: 3, tier: 4 } },
    { section: /^Bonus songs$/, header: /Year.*Song title.*Artist/, cols: { year: 0, title: 1, artist: 2 }, bonus: true },
  ],
  ghwt: [
    { section: /^Main setlist$/, header: /Year.*Song.*Artist.*Guitar Tour.*Band Tour.*Exportable/, cols: { year: 0, title: 1, artist: 2, tier: 4 } },
  ],
  ghm: [
    { section: /^Main setlist$/, header: /Year.*Song title.*Artist.*Tier.*Exportable/, cols: { year: 0, title: 1, artist: 2, tier: 3 }, notePlatform: { exclusive: 'PS2/Wii' } },
  ],
  ghsh: [
    { section: /^Soundtrack$/, header: /Year.*Song Title.*Artist.*Genre.*Original Game.*Guitar Tier.*Band Tier/, cols: { year: 0, title: 1, artist: 2, orig: 4, tier: 6 } },
  ],
  gh5: [
    { section: /^Main setlist$/, header: /Year.*Song.*Artist.*Career Venue.*Genre.*Exportable/, cols: { year: 0, title: 1, artist: 2, tier: 3 } },
  ],
  bh: [
    { section: /^Console soundtrack$/, header: /Year.*Song Title.*Artist.*Venue.*Genre.*Order.*Exportable/, cols: { year: 0, title: 1, artist: 2, tier: 3, order: 5 } },
  ],
  ghvh: [
    { section: /^Soundtrack$/, header: /Year.*Song title.*Artist.*Guitar Career.*Band Career/, cols: { year: 0, title: 1, artist: 2, tier: 4 } },
  ],
  ghwor: [
    { section: /^Main setlist$/, header: /Year.*Song.*Artist.*Genre.*Quest/, cols: { year: 0, title: 1, artist: 2, tier: 4 } },
  ],
  ghl: [
    { section: /^On-disc soundtrack$/, header: /Show\/Venue.*Band.*Artist.*Song.*Year.*Genre/, cols: { group: 0, artist: 2, title: 3, year: 4 } },
  ],
};

const ORIGINAL_GAME = { 1: 'gh1', 2: 'gh2', 3: 'gh80', 4: 'gh3', 5: 'gha' };

function parseArtist(cell) {
  const [first = '', ...rest] = cell.lines;
  const extra = rest.join(' ');
  const cover = extra.match(/cover by\s+([^)]+)/i);
  const inspired = extra.match(/inspired by\s+([^)]+)/i);
  if (inspired) return { artist: inspired[1].trim(), cover: true, coverBy: first.trim() };
  return { artist: first.trim(), cover: !!cover, coverBy: cover ? cover[1].trim() : undefined };
}

export async function parseGame(game) {
  const raw = stripComments(await readFile(join(here, 'cache', `${game}.wikitext`), 'utf8'));
  const entries = [];
  const warnings = [];
  for (const cfg of CONFIG[game]) {
    const found = tables(section(raw, cfg.section));
    if (!found.length) throw new Error(`${game}: nenhuma tabela em ${cfg.section}`);
    const { header, rows } = tableRows(found[0]);
    const headerText = header.map((h) => parseCell(h).text).join(' | ');
    if (!cfg.header.test(headerText)) {
      throw new Error(`${game}: cabeçalho inesperado em ${cfg.section}: "${headerText}"`);
    }
    const width = header.length;
    for (const cells of rows) {
      if (cells.length !== width) {
        throw new Error(`${game}: linha com ${cells.length} células (esperado ${width}): ${cells.join(' || ').slice(0, 160)}`);
      }
      const c = Object.fromEntries(Object.entries(cfg.cols).map(([k, i]) => [k, parseCell(cells[i])]));
      for (const cell of Object.values(c)) {
        if (cell.unknown.length) warnings.push(`${game}: template desconhecido ${cell.unknown.join(',')}`);
      }
      const { title, version } = parseTitle(c.title);
      if (EXCLUDE.test(title)) continue;
      const { artist, cover, coverBy } = parseArtist(c.artist);
      const yearMatch = c.year.text.match(/\d{4}/);
      const entry = {
        game,
        title,
        artist,
        year: yearMatch ? parseInt(yearMatch[0], 10) : null,
        titleLinks: c.title.links.map((l) => l.target),
        notes: [...c.title.notes, ...c.artist.notes],
      };
      if (version) entry.version = version;
      if (cfg.bonus) entry.bonus = true;
      if (cfg.allCovers || cover || (c.master && c.master.text !== 'yes')) entry.cover = true;
      if (coverBy) entry.coverBy = coverBy;

      let tier = c.tier ? parseTier(c.tier) : null;
      if (!tier && c.tierCoop) {
        tier = parseTier(c.tierCoop);
        if (tier) entry.coop = true;
      }
      if (c.tier && !tier && !entry.coop) {
        throw new Error(`${game}: música sem tier: ${title}`);
      }
      if (tier) {
        entry.tier = tier.n;
        entry.pos = tier.m;
        entry.tierLabel = tier.label;
        if (tier.encore) entry.encore = true;
        if (tier.boss) entry.boss = true;
      }
      if (c.order) entry.pos = parseInt(c.order.text, 10);
      if (c.group) entry.group = c.group.text;
      if (c.tierAlt && cfg.altMissingPlatform && !parseTier(c.tierAlt)) entry.platform = cfg.altMissingPlatform;
      if (cfg.notePlatform) {
        for (const note of entry.notes) {
          if (cfg.notePlatform[note]) entry.platform = cfg.notePlatform[note];
        }
      }
      if (c.orig) {
        const n = parseInt(c.orig.sortKeys[0], 10);
        entry.origGame = ORIGINAL_GAME[n];
        if (!entry.origGame) throw new Error(`${game}: jogo original desconhecido para ${title}`);
      }
      entries.push(entry);
    }
  }
  return { entries, warnings };
}

export async function parseAll() {
  const sources = JSON.parse(await readFile(join(here, 'sources.json'), 'utf8'));
  const result = [];
  for (const src of sources) {
    const { entries, warnings } = await parseGame(src.game);
    result.push({ ...src, entries, warnings });
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const all = await parseAll();
  let total = 0;
  for (const g of all) {
    total += g.entries.length;
    console.log(`${g.game.padEnd(6)} ${String(g.entries.length).padStart(3)}  ${g.warnings.length ? 'avisos: ' + [...new Set(g.warnings)].join('; ') : ''}`);
  }
  console.log(`total  ${total}`);
  const pick = process.argv[2];
  if (pick) console.log(JSON.stringify(all.find((g) => g.game === pick).entries, null, 1));
}
