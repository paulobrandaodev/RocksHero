// Set lists múltiplos, ordem por afinação, tempo do set, "quero tocar", histórico e diário de ensaio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, MemoryStorage, FakeServer, fakeAdapter, plain, tick } from './harness.mjs';

const SONGS = {};
const META = {};
const EXTRA = {};
// id → [afinação, instrumentação, duração (s), BPM]
const DEF = {
  'a--e1': ['E', 'vggbd', 200, 120],
  'a--d1': ['D', 'vggbd', 180, 90],
  'a--e2': ['E', 'vggbd', 240, 140],
  'a--eb1': ['Eb', 'vggbd', 210, 100],
  'a--d2': ['D', 'vggbd', null, null],
  'a--unk': [null, 'vggbd', 150, 110],
  'a--e3': ['E', 'vgbd', 190, 128],
  'a--keys': ['E', 'vgbdk', 300, 76],
};
for (const [id, [tun, ins, dur, bpm]] of Object.entries(DEF)) {
  SONGS[id] = { t: id.slice(3).toUpperCase(), a: 'A', y: 2000 };
  META[id] = [tun, tun ? 1 : 0, ins];
  if (dur || bpm) EXTRA[id] = [dur, bpm, 1];
}

function device(server, { storage = new MemoryStorage(), clock } = {}) {
  const ctx = loadApp({ storage, songs: SONGS, meta: META });
  ctx.RH.EXTRA = EXTRA;
  const adapter = fakeAdapter(server);
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

const ids = (store, listId) => plain(store.setlist(listId).items.map((i) => i.id));

test('trocas de afinação ignoram músicas sem afinação conhecida', async () => {
  const { store } = await started(newServer());
  for (const id of ['a--e1', 'a--unk', 'a--d1', 'a--d2']) store.addToSetlist(id);
  assert.deepEqual(plain(store.tuningChanges(store.setlist().items)), [{ index: 2, from: 'E', to: 'D' }]);
});

test('otimizar ordem agrupa por afinação e mantém abertura e encerramento', async () => {
  const { store } = await started(newServer());
  const order = ['a--e1', 'a--d1', 'a--e2', 'a--eb1', 'a--d2', 'a--unk', 'a--e3', 'a--keys'];
  order.forEach((id) => store.addToSetlist(id));
  const before = store.tuningChanges(store.setlist().items).length;
  const next = store.optimizeOrder(store.setlist().items);
  assert.equal(next[0], 'a--e1');
  assert.equal(next[next.length - 1], 'a--keys');
  // E logo depois da abertura (E), depois Eb, depois D; a sem afinação acompanha a D2 (anterior a ela).
  assert.deepEqual(plain(next), ['a--e1', 'a--e2', 'a--e3', 'a--eb1', 'a--d1', 'a--d2', 'a--unk', 'a--keys']);
  store.applyOrder(next);
  assert.deepEqual(ids(store), plain(next));
  const after = store.tuningChanges(store.setlist().items).length;
  assert.ok(after < before, `${before} → ${after}`);
  assert.equal(after, 3); // E→Eb, Eb→D, D→E
  // listas curtas ficam como estão
  assert.deepEqual(plain(store.optimizeOrder([{ id: 'a--e1' }, { id: 'a--d1' }, { id: 'a--e2' }])), ['a--e1', 'a--d1', 'a--e2']);
});

test('vários set lists: criar, escolher, copiar, campos do show e excluir', async () => {
  const server = newServer();
  const { store } = await started(server);
  store.addToSetlist('a--e1');
  assert.equal(store.currentSetlistId(), 'main');
  const id = store.createSetlist({ name: 'Acústico', kind: 'acustico', date: '2026-10-30', copyFrom: 'main' });
  assert.equal(store.currentSetlistId(), id);
  assert.deepEqual(ids(store), ['a--e1'], 'copiou as músicas');
  store.addToSetlist('a--d1');
  assert.deepEqual(ids(store, 'main'), ['a--e1'], 'a lista principal não mudou');
  assert.ok(store.inSetlist('a--d1'));
  assert.ok(!store.inSetlist('a--d1', 'main'));
  store.setSetlistFields({ limit: 45, gap: 30, played: true });
  await tick();
  assert.equal(server.tree.setlists[id].limit, 45);
  assert.equal(store.setlist().kind, 'acustico');
  assert.equal(store.setlist().date, '2026-10-30');
  assert.throws(() => store.setSetlistFields({ date: '30/10' }));
  assert.throws(() => store.setSetlistFields({ foo: 1 }));
  // realizada vai para o fim da lista e entra no histórico
  assert.deepEqual(plain(store.setlists().map((l) => l.id)), ['main', id]);
  assert.equal(store.songPlays('a--d1').count, 1);
  assert.equal(store.songPlays('a--e1').count, 1);
  assert.deepEqual(plain(store.mostPlayed().map((x) => x.id)).sort(), ['a--d1', 'a--e1']);
  store.selectSetlist('main');
  assert.equal(store.currentSetlistId(), 'main');
  store.setSetlistFields({ played: false }, id);
  assert.equal(store.songPlays('a--d1').count, 0);
  store.selectSetlist(id);
  store.deleteSetlist(id);
  await tick();
  assert.equal(server.tree.setlists[id], undefined);
  assert.equal(store.currentSetlistId(), 'main', 'volta para uma lista que existe');
});

test('tempo do set soma durações e o tempo por troca de afinação', async () => {
  const { store } = await started(newServer());
  for (const id of ['a--e1', 'a--d1', 'a--d2', 'a--e2']) store.addToSetlist(id);
  let t = store.setlistTiming();
  assert.equal(t.music, 200 + 180 + 240);
  assert.equal(t.missing, 1);
  assert.equal(t.gap, 60, 'padrão: 1 min por troca');
  assert.equal(t.total, 620 + 2 * 60);
  assert.deepEqual(plain(t.starts), [0, 260, 440, 500]);
  store.setSetlistFields({ gap: 0, limit: 10 });
  t = store.setlistTiming();
  assert.equal(t.total, 620);
  assert.equal(t.left, -20);
  // correção da banda vale no lugar do dado original
  store.setOverride('a--d2', 'dur', 125);
  assert.equal(store.duration('a--d2').sec, 125);
  assert.equal(store.setlistTiming().missing, 0);
  store.setOverride('a--d2', 'bpm', 133.4);
  assert.equal(store.bpm('a--d2').val, 133);
  assert.throws(() => store.setOverride('a--d2', 'bpm', 1000));
  store.setOverride('a--d2', 'dur', undefined);
  assert.equal(store.duration('a--d2').sec, null);
  assert.deepEqual(plain(store.setlistSummary().bpms), [120, 90, 133, 140]);
});

test('quero tocar: marca, desmarca e ordena a prioridade de ensaio', async () => {
  const { store } = await started(newServer());
  const all = ['m-vocal', 'm-guitarra', 'm-baixo', 'm-bateria'];
  all.forEach((m) => store.setWant('a--e1', m, true));
  store.setWant('a--d1', 'm-vocal', true);
  for (const m of all) store.setProgress('a--e1', m, 60);
  for (const m of all) store.setProgress('a--e2', m, 100);
  all.forEach((m) => store.setWant('a--e2', m, true));
  assert.equal(store.wanters('a--e1').length, 4);
  assert.ok(store.wants('a--d1', 'm-vocal'));
  assert.ok(store.wantScore('a--e1') > store.wantScore('a--d1'));
  assert.ok(store.wantScore('a--e1') > store.wantScore('a--e2'), 'pronta não é prioridade');
  assert.equal(store.wantScore('a--keys'), 0);
  store.setWant('a--d1', 'm-vocal', false);
  assert.equal(store.wanters('a--d1').length, 0);
});

test('histórico do progresso: um ponto por dia e linha do tempo de prontas', async () => {
  let time = new Date(2026, 8, 1, 20).getTime();
  const day = 86400000;
  const { store } = await started(newServer(), { clock: () => time });
  store.setProgress('a--e1', 'm-vocal', 40);
  store.setProgress('a--e1', 'm-vocal', 60); // mesmo dia: fica o último
  time += 2 * day;
  store.setProgress('a--e1', 'm-vocal', 90);
  for (const m of ['m-guitarra', 'm-baixo', 'm-bateria']) store.setProgress('a--e1', m, 85);
  const h = plain(store.progressHistory('a--e1', 'm-vocal'));
  assert.deepEqual(h.map((p) => [p.day, p.v]), [['2026-09-01', 60], ['2026-09-03', 90]]);
  const tl = store.readyTimeline({ to: '2026-09-04' });
  assert.deepEqual(plain(tl.days), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
  const vocal = tl.series.find((s) => s.id === 'm-vocal');
  const band = tl.series.find((s) => s.id === 'band');
  assert.deepEqual(plain(vocal.values), [0, 0, 1, 1]);
  assert.deepEqual(plain(band.values), [0, 0, 1, 1]);
  // progresso antigo, de antes do histórico, entra na data em que foi salvo
  store.write({ 'progress/a--d1/m-baixo': { v: 80, t: new Date(2026, 7, 20).getTime() } });
  assert.deepEqual(plain(store.progressHistory('a--d1', 'm-baixo').map((p) => p.day)), ['2026-08-20']);
});

test('diário de ensaio: salvar, editar, excluir, última vez e músicas paradas', async () => {
  let time = new Date(2026, 8, 30, 20).getTime();
  const server = newServer();
  const { store } = await started(server, { clock: () => time });
  store.addToSetlist('a--e1');
  store.addToSetlist('a--d1');
  store.write({ 'progress/a--d1/m-baixo': { v: 50, t: new Date(2026, 7, 1).getTime() } });
  store.write({ 'progress/a--e2/m-baixo': { v: 30, t: new Date(2026, 8, 25).getTime() } });
  for (const m of ['m-vocal', 'm-guitarra', 'm-baixo', 'm-bateria']) store.write({ [`progress/a--keys/${m}`]: { v: 100, t: new Date(2026, 7, 1).getTime() } });
  const stale = plain(store.staleSongs({ days: 21 }).map((s) => s.id));
  assert.deepEqual(stale, ['a--e1', 'a--d1'], 'sem atividade primeiro; a recente e a que não tem progresso ficam de fora');

  const rid = store.saveRehearsal({ date: '2026-09-28', note: '  Passamos o set todo  ', songs: ['a--d1', 'nao--existe'] });
  await tick();
  assert.deepEqual(plain(server.tree.rehearsals[rid]), { date: '2026-09-28', note: 'Passamos o set todo', songs: { 'a--d1': true }, t: time });
  assert.equal(store.lastRehearsal('a--d1').id, rid);
  assert.deepEqual(plain(store.staleSongs({ days: 21 }).map((s) => s.id)), ['a--e1'], 'o ensaio conta como atividade');
  store.saveRehearsal({ id: rid, date: '2026-09-29', songs: ['a--e1', 'a--d1'] });
  assert.equal(store.rehearsals().length, 1);
  assert.equal(store.rehearsals()[0].note, '');
  assert.equal(store.songRehearsals('a--e1').length, 1);
  assert.throws(() => store.saveRehearsal({ date: 'ontem' }));
  store.deleteRehearsal(rid);
  assert.equal(store.rehearsals().length, 0);
});

test('backup leva e traz os dados novos', async () => {
  const a = await started(newServer());
  const id = a.store.createSetlist({ name: 'Estreia', date: '2026-11-01' });
  a.store.addToSetlist('a--e1');
  a.store.setSetlistFields({ played: true, limit: 50 });
  a.store.setWant('a--e1', 'm-vocal', true);
  a.store.setProgress('a--e1', 'm-vocal', 70);
  a.store.setOverride('a--e1', 'bpm', 125);
  a.store.saveRehearsal({ date: '2026-10-01', note: 'ok', songs: ['a--e1'] });
  const file = JSON.parse(JSON.stringify(a.store.exportData()));

  const b = await started(newServer());
  const applied = b.store.importData(file);
  assert.ok(applied >= 8, `aplicou ${applied}`);
  const list = b.store.setlist(id);
  assert.equal(list.name, 'Estreia');
  assert.equal(list.played, true);
  assert.equal(list.limit, 50);
  assert.deepEqual(plain(list.items.map((i) => i.id)), ['a--e1']);
  assert.ok(b.store.wants('a--e1', 'm-vocal'));
  assert.equal(b.store.bpm('a--e1').val, 125);
  assert.equal(b.store.rehearsals()[0].note, 'ok');
  assert.equal(b.store.progressHistory('a--e1', 'm-vocal').length, 1);
  assert.equal(b.store.importData(file), 0, 'importar de novo não muda nada');
});
