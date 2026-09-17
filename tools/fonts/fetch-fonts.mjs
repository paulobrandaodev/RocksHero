// Baixa as fontes do Google Fonts (woff2, subconjuntos latin e latin-ext) para assets/fonts/
// e gera css/fonts.css. Também baixa os TTF usados para desenhar o logo e as licenças.
// Uso: node fonts/fetch-fonts.mjs (dentro de tools/)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const fontsDir = join(root, 'assets', 'fonts');
const ttfDir = join(here, 'ttf');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const FAMILIES = [
  { css: 'Metal+Mania', file: 'metal-mania', license: 'ofl/metalmania/OFL.txt', ttf: 'ofl/metalmania/MetalMania-Regular.ttf' },
  { css: 'Oswald:wght@400..700', file: 'oswald', license: 'ofl/oswald/OFL.txt' },
  { css: 'Permanent+Marker', file: 'permanent-marker', license: 'apache/permanentmarker/LICENSE.txt' },
];
const SUBSETS = ['latin', 'latin-ext'];

const get = async (url, as = 'text') => {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
};

await mkdir(fontsDir, { recursive: true });
await mkdir(ttfDir, { recursive: true });
const out = ['/* Gerado por tools/fonts/fetch-fonts.mjs. Fontes: Google Fonts (licenças em assets/fonts/). */'];

for (const fam of FAMILIES) {
  const css = await get(`https://fonts.googleapis.com/css2?family=${fam.css}&display=swap`);
  const blocks = [...css.matchAll(/\/\* ([\w-]+) \*\/\s*@font-face \{([^}]+)\}/g)];
  for (const [, subset, body] of blocks) {
    if (!SUBSETS.includes(subset)) continue;
    const url = body.match(/url\((https:[^)]+\.woff2)\)/)[1];
    const name = `${fam.file}-${subset}.woff2`;
    await writeFile(join(fontsDir, name), await get(url, 'buffer'));
    const rule = body.replace(/src:[^;]+;/, `src: url('../assets/fonts/${name}') format('woff2');`).trim().replace(/\n\s*/g, '\n  ');
    out.push(`/* ${subset} */\n@font-face {\n  ${rule}\n}`);
    console.log(`+ ${name}`);
  }
  const base = 'https://raw.githubusercontent.com/google/fonts/main/';
  await writeFile(join(fontsDir, `LICENSE-${fam.file}.txt`), await get(base + fam.license));
  if (fam.ttf) await writeFile(join(ttfDir, fam.ttf.split('/').pop()), await get(base + fam.ttf, 'buffer'));
}
await writeFile(join(root, 'css', 'fonts.css'), out.join('\n\n') + '\n');
console.log('css/fonts.css gerado');
