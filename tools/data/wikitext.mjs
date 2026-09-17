// Utilitários mínimos para ler tabelas de wikitext da Wikipedia.

export function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

// Conteúdo de uma seção: do título (regex aplicada ao texto do título)
// até o próximo título de nível igual ou superior.
export function section(text, titleRe) {
  const lines = text.split('\n');
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(=+)\s*(.*?)\s*\1\s*$/);
    if (!m) continue;
    if (start < 0) {
      if (titleRe.test(m[2])) { start = i; level = m[1].length; }
    } else if (m[1].length <= level) {
      return lines.slice(start + 1, i).join('\n');
    }
  }
  if (start < 0) throw new Error(`Seção não encontrada: ${titleRe}`);
  return lines.slice(start + 1).join('\n');
}

export function tables(text) {
  const out = [];
  let cur = null;
  let depth = 0;
  for (const line of text.split('\n')) {
    if (/^\s*\{\|/.test(line)) { if (depth === 0) cur = []; depth++; }
    if (cur) cur.push(line);
    if (/^\s*\|\}/.test(line) && depth > 0) {
      depth--;
      if (depth === 0) { out.push(cur.join('\n')); cur = null; }
    }
  }
  return out;
}

// Divide `s` por `sep`, ignorando ocorrências dentro de [[...]] e {{...}}.
export function splitTop(s, sep) {
  const parts = [];
  let sq = 0;
  let curly = 0;
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith('[[', i)) { sq++; i++; continue; }
    if (s.startsWith(']]', i) && sq) { sq--; i++; continue; }
    if (s.startsWith('{{', i)) { curly++; i++; continue; }
    if (s.startsWith('}}', i) && curly) { curly--; i++; continue; }
    if (!sq && !curly && s.startsWith(sep, i)) {
      parts.push(s.slice(last, i));
      i += sep.length - 1;
      last = i + 1;
    }
  }
  parts.push(s.slice(last));
  return parts;
}

function stripAttrs(cell) {
  const parts = splitTop(cell, '|');
  if (parts.length > 1 && /^\s*[a-z-]+\s*=/i.test(parts[0])) {
    if (/\b(rowspan|colspan)\b/i.test(parts[0])) {
      throw new Error(`rowspan/colspan não suportado: ${cell.slice(0, 80)}`);
    }
    return parts.slice(1).join('|');
  }
  return cell;
}

// Linhas de uma tabela: { header: [células cruas], rows: [[células cruas]] }.
export function tableRows(table) {
  const rows = [];
  let cur = null;
  const flush = () => { if (cur && cur.cells.length) rows.push(cur); cur = null; };
  for (const raw of table.split('\n')) {
    const t = raw.trim();
    if (!t || t.startsWith('{|') || t.startsWith('|+')) continue;
    if (t.startsWith('|}')) { flush(); continue; }
    if (t.startsWith('|-')) { flush(); cur = { cells: [], header: true }; continue; }
    if (!cur) cur = { cells: [], header: true };
    if (t.startsWith('|') || t.startsWith('!')) {
      const isBang = t.startsWith('!');
      const body = t.replace(/^[!|]+/, '');
      const parts = isBang
        ? splitTop(body, '!!').flatMap((p) => splitTop(p, '||'))
        : splitTop(body, '||');
      if (!isBang || /scope\s*=\s*"?row/.test(body)) cur.header = false;
      for (const p of parts) cur.cells.push(stripAttrs(p));
    } else if (cur.cells.length) {
      cur.cells[cur.cells.length - 1] += ' ' + t;
    }
  }
  flush();
  return {
    header: (rows.find((r) => r.header) || { cells: [] }).cells,
    rows: rows.filter((r) => !r.header).map((r) => r.cells),
  };
}

const ENTITIES = { amp: '&', nbsp: ' ', ndash: '–', mdash: '—', quot: '"', apos: "'", lt: '<', gt: '>', hellip: '…' };

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function applyTemplate(name, args, info) {
  const arg = (k) => (args[k] ?? '').trim();
  switch (name) {
    case 'sort':
      info.sortKeys.push(expandTemplates(arg(0), info).trim());
      return expandTemplates(args.slice(1).join('|'), info);
    case 'yes': case 'ok': case 'y': case 'won':
      return 'yes';
    case 'no': case 'n':
      return 'no';
    case "'":
      return "'";
    case 'ref': case 'ref label': case 'note': case 'note label':
      info.notes.push(arg(0));
      return '';
    case 'r': {
      const positional = args.filter((a) => !a.includes('='));
      if (positional.length) info.notes.push(positional[positional.length - 1].trim());
      return '';
    }
    case 'nowrap':
      return expandTemplates(arg(0), info);
    case 'efn': case 'cn': case 'citation needed': case 'dead link': case 'sfn':
      return '';
    default:
      info.unknown.push(name);
      return '';
  }
}

export function expandTemplates(s, info) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf('{{', i);
    if (start < 0) { out += s.slice(i); break; }
    out += s.slice(i, start);
    let depth = 0;
    let j = start;
    for (; j < s.length; j++) {
      if (s.startsWith('{{', j)) { depth++; j++; }
      else if (s.startsWith('}}', j)) { depth--; j++; if (depth === 0) break; }
    }
    if (depth !== 0) { out += s.slice(start); break; }
    const args = splitTop(s.slice(start + 2, j - 1), '|');
    out += applyTemplate(args[0].trim().toLowerCase(), args.slice(1), info);
    i = j + 1;
  }
  return out;
}

