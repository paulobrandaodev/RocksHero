// Renderiza todos os ícones em tamanho grande e pequeno (via <use> e via máscara CSS).
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const out = process.argv[2];
const js = await readFile(join(root, 'js', 'icons.js'), 'utf8');
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 560 });
await page.setContent(`<html><head><style>
  body{margin:0;background:#15121b;color:#f4f1ea;font:12px sans-serif;padding:12px}
  .row{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px}
  .cell{display:flex;flex-direction:column;align-items:center;gap:6px;width:82px}
  .icon{width:64px;height:64px;fill:currentColor}
  .sm .icon{width:20px;height:20px}
  .mi{display:inline-block;width:20px;height:20px;background:#ffb000;-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}
  .ui .icon{width:28px;height:28px}
</style></head><body><script>window.RH={};</script><script>${js}</script><script>
  RH.icons.install();
  const I = RH.icons;
  document.body.insertAdjacentHTML('beforeend',
    '<div class="row">' + Object.keys(I.INSTRUMENTS).map(n => '<div class="cell">' + I.svg(n) + '<span class="sm">' + I.svg(n) + ' ' + I.mask(n) + '</span>' + n + '</div>').join('') + '</div>' +
    '<div class="row ui">' + Object.keys(I.UI).map(n => '<div class="cell">' + I.svg(n) + n + '</div>').join('') + '</div>');
</script></body></html>`);
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: out, fullPage: true });
await browser.close();
