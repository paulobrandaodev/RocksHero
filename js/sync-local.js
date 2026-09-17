/* Modo local: dados só neste navegador; senha conferida por hash.
   A trava é apenas visual: o código do site é público. A proteção real vem no modo Firebase. */
window.RH = window.RH || {};

RH.createLocalAdapter = () => {
  const scope = 'rh:v1:local';
  const DATA_KEY = `${scope}:data`;
  const SESSION_KEY = `${scope}:session`;
  // SHA-256 de "rockshero:" + senha.
  const PASSWORD_HASH = 'a5647462c595810fbd4769adc8de83882e37b739b0b89a9f4c2d05a8d505edac';

  const store = RH.safeStorage;
  let authListener = () => {};

  const readData = () => store.get(DATA_KEY) || {};
  const loggedIn = () => store.getRaw(SESSION_KEY) === PASSWORD_HASH;

  return {
    mode: 'local',
    scope,

    init: async () => {},

    onAuth(cb) {
      authListener = cb;
      cb(loggedIn() ? { uid: 'local' } : null);
      return () => { authListener = () => {}; };
    },

    async login(password) {
      if (RH.util.sha256(`rockshero:${password}`) !== PASSWORD_HASH) return { ok: false, error: 'wrong-password' };
      store.setRaw(SESSION_KEY, PASSWORD_HASH);
      authListener({ uid: 'local' });
      return { ok: true };
    },

    async logout() {
      store.remove(SESSION_KEY);
      authListener(null);
    },

    subscribe(onData) {
      onData(readData(), { fromServer: true });
      const onStorage = (e) => { if (e.key === DATA_KEY) onData(readData(), { fromServer: true }); };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },

    async write(updates) {
      const data = readData();
      for (const [path, value] of Object.entries(updates)) RH.util.setPath(data, path, RH.util.clone(value));
      if (!store.set(DATA_KEY, data)) throw Object.assign(new Error('Sem espaço no armazenamento do navegador'), { code: 'storage-full' });
    },

    onStatus(cb) {
      cb({ connected: true });
      return () => {};
    },

    serverTimeOffset: () => 0,
  };
};
