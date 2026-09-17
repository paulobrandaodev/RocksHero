/* Vocabulários fixos do app: afinações, partes/instrumentos e formação padrão. */
window.RH = window.RH || {};

// Afinação da guitarra na gravação original.
// `step` = semitons abaixo do Mi padrão na corda mais grave (só para ordenar/filtrar).
RH.TUNINGS = {
  'E':      { short: 'E',            label: 'Mi padrão',                          step: 0 },
  'Eb':     { short: 'E♭',           label: 'Mi♭ padrão (½ tom abaixo)',          step: 1 },
  'D':      { short: 'D',            label: 'Ré padrão (1 tom abaixo)',           step: 2 },
  'C#':     { short: 'C♯',           label: 'Dó♯ padrão (1½ tom abaixo)',         step: 3 },
  'C':      { short: 'C',            label: 'Dó padrão (2 tons abaixo)',          step: 4 },
  'B':      { short: 'B',            label: 'Si padrão (2½ tons abaixo)',         step: 5 },
  'dropD':  { short: 'Drop D',       label: 'Drop D',                             step: 2 },
  'dropC#': { short: 'Drop C♯',      label: 'Drop C♯ (Mi♭ com 6ª em Dó♯)',        step: 3 },
  'dropC':  { short: 'Drop C',       label: 'Drop C (Ré com 6ª em Dó)',           step: 4 },
  'dropB':  { short: 'Drop B',       label: 'Drop B (Dó♯ com 6ª em Si)',          step: 5 },
  'dropA':  { short: 'Drop A',       label: 'Drop A (Si com 6ª em Lá)',           step: 7 },
  'openG':  { short: 'Open G',       label: 'Aberta em Sol (Open G)',             step: 2 },
  'openD':  { short: 'Open D',       label: 'Aberta em Ré (Open D)',              step: 2 },
  'openE':  { short: 'Open E',       label: 'Aberta em Mi (Open E)',              step: 0 },
  'openA':  { short: 'Open A',       label: 'Aberta em Lá (Open A)',              step: 0 },
  'openC':  { short: 'Open C',       label: 'Aberta em Dó (Open C)',              step: 4 },
  'DADGAD': { short: 'DADGAD',       label: 'DADGAD',                             step: 2 },
  '7B':     { short: '7 cordas B',   label: 'Guitarra de 7 cordas (Si padrão)',   step: 5 },
  '7A':     { short: '7 cordas A',   label: 'Guitarra de 7 cordas (Lá padrão)',   step: 7 },
  '7dropA': { short: '7 cordas Drop A', label: 'Guitarra de 7 cordas (Drop A)',   step: 7 },
};

// Códigos livres: "other:<descrição>". null = desconhecida.
RH.tuningInfo = (code) => {
  if (code == null || code === '') return { code: null, short: '?', label: 'Afinação desconhecida', step: 99, unknown: true };
  if (RH.TUNINGS[code]) return { code, ...RH.TUNINGS[code] };
  const text = String(code).startsWith('other:') ? String(code).slice(6) : String(code);
  return { code, short: text, label: text, step: 50, other: true };
};

// Partes de uma música. A instrumentação é uma string canônica nesta ordem,
// com a letra repetida para cada parte: "vggbdk" = voz, 2 guitarras, baixo, bateria, teclado.
RH.PARTS = [
  { key: 'v', name: 'Voz',        plural: 'Vozes',       icon: 'mic',        max: 3 },
  { key: 'g', name: 'Guitarra',   plural: 'Guitarras',   icon: 'guitar',     max: 4 },
  { key: 'b', name: 'Baixo',      plural: 'Baixos',      icon: 'bass',       max: 2 },
  { key: 'd', name: 'Bateria',    plural: 'Baterias',    icon: 'drums',      max: 2 },
  { key: 'k', name: 'Teclado',    plural: 'Teclados',    icon: 'keys',       max: 3 },
  { key: 'p', name: 'Percussão',  plural: 'Percussões',  icon: 'perc',       max: 1 },
  { key: 's', name: 'Sopros',     plural: 'Sopros',      icon: 'horn',       max: 1 },
  { key: 'c', name: 'Cordas',     plural: 'Cordas',      icon: 'violin',     max: 1 },
  { key: 'h', name: 'Gaita',      plural: 'Gaitas',      icon: 'harmonica',  max: 1 },
  { key: 'j', name: 'DJ/samples', plural: 'DJ/samples',  icon: 'turntable',  max: 1 },
];

RH.INS_PATTERN = /^v{0,3}g{0,4}b{0,2}d{0,2}k{0,3}p?s?c?h?j?$/;

// "vggbd" → { v:1, g:2, b:1, d:1, k:0, ... } ; null se desconhecida.
RH.parseIns = (ins) => {
  if (typeof ins !== 'string' || !RH.INS_PATTERN.test(ins)) return null;
  const counts = {};
  RH.PARTS.forEach((p) => { counts[p.key] = 0; });
  for (let i = 0; i < ins.length; i++) counts[ins[i]]++;
  return counts;
};

RH.formatIns = (counts) =>
  RH.PARTS.map((p) => p.key.repeat(Math.max(0, Math.min(p.max, counts[p.key] || 0)))).join('');

// Instrumentos que um membro pode tocar → parte correspondente da música.
RH.MEMBER_INSTRUMENTS = {
  vocal:     { name: 'Vocal',     part: 'v', icon: 'mic' },
  guitarra:  { name: 'Guitarra',  part: 'g', icon: 'guitar' },
  baixo:     { name: 'Baixo',     part: 'b', icon: 'bass' },
  bateria:   { name: 'Bateria',   part: 'd', icon: 'drums' },
  teclado:   { name: 'Teclado',   part: 'k', icon: 'keys' },
  percussao: { name: 'Percussão', part: 'p', icon: 'perc' },
  outro:     { name: 'Outro',     part: null, icon: 'star' },
};

RH.DEFAULT_MEMBERS = [
  { id: 'm-vocal',    name: 'Vocal',    instrument: 'vocal',    order: 1 },
  { id: 'm-guitarra', name: 'Guitarra', instrument: 'guitarra', order: 2 },
  { id: 'm-baixo',    name: 'Baixo',    instrument: 'baixo',    order: 3 },
  { id: 'm-bateria',  name: 'Bateria',  instrument: 'bateria',  order: 4 },
];

// Faixas do rock meter e estrelas.
RH.meterLevel = (pct) => {
  if (pct >= 80) return 'green';
  if (pct >= 40) return 'yellow';
  return 'red';
};

RH.stars = (pct) => Math.max(0, Math.min(5, Math.floor(pct / 20)));
