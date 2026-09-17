/* Tela Músicas: abas por jogo, filtros e progresso da banda. */
window.RH = window.RH || {};
RH.views = RH.views || {};

// Índices do catálogo (calculados uma vez).
RH.buildCatalog = () => {
  const songGames = {};
  for (const game of RH.GAMES) {
    for (const tier of game.tiers) {
      for (const entry of tier.songs) (songGames[entry.id] = songGames[entry.id] || []).push({ game, tier, entry });
    }
  }
  const search = {};
  for (const [id, s] of Object.entries(RH.SONGS)) search[id] = RH.util.fold(`${s.t} ${s.a}`);
  return { songGames, search };
};

RH.views.catalog = (() => {
  const ui = RH.ui;
  const U = RH.util;
  const esc = ui.esc;
  const PREFS_KEY = 'rh:v1:ui:catalog';
  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

  let root = null;
  let rows = new Map();
  let filters = { q: '', tuning: 'all', status: 'all', sort: 'game', onlySetlist: false };
  let gameId = 'gh1';
  let renderToken = 0;
  let resizeObserver = null;

  const store = () => RH.store;

  const savePrefs = () => {
    const { q, ...rest } = filters;
    RH.safeStorage.set(PREFS_KEY, rest);
  };

  const loadPrefs = () => ({ ...filters, ...(RH.safeStorage.get(PREFS_KEY) || {}), q: '' });

  // ---------- dados da aba ----------

  const groupsFor = (id) => {
    if (id === 'todas') {
      const ids = Object.keys(RH.SONGS).sort((a, b) => collator.compare(RH.SONGS[a].t, RH.SONGS[b].t));
      const groups = new Map();
      for (const songId of ids) {
        const first = U.fold(RH.SONGS[songId].t).replace(/^(the|a|an|o|os|as)\s+/i, '').charAt(0).toUpperCase();
        const key = /[A-Z]/.test(first) ? first : '#';
        if (!groups.has(key)) groups.set(key, { key, name: key === '#' ? 'Números e símbolos' : key, entries: [] });
        const appearances = RH.catalog.songGames[songId];
        groups.get(key).entries.push({ id: songId, entry: appearances[0].entry, all: appearances });
      }
      return [...groups.values()].sort((a, b) => (a.key === '#' ? -1 : b.key === '#' ? 1 : a.key.localeCompare(b.key)));
    }
    const game = RH.GAMES.find((g) => g.id === id);
    return game.tiers.map((tier, i) => ({
      key: `t${i}`,
      n: tier.n,
      name: tier.name,
      bonus: tier.bonus,
      coop: tier.coop,
      entries: tier.songs.map((entry) => ({ id: entry.id, entry })),
    }));
  };

  const matches = (id) => {
    const s = store();
    if (filters.q && !RH.catalog.search[id].includes(filters.q)) return false;
    if (filters.onlySetlist && !s.inSetlist(id)) return false;
    if (filters.tuning !== 'all') {
      const t = s.tuning(id);
      if (filters.tuning === 'unknown') { if (t.code) return false; }
      else if (filters.tuning === 'unconfirmed') { if (!t.code || t.confirmed) return false; }
      else if (t.code !== filters.tuning) return false;
    }
    if (filters.status !== 'all') {
      const med = s.median(id);
      const m = med == null ? 0 : med;
      if (filters.status === 'ready' && m < 80) return false;
      if (filters.status === 'progress' && (m === 0 || m >= 80)) return false;
      if (filters.status === 'zero' && m !== 0) return false;
      if (filters.status === 'mine') {
        const me = s.me();
        if (!me) return true;
        if (!s.applicableMembers(id).some((x) => x.id === me)) return false;
        const leaf = s.progress(id, me);
        if (leaf && typeof leaf.v === 'number' && leaf.v >= 80) return false;
      }
    }
    return true;
  };

  // ---------- HTML ----------

  const badgesFor = (item) => {
    const e = item.entry;
    const b = [];
    if (gameId === 'todas') return '';
    if (e.bonus) b.push('<span class="badge badge-bonus">Bônus</span>');
    if (e.cover) b.push('<span class="badge badge-cover">Cover</span>');
    if (e.encore) b.push('<span class="badge badge-encore">Encore</span>');
    if (e.boss) b.push('<span class="badge badge-encore">Boss</span>');
    if (e.plat) b.push(`<span class="badge badge-plat">${esc(e.plat)}</span>`);
    if (e.ver) b.push(`<span class="badge badge-ver">${esc(e.ver)}</span>`);
    return b.join('');
  };

  const rowHtml = (item) => {
    const s = store();
    const { id } = item;
    const song = RH.SONGS[id];
    const members = s.members();
    const applicable = new Set(s.applicableMembers(id).map((m) => m.id));
    const bars = members.map((m) => ui.memberBar(m, s.progress(id, m.id), applicable.has(m.id))).join('');
    const inSet = s.inSetlist(id);
    const games = gameId === 'todas'
      ? ` · ${item.all.map((a) => esc(a.game.short)).join(', ')}`
      : '';
    return `
      <div class="song-row" data-id="${id}" role="button" tabindex="0" aria-label="${esc(`${song.t}, ${song.a}`)}">
        <div class="song-main">
          <div class="song-title">${esc(song.t)} ${badgesFor(item)}</div>
          <div class="song-sub">${esc(song.a)} · ${song.y}${games}</div>
        </div>
        <div class="song-tech">${ui.tuningBadge(s.tuning(id))}${ui.instruments(s, id)}</div>
        <div class="song-bars${members.length > 4 ? ' is-many' : ''}">${bars}</div>
        ${ui.score(s.median(id))}
        <button type="button" class="sl-toggle" data-toggle aria-pressed="${inSet}" title="${inSet ? 'Tirar do set list' : 'Adicionar ao set list'}" aria-label="${inSet ? 'Tirar do set list' : 'Adicionar ao set list'}">
          ${RH.icons.svg(inSet ? 'check' : 'plus')}
        </button>
      </div>`;
  };

  const sectionHtml = (group, i, items) => {
    const color = ui.TIER_COLORS[(group.n ? group.n - 1 : i) % ui.TIER_COLORS.length];
    const label = group.n != null && gameId !== 'todas' ? group.n : group.bonus ? '★' : group.coop ? '2P' : group.key.length === 1 ? group.key : '♪';
    return `
      <section class="tier" data-group="${esc(group.key)}">
        <div class="tier-head" style="--tier-color:${color}">
          <span class="tier-n">${esc(String(label))}</span>
          <h3>${esc(group.name)}</h3>
          <span class="tier-count" data-count>${items.length} música${items.length === 1 ? '' : 's'}</span>
        </div>
        <div class="tier-rows">${items.map(rowHtml).join('')}</div>
      </section>`;
  };

  const tabsHtml = () => {
    const all = `
      <a class="game-tab" role="tab" href="#/musicas/todas" aria-selected="${gameId === 'todas'}" style="--c1:#ff8a00">
        <span class="emblem emblem-all" aria-hidden="true"><span>★</span></span>
        <span>Todas<small>${Object.keys(RH.SONGS).length} músicas</small></span>
      </a>`;
    const games = RH.GAMES.map((g) => `
      <a class="game-tab" role="tab" href="#/musicas/${g.id}" aria-selected="${g.id === gameId}" style="--c1:${g.c1};--c2:${g.c2}">
        ${ui.emblem(g)}
        <span>${esc(g.short)}<small>${g.year}</small></span>
      </a>`).join('');
    return all + games;
  };

  const bannerStats = () => {
    const s = store();
    const ids = gameId === 'todas'
      ? Object.keys(RH.SONGS)
      : RH.GAMES.find((g) => g.id === gameId).tiers.flatMap((t) => t.songs.map((e) => e.id));
    let ready = 0;
    let sum = 0;
    for (const id of ids) {
      const m = s.median(id) || 0;
      sum += m;
      if (m >= 80) ready++;
    }
    return { total: ids.length, ready, avg: ids.length ? Math.round(sum / ids.length) : 0 };
  };

  const bannerHtml = () => {
    const stats = bannerStats();
    if (gameId === 'todas') {
      return `
        <div class="game-banner" style="--c1:#ff8a00;--c2:#3b0a0a">
          <span class="emblem emblem-all" aria-hidden="true"><span>★</span></span>
          <div>
            <h1 class="fire-text">Todas as músicas</h1>
            <div class="meta">${stats.total} músicas únicas dos 13 Guitar Hero de console</div>
          </div>
          <div class="banner-meter" data-banner-meter>${ui.rockMeter(stats.avg, { label: 'Progresso médio da banda' })}<span><strong>${stats.ready}</strong> de ${stats.total} prontas</span></div>
        </div>`;
    }
    const game = RH.GAMES.find((g) => g.id === gameId);
    return `
      <div class="game-banner" style="--c1:${game.c1};--c2:${game.c2}">
        ${ui.emblem(game)}
        <div>
          <h1 class="chrome-text">${esc(game.name)}</h1>
          <div class="meta">${game.year} · ${stats.total} faixas</div>
        </div>
        <div class="banner-meter" data-banner-meter>${ui.rockMeter(stats.avg, { label: 'Progresso médio da banda neste jogo' })}<span><strong>${stats.ready}</strong> de ${stats.total} prontas</span></div>
      </div>`;
  };

  const tuningFilterOptions = () => {
    const s = store();
    const ids = gameId === 'todas' ? Object.keys(RH.SONGS) : RH.GAMES.find((g) => g.id === gameId).tiers.flatMap((t) => t.songs.map((e) => e.id));
    const codes = new Map();
    let unknown = 0;
    let unconfirmed = 0;
    for (const id of ids) {
      const t = s.tuning(id);
      if (!t.code) { unknown++; continue; }
      if (!t.confirmed) unconfirmed++;
      codes.set(t.code, (codes.get(t.code) || 0) + 1);
    }
    const sorted = [...codes.entries()].sort((a, b) => RH.tuningInfo(a[0]).step - RH.tuningInfo(b[0]).step || b[1] - a[1]);
    const opt = (value, label) => `<option value="${esc(value)}"${filters.tuning === value ? ' selected' : ''}>${esc(label)}</option>`;
    return [
      opt('all', 'Todas as afinações'),
      ...sorted.map(([code, n]) => opt(code, `${RH.tuningInfo(code).label} (${n})`)),
      unconfirmed ? opt('unconfirmed', `A confirmar (${unconfirmed})`) : '',
      unknown ? opt('unknown', `Desconhecida (${unknown})`) : '',
    ].join('');
  };

  const toolbarHtml = () => {
    const me = store().me();
    const opt = (name, value, label) => `<option value="${value}"${filters[name] === value ? ' selected' : ''}>${label}</option>`;
    return `
      <div class="toolbar" data-toolbar>
        <label class="input-search">
          <span class="visually-hidden">Buscar música ou artista</span>
          ${RH.icons.svg('search')}
          <input class="input" type="search" data-filter="q" placeholder="Buscar música ou artista" autocomplete="off" enterkeyhint="search">
        </label>
        <label><span class="visually-hidden">Afinação</span><select class="select" data-filter="tuning">${tuningFilterOptions()}</select></label>
        <label><span class="visually-hidden">Situação</span>
          <select class="select" data-filter="status">
            ${opt('status', 'all', 'Qualquer progresso')}
            ${opt('status', 'ready', 'Prontas (80%+)')}
            ${opt('status', 'progress', 'Em andamento')}
            ${opt('status', 'zero', 'Não começadas')}
            ${me ? opt('status', 'mine', 'Falta eu tirar') : ''}
          </select>
        </label>
        <label><span class="visually-hidden">Ordenar</span>
          <select class="select" data-filter="sort">
            ${opt('sort', 'game', gameId === 'todas' ? 'Ordem alfabética' : 'Ordem do jogo')}
            ${opt('sort', 'median-desc', 'Mais prontas primeiro')}
            ${opt('sort', 'median-asc', 'Menos prontas primeiro')}
            ${opt('sort', 'artist', 'Artista')}
            ${opt('sort', 'year', 'Ano')}
            ${gameId === 'todas' ? '' : opt('sort', 'title', 'Título')}
          </select>
        </label>
        <label class="switch"><input type="checkbox" data-filter="onlySetlist"${filters.onlySetlist ? ' checked' : ''}> Só no set list</label>
      </div>
      <p class="result-info" data-result-info aria-live="polite"></p>`;
  };

  // ---------- renderização ----------

  const sortedGroups = () => {
    const groups = groupsFor(gameId);
    if (filters.sort === 'game') return groups;
    const s = store();
    const items = [];
    const seen = new Set();
    for (const g of groups) for (const it of g.entries) if (!seen.has(it.id)) { seen.add(it.id); items.push(it); }
    const title = (it) => RH.SONGS[it.id].t;
    const cmp = {
      title: (a, b) => collator.compare(title(a), title(b)),
      artist: (a, b) => collator.compare(RH.SONGS[a.id].a, RH.SONGS[b.id].a) || collator.compare(title(a), title(b)),
      year: (a, b) => RH.SONGS[a.id].y - RH.SONGS[b.id].y || collator.compare(title(a), title(b)),
      'median-desc': (a, b) => (s.median(b.id) || 0) - (s.median(a.id) || 0) || collator.compare(title(a), title(b)),
      'median-asc': (a, b) => (s.median(a.id) || 0) - (s.median(b.id) || 0) || collator.compare(title(a), title(b)),
    }[filters.sort];
    items.sort(cmp);
    const label = { title: 'Por título', artist: 'Por artista', year: 'Por ano', 'median-desc': 'Mais prontas primeiro', 'median-asc': 'Menos prontas primeiro' }[filters.sort];
    return [{ key: 'sorted', name: label, entries: items }];
  };

  const applyFilters = () => {
    if (!root) return;
    let visible = 0;
    let total = 0;
    ui.$$('.tier', root).forEach((section) => {
      let count = 0;
      section.querySelectorAll('.song-row').forEach((row) => {
        total++;
        const show = matches(row.dataset.id);
        row.hidden = !show;
        if (show) count++;
      });
      section.hidden = count === 0;
      const counter = section.querySelector('[data-count]');
      if (counter) counter.textContent = `${count} música${count === 1 ? '' : 's'}`;
      visible += count;
    });
    const info = ui.$('[data-result-info]', root);
    const active = filters.q || filters.tuning !== 'all' || filters.status !== 'all' || filters.onlySetlist;
    info.textContent = active ? `${visible} de ${total} músicas` : '';
    let empty = ui.$('[data-empty]', root);
    if (!visible && renderDone) {
      if (!empty) {
        ui.$('[data-list]', root).insertAdjacentHTML('afterend', `
          <div class="empty" data-empty><h3 class="chrome-text">Nenhuma música</h3><p>Nada bate com esses filtros. Tente outra busca.</p></div>`);
      }
    } else if (empty) {
      empty.remove();
    }
  };

  let renderDone = false;

  const renderList = ({ keepScroll = false } = {}) => {
    const token = ++renderToken;
    renderDone = false;
    const list = ui.$('[data-list]', root);
    const y = window.scrollY;
    list.innerHTML = '';
    rows = new Map();
    const groups = sortedGroups();
    const chunks = [];
    groups.forEach((g, i) => {
      const size = 60;
      for (let start = 0; start < g.entries.length; start += size) {
        chunks.push({ g, i, items: g.entries.slice(start, start + size), first: start === 0 });
      }
    });

    const appendChunk = (chunk) => {
      if (chunk.first) {
        list.insertAdjacentHTML('beforeend', sectionHtml(chunk.g, chunk.i, chunk.items));
      } else {
        const sections = list.querySelectorAll('.tier');
        sections[sections.length - 1].querySelector('.tier-rows').insertAdjacentHTML('beforeend', chunk.items.map(rowHtml).join(''));
      }
    };

    const first = chunks.splice(0, 2);
    first.forEach(appendChunk);
    const finish = () => {
      list.querySelectorAll('.song-row').forEach((row) => rows.set(row.dataset.id, row));
      // atualiza os contadores dos grupos depois de montar tudo
      list.querySelectorAll('.tier').forEach((section) => {
        const n = section.querySelectorAll('.song-row').length;
        section.querySelector('[data-count]').textContent = `${n} música${n === 1 ? '' : 's'}`;
      });
      renderDone = true;
      applyFilters();
      if (keepScroll) window.scrollTo(0, y);
    };
    const pump = () => {
      if (token !== renderToken) return;
      if (!chunks.length) return finish();
      appendChunk(chunks.shift());
      setTimeout(pump, 0);
    };
    if (chunks.length) setTimeout(pump, 0);
    else finish();
    if (keepScroll) window.scrollTo(0, y);
  };

  const updateBanner = U.debounce(() => {
    if (!root) return;
    const meter = ui.$('[data-banner-meter]', root);
    if (!meter) return;
    const stats = bannerStats();
    meter.innerHTML = `${ui.rockMeter(stats.avg, { label: 'Progresso médio da banda' })}<span><strong>${stats.ready}</strong> de ${stats.total} prontas</span>`;
  }, 250);

  const updateRow = (id) => {
    const row = rows.get(id);
    if (!row) return;
    const items = gameId === 'todas'
      ? [{ id, entry: RH.catalog.songGames[id][0].entry, all: RH.catalog.songGames[id] }]
      : RH.catalog.songGames[id].filter((a) => a.game.id === gameId).map((a) => ({ id, entry: a.entry }));
    if (!items.length) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = rowHtml(items[0]).trim();
    const fresh = tmp.firstElementChild;
    fresh.hidden = !matches(id);
    const hadFocus = row.contains(document.activeElement);
    row.replaceWith(fresh);
    rows.set(id, fresh);
    if (hadFocus) fresh.focus({ preventScroll: true });
  };

  // ---------- eventos ----------

  const onClick = (e) => {
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const id = toggle.closest('.song-row').dataset.id;
      const s = store();
      if (s.inSetlist(id)) {
        s.removeFromSetlist(id);
        ui.toast(`“${RH.SONGS[id].t}” saiu do set list`);
      } else {
        s.addToSetlist(id);
        ui.toast(`“${RH.SONGS[id].t}” entrou no set list!`, { kind: 'ok' });
      }
      return;
    }
    const row = e.target.closest('.song-row');
    if (row) RH.songSheet.open(row.dataset.id);
  };

  const onKey = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('song-row')) {
      e.preventDefault();
      RH.songSheet.open(e.target.dataset.id);
    }
  };

  const onSearch = U.debounce((value) => {
    filters.q = U.fold(value.trim());
    applyFilters();
  }, 160);

  const onFilter = (e) => {
    const name = e.target.dataset.filter;
    if (!name) return;
    if (name === 'q') return onSearch(e.target.value);
    filters[name] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    savePrefs();
    if (name === 'sort') renderList();
    else applyFilters();
  };

  // ---------- ciclo de vida ----------

  const mount = (container, params = {}) => {
    gameId = params.game === 'todas' || RH.GAMES.some((g) => g.id === params.game) ? params.game : 'gh1';
    filters = loadPrefs();
    if (gameId === 'todas' && filters.sort === 'title') filters.sort = 'game';
    root = document.createElement('div');
    root.className = 'view-catalog';
    root.innerHTML = `
      <nav class="game-tabs" role="tablist" aria-label="Jogos">${tabsHtml()}</nav>
      <div data-banner>${bannerHtml()}</div>
      ${toolbarHtml()}
      <div class="song-list" data-list></div>`;
    container.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    root.addEventListener('input', onFilter);
    root.addEventListener('change', onFilter);

    const toolbar = ui.$('[data-toolbar]', root);
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => root.style.setProperty('--toolbar-h', `${toolbar.offsetHeight}px`));
      resizeObserver.observe(toolbar);
    }
    const activeTab = ui.$('.game-tab[aria-selected="true"]', root);
    if (activeTab) activeTab.scrollIntoView({ inline: 'center', block: 'nearest' });
    renderList();
  };

  const update = (changes) => {
    if (!root) return;
    if (changes.members) {
      renderList({ keepScroll: true });
      updateBanner();
      return;
    }
    // Ao ordenar por mediana, a ordem fica estável enquanto a banda edita; reordena ao trocar o filtro.
    if (changes.songs.size) {
      for (const id of changes.songs) updateRow(id);
      updateBanner();
    }
    if (changes.setlist) {
      const s = store();
      rows.forEach((row, id) => {
        const btn = row.querySelector('[data-toggle]');
        const inSet = s.inSetlist(id);
        if (btn.getAttribute('aria-pressed') !== String(inSet)) {
          btn.setAttribute('aria-pressed', String(inSet));
          btn.title = inSet ? 'Tirar do set list' : 'Adicionar ao set list';
          btn.setAttribute('aria-label', btn.title);
          btn.innerHTML = RH.icons.svg(inSet ? 'check' : 'plus');
        }
      });
      if (filters.onlySetlist) applyFilters();
    }
  };

  const unmount = () => {
    renderToken++;
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    root = null;
    rows = new Map();
  };

  return { mount, update, unmount, title: () => (gameId === 'todas' ? 'Todas as músicas' : (RH.GAMES.find((g) => g.id === gameId) || {}).name) };
})();
