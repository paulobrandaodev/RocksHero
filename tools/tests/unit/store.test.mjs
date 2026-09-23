import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, MemoryStorage, FakeServer, fakeAdapter, plain, tick } from './harness.mjs';

const SONGS = {
  'band--full': { t: 'Full', a: 'Band', y: 1990 },
  'band--instrumental': { t: 'Instrumental', a: 'Band', y: 1991 },
  'band--unknown': { t: 'Unknown', a: 'Band', y: 1992 },
  'band--keys': { t: 'Keys', a: 'Band', y: 1993 },
  'band--drop': { t: 'Drop', a: 'Band', y: 1994 },
};
const META = {
  'band--full': ['E', 1, 'vggbd'],
  'band--instrumental': ['Eb', 1, 'gbd'],
  'band--unknown': [null, 0, null],
  'band--keys': ['E', 1, 'vgbdk'],
  'band--drop': ['dropD', 0, 'vgbd'],
};

// Um "aparelho": contexto próprio, localStorage próprio e store ligado ao servidor falso.
function device(server, { storage = new MemoryStorage(), online = true, clock } = {}) {
  const ctx = loadApp({ storage, songs: SONGS, meta: META });
  const adapter = fakeAdapter(server, { online });
  const store = ctx.RH.createStore(adapter, { clock });
  return { ctx, adapter, store, storage };
}

function newServer() {
  const { RH } = loadApp({ files: ['js/util.js'] });
  return new FakeServer(RH);
}

async function started(server, opts) {
  const d = device(server, opts);
  d.store.start();
  await tick();
  await tick();
  return d;
}

test('primeiro acesso cria os 4 membros padrão uma única vez', async () => {
  const server = newServer();
  const a = await started(server);
  const b = await started(server);
  await tick();
  assert.deepEqual(Object.keys(server.tree.members).sort(), ['m-baixo', 'm-bateria', 'm-guitarra', 'm-vocal']);
  assert.equal(a.store.members().length, 4);
  assert.equal(b.store.members().length, 4);
  assert.deepEqual(plain(a.store.members().map((m) => m.name)), ['Vocal', 'Guitarra', 'Baixo', 'Bateria']);
});

test('mediana considera instrumentação, N/A e valores explícitos', async () => {
  const server = newServer();
  const { store } = await started(server);
  store.setProgress('band--full', 'm-vocal', 100);
  store.setProgress('band--full', 'm-guitarra', 50);
  store.setProgress('band--full', 'm-baixo', 30);
  // bateria sem valor conta 0 → [0, 30, 50, 100] → 40
  assert.equal(store.median('band--full'), 40);

  // música instrumental: vocal não entra → [guitarra 80, baixo 60, bateria 0] → 60
  store.setProgress('band--instrumental', 'm-guitarra', 80);
  store.setProgress('band--instrumental', 'm-baixo', 60);
  assert.equal(store.median('band--instrumental'), 60);
  assert.deepEqual(plain(store.applicableMembers('band--instrumental').map((m) => m.id)), ['m-guitarra', 'm-baixo', 'm-bateria']);

  // se o vocal lançar valor numa instrumental, passa a contar
  store.setProgress('band--instrumental', 'm-vocal', 100);
  assert.equal(store.median('band--instrumental'), 70);

  // N/A tira da conta
  store.setProgress('band--full', 'm-bateria', 'na');
  assert.equal(store.median('band--full'), 50);

  // instrumentação desconhecida: todos entram
  store.setProgress('band--unknown', 'm-vocal', 20);
  assert.equal(store.applicableMembers('band--unknown').length, 4);
  assert.equal(store.median('band--unknown'), 0);
});

test('membro arquivado sai da mediana e da formação', async () => {
  const server = newServer();
  const { store } = await started(server);
  store.setProgress('band--full', 'm-vocal', 100);
  store.setProgress('band--full', 'm-guitarra', 100);
  store.setProgress('band--full', 'm-baixo', 100);
  assert.equal(store.median('band--full'), 100);
  store.saveMember({ id: 'm-bateria', archived: true });
  assert.equal(store.members().length, 3);
  assert.equal(store.median('band--full'), 100);
  store.saveMember({ id: 'm-bateria', archived: false });
  assert.equal(store.members().length, 4);
  assert.equal(store.median('band--full'), 100);
});

