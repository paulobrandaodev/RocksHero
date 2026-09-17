// Gera o logo da banda (SVG com texto convertido em paths) e as versões PNG.
// Uso: node logo/build-logo.mjs (dentro de tools/)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outDir = join(root, 'assets', 'logo');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const buf = await readFile(join(here, '..', 'fonts', 'ttf', 'MetalMania-Regular.ttf'));
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const r1 = (n) => {
  const s = n.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
};

// Texto → path SVG centrado em cx, com arco (arch > 0 sobe o centro).
function textPath(text, { cx, baseline, size, spacing = 0, arch = 0 }) {
  const glyphs = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;
  let width = 0;
  glyphs.forEach((g, i) => { width += g.advanceWidth * scale + (i < glyphs.length - 1 ? spacing : 0); });
  let x = cx - width / 2;
  const half = width / 2;
  const warp = (px, py) => {
    const t = (px - cx) / half;
    return [px, py - arch * (1 - Math.min(1, t * t))];
  };
  const parts = [];
  glyphs.forEach((g) => {
    const path = g.getPath(x, baseline, size);
    let d = '';
    for (const c of path.commands) {
      if (c.type === 'Z') { d += 'Z'; continue; }
      const [px, py] = warp(c.x, c.y);
      if (c.type === 'M' || c.type === 'L') d += `${c.type}${r1(px)} ${r1(py)}`;
      else if (c.type === 'Q') { const [ax, ay] = warp(c.x1, c.y1); d += `Q${r1(ax)} ${r1(ay)} ${r1(px)} ${r1(py)}`; }
      else if (c.type === 'C') { const [ax, ay] = warp(c.x1, c.y1); const [bx, by] = warp(c.x2, c.y2); d += `C${r1(ax)} ${r1(ay)} ${r1(bx)} ${r1(by)} ${r1(px)} ${r1(py)}`; }
    }
    parts.push(d);
    x += g.advanceWidth * scale + spacing;
  });
  return { d: parts.join(''), width };
}

// Chamas procedurais: uma fileira de línguas de fogo com envelope mais alto no meio.
function flames({ cx, baseY, width, height, tongues, seed, valley = 0.38 }) {
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const left = cx - width / 2;
  const step = width / tongues;
  const env = (u) => Math.pow(Math.sin(Math.PI * u), 0.42);
  const valleyAt = (i) => baseY - height * env(i / tongues) * valley;
  let d = `M${r1(left)} ${r1(baseY)}L${r1(left)} ${r1(valleyAt(0))}`;
  for (let i = 0; i < tongues; i++) {
    const vx = left + i * step;
    const vy = valleyAt(i);
    const nx = vx + step;
    const ny = valleyAt(i + 1);
    const u = (i + 0.5) / tongues;
    const lean = (u - 0.5) * 2 + (rand() - 0.5) * 0.8;
    const tx = vx + step * (0.5 + lean * 0.45);
    const ty = baseY - height * (0.55 + 0.45 * rand()) * env(u);
    d += `C${r1(vx + step * 0.15)} ${r1(vy - (vy - ty) * 0.45)} ${r1(tx - step * 0.35 * Math.sign(lean || 1))} ${r1(ty + (vy - ty) * 0.35)} ${r1(tx)} ${r1(ty)}`;
    d += `C${r1(tx + step * 0.1 * Math.sign(lean || 1))} ${r1(ty + (ny - ty) * 0.45)} ${r1(nx - step * 0.18)} ${r1(ny - (ny - ty) * 0.25)} ${r1(nx)} ${r1(ny)}`;
  }
  d += `L${r1(left + width)} ${r1(baseY)}Q${r1(cx)} ${r1(baseY + height * 0.12)} ${r1(left)} ${r1(baseY)}Z`;
  return d;
}

