// Atualiza a versão do app em js/version.js, index.html (?v=) e sw.js.
// Uso: node tools/bump-version.mjs 1.0.1
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('Informe a nova versão, ex.: node tools/bump-version.mjs 1.0.1');
  process.exit(1);
}
const edit = async (file, fn) => {
  const path = join(root, file);
  await writeFile(path, fn(await readFile(path, 'utf8')));
};
await edit('js/version.js', (s) => s.replace(/RH\.VERSION = '[^']*'/, `RH.VERSION = '${version}'`));
await edit('index.html', (s) => s.replace(/\?v=[\d.]+/g, `?v=${version}`));
await edit('sw.js', (s) => s.replace(/const VERSION = '[^']*'/, `const VERSION = '${version}'`));
console.log(`Versão ${version} aplicada.`);
