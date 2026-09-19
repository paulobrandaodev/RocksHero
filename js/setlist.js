/* Tela Set List: vários set lists (show, ensaio, acústico), ordem, afinações, tempo do show,
   mediana da banda, impressão com as observações de cada músico e histórico de shows. */
window.RH = window.RH || {};
RH.views = RH.views || {};

RH.views.setlist = (() => {
  const ui = RH.ui;
  const U = RH.util;
  const esc = ui.esc;
  let root = null;
  let sortable = null;
  let pendingUpdate = false;
  let liveRegion = null;
  let printNotes = null; // null = sem observações; 'all' ou id do membro
  const META_OPEN_KEY = 'rh:v1:ui:setlist-meta-open';

  const store = () => RH.store;

  const announce = (text) => {
    if (liveRegion) liveRegion.textContent = text;
  };

  const kindName = (kind) => (RH.SETLIST_KINDS[kind] || RH.SETLIST_KINDS.show).name;

  const listLabel = (l) => [
    l.name || 'Sem nome',
    kindName(l.kind),
    l.date ? U.formatDay(l.date, { day: '2-digit', month: '2-digit', year: '2-digit' }) : '',
    `${l.count} música${l.count === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');

  // ---------- escolha da lista e dados do show ----------

  const pickerHtml = () => {
    const s = store();
    const lists = s.setlists();
    const cur = s.currentSetlistId();
    const opt = (l) => `<option value="${esc(l.id)}"${l.id === cur ? ' selected' : ''}>${esc(listLabel(l))}</option>`;
    const open = lists.filter((l) => !l.played);
    const played = lists.filter((l) => l.played);
    return `
      <label class="sl-picker-select">
        <span class="visually-hidden">Set list</span>
        <select class="select" data-pick-list>
          ${open.length ? `<optgroup label="Próximos">${open.map(opt).join('')}</optgroup>` : ''}
          ${played.length ? `<optgroup label="Realizados">${played.map(opt).join('')}</optgroup>` : ''}
        </select>
      </label>
      <button type="button" class="btn btn-sm" data-new-list>${RH.icons.svg('plus')} Novo</button>
      <button type="button" class="btn btn-sm btn-ghost" data-copy-list>${RH.icons.svg('copy')} Duplicar</button>
      <button type="button" class="btn btn-sm btn-ghost" data-delete-list>${RH.icons.svg('trash')} Excluir</button>`;
  };

  const metaSummary = (l) => [
    kindName(l.kind),
    l.date ? U.formatDay(l.date) : 'sem data',
    l.limit ? `show de ${l.limit} min` : '',
    `${String(Math.round((l.gap / 60) * 100) / 100).replace('.', ',')} min por troca`,
    l.played ? 'realizado ✓' : '',
  ].filter(Boolean).join(' · ');

  const metaHtml = () => {
    const l = store().setlist();
    const open = RH.safeStorage.getRaw(META_OPEN_KEY) === '1';
    return `
      <details class="sl-meta" data-meta-details${open ? ' open' : ''}>
        <summary>${RH.icons.svg('calendar')}<b>Dados do show</b><span>${esc(metaSummary(l))}</span>${RH.icons.svg('down', 'caret')}</summary>
        <div class="sl-meta-row">${metaFields(l)}</div>
      </details>`;
  };

  const metaFields = (l) => {
    const kinds = Object.entries(RH.SETLIST_KINDS).map(([k, v]) => `<option value="${k}"${k === l.kind ? ' selected' : ''}>${esc(v.name)}</option>`).join('');
    return `
      <label class="field"><span>Tipo</span><select class="select" data-meta="kind">${kinds}</select></label>
      <label class="field"><span>Data</span><input class="input" type="date" data-meta="date" value="${esc(l.date)}"></label>
      <label class="field"><span>Tempo combinado</span><span class="input-unit"><input class="input" type="number" inputmode="numeric" min="0" max="600" data-meta="limit" value="${l.limit || ''}" placeholder="—"><em>min</em></span></label>
      <label class="field"><span>Por troca de afinação</span><span class="input-unit"><input class="input" type="number" inputmode="decimal" min="0" max="10" step="0.5" data-meta="gap" value="${Math.round((l.gap / 60) * 100) / 100}"><em>min</em></span></label>
      <label class="switch sl-played"><input type="checkbox" data-meta="played"${l.played ? ' checked' : ''}> Show realizado</label>`;
  };

  // ---------- resumo ----------

  const energyHtml = (bpms, items) => {
    const known = bpms.filter(Boolean);
    if (known.length < 2) return '<span class="faint" style="font-size:14px">sem BPM suficiente</span>';
    const max = Math.max(...known, 180);
    const min = Math.min(...known, 60);
    const bars = bpms.map((b, i) => {
      const song = RH.SONGS[items[i].id];
      const h = b ? 6 + ((b - min) / (max - min)) * 30 : 3;
      return `<rect x="${i * 7}" y="${40 - h}" width="5" height="${h}" rx="1.5" class="${b ? '' : 'is-empty'}"><title>${esc(`${i + 1}. ${song.t}: ${b ? `${b} BPM` : 'sem BPM'}`)}</title></rect>`;
    }).join('');
    const avg = Math.round(known.reduce((a, b) => a + b, 0) / known.length);
    return `<span class="energy"><svg viewBox="0 0 ${bpms.length * 7 - 2} 40" preserveAspectRatio="none" role="img" aria-label="Andamento de cada música, na ordem do set. Média de ${avg} BPM">${bars}</svg><small>média ${avg} bpm</small></span>`;
  };

  const timeHtml = (timing) => {
    if (!timing.total) return '<span class="faint" style="font-size:14px">—</span>';
    const missing = timing.missing ? `<small class="faint"> +${timing.missing} sem duração</small>` : '';
    return `${U.formatMinutes(timing.total)}${missing}`;
  };

  const limitHtml = (timing) => {
    if (timing.left == null) return '';
    const over = timing.left < 0;
    const text = over ? `passou ${U.formatMinutes(-timing.left)}` : `sobram ${U.formatMinutes(timing.left)}`;
    return `<div class="${over ? 'is-over' : 'is-ok'}"><dt>Show de ${Math.round(timing.limit / 60)} min</dt><dd>${text}</dd></div>`;
  };

  const summaryHtml = () => {
    const s = store();
    const sum = s.setlistSummary();
    const t = sum.timing;
    const weakest = sum.weakest
      ? `<button type="button" class="link-btn" data-open="${sum.weakest.id}">${esc(RH.SONGS[sum.weakest.id].t)}</button> <span class="faint">(${sum.weakest.median}%)</span>`
      : '—';
    const parts = Object.entries(sum.parts).map(([key, n]) => {
      const part = RH.PARTS.find((p) => p.key === key);
      return `<span title="${esc(`${n} música${n > 1 ? 's' : ''} com ${part.name.toLowerCase()} sem membro`)}">${RH.icons.svg(part.icon)}×${n}</span>`;
    }).join('');
    const items = s.setlist().items;
    return `
      <div class="summary-meter">
        ${ui.rockMeter(sum.overall, { label: 'Mediana do set' })}
        <span class="label">Mediana do set</span>
      </div>
      <dl class="summary-stats">
        <div><dt>Músicas</dt><dd>${sum.count}</dd></div>
        <div><dt>Duração${t.gaps ? ` <small class="faint">(com ${U.formatMinutes(t.gaps)} de trocas)</small>` : ''}</dt><dd>${timeHtml(t)}</dd></div>
        ${limitHtml(t)}
        <div><dt>Trocas de afinação</dt><dd>${sum.changes.length}${sum.changes.length && sum.count >= 4 ? ` <button type="button" class="link-btn sm" data-optimize>otimizar</button>` : ''}</dd></div>
        <div><dt>Mais crua</dt><dd style="font-size:14px;font-weight:500">${weakest}</dd></div>
        <div><dt>Partes sem membro</dt><dd class="summary-parts">${parts || '<span class="faint" style="font-size:14px">nenhuma</span>'}</dd></div>
        <div class="summary-energy"><dt>Energia (BPM)</dt><dd>${energyHtml(sum.bpms, items)}</dd></div>
      </dl>
      <div class="summary-actions">
        <button type="button" class="btn btn-fire btn-stage" data-stage${sum.count ? '' : ' disabled'}>${RH.icons.svg('stage')} Modo Palco</button>
        <button type="button" class="btn" data-print${sum.count ? '' : ' disabled'}>${RH.icons.svg('print')} Imprimir</button>
        <button type="button" class="btn" data-optimize${sum.count >= 4 && sum.changes.length ? '' : ' disabled'}>${RH.icons.svg('wand')} Otimizar</button>
        <a class="btn" href="#/musicas/todas">${RH.icons.svg('plus')} Músicas</a>
        <button type="button" class="btn btn-ghost" data-clear${sum.count ? '' : ' disabled'}>${RH.icons.svg('trash')} Limpar</button>
      </div>`;
  };

  // ---------- lista ----------

  const notesFor = (songId) => {
    const s = store();
    if (!printNotes) return '';
    const list = printNotes === 'all' ? s.songNotes(songId) : s.songNotes(songId).filter((x) => x.member.id === printNotes);
    if (!list.length) return '';
    return `<div class="sl-notes">${list.map(({ member, note }) => `<p>${printNotes === 'all' ? `<b>${esc(member.name)}:</b> ` : ''}${esc(note.v)}</p>`).join('')}</div>`;
  };

  const itemHtml = (item, index, change, start) => {
    const s = store();
    const song = RH.SONGS[item.id];
    const games = (RH.catalog.songGames[item.id] || []).map((a) => a.game.short).join(', ');
    const changeHtml = change
      ? `<div class="sl-change">${RH.icons.svg('wrench')} Troca de afinação: ${esc(RH.tuningInfo(change.from).short)} → ${esc(RH.tuningInfo(change.to).short)}</div>`
      : '';
    const dur = s.duration(item.id);
    const bpm = s.bpm(item.id);
    const info = [
      start != null ? `<span title="Começa aos ${esc(U.formatDuration(start))} do show">▸ ${esc(U.formatDuration(start))}</span>` : '',
      dur.sec ? `<span title="Duração">${esc(U.formatDuration(dur.sec))}</span>` : '',
      bpm.val ? `<span title="${esc(`${bpm.val} BPM${bpm.confirmed ? '' : ' (a confirmar)'}`)}">${bpm.val} bpm</span>` : '',
    ].filter(Boolean).join('');
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
            ${info ? `<span class="sl-info">${info}</span>` : ''}
          </div>
          <div class="sl-tech">${ui.tuningBadge(s.tuning(item.id))}${ui.instruments(s, item.id, { inline: true })}</div>
          ${ui.score(s.median(item.id))}
          <div class="sl-actions">
            <button type="button" data-move="-1" aria-label="Subir"${index === 0 ? ' disabled' : ''}>${RH.icons.svg('up')}</button>
            <button type="button" data-move="1" aria-label="Descer">${RH.icons.svg('down')}</button>
            <button type="button" class="remove" data-remove aria-label="Tirar do set list">${RH.icons.svg('trash')}</button>
          </div>
        </div>
        ${notesFor(item.id)}
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
    const timing = s.setlistTiming();
    const showStarts = timing.missing < items.length;
    return `<ol class="sl-list" data-list>${items.map((it, i) => itemHtml(it, i, changes.get(i), showStarts ? timing.starts[i] : null)).join('')}</ol>`;
  };

  // ---------- histórico ----------

  const historyHtml = () => {
    const s = store();
    const shows = s.playedShows();
    const top = s.mostPlayed(8);
    if (!shows.length) {
      return `
        <h2 class="fire-text">Histórico de shows</h2>
        <p class="dim">Quando um set list vira show, marque <strong>Show realizado</strong>. Ele entra aqui e conta quantas vezes cada música foi tocada.</p>`;
    }
    const cur = s.currentSetlistId();
    return `
      <h2 class="fire-text">Histórico de shows</h2>
      <div class="history-grid">
        <ol class="show-list">
          ${shows.map((l) => {
            const t = s.setlistTiming(l.id);
            return `<li><button type="button" class="show-item${l.id === cur ? ' is-current' : ''}" data-select="${esc(l.id)}">
              <span class="show-date">${l.date ? esc(U.formatDay(l.date, { day: '2-digit', month: 'short', year: 'numeric' })) : 'sem data'}</span>
              <span class="show-name">${esc(l.name || 'Sem nome')}</span>
              <span class="show-meta">${esc(kindName(l.kind))} · ${l.count} música${l.count === 1 ? '' : 's'}${t.total ? ` · ${esc(U.formatMinutes(t.total))}` : ''}</span>
            </button></li>`;
          }).join('')}
        </ol>
        <div class="top-played">
          <h3>Mais tocadas</h3>
          <ol>${top.map((x) => `<li><button type="button" class="link-btn" data-open="${esc(x.id)}">${esc(RH.SONGS[x.id].t)}</button><span>${x.n}×</span></li>`).join('')}</ol>
        </div>
      </div>`;
  };

  // ---------- renderização ----------

  const printHead = () => {
    const s = store();
    const l = s.setlist();
    const t = s.setlistTiming();
    const who = printNotes && printNotes !== 'all' && s.state.members[printNotes]
      ? `Folha de ${s.state.members[printNotes].name}` : printNotes === 'all' ? 'Com as observações da banda' : '';
    const parts = [
      who,
      l.date ? U.formatDay(l.date) : `Impresso em ${new Date().toLocaleDateString('pt-BR')}`,
      t.total ? `${U.formatMinutes(t.total)}${t.missing ? ` (+${t.missing} sem duração)` : ''}` : '',
    ].filter(Boolean);
    return parts.map(esc).join(' · ');
  };

  const render = () => {
    if (!root) return;
    const s = store();
    const { name } = s.setlist();
    const active = document.activeElement;
    const focusedId = active && active.closest && active.closest('.sl-item') ? active.closest('.sl-item').dataset.id : null;
    const focusedAction = active && active.dataset
      ? (active.dataset.move || (active.hasAttribute('data-grip') ? 'grip' : null)) : null;
    const editingMeta = active && root.contains(active) && active.matches('[data-meta]:not([type=checkbox]), [data-pick-list]');
    ui.$('[data-picker]', root).innerHTML = pickerHtml();
    if (!editingMeta) ui.$('[data-meta-row]', root).innerHTML = metaHtml();
    ui.$('[data-summary]', root).innerHTML = summaryHtml();
    const nameInput = ui.$('[data-name]', root);
    if (document.activeElement !== nameInput) nameInput.value = name;
    ui.$('[data-list-wrap]', root).innerHTML = listHtml();
    ui.$('[data-print-date]', root).textContent = printHead();
    ui.$('[data-history]', root).innerHTML = historyHtml();
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

  // ---------- ações ----------

  const openNewList = ({ copy = false } = {}) => {
    const s = store();
    const cur = s.setlist();
    const kinds = Object.entries(RH.SETLIST_KINDS).map(([k, v]) => `<option value="${k}"${k === (copy ? cur.kind : 'show') ? ' selected' : ''}>${esc(v.name)}</option>`).join('');
    const sheet = ui.sheet({
      title: copy ? 'Duplicar set list' : 'Novo set list',
      subtitle: copy ? `Cópia de “${cur.name || 'Sem nome'}” com as mesmas músicas` : 'Um por show, um de ensaio, um acústico…',
      body: `
        <form class="new-list" data-new-form>
          <label class="field"><span>Nome</span><input class="input" name="name" maxlength="80" required autocomplete="off" value="${copy ? esc(`${cur.name || 'Set list'} (cópia)`) : ''}" placeholder="Ex.: Estreia no Bar do Zé" autofocus></label>
          <div class="edit-pair">
            <label class="field"><span>Tipo</span><select class="select" name="kind">${kinds}</select></label>
            <label class="field"><span>Data do show</span><input class="input" type="date" name="date"></label>
          </div>
          ${copy ? '' : `<label class="switch"><input type="checkbox" name="copy"${cur.items.length ? '' : ' disabled'}> Começar com as músicas de “${esc(cur.name || 'Sem nome')}”</label>`}
          <div class="sheet-footer">
            <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
            <button type="submit" class="btn btn-fire">${RH.icons.svg('check')} Criar</button>
          </div>
        </form>`,
    });
    sheet.body.querySelector('[data-new-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim();
      if (!name) return f.name.focus();
      s.createSetlist({ name, kind: f.kind.value, date: f.date.value, copyFrom: copy || (f.copy && f.copy.checked) ? cur.id : null });
      sheet.close();
      ui.toast(`Set list “${name}” criado`, { kind: 'ok' });
    });
  };

  const deleteList = async () => {
    const s = store();
    const l = s.setlist();
    const ok = await ui.confirm(`Excluir o set list “${l.name || 'Sem nome'}”${l.items.length ? ` com ${l.items.length} música${l.items.length > 1 ? 's' : ''}` : ''}? O progresso da banda continua salvo.${l.played ? ' Ele também sai do histórico de shows.' : ''}`, { title: 'Excluir set list', okLabel: 'Excluir', danger: true });
    if (!ok) return;
    s.deleteSetlist(l.id);
    ui.toast('Set list excluído');
  };

  const openOptimize = () => {
    const s = store();
    const { items } = s.setlist();
    const next = s.optimizeOrder(items);
    const before = s.tuningChanges(items).length;
    const after = s.tuningChanges(next.map((id) => ({ id }))).length;
    if (after >= before) {
      ui.toast(before ? `Essa ordem já tem o mínimo de trocas possível mantendo a primeira e a última (${before}).` : 'Nenhuma troca de afinação: nada a otimizar.');
      return;
    }
    const changesAt = new Set(s.tuningChanges(next.map((id) => ({ id }))).map((c) => c.index));
    const sheet = ui.sheet({
      title: 'Otimizar ordem',
      subtitle: `De ${before} para ${after} troca${after === 1 ? '' : 's'} de afinação`,
      body: `
        <p class="dim small" style="margin-top:0">As músicas ficam agrupadas pela afinação. A primeira e a última não mudam de lugar, e dentro de cada grupo a ordem de vocês é mantida.</p>
        <ol class="optimize-preview">
          ${next.map((id, i) => `<li class="${changesAt.has(i) ? 'is-change' : ''}"><span class="n">${i + 1}</span><span class="t">${esc(RH.SONGS[id].t)}</span>${ui.tuningBadge(s.tuning(id))}${i === 0 || i === next.length - 1 ? '<span class="pin" title="Fica no lugar">📌</span>' : ''}</li>`).join('')}
        </ol>
        <div class="sheet-footer">
          <button type="button" class="btn btn-ghost" data-close>Manter como está</button>
          <button type="button" class="btn btn-fire" data-apply>${RH.icons.svg('wand')} Aplicar nova ordem</button>
        </div>`,
    });
    sheet.body.querySelector('[data-apply]').addEventListener('click', () => {
      s.applyOrder(next);
      sheet.close();
      ui.toast(`Ordem aplicada: ${after} troca${after === 1 ? '' : 's'} de afinação`, { kind: 'ok' });
    });
  };

  const openPrint = () => {
    const s = store();
    const members = s.members();
    const me = s.me();
    const withNotes = (id) => s.setlist().items.filter((it) => s.memberNote(it.id, id)).length;
    const option = (value, label, extra, checked) => `
      <label class="print-choice"><input type="radio" name="who" value="${esc(value)}"${checked ? ' checked' : ''}><span>${label}</span><small>${esc(extra)}</small></label>`;
    const sheet = ui.sheet({
      title: 'Imprimir set list',
      subtitle: 'Cada músico pode levar a própria folha, com as observações embaixo de cada música.',
      body: `
        <form data-print-form>
          <div class="print-choices">
            ${option('', 'Só as músicas', 'sem observações', !me)}
            ${members.map((m) => option(m.id, `Folha de ${esc(m.name)}`, `${(RH.MEMBER_INSTRUMENTS[m.instrument] || {}).name || ''} · ${withNotes(m.id)} com observação`, m.id === me)).join('')}
            ${option('all', 'Todas as observações', 'da banda inteira')}
          </div>
          <div class="sheet-footer">
            <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
            <button type="submit" class="btn btn-fire">${RH.icons.svg('print')} Imprimir</button>
          </div>
        </form>`,
    });
    sheet.body.querySelector('[data-print-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      printNotes = e.target.who.value || null;
      sheet.close();
      render();
      const done = () => {
        window.removeEventListener('afterprint', done);
        printNotes = null;
        render();
      };
      window.addEventListener('afterprint', done);
      setTimeout(() => window.print(), 300); // espera o painel fechar
    });
  };

  const onClick = async (e) => {
    const s = store();
    const t = e.target;
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
    const select = t.closest('[data-select]');
    if (select) {
      s.selectSetlist(select.dataset.select);
      return window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (t.closest('[data-new-list]')) return openNewList();
    if (t.closest('[data-copy-list]')) return openNewList({ copy: true });
    if (t.closest('[data-delete-list]')) return deleteList();
    if (t.closest('[data-stage]')) return RH.stage.open();
    if (t.closest('[data-optimize]')) return openOptimize();
    if (t.closest('[data-print]')) return openPrint();
    if (t.closest('[data-clear]')) {
      const ok = await ui.confirm('Tirar todas as músicas deste set list? O progresso da banda continua salvo.', { title: 'Limpar set list', okLabel: 'Limpar', danger: true });
      if (!ok) return;
      const listId = s.currentSetlistId();
      const updates = {};
      for (const it of s.setlist().items) updates[`setlists/${listId}/items/${it.id}`] = null;
      s.write(updates);
      ui.toast('Set list limpo');
    }
  };

  const onChange = (e) => {
    const s = store();
    const t = e.target;
    if (t.matches('[data-pick-list]')) return s.selectSetlist(t.value);
    const field = t.dataset.meta;
    if (!field) return;
    let value;
    if (field === 'played') {
      value = t.checked;
      if (value && !s.setlist().date) s.setSetlistFields({ date: U.dayKey(s.now()) });
    } else if (field === 'limit') value = t.value === '' ? null : Number(t.value);
    else if (field === 'gap') value = t.value === '' ? null : Math.round(Number(String(t.value).replace(',', '.')) * 60);
    else value = t.value;
    try {
      s.setSetlistFields({ [field]: value });
      if (field === 'played' && value) ui.toast('Show realizado: entrou no histórico. Valeu, rock stars!', { kind: 'rock' });
    } catch {
      ui.toast('Valor inválido', { kind: 'error' });
      render();
    }
  };

  const onKey = (e) => {
    const grip = e.target.closest('[data-grip]');
    if (grip && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      move(grip.closest('.sl-item').dataset.id, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (e.target.matches('[data-meta]') && e.key === 'Enter') e.target.blur();
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
      <div class="sl-picker" data-picker></div>
      <div data-meta-row></div>
      <div class="setlist-layout">
        <aside class="setlist-summary panel panel-rivets" data-summary></aside>
        <div class="paper">
          <div class="print-head"><img src="assets/logo/rocks-hero.svg" alt="Rocks Hero"><span class="when" data-print-date></span></div>
          <label class="visually-hidden" for="setlist-name">Nome do show</label>
          <input id="setlist-name" class="setlist-name" data-name maxlength="80" placeholder="Nome do show…" autocomplete="off">
          <div data-list-wrap></div>
        </div>
      </div>
      <section class="setlist-history panel panel-rivets" data-history></section>
      <div class="visually-hidden" aria-live="polite" data-live></div>`;
    container.appendChild(root);
    liveRegion = ui.$('[data-live]', root);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKey);
    root.addEventListener('change', onChange);
    root.addEventListener('toggle', (e) => {
      if (e.target.matches('[data-meta-details]')) RH.safeStorage.setRaw(META_OPEN_KEY, e.target.open ? '1' : '0');
    }, true);
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