test('partes descobertas comparam instrumentação com a formação', async () => {
  const server = newServer();
  const { store } = await started(server);
  assert.deepEqual(plain(store.uncovered('band--full')), [{ key: 'g', missing: 1, total: 2 }]);
  assert.deepEqual(plain(store.uncovered('band--keys')), [{ key: 'k', missing: 1, total: 1 }]);
  assert.deepEqual(plain(store.uncovered('band--unknown')), []);
  const id = store.saveMember({ name: 'Tecladista', instrument: 'teclado' });
  assert.deepEqual(plain(store.uncovered('band--keys')), []);
  assert.ok(id.startsWith('m-'));
});

test('override de afinação e instrumentação vale sobre o catálogo e pode ser desfeito', async () => {
  const server = newServer();
  const { store } = await started(server);
  assert.equal(store.tuning('band--drop').code, 'dropD');
  assert.equal(store.tuning('band--drop').confirmed, false);
  store.setOverride('band--drop', 'tun', 'D');
  assert.equal(store.tuning('band--drop').code, 'D');
  assert.equal(store.tuning('band--drop').confirmed, true);
  store.setOverride('band--drop', 'ins', 'vggbd');
  assert.equal(store.instrumentation('band--drop').counts.g, 2);
  store.setOverride('band--drop', 'tun', undefined);
  assert.equal(store.tuning('band--drop').code, 'dropD');
  store.setOverride('band--unknown', 'tun', null);
  assert.equal(store.tuning('band--unknown').code, null);
  assert.equal(store.tuning('band--unknown').overridden, true);
});

test('set list: adicionar, mover, remover e trocas de afinação', async () => {
  const server = newServer();
  const { store } = await started(server);
  store.addToSetlist('band--full');
  store.addToSetlist('band--drop');
  store.addToSetlist('band--instrumental');
  store.addToSetlist('band--full'); // repetida é ignorada
  assert.deepEqual(plain(store.setlist().items.map((i) => i.id)), ['band--full', 'band--drop', 'band--instrumental']);
  store.moveSetlistItem('band--instrumental', 0);
  assert.deepEqual(plain(store.setlist().items.map((i) => i.id)), ['band--instrumental', 'band--full', 'band--drop']);
  store.moveSetlistItem('band--instrumental', 1);
  assert.deepEqual(plain(store.setlist().items.map((i) => i.id)), ['band--full', 'band--instrumental', 'band--drop']);
  const changes = plain(store.tuningChanges(store.setlist().items));
  assert.deepEqual(changes, [{ index: 1, from: 'E', to: 'Eb' }, { index: 2, from: 'Eb', to: 'dropD' }]);
  store.removeFromSetlist('band--instrumental');
  assert.deepEqual(plain(store.setlist().items.map((i) => i.id)), ['band--full', 'band--drop']);
});

test('set list renormaliza quando as posições ficam coladas', async () => {
  const server = newServer();
  const { store } = await started(server);
  store.write({
    'setlists/main/items/band--full': { pos: 1, t: 1 },
    'setlists/main/items/band--drop': { pos: 1 + 1e-7, t: 1 },
    'setlists/main/items/band--keys': { pos: 3, t: 1 },
  });
  store.moveSetlistItem('band--keys', 1);
  const items = store.setlist().items;
  assert.deepEqual(plain(items.map((i) => i.id)), ['band--full', 'band--keys', 'band--drop']);
  assert.deepEqual(plain(items.map((i) => i.pos)), [1, 2, 3]);
});

test('resumo do set list: mediana geral, mais fraca e partes descobertas', async () => {
  const server = newServer();
  const { store } = await started(server);
  for (const m of ['m-vocal', 'm-guitarra', 'm-baixo', 'm-bateria']) {
    store.setProgress('band--full', m, 100);
    store.setProgress('band--keys', m, 20);
  }
  store.addToSetlist('band--full');
  store.addToSetlist('band--keys');
  store.addToSetlist('band--drop');
  const s = plain(store.setlistSummary());
  assert.equal(s.count, 3);
  assert.equal(s.overall, 20); // medianas [100, 20, 0] → 20
  assert.equal(s.weakest.id, 'band--drop');
  assert.equal(s.songsWithGaps, 2);
  assert.deepEqual(s.parts, { g: 1, k: 1 });
});

test('edição em um aparelho aparece no outro', async () => {
  const server = newServer();
  const a = await started(server);
  const b = await started(server);
  a.store.setProgress('band--full', 'm-guitarra', 65);
  await tick();
  await tick();
  assert.equal(b.store.progress('band--full', 'm-guitarra').v, 65);
  assert.equal(server.tree.progress['band--full']['m-guitarra'].v, 65);
});

