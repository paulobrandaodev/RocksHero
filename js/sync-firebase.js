/* Modo Firebase: login na conta única da banda + Realtime Database. */
window.RH = window.RH || {};

// Decide o modo a partir de js/firebase-config.js (e do parâmetro ?emulator=1 em localhost, para testes).
RH.resolveSyncSettings = () => {
  const cfg = RH.FIREBASE || {};
  const bandEmail = cfg.bandEmail || 'rockshero@example.com';
  const root = cfg.root || 'rockshero';
  const isLocalHost = ['localhost', '127.0.0.1'].includes(location.hostname);
  const params = new URLSearchParams(location.search);
  // ?local=1 (só na própria máquina) força o modo local mesmo com o Firebase configurado.
  if ((isLocalHost || location.protocol === 'file:') && params.get('local') === '1') return { mode: 'local' };
  if (isLocalHost && params.get('emulator') === '1') {
    return {
      mode: 'firebase',
      emulator: true,
      bandEmail,
      root,
      config: { apiKey: 'demo-key', projectId: 'demo-rockshero', databaseURL: 'https://demo-rockshero-default-rtdb.firebaseio.com', appId: 'demo' },
    };
  }
  const c = cfg.config || {};
  if (!Object.values(c).some((v) => v)) return { mode: 'local' };
  const problems = [];
  if (!c.apiKey) problems.push('apiKey');
  if (!c.projectId) problems.push('projectId');
  if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(firebaseio\.com|firebasedatabase\.app)\/?$/.test(c.databaseURL || '')) problems.push('databaseURL');
  if (problems.length) return { mode: 'invalid', problems };
  return { mode: 'firebase', emulator: false, bandEmail, root, config: c };
};

RH.createFirebaseAdapter = (settings) => {
  const { config, bandEmail, root, emulator } = settings;
  const scope = `rh:v1:fb:${config.projectId}`;
  let F = null;
  let auth = null;
  let db = null;
  let rootRef = null;
  let offset = 0;
  let connected = false;
  const statusListeners = new Set();
  const emitStatus = () => statusListeners.forEach((cb) => cb({ connected }));
  const ready = { promise: null };

  const loadSdk = () => new Promise((resolve, reject) => {
    if (window.RHFirebase) return resolve(window.RHFirebase);
    const script = document.createElement('script');
    script.src = `vendor/firebase-rh.js?v=${RH.VERSION}`;
    script.onload = () => (window.RHFirebase ? resolve(window.RHFirebase) : reject(new Error('SDK do Firebase não carregou')));
    script.onerror = () => reject(Object.assign(new Error('Não foi possível carregar o SDK do Firebase'), { code: 'sdk-load-failed' }));
    document.head.appendChild(script);
  });

  const init = () => {
    if (ready.promise) return ready.promise;
    ready.promise = (async () => {
      F = await loadSdk();
      const app = F.initializeApp(config);
      auth = F.initializeAuth(app, { persistence: [F.indexedDBLocalPersistence, F.browserLocalPersistence] });
      db = F.getDatabase(app, config.databaseURL);
      if (emulator) {
        F.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        F.connectDatabaseEmulator(db, '127.0.0.1', 9000);
      }
      rootRef = F.ref(db, root);
      F.onValue(F.ref(db, '.info/connected'), (snap) => { connected = snap.val() === true; emitStatus(); });
      F.onValue(F.ref(db, '.info/serverTimeOffset'), (snap) => { offset = snap.val() || 0; });

      // No iOS a conexão pode ficar "zumbi" depois de muito tempo em segundo plano: reconecta ao voltar.
      let hiddenAt = 0;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
        if (hiddenAt && Date.now() - hiddenAt > 30000) { F.goOffline(db); F.goOnline(db); }
        hiddenAt = 0;
      });
    })();
    return ready.promise;
  };

  return {
    mode: 'firebase',
    scope,
    emulator,

    init,

    onAuth(cb) {
      let unsub = () => {};
      let cancelled = false;
      init().then(() => {
        if (!cancelled) unsub = F.onAuthStateChanged(auth, (user) => cb(user ? { uid: user.uid } : null));
      }, (err) => cb(null, err));
      return () => { cancelled = true; unsub(); };
    },

    async login(password) {
      try {
        await init();
        await F.signInWithEmailAndPassword(auth, bandEmail, password);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.code || 'unknown', message: err.message };
      }
    },

    async logout() {
      await init();
      await F.signOut(auth);
    },

    subscribe(onData, onError) {
      return F.onValue(
        rootRef,
        (snap) => onData(snap.val() || {}, { fromServer: true }),
        (err) => onError && onError(err),
      );
    },

    write(updates) {
      return F.update(rootRef, updates);
    },

    onStatus(cb) {
      statusListeners.add(cb);
      cb({ connected });
      return () => statusListeners.delete(cb);
    },

    serverTimeOffset: () => offset,

    // Derruba/retoma a conexão com o banco (usado nos testes para simular falta de sinal).
    goOffline: () => init().then(() => F.goOffline(db)),
    goOnline: () => init().then(() => F.goOnline(db)),
  };
};
