/* Modo Palco: tela cheia para o celular/tablet no pedestal durante o show.
   Música atual em letra grande, a próxima, afinação com aviso de troca, observações de quem está
   usando o aparelho, cronômetro do show e letra com rolagem automática.
   Avança com toque (botão da próxima ou deslizando), setas, Page Up/Down ou pedal Bluetooth
   (que funciona como teclado). Mantém a tela acesa (Wake Lock) e funciona offline. */
window.RH = window.RH || {};

RH.stage = (() => {
  const ui = RH.ui;
  const U = RH.util;
  const esc = ui.esc;
  const S = RH.safeStorage;
  const STATE_KEY = 'rh:v1:ui:stage';
  const LYRICS_KEY = 'rh:v1:ui:stage-lyrics';

  let el = null;
  let st = null; // {list, songId, index, acc, since}
  let lyricsView = null;
  let wakeLock = null;
  let ticker = null;
  let prefetchToken = 0;
  let swipe = null;

  const store = () => RH.store;
  const save = () => S.set(STATE_KEY, st);
  const items = () => store().setlist(st.list).items;

  // ---------- cronômetro ----------

  const elapsed = () => st.acc + (st.since ? Date.now() - st.since : 0);
  const clock = (ms) => U.formatDuration(Math.floor(ms / 1000));

  const startTimer = () => { if (!st.since) { st.since = Date.now(); save(); paintTimer(); } };
  const pauseTimer = () => { if (st.since) { st.acc = elapsed(); st.since = null; save(); paintTimer(); } };
  const resetTimer = () => { st.acc = 0; st.since = null; save(); paintTimer(); };

  const paintTimer = () => {
    if (!el) return;
    const t = elapsed();
    el.querySelector('[data-st-clock]').textContent = clock(t);
    const btn = el.querySelector('[data-st-timer]');
    btn.innerHTML = RH.icons.svg(st.since ? 'pause' : 'play');
    btn.setAttribute('aria-label', st.since ? 'Pausar o cronômetro' : t ? 'Continuar o cronômetro' : 'Começar o show');
    el.classList.toggle('timer-on', !!st.since);
    // Adiantado/atrasado em relação ao início previsto da música atual.
    const pace = el.querySelector('[data-st-pace]');
    const timing = store().setlistTiming(st.list);
    const planned = timing.starts[st.index];
    if (!t || planned == null || timing.missing === items().length || st.index >= items().length) { pace.textContent = ''; return; }
    const delta = Math.round(t / 1000 - planned);
    pace.textContent = Math.abs(delta) < 30 ? 'no tempo' : `${delta > 0 ? '+' : '−'}${U.formatDuration(Math.abs(delta))} ${delta > 0 ? 'atrasado' : 'adiantado'}`;
    pace.className = `stage-pace ${Math.abs(delta) < 30 ? 'is-ok' : delta > 0 ? 'is-late' : 'is-early'}`;
  };

  // ---------- tela acesa ----------

  const keepAwake = async () => {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; paintWake(); });
    } catch { wakeLock = null; }
    paintWake();
  };
  const paintWake = () => {
    if (!el) return;
    const w = el.querySelector('[data-st-wake]');
    w.hidden = !!wakeLock;
    w.title = 'wakeLock' in navigator ? 'Não deu para manter a tela acesa: toque para tentar de novo' : 'Este navegador não mantém a tela acesa sozinho: aumente o tempo de bloqueio do aparelho';
  };
  const onVisible = () => { if (el && document.visibilityState === 'visible' && !wakeLock) keepAwake(); };

  // ---------- conteúdo ----------

  const lyricsOn = () => {
    const saved = S.getRaw(LYRICS_KEY);
    if (saved === '1' || saved === '0') return saved === '1';
    const me = store().me();
    const m = me && store().state.members[me];
    return !m || m.instrument === 'vocal';
  };

  const notesHtml = (songId) => {
    const s = store();
    const me = s.me();
    const list = s.songNotes(songId);
    const mine = me ? list.filter((x) => x.member.id === me) : list;
    if (!mine.length) return '';
    return mine.map(({ member, note }) => `
      <div class="stage-note inst-${esc(member.instrument)}">${ui.avatar(member)}<p>${me ? '' : `<b>${esc(member.name)}:</b> `}${esc(note.v)}</p></div>`).join('');
  };

  const nowHtml = (list, i) => {
    const s = store();
    const id = list[i].id;
    const song = RH.SONGS[id];
    const t = s.tuning(id);
    const info = RH.tuningInfo(t.code);
    const change = s.tuningChanges(list).find((c) => c.index === i);
    const dur = s.duration(id);
    const bpm = s.bpm(id);
    const meta = [song.a, dur.sec ? U.formatDuration(dur.sec) : '', bpm.val ? `${bpm.val} bpm` : ''].filter(Boolean).map(esc).join(' · ');
    return `
      <div class="stage-num">${i + 1}<small>/${list.length}</small></div>
      <h1 class="stage-title">${esc(song.t)}</h1>
      <p class="stage-artist">${meta}</p>
      <div class="stage-tuning">
        ${ui.tuningBadge(t)}<span>${esc(info.label)}</span>
      </div>
      ${change ? `<div class="stage-change" role="alert">${RH.icons.svg('wrench')} TROCA DE AFINAÇÃO: ${esc(RH.tuningInfo(change.from).short)} → ${esc(RH.tuningInfo(change.to).short)}</div>` : ''}
      <div class="stage-notes">${notesHtml(id)}</div>`;
  };

  const nextHtml = (list, i) => {
    const s = store();
    if (i + 1 >= list.length) return `<span class="lbl">Próxima</span><b>Fim do show</b>${RH.icons.svg('right')}`;
    const id = list[i + 1].id;
    const change = s.tuningChanges(list).find((c) => c.index === i + 1);
    return `<span class="lbl">Próxima</span><b>${esc(RH.SONGS[id].t)}</b>${ui.tuningBadge(s.tuning(id))}${change ? '<span class="stage-next-change">troca!</span>' : ''}${RH.icons.svg('right')}`;
  };

  const endHtml = () => {
    const s = store();
    const l = s.setlist(st.list);
    return `
      <div class="stage-end">
        <img src="assets/logo/rocks-hero.svg" alt="" width="260">
        <h1 class="fire-text">Fim do show!</h1>
        <p>${l.items.length} músicas${elapsed() ? ` em ${esc(clock(elapsed()))}` : ''}. YOU ROCK!</p>
        <div class="stage-end-actions">
          ${l.played ? '' : `<button type="button" class="btn btn-fire" data-st-played>${RH.icons.svg('check')} Marcar como show realizado</button>`}
          <button type="button" class="btn" data-st-restart>${RH.icons.svg('reset')} Voltar ao início</button>
          <button type="button" class="btn btn-ghost" data-st-close>Sair do Modo Palco</button>
        </div>
      </div>`;
  };

  const render = () => {
    if (!el) return;
    const s = store();
    const list = items();
    // Mantém a música atual mesmo se a ordem mudou em outro aparelho.
    const at = st.songId ? list.findIndex((it) => it.id === st.songId) : -1;
    if (at >= 0) st.index = at;
    st.index = U.clamp(st.index, 0, list.length);
    const ended = st.index >= list.length;
    st.songId = ended ? null : list[st.index].id;
    save();
    const l = s.setlist(st.list);
    el.querySelector('[data-st-name]').textContent = l.name || 'Set list';
    el.classList.toggle('is-ended', ended);
    el.classList.toggle('no-lyrics', !lyricsOn());
    el.querySelector('[data-st-lyrics-toggle]').setAttribute('aria-pressed', String(lyricsOn()));
    el.querySelector('[data-st-prev]').disabled = st.index === 0;
    if (ended || !list.length) {
      el.querySelector('[data-st-now]').innerHTML = list.length ? endHtml() : '<div class="stage-end"><h1 class="fire-text">Set list vazio</h1><button type="button" class="btn" data-st-close>Sair</button></div>';
      el.querySelector('[data-st-next]').hidden = true;
      if (lyricsView) lyricsView.pause();
    } else {
      el.querySelector('[data-st-now]').innerHTML = nowHtml(list, st.index);
      const next = el.querySelector('[data-st-next]');
      next.hidden = false;
      next.innerHTML = nextHtml(list, st.index);
      if (lyricsOn()) {
        if (!lyricsView) lyricsView = RH.lyrics.viewer(el.querySelector('[data-st-lyrics]'), { songId: st.songId });
        else lyricsView.setSong(st.songId);
      }
    }
    paintTimer();
  };

  const go = (delta) => {
    const list = items();
    const to = U.clamp(st.index + delta, 0, list.length);
    if (to === st.index) return;
    if (delta > 0 && !st.since && !st.acc) {
      // O show já começou: supõe que está no horário previsto até a música que vai entrar.
      const planned = store().setlistTiming(st.list).starts[to];
      if (planned) st.acc = planned * 1000;
      startTimer();
    }
    st.index = to;
    st.songId = to < list.length ? list[to].id : null;
    render();
    if (to === list.length) pauseTimer();
  };

  // Baixa as letras do set para funcionar sem internet.
  const prefetchLyrics = () => {
    const token = ++prefetchToken;
    const ids = items().map((it) => it.id);
    const badge = el.querySelector('[data-st-offline]');
    const paint = (done, ok) => {
      if (!el || token !== prefetchToken) return;
      badge.textContent = `Letras ${ok}/${ids.length}`;
      badge.title = done < ids.length ? 'Baixando as letras para usar sem internet…' : `${ok} letras guardadas neste aparelho (funcionam sem internet)`;
    };
    paint(0, ids.filter((id) => RH.lyrics.has(id)).length);
    RH.lyrics.prefetch(ids, (done, total, ok) => paint(done, ok));
  };

  // ---------- eventos ----------

  const onKey = (e) => {
    if (!el || document.querySelector('.sheet.is-open')) return;
    if (e.target.matches && e.target.matches('input, textarea, select')) return;
    const k = e.key;
    if (['ArrowRight', 'PageDown', 'n', 'N'].includes(k)) { e.preventDefault(); go(1); return; }
    if (['ArrowLeft', 'PageUp', 'p', 'P'].includes(k)) { e.preventDefault(); go(-1); return; }
    if ((k === ' ' || k === 'Enter') && lyricsView && lyricsOn()) { e.preventDefault(); lyricsView.toggle(); return; }
    if ((k === 'ArrowDown' || k === 'ArrowUp') && lyricsView && lyricsOn()) { e.preventDefault(); lyricsView.scrollLines(k === 'ArrowDown' ? 3 : -3); return; }
    if (k === 'Escape') close();
  };

  const onClick = async (e) => {
    const t = e.target;
    if (t.closest('[data-st-close]')) return close();
    if (t.closest('[data-st-next]')) return go(1);
    if (t.closest('[data-st-prev]')) return go(-1);
    if (t.closest('[data-st-timer]')) return (st.since ? pauseTimer() : startTimer());
    if (t.closest('[data-st-timer-reset]')) {
      if (elapsed() && !(await ui.confirm('Zerar o cronômetro do show?', { title: 'Cronômetro', okLabel: 'Zerar' }))) return;
      return resetTimer();
    }
    if (t.closest('[data-st-wake]')) return keepAwake();
    if (t.closest('[data-st-full]')) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      return;
    }
    if (t.closest('[data-st-lyrics-toggle]')) {
      S.setRaw(LYRICS_KEY, lyricsOn() ? '0' : '1');
      if (!lyricsOn() && lyricsView) lyricsView.pause();
      return render();
    }
    if (t.closest('[data-st-help]')) return help();
    if (t.closest('[data-st-played]')) {
      const s = store();
      const patch = { played: true };
      if (!s.setlist(st.list).date) patch.date = U.dayKey(s.now());
      s.setSetlistFields(patch, st.list);
      ui.toast('Show realizado: entrou no histórico!', { kind: 'rock' });
      return render();
    }
    if (t.closest('[data-st-restart]')) { st.index = 0; st.songId = null; return render(); }
  };

  const help = () => ui.sheet({
    title: 'Modo Palco',
    body: `
      <dl class="stage-help">
        <div><dt>Próxima música</dt><dd>Botão “Próxima”, deslizar para a esquerda, → ou Page Down</dd></div>
        <div><dt>Música anterior</dt><dd>Deslizar para a direita, ← ou Page Up</dd></div>
        <div><dt>Rolar a letra</dt><dd>Espaço ou tocar na letra liga e pausa; ↑ ↓ rolam na mão</dd></div>
        <div><dt>Pedal Bluetooth</dt><dd>Funciona como teclado: configure o pedal para Page Down/Page Up (ou setas) e ele troca de música.</dd></div>
        <div><dt>Velocidade</dt><dd>Começa pelo BPM da música; o ajuste de 0 a 10 fica guardado por música neste aparelho.</dd></div>
        <div><dt>Sem internet</dt><dd>As letras do set são baixadas ao abrir o Modo Palco e ficam no aparelho.</dd></div>
      </dl>`,
  });

  const onPointerDown = (e) => {
    if (!e.target.closest('[data-st-now]') || e.target.closest('button, a')) return;
    swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  // ---------- abrir e fechar ----------

  const open = (listId = store().currentSetlistId()) => {
    if (el) close();
    const saved = S.get(STATE_KEY);
    st = saved && saved.list === listId ? { acc: 0, since: null, index: 0, songId: null, ...saved } : { list: listId, index: 0, songId: null, acc: 0, since: null };
    el = document.createElement('div');
    el.className = 'stage';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Modo Palco');
    el.innerHTML = `
      <header class="stage-top">
        <button type="button" class="btn btn-icon btn-sm btn-ghost" data-st-close aria-label="Sair do Modo Palco">${RH.icons.svg('close')}</button>
        <div class="stage-show"><b data-st-name></b><span class="stage-offline" data-st-offline></span></div>
        <div class="stage-timer">
          <button type="button" class="btn btn-icon btn-sm" data-st-timer></button>
          <span class="stage-clock" data-st-clock>0:00</span>
          <span class="stage-pace" data-st-pace></span>
          <button type="button" class="btn btn-icon btn-sm btn-ghost" data-st-timer-reset aria-label="Zerar o cronômetro">${RH.icons.svg('reset')}</button>
        </div>
        <div class="stage-tools">
          <button type="button" class="btn btn-sm stage-warn" data-st-wake hidden>${RH.icons.svg('alert')} Tela</button>
          <button type="button" class="btn btn-sm btn-ghost" data-st-lyrics-toggle aria-pressed="false">${RH.icons.svg('lyrics')}<span class="hide-narrow">Letra</span></button>
          <button type="button" class="btn btn-icon btn-sm btn-ghost" data-st-full aria-label="Tela cheia">${RH.icons.svg('expand')}</button>
          <button type="button" class="btn btn-icon btn-sm btn-ghost" data-st-help aria-label="Como usar">${RH.icons.svg('info')}</button>
        </div>
      </header>
      <main class="stage-main">
        <section class="stage-now" data-st-now aria-live="polite"></section>
        <section class="stage-lyrics" data-st-lyrics></section>
      </main>
      <footer class="stage-bottom">
        <button type="button" class="btn stage-prev" data-st-prev aria-label="Música anterior">${RH.icons.svg('left')}<span class="hide-narrow">Anterior</span></button>
        <button type="button" class="stage-next" data-st-next></button>
      </footer>`;
    document.body.appendChild(el);
    document.documentElement.classList.add('stage-open');
    el.addEventListener('click', onClick);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointerup', onPointerUp);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisible);
    ticker = setInterval(paintTimer, 1000);
    render();
    keepAwake();
    prefetchLyrics();
    el.querySelector('[data-st-next]').focus({ preventScroll: true });
  };

  const close = () => {
    if (!el) return;
    prefetchToken++;
    if (lyricsView) lyricsView.destroy();
    lyricsView = null;
    clearInterval(ticker);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisible);
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.documentElement.classList.remove('stage-open');
    el.remove();
    el = null;
  };

  const refresh = (changes) => {
    if (!el) return;
    const list = items();
    const touches = changes.setlist || changes.members || [...changes.songs].some((id) => list.some((it) => it.id === id));
    if (!touches) return;
    render();
    if (lyricsView) lyricsView.refresh();
  };

  return { open, close, refresh, isOpen: () => !!el };
})();
