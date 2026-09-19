/* Letras: busca nas bases públicas LRCLIB (lrclib.net) e lyrics.ovh, guarda no aparelho (funciona
   offline depois de baixada) e mostra com rolagem automática.

   A velocidade da rolagem vai de 0 a 10. O padrão sai do BPM da música (BPM ÷ 24: 120 BPM → 5),
   supondo cerca de uma linha de letra a cada 2 compassos; cada músico pode ajustar e o ajuste fica
   guardado por música neste aparelho. A letra fica só no aparelho, não vai para o banco da banda. */
window.RH = window.RH || {};

RH.lyrics = (() => {
  const S = RH.safeStorage;
  const U = RH.util;
  const esc = (s) => U.escapeHtml(s);
  const KEY = (id) => `rh:v1:lyrics:${id}`;
  const SPEED_KEY = 'rh:v1:ui:lyrics-speed';
  const SIZE_KEY = 'rh:v1:ui:lyrics-size';
  const MISS_TTL = 3 * 86400000; // "não achou" é tentado de novo depois de 3 dias

  // ---------- busca e cache ----------

  const cached = (id) => {
    const c = S.get(KEY(id));
    if (!c) return null;
    if (c.miss && Date.now() - (c.at || 0) > MISS_TTL) return null;
    return c;
  };

  const has = (id) => { const c = cached(id); return !!(c && (c.text || c.instrumental)); };

  const fetchJson = async (url, ms = 12000) => {
    const ctrl = window.AbortController ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), ms);
    try {
      const res = await fetch(url, ctrl ? { signal: ctrl.signal } : {});
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const clean = (text) => String(text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const artistOf = (song) => song.a.replace(/\s+(featuring|feat\.|ft\.)\s.*$/i, '').replace(/^\./, '');
  const titleOf = (song) => song.t.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const fold = (s) => U.fold(s).replace(/[^a-z0-9]+/g, ' ').trim();

  const fromLrclib = async (song, duration) => {
    const artist = artistOf(song);
    const params = new URLSearchParams({ artist_name: artist, track_name: song.t });
    if (duration) params.set('duration', String(duration));
    const exact = await fetchJson(`https://lrclib.net/api/get?${params}`).catch(() => null);
    if (exact && (exact.plainLyrics || exact.instrumental)) return { text: clean(exact.plainLyrics), instrumental: !!exact.instrumental && !exact.plainLyrics, source: 'LRCLIB' };
    const list = await fetchJson(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: titleOf(song), artist_name: artist })}`);
    const title = fold(titleOf(song));
    const ok = (list || []).filter((r) => r.plainLyrics && fold(r.trackName).startsWith(title.slice(0, 12)));
    const studio = ok.filter((r) => !/live|ao vivo|demo|remix|acoustic/i.test(`${r.trackName} ${r.albumName}`));
    const best = (studio.length ? studio : ok).sort((a, b) => (duration ? Math.abs(a.duration - duration) - Math.abs(b.duration - duration) : 0))[0];
    if (best) return { text: clean(best.plainLyrics), source: 'LRCLIB' };
    if ((list || []).some((r) => r.instrumental && fold(r.trackName).startsWith(title.slice(0, 12)))) return { text: '', instrumental: true, source: 'LRCLIB' };
    return null;
  };

  const fromOvh = async (song) => {
    const json = await fetchJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(artistOf(song))}/${encodeURIComponent(titleOf(song))}`);
    const text = json && clean(json.lyrics).replace(/^Paroles de la chanson.*\n/i, '');
    return text ? { text, source: 'lyrics.ovh' } : null;
  };

  const inflight = new Map();

  // Resolve com {text, instrumental, source} ou {miss: true}. Rejeita só com erro de rede.
  const get = (id, { force = false } = {}) => {
    const song = RH.SONGS[id];
    if (!song) return Promise.resolve({ miss: true });
    if (!force) {
      const c = cached(id);
      if (c) return Promise.resolve(c);
    }
    if (inflight.has(id)) return inflight.get(id);
    const duration = RH.store ? RH.store.duration(id).sec : null;
    const p = (async () => {
      let found = null;
      let netError = null;
      for (const source of [() => fromLrclib(song, duration), () => fromOvh(song)]) {
        try {
          found = await source();
          if (found) break;
        } catch (err) {
          netError = err;
        }
      }
      if (found) {
        const entry = { ...found, at: Date.now() };
        S.set(KEY(id), entry);
        return entry;
      }
      if (netError && !navigator.onLine) throw netError;
      const miss = { miss: true, at: Date.now() };
      S.set(KEY(id), miss);
      return miss;
    })().finally(() => inflight.delete(id));
    inflight.set(id, p);
    return p;
  };

  const saveManual = (id, text) => {
    const t = clean(text);
    if (!t) { S.remove(KEY(id)); return null; }
    const entry = { text: t, source: 'manual', at: Date.now() };
    S.set(KEY(id), entry);
    return entry;
  };

  // Baixa várias letras em sequência (para o show sem internet). onProgress(feitas, total, ok).
  const prefetch = async (ids, onProgress) => {
    let done = 0;
    let ok = 0;
    for (const id of ids) {
      try {
        const r = await get(id);
        if (r && (r.text || r.instrumental)) ok++;
      } catch { /* sem rede: tenta depois */ }
      done++;
      if (onProgress) onProgress(done, ids.length, ok);
    }
    return ok;
  };

  // ---------- velocidade ----------

  const defaultLevel = (bpm) => (bpm ? U.clamp(Math.round((bpm / 24) * 2) / 2, 1, 10) : 4);
  const savedLevels = () => S.get(SPEED_KEY) || {};
  const levelFor = (id, bpm) => {
    const v = savedLevels()[id];
    return typeof v === 'number' ? v : defaultLevel(bpm);
  };
  const saveLevel = (id, level) => {
    const all = savedLevels();
    if (level == null) delete all[id];
    else all[id] = level;
    S.set(SPEED_KEY, all);
  };
  const LINES_PER_SEC_PER_LEVEL = 0.05; // nível 5 = 0,25 linha/s = 15 linhas por minuto

  // ---------- visualizador ----------

  // Monta a letra com rolagem automática dentro de `el`. Devolve um controle.
  const viewer = (el, { songId, compact = false } = {}) => {
    let id = songId;
    let playing = false;
    let level = 4;
    let raf = null;
    let last = 0;
    let pos = 0;
    let destroyed = false;
    const sizes = S.get(SIZE_KEY) || {};
    let size = sizes[compact ? 'sheet' : 'stage'] || (compact ? 18 : 28);

    el.classList.add('lyrics');
    el.classList.toggle('is-compact', compact);
    el.innerHTML = `
      <div class="lyrics-bar">
        <button type="button" class="btn btn-icon lyrics-play" data-ly-play aria-label="Rolar sozinho" title="Rolar sozinho (espaço)"></button>
        <label class="lyrics-speed">
          <span class="lyrics-speed-label">Velocidade <output data-ly-level></output></span>
          <input class="slider" type="range" min="0" max="10" step="0.5" data-ly-slider aria-label="Velocidade da rolagem, de 0 a 10">
        </label>
        <button type="button" class="btn btn-sm btn-ghost" data-ly-auto title="Voltar para a velocidade calculada pelo BPM"></button>
        <span class="lyrics-size">
          <button type="button" class="btn btn-icon btn-sm" data-ly-size="-2" aria-label="Letra menor">A−</button>
          <button type="button" class="btn btn-icon btn-sm" data-ly-size="2" aria-label="Letra maior">A+</button>
        </span>
        <button type="button" class="btn btn-icon btn-sm btn-ghost" data-ly-edit aria-label="Colar ou corrigir a letra" title="Colar ou corrigir a letra">${RH.icons.svg('edit')}</button>
      </div>
      <div class="lyrics-scroll" data-ly-scroll tabindex="0" aria-label="Letra"><div class="lyrics-body" data-ly-body></div></div>`;
    const scroller = el.querySelector('[data-ly-scroll]');
    const body = el.querySelector('[data-ly-body]');
    const slider = el.querySelector('[data-ly-slider]');
    const output = el.querySelector('[data-ly-level]');
    const autoBtn = el.querySelector('[data-ly-auto]');
    const playBtn = el.querySelector('[data-ly-play]');

    const bpmVal = () => (RH.store ? RH.store.bpm(id).val : null);
    const lineHeight = () => parseFloat(getComputedStyle(body).lineHeight) || size * 1.45;

    const paintControls = () => {
      slider.value = String(level);
      slider.style.setProperty('--pct', `${level * 10}%`);
      output.textContent = level.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const bpm = bpmVal();
      const custom = typeof savedLevels()[id] === 'number';
      autoBtn.textContent = custom ? 'Auto' : bpm ? `${bpm} BPM` : 'Sem BPM';
      autoBtn.disabled = !custom;
      autoBtn.title = custom ? `Voltar para a velocidade do BPM (${defaultLevel(bpm).toLocaleString('pt-BR')})` : 'Velocidade calculada pelo BPM da música';
      playBtn.innerHTML = RH.icons.svg(playing ? 'pause' : 'play');
      playBtn.setAttribute('aria-pressed', String(playing));
      playBtn.setAttribute('aria-label', playing ? 'Pausar a rolagem' : 'Rolar sozinho');
      el.classList.toggle('is-playing', playing);
      body.style.fontSize = `${size}px`;
    };

    const step = (ts) => {
      if (!playing || destroyed) return;
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
      last = ts;
      if (Math.abs(scroller.scrollTop - Math.round(pos)) > 2) pos = scroller.scrollTop; // rolou com o dedo
      pos += level * LINES_PER_SEC_PER_LEVEL * lineHeight() * dt;
      scroller.scrollTop = Math.round(pos);
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 && dt > 0) { pause(); return; }
      raf = requestAnimationFrame(step);
    };

    const play = () => {
      if (playing || !body.textContent.trim()) return;
      playing = true;
      last = 0;
      pos = scroller.scrollTop;
      raf = requestAnimationFrame(step);
      paintControls();
    };
    const pause = () => {
      playing = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      paintControls();
    };
    const toggle = () => (playing ? pause() : play());

    const setLevel = (v, { save = true } = {}) => {
      level = U.clamp(Math.round(v * 2) / 2, 0, 10);
      if (save) saveLevel(id, level);
      paintControls();
    };

    const renderText = (entry) => {
      if (entry && entry.text) {
        body.innerHTML = `${esc(entry.text).replace(/\n/g, '<br>')}<p class="lyrics-src">Letra: ${esc(entry.source === 'manual' ? 'colada pela banda neste aparelho' : entry.source)}</p>`;
        return;
      }
      const song = RH.SONGS[id];
      const q = encodeURIComponent(`letra ${song.t} ${song.a}`);
      body.innerHTML = entry && entry.instrumental
        ? '<p class="lyrics-msg">Música instrumental: sem letra.</p>'
        : `<div class="lyrics-msg">
            <p>${entry && entry.error ? 'Sem internet para buscar a letra agora.' : 'Não achamos a letra nas bases públicas.'}</p>
            <div class="lyrics-msg-actions">
              <button type="button" class="btn btn-sm" data-ly-retry>${RH.icons.svg('reset')} Tentar de novo</button>
              <button type="button" class="btn btn-sm" data-ly-edit>${RH.icons.svg('edit')} Colar a letra</button>
              <a class="btn btn-sm btn-ghost" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">${RH.icons.svg('search')} Procurar na web</a>
            </div>
          </div>`;
    };

    const load = ({ force = false } = {}) => {
      const song = RH.SONGS[id];
      pause();
      scroller.scrollTop = 0;
      pos = 0;
      level = levelFor(id, bpmVal());
      paintControls();
      const c = !force && cached(id);
      if (c) return renderText(c);
      body.innerHTML = `<p class="lyrics-msg">Buscando a letra de ${esc(song ? song.t : '')}…</p>`;
      const asked = id;
      get(id, { force }).then(
        (entry) => { if (!destroyed && asked === id) renderText(entry); },
        () => { if (!destroyed && asked === id) renderText({ error: true }); },
      );
    };

    const edit = () => {
      const c = cached(id);
      const sheet = RH.ui.sheet({
        title: 'Letra',
        subtitle: `${RH.SONGS[id].t} · fica só neste aparelho`,
        body: `
          <label class="field"><span>Cole ou corrija a letra</span>
            <textarea class="input lyrics-edit" rows="14" data-ly-text>${esc((c && c.text) || '')}</textarea></label>
          <div class="sheet-footer">
            <button type="button" class="btn btn-ghost" data-ly-cancel>Cancelar</button>
            <button type="button" class="btn btn-fire" data-ly-save>${RH.icons.svg('check')} Salvar</button>
          </div>`,
      });
      sheet.body.addEventListener('click', (e) => {
        if (e.target.closest('[data-ly-cancel]')) return sheet.close();
        if (!e.target.closest('[data-ly-save]')) return;
        const entry = saveManual(id, sheet.body.querySelector('[data-ly-text]').value);
        sheet.close();
        if (!destroyed) renderText(entry || { miss: true });
      });
    };

    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-ly-play]')) return toggle();
      if (e.target.closest('[data-ly-auto]')) { saveLevel(id, null); return setLevel(defaultLevel(bpmVal()), { save: false }); }
      const sz = e.target.closest('[data-ly-size]');
      if (sz) {
        size = U.clamp(size + Number(sz.dataset.lySize), 14, 64);
        S.set(SIZE_KEY, { ...(S.get(SIZE_KEY) || {}), [compact ? 'sheet' : 'stage']: size });
        return paintControls();
      }
      if (e.target.closest('[data-ly-retry]')) return load({ force: true });
      if (e.target.closest('[data-ly-edit]')) return edit();
      if (e.target.closest('a')) return;
      if (e.target.closest('[data-ly-scroll]') && body.textContent.trim()) toggle(); // tocar na letra pausa/continua
    });
    slider.addEventListener('input', () => setLevel(Number(slider.value)));

    load();

    return {
      setSong(next) { if (next !== id) { id = next; load(); } },
      play,
      pause,
      toggle,
      isPlaying: () => playing,
      scrollLines(n) { pos = scroller.scrollTop + n * lineHeight(); scroller.scrollTo({ top: pos, behavior: 'smooth' }); },
      refresh() { if (!playing) { level = levelFor(id, bpmVal()); paintControls(); } },
      destroy() { destroyed = true; pause(); },
    };
  };

  // Painel com a letra (a partir do painel da música).
  const openSheet = (id) => {
    const song = RH.SONGS[id];
    let v = null;
    const sheet = RH.ui.sheet({ title: song.t, subtitle: `${song.a} · letra`, className: 'lyrics-sheet', onClose: () => v && v.destroy() });
    const box = document.createElement('div');
    sheet.body.appendChild(box);
    v = viewer(box, { songId: id, compact: true });
    return sheet;
  };

  return { get, has, cached, saveManual, prefetch, viewer, openSheet, defaultLevel };
})();