test('edição offline sobrevive a recarregar a página e sincroniza ao voltar a conexão', async () => {
  const server = newServer();
  const storage = new MemoryStorage();
  const first = await started(server, { storage });
  first.adapter.goOffline();
  first.store.setProgress('band--full', 'm-baixo', 45);
  await tick();
  assert.equal(server.tree.progress, undefined, 'servidor ainda não recebeu');

  // "recarrega" a página, ainda offline
  server.clients.delete(first.adapter);
  const second = device(server, { storage, online: false });
  second.store.start();
  await tick();
  assert.equal(second.store.progress('band--full', 'm-baixo').v, 45, 'edição aparece a partir do diário');
  assert.equal(second.store.status.pending, 2, 'progresso + histórico do dia');

  second.adapter.goOnline();
  await tick();
  await tick();
  assert.equal(server.tree.progress['band--full']['m-baixo'].v, 45);
  assert.equal(Object.values(server.tree.history['band--full']['m-baixo'])[0].v, 45);
  assert.equal(second.store.status.pending, 0);
});

test('edição antiga feita offline não sobrescreve uma mais nova de outro aparelho', async () => {
  const server = newServer();
  let time = 1_000_000;
  const clock = () => time;
  const storageA = new MemoryStorage();
  const a = await started(server, { storage: storageA, clock });
  const b = await started(server, { clock });

  a.adapter.goOffline();
  time = 2_000_000;
  a.store.setProgress('band--full', 'm-vocal', 10); // t1
  time = 3_000_000;
  b.store.setProgress('band--full', 'm-vocal', 90); // t2 > t1
  await tick();
  assert.equal(server.tree.progress['band--full']['m-vocal'].v, 90);

  // A recarrega e volta online
  server.clients.delete(a.adapter);
  const a2 = device(server, { storage: storageA, online: true, clock });
  a2.store.start();
  await tick();
  await tick();
  assert.equal(server.tree.progress['band--full']['m-vocal'].v, 90, 'valor de B continua no servidor');
  assert.equal(a2.store.progress('band--full', 'm-vocal').v, 90, 'A passa a ver o valor de B');
  assert.equal(a2.store.status.pending, 0, 'edição antiga descartada do diário');
});

test('adicionar e reordenar ao mesmo tempo em aparelhos diferentes preserva as duas mudanças', async () => {
  const server = newServer();
  const a = await started(server);
  const b = await started(server);
  a.store.addToSetlist('band--full');
  a.store.addToSetlist('band--drop');
  await tick();
  await tick();
  a.adapter.goOffline();
  b.adapter.goOffline();
  a.store.addToSetlist('band--keys');
  b.store.moveSetlistItem('band--drop', 0);
  a.adapter.goOnline();
  b.adapter.goOnline();
  await tick();
  await tick();
  const ids = Object.keys(server.tree.setlists.main.items);
  assert.equal(ids.length, 3);
  assert.deepEqual(plain(a.store.setlist().items.map((i) => i.id)), ['band--drop', 'band--full', 'band--keys']);
  assert.deepEqual(plain(b.store.setlist().items.map((i) => i.id)), ['band--drop', 'band--full', 'band--keys']);
});

test('escrita negada pelas regras é desfeita e avisa erro', async () => {
  const server = newServer();
  const { store, adapter } = await started(server);
  const statuses = [];
  store.onStatus((s) => statuses.push(plain(s)));
  adapter.deny = true;
  store.setProgress('band--full', 'm-vocal', 70);
  assert.equal(store.progress('band--full', 'm-vocal').v, 70, 'otimista');
  await tick();
  await tick();
  assert.equal(store.progress('band--full', 'm-vocal'), null, 'revertido');
  assert.equal(store.status.pending, 0);
  assert.equal(statuses.at(-1).error.code, 'write-denied');
});