// Guitarra estilo SG, desenhada em pé (headstock em cima), origem no topo do headstock.
function guitar() {
  const frets = [];
  let y = 100;
  let gap = 24;
  for (let i = 0; i < 12; i++) { y += gap; gap *= 0.945; frets.push(y); }
  const neckX = (fy) => 12 + (fy - 100) * (3 / 260);
  const fretLines = frets.map((fy) => `<line x1="${r1(-neckX(fy))}" y1="${r1(fy)}" x2="${r1(neckX(fy))}" y2="${r1(fy)}"/>`).join('');
  const dots = [2, 4, 6, 8].map((i) => `<circle cx="0" cy="${r1((frets[i] + frets[i + 1]) / 2)}" r="3.2"/>`).join('')
    + `<circle cx="-6" cy="${r1((frets[10] + frets[11]) / 2)}" r="3"/><circle cx="6" cy="${r1((frets[10] + frets[11]) / 2)}" r="3"/>`;
  const pegs = [26, 50, 74].map((py) => `<rect x="-36" y="${py - 3}" width="12" height="6" rx="2"/><circle cx="-38" cy="${py}" r="7"/><rect x="24" y="${py - 3}" width="12" height="6" rx="2"/><circle cx="38" cy="${py}" r="7"/>`).join('');
  const strings = [-5, -3, -1, 1, 3, 5].map((k) => `<line x1="${k * 1.8}" y1="98" x2="${k * 2.8}" y2="560"/>`).join('');
  return `
    <g class="guitar">
      <g fill="url(#chrome)" stroke="#07070a" stroke-width="3">${pegs}</g>
      <path d="M-27 14Q-31 0-19-5L0 5L19-5Q31 0 27 14L23 88Q21 98 12 98L-12 98Q-21 98-23 88Z" fill="#141016" stroke="#07070a" stroke-width="5"/>
      <path d="M-20 14L0 20L20 14" fill="none" stroke="url(#chrome)" stroke-width="3"/>
      <path d="M-12 100L12 100L15 362L-15 362Z" fill="#3b2417" stroke="#07070a" stroke-width="5"/>
      <g stroke="#d9dee5" stroke-width="2.2">${fretLines}</g>
      <g fill="#f3efe4">${dots}</g>
      <rect x="-13" y="95" width="26" height="6" fill="#efe6cc"/>
      <path d="M-20 350C-40 330-70 300-88 318C-102 334-98 372-110 402C-124 442-142 470-142 522C-142 602-82 644 0 644C82 644 142 602 142 522C142 470 120 442 106 406C96 378 106 338 92 322C78 306 44 330 20 350Z" fill="url(#cherry)" stroke="#07070a" stroke-width="7"/>
      <path d="M-20 350C-40 330-70 300-88 318C-102 334-98 372-110 402C-124 442-142 470-142 522C-142 602-82 644 0 644C82 644 142 602 142 522C142 470 120 442 106 406C96 378 106 338 92 322C78 306 44 330 20 350Z" fill="none" stroke="#ff8a7a" stroke-opacity=".35" stroke-width="3" transform="translate(0 3) scale(.97)"/>
      <path d="M-44 414Q-66 446-60 506Q-54 552-12 560L44 560Q76 548 64 470L46 414Z" fill="#0c0b0f" stroke="#2c2a33" stroke-width="2"/>
      <g fill="#0b0b0d" stroke="url(#chrome)" stroke-width="4">
        <rect x="-30" y="410" width="60" height="30" rx="4"/>
        <rect x="-30" y="486" width="60" height="30" rx="4"/>
      </g>
      <g fill="#8d96a3">${[-20, -12, -4, 4, 12, 20].map((px) => `<circle cx="${px}" cy="425" r="2.2"/><circle cx="${px}" cy="501" r="2.2"/>`).join('')}</g>
      <rect x="-34" y="540" width="68" height="12" rx="3" fill="url(#chrome)" stroke="#07070a" stroke-width="2.5"/>
      <rect x="-38" y="574" width="76" height="12" rx="4" fill="url(#chrome)" stroke="#07070a" stroke-width="2.5"/>
      <g fill="url(#gold)" stroke="#07070a" stroke-width="2.5">
        <circle cx="74" cy="560" r="11"/><circle cx="102" cy="538" r="11"/><circle cx="74" cy="604" r="11"/><circle cx="104" cy="584" r="11"/>
      </g>
      <g stroke="#e8ecf2" stroke-opacity=".85" stroke-width="1">${strings}</g>
    </g>`;
}

