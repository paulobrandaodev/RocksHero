// Testa database.rules.json no emulador (precisa de `npm run emulators` rodando).
// O REST do Realtime Database responde 401 para qualquer negação, inclusive de .validate.
// Uso: node tests/rules/rules.test.mjs
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
export const AUTH = 'http://127.0.0.1:9099';
export const DB = 'http://127.0.0.1:9000';
export const NS = 'demo-rockshero-default-rtdb';
export const BAND_EMAIL = 'rockshero@example.com';
export const BAND_PASSWORD = 'Hero@123';

async function authCall(action, email, password) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return res.json();
}

// Garante que o usuário existe e devolve { idToken, localId }.
export async function ensureUser(email, password) {
  let data = await authCall('signInWithPassword', email, password);
  if (data.error) data = await authCall('signUp', email, password);
  if (data.error) throw new Error(`auth: ${JSON.stringify(data.error)}`);
  return data;
}

// Carrega as regras do projeto no emulador com o UID informado.
export async function loadRules(uid) {
  // Usa as regras do projeto, trocando o UID da banda pelo usuário criado no emulador.
  const rules = (await readFile(join(root, 'database.rules.json'), 'utf8'))
    .replace(/auth\.uid === '[^']*'/g, `auth.uid === '${uid}'`);
  const res = await fetch(`${DB}/.settings/rules.json?ns=${NS}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner' },
    body: rules,
  });
  if (!res.ok) throw new Error(`regras recusadas pelo emulador: ${res.status} ${await res.text()}`);
}

export async function resetData() {
  await fetch(`${DB}/.json?ns=${NS}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
}

async function db(method, path, token, body) {
  const auth = token ? `&auth=${token}` : '';
  const res = await fetch(`${DB}/${path}.json?ns=${NS}${auth}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.status;
}

async function main() {
  const band = await ensureUser(BAND_EMAIL, BAND_PASSWORD);
  const other = await ensureUser('intruso@example.com', 'qualquer123');
  await loadRules(band.localId);
  await resetData();

  const now = Date.now();
  const cases = [
    ['sem login não lê', () => db('GET', 'rockshero', null), 401],
    ['sem login não escreve', () => db('PUT', 'rockshero/progress/a--b/m-vocal', null, { v: 50, t: now }), 401],
    ['outro usuário não lê', () => db('GET', 'rockshero', other.idToken), 401],
    ['outro usuário não escreve', () => db('PUT', 'rockshero/progress/a--b/m-vocal', other.idToken, { v: 50, t: now }), 401],
    ['banda lê', () => db('GET', 'rockshero', band.idToken), 200],
    ['banda não lê fora de /rockshero', () => db('GET', '', band.idToken), 401],
    ['banda não escreve fora de /rockshero', () => db('PUT', 'outra-coisa', band.idToken, { x: 1 }), 401],
    ['progresso válido', () => db('PUT', 'rockshero/progress/deep-purple--smoke-on-the-water/m-guitarra', band.idToken, { v: 75, t: now, by: 'm-guitarra' }), 200],
    ['progresso N/A', () => db('PUT', 'rockshero/progress/deep-purple--smoke-on-the-water/m-vocal', band.idToken, { v: 'na', t: now }), 200],
    ['progresso > 100 recusado', () => db('PUT', 'rockshero/progress/a--b/m-vocal', band.idToken, { v: 150, t: now }), 401],
    ['progresso negativo recusado', () => db('PUT', 'rockshero/progress/a--b/m-vocal', band.idToken, { v: -5, t: now }), 401],
    ['progresso sem t recusado', () => db('PUT', 'rockshero/progress/a--b/m-vocal', band.idToken, { v: 10 }), 401],
    ['progresso com campo extra recusado', () => db('PUT', 'rockshero/progress/a--b/m-vocal', band.idToken, { v: 10, t: now, hack: 1 }), 401],
    ['progresso com relógio 1h adiantado recusado', () => db('PUT', 'rockshero/progress/a--b/m-vocal', band.idToken, { v: 10, t: now + 3600000 }), 401],
    ['criar progresso só com v (folha incompleta) recusado', () => db('PUT', 'rockshero/progress/nova--musica/m-guitarra/v', band.idToken, 80), 401],
    ['membro com id inválido recusado', () => db('PUT', 'rockshero/progress/a--b/Vocal', band.idToken, { v: 10, t: now }), 401],
    ['apagar progresso permitido', () => db('DELETE', 'rockshero/progress/deep-purple--smoke-on-the-water/m-vocal', band.idToken), 200],
    ['membro válido', () => db('PUT', 'rockshero/members/m-vocal', band.idToken, { name: 'Vocal', instrument: 'vocal', order: 1, t: now }), 200],
    ['membro arquivado', () => db('PUT', 'rockshero/members/m-extra', band.idToken, { name: 'Extra', instrument: 'teclado', order: 5, archived: true, t: now }), 200],
    ['membro com instrumento inválido recusado', () => db('PUT', 'rockshero/members/m-x', band.idToken, { name: 'X', instrument: 'kazoo', order: 9, t: now }), 401],
    ['membro com nome vazio recusado', () => db('PUT', 'rockshero/members/m-y', band.idToken, { name: '', instrument: 'vocal', order: 9, t: now }), 401],
    ['nome do set list', () => db('PUT', 'rockshero/setlists/main/name', band.idToken, 'Show de sábado'), 200],
    ['item do set list válido', () => db('PUT', 'rockshero/setlists/main/items/deep-purple--smoke-on-the-water', band.idToken, { pos: 1.5, t: now }), 200],
    ['item do set list sem pos recusado', () => db('PUT', 'rockshero/setlists/main/items/a--b', band.idToken, { t: now }), 401],
    ['override de afinação', () => db('PUT', 'rockshero/overrides/a--b/tun', band.idToken, { val: 'dropD', t: now, by: 'm-guitarra' }), 200],
    ['override de instrumentação', () => db('PUT', 'rockshero/overrides/a--b/ins', band.idToken, { val: 'vggbdk', t: now }), 200],
    ['observação válida', () => db('PUT', 'rockshero/notes/a--b/m-guitarra', band.idToken, { v: 'Capo na 2ª casa', t: now, by: 'm-guitarra' }), 200],
    ['observação vazia recusada', () => db('PUT', 'rockshero/notes/a--b/m-guitarra', band.idToken, { v: '', t: now }), 401],
    ['observação longa demais recusada', () => db('PUT', 'rockshero/notes/a--b/m-guitarra', band.idToken, { v: 'x'.repeat(501), t: now }), 401],
    ['observação com campo extra recusada', () => db('PUT', 'rockshero/notes/a--b/m-guitarra', band.idToken, { v: 'ok', t: now, hack: 1 }), 401],
    ['override de instrumentação inválida recusado', () => db('PUT', 'rockshero/overrides/a--b/ins', band.idToken, { val: 'xyz', t: now }), 401],
    ['override de BPM em texto recusado', () => db('PUT', 'rockshero/overrides/a--b/bpm', band.idToken, { val: '120', t: now }), 401],
    ['override de campo desconhecido recusado', () => db('PUT', 'rockshero/overrides/a--b/key', band.idToken, { val: 'Em', t: now }), 401],
    ['override de BPM', () => db('PUT', 'rockshero/overrides/a--b/bpm', band.idToken, { val: 128, t: now, by: 'm-bateria' }), 200],
    ['override de BPM fora do limite recusado', () => db('PUT', 'rockshero/overrides/a--b/bpm', band.idToken, { val: 900, t: now }), 401],
    ['override de duração', () => db('PUT', 'rockshero/overrides/a--b/dur', band.idToken, { val: 245, t: now }), 200],
    ['override de duração zero recusado', () => db('PUT', 'rockshero/overrides/a--b/dur', band.idToken, { val: 0, t: now }), 401],
    ['novo set list com dados do show', () => db('PATCH', 'rockshero/setlists/sl-abc123', band.idToken, {
      name: 'Estreia', kind: 'acustico', date: '2026-10-30', played: true, limit: 60, gap: 45, created: now,
    }), 200],
    ['set list com tipo inválido recusado', () => db('PUT', 'rockshero/setlists/sl-abc123/kind', band.idToken, 'rave'), 401],
    ['set list com data inválida recusado', () => db('PUT', 'rockshero/setlists/sl-abc123/date', band.idToken, '30/10/2026'), 401],
    ['set list com tempo combinado absurdo recusado', () => db('PUT', 'rockshero/setlists/sl-abc123/limit', band.idToken, 5000), 401],
    ['apagar set list inteiro permitido', () => db('DELETE', 'rockshero/setlists/sl-abc123', band.idToken), 200],
    ['quero tocar', () => db('PUT', 'rockshero/wants/a--b/m-vocal', band.idToken, { v: true, t: now }), 200],
    ['quero tocar com v falso recusado', () => db('PUT', 'rockshero/wants/a--b/m-vocal', band.idToken, { v: false, t: now }), 401],
    ['histórico do dia', () => db('PUT', 'rockshero/history/a--b/m-vocal/2026-09-18', band.idToken, { v: 60, t: now }), 200],
    ['histórico com dia inválido recusado', () => db('PUT', 'rockshero/history/a--b/m-vocal/ontem', band.idToken, { v: 60, t: now }), 401],
    ['histórico acima de 100 recusado', () => db('PUT', 'rockshero/history/a--b/m-vocal/2026-09-18', band.idToken, { v: 101, t: now }), 401],
    ['ensaio válido', () => db('PUT', 'rockshero/rehearsals/r-abc123', band.idToken, { date: '2026-09-18', note: 'Passamos o set', songs: { 'a--b': true }, t: now, by: 'm-vocal' }), 200],
    ['ensaio sem data recusado', () => db('PUT', 'rockshero/rehearsals/r-abc124', band.idToken, { t: now }), 401],
    ['ensaio com música marcada falso recusado', () => db('PUT', 'rockshero/rehearsals/r-abc125', band.idToken, { date: '2026-09-18', songs: { 'a--b': false }, t: now }), 401],
    ['ensaio com id inválido recusado', () => db('PUT', 'rockshero/rehearsals/ensaio1', band.idToken, { date: '2026-09-18', t: now }), 401],
    ['música da banda', () => db('PUT', 'rockshero/custom/nossa--legiao-urbana--tempo-perdido', band.idToken, { n: 'Tempo Perdido', a: 'Legião Urbana', y: 1986, t: now, by: 'm-vocal' }), 200],
    ['música da banda sem artista recusada', () => db('PUT', 'rockshero/custom/nossa--x--y', band.idToken, { n: 'Só o nome', t: now }), 401],
    ['música da banda com nome vazio recusada', () => db('PUT', 'rockshero/custom/nossa--x--y', band.idToken, { n: '', a: 'Artista', t: now }), 401],
    ['música da banda com ano absurdo recusada', () => db('PUT', 'rockshero/custom/nossa--x--y', band.idToken, { n: 'Nome', a: 'Artista', y: 1200, t: now }), 401],
    ['música da banda com id fora do padrão recusada', () => db('PUT', 'rockshero/custom/a--b', band.idToken, { n: 'Nome', a: 'Artista', t: now }), 401],
    ['nó desconhecido em /rockshero recusado', () => db('PUT', 'rockshero/lixo', band.idToken, { a: 1 }), 401],
    ['update multi-caminho válido', () => db('PATCH', 'rockshero', band.idToken, {
      'progress/a--b/m-baixo': { v: 40, t: now, by: 'm-baixo' },
      'setlists/main/items/a--b': { pos: 2, t: now },
    }), 200],
  ];

  let failed = 0;
  for (const [name, run, expected] of cases) {
    const status = await run();
    const ok = status === expected;
    if (!ok) failed++;
    console.log(`${ok ? '✔' : '✘'} ${name} (HTTP ${status}${ok ? '' : `, esperado ${expected}`})`);
  }
  console.log(`\n${cases.length - failed}/${cases.length} regras OK`);
  if (failed) process.exit(1);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) await main();