test('importar backup mescla pelo horário mais recente e ignora lixo', async () => {
  const server = newServer();
  let time = 5_000_000;
  const { store } = await started(server, { clock: () => time });
  store.setProgress('band--full', 'm-vocal', 50); // t = 5_000_000
  const applied = store.importData({
    app: 'rocks-hero',
    data: {
      progress: {
        'band--full': {
          'm-vocal': { v: 10, t: 4_000_000 },      // mais antigo: ignorado
          'm-baixo': { v: 80, t: 4_500_000 },      // novo: aplicado
          'm-guitarra': { v: 999, t: 9_000_000 },  // inválido: ignorado
        },
        'nao--existe': { 'm-vocal': { v: 10, t: 1 } },
      },
      setlists: { main: { name: 'Show', items: { 'band--keys': { pos: 1, t: 4_000_000 } } } },
      overrides: { 'band--full': { tun: { val: 'D', t: 4_000_000 } } },
      members: { 'm-extra': { name: 'Extra', instrument: 'teclado', order: 9, t: 99_000_000 } },
    },
  });
  assert.equal(applied, 5);
  assert.equal(store.progress('band--full', 'm-vocal').v, 50);
  assert.equal(store.progress('band--full', 'm-baixo').v, 80);
  assert.equal(store.progress('band--full', 'm-guitarra'), null);
  assert.equal(store.setlist().name, 'Show');
  assert.equal(store.tuning('band--full').code, 'D');
  assert.ok(store.state.members['m-extra'].t <= time, 'horário do futuro é limitado ao agora');
  assert.throws(() => store.importData({ foo: 1 }));
});

test('observação de cada músico: grava, sincroniza, apaga quando vazia e entra no backup', async () => {
  const server = newServer();
  const a = await started(server);
  const b = await started(server);
  a.store.setNote('band--full', 'm-guitarra', 'Capo na 2ª casa  \n');
  await tick();
  assert.equal(server.tree.notes['band--full']['m-guitarra'].v, 'Capo na 2ª casa');
  assert.equal(b.store.memberNote('band--full', 'm-guitarra').v, 'Capo na 2ª casa');
  assert.deepEqual(plain(b.store.songNotes('band--full').map((x) => x.member.id)), ['m-guitarra']);
  a.store.setNote('band--full', 'm-guitarra', 'x'.repeat(900));
  assert.equal(a.store.memberNote('band--full', 'm-guitarra').v.length, a.store.NOTE_MAX);
  assert.equal(a.store.exportData().data.notes['band--full']['m-guitarra'].v.length, a.store.NOTE_MAX);
  a.store.setNote('band--full', 'm-guitarra', '   ');
  await tick();
  assert.equal(a.store.memberNote('band--full', 'm-guitarra'), null);
  assert.equal(server.tree.notes, undefined);
  const applied = a.store.importData({ app: 'rocks-hero', data: { notes: {
    'band--full': { 'm-baixo': { v: 'Palheta', t: 1 }, 'm-vocal': { v: '', t: 1 } },
    'nao--existe': { 'm-baixo': { v: 'x', t: 1 } },
  } } });
  assert.equal(applied, 1);
  assert.equal(a.store.memberNote('band--full', 'm-baixo').v, 'Palheta');
});

test('adaptador local: senha correta entra e dados persistem no navegador', async () => {
  const storage = new MemoryStorage();
  const ctx = loadApp({ storage, songs: SONGS, meta: META });
  const adapter = ctx.RH.createLocalAdapter();
  const store = ctx.RH.createStore(adapter);
  store.start();
  assert.equal(store.status.authenticated, false);
  assert.equal((await store.login('hero@123')).ok, false);
  assert.equal((await store.login('Hero@123')).ok, true);
  await tick();
  assert.equal(store.status.authenticated, true);
  assert.equal(store.members().length, 4);
  store.setProgress('band--full', 'm-vocal', 35);
  await tick();
  await tick();

  const ctx2 = loadApp({ storage, songs: SONGS, meta: META });
  const store2 = ctx2.RH.createStore(ctx2.RH.createLocalAdapter());
  store2.start();
  await tick();
  assert.equal(store2.status.authenticated, true, 'sessão lembrada');
  assert.equal(store2.progress('band--full', 'm-vocal').v, 35);
  await store2.logout();
  assert.equal(store2.status.authenticated, false);
});

