// Captura o set list em modo de impressão (modo local).
import puppeteer from 'puppeteer-core';
import { startServer } from '../e2e/server.mjs';
const out = process.argv[2];
const { server, url } = await startServer();
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 794, height: 1123 });
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rh:v1:ui:asked-me', '1'); } catch {} });
await page.goto(`${url}?local=1#/setlist`); // modo local: nunca toca no Firebase de verdade
await page.type('#login-password', 'Hero@123');
await page.keyboard.press('Enter');
await page.waitForFunction(() => RH.store && RH.store.members().length === 4);
await page.evaluate(() => {
  const ids = ['deep-purple--smoke-on-the-water', 'nirvana--heart-shaped-box', 'guns-n-roses--sweet-child-o-mine', 'boston--more-than-a-feeling', 'metallica--sad-but-true', 'eagles--hotel-california'];
  ids.forEach((id, i) => { RH.store.addToSetlist(id); ['m-vocal', 'm-guitarra', 'm-baixo', 'm-bateria'].forEach((m, j) => RH.store.setProgress(id, m, 40 + i * 10 + j * 5)); });
  RH.store.renameSetlist('Show no Bar do Zé');
});
await page.waitForSelector('.sl-item');
await new Promise((r) => setTimeout(r, 500));
await page.emulateMediaType('print');
await page.screenshot({ path: out, fullPage: true });
await browser.close();
server.close();
