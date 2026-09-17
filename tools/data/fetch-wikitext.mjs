// Baixa o wikitext das 13 fontes (revisões fixadas) para tools/data/cache/.
// Uso: node tools/data/fetch-wikitext.mjs [--force]
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = join(here, 'cache');
const force = process.argv.includes('--force');
const sources = JSON.parse(await readFile(join(here, 'sources.json'), 'utf8'));

await mkdir(cacheDir, { recursive: true });

for (const src of sources) {
  const file = join(cacheDir, `${src.game}.wikitext`);
  if (!force) {
    try { await access(file); console.log(`= ${src.game} (cache)`); continue; } catch {}
  }
  const url = `https://en.wikipedia.org/w/index.php?oldid=${src.oldid}&action=raw`;
  const res = await fetch(url, { headers: { 'User-Agent': 'RocksHeroSetlist/1.0 (band fan project)' } });
  if (!res.ok) throw new Error(`${src.game}: HTTP ${res.status}`);
  const text = await res.text();
  await writeFile(file, text, 'utf8');
  console.log(`+ ${src.game}: ${text.length} chars`);
}
