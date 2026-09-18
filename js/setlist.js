/* Tela Set List: ordem do show, afinações, mediana da banda e impressão. */
window.RH = window.RH || {};
RH.views = RH.views || {};

RH.views.setlist = (() => {
  const ui = RH.ui;
  const esc = ui.esc;
  let root = null;
  let sortable = null;
  let pendingUpdate = false;
  let liveRegion = null;

  const store = () => RH.store;

  const announce = (text) => {
    if (liveRegion) liveRegion.textContent = text;
  };

  const summaryHtml = () => {
    const s = store();
    const sum = s.setlistSummary();
    const weakest = sum.weakest
      ? `<button type="button" class="link-btn" data-open="${sum.weakest.id}">${esc(RH.SONGS[sum.weakest.id].t)}</button> <span class="faint">(${sum.weakest.median}%)</span>`
      : '—';
    const parts = Object.entries(sum.parts).map(([key, n]) => {
      const part = RH.PARTS.find((p) => p.key === key);
      return `<span title="${esc(`${n} música${n > 1 ? 's' : ''} com ${part.name.toLowerCase()} sem membro`)}">${RH.icons.svg(part.icon)}×${n}</span>`;
    }).join('');
    return `
      <div class="summary-meter">
        ${ui.rockMeter(sum.overall, { label: 'Mediana do set' })}
        <span class="label">Mediana do set</span>
      </div>
      <dl class="summary-stats">
        <div><dt>Músicas</dt><dd>${sum.count}</dd></div>
        <div><dt>Trocas de afinação</dt><dd>${sum.changes.length}</dd></div>
        <div><dt>Mais crua</dt><dd style="font-size:14px;font-weight:500">${weakest}</dd></div>
        <div><dt>Partes sem membro</dt><dd class="summary-parts">${parts || '<span class="faint" style="font-size:14px">nenhuma</span>'}</dd></div>
      </dl>
      <div class="summary-actions">
        <button type="button" class="btn" data-print${sum.count ? '' : ' disabled'}>${RH.icons.svg('print')} Imprimir</button>
        <a class="btn" href="#/musicas/todas">${RH.icons.svg('plus')} Músicas</a>
        <button type="button" class="btn btn-ghost" data-clear${sum.count ? '' : ' disabled'}>${RH.icons.svg('trash')} Limpar</button>
      </div>`;
  };

  const itemHtml = (item, index, change) => {
    const s = store();
    const song = RH.SONGS[item.id];
    const games = (RH.catalog.songGames[item.id] || []).map((a) => a.game.short).join(', ');
    const changeHtml = change
      ? `<div class="sl-change">${RH.icons.svg('wrench')} Troca de afinação: ${esc(RH.tuningInfo(change.from).short)} → ${esc(RH.tuningInfo(change.to).short)}</div>`
      : '';
    return `
      <li class="sl-item" data-id="${item.id}">
        ${changeHtml}
        <div class="sl-row">
          <button type="button" class="sl-grip" data-grip aria-label="Arrastar ${esc(song.t)} (setas do teclado também movem)">
            <span class="gems" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
          </button>
          <span class="sl-num">${index + 1}</span>
          <div class="sl-song" data-open="${item.id}" role="button" tabindex="0">
            <span class="sl-title">${esc(song.t)}</span>
            <span class="sl-artist">${esc(song.a)} · ${esc(games)}</span>
            <span class="sl-listen-m">${ui.listenLinks(item.id)}</span>
          </div>
          <div class="sl-tech">${ui.listenLinks(item.id)}${ui.tuningBadge(s.tuning(item.id))}${ui.instruments(s, item.id, { inline: true })}</div>
          ${ui.score(s.median(item.id))}
          <div class="sl-actions">
            <button type="button" data-move="-1" aria-label="Subir"${index === 0 ? ' disabled' : ''}>${RH.icons.svg('up')}</button>
            <button type="button" data-move="1" aria-label="Descer">${RH.icons.svg('down')}</button>
            <button type="button" class="remove" data-remove aria-label="Tirar do set list">${RH.icons.svg('trash')}</button>
          </div>
        </div>
      </li>`;
  };

  const listHtml = () => {
    const s = store();
    const { items } = s.setlist();
    if (!items.length) {
      return `
        <div class="empty">
          <img src="assets/art/amp.svg" alt="">
          <h3 class="fire-text">Set list vazio</h3>
          <p>Toque no <strong>+</strong> ao lado das músicas para montar o show. Depois é só arrastar para ordenar.</p>
          <a class="btn btn-fire" href="#/musicas/gh1">${RH.icons.svg('music')} Escolher músicas</a>
        </div>`;
    }
    const changes = new Map(s.tuningChanges(items).map((c) => [c.index, c]));
    return `<ol class="sl-list" data-list>${items.map((it, i) => itemHtml(it, i, changes.get(i))).join('')}</ol>`;
  };

  const render = () => {
    if (!root) return;
    const s = store();
    const { name } = s.setlist();
    const focusedId = document.activeElement && document.activeElement.closest && document.activeElement.closest('.sl-item')
      ? document.activeElement.closest('.sl-item').dataset.id : null;
    const focusedAction = document.activeElement && document.activeElement.dataset
      ? (document.activeElement.dataset.move || (document.activeElement.hasAttribute('data-grip') ? 'grip' : null)) : null;
    ui.$('[data-summary]', root).innerHTML = summaryHtml();
    const nameInput = ui.$('[data-name]', root);
    if (document.activeElement !== nameInput) nameInput.value = name;
    ui.$('[data-list-wrap]', root).innerHTML = listHtml();
    ui.$('[data-print-date]', root).textContent = `Impresso em ${new Date().toLocaleDateString('pt-BR')}`;
    const list = ui.$('[data-list]', root);
    if (list) {
      sortable = RH.dnd.sortable(list, {
        itemSelector: '.sl-item',
        handleSelector: '[data-grip]',
        onDrop: (item, toIndex) => {
          store().moveSetlistItem(item.dataset.id, toIndex);
          announce(`${RH.SONGS[item.dataset.id].t} agora é a número ${toIndex + 1}`);
        },
        onEnd: () => { if (pendingUpdate) { pendingUpdate = false; setTimeout(render, 0); } },
      });
    }
    if (focusedId && focusedAction) {
      const item = ui.$(`.sl-item[data-id="${focusedId}"]`, root);
      const target = item && (focusedAction === 'grip' ? item.querySelector('[data-grip]') : item.querySelector(`[data-move="${focusedAction}"]`));
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
  };

  const move = (id, delta) => {
    const s = store();
    const items = s.setlist().items;
    const from = items.findIndex((it) => it.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= items.length) return;
    s.moveSetlistItem(id, to);
    announce(`${RH.SONGS[id].t} agora é a número ${to + 1}`);
  };

  const onClick = async (e) => {
    const s = store();
    const t = e.target;
    if (t.closest("a[data-listen]")) return; // YouTube/Spotify: só o link, sem abrir o painel
    const moveBtn = t.closest('[data-move]');
    if (moveBtn) return move(moveBtn.closest('.sl-item').dataset.id, Number(moveBtn.dataset.move));
    const remove = t.closest('[data-remove]');
    if (remove) {
      const id = remove.closest('.sl-item').dataset.id;
      s.removeFromSetlist(id);
      return ui.toast(`“${RH.SONGS[id].t}” saiu do set list`);
    }
    const open = t.closest('[data-open]');
    if (open) return RH.songSheet.open(open.dataset.open);
    if (t.closest('[data-print]')) return window.print();
    if (t.closest('[data-clear]')) {
      const ok = await ui.confirm('Tirar todas as músicas do set list? O progresso da banda continua salvo.', { title: 'Limpar set list', okLabel: 'Limpar', danger: true });
      if (!ok) return;
      const updates = {};
      for (const it of s.setlist().items) updates[`setlists/main/items/${it.id}`] = null;
      s.write(updates);
      ui.toast('Set list limpo');
    }
  };

  const onKey = (e) => {
    const grip = e.target.closest('[data-grip]');
    if (grip && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      move(grip.closest('.sl-item').dataset.id, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    const open = e.target.matches('.sl-song[data-open]') ? e.target : null;
    if (open && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      RH.songSheet.open(open.dataset.open);
    }
  };

  const mount = (container) => {
    root = document.createElement('div');
    root.className = 'view-setlist';
    root.innerHTML = `
      <div class="view-head">
        <h1 class="section-title fire-text">Set List</h1>
        <p>Arraste pelas gemas para ordenar. A afinação é a da gravação original.</p>
      </div>
      <div class="setlist-layout">
        <aside class="setlist-summary panel panel-rivets" data-summary></aside>
        <div class="paper">
          <div class="print-head"><img src="assets/logo/rocks-hero.svg" alt="Rocks Hero"><span class="when" data-print-date></span></div>
          <label class="visually-hidden" for="setlist-name">Nome do show</label>
          <input id="setlist-name" class="setlist-name" data-name maxlength="80" placeholder="Nome do show…" autocomplete="off">
          <div data-list-wrap></div>
        </div>
      </div>
      <div class="visually-hidden" aria-live="polite" data-live></div>`;
    container.appendChild(root);
    liveRegion = ui.$('[data-live]', root);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    const nameInput = ui.$('[data-name]', root);
    nameInput.addEventListener('change', () => {
      const value = nameInput.value.trim();
      if (value !== store().setlist().name) store().renameSetlist(value);
    });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });
    render();
  };

  const update = (changes) => {
    if (!root) return;
    const s = store();
    const inList = [...changes.songs].some((id) => s.inSetlist(id));
    if (!(changes.setlist || changes.members || inList)) return;
    if (sortable && sortable.isDragging()) {
      pendingUpdate = true;
      return;
    }
    render();
  };

  const unmount = () => {
    root = null;
    sortable = null;
    liveRegion = null;
  };

  return { mount, update, unmount, title: () => 'Set List' };
})();
