// Carrega os scripts clássicos do app num contexto isolado do Node, com localStorage em memória.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

export const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

export const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

export function loadApp({ files = ['js/constants.js', 'js/util.js', 'js/store.js', 'js/sync-local.js'], storage, songs, meta } = {}) {
  const context = {
    console, TextEncoder, crypto: globalThis.crypto, setTimeout, clearTimeout, URLSearchParams,
    location: { hostname: 'localhost', search: '' },
    localStorage: storage || new MemoryStorage(),
    addEventListener() {}, removeEventListener() {},
  };
  context.window = context;
  vm.createContext(context);
  for (const file of files) {
    vm.runInContext(readFileSync(join(root, file), 'utf8'), context, { filename: file });
  }
  // Cópia por contexto: o app escreve em RH.SONGS (músicas cadastradas pela banda).
  if (songs) context.RH.SONGS = plain(songs);
  if (meta) context.RH.META = plain(meta);
  return context;
}

// "Servidor" em memória com clientes que podem ficar offline, como o Realtime Database.
export class FakeServer {
  constructor(RH) { this.RH = RH; this.tree = {}; this.clients = new Set(); }
  apply(updates) {
    for (const [path, value] of Object.entries(updates)) this.RH.util.setPath(this.tree, path, plain(value));
    for (const client of this.clients) if (client.online) client.push();
  }
}

export function fakeAdapter(server, { scope = 'rh:v1:test', online = true } = {}) {
  const adapter = {
    mode: 'firebase',
    scope,
    online,
    deny: false,
    queue: [],
    dataCb: null,
    init: async () => {},
    onAuth(cb) { cb({ uid: 'band' }); return () => {}; },
    login: async () => ({ ok: true }),
    logout: async () => {},
    subscribe(onData) {
      adapter.dataCb = onData;
      server.clients.add(adapter);
      if (adapter.online) adapter.push();
      return () => { server.clients.delete(adapter); adapter.dataCb = null; };
    },
    push() { if (adapter.dataCb) adapter.dataCb(plain(server.tree), { fromServer: true }); },
    write(updates) {
      return new Promise((resolve, reject) => {
        const job = () => {
          if (adapter.deny) return reject(Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' }));
          server.apply(updates);
          resolve();
        };
        if (adapter.online) job(); else adapter.queue.push(job);
      });
    },
    goOffline() { adapter.online = false; },
    goOnline() {
      adapter.online = true;
      const jobs = adapter.queue;
      adapter.queue = [];
      jobs.forEach((job) => job());
      adapter.push();
    },
    onStatus(cb) { cb({ connected: adapter.online }); return () => {}; },
    serverTimeOffset: () => 0,
  };
  return adapter;
}
