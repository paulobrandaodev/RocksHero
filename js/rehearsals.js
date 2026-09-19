/* Tela Ensaios: diário de ensaio, evolução do progresso da banda, músicas paradas
   e prioridade de ensaio (quem quer tocar × quanto já está pronto). */
window.RH = window.RH || {};
RH.views = RH.views || {};

RH.views.rehearsals = (() => {
  const ui = RH.ui;
  const U = RH.util;
  const esc = ui.esc;
  const PREFS_KEY = 'rh:v1:ui:rehearsals';
  let root = null;
  let chart = null;
  let prefs = { period: 90, scope: 'all' };

  const store = () => RH.store;

  const weekday = (key) => U.formatDay(key, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  const ago = (t) => {
    const days = Math.floor((store().now() - t) / 86400000);
    if (days < 14) return `há ${days} dia${days === 1 ? '' : 's'}`;
    const weeks = Math.floor(days / 7);
    return weeks < 9 ? `há ${weeks} semanas` : `há ${Math.floor(days / 30)} meses`;
  };

  // ---------- painéis ----------

  const chartPanel = () => {
    const seg = (name, value, label) => `<button type="button" data-pref="${name}" data-value="${value}" class="${String(prefs[name]) === String(value) ? 'is-active' : ''}">${label}</button>`;
    return `
      <section class="reh-card panel panel-rivets reh-chart">
        <h2 class="fire-text">Evolução</h2>
        <p class="dim small">Músicas prontas (80% ou mais) de cada membro e da banda (pela mediana), dia a dia.</p>
        <div class="reh-chart-controls">
          <div class="seg" role="group" aria-label="Período">${seg('period', 30, '30 dias')}${seg('period', 90, '3 meses')}${seg('period', 365, '1 ano')}</div>
          <div class="seg" role="group" aria-label="Quais músicas">${seg('scope', 'all', 'Todas')}${seg('scope', 'setlist', 'Set list atual')}</div>
        </div>
        <div data-chart></div>
      </section>`;
  };

  const stalePanel = () => {
    const s = store();
    const stale = s.staleSongs({ days: 21 }).slice(0, 12);
    return `
      <section class="reh-card panel panel-rivets">
        <h2 class="fire-text">Paradas há semanas</h2>
        <p class="dim small">Do set list atual ou já começadas, sem progresso nem ensaio há 3 semanas ou mais.</p>
        ${stale.length ? `<ul class="reh-songs">${stale.map((x) => `
          <li><button type="button" class="reh-song" data-open="${esc(x.id)}">
            <span class="t">${esc(RH.SONGS[x.id].t)}${x.inSetlist ? ' <span class="badge badge-ver">no set</span>' : ''}</span>
            <span class="s">${esc(RH.SONGS[x.id].a)} · ${x.t ? `parada ${esc(ago(x.t))}` : 'ainda ninguém mexeu'}</span>
            ${ui.score(x.median, { showStars: false })}
          </button></li>`).join('')}</ul>` : '<p class="reh-empty">Nada parado. A banda está em dia!</p>'}
      </section>`;
  };

  const priorityPanel = () => {
    const s = store();
    const ids = Object.keys((s.state.wants) || {}).filter((id) => RH.SONGS[id] && s.wanters(id).length);
    const top = ids.map((id) => ({ id, score: s.wantScore(id) })).sort((a, b) => b.score - a.score).slice(0, 10);
    const me = s.me();
    return `
      <section class="reh-card panel panel-rivets">
        <h2 class="fire-text">Prioridade de ensaio</h2>
        <p class="dim small">Quem quer tocar (${RH.icons.svg('heart')} no painel da música) cruzado com o quanto já está pronta.</p>
        ${top.length ? `<ol class="reh-songs is-ranked">${top.map((x) => `
          <li><button type="button" class="reh-song" data-open="${esc(x.id)}">
            <span class="t">${esc(RH.SONGS[x.id].t)} ${ui.wantBadge(s.wanters(x.id).length, s.wants(x.id, me))}</span>
            <span class="s">${esc(RH.SONGS[x.id].a)}${s.inSetlist(x.id) ? ' · no set' : ''}</span>
            ${ui.score(s.median(x.id), { showStars: false })}
          </button></li>`).join('')}</ol>
          <a class="link-btn" href="#/musicas/todas" data-sort-priority>Ver todas por prioridade</a>`
          : '<p class="reh-empty">Ninguém marcou “Quero tocar” ainda. Abra uma música e toque no coração.</p>'}
      </section>`;
  };

  const diaryPanel = () => {
    const s = store();
    const list = s.rehearsals();
    const members = s.state.members || {};
    return `
      <section class="reh-card panel panel-rivets reh-diary">
        <div class="reh-diary-head">
          <h2 class="fire-text">Diário de ensaio</h2>
          <button type="button" class="btn btn-fire" data-new>${RH.icons.svg('plus')} Registrar ensaio</button>
        </div>
        ${list.length ? `<ol class="reh-list">${list.map((r) => {
          const by = r.by && members[r.by];
          return `
            <li class="reh-item" data-id="${esc(r.id)}">
              <div class="reh-item-head">
                <span class="reh-date">${RH.icons.svg('calendar')} ${esc(weekday(r.date))}</span>
                ${by ? `<span class="reh-by inst-${esc(by.instrument)}">${ui.avatar(by)}${esc(by.name)}</span>` : ''}
                <span class="reh-tools">
                  <button type="button" class="btn btn-icon btn-sm btn-ghost" data-edit aria-label="Editar ensaio">${RH.icons.svg('edit')}</button>
                  <button type="button" class="btn btn-icon btn-sm btn-ghost" data-delete aria-label="Excluir ensaio">${RH.icons.svg('trash')}</button>
                </span>
              </div>
              ${r.note ? `<p class="reh-note">${esc(r.note)}</p>` : ''}
              ${r.songs.length ? `<div class="reh-chips">${r.songs.map((id) => `<button type="button" class="reh-chip" data-open="${esc(id)}">${esc(RH.SONGS[id].t)}</button>`).join('')}</div>` : '<p class="faint small">Sem músicas registradas.</p>'}
            </li>`;
        }).join('')}</ol>` : `
          <div class="empty">
            <img src="assets/art/amp.svg" alt="">
            <h3 class="fire-text">Nenhum ensaio ainda</h3>
            <p>Registre o que a banda passou em cada ensaio. O progresso de cada um já fica guardado dia a dia.</p>
          </div>`}
      </section>`;
  };

  // ---------- gráfico ----------

  const drawChart = () => {
    const box = root && ui.$('[data-chart]', root);
    if (!box) return;
    if (chart) chart.destroy();
    chart = null;
    const s = store();
    const from = U.dayKey(s.now() - (prefs.period - 1) * 86400000);
    const songIds = prefs.scope === 'setlist' ? s.setlist().items.map((it) => it.id) : null;
    const data = s.readyTimeline({ from, songIds });
    const any = data.series.some((x) => x.values.some((v) => v > 0));
    if (!any) {
      box.innerHTML = `<p class="reh-empty">${prefs.scope === 'setlist' ? 'Nenhuma música do set list atual chegou a 80% ainda.' : 'Nenhuma música chegou a 80% ainda.'} Conforme a banda registra o progresso, as linhas sobem aqui.</p>`;
      return;
    }
    const series = data.series.map((x) => (x.id === 'band' ? { ...x, band: true } : x));
    chart = RH.chart.timeline(box, { days: data.days, series }, { unit: 'prontas', label: 'Músicas prontas por membro e da banda ao longo do tempo' });
  };

  // ---------- formulário ----------

  const openForm = (rehearsal = null) => {
    const s = store();
    const selected = new Set(rehearsal ? rehearsal.songs : []);
    const setItems = s.setlist().items.map((it) => it.id);
    const sheet = ui.sheet({
      title: rehearsal ? 'Editar ensaio' : 'Registrar ensaio',
      subtitle: 'O que a banda passou hoje',
      body: `
        <form class="reh-form" data-form>
          <label class="field"><span>Data</span><input class="input" type="date" name="date" required value="${esc(rehearsal ? rehearsal.date : U.dayKey(s.now()))}"></label>
          <div class="field">
            <span>Músicas passadas <small class="faint" data-count></small></span>
            ${setItems.length ? `<div class="reh-quick"><small class="faint">Do set list “${esc(s.setlist().name || 'atual')}”:</small> <button type="button" class="link-btn" data-all-set>marcar todas</button></div>` : ''}
            <div class="reh-pick" data-pick></div>
            <label class="input-search reh-search">
              <span class="visually-hidden">Buscar outra música</span>
              ${RH.icons.svg('search')}
              <input class="input" type="search" data-search placeholder="Buscar outra música" autocomplete="off">
            </label>
            <div class="reh-results" data-results></div>
          </div>
          <label class="field"><span>Observação geral</span>
            <textarea class="input" name="note" rows="4" maxlength="${s.NOTE_REHEARSAL_MAX}" placeholder="Ex.: a virada de Iron Man ainda escapa; testar a ordem nova do set">${esc(rehearsal ? rehearsal.note : '')}</textarea></label>
          <div class="sheet-footer">
            <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
            <button type="submit" class="btn btn-fire">${RH.icons.svg('check')} Salvar ensaio</button>
          </div>
        </form>`,
    });
    const form = sheet.body.querySelector('[data-form]');
    const pick = form.querySelector('[data-pick]');
    const results = form.querySelector('[data-results]');
    const paintPick = () => {
      const ids = [...new Set([...setItems, ...selected])];
      pick.innerHTML = ids.map((id) => `
        <button type="button" class="reh-chip is-toggle" aria-pressed="${selected.has(id)}" data-toggle="${esc(id)}">${selected.has(id) ? RH.icons.svg('check') : ''}${esc(RH.SONGS[id].t)}</button>`).join('')
        || '<p class="faint small">Busque as músicas abaixo.</p>';
      form.querySelector('[data-count]').textContent = selected.size ? `(${selected.size})` : '';
    };
    const search = U.debounce((q) => {
      const f = U.fold(q.trim());
      if (f.length < 2) { results.innerHTML = ''; return; }
      const hits = Object.keys(RH.SONGS).filter((id) => RH.catalog.search[id].includes(f)).slice(0, 8);
      results.innerHTML = hits.map((id) => `<button type="button" class="reh-result" data-add="${esc(id)}">${RH.icons.svg(selected.has(id) ? 'check' : 'plus')}<span>${esc(RH.SONGS[id].t)}</span><small>${esc(RH.SONGS[id].a)}</small></button>`).join('')
        || '<p class="faint small">Nada encontrado.</p>';
    }, 150);
    form.addEventListener('input', (e) => { if (e.target.matches('[data-search]')) search(e.target.value); });
    form.addEventListener('keydown', (e) => { if (e.target.matches('[data-search]') && e.key === 'Enter') e.preventDefault(); });
    form.addEventListener('click', (e) => {
      const tg = e.target.closest('[data-toggle]');
      if (tg) {
        const id = tg.dataset.toggle;
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        return paintPick();
      }
      const add = e.target.closest('[data-add]');
      if (add) {
        selected.add(add.dataset.add);
        form.querySelector('[data-search]').value = '';
        results.innerHTML = '';
        return paintPick();
      }
      if (e.target.closest('[data-all-set]')) { setItems.forEach((id) => selected.add(id)); paintPick(); }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      try {
        s.saveRehearsal({ id: rehearsal && rehearsal.id, date: form.date.value, note: form.note.value, songs: [...selected] });
      } catch (err) {
        return ui.toast(err.message, { kind: 'error' });
      }
      sheet.close();
      ui.toast(rehearsal ? 'Ensaio atualizado' : 'Ensaio registrado. Bom trabalho!', { kind: 'ok' });
    });
    paintPick();
  };

  // ---------- ciclo de vida ----------

  const render = () => {
    if (!root) return;
    ui.$('[data-body]', root).innerHTML = `
      <div class="reh-grid">
        ${diaryPanel()}
        ${chartPanel()}
        ${stalePanel()}
        ${priorityPanel()}
      </div>`;
    drawChart();
  };

  const onClick = async (e) => {
    const s = store();
    const t = e.target;
    const open = t.closest('[data-open]');
    if (open) return RH.songSheet.open(open.dataset.open);
    if (t.closest('[data-new]')) return openForm();
    const pref = t.closest('[data-pref]');
    if (pref) {
      const v = pref.dataset.value;
      prefs[pref.dataset.pref] = /^\d+$/.test(v) ? Number(v) : v;
      RH.safeStorage.set(PREFS_KEY, prefs);
      pref.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === pref));
      return drawChart();
    }
    if (t.closest('[data-sort-priority]')) {
      const saved = RH.safeStorage.get('rh:v1:ui:catalog') || {};
      RH.safeStorage.set('rh:v1:ui:catalog', { ...saved, sort: 'priority' });
      return;
    }
    const item = t.closest('.reh-item');
    if (!item) return;
    const r = s.rehearsals().find((x) => x.id === item.dataset.id);
    if (t.closest('[data-edit]') && r) return openForm(r);
    if (t.closest('[data-delete]') && r) {
      const ok = await ui.confirm(`Excluir o ensaio de ${weekday(r.date)}?`, { title: 'Excluir ensaio', okLabel: 'Excluir', danger: true });
      if (ok) { s.deleteRehearsal(r.id); ui.toast('Ensaio excluído'); }
    }
  };

  const mount = (container) => {
    const saved = RH.safeStorage.get(PREFS_KEY) || {};
    prefs = {
      period: [30, 90, 365].includes(saved.period) ? saved.period : 90,
      scope: saved.scope === 'setlist' ? 'setlist' : 'all',
    };
    root = document.createElement('div');
    root.className = 'view-rehearsals';
    root.innerHTML = `
      <div class="view-head">
        <h1 class="section-title chrome-text">Ensaios</h1>
        <p>Diário da banda e como o progresso de cada um evolui.</p>
      </div>
      <div data-body></div>`;
    container.appendChild(root);
    root.addEventListener('click', onClick);
    render();
  };

  const update = (changes) => {
    if (!root) return;
    if (changes.rehearsals || changes.members || changes.setlist || changes.songs.size) render();
  };

  const unmount = () => {
    if (chart) chart.destroy();
    chart = null;
    root = null;
  };

  return { mount, update, unmount, title: () => 'Ensaios' };
})();
