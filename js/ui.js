/* Peças de interface compartilhadas: placar, rock meter, painéis, toasts. */
window.RH = window.RH || {};

RH.ui = (() => {
  const U = RH.util;
  const esc = U.escapeHtml;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Marcas curtas para os emblemas dos jogos.
  const GAME_MARKS = {
    gh1: 'I', gh2: 'II', gh80: '80s', gh3: 'III', gha: 'A', ghwt: 'WT', ghm: 'M',
    ghsh: 'SH', gh5: '5', bh: 'BH', ghvh: 'VH', ghwor: 'WoR', ghl: 'Live',
  };

  const TIER_COLORS = ['var(--gem-green)', 'var(--gem-red)', 'var(--gem-yellow)', 'var(--gem-blue)', 'var(--gem-orange)'];

  const levelClass = (pct) => (pct == null ? 'lv-none' : `lv-${RH.meterLevel(pct)}`);

  const stars = (pct) => {
    if (pct == null) return '<span class="stars" aria-hidden="true">★★★★★</span>';
    const n = RH.stars(pct);
    return `<span class="stars${pct >= 100 ? ' is-gold' : ''}" role="img" aria-label="${n} de 5 estrelas"><span class="on">${'★'.repeat(n)}</span>${'★'.repeat(5 - n)}</span>`;
  };

  // 0% fica neutro (não começada); o vermelho é para quem já começou e está no início.
  const score = (pct, { showStars = true } = {}) => `
    <div class="score ${pct === 0 ? 'lv-none' : levelClass(pct)}">
      <span class="num${pct == null ? ' is-empty' : ''}" title="Mediana da banda">${pct == null ? '—' : `${pct}<small>%</small>`}</span>
      ${showStars ? stars(pct) : ''}
    </div>`;

  const emblem = (game, extraClass = '') =>
    `<span class="emblem ${extraClass}" style="--c1:${game.c1};--c2:${game.c2}" aria-hidden="true"><span>${esc(GAME_MARKS[game.id] || game.short)}</span></span>`;

  const tuningBadge = (t) => {
    const info = RH.tuningInfo(t.code);
    const classes = ['tuning'];
    let title = info.label;
    if (info.unknown) { classes.push('is-unknown'); title = 'Afinação desconhecida'; }
    else if (!t.confirmed) { classes.push('is-unconfirmed'); title += ' (a confirmar)'; }
    if (t.overridden) { classes.push('is-overridden'); title += ' · corrigida pela banda'; }
    return `<span class="${classes.join(' ')}" data-step="${info.step}" title="${esc(title)}">${esc(info.short)}</span>`;
  };

  // BPM da música (com "?" quando a confirmar) e duração.
  const bpmBadge = (b) => {
    if (!b || !b.val) return '';
    const title = `${b.val} BPM${b.confirmed ? '' : ' (a confirmar)'}${b.overridden ? ' · corrigido pela banda' : ''}`;
    return `<span class="bpm${b.confirmed ? '' : ' is-unconfirmed'}" title="${esc(title)}">${b.val}<small>bpm</small></span>`;
  };

  const durText = (d) => (d && d.sec ? U.formatDuration(d.sec) : '');

  // Quantos querem tocar (chama acesa quando você também quer).
  const wantBadge = (n, mine) => (n
    ? `<span class="want${mine ? ' is-mine' : ''}" title="${n} ${n > 1 ? 'membros querem' : 'membro quer'} tocar${mine ? ' (você também)' : ''}">${RH.icons.svg('heart')}${n}</span>`
    : '');

  const insText = (counts) => {
    if (!counts) return 'Instrumentação desconhecida';
    const parts = RH.PARTS.filter((p) => counts[p.key] > 0)
      .map((p) => (counts[p.key] > 1 ? `${counts[p.key]} ${p.plural.toLowerCase()}` : p.name.toLowerCase()));
    if (!parts.length) return 'Sem instrumentos';
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
  };

  // Ícones da instrumentação; as partes que a formação não cobre ficam apagadas.
  const instruments = (store, songId, { inline = false } = {}) => {
    const { counts } = store.instrumentation(songId);
    if (!counts) return '<span class="inst inst-unknown" title="Instrumentação desconhecida">instr. ?</span>';
    const missing = Object.fromEntries(store.uncovered(songId).map((g) => [g.key, g.missing]));
    const icons = [];
    for (const part of RH.PARTS) {
      const n = counts[part.key];
      for (let i = 0; i < n; i++) {
        const uncovered = i >= n - (missing[part.key] || 0);
        const cls = uncovered ? 'is-uncovered' : '';
        icons.push(inline ? RH.icons.svg(part.icon, cls) : RH.icons.mask(part.icon, cls));
      }
    }
    const gaps = store.uncovered(songId);
    const gapText = gaps.length
      ? ` · sem membro para: ${gaps.map((g) => `${g.missing > 1 ? `${g.missing} ` : ''}${RH.PARTS.find((p) => p.key === g.key).name.toLowerCase()}`).join(', ')}`
      : '';
    return `<span class="inst" title="${esc(insText(counts) + gapText)}">${icons.join('')}</span>`;
  };

  // ---------- Ouvir a música (YouTube e Spotify) ----------

  const listenQuery = (song) => `${song.t} ${song.a}`;
  const youtubeUrl = (song) => `https://www.youtube.com/results?search_query=${encodeURIComponent(listenQuery(song))}`;
  const spotifyWebUrl = (song) => `https://open.spotify.com/search/${encodeURIComponent(listenQuery(song))}`;
  const spotifyAppUrl = (song) => `spotify:search:${encodeURIComponent(listenQuery(song))}`;

  // Botões compactos (linhas das listas) ou com texto (painel da música).
  const listenLinks = (songId, { labels = false } = {}) => {
    const song = RH.SONGS[songId];
    if (!song) return '';
    const name = esc(`${song.t} (${song.a})`);
    const icon = (n) => (labels ? RH.icons.svg(n) : RH.icons.mask(n));
    return `<span class="listen${labels ? ' listen-full' : ''}">
      <a class="listen-btn is-youtube" href="${esc(youtubeUrl(song))}" target="_blank" rel="noopener" data-listen="youtube" title="Buscar no YouTube" aria-label="Buscar ${name} no YouTube">${icon('youtube')}${labels ? '<span>YouTube</span>' : ''}</a>
      <a class="listen-btn is-spotify" href="${esc(spotifyWebUrl(song))}" target="_blank" rel="noopener" data-listen="spotify" data-song="${esc(songId)}" title="Buscar no Spotify" aria-label="Buscar ${name} no Spotify">${icon('spotify')}${labels ? '<span>Spotify</span>' : ''}</a>
    </span>`;
  };

  // No celular, o link https do Spotify já abre o app instalado (App Links / Universal Links).
  // No computador, tenta o app pelo protocolo spotify:; se nada abrir, oferece o Spotify Web.
  const SPOTIFY_WEB_KEY = 'rh:v1:ui:spotify-web';
  const isDesktop = () => !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches)
    && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const openSpotify = (songId) => {
    const song = RH.SONGS[songId];
    if (!song || !isDesktop() || RH.safeStorage.getRaw(SPOTIFY_WEB_KEY) === '1') return false;
    let left = false;
    const onLeave = () => { left = true; };
    window.addEventListener('blur', onLeave, { once: true });
    document.addEventListener('visibilitychange', onLeave, { once: true });
    window.location.href = spotifyAppUrl(song);
    setTimeout(() => {
      window.removeEventListener('blur', onLeave);
      document.removeEventListener('visibilitychange', onLeave);
      if (left) return;
      toast(`O app do Spotify não abriu. <a href="${esc(spotifyWebUrl(song))}" target="_blank" rel="noopener" data-spotify-web>Abrir no Spotify Web</a>`, { html: true, timeout: 7000 });
    }, 1500);
    return true;
  };

  document.addEventListener('click', (e) => {
    const web = e.target.closest('[data-spotify-web]');
    if (web) { RH.safeStorage.setRaw(SPOTIFY_WEB_KEY, '1'); return; }
    const link = e.target.closest('a[data-listen]');
    if (!link || e.defaultPrevented) return;
    if (link.dataset.listen === 'spotify' && !e.ctrlKey && !e.metaKey && !e.shiftKey && openSpotify(link.dataset.song)) e.preventDefault();
  });

  const memberIcon = (member) => (RH.MEMBER_INSTRUMENTS[member.instrument] || RH.MEMBER_INSTRUMENTS.outro).icon;

  const avatar = (member) =>
    `<span class="avatar inst-${esc(member.instrument)}">${RH.icons.mask(memberIcon(member))}</span>`;

  // Barra de um membro numa linha do catálogo.
  const memberBar = (member, leaf, applicable) => {
    const name = esc(member.name);
    if (!applicable) {
      const reason = leaf && leaf.v === 'na' ? 'não toca nessa' : 'fora desta música';
      return `<span class="mbar inst-${esc(member.instrument)} is-na lv-none" title="${name}: ${reason}">${RH.icons.mask(memberIcon(member))}<span class="mbar-track"><i style="--pct:0%"></i></span><b>—</b></span>`;
    }
    const pct = leaf && typeof leaf.v === 'number' ? leaf.v : 0;
    return `<span class="mbar inst-${esc(member.instrument)} ${levelClass(pct)}" title="${name}: ${pct}%">${RH.icons.mask(memberIcon(member))}<span class="mbar-track"><i style="--pct:${pct}%"></i></span><b>${pct}</b></span>`;
  };

  // Rock meter semicircular (vermelho/amarelo/verde) com ponteiro.
  const rockMeter = (pct, { label = '' } = {}) => {
    const r = 80;
    const point = (p) => {
      const a = Math.PI - (p / 100) * Math.PI;
      return [100 + r * Math.cos(a), 100 - r * Math.sin(a)];
    };
    const arc = (from, to) => {
      const [x1, y1] = point(from);
      const [x2, y2] = point(to);
      return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
    };
    const ticks = [10, 20, 30, 40, 50, 60, 70, 80, 90].map((p) => {
      const a = Math.PI - (p / 100) * Math.PI;
      const x1 = 100 + 64 * Math.cos(a);
      const y1 = 100 - 64 * Math.sin(a);
      const x2 = 100 + 58 * Math.cos(a);
      const y2 = 100 - 58 * Math.sin(a);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }).join('');
    const value = pct == null ? 0 : U.clamp(pct, 0, 100);
    const dim = pct == null ? ' opacity=".35"' : '';
    const text = pct == null ? '—' : `${pct}%`;
    return `
      <svg class="rock-meter" viewBox="0 0 200 128" role="img" aria-label="${esc(label || 'Rock meter')}: ${text}">
        <path d="${arc(0, 100)}" fill="none" stroke="#050407" stroke-width="30" stroke-linecap="round"/>
        <path d="${arc(0, 100)}" fill="none" stroke="#d9dee5" stroke-width="26" stroke-linecap="round"/>
        <g${dim} stroke-width="20" fill="none">
          <path d="${arc(0.5, 40)}" stroke="var(--meter-red)"/>
          <path d="${arc(40, 80)}" stroke="var(--meter-yellow)"/>
          <path d="${arc(80, 99.5)}" stroke="var(--meter-green)"/>
        </g>
        <g stroke="#050407" stroke-width="2.5" opacity=".5">${ticks}</g>
        <g class="needle" style="transform: rotate(${(value * 1.8).toFixed(1)}deg)">
          <path d="M100 94 L26 100 L100 106 Z" fill="#fff" stroke="#050407" stroke-width="2.5" stroke-linejoin="round"/>
        </g>
        <circle cx="100" cy="100" r="13" fill="url(#rh-hub)" stroke="#050407" stroke-width="3"/>
        <defs><radialGradient id="rh-hub" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#9aa5b1"/><stop offset="1" stop-color="#2e3640"/></radialGradient></defs>
        <text x="100" y="126" text-anchor="middle" fill="#fff" font-family="Oswald, sans-serif" font-weight="700" font-size="20" font-style="italic">${text}</text>
      </svg>`;
  };

  const formatWhen = (t) => {
    if (!t) return '';
    const diff = Date.now() - t;
    const min = Math.round(diff / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    if (d < 7) return `há ${d} dia${d > 1 ? 's' : ''}`;
    return new Date(t).toLocaleDateString('pt-BR');
  };

  // ---------- Toasts ----------
  let toastRoot = null;
  const toast = (message, { kind = 'info', timeout = 2600, html = false } = {}) => {
    if (!toastRoot) {
      toastRoot = document.createElement('div');
      toastRoot.className = 'toasts';
      toastRoot.setAttribute('role', 'status');
      toastRoot.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastRoot);
    }
    const el = document.createElement('div');
    el.className = `toast is-${kind}`;
    const icon = { error: 'alert', rock: 'flame', ok: 'check', info: 'info' }[kind] || 'info';
    el.innerHTML = `${RH.icons.svg(icon)}<div>${html ? message : esc(message)}</div>`;
    toastRoot.appendChild(el);
    while (toastRoot.children.length > 3) toastRoot.firstElementChild.remove();
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 250);
    }, timeout);
  };

  // ---------- Painel inferior / modal ----------
  let openSheets = [];

  const sheet = ({ title = '', subtitle = '', body = '', className = '', onClose } = {}) => {
    const previousFocus = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    const el = document.createElement('div');
    el.className = `sheet ${className}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    const titleId = `sheet-title-${U.randomId().slice(0, 6)}`;
    el.setAttribute('aria-labelledby', titleId);
    el.innerHTML = `
      <div class="sheet-grabber" aria-hidden="true"></div>
      <div class="sheet-head">
        <div class="sheet-heading"><h2 id="${titleId}"></h2><div class="sub"></div></div>
        <button type="button" class="btn btn-icon btn-sm" data-close aria-label="Fechar">${RH.icons.svg('close')}</button>
      </div>
      <div class="sheet-body"></div>`;
    document.body.append(backdrop, el);

    const api = {
      el,
      body: $('.sheet-body', el),
      setTitle(text, sub = '') {
        $('h2', el).textContent = text;
        $('.sub', el).textContent = sub;
        $('.sub', el).hidden = !sub;
      },
      close() {
        if (!openSheets.includes(api)) return;
        openSheets = openSheets.filter((s) => s !== api);
        backdrop.style.pointerEvents = 'none';
        el.style.pointerEvents = 'none';
        el.classList.remove('is-open');
        backdrop.classList.remove('is-open');
        document.removeEventListener('keydown', onKey);
        if (!openSheets.length) document.documentElement.style.overflow = '';
        setTimeout(() => { el.remove(); backdrop.remove(); }, 260);
        if (previousFocus && previousFocus.focus && document.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
        if (onClose) onClose();
      },
    };
    api.setTitle(title, subtitle);
    if (typeof body === 'string') api.body.innerHTML = body;
    else if (body) api.body.appendChild(body);

    const onKey = (e) => {
      if (e.key === 'Escape' && openSheets[openSheets.length - 1] === api) api.close();
    };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', () => api.close());
    el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) api.close(); });

    // Arrastar o topo para baixo fecha (celular).
    let dragStart = null;
    const grab = $('.sheet-grabber', el);
    const head = $('.sheet-head', el);
    const onDown = (e) => {
      if (e.target.closest('button')) return;
      dragStart = { y: e.clientY, id: e.pointerId };
      el.style.transition = 'none';
    };
    const onMove = (e) => {
      if (!dragStart || e.pointerId !== dragStart.id) return;
      const dy = Math.max(0, e.clientY - dragStart.y);
      if (window.innerWidth < 760) el.style.transform = `translate(-50%, ${dy}px)`;
    };
    const onUp = (e) => {
      if (!dragStart || e.pointerId !== dragStart.id) return;
      const dy = e.clientY - dragStart.y;
      dragStart = null;
      el.style.transition = '';
      el.style.transform = '';
      if (dy > 110 && window.innerWidth < 760) api.close();
    };
    for (const target of [grab, head]) {
      target.addEventListener('pointerdown', onDown);
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
    }

    openSheets.push(api);
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      backdrop.classList.add('is-open');
      el.classList.add('is-open');
      const focusable = $('[autofocus]', el) || $('[data-close]', el);
      if (focusable) focusable.focus({ preventScroll: true });
    });
    return api;
  };

  const confirm = (message, { title = 'Confirmar', okLabel = 'Confirmar', danger = false } = {}) =>
    new Promise((resolve) => {
      let answered = false;
      const s = sheet({
        title,
        body: `<p style="margin:0 0 16px;font-family:var(--font-body);line-height:1.5">${esc(message)}</p>
          <div class="sheet-footer">
            <button type="button" class="btn btn-ghost" data-answer="no">Cancelar</button>
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-fire'}" data-answer="yes" autofocus>${esc(okLabel)}</button>
          </div>`,
        onClose: () => { if (!answered) resolve(false); },
      });
      s.body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-answer]');
        if (!btn) return;
        answered = true;
        resolve(btn.dataset.answer === 'yes');
        s.close();
      });
    });

  const download = (filename, text, type = 'application/json') => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return {
    $, $$, esc, GAME_MARKS, TIER_COLORS,
    levelClass, stars, score, emblem, tuningBadge, bpmBadge, durText, wantBadge, insText, instruments, listenLinks, memberIcon, avatar, memberBar,
    rockMeter, formatWhen, toast, sheet, confirm, download,
  };
})();
