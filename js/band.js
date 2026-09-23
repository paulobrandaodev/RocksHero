/* Tela Banda: membros, quem está usando o aparelho, backup e informações. */
window.RH = window.RH || {};
RH.views = RH.views || {};

RH.views.band = (() => {
  const ui = RH.ui;
  const esc = ui.esc;
  let root = null;

  const store = () => RH.store;

  const memberStats = (memberId) => {
    const progress = store().state.progress || {};
    let ready = 0;
    let started = 0;
    for (const perMember of Object.values(progress)) {
      const leaf = perMember[memberId];
      if (!leaf || typeof leaf.v !== 'number') continue;
      if (leaf.v >= 80) ready++;
      else if (leaf.v > 0) started++;
    }
    return { ready, started };
  };

  const instrumentOptions = (value) => Object.entries(RH.MEMBER_INSTRUMENTS)
    .map(([key, info]) => `<option value="${key}"${key === value ? ' selected' : ''}>${esc(info.name)}</option>`).join('');

  const memberCard = (m, index, total, me) => {
    const stats = memberStats(m.id);
    return `
      <div class="member-card inst-${esc(m.instrument)}${m.id === me ? ' is-me' : ''}" data-member="${esc(m.id)}">
        <span class="avatar">${RH.icons.mask(ui.memberIcon(m))}</span>
        <div class="member-fields">
          <label><span class="visually-hidden">Nome</span><input class="input" data-field="name" value="${esc(m.name)}" maxlength="40" autocomplete="off"></label>
          <label><span class="visually-hidden">Instrumento</span><select class="select" data-field="instrument">${instrumentOptions(m.instrument)}</select></label>
        </div>
        <div class="member-bottom">
          <div class="member-stats">
            <span><strong>${stats.ready}</strong> prontas</span>
            <span><strong>${stats.started}</strong> em andamento</span>
            ${m.id === me ? '<span style="color:var(--gem-orange)">★ você neste aparelho</span>' : ''}
          </div>
          <div class="member-tools">
            <button type="button" class="btn btn-icon btn-sm" data-move="-1" aria-label="Subir ${esc(m.name)}"${index === 0 ? ' disabled' : ''}>${RH.icons.svg('up')}</button>
            <button type="button" class="btn btn-icon btn-sm" data-move="1" aria-label="Descer ${esc(m.name)}"${index === total - 1 ? ' disabled' : ''}>${RH.icons.svg('down')}</button>
            <button type="button" class="btn btn-icon btn-sm" data-archive aria-label="Tirar ${esc(m.name)} da banda">${RH.icons.svg('trash')}</button>
          </div>
        </div>
      </div>`;
  };

  const modeLabel = () => {
    const s = RH.settings || {};
    if (s.mode === 'local') return 'Local (só neste navegador)';
    if (s.emulator) return 'Firebase (emulador de teste)';
    return `Firebase · ${esc(s.config.projectId)}`;
  };

  const render = () => {
    if (!root) return;
    const s = store();
    const members = s.members();
    const archived = s.allMembers().filter((m) => m.archived);
    const me = s.me();
    const status = s.status;
    const own = s.customSongs().length;
    const active = document.activeElement;
    const focusKey = active && active.dataset && active.closest('[data-member]')
      ? `${active.closest('[data-member]').dataset.member}|${active.dataset.field || active.dataset.move || ''}` : null;

    root.innerHTML = `
      <div class="view-head">
        <h1 class="section-title chrome-text">A Banda</h1>
        <p>Quem toca o quê. As mudanças valem para todos os aparelhos.</p>
      </div>
      <div class="band-grid">
        <section class="band-card panel panel-rivets">
          <h2 class="fire-text">Formação</h2>
          <div class="archived-list" style="gap:10px">
            ${members.map((m, i) => memberCard(m, i, members.length, me)).join('') || '<p class="dim">Nenhum membro ainda.</p>'}
          </div>
          <form class="member-add" data-add>
            <div class="member-fields">
              <label><span class="visually-hidden">Nome do novo membro</span><input class="input" name="name" maxlength="40" placeholder="Novo membro" required autocomplete="off"></label>
              <label><span class="visually-hidden">Instrumento</span><select class="select" name="instrument">${instrumentOptions('guitarra')}</select></label>
            </div>
            <button type="submit" class="btn btn-fire">${RH.icons.svg('plus')} Adicionar</button>
          </form>
          ${archived.length ? `
            <details>
              <summary class="dim" style="cursor:pointer">Ex-membros (${archived.length})</summary>
              <div class="archived-list" style="margin-top:10px">
                ${archived.map((m) => `
                  <div class="member-card is-archived inst-${esc(m.instrument)}" data-member="${esc(m.id)}">
                    <span class="avatar">${RH.icons.mask(ui.memberIcon(m))}</span>
                    <div><strong>${esc(m.name)}</strong><div class="faint">${esc((RH.MEMBER_INSTRUMENTS[m.instrument] || {}).name || '')}</div></div>
                    <button type="button" class="btn btn-sm" data-restore>Voltar</button>
                  </div>`).join('')}
              </div>
            </details>` : ''}
        </section>

        <section class="band-card panel panel-rivets">
          <h2 class="fire-text">Quem é você?</h2>
          <p>Neste aparelho, o progresso que você mexer começa pelo seu nome.</p>
          <label class="field">
            <span>Eu sou</span>
            <select class="select" data-me>
              <option value="">Só estou olhando</option>
              ${members.map((m) => `<option value="${esc(m.id)}"${m.id === me ? ' selected' : ''}>${esc(m.name)} · ${esc((RH.MEMBER_INSTRUMENTS[m.instrument] || {}).name || '')}</option>`).join('')}
            </select>
          </label>

          <h2 class="fire-text" style="margin-top:12px">Backup</h2>
          <p>Baixe uma cópia de tudo (progresso e histórico, set lists, ensaios, observações, "quero tocar" e correções). Importar mescla com o que já existe, ficando sempre a edição mais recente.</p>
          <div class="summary-actions">
            <button type="button" class="btn" data-export>${RH.icons.svg('download')} Exportar</button>
            <label class="btn">${RH.icons.svg('upload')} Importar<input type="file" accept="application/json,.json" data-import hidden></label>
          </div>
        </section>

        <section class="band-card panel panel-rivets">
          <h2 class="fire-text">Sobre o app</h2>
          <dl class="info-list">
            <div><dt>Modo</dt><dd>${modeLabel()}</dd></div>
            <div><dt>Sincronização</dt><dd>${status.mode === 'local' ? 'desligada' : status.error ? 'com erro' : status.connected ? 'conectado' : 'offline'}${status.pending ? ` · ${status.pending} pendente(s)` : ''}</dd></div>
            <div><dt>Catálogo</dt><dd>${Object.keys(RH.SONGS).length} músicas · ${RH.GAMES.length} jogos${own ? ` · ${own} da banda` : ''}</dd></div>
            <div><dt>Versão</dt><dd>${esc(RH.VERSION)}</dd></div>
          </dl>
          ${RH.settings && RH.settings.mode === 'local' ? '<p>Para a banda toda ver o mesmo progresso, configure o Firebase (passo a passo no README).</p>' : ''}
          <button type="button" class="btn btn-ghost" data-logout>${RH.icons.svg('logout')} Sair</button>
        </section>
      </div>
      <p class="credits">
        Listas de músicas: Wikipedia (CC BY-SA 4.0). Fontes: Metal Mania e Oswald (SIL OFL), Permanent Marker (Apache 2.0).<br>
        Projeto de fãs da banda Rocks Hero, sem vínculo com a Activision ou com a franquia Guitar Hero.
      </p>`;

    if (focusKey) {
      const [id, key] = focusKey.split('|');
      const card = ui.$(`[data-member="${id}"]`, root);
      const el = card && (ui.$(`[data-field="${key}"]`, card) || ui.$(`[data-move="${key}"]`, card));
      if (el && !el.disabled) el.focus({ preventScroll: true });
    }
  };

  const onChange = (e) => {
    const s = store();
    const t = e.target;
    if (t.matches('[data-me]')) {
      s.setMe(t.value || null);
      RH.app.refreshHeader();
      ui.toast(t.value ? `Beleza, ${s.state.members[t.value].name}!` : 'Modo espectador');
      return render();
    }
    if (t.matches('[data-import]')) {
      const file = t.files && t.files[0];
      if (!file) return;
      file.text().then((text) => {
        const applied = s.importData(JSON.parse(text));
        ui.toast(applied ? `Backup importado: ${applied} registro(s) atualizados` : 'Nada novo nesse backup', { kind: 'ok' });
      }).catch((err) => ui.toast(err.message || 'Arquivo inválido', { kind: 'error' }));
      t.value = '';
      return;
    }
    const card = t.closest('[data-member]');
    if (card && t.dataset.field) {
      const value = t.value.trim();
      if (t.dataset.field === 'name' && !value) { t.value = s.state.members[card.dataset.member].name; return; }
      s.saveMember({ id: card.dataset.member, [t.dataset.field]: value });
    }
  };

  const onClick = async (e) => {
    const s = store();
    const t = e.target;
    const card = t.closest('[data-member]');
    if (t.closest('[data-move]') && card) return s.moveMember(card.dataset.member, Number(t.closest('[data-move]').dataset.move));
    if (t.closest('[data-archive]') && card) {
      const name = s.state.members[card.dataset.member].name;
      const ok = await ui.confirm(`Tirar ${name} da formação? O histórico fica guardado e dá para trazer de volta.`, { title: 'Tirar da banda', okLabel: 'Tirar', danger: true });
      if (ok) s.saveMember({ id: card.dataset.member, archived: true });
      return;
    }
    if (t.closest('[data-restore]') && card) return s.saveMember({ id: card.dataset.member, archived: false });
    if (t.closest('[data-export]')) {
      const stamp = new Date().toISOString().slice(0, 10);
      ui.download(`rocks-hero-backup-${stamp}.json`, JSON.stringify(s.exportData(), null, 2));
      return ui.toast('Backup baixado', { kind: 'ok' });
    }
    if (t.closest('[data-logout]')) return RH.app.logout();
  };

  const onSubmit = (e) => {
    const form = e.target.closest('[data-add]');
    if (!form) return;
    e.preventDefault();
    const name = form.name.value.trim();
    if (!name) return;
    store().saveMember({ name, instrument: form.instrument.value });
    ui.toast(`${name} entrou na banda!`, { kind: 'rock' });
    form.reset();
  };

  const mount = (container) => {
    root = document.createElement('div');
    root.className = 'view-band';
    container.appendChild(root);
    root.addEventListener('change', onChange);
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    render();
  };

  const update = (changes) => {
    if (!root) return;
    if (changes.members || changes.songs.size) {
      const active = document.activeElement;
      if (active && root.contains(active) && active.matches('input[data-field="name"]')) return;
      render();
    }
  };

  const unmount = () => { root = null; };

  return { mount, update, unmount, render, title: () => 'A Banda' };
})();