// Converte uma célula em texto limpo, guardando chaves de ordenação, links e notas.
export function parseCell(raw) {
  const info = { hidden: [], sortKeys: [], links: [], notes: [], unknown: [] };
  let s = raw ?? '';
  s = s.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  s = s.replace(/<span[^>]*display\s*:\s*none[^>]*>([\s\S]*?)<\/span>/gi, (_, c) => {
    info.hidden.push(c.trim());
    return '';
  });
  s = expandTemplates(s, info);
  s = s.replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, target, text) => {
    const shown = (text ?? target).trim();
    info.links.push({ target: target.trim(), text: shown });
    return shown;
  });
  s = s.replace(/\[(?:https?:)?\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/?[a-z][^>]*>/gi, '');
  s = s.replace(/'''?/g, '');
  s = decodeEntities(s);
  const lines = s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return { ...info, lines, text: lines.join(' ') };
}

// "Título" (versão) → { title, version }
export function parseTitle(cell) {
  const text = cell.text;
  const first = text.indexOf('"');
  const last = text.lastIndexOf('"');
  if (first < 0 || last <= first) return { title: text.trim(), version: '' };
  return {
    title: text.slice(first + 1, last).trim(),
    version: text.slice(last + 1).trim().replace(/^\((.*)\)$/, '$1'),
  };
}

// Célula de tier/venue → { n, m, label, encore, boss } ou null se a música não está nesse modo.
export function parseTier(cell) {
  const key = cell.hidden.find((h) => /^\d/.test(h)) ?? cell.sortKeys.find((k) => /^\d/.test(k));
  if (!key && /^([–—-]|N\/A)?$/i.test(cell.text)) return null;
  const nums = key ? key.split('.').filter(Boolean).map((x) => parseInt(x, 10)) : [];
  if (nums[0] === 999) return null;
  const joined = cell.lines.join('\n');
  const encore = /encore/i.test(joined);
  const boss = /boss battle/i.test(joined);
  let label = cell.lines
    .map((l) => l.replace(/\(\s*encore\s*\)/gi, '').replace(/\bencore\b/gi, '').replace(/boss battle/gi, '').trim())
    .filter(Boolean)
    .join(' ');
  let n = nums[0];
  const lm = label.match(/^(\d+)\.?\s*(.*)$/);
  if (lm) {
    if (n == null) n = parseInt(lm[1], 10);
    label = lm[2];
  }
  label = label.replace(/^"(.*?)"(\s*\(.*\))?$/, '$1$2').replace(/\s+/g, ' ').trim();
  return { n: n ?? null, m: nums[1] ?? null, label, encore, boss };
}

export function slug(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘"“”.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
