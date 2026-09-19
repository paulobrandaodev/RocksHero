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

  // Progresso de cada membro dia a dia (para o gráfico de evolução da música).
  const songTimeline = (id) => {
    const s = store();
    const U = RH.util;
    const perMember = s.members().map((m) => ({ m, points: s.progressHistory(id, m.id) })).filter((x) => x.points.length);
    const allDays = perMember.flatMap((x) => x.points.map((p) => p.day));
    if (new Set(allDays).size < 2) return null;
    const today = U.dayKey(s.now());
    const yearAgo = U.dayKey(s.now() - 365 * 86400000);
    const first = allDays.sort()[0];
    const days = U.dayRange(first < yearAgo ? yearAgo : first, today);
    const series = perMember.map(({ m, points }) => {
      let k = 0;
      let v = 0;
      const values = days.map((day) => {
        for (; k < points.length && points[k].day <= day; k++) v = typeof points[k].v === 'number' ? points[k].v : 0;
        return v;
      });
      return { id: m.id, name: m.name, instrument: m.instrument, values };
    });
    return { days, series };
  };

  const historyHtml = (id) => {
    const s = store();
    const U = RH.util;
    const plays = s.songPlays(id);
    const reh = s.songRehearsals(id);
    const lines = [];
    lines.push(plays.count
      ? `Tocada em <b>${plays.count}</b> show${plays.count > 1 ? 's' : ''}. Último: ${RH.ui.esc(plays.last.name || 'sem nome')}${plays.last.date ? ` (${U.formatDay(plays.last.date)})` : ''}.`
      : 'Ainda não entrou em nenhum show realizado.');
    lines.push(reh.length
      ? `Passada em <b>${reh.length}</b> ensaio${reh.length > 1 ? 's' : ''}. Último: ${U.formatDay(reh[0].date)}.`
      : 'Nenhum ensaio registrado com ela.');
    return `<p class="song-history">${lines.join('<br>')}</p>`;
  };

  const renderEditForm = (id) => {
    const s = store();
    const t = s.tuning(id);
    const ins = s.instrumentation(id);
    const dur = s.duration(id);
    const bpm = s.bpm(id);
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
        <div class="edit-pair">
          <label class="field">
            <span>Duração (m:ss)</span>
            <input class="input" name="dur" value="${esc(dur.sec ? RH.util.formatDuration(dur.sec) : '')}" placeholder="ex.: 3:45" autocomplete="off">
          </label>
          <label class="field">
            <span>BPM</span>
            <input class="input" name="bpm" type="number" inputmode="numeric" min="20" max="300" value="${bpm.val || ''}" placeholder="ex.: 120">
          </label>
        </div>
        <div class="edit-actions">
          <button type="submit" class="btn btn-fire">${RH.icons.svg('check')} Salvar</button>
          <button type="button" class="btn btn-ghost" data-cancel-edit>Cancelar</button>
          ${t.overridden || ins.overridden || dur.overridden || bpm.overridden ? '<button type="button" class="btn btn-ghost" data-reset-edit>Restaurar original</button>' : ''}
        </div>
      </form>`;
  };

  const noteFieldHtml = (member) => {
    const s = store();
    const n = s.memberNote(current.id, member.id);
    const by = n && n.by && n.by !== member.id && s.state.members && s.state.members[n.by] ? ` por ${s.state.members[n.by].name}` : '';
    const meta = n ? `Salvo ${ui.formatWhen(n.t)}${by}` : 'Salva sozinha enquanto você digita';
    return `
      <label class="member-note">
        <span class="mn-label">${RH.icons.svg('note')} Observações de ${esc(member.name)}</span>
        <textarea class="input" data-note rows="3" maxlength="${s.NOTE_MAX}"
          placeholder="Ex.: capotraste na 2ª casa, timbre com chorus, entra depois da virada da bateria…">${esc(n ? n.v : '')}</textarea>
        <span class="mn-meta"><span data-note-status>${esc(meta)}</span><span data-note-count>${n ? n.v.length : 0}/${s.NOTE_MAX}</span></span>
      </label>`;
  };

  // Observação em edição: grava com atraso curto e sempre antes de trocar de membro ou fechar.
  let pendingNote = null;
  const saveNote = RH.util.debounce(() => {
    if (!pendingNote) return;
    const { id, memberId, text } = pendingNote;
    pendingNote = null;
    store().setNote(id, memberId, text);
    const status = current && current.id === id && current.memberId === memberId && current.sheet.body.querySelector('[data-note-status]');
    if (status) status.textContent = text.trim() ? 'Salvo agora' : 'Observação apagada';
  }, 700);
  const flushNote = () => { if (pendingNote) saveNote.flush(); };

  const render = () => {
    if (!current) return;
    flushNote();
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
      ? `Afinação corrigida pela banda${t.t ? ` ${ui.formatWhen(t.t)}` : ''}.`
      : tInfo.unknown ? 'Afinação desconhecida: se souber, corrija.'
        : !t.confirmed ? 'Afinação a confirmar antes do ensaio.' : '';

    const gapsText = gaps.length
      ? `Sem membro para: ${gaps.map((g) => `${g.missing > 1 ? `${g.missing} × ` : ''}${RH.PARTS.find((p) => p.key === g.key).name.toLowerCase()}`).join(', ')}.`
      : ins.counts ? 'A formação cobre todas as partes.' : '';

    const games = appearances.map(({ game, entry, tier }) => `
      <a class="game-chip" href="#/musicas/${game.id}" data-close title="${esc(`${game.name} · ${tier.name}`)}">
        ${ui.emblem(game)}${esc(game.short)} ${entryBadges(entry)}
      </a>`).join('');

    const pickerChips = members.map((m) => {
      const leaf = s.progress(id, m.id);
      const isNa = !applicable.has(m.id);
      const pct = leaf && typeof leaf.v === 'number' ? leaf.v : 0;
      const level = isNa || pct === 0 ? 'lv-none' : ui.levelClass(pct);
      const hasNote = !!s.memberNote(id, m.id);
      const label = `${m.name}: ${isNa ? 'fora desta música' : `${pct}%`}${hasNote ? ', tem observação' : ''}`;
      return `<button type="button" class="member-chip inst-${esc(m.instrument)} ${level}${isNa ? ' is-na' : ''}" aria-pressed="${m.id === current.memberId}" data-member="${esc(m.id)}" title="${esc(label)}" aria-label="${esc(label)}">
        ${ui.avatar(m)}
        <span class="mc-body">
          <span class="mc-name">${esc(m.name)}</span>
          <span class="mc-meter">
            <span class="mc-track" aria-hidden="true"><i style="--pct:${isNa ? 0 : pct}%"></i></span>
            <span class="mc-val">${isNa ? 'N/A' : `${pct}<small>%</small>`}</span>
          </span>
        </span>
        ${hasNote ? `<span class="mc-note" aria-hidden="true">${RH.icons.svg('note')}</span>` : ''}
      </button>`;
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
          ${noteFieldHtml(member)}
        </div>`;
    }

    const others = s.songNotes(id).filter((x) => x.member.id !== current.memberId);
    const othersHtml = others.length ? `
        <div class="band-notes">
          <span class="bn-title">Observações da banda</span>
          ${others.map(({ member: m, note: n }) => `
            <button type="button" class="bn-item inst-${esc(m.instrument)}" data-member="${esc(m.id)}" title="Ver ${esc(m.name)}">
              ${ui.avatar(m)}
              <span class="bn-text"><b>${esc(m.name)}</b><span>${esc(n.v)}</span></span>
            </button>`).join('')}
        </div>` : '';

    const inSet = s.inSetlist(id);
    const dur = s.duration(id);
    const bpm = s.bpm(id);
    const me = s.me();
    const wanters = s.wanters(id);
    const iWant = s.wants(id, me);
    const timeline = songTimeline(id);
    const tempoNote = dur.overridden || bpm.overridden ? 'Duração/BPM corrigidos pela banda.' : bpm.val && !bpm.confirmed ? 'BPM a confirmar.' : '';
    const listName = s.setlist().name || 'set list';
    const body = `
      <section class="sheet-section">
        <div class="song-facts">
          <div class="fact fact-tuning">
            <span class="label">Afinação e andamento</span>
            <div class="value">${ui.tuningBadge(t)} <span>${esc(tInfo.label)}</span></div>
            <div class="value fact-tempo">${dur.sec ? `<span class="dur">${esc(ui.durText(dur))}</span>` : '<span class="faint">duração ?</span>'}${ui.bpmBadge(bpm) || '<span class="faint">sem BPM</span>'}</div>
            ${tuningNote || tempoNote ? `<div class="note">${esc([tuningNote, tempoNote].filter(Boolean).join(' '))}</div>` : ''}
          </div>
          <div class="fact fact-ins">
            <span class="label">Instrumentação</span>
            <div class="value">${ui.instruments(s, id, { inline: true })}</div>
            <div class="note">${esc(ui.insText(ins.counts))}${gapsText ? `<br>${esc(gapsText)}` : ''}</div>
          </div>
          <div class="fact fact-median">
            <span class="label">Mediana</span>
            ${ui.score(median)}
          </div>
        </div>
        ${note ? `<p class="song-note">${esc(note)}</p>` : ''}
        <div class="sheet-tools">
          ${ui.listenLinks(id, { labels: true })}
          <button type="button" class="btn btn-sm btn-edit${current.editing ? ' is-open' : ''}" data-toggle-edit aria-expanded="${current.editing}">
            ${RH.icons.svg(current.editing ? 'close' : 'edit')}${current.editing ? 'Fechar' : 'Editar <span class="hide-narrow">afinação e instrumentação</span>'}
          </button>
        </div>
        ${current.editing ? renderEditForm(id) : ''}
      </section>
      <section class="sheet-section">
        <h3>${RH.icons.svg('metronome')} Para ensaiar</h3>
        <div class="practice-actions">
          <button type="button" class="btn" data-lyrics>${RH.icons.svg('lyrics')} Letra</button>
          <button type="button" class="btn want-btn" data-want aria-pressed="${iWant}" title="${me ? '' : 'Escolha quem é você para marcar'}">${RH.icons.svg('heart')} ${iWant ? 'Quero tocar!' : 'Quero tocar'}</button>
        </div>
        ${wanters.length ? `<p class="want-list">${RH.icons.svg('heart')} Querem tocar: ${wanters.map((m) => `<span class="inst-${esc(m.instrument)}">${ui.avatar(m)}${esc(m.name)}</span>`).join('')}</p>` : ''}
        <div data-metro-slot></div>
      </section>
      <section class="sheet-section">
        <h3>${RH.icons.svg('users')} Quanto cada um já tirou</h3>
        <div class="member-picker">${pickerChips}</div>
        ${editor}
        ${othersHtml}
      </section>
      <section class="sheet-section">
        <h3>${RH.icons.svg('chart')} Evolução</h3>
        ${timeline ? '<div data-chart></div>' : '<p class="dim small">O gráfico aparece quando o progresso for registrado em dias diferentes.</p>'}
        ${historyHtml(id)}
      </section>
      <section class="sheet-section">
        <h3>${RH.icons.svg('music')} Aparece em</h3>
        <div class="games-chips">${games}</div>
      </section>
      <div class="sheet-footer">
        <button type="button" class="btn ${inSet ? 'btn-ghost' : 'btn-fire'}" data-toggle-setlist>
          ${RH.icons.svg(inSet ? 'close' : 'plus')} ${inSet ? 'Tirar de' : 'Adicionar a'} “${esc(listName)}”
        </button>
      </div>`;

    const scrollTop = current.sheet.body.scrollTop;
    current.sheet.setTitle(song.t, `${song.a} · ${song.y}`);
    if (current.chart) current.chart.destroy();
    current.chart = null;
    current.sheet.body.innerHTML = body;
    // O metrônomo é o mesmo nó entre renderizações (continua tocando).
    if (!current.metroEl) {
      current.metroEl = document.createElement('div');
      current.metro = RH.metronome.mount(current.metroEl, { bpm: bpm.val });
      current.metroBpm = bpm.val;
    } else if (current.metroBpm !== bpm.val && !current.metro.isRunning()) {
      current.metro.setTempo(bpm.val || 120);
      current.metroBpm = bpm.val;
    }
    current.sheet.body.querySelector('[data-metro-slot]').replaceWith(current.metroEl);
    const chartEl = current.sheet.body.querySelector('[data-chart]');
    if (chartEl && timeline) current.chart = RH.chart.timeline(chartEl, timeline, { percent: true, height: 180, label: `Evolução de ${song.t} por membro` });
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
    if (target.closest('[data-lyrics]')) return RH.lyrics.openSheet(current.id);
    if (target.closest('[data-want]')) {
      const me = s.me();
      if (!me) {
        ui.toast('Escolha quem é você para marcar');
        return RH.app.openWhoAmI();
      }
      const on = !s.wants(current.id, me);
      s.setWant(current.id, me, on);
      if (on) ui.toast('Anotado: você quer tocar essa!', { kind: 'rock' });
      return;
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
      for (const field of ['tun', 'ins', 'dur', 'bpm']) {
        if (s.state.overrides && s.state.overrides[current.id] && s.state.overrides[current.id][field]) s.setOverride(current.id, field, undefined);
      }
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
    const durVal = RH.util.parseDuration(form.dur.value);
    const bpmVal = form.bpm.value.trim() ? Math.round(Number(form.bpm.value)) : null;
    if (Number.isNaN(durVal) || (durVal != null && (durVal < 1 || durVal > 3600))) {
      ui.toast('Duração no formato m:ss, ex.: 3:45', { kind: 'error' });
      return form.dur.focus();
    }
    if (bpmVal != null && !(bpmVal >= 20 && bpmVal <= 300)) {
      ui.toast('BPM entre 20 e 300', { kind: 'error' });
      return form.bpm.focus();
    }
    const t = s.tuning(current.id);
    const ins = s.instrumentation(current.id);
    // Duração/BPM: igual ao original tira a correção; vazio também.
    const numeric = (field, info, val, cur) => {
      if (val === cur) return;
      if (val == null || val === info.base) { if (info.overridden) s.setOverride(current.id, field, undefined); return; }
      s.setOverride(current.id, field, val);
    };
    const dur = s.duration(current.id);
    const bpm = s.bpm(current.id);
    numeric('dur', dur, durVal, dur.sec);
    numeric('bpm', bpm, bpmVal, bpm.val);
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
    if (e.target.matches('[data-note]')) {
      pendingNote = { id: current.id, memberId: current.memberId, text: e.target.value };
      const box = e.target.closest('.member-note');
      box.querySelector('[data-note-status]').textContent = 'Salvando…';
      box.querySelector('[data-note-count]').textContent = `${e.target.value.length}/${store().NOTE_MAX}`;
      saveNote();
      return;
    }
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
    const sheet = ui.sheet({ className: 'song-sheet', onClose: () => {
      if (current && current.metro) current.metro.stop();
      if (current && current.chart) current.chart.destroy();
      current = null;
    } });
    current = { id, sheet, memberId: memberId || s.me() || (s.members()[0] && s.members()[0].id), editing: false, dragging: false, pendingRender: false };
    const bodyEl = sheet.body;
    // Eventos de um painel que já está fechando são ignorados.
    const guard = (fn) => (e) => { if (current && current.sheet.body === bodyEl) fn(e); };
    bodyEl.addEventListener('click', guard(onClick));
    bodyEl.addEventListener('submit', guard(onSubmit));
    bodyEl.addEventListener('change', guard(onChange));
    bodyEl.addEventListener('input', guard(onInput));
    bodyEl.addEventListener('focusout', guard((e) => {
      if (!e.target.matches('[data-note]')) return;
      flushNote();
      // Aplica o que chegou de outros aparelhos enquanto digitava (se o foco não foi para outro campo).
      setTimeout(() => {
        if (!current || !current.pendingRender || current.dragging) return;
        const active = document.activeElement;
        if (active && current.sheet.el.contains(active) && active.matches('input:not([type=range]), select, textarea')) return;
        render();
      }, 0);
    }));
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
      flushNote();
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      origClose();
    };
    render();
  };

  const refresh = (changes) => {
    if (!current) return;
    if (!(changes.members || changes.setlist || changes.rehearsals || changes.songs.has(current.id))) return;
    const active = document.activeElement;
    const typing = active && current.sheet.el.contains(active) && active.matches('input:not([type=range]), select, textarea');
    if (current.dragging || typing) {
      current.pendingRender = true;
      return;
    }
    render();
  };

  return { open, refresh, isOpen: () => !!current };
})();
