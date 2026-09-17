// Gera artes SVG originais: plateia (login) e amplificador com guitarra (set list vazio).
// Uso: node art/build-art.mjs [preview.png] (dentro de tools/)
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'art');
await mkdir(out, { recursive: true });
const r = (n) => Math.round(n * 10) / 10;

// ---------- Plateia: cabeças, ombros e mãos com "chifrinho" ----------
function crowd() {
  let seed = 42;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const W = 800;
  const H = 200;
  const people = [];
  for (let row = 0; row < 2; row++) {
    const count = row === 0 ? 17 : 14;
    for (let i = 0; i < count; i++) {
      const x = (i + (row ? 0.5 : 0) + (rand() - 0.5) * 0.5) * (W / count);
      const y = row === 0 ? 118 + rand() * 18 : 146 + rand() * 14;
      const s = row === 0 ? 0.85 + rand() * 0.15 : 1 + rand() * 0.15;
      people.push({ x, y, s, row, arm: rand(), side: rand() < 0.5 ? -1 : 1, tilt: (rand() - 0.5) * 0.5 });
    }
  }
  const parts = people.map(({ x, y, s, row, arm, side, tilt }) => {
    const fill = row === 0 ? '#120c16' : '#050307';
    let g = `<g fill="${fill}" transform="translate(${r(x)} ${r(y)}) scale(${r(s * 100) / 100})">`;
    g += '<ellipse cx="0" cy="-26" rx="13" ry="15"/>';
    g += '<path d="M-34 90C-34 20-24 -4 0 -6 24 -4 34 20 34 90Z"/>';
    if (arm > 0.35) {
      const angle = side * (18 + tilt * 30);
      g += `<g transform="translate(${side * 22} 0) rotate(${r(angle)})">`;
      g += '<rect x="-6" y="-78" width="12" height="80" rx="6"/>';
      g += arm > 0.6
        ? '<rect x="-9" y="-92" width="18" height="18" rx="6"/><rect x="-9" y="-116" width="5" height="26" rx="2.5"/><rect x="4" y="-116" width="5" height="26" rx="2.5"/>'
        : '<ellipse cx="0" cy="-84" rx="9" ry="11"/>';
      g += '</g>';
    }
    return `${g}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice">
  <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".55" stop-color="#000" stop-opacity=".6"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
  ${parts.join('')}
  <rect x="0" y="120" width="${W}" height="${H - 120}" fill="url(#fade)"/>
</svg>
`;
}

// ---------- Amplificador com guitarra encostada ----------
function amp() {
  const knobs = Array.from({ length: 6 }, (_, i) => {
    const x = 92 + i * 32;
    return `<circle cx="${x}" cy="89" r="8" fill="url(#knob)" stroke="#0a0a0a" stroke-width="2"/><line x1="${x}" y1="89" x2="${x + 4}" y2="83" stroke="#0a0a0a" stroke-width="2"/>`;
  }).join('');
  const corners = [[38, 124], [268, 124], [38, 292], [268, 292]]
    .map(([x, y]) => `<rect x="${x}" y="${y}" width="18" height="18" fill="url(#chrome)" stroke="#050407" stroke-width="2"/>`).join('');
  const pegs = [-186, -178, -170]
    .map((y) => `<circle cx="-12" cy="${y}" r="3.5" fill="url(#chrome)" stroke="#050407" stroke-width="1.5"/><circle cx="12" cy="${y}" r="3.5" fill="url(#chrome)" stroke="#050407" stroke-width="1.5"/>`).join('');
  const frets = Array.from({ length: 9 }, (_, i) => `<line x1="-5" y1="${-165 + i * 11}" x2="5" y2="${-165 + i * 11}" stroke="#d9dee5" stroke-width="1.5"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 330" role="img" aria-label="Amplificador e guitarra">
  <defs>
    <radialGradient id="glow" cx=".45" cy=".55" r=".6"><stop offset="0" stop-color="#ff7a00" stop-opacity=".45"/><stop offset="1" stop-color="#ff7a00" stop-opacity="0"/></radialGradient>
    <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#9aa5b1"/><stop offset=".55" stop-color="#4b5561"/><stop offset="1" stop-color="#dfe5ec"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d27a"/><stop offset=".5" stop-color="#b8862b"/><stop offset="1" stop-color="#e9c06a"/></linearGradient>
    <radialGradient id="knob" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#b6bec8"/><stop offset="1" stop-color="#3a414a"/></radialGradient>
    <pattern id="grille" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#22202a"/><rect width="3" height="8" fill="#2f2c38"/></pattern>
    <linearGradient id="vbody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe14d"/><stop offset=".5" stop-color="#ff8f00"/><stop offset="1" stop-color="#d7140f"/></linearGradient>
  </defs>
  <ellipse cx="180" cy="190" rx="175" ry="140" fill="url(#glow)"/>
  <ellipse cx="170" cy="312" rx="150" ry="12" fill="#000" opacity=".5"/>
  <rect x="44" y="58" width="236" height="62" rx="10" fill="#18161d" stroke="#050407" stroke-width="4"/>
  <rect x="56" y="70" width="212" height="38" rx="6" fill="url(#gold)" stroke="#050407" stroke-width="2"/>
  ${knobs}
  <rect x="62" y="44" width="30" height="16" rx="3" fill="url(#chrome)" stroke="#050407" stroke-width="2"/>
  <rect x="232" y="44" width="30" height="16" rx="3" fill="url(#chrome)" stroke="#050407" stroke-width="2"/>
  <rect x="38" y="124" width="248" height="186" rx="12" fill="#18161d" stroke="#050407" stroke-width="4"/>
  <rect x="54" y="140" width="216" height="154" rx="6" fill="url(#grille)" stroke="#0a090c" stroke-width="3"/>
  <circle cx="110" cy="190" r="36" fill="none" stroke="#3b3746" stroke-width="3" opacity=".7"/>
  <circle cx="214" cy="190" r="36" fill="none" stroke="#3b3746" stroke-width="3" opacity=".7"/>
  <circle cx="110" cy="252" r="36" fill="none" stroke="#3b3746" stroke-width="3" opacity=".5"/>
  <circle cx="214" cy="252" r="36" fill="none" stroke="#3b3746" stroke-width="3" opacity=".5"/>
  ${corners}
  <rect x="136" y="126" width="52" height="12" rx="3" fill="url(#chrome)" stroke="#050407" stroke-width="2"/>
  <path d="M250 150C300 150 330 190 318 240S250 300 300 312 350 300 356 290" fill="none" stroke="#0a090c" stroke-width="7" stroke-linecap="round"/>
  <path d="M250 150C300 150 330 190 318 240S250 300 300 312 350 300 356 290" fill="none" stroke="#3a3542" stroke-width="3" stroke-linecap="round"/>
  <g transform="translate(300 206) rotate(-18)">
    <path d="M-6 -196h12l3 22h-18z" fill="#141016" stroke="#050407" stroke-width="3"/>
    ${pegs}
    <rect x="-5" y="-175" width="10" height="110" fill="#3b2417" stroke="#050407" stroke-width="3"/>
    ${frets}
    <path d="M-16 -70h32l36 118-22 6-30-50-30 50-22-6z" fill="url(#vbody)" stroke="#050407" stroke-width="5" stroke-linejoin="round"/>
    <rect x="-13" y="-52" width="26" height="12" rx="2" fill="#0b0b0d" stroke="url(#chrome)" stroke-width="2.5"/>
    <rect x="-13" y="-30" width="26" height="12" rx="2" fill="#0b0b0d" stroke="url(#chrome)" stroke-width="2.5"/>
    <rect x="-14" y="-10" width="28" height="6" rx="2" fill="url(#chrome)" stroke="#050407" stroke-width="1.5"/>
    <circle cx="22" cy="20" r="5" fill="url(#gold)" stroke="#050407" stroke-width="1.5"/>
    <circle cx="30" cy="34" r="5" fill="url(#gold)" stroke="#050407" stroke-width="1.5"/>
  </g>
</svg>
`;
}

const crowdSvg = crowd();
const ampSvg = amp();
await writeFile(join(out, 'crowd.svg'), crowdSvg);
await writeFile(join(out, 'amp.svg'), ampSvg);
console.log('assets/art/crowd.svg e assets/art/amp.svg gerados');

const preview = process.argv[2];
if (preview) {
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 420 });
  const b64 = (s) => Buffer.from(s).toString('base64');
  await page.setContent(`<body style="margin:0;background:radial-gradient(circle at 50% 100%,#ff5a00,#200a10 60%);display:flex;gap:20px;align-items:flex-end;height:420px">
    <img style="width:520px" src="data:image/svg+xml;base64,${b64(crowdSvg)}"><img style="width:330px" src="data:image/svg+xml;base64,${b64(ampSvg)}"></body>`);
  await new Promise((res) => setTimeout(res, 300));
  await page.screenshot({ path: preview });
  await browser.close();
}
