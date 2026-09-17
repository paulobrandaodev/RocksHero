// Gera vendor/firebase-rh.js (script clássico) a partir de entry.js.
// Uso: npm run firebase:bundle (dentro de tools/)
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(join(here, '..', 'node_modules', 'firebase', 'package.json'), 'utf8'));

await build({
  entryPoints: [join(here, 'entry.js')],
  outfile: join(here, '..', '..', 'vendor', 'firebase-rh.js'),
  bundle: true,
  format: 'iife',
  globalName: 'RHFirebase',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  banner: {
    js: `/*! Firebase JS SDK ${pkg.version} (app, auth, database) — Apache License 2.0 — https://github.com/firebase/firebase-js-sdk */`,
  },
});
console.log(`vendor/firebase-rh.js gerado com Firebase ${pkg.version}`);
