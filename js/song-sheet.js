/* Painel da música: detalhes, correções e progresso de cada membro. */
window.RH = window.RH || {};

RH.songSheet = (() => {
  const ui = RH.ui;
  const esc = ui.esc;
  let current = null;

  const store = () => RH.store;

  const entryBadges = (entry) => {
    const b = [];
    if (entry.bonus) b.push('<span class="badge badge-bonus">Bônus</span>');
    if (entry.cover) b.push(`<span class="badge badge-cover" title="${esc(entry.coverBy ? `Versão cover de ${entry.coverBy}` : 'Versão cover no jogo')}">Cover</span>`);
    if (entry.encore) b.push('<span class="badge badge-encore">Encore</span>');
    if (entry.plat) b.push(`<span class="badge badge-plat">${esc(entry.plat)}</span>`);
    if (entry.ver) b.push(`<span class="badge badge-ver">${esc(entry.ver)}</span>`);
    return b.join('');
  };

  const tuningOptions = (code) => {
    const known = Object.entries(RH.TUNINGS)
      .map(([k, v]) => `<option value="${esc(k)}"${k === code ? ' selected' : ''}>${esc(v.label)}</option>`)
      .join('');
    const isOther = code && !RH.TUNINGS[code];
    return `<option value=""${code == null ? ' selected' : ''}>Desconhecida</option>${known}<option value="__other"${isOther ? ' selected' : ''}>Outra…</option>`;
  };

  const renderEditForm = (id) => {
    const s = store();
    const t = s.tuning(id);
    const ins = s.instrumentation(id);
    const counts = ins.counts || RH.parseIns('');
    const otherText = t.code && !RH.TUNINGS[t.code] ? RH.tuningInfo(t.code).label : '';
    const steppers = RH.PARTS.map((p) => `
      <div class="stepper" data-part="${p.key}">
        ${RH.icons.svg(p.icon)}<span>${esc(p.name)}</span>
        <button type="button" class="btn btn-icon btn-sm" data-step="-1" aria-label="Menos ${esc(p.name)}">${RH.icons.svg('minus')}</button>
        <b>${counts[p.key]}</b>
        <button type="button" class="btn btn-icon btn-sm" data-step="1" aria-label="Mais ${esc(p.name)}">${RH.icons.svg('plus')}</button>
      </div>`).join('');
    return `
      <form class="edit-grid" data-edit-form>
        <label class="field">
          <span>Afinação original</span>
          <select class="select" name="tuning">${tuningOptions(t.code)}</select>
        </label>
        <label class="field" data-other ${otherText ? '' : 'hidden'}>
          <span>Descreva a afinação</span>
          <input class="input" name="other" maxlength="50" value="${esc(otherText)}" placeholder="ex.: Dó aberta (CGCGCE)">
        </label>
        <div class="field">
          <span>Instrumentação da gravação original</span>
          <div class="steppers">${steppers}</div>
        </div>
        <div class="edit-actions">
          <button type="submit" class="btn btn-fire">${RH.icons.svg('check')} Salvar</button>
          <button type="button" class="btn btn-ghost" data-cancel-edit>Cancelar</button>
          ${t.overridden || ins.overridden ? '<button type="button" class="btn btn-ghost" data-reset-edit>Restaurar original</button>' : ''}
        </div>
      </form>`;
  };

  const render = () => {
    if (!current) return;
    const s = store();
    const { id } = current;
    const song = RH.SONGS[id];
    const members = s.members();
    if (!members.some((m) => m.id === current.memberId)) current.memberId = (s.me() && members.some((m) => m.id === s.me())) ? s.me() : (members[0] && members[0].id);

    const t = s.tuning(id);
    const tInfo = RH.tuningInfo(t.code);
    const ins = s.instrumentation(id);
    const gaps = s.uncovered(id);
    const median = s.median(id);
    const applicable = new Set(s.applicableMembers(id).map((m) => m.id));
    const appearances = (RH.catalog.songGames[id] || []);
    const note = s.note(id);

    const tuningNote = t.overridden
      ? `Corrigida pela banda${t.t ? ` ${ui.formatWhen(t.t)}` : ''}.`
      : tInfo.unknown ? 'Ninguém confirmou ainda. Se souber, corrija.'
        : !t.confirmed ? 'Informação a confirmar: vale checar antes do ensaio.' : '';

    const gapsText = gaps.length
      ? `Sem membro para: ${gaps.map((g) => `${g.missing > 1 ? `${g.missing} × ` : ''}${RH.PARTS.find((p) => p.key === g.key).name.toLowerCase()}`).join(', ')}.`
      : ins.counts ? 'A formação cobre todas as partes.' : '';

    const games = appearances.map(({ game, entry, tier }) => `
      <a class="game-chip" href="#/musicas/${game.id}" data-close title="${esc(`${game.name} · ${tier.name}`)}">
        ${ui.emblem(game)}${esc(game.short)} ${entryBadges(entry)}
      </a>`).join('');

    const pickerChips = members.map((m) => {
      const leaf = s.progress(id, m.id);
      const val = !applicable.has(m.id) ? '—' : `${leaf && typeof leaf.v === 'number' ? leaf.v : 0}%`;
      return `<button type="button" class="chip inst-${esc(m.instrument)}" aria-pressed="${m.id === current.memberId}" data-member="${esc(m.id)}">
        ${ui.avatar(m)}<span>${esc(m.name)}</span><span class="val">${val}</span></button>`;
    }).join('');

    const member = members.find((m) => m.id === current.memberId);
    let editor = '<p class="dim">Cadastre os membros na tela Banda.</p>';
    if (member) {
      const leaf = s.progress(id, member.id);
      const isNa = !applicable.has(member.id);
      const value = leaf && typeof leaf.v === 'number' ? leaf.v : 0;
      const explicitNa = leaf && leaf.v === 'na';
      const quick = [0, 25, 50, 75, 100].map((v) => `<button type="button" data-set="${v}" class="${!isNa && leaf && leaf.v === v ? 'is-active' : ''}">${v}</button>`).join('');
      editor = `
        <div class="progress-editor ${ui.levelClass(isNa ? null : value)}" data-editor>
          <div class="progress-top">
            <span class="who inst-${esc(member.instrument)}">${ui.avatar(member)} ${esc(member.name)}</span>
            <span class="big${isNa ? ' is-na' : ''}" data-big>${isNa ? 'N/A' : `${value}<small>%</small>`}</span>
          </div>
          <input class="slider" type="range" min="0" max="100" step="5" value="${isNa ? 0 : value}" style="--pct:${isNa ? 0 : value}%"
            aria-label="Quanto ${esc(member.name)} já tirou" data-slider>
          <div class="progress-quick">
            ${quick}
            <button type="button" class="na${explicitNa ? ' is-active' : ''}" data-set="na" title="Não toco nessa música">N/A</button>
            <button type="button" data-set="clear" title="Limpar (volta ao padrão)" aria-label="Limpar">${RH.icons.svg('close')}</button>
          </div>
          <div class="progress-meta">
            <span>${isNa && !explicitNa ? `${esc(member.name)} fica fora da mediana: a música não tem ${esc((RH.PARTS.find((p) => p.key === (RH.MEMBER_INSTRUMENTS[member.instrument] || {}).part) || { name: 'essa parte' }).name.toLowerCase())}.` : ''}</span>
            <span>${leaf && leaf.t ? `Atualizado ${ui.formatWhen(leaf.t)}${leaf.by && s.state.members && s.state.members[leaf.by] ? ` por ${esc(s.state.members[leaf.by].name)}` : ''}` : 'Ainda sem registro'}</span>
          </div>
        </div>`;
    }

    const inSet = s.inSetlist(id);
    const body = `
      <section class="sheet-section">
        <div class="song-facts">
          <div class="fact">
            <span class="label">Afinação original</span>
            <div class="value">${ui.tuningBadge(t)} <span>${esc(tInfo.label)}</span></div>
            ${tuningNote ? `<div class="note">${esc(tuningNote)}</div>` : ''}
          </div>
          <div class="fact">
            <span class="label">Instrumentação</span>
            <div class="value">${ui.instruments(s, id, { inline: true })}</div>
            <div class="note">${esc(ui.insText(ins.counts))}${gapsText ? `<br>${esc(gapsText)}` : ''}</div>
          </div>
          <div class="fact">
            <span class="label">Mediana da banda</span>
            <div class="value">${ui.score(median)}</div>
          </div>
        </div>
        ${note ? `<p class="dim" style="font-family:var(--font-body);font-size:14px;margin:10px 0 0">${esc(note)}</p>` : ''}
      </section>
      <section class="sheet-section">
        <h3>Corrigir dados <button type="button" class="link-btn" data-toggle-edit>${current.editing ? 'Fechar' : 'Editar afinação/instrumentação'}</button></h3>
        ${current.editing ? renderEditForm(id) : ''}
      </section>
      <section class="sheet-section">
        <h3>${RH.icons.svg('users')} Quanto cada um já tirou</h3>
        <div class="member-picker">${pickerChips}</div>
        ${editor}
      </section>
      <section class="sheet-section">
        <h3>${RH.icons.svg('music')} Aparece em</h3>
        <div class="games-chips">${games}</div>
      </section>
      <div class="sheet-footer">
        <button type="button" class="btn ${inSet ? 'btn-ghost' : 'btn-fire'}" data-toggle-setlist>
          ${RH.icons.svg(inSet ? 'close' : 'plus')} ${inSet ? 'Tirar do set list' : 'Adicionar ao set list'}
        </button>
      </div>`;

    const scrollTop = current.sheet.body.scrollTop;
    current.sheet.setTitle(song.t, `${song.a} · ${song.y}`);
    current.sheet.body.innerHTML = body;
    current.sheet.body.scrollTop = scrollTop;
    current.pendingRender = false;
  };

  const setProgress = (value) => {
    const s = store();
    const { id, memberId } = current;
    const before = s.progress(id, memberId);
    if (value === 'clear') s.setProgress(id, memberId, null);
    else s.setProgress(id, memberId, value);
    const was = before && typeof before.v === 'number' ? before.v : 0;
    if (value === 100 && was < 100) {
      const m = s.state.members[memberId];
      ui.toast(`<strong>YOU ROCK!</strong> ${esc(m ? m.name : '')} tirou ${esc(RH.SONGS[id].t)} 100%`, { kind: 'rock', html: true, timeout: 3200 });
    }
  };

  const onClick = (e) => {
    const s = store();
    const target = e.target;
    const memberBtn = target.closest('[data-member]');
    if (memberBtn) {
      current.memberId = memberBtn.dataset.member;
      return render();
    }
    const setBtn = target.closest('[data-set]');
    if (setBtn) {
      const raw = setBtn.dataset.set;
      return setProgress(raw === 'na' || raw === 'clear' ? raw : Number(raw));
    }
    if (target.closest('[data-toggle-setlist]')) {
      if (s.inSetlist(current.id)) {
        s.removeFromSetlist(current.id);
        ui.toast('Saiu do set list');
      } else {
        s.addToSetlist(current.id);
        ui.toast('Entrou no set list!', { kind: 'ok' });
      }
      return;
    }
    if (target.closest('[data-toggle-edit]') || target.closest('[data-cancel-edit]')) {
      current.editing = !current.editing;
      return render();
    }
    if (target.closest('[data-reset-edit]')) {
      s.setOverride(current.id, 'tun', undefined);
      s.setOverride(current.id, 'ins', undefined);
      current.editing = false;
      ui.toast('Dados originais restaurados');
      return render();
    }
    const step = target.closest('[data-step]');
    if (step) {
      const box = step.closest('.stepper');
      const part = RH.PARTS.find((p) => p.key === box.dataset.part);
      const b = box.querySelector('b');
      b.textContent = String(RH.util.clamp(Number(b.textContent) + Number(step.dataset.step), 0, part.max));
    }
  };

  const onSubmit = (e) => {
    const form = e.target.closest('[data-edit-form]');
    if (!form) return;
    e.preventDefault();
    const s = store();
    const choice = form.tuning.value;
    let tuningVal = choice;
    if (choice === '__other') {
      const text = form.other.value.trim();
      tuningVal = text ? `other:${text}` : '';
    }
    const counts = {};
    form.querySelectorAll('.stepper').forEach((box) => { counts[box.dataset.part] = Number(box.querySelector('b').textContent); });
    const insVal = RH.formatIns(counts);
    const t = s.tuning(current.id);
    const ins = s.instrumentation(current.id);
    if ((tuningVal || null) !== (t.code || null) || (t.overridden === false && !t.confirmed && tuningVal)) s.setOverride(current.id, 'tun', tuningVal);
    if (insVal !== (ins.str || '')) s.setOverride(current.id, 'ins', insVal);
    current.editing = false;
    ui.toast('Correção salva para a banda', { kind: 'ok' });
    render();
  };

  const onChange = (e) => {
    if (e.target.name === 'tuning') {
      const other = e.target.form.querySelector('[data-other]');
      other.hidden = e.target.value !== '__other';
      if (!other.hidden) other.querySelector('input').focus();
    }
    if (e.target.matches('[data-slider]')) {
      setProgress(Number(e.target.value));
    }
  };

  const onInput = (e) => {
    if (!e.target.matches('[data-slider]')) return;
    const v = Number(e.target.value);
    e.target.style.setProperty('--pct', `${v}%`);
    const editorEl = e.target.closest('[data-editor]');
    editorEl.className = `progress-editor ${ui.levelClass(v)}`;
    const big = editorEl.querySelector('[data-big]');
    big.classList.remove('is-na');
    big.innerHTML = `${v}<small>%</small>`;
  };

  const open = (id, { memberId } = {}) => {
    if (!RH.SONGS[id]) return;
    if (current) current.sheet.close();
    const s = store();
    const sheet = ui.sheet({ className: 'song-sheet', onClose: () => { current = null; } });
    current = { id, sheet, memberId: memberId || s.me() || (s.members()[0] && s.members()[0].id), editing: false, dragging: false, pendingRender: false };
    const bodyEl = sheet.body;
    // Eventos de um painel que já está fechando são ignorados.
    const guard = (fn) => (e) => { if (current && current.sheet.body === bodyEl) fn(e); };
    bodyEl.addEventListener('click', guard(onClick));
    bodyEl.addEventListener('submit', guard(onSubmit));
    bodyEl.addEventListener('change', guard(onChange));
    bodyEl.addEventListener('input', guard(onInput));
    bodyEl.addEventListener('pointerdown', guard((e) => { if (e.target.matches('[data-slider]')) current.dragging = true; }));
    const release = () => {
      if (!current || !current.dragging) return;
      current.dragging = false;
      if (current.pendingRender) render();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    const origClose = sheet.close;
    sheet.close = () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      origClose();
    };
    render();
  };

  const refresh = (changes) => {
    if (!current) return;
    if (!(changes.members || changes.setlist || changes.songs.has(current.id))) return;
    const active = document.activeElement;
    const typing = active && current.sheet.el.contains(active) && active.matches('input:not([type=range]), select');
    if (current.dragging || typing) {
      current.pendingRender = true;
      return;
    }
    render();
  };

  return { open, refresh, isOpen: () => !!current };
})();
