/* Inicialização, rotas e cabeçalho. */
window.RH = window.RH || {};

RH.app = (() => {
  const ui = RH.ui;
  const esc = ui.esc;
  const LAST_ROUTE_KEY = 'rh:v1:ui:route';

  let store = null;
  let appShown = false;
  let current = { name: null, view: null, params: null };
  let askedWhoAmI = false;
  let loginVisible = false;
  let els = {};

  const ROUTES = {
    musicas: { view: () => RH.views.catalog, nav: 'musicas' },
    setlist: { view: () => RH.views.setlist, nav: 'setlist' },
    ensaios: { view: () => RH.views.rehearsals, nav: 'ensaios' },
    banda: { view: () => RH.views.band, nav: 'banda' },
  };

  const parseHash = () => {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const name = ROUTES[parts[0]] ? parts[0] : null;
    return { name, params: name === 'musicas' ? { game: parts[1] || 'gh1' } : {} };
  };

  // ---------- cabeçalho ----------

  const renderShell = () => {
    const app = document.createElement('div');
    app.id = 'app';
    app.hidden = true;
    app.innerHTML = `
      <header class="app-header">
        <div class="header-inner">
          <a class="brand" href="#/musicas" aria-label="Rocks Hero: início"><img src="assets/logo/rocks-hero.svg" alt="Rocks Hero" width="94" height="60"></a>
          <nav class="main-nav" aria-label="Principal">
            <a href="#/musicas" data-nav="musicas">${RH.icons.svg('music')}<span>Músicas</span></a>
            <a href="#/setlist" data-nav="setlist">${RH.icons.svg('list')}<span>Set List</span><span class="count" data-setlist-count hidden></span></a>
            <a href="#/ensaios" data-nav="ensaios">${RH.icons.svg('calendar')}<span>Ensaios</span></a>
            <a href="#/banda" data-nav="banda">${RH.icons.svg('users')}<span>Banda</span></a>
          </nav>
          <div class="header-actions">
            <button type="button" class="sync-status" data-sync title="Status da sincronização"><span class="dot"></span><span class="label"></span></button>
            <button type="button" class="chip me-chip" data-me-chip></button>
            <button type="button" class="btn btn-icon btn-sm btn-ghost btn-logout" data-logout aria-label="Sair" title="Sair">${RH.icons.svg('logout')}</button>
          </div>
        </div>
      </header>
      <main class="app-main" id="main" tabindex="-1"></main>
      <nav class="bottom-nav" aria-label="Principal">
        <a href="#/musicas" data-nav="musicas">${RH.icons.svg('music')}<span>Músicas</span></a>
        <a href="#/setlist" data-nav="setlist">${RH.icons.svg('list')}<span>Set List</span><span class="count" data-setlist-count hidden></span></a>
        <a href="#/ensaios" data-nav="ensaios">${RH.icons.svg('calendar')}<span>Ensaios</span></a>
        <a href="#/banda" data-nav="banda">${RH.icons.svg('users')}<span>Banda</span></a>
      </nav>`;
    document.body.appendChild(app);
    els = {
      app,
      main: app.querySelector('#main'),
      sync: app.querySelector('[data-sync]'),
      meChip: app.querySelector('[data-me-chip]'),
    };
    app.querySelector('[data-logout]').addEventListener('click', logout);
    els.meChip.addEventListener('click', () => openWhoAmI());
    els.sync.addEventListener('click', explainStatus);
    // "Músicas" volta para a última aba de jogo usada
    app.querySelectorAll('[data-nav="musicas"]').forEach((a) => a.addEventListener('click', (e) => {
      const last = RH.safeStorage.getRaw(LAST_ROUTE_KEY);
      if (last && last.startsWith('#/musicas/')) { e.preventDefault(); location.hash = last; }
    }));
  };

  const refreshHeader = () => {
    if (!els.app) return;
    const count = store.setlist().items.length;
    els.app.querySelectorAll('[data-setlist-count]').forEach((c) => {
      c.textContent = String(count);
      c.hidden = count === 0;
    });
    const meId = store.me();
    const me = meId && store.state.members[meId];
    els.meChip.className = `chip me-chip${me ? ` inst-${me.instrument}` : ''}`;
    els.meChip.innerHTML = me
      ? `${ui.avatar({ ...me, id: meId })}<span class="name">${esc(me.name)}</span>`
      : `<span class="avatar" style="--avatar:#6b6478">${RH.icons.svg('users')}</span><span class="name">Quem é você?</span>`;
    els.meChip.title = me ? 'Trocar quem está usando este aparelho' : 'Escolher quem está usando este aparelho';
  };

  const renderSyncStatus = (s) => {
    if (!els.sync) return;
    let state = 'ok';
    let label = 'Sincronizado';
    if (s.mode === 'local') { state = 'local'; label = 'Modo local'; }
    else if (s.error) { state = 'error'; label = s.error.code === 'read-denied' || s.error.code === 'write-denied' ? 'Sem permissão' : 'Erro'; }
    else if (!s.authenticated || !s.synced) { state = 'connecting'; label = 'Conectando…'; }
    else if (!s.connected) { state = 'pending'; label = s.pending ? `Offline · ${s.pending} pendente${s.pending > 1 ? 's' : ''}` : 'Offline'; }
    else if (s.pending) { state = 'pending'; label = `Enviando ${s.pending}…`; }
    els.sync.dataset.state = state;
    els.sync.querySelector('.label').textContent = label;
    els.sync.setAttribute('aria-label', `Sincronização: ${label}`);
  };

  const explainStatus = () => {
    const s = store.status;
    const lines = [];
    if (s.mode === 'local') {
      lines.push('Os dados estão salvos só neste navegador. Para a banda inteira compartilhar o progresso, configure o Firebase seguindo o README.');
    } else if (s.error) {
      lines.push(s.error.code === 'read-denied' || s.error.code === 'write-denied'
        ? 'O Firebase recusou o acesso. Confira se o UID da conta da banda está correto em database.rules.json e se as regras foram publicadas.'
        : `Erro: ${s.error.detail || s.error.code}`);
    } else if (!s.connected) {
      lines.push('Sem conexão agora. Pode continuar editando: tudo fica guardado neste aparelho e é enviado quando a internet voltar.');
    } else {
      lines.push('Tudo certo: as mudanças aparecem na hora para a banda toda.');
    }
    if (s.pending) lines.push(`${s.pending} alteração(ões) aguardando envio.`);
    ui.sheet({ title: 'Sincronização', body: `<p style="font-family:var(--font-body);line-height:1.55;margin:0">${lines.map(esc).join('<br><br>')}</p>` });
  };

  // ---------- quem é você ----------

  const openWhoAmI = () => {
    const members = store.members();
    if (!members.length) return ui.toast('Cadastre a banda primeiro');
    const me = store.me();
    const sheet = ui.sheet({
      title: 'Quem é você?',
      subtitle: 'Neste aparelho, o progresso que você mexer começa pelo seu nome.',
      body: `
        <div class="member-picker">
          ${members.map((m) => `<button type="button" class="chip inst-${esc(m.instrument)}" aria-pressed="${m.id === me}" data-pick="${esc(m.id)}">${ui.avatar(m)}<span>${esc(m.name)}</span><span class="val">${esc((RH.MEMBER_INSTRUMENTS[m.instrument] || {}).name || '')}</span></button>`).join('')}
        </div>
        <div class="sheet-footer"><button type="button" class="btn btn-ghost" data-pick="">Só estou olhando</button></div>`,
    });
    sheet.body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pick]');
      if (!btn) return;
      store.setMe(btn.dataset.pick || null);
      askedWhoAmI = true;
      RH.safeStorage.setRaw('rh:v1:ui:asked-me', '1');
      refreshHeader();
      if (current.view && current.view.update) current.view.update({ songs: new Set(), members: true, setlist: false, rehearsals: false, any: true });
      const m = btn.dataset.pick && store.state.members[btn.dataset.pick];
      ui.toast(m ? `Bora, ${m.name}!` : 'Modo espectador', { kind: m ? 'rock' : 'info' });
      sheet.close();
    });
  };

  const maybeAskWhoAmI = () => {
    if (askedWhoAmI || !appShown || store.me() || !store.members().length) return;
    if (RH.safeStorage.getRaw('rh:v1:ui:asked-me') === '1') { askedWhoAmI = true; return; }
    askedWhoAmI = true;
    setTimeout(openWhoAmI, 400);
  };

  // ---------- rotas ----------

  const route = () => {
    if (!appShown) return;
    const { name, params } = parseHash();
    if (!name) {
      const last = RH.safeStorage.getRaw(LAST_ROUTE_KEY);
      location.replace(last && /^#\/(musicas|setlist|ensaios|banda)/.test(last) ? last : '#/musicas/gh1');
      return;
    }
    if (name === 'musicas' && !location.hash.split('/')[2]) {
      const last = RH.safeStorage.getRaw(LAST_ROUTE_KEY);
      location.replace(last && last.startsWith('#/musicas/') ? last : '#/musicas/gh1');
      return;
    }
    RH.safeStorage.setRaw(LAST_ROUTE_KEY, location.hash);
    const def = ROUTES[name];
    const view = def.view();
    const sameView = current.name === name;
    if (current.view && current.view.unmount) current.view.unmount();
    els.main.innerHTML = '';
    current = { name, view, params };
    view.mount(els.main, params);
    els.app.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.dataset.nav === def.nav) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = `${view.title ? view.title() : 'Rocks Hero'} · Rocks Hero`;
    if (!sameView) window.scrollTo(0, 0);
    else if (name === 'musicas') {
      const tabs = els.main.querySelector('.game-tabs');
      if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start' });
    }
  };

  // ---------- telas de entrada ----------

  const showApp = () => {
    if (appShown) return;
    appShown = true;
    loginVisible = false;
    RH.login.hide();
    els.app.hidden = false;
    refreshHeader();
    route();
    maybeAskWhoAmI();
  };

  const showLogin = (opts) => {
    appShown = false;
    loginVisible = true;
    if (current.view && current.view.unmount) current.view.unmount();
    current = { name: null, view: null, params: null };
    if (els.app) els.app.hidden = true;
    RH.login.show(opts);
  };

  const logout = async () => {
    const ok = await ui.confirm('Sair neste aparelho? Seus dados continuam salvos.', { title: 'Sair', okLabel: 'Sair' });
    if (!ok) return;
    await store.logout();
    RH.safeStorage.remove('rh:v1:ui:asked-me');
    askedWhoAmI = false;
    showLogin();
  };

  const showConfigError = (problems) => {
    const box = document.createElement('div');
    box.className = 'config-error panel panel-rivets';
    box.innerHTML = `
      <h1 class="fire-text">Configuração do Firebase incompleta</h1>
      <p>O arquivo <code>js/firebase-config.js</code> foi preenchido, mas estes campos estão faltando ou inválidos:</p>
      <ul>${problems.map((p) => `<li><strong>${esc(p)}</strong></li>`).join('')}</ul>
      <p>O <strong>databaseURL</strong> fica no Firebase console › Realtime Database (algo como <code>https://seu-projeto-default-rtdb.firebaseio.com</code>). Para usar sem Firebase, deixe todos os campos vazios.</p>`;
    document.body.appendChild(box);
  };

  // ---------- service worker ----------

  const registerServiceWorker = () => {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    if (RH.settings && RH.settings.emulator) return;
    if (['localhost', '127.0.0.1'].includes(location.hostname) && !new URLSearchParams(location.search).has('sw')) return;
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const offerUpdate = (worker) => {
        ui.toast('Nova versão do app disponível. <button type="button" class="link-btn" data-sw-update>Atualizar</button>', { html: true, timeout: 15000 });
        document.addEventListener('click', (e) => {
          if (e.target.closest('[data-sw-update]')) worker.postMessage('skip-waiting');
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
    }).catch(() => {});
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  };

  // ---------- boot ----------

  const onChange = (changes) => {
    if (!appShown) return;
    if (current.view && current.view.update) current.view.update(changes);
    RH.songSheet.refresh(changes);
    RH.stage.refresh(changes);
    if (changes.setlist || changes.members) refreshHeader();
    if (changes.members) maybeAskWhoAmI();
  };

  const onStatus = (s) => {
    renderSyncStatus(s);
    if (s.authKnown) {
      if (s.authenticated && !appShown) showApp();
      else if (!s.authenticated && appShown) showLogin({ reason: 'expired' });
      else if (!s.authenticated && !appShown && !loginVisible) showLogin();
    }
    if (s.synced) maybeAskWhoAmI();
    if (current.name === 'banda' && RH.views.band.render) {
      const active = document.activeElement;
      if (!(active && els.main.contains(active) && active.matches('input, select'))) RH.views.band.render();
    }
  };

  const boot = () => {
    RH.icons.install();
    RH.settings = RH.resolveSyncSettings();
    if (RH.settings.mode === 'invalid') {
      document.getElementById('boot').remove();
      return showConfigError(RH.settings.problems);
    }
    RH.catalog = RH.buildCatalog();
    const adapter = RH.settings.mode === 'firebase' ? RH.createFirebaseAdapter(RH.settings) : RH.createLocalAdapter();
    store = RH.store = RH.createStore(adapter);
    renderShell();
    window.addEventListener('hashchange', route);
    store.onChange(onChange);
    if (store.hadSession()) showApp();
    else showLogin();
    store.onStatus(onStatus);
    store.start();
    const boot = document.getElementById('boot');
    if (boot) boot.remove();
    registerServiceWorker();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { refreshHeader, logout, openWhoAmI };
})();