const GEMS = [
  ['#1fd14a', '#0b7a26'],
  ['#ff2b2b', '#9c0b0b'],
  ['#ffd400', '#b58a00'],
  ['#2f86ff', '#0c3f9e'],
  ['#ff8a00', '#b04d00'],
];

function gems({ cx, cy, r, gap }) {
  return GEMS.map(([light, dark], i) => {
    const x = cx + (i - 2) * gap;
    return `
      <g transform="translate(${r1(x)} ${r1(cy)})">
        <circle r="${r + 7}" fill="#07070a"/>
        <circle r="${r + 3}" fill="url(#chrome)"/>
        <circle r="${r - 1}" fill="${dark}"/>
        <circle r="${r - 4}" fill="url(#gem${i})"/>
        <ellipse cx="${-r * 0.3}" cy="${-r * 0.38}" rx="${r * 0.38}" ry="${r * 0.2}" fill="#fff" fill-opacity=".75" transform="rotate(-25)"/>
      </g>`;
  }).join('');
}

const sparkle = (x, y, s) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-20C2-5 5-2 20 0C5 2 2 5 0 20C-2 5-5 2-20 0C-5-2-2-5 0-20Z" fill="#fff"/>`;

const gradients = `
    <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".38" stop-color="#c3ccd6"/>
      <stop offset=".5" stop-color="#4f5b69"/><stop offset=".62" stop-color="#e9eef4"/><stop offset="1" stop-color="#8e9aa8"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#c9921c"/><stop offset="1" stop-color="#ffe07a"/>
    </linearGradient>
    <linearGradient id="fire" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffbd1"/><stop offset=".22" stop-color="#ffe14d"/>
      <stop offset=".55" stop-color="#ff8f00"/><stop offset=".85" stop-color="#e3200f"/><stop offset="1" stop-color="#8e0a06"/>
    </linearGradient>
    <linearGradient id="cherry" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e2323a"/><stop offset=".55" stop-color="#9c0d16"/><stop offset="1" stop-color="#4d0508"/>
    </linearGradient>
    <linearGradient id="flameOuter" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#7a0604"/><stop offset=".5" stop-color="#d1220c"/><stop offset="1" stop-color="#ff5a00" stop-opacity=".9"/>
    </linearGradient>
    <linearGradient id="flameMid" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ff5a00"/><stop offset=".6" stop-color="#ff9a00"/><stop offset="1" stop-color="#ffd000"/>
    </linearGradient>
    <linearGradient id="flameCore" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ffd84a"/><stop offset="1" stop-color="#fff7c2"/>
    </linearGradient>
    ${GEMS.map(([light, dark], i) => `<radialGradient id="gem${i}" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".25" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient>`).join('')}
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="10" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="drop" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#000" flood-opacity=".6"/>
    </filter>`;

