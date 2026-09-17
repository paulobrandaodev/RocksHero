/* Utilitários puros (sem DOM). */
window.RH = window.RH || {};

RH.util = (() => {
  // SHA-256 síncrono em JS puro: funciona em file:// e em http sem depender de crypto.subtle.
  const sha256 = (() => {
    const primes = [];
    for (let n = 2; primes.length < 64; n++) {
      if (primes.every((p) => n % p !== 0)) primes.push(n);
    }
    const frac = (x) => ((x - Math.floor(x)) * 0x100000000) >>> 0;
    const H = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
    const K = primes.map((p) => frac(Math.cbrt(p)));
    const rotr = (v, n) => (v >>> n) | (v << (32 - n));

    return (text) => {
      const bytes = new TextEncoder().encode(text);
      const total = Math.ceil((bytes.length + 9) / 64) * 64;
      const buf = new Uint8Array(total);
      buf.set(bytes);
      buf[bytes.length] = 0x80;
      const view = new DataView(buf.buffer);
      const bits = bytes.length * 8;
      view.setUint32(total - 8, Math.floor(bits / 0x100000000));
      view.setUint32(total - 4, bits >>> 0);

      const h = H.slice();
      const w = new Uint32Array(64);
      for (let off = 0; off < total; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
        for (let i = 16; i < 64; i++) {
          const a = w[i - 15];
          const b = w[i - 2];
          w[i] = (w[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) | 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
          const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
          const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
          hh = g; g = f; f = e; e = (d + t1) | 0;
          d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
        h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
      }
      return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
    };
  })();

  const median = (values) => {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const randomId = () => {
    const bytes = new Uint8Array(8);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.random() * 256; });
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  };

  // Texto sem acentos e em minúsculas, para busca.
  const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const debounce = (fn, ms) => {
    let timer = null;
    const run = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
    run.flush = (...args) => { clearTimeout(timer); fn(...args); };
    return run;
  };

  // Caminhos no formato "progress/<song>/<member>".
  const getPath = (obj, path) => path.split('/').reduce((node, key) => (node == null ? undefined : node[key]), obj);

  // Grava (ou remove, com null) um valor e poda objetos que ficaram vazios.
  const setPath = (obj, path, value) => {
    const keys = path.split('/');
    const stack = [];
    let node = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (node[keys[i]] == null || typeof node[keys[i]] !== 'object') {
        if (value == null) return;
        node[keys[i]] = {};
      }
      stack.push([node, keys[i]]);
      node = node[keys[i]];
    }
    const last = keys[keys.length - 1];
    if (value == null) {
      delete node[last];
      for (let i = stack.length - 1; i >= 0; i--) {
        const [parent, key] = stack[i];
        if (Object.keys(parent[key]).length) break;
        delete parent[key];
      }
    } else {
      node[last] = value;
    }
  };

  // Nenhum caminho pode ser ancestral de outro na mesma escrita multi-caminho.
  const assertLeafPaths = (paths) => {
    const sorted = paths.slice().sort();
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startsWith(`${sorted[i - 1]}/`)) {
        throw new Error(`Caminho ${sorted[i - 1]} é ancestral de ${sorted[i]}`);
      }
    }
  };

  // Posição entre dois vizinhos numa lista ordenada por `pos` (null = ponta).
  const positionBetween = (before, after) => {
    if (before == null && after == null) return 1;
    if (before == null) return after - 1;
    if (after == null) return before + 1;
    return (before + after) / 2;
  };

  const needsRenormalize = (before, after) => before != null && after != null && Math.abs(after - before) < 1e-6;

  return {
    sha256, median, randomId, fold, escapeHtml, clone, clamp, debounce,
    getPath, setPath, assertLeafPaths, positionBetween, needsRenormalize,
  };
})();

// localStorage que nunca lança erro (aba anônima, armazenamento bloqueado ou cheio).
RH.safeStorage = {
  getRaw(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  setRaw(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch { return false; }
  },
  get(key) {
    const raw = RH.safeStorage.getRaw(key);
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  set(key, value) {
    return RH.safeStorage.setRaw(key, JSON.stringify(value));
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch { /* sem armazenamento */ }
  },
};