test('música fora do Guitar Hero: entra no catálogo, sincroniza e funciona como as outras', async () => {
  const server = newServer();
  const a = await started(server);
  const b = await started(server);
  const id = a.store.saveCustomSong({ title: '  Tempo   Perdido ', artist: 'Legião Urbana', year: '1986' });
  assert.equal(id, 'nossa--legiao-urbana--tempo-perdido');
  await tick();
  assert.deepEqual(plain(a.ctx.RH.SONGS[id]), { t: 'Tempo Perdido', a: 'Legião Urbana', y: 1986, custom: true });
  assert.deepEqual(plain(b.ctx.RH.SONGS[id]), { t: 'Tempo Perdido', a: 'Legião Urbana', y: 1986, custom: true });
  assert.equal(b.store.isCustom(id), true);
  assert.equal(b.store.isCustom('band--full'), false);
  assert.deepEqual(plain(b.store.customSongs().map((c) => c.id)), [id]);

  // daqui para a frente é uma música como qualquer outra
  b.store.setProgress(id, 'm-vocal', 100);
  b.store.setOverride(id, 'tun', 'dropD');
  b.store.addToSetlist(id);
  await tick();
  assert.equal(a.store.progress(id, 'm-vocal').v, 100);
  assert.equal(a.store.tuning(id).code, 'dropD');
  assert.equal(a.store.inSetlist(id), true);

  // mesmo artista e título de novo: id próprio, sem atropelar o que já existe
  assert.equal(a.store.saveCustomSong({ title: 'Tempo Perdido', artist: 'Legião Urbana' }), `${id}-2`);
  await tick();
  assert.equal(a.ctx.RH.SONGS[`${id}-2`].y, null);

  // renomear vale para a banda toda
  a.store.saveCustomSong({ id, title: 'Tempo Perdido (ao vivo)', artist: 'Legião Urbana', year: 1986 });
  await tick();
  assert.equal(b.ctx.RH.SONGS[id].t, 'Tempo Perdido (ao vivo)');
  assert.equal(b.store.progress(id, 'm-vocal').v, 100, 'o progresso continua com a música');
});

test('música da banda: recusa cadastro vazio, acha a repetida e apagar limpa tudo', async () => {
  const server = newServer();
  const { store, ctx } = await started(server);
  assert.throws(() => store.saveCustomSong({ title: '  ', artist: 'Banda' }), /nome da música/);
  assert.throws(() => store.saveCustomSong({ title: 'Música', artist: '' }), /artista/);
  assert.throws(() => store.saveCustomSong({ id: 'nossa--nao--existe', title: 'x', artist: 'y' }));

  const id = store.saveCustomSong({ title: 'Ainda é Cedo', artist: 'Legião Urbana', year: 3000 });
  assert.equal(store.customSong(id).y, undefined, 'ano fora do intervalo é descartado');
  assert.equal(store.findSongByName('ainda é cedo', 'LEGIÃO URBANA'), id);
  assert.equal(store.findSongByName('Full', 'Band'), 'band--full', 'acha também as do Guitar Hero');
  assert.equal(store.findSongByName('Nada', 'Ninguém'), null);

  store.setProgress(id, 'm-vocal', 60);
  store.setNote(id, 'm-vocal', 'Entra sem contar');
  store.setWant(id, 'm-vocal', true);
  store.setOverride(id, 'bpm', 150);
  store.addToSetlist(id);
  const rid = store.saveRehearsal({ date: '2026-01-10', songs: [id, 'band--full'] });
  await tick();
  assert.equal(server.tree.custom[id].n, 'Ainda é Cedo');

  store.deleteCustomSong(id);
  await tick();
  assert.equal(ctx.RH.SONGS[id], undefined, 'sai do catálogo em memória');
  // os ramos ficam vazios (e podados) porque essa era a única música neles
  for (const branch of ['custom', 'progress', 'history', 'notes', 'wants', 'overrides', 'setlists']) {
    assert.equal(server.tree[branch], undefined, `sobrou algo em ${branch}`);
  }
  assert.deepEqual(plain(server.tree.rehearsals[rid].songs), { 'band--full': true });
  assert.equal(store.inSetlist(id), false);
  assert.equal(store.customSongs().length, 0);
});

test('backup leva as músicas da banda junto com o progresso delas', async () => {
  const server = newServer();
  const { store } = await started(server);
  const id = store.saveCustomSong({ title: 'Faroeste Caboclo', artist: 'Legião Urbana', year: 1987 });
  store.setProgress(id, 'm-vocal', 40);
  const backup = store.exportData();
  assert.equal(backup.data.custom[id].n, 'Faroeste Caboclo');

  const outro = newServer();
  const b = await started(outro);
  const applied = b.store.importData({
    app: 'rocks-hero',
    data: {
      ...backup.data,
      custom: {
        ...backup.data.custom,
        'nossa--sem--nome': { n: '', a: 'X', t: 1 },   // inválida: ignorada
        'id-invalido': { n: 'X', a: 'Y', t: 1 },       // fora do padrão: ignorada
      },
    },
  });
  assert.ok(applied >= 2);
  assert.equal(b.ctx.RH.SONGS[id].t, 'Faroeste Caboclo');
  assert.equal(b.store.progress(id, 'm-vocal').v, 40, 'o progresso da música importada não se perde');
  assert.equal(b.store.customSongs().length, 1);
});