function fullLogo() {
  const rocks = textPath('ROCKS', { cx: 500, baseline: 238, size: 170, spacing: 10, arch: 26 });
  const hero = textPath('HERO', { cx: 500, baseline: 455, size: 305, spacing: 6, arch: 14 });
  const flameBack = flames({ cx: 500, baseY: 500, width: 940, height: 580, tongues: 12, seed: 7, valley: 0.3 });
  const flameMid = flames({ cx: 500, baseY: 500, width: 752, height: 435, tongues: 10, seed: 21, valley: 0.3 });
  const flameCore = flames({ cx: 500, baseY: 500, width: 564, height: 290, tongues: 8, seed: 5, valley: 0.5 });
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1000 640" role="img" aria-labelledby="t">
  <title id="t">Rocks Hero</title>
  <defs>${gradients}
    <path id="rocks" d="${rocks.d}"/>
    <path id="hero" d="${hero.d}"/>
  </defs>
  <g filter="url(#glow)" opacity=".95">
    <path d="${flameBack}" fill="url(#flameOuter)"/>
    <path d="${flameMid}" fill="url(#flameMid)"/>
    <path d="${flameCore}" fill="url(#flameCore)" opacity=".85"/>
  </g>
  <g transform="translate(520 350) rotate(75) scale(1.3) translate(0 -330)" filter="url(#drop)">${guitar()}</g>
  <g filter="url(#drop)">
    <use href="#rocks" xlink:href="#rocks" fill="none" stroke="#07070a" stroke-width="26" stroke-linejoin="round"/>
    <use href="#rocks" xlink:href="#rocks" fill="url(#chrome)" stroke="#f7fbff" stroke-width="2.5" stroke-linejoin="round"/>
  </g>
  <g filter="url(#drop)">
    <use href="#hero" xlink:href="#hero" fill="none" stroke="#07070a" stroke-width="38" stroke-linejoin="round"/>
    <use href="#hero" xlink:href="#hero" fill="none" stroke="url(#chrome)" stroke-width="16" stroke-linejoin="round"/>
    <use href="#hero" xlink:href="#hero" fill="url(#fire)" stroke="#5a0a05" stroke-width="2" stroke-linejoin="round"/>
  </g>
  ${gems({ cx: 500, cy: 535, r: 22, gap: 66 })}
  ${sparkle(318, 150, 1.2)}${sparkle(708, 276, 0.9)}${sparkle(262, 360, 0.7)}
</svg>
`;
}

function markLogo({ background = false } = {}) {
  const rh = textPath('RH', { cx: 256, baseline: 330, size: 250, spacing: 2, arch: 8 });
  const pick = 'M256 26C356 26 470 60 470 150C470 290 350 420 256 490C162 420 42 290 42 150C42 60 156 26 256 26Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" role="img" aria-labelledby="t">
  <title id="t">Rocks Hero</title>
  <defs>${gradients}
    <radialGradient id="pickBg" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#3a0d10"/><stop offset="1" stop-color="#0a0609"/></radialGradient>
    <path id="rh" d="${rh.d}"/>
  </defs>
  ${background ? '<rect width="512" height="512" fill="#0b0a0f"/>' : ''}
  <path d="${pick}" fill="url(#pickBg)" stroke="#07070a" stroke-width="18"/>
  <path d="${pick}" fill="none" stroke="url(#chrome)" stroke-width="10" transform="translate(256 258) scale(.93) translate(-256 -258)"/>
  <path d="${flames({ cx: 256, baseY: 370, width: 300, height: 230, tongues: 6, seed: 11 })}" fill="url(#flameOuter)" opacity=".9"/>
  <use href="#rh" xlink:href="#rh" fill="none" stroke="#07070a" stroke-width="30" stroke-linejoin="round"/>
  <use href="#rh" xlink:href="#rh" fill="none" stroke="url(#chrome)" stroke-width="12" stroke-linejoin="round"/>
  <use href="#rh" xlink:href="#rh" fill="url(#fire)"/>
  <g transform="translate(0 -6)">${gems({ cx: 256, cy: 402, r: 11, gap: 34 })}</g>
</svg>
`;
}

await mkdir(outDir, { recursive: true });
const full = fullLogo();
const mark = markLogo();
const markBg = markLogo({ background: true });
await writeFile(join(outDir, 'rocks-hero.svg'), full);
await writeFile(join(outDir, 'rocks-hero-mark.svg'), mark);
await writeFile(join(outDir, 'favicon.svg'), mark);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
async function png(svg, width, height, file, { transparent = true } = {}) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await page.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : '#0b0a0f'}"><img src="${src}" style="display:block;width:${width}px;height:${height}px"></body></html>`);
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: join(outDir, file), omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
  console.log(`+ ${file}`);
}
await png(full, 1024, 655, 'rocks-hero-1024.png');
await png(full, 512, 328, 'rocks-hero-512.png');
await png(mark, 512, 512, 'icon-512.png');
await png(mark, 192, 192, 'icon-192.png');
await png(markBg, 180, 180, 'apple-touch-icon.png', { transparent: false });
await png(markBg, 512, 512, 'icon-maskable-512.png', { transparent: false });
await browser.close();
console.log(`SVG: ${(full.length / 1024).toFixed(0)} KB (logo), ${(mark.length / 1024).toFixed(0)} KB (marca)`);
