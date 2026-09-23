/* Estado do app (local-first), cálculos da banda e escrita sincronizada.

   Estrutura (espelha /rockshero no Realtime Database):
     members/{memberId}:           {name, instrument, order, archived?, t}
     progress/{songId}/{memberId}: {v: 0..100 | "na", t, by}
     setlists/{listId}/name:       string              (a primeira lista é "main")
     setlists/{listId}/items/{songId}: {pos, t}
     setlists/{listId}/{kind|date|played|limit|gap|created}: tipo, data do show (AAAA-MM-DD),
                                   show realizado, tempo combinado (min), tempo por troca de afinação (s)
     overrides/{songId}/{tun|ins}: {val: texto, t, by}
     overrides/{songId}/{dur|bpm}: {val: número, t, by}  (duração em segundos e BPM)
     notes/{songId}/{memberId}:    {v: texto, t, by}   (observação de cada músico)
     wants/{songId}/{memberId}:    {v: true, t}        ("quero tocar")
     history/{songId}/{memberId}/{AAAA-MM-DD}: {v, t}  (último progresso de cada dia)
     rehearsals/{rehearsalId}:     {date, note, songs: {songId: true}, t, by}  (diário de ensaio)
     custom/{songId}:              {n: título, a: artista, y?: ano, t, by}  (música fora do Guitar Hero)

   `remote` é a última cópia conhecida do servidor (também guardada em cache).
   `journal` guarda edições ainda não confirmadas, sobrevive a recarregar a página
   e é aplicado por cima de `remote` para formar `state`. */
window.RH = window.RH || {};

RH.createStore = (adapter, options = {}) => {
  const U = RH.util;
  const S = RH.safeStorage;
  const SONGS = () => RH.SONGS || {};
  const META = () => RH.META || {};
  const EXTRA = () => RH.EXTRA || {};
  const SESSION = options.session || U.randomId();
  const clock = options.clock || Date.now;
  const keys = {
    cache: `${adapter.scope}:cache`,
    journal: `${adapter.scope}:journal`,
    offset: `${adapter.scope}:offset`,
    me: `${adapter.scope}:me`,
    setlist: `${adapter.scope}:setlist`,
    hadSession: `${adapter.scope}:had-session`,
  };

  let remote = S.get(keys.cache) || {};
  let journal = S.get(keys.journal) || {};
  let state = {};
  let receivedServer = false;
  let unsubscribe = null;
  let lastOffset = Number(S.get(keys.offset)) || 0;
  let status = { mode: adapter.mode, connected: false, authenticated: false, authKnown: false, synced: false, error: null };

  const changeListeners = new Set();
  const statusListeners = new Set();

  const now = () => {
    const offset = adapter.serverTimeOffset();
    if (offset && offset !== lastOffset) { lastOffset = offset; S.set(keys.offset, offset); }
    return Math.round(clock() + (offset || lastOffset));
  };

  const pendingCount = () => Object.keys(journal).length;

  const emitStatus = (patch) => {
    status = { ...status, ...patch, pending: pendingCount() };
    statusListeners.forEach((fn) => fn(status));
  };

  // ---------- estado derivado ----------

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const diff = (prev, next) => {
    const songs = new Set();
    for (const branch of ['progress', 'overrides', 'notes', 'wants', 'history', 'custom']) {
      const a = prev[branch] || {};
      const b = next[branch] || {};
      for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!same(a[id], b[id])) songs.add(id);
      }
    }
    const members = !same(prev.members, next.members);
    const setlist = !same(prev.setlists, next.setlists);
    const rehearsals = !same(prev.rehearsals, next.rehearsals);
    const custom = !same(prev.custom, next.custom);
    return { songs, members, setlist, rehearsals, custom, any: members || setlist || rehearsals || custom || songs.size > 0 };
  };

  const rebuild = () => {
    const next = U.clone(remote) || {};
    for (const [path, entry] of Object.entries(journal)) U.setPath(next, path, U.clone(entry.value));
    const changes = diff(state, next);
    state = next;
    if (changes.custom) syncCatalog();
    return changes;
  };

  const emit = (changes, source) => {
    if (changes.any) changeListeners.forEach((fn) => fn(changes, source));
  };

  const saveCache = U.debounce(() => S.set(keys.cache, remote), 600);
  const saveJournal = () => S.set(keys.journal, journal);
  const reloadJournal = () => { journal = S.get(keys.journal) || {}; };

  const isPermissionError = (err) => {
    const text = `${err && err.code} ${err && err.message}`.toLowerCase();
    return text.includes('permission') || text.includes('storage-full');
  };

  // ---------- escrita ----------

  const send = (updates, ids) => {
    Promise.resolve()
      .then(() => adapter.write(updates))
      .then(() => {
        reloadJournal();
        for (const path of Object.keys(updates)) {
          if (journal[path] && journal[path].id === ids[path]) {
            U.setPath(remote, path, U.clone(updates[path]));
            delete journal[path];
          }
        }
        saveJournal();
        saveCache();
        emitStatus({});
      }, (err) => {
        if (!isPermissionError(err)) return; // erro de rede: o diário tenta de novo depois
        reloadJournal();
        for (const path of Object.keys(updates)) {
          if (journal[path] && journal[path].id === ids[path]) delete journal[path];
        }
        saveJournal();
        emit(rebuild(), 'revert');
        emitStatus({ error: { code: 'write-denied', detail: String(err && (err.code || err.message)) } });
      });
  };

  const write = (updates) => {
    const paths = Object.keys(updates);
    if (!paths.length) return;
    U.assertLeafPaths(paths);
    reloadJournal();
    const t = now();
    const ids = {};
    for (const path of paths) {
      ids[path] = U.randomId();
      journal[path] = { value: U.clone(updates[path]), t, id: ids[path], session: SESSION };
    }
    saveJournal();
    emit(rebuild(), 'local');
    emitStatus({});
    send(updates, ids);
  };

  // ---------- recebimento do servidor ----------

  const leafTime = (value) => (value && typeof value === 'object' && typeof value.t === 'number' ? value.t : null);

  const seedMembersIfNeeded = () => {
    if (remote.members && Object.keys(remote.members).length) return;
    if (Object.keys(journal).some((p) => p.startsWith('members/'))) return;
    const t = now();
    const updates = {};
    for (const m of RH.DEFAULT_MEMBERS) {
      updates[`members/${m.id}`] = { name: m.name, instrument: m.instrument, order: m.order, t };
    }
    write(updates);
  };

  const onRemote = (tree) => {
    remote = tree || {};
    saveCache();
    if (!receivedServer) {
      receivedServer = true;
      reloadJournal();
      const replay = {};
      const replayIds = {};
      for (const [path, entry] of Object.entries(journal)) {
        if (entry.session === SESSION) continue;
        const serverT = leafTime(U.getPath(remote, path));
        if (serverT != null && serverT > entry.t) {
          delete journal[path]; // alguém editou depois: a edição antiga não vale mais
          continue;
        }
        entry.session = SESSION;
        replay[path] = entry.value;
        replayIds[path] = entry.id;
      }
      saveJournal();
      if (Object.keys(replay).length) send(replay, replayIds);
      emit(rebuild(), 'remote');
      seedMembersIfNeeded();
      emitStatus({ synced: true });
      return;
    }
    emit(rebuild(), 'remote');
  };

  const onRemoteError = (err) => {
    emitStatus({ error: { code: 'read-denied', detail: String(err && (err.code || err.message)) } });
  };

  // ---------- membros ----------

  const allMembers = () => Object.entries(state.members || {})
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name)));

  const members = () => allMembers().filter((m) => !m.archived);

  const memberPart = (m) => (RH.MEMBER_INSTRUMENTS[m.instrument] || {}).part || null;

  // ---------- música: afinação, instrumentação e progresso ----------

  const tuning = (songId) => {
    const base = META()[songId] || [null, 0, null];
    const override = state.overrides && state.overrides[songId] && state.overrides[songId].tun;
    if (override) {
      const code = override.val === '' ? null : override.val;
      return { code, confirmed: code != null, overridden: true, base: base[0], by: override.by, t: override.t };
    }
    return { code: base[0], confirmed: base[0] != null && base[1] === 1, overridden: false, base: base[0] };
  };

  const instrumentation = (songId) => {
    const base = META()[songId] || [null, 0, null];
    const override = state.overrides && state.overrides[songId] && state.overrides[songId].ins;
    const str = override ? override.val : base[2];
    return { str, counts: RH.parseIns(str), overridden: !!override, base: base[2], by: override && override.by, t: override && override.t };
  };

  const note = (songId) => (META()[songId] || [])[3] || '';

  // Duração (s) e BPM da gravação original: dados do Deezer (tools/data) ou correção da banda.
  const numberOverride = (songId, field) => {
    const o = state.overrides && state.overrides[songId] && state.overrides[songId][field];
    return o && typeof o.val === 'number' ? o : null;
  };

  const duration = (songId) => {
    const base = (EXTRA()[songId] || [])[0] || null;
    const o = numberOverride(songId, 'dur');
    return o ? { sec: o.val, overridden: true, base, by: o.by, t: o.t } : { sec: base, overridden: false, base };
  };

  const bpm = (songId) => {
    const e = EXTRA()[songId] || [];
    const base = e[1] || null;
    const o = numberOverride(songId, 'bpm');
    if (o) return { val: o.val, confirmed: true, overridden: true, base, by: o.by, t: o.t };
    return { val: base, confirmed: base != null && e[2] === 1, overridden: false, base };
  };

  const progress = (songId, memberId) => {
    const leaf = state.progress && state.progress[songId] && state.progress[songId][memberId];
    return leaf || null;
  };

  // `valueOf(memberId)` devolve o registro do membro (o atual ou um do histórico).
  const applicableFrom = (songId, valueOf) => {
    const counts = instrumentation(songId).counts;
    return members().filter((m) => {
      const leaf = valueOf(m.id);
      if (leaf && leaf.v === 'na') return false;
      if (leaf && typeof leaf.v === 'number') return true;
      if (!counts) return true;
      const part = memberPart(m);
      return part ? counts[part] > 0 : true;
    });
  };

  const medianFrom = (songId, valueOf) => {
    const list = applicableFrom(songId, valueOf);
    if (!list.length) return null;
    const values = list.map((m) => {
      const leaf = valueOf(m.id);
      return leaf && typeof leaf.v === 'number' ? leaf.v : 0;
    });
    return Math.round(U.median(values));
  };

  const applicableMembers = (songId) => applicableFrom(songId, (memberId) => progress(songId, memberId));

  const median = (songId) => medianFrom(songId, (memberId) => progress(songId, memberId));

  const lineupCounts = () => {
    const have = {};
    for (const m of members()) {
      const part = memberPart(m);
      if (part) have[part] = (have[part] || 0) + 1;
    }
    return have;
  };

  const uncovered = (songId) => {
    const counts = instrumentation(songId).counts;
    if (!counts) return [];
    const have = lineupCounts();
    return RH.PARTS
      .filter((p) => counts[p.key] > (have[p.key] || 0))
      .map((p) => ({ key: p.key, missing: counts[p.key] - (have[p.key] || 0), total: counts[p.key] }));
  };

  // Cada mudança também vai para o histórico do dia (o último valor do dia é o que fica).
  const setProgress = (songId, memberId, value) => {
    const path = `progress/${songId}/${memberId}`;
    const t = now();
    const day = `history/${songId}/${memberId}/${U.dayKey(t)}`;
    if (value == null) return write({ [path]: null, [day]: { v: 0, t } });
    const v = value === 'na' ? 'na' : U.clamp(Math.round(Number(value)), 0, 100);
    write({ [path]: { v, t, by: me() || memberId }, [day]: { v, t } });
  };

  const NUMBER_FIELDS = { dur: [1, 3600], bpm: [20, 300] };

  const setOverride = (songId, field, val) => {
    if (!['tun', 'ins', 'dur', 'bpm'].includes(field)) throw new Error(`campo inválido: ${field}`);
    const path = `overrides/${songId}/${field}`;
    if (val === undefined) return write({ [path]: null });
    let v;
    if (NUMBER_FIELDS[field]) {
      const [min, max] = NUMBER_FIELDS[field];
      v = Math.round(Number(val));
      if (!Number.isFinite(v) || v < min || v > max) throw new Error(`valor fora do limite: ${val}`);
    } else {
      v = val == null ? '' : String(val);
    }
    const leaf = { val: v, t: now() };
    if (me()) leaf.by = me();
    write({ [path]: leaf });
  };

  // ---------- músicas fora do Guitar Hero ----------

  /* A banda cadastra artista e nome; o registro entra no catálogo em memória (RH.SONGS) com o
     mesmo formato das músicas dos jogos, então set list, palco, ensaios, letra, progresso,
     correções e PDF funcionam sem saber que ela veio daqui. */

  const CUSTOM_PREFIX = 'nossa--';
  const CUSTOM_TEXT_MAX = 80;
  const CUSTOM_YEAR = [1900, 2100];

  const slug = (text) => U.fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 44);

  const cleanText = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, CUSTOM_TEXT_MAX);

  const customLeaf = (leaf) => (leaf && typeof leaf.n === 'string' && leaf.n && typeof leaf.a === 'string' ? leaf : null);

  const customSong = (songId) => customLeaf(state.custom && state.custom[songId]);

  const isCustom = (songId) => !!customSong(songId);

  const customSongs = () => Object.keys(state.custom || {})
    .filter((id) => customSong(id))
    .map((id) => ({ id, ...state.custom[id] }))
    .sort((a, b) => String(a.a).localeCompare(String(b.a), 'pt-BR') || String(a.n).localeCompare(String(b.n), 'pt-BR'));

  // Espelha `custom` em RH.SONGS (e na busca do catálogo). Roda a cada mudança do ramo.
  let merged = [];
  const syncCatalog = () => {
    const songs = RH.SONGS || (RH.SONGS = {});
    const next = [];
    for (const [id, raw] of Object.entries(state.custom || {})) {
      const leaf = customLeaf(raw);
      if (!leaf) continue;
      songs[id] = { t: leaf.n, a: leaf.a, y: typeof leaf.y === 'number' ? leaf.y : null, custom: true };
      if (RH.catalog) RH.catalog.search[id] = U.fold(`${leaf.n} ${leaf.a}`);
      next.push(id);
    }
    for (const id of merged) {
      if (next.includes(id)) continue;
      delete songs[id];
      if (RH.catalog) delete RH.catalog.search[id];
    }
    merged = next;
  };

  // "nossa--legiao-urbana--tempo-perdido"; se já existir, vira "…-2".
  const freeCustomId = (base) => {
    let id = base;
    for (let n = 2; SONGS()[id]; n++) id = `${base}-${n}`;
    return id;
  };

  // Mesma música já cadastrada (do jogo ou da banda): compara artista + título sem acento.
  const findSongByName = (title, artist) => {
    const key = U.fold(`${cleanText(title)} ${cleanText(artist)}`);
    const all = SONGS();
    return Object.keys(all).find((id) => U.fold(`${all[id].t} ${all[id].a}`) === key) || null;
  };

  const saveCustomSong = ({ id, title, artist, year } = {}) => {
    const n = cleanText(title);
    const a = cleanText(artist);
    if (!n) throw new Error('Escreva o nome da música.');
    if (!a) throw new Error('Escreva o artista.');
    if (id && !customSong(id)) throw new Error('Essa música não foi cadastrada pela banda.');
    const songId = id || freeCustomId(`${CUSTOM_PREFIX}${slug(a) || 'artista'}--${slug(n) || 'musica'}`);
    const leaf = { n, a, t: now() };
    const y = Math.round(Number(year));
    if (Number.isInteger(y) && y >= CUSTOM_YEAR[0] && y <= CUSTOM_YEAR[1]) leaf.y = y;
    const by = id ? (state.custom[id].by || me()) : me();
    if (by) leaf.by = by;
    write({ [`custom/${songId}`]: leaf });
    return songId;
  };

  // Apagar leva junto tudo o que só fazia sentido com ela (progresso, correções, set lists, ensaios).
  const deleteCustomSong = (songId) => {
    if (!customSong(songId)) return 0;
    const updates = { [`custom/${songId}`]: null };
    for (const branch of ['progress', 'overrides', 'notes', 'wants', 'history']) {
      if (state[branch] && state[branch][songId]) updates[`${branch}/${songId}`] = null;
    }
    for (const [listId, node] of Object.entries(state.setlists || {})) {
      if (node && node.items && node.items[songId]) updates[`setlists/${listId}/items/${songId}`] = null;
    }
    for (const [rid, r] of Object.entries(state.rehearsals || {})) {
      if (r && r.songs && r.songs[songId]) updates[`rehearsals/${rid}/songs/${songId}`] = null;
    }
    write(updates);
    return Object.keys(updates).length;
  };

  // ---------- histórico do progresso ----------

  // Pontos [{day, v, t}] de um membro numa música, em ordem. Inclui o valor atual
  // (progresso anterior ao histórico entra na data em que foi salvo).
  const progressHistory = (songId, memberId) => {
    const days = (state.history && state.history[songId] && state.history[songId][memberId]) || {};
    const points = Object.entries(days)
      .filter(([, leaf]) => leaf && (typeof leaf.v === 'number' || leaf.v === 'na'))
      .map(([day, leaf]) => ({ day, v: leaf.v, t: leaf.t }));
    const cur = progress(songId, memberId);
    if (cur && typeof cur.t === 'number') {
      const day = U.dayKey(cur.t);
      if (!points.some((p) => p.day === day)) points.push({ day, v: cur.v, t: cur.t });
    }
    return points.sort((a, b) => a.day.localeCompare(b.day) || a.t - b.t);
  };

  // Linha do tempo de músicas prontas (>= limiar): uma série por membro e a da banda (mediana).
  // Devolve {days: [...], series: [{id, name, instrument, values: [...]}]} amostrado por dia.
  const readyTimeline = ({ from, to = U.dayKey(now()), threshold = 80, songIds = null } = {}) => {
    const events = []; // {day, songId, memberId, v}
    const ids = songIds || [...new Set([...Object.keys(state.progress || {}), ...Object.keys(state.history || {})])];
    const active = members();
    for (const songId of ids) {
      for (const m of active) {
        for (const p of progressHistory(songId, m.id)) events.push({ day: p.day, songId, memberId: m.id, v: p.v });
      }
    }
    events.sort((a, b) => a.day.localeCompare(b.day));
    const start = from || (events.length ? events[0].day : to);
    const days = U.dayRange(start, to);
    const values = {}; // songId → memberId → leaf
    const valueOf = (songId) => (memberId) => (values[songId] && values[songId][memberId]) || null;
    const series = [...active.map((m) => ({ id: m.id, name: m.name, instrument: m.instrument, values: [] })), { id: 'band', name: 'Banda (mediana)', values: [] }];
    const count = {};
    const bandReady = new Set();
    const ready = (songId, memberId) => {
      const leaf = valueOf(songId)(memberId);
      return !!(leaf && typeof leaf.v === 'number' && leaf.v >= threshold);
    };
    let i = 0;
    for (const day of days) {
      for (; i < events.length && events[i].day <= day; i++) {
        const e = events[i];
        const was = ready(e.songId, e.memberId);
        (values[e.songId] = values[e.songId] || {})[e.memberId] = { v: e.v };
        const is = ready(e.songId, e.memberId);
        if (was !== is) count[e.memberId] = (count[e.memberId] || 0) + (is ? 1 : -1);
        const med = medianFrom(e.songId, valueOf(e.songId));
        if (med != null && med >= threshold) bandReady.add(e.songId);
        else bandReady.delete(e.songId);
      }
      for (const s of series) s.values.push(s.id === 'band' ? bandReady.size : (count[s.id] || 0));
    }
    return { days, series };
  };

  // Última atividade na música: progresso de alguém ou ensaio em que ela entrou.
  const lastActivity = (songId) => {
    let t = 0;
    const perMember = (state.progress && state.progress[songId]) || {};
    for (const leaf of Object.values(perMember)) if (leaf && leaf.t > t) t = leaf.t;
    const r = lastRehearsal(songId);
    if (r) t = Math.max(t, U.dayStart(r.date));
    return t || null;
  };

  // Músicas paradas: do set list atual ou já começadas (e ainda não prontas), sem novidade há `days` dias.
  const staleSongs = ({ days = 21 } = {}) => {
    const limit = now() - days * 86400000;
    const ids = new Set(setlist().items.map((it) => it.id));
    for (const [songId, perMember] of Object.entries(state.progress || {})) {
      if (Object.values(perMember || {}).some((leaf) => leaf && typeof leaf.v === 'number' && leaf.v > 0)) ids.add(songId);
    }
    const out = [];
    for (const id of ids) {
      if (!SONGS()[id]) continue;
      const med = median(id);
      if (med != null && med >= 100) continue;
      const t = lastActivity(id);
      if (t == null || t < limit) out.push({ id, t, median: med, inSetlist: inSetlist(id) });
    }
    return out.sort((a, b) => (a.t || 0) - (b.t || 0));
  };

  // ---------- observações de cada músico ----------

  const NOTE_MAX = 500;

  const memberNote = (songId, memberId) => {
    const leaf = state.notes && state.notes[songId] && state.notes[songId][memberId];
    return leaf && typeof leaf.v === 'string' && leaf.v ? leaf : null;
  };

  // Observações da música, na ordem da formação (só de membros ativos).
  const songNotes = (songId) => members()
    .map((m) => ({ member: m, note: memberNote(songId, m.id) }))
    .filter((x) => x.note);

  const setNote = (songId, memberId, text) => {
    const path = `notes/${songId}/${memberId}`;
    const v = String(text == null ? '' : text).replace(/\s+$/, '').slice(0, NOTE_MAX);
    const current = memberNote(songId, memberId);
    if ((current ? current.v : '') === v) return;
    if (!v.trim()) return write({ [path]: null });
    const leaf = { v, t: now() };
    if (me()) leaf.by = me();
    write({ [path]: leaf });
  };

  // ---------- "quero tocar" ----------

  const wants = (songId, memberId) => !!(memberId && state.wants && state.wants[songId] && state.wants[songId][memberId]);

  const wanters = (songId) => members().filter((m) => wants(songId, m.id));

  const setWant = (songId, memberId, on) => {
    if (!memberId) return;
    write({ [`wants/${songId}/${memberId}`]: on ? { v: true, t: now() } : null });
  };

  // Prioridade de ensaio: proporção de quem quer (entre quem toca na música) somada ao quanto
  // ela já está pronta. "Todos querem e está 60%" fica na frente; música 100% pronta cai.
  const wantScore = (songId) => {
    const n = wanters(songId).length;
    if (!n) return 0;
    const players = applicableMembers(songId).length || members().length || 1;
    const med = median(songId) || 0;
    return Math.min(1, n / players) * 100 + (med >= 100 ? -60 : med * 0.6);
  };

  // ---------- set lists ----------

  const MAIN = 'main';
  const DEFAULT_GAP = 60; // segundos por troca de afinação

  const listNode = (listId) => (state.setlists && state.setlists[listId]) || null;

  const validItems = (node) => Object.entries((node && node.items) || {})
    .map(([id, it]) => ({ id, pos: it.pos, t: it.t }))
    .filter((it) => SONGS()[it.id])
    .sort((a, b) => a.pos - b.pos || a.id.localeCompare(b.id));

  const listInfo = (id, node = listNode(id) || {}) => ({
    id,
    name: node.name || '',
    kind: RH.SETLIST_KINDS[node.kind] ? node.kind : 'show',
    date: typeof node.date === 'string' ? node.date : '',
    played: node.played === true,
    limit: typeof node.limit === 'number' && node.limit > 0 ? node.limit : null,
    gap: typeof node.gap === 'number' ? node.gap : DEFAULT_GAP,
    created: typeof node.created === 'number' ? node.created : 0,
  });

  // Abertas primeiro (por data do show), depois os shows realizados (mais recente primeiro).
  const setlists = () => {
    const lists = Object.keys(state.setlists || {}).map((id) => ({ ...listInfo(id), count: validItems(listNode(id)).length }));
    if (!lists.some((l) => l.id === MAIN) && !lists.length) lists.push({ ...listInfo(MAIN, {}), count: 0 });
    const byDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.created - b.created || a.id.localeCompare(b.id);
    const open = lists.filter((l) => !l.played).sort(byDate);
    const played = lists.filter((l) => l.played).sort((a, b) => -byDate(a, b));
    return [...open, ...played];
  };

  const emitLocal = (patch) => emit({ songs: new Set(), members: false, setlist: false, rehearsals: false, any: true, ...patch }, 'local');

  // Lista escolhida neste aparelho (a do botão "+" do catálogo, da tela Set List e do Modo Palco).
  const currentSetlistId = () => {
    const saved = S.getRaw(keys.setlist);
    if (saved && listNode(saved)) return saved;
    const lists = setlists();
    const open = lists.find((l) => !l.played);
    return (open || lists[0]).id;
  };

  const selectSetlist = (listId) => {
    if (listId) S.setRaw(keys.setlist, listId);
    else S.remove(keys.setlist);
    emitLocal({ setlist: true });
  };

  const setlist = (listId = currentSetlistId()) => ({ ...listInfo(listId), items: validItems(listNode(listId)) });

  const inSetlist = (songId, listId = currentSetlistId()) => {
    const node = listNode(listId);
    return !!(node && node.items && node.items[songId]);
  };

  const addToSetlist = (songId, listId = currentSetlistId()) => {
    if (inSetlist(songId, listId)) return;
    const items = setlist(listId).items;
    const last = items.length ? items[items.length - 1].pos : null;
    const updates = { [`setlists/${listId}/items/${songId}`]: { pos: U.positionBetween(last, null), t: now() } };
    if (!listNode(listId) && listId !== MAIN) updates[`setlists/${listId}/created`] = now();
    write(updates);
  };

  const removeFromSetlist = (songId, listId = currentSetlistId()) => write({ [`setlists/${listId}/items/${songId}`]: null });

  const moveSetlistItem = (songId, toIndex, listId = currentSetlistId()) => {
    const items = setlist(listId).items.filter((it) => it.id !== songId);
    const index = U.clamp(toIndex, 0, items.length);
    const before = index > 0 ? items[index - 1].pos : null;
    const after = index < items.length ? items[index].pos : null;
    const t = now();
    if (U.needsRenormalize(before, after)) {
      items.splice(index, 0, { id: songId });
      return applyOrder(items.map((it) => it.id), listId);
    }
    write({ [`setlists/${listId}/items/${songId}`]: { pos: U.positionBetween(before, after), t } });
  };

  // Regrava a ordem inteira (1, 2, 3…).
  const applyOrder = (ids, listId = currentSetlistId()) => {
    const t = now();
    const updates = {};
    ids.forEach((id, i) => { updates[`setlists/${listId}/items/${id}`] = { pos: i + 1, t }; });
    write(updates);
  };

  const renameSetlist = (name, listId = currentSetlistId()) => write({ [`setlists/${listId}/name`]: String(name).slice(0, 80) });

  const LIST_FIELDS = {
    kind: (v) => (RH.SETLIST_KINDS[v] ? v : undefined),
    date: (v) => (v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined),
    played: (v) => (typeof v === 'boolean' ? v : undefined),
    limit: (v) => (Number.isFinite(v) && v >= 0 && v <= 600 ? Math.round(v) : undefined),
    gap: (v) => (Number.isFinite(v) && v >= 0 && v <= 600 ? Math.round(v) : undefined),
  };

  const setSetlistFields = (patch, listId = currentSetlistId()) => {
    const updates = {};
    for (const [field, raw] of Object.entries(patch)) {
      if (!LIST_FIELDS[field]) throw new Error(`campo inválido: ${field}`);
      if (raw == null || raw === '' || raw === false || (field === 'limit' && !raw)) {
        updates[`setlists/${listId}/${field}`] = null;
        continue;
      }
      const v = LIST_FIELDS[field](raw);
      if (v === undefined) throw new Error(`valor inválido para ${field}: ${raw}`);
      updates[`setlists/${listId}/${field}`] = v;
    }
    write(updates);
  };

  const createSetlist = ({ name = '', kind = 'show', date = '', copyFrom = null } = {}) => {
    const id = `sl-${U.randomId().slice(0, 10)}`;
    const t = now();
    const updates = {
      [`setlists/${id}/name`]: String(name).slice(0, 80),
      [`setlists/${id}/kind`]: RH.SETLIST_KINDS[kind] ? kind : 'show',
      [`setlists/${id}/created`]: t,
    };
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) updates[`setlists/${id}/date`] = date;
    if (copyFrom) {
      const src = setlist(copyFrom);
      src.items.forEach((it, i) => { updates[`setlists/${id}/items/${it.id}`] = { pos: i + 1, t }; });
      if (src.limit) updates[`setlists/${id}/limit`] = src.limit;
      if (listNode(copyFrom) && typeof listNode(copyFrom).gap === 'number') updates[`setlists/${id}/gap`] = src.gap;
    }
    write(updates);
    S.setRaw(keys.setlist, id);
    emitLocal({ setlist: true });
    return id;
  };

  const deleteSetlist = (listId) => {
    if (S.getRaw(keys.setlist) === listId) S.remove(keys.setlist);
    write({ [`setlists/${listId}`]: null });
  };

  // Trocas de afinação: compara com a última afinação conhecida (música sem afinação não esconde a troca).
  const tuningChanges = (items) => {
    const changes = [];
    let from = null;
    items.forEach((it, i) => {
      const to = tuning(it.id).code;
      if (!to) return;
      if (from && from !== to) changes.push({ index: i, from, to });
      from = to;
    });
    return changes;
  };

  // Agrupa as músicas pela afinação, sem mexer na primeira e na última. Dentro de cada grupo, a ordem
  // original fica. O grupo da afinação da abertura vem logo depois dela; o do encerramento, logo antes.
  // Música sem afinação conhecida acompanha a anterior. Devolve os ids na nova ordem.
  const optimizeOrder = (items) => {
    const ids = items.map((it) => it.id);
    if (ids.length < 4) return ids;
    const code = (id) => tuning(id).code;
    const first = ids[0];
    const last = ids[ids.length - 1];
    const groups = new Map();
    let prev = code(first);
    for (const id of ids.slice(1, -1)) {
      const c = code(id) || prev || '?';
      if (code(id)) prev = c;
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(id);
    }
    const startCode = code(first);
    const endCode = code(last);
    const step = (c) => RH.tuningInfo(c === '?' ? null : c).step;
    const dir = startCode && endCode && step(endCode) < step(startCode) ? -1 : 1;
    const seen = [...groups.keys()];
    const rank = (c) => (c === startCode ? 0 : c === endCode ? 2 : 1);
    const order = seen.slice().sort((a, b) => rank(a) - rank(b)
      || (a === '?') - (b === '?')
      || dir * (step(a) - step(b))
      || seen.indexOf(a) - seen.indexOf(b));
    return [first, ...order.flatMap((c) => groups.get(c)), last];
  };

  // Tempo do set: soma das durações + um tempo fixo por troca de afinação.
  const setlistTiming = (listId = currentSetlistId()) => {
    const list = setlist(listId);
    const changes = tuningChanges(list.items);
    const changeAt = new Set(changes.map((c) => c.index));
    let t = 0;
    let music = 0;
    let missing = 0;
    const starts = [];
    list.items.forEach((it, i) => {
      if (changeAt.has(i)) t += list.gap;
      starts.push(t);
      const d = duration(it.id).sec;
      if (d) { t += d; music += d; } else missing++;
    });
    const limit = list.limit ? list.limit * 60 : null;
    return { total: t, music, gap: list.gap, gaps: list.gap * changes.length, missing, starts, limit, left: limit == null ? null : limit - t };
  };

  const setlistSummary = (listId = currentSetlistId()) => {
    const items = setlist(listId).items;
    const withMedian = items.map((it) => ({ id: it.id, median: median(it.id) })).filter((x) => x.median != null);
    const overall = withMedian.length ? Math.round(U.median(withMedian.map((x) => x.median))) : null;
    const weakest = withMedian.length ? withMedian.reduce((a, b) => (b.median < a.median ? b : a)) : null;
    const parts = {};
    let songsWithGaps = 0;
    for (const it of items) {
      const gaps = uncovered(it.id);
      if (gaps.length) songsWithGaps++;
      for (const g of gaps) parts[g.key] = (parts[g.key] || 0) + 1;
    }
    return {
      count: items.length, overall, weakest, changes: tuningChanges(items), songsWithGaps, parts,
      timing: setlistTiming(listId),
      bpms: items.map((it) => bpm(it.id).val),
    };
  };

  // ---------- histórico de shows ----------

  const playedShows = () => setlists().filter((l) => l.played);

  const songPlays = (songId) => {
    const shows = playedShows().filter((l) => inSetlist(songId, l.id));
    return { count: shows.length, last: shows[0] || null, shows };
  };

  const mostPlayed = (limit = 10) => {
    const count = {};
    for (const l of playedShows()) for (const it of validItems(listNode(l.id))) count[it.id] = (count[it.id] || 0) + 1;
    return Object.entries(count).map(([id, n]) => ({ id, n }))
      .sort((a, b) => b.n - a.n || String(SONGS()[a.id].t).localeCompare(SONGS()[b.id].t))
      .slice(0, limit);
  };

  // ---------- diário de ensaio ----------

  const NOTE_REHEARSAL_MAX = 1000;

  const rehearsals = () => Object.entries(state.rehearsals || {})
    .filter(([, r]) => r && typeof r.date === 'string')
    .map(([id, r]) => ({ id, date: r.date, note: r.note || '', by: r.by || null, t: r.t || 0, songs: Object.keys(r.songs || {}).filter((s) => SONGS()[s]) }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.t - a.t);

  const saveRehearsal = ({ id, date, note = '', songs = [] }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Data do ensaio inválida');
    const rid = id || `r-${U.randomId().slice(0, 10)}`;
    const leaf = { date, t: now() };
    const text = String(note).trim().slice(0, NOTE_REHEARSAL_MAX);
    if (text) leaf.note = text;
    const map = {};
    for (const s of songs) if (SONGS()[s]) map[s] = true;
    if (Object.keys(map).length) leaf.songs = map;
    if (me()) leaf.by = me();
    write({ [`rehearsals/${rid}`]: leaf });
    return rid;
  };

  const deleteRehearsal = (id) => write({ [`rehearsals/${id}`]: null });

  const songRehearsals = (songId) => rehearsals().filter((r) => r.songs.includes(songId));

  const lastRehearsal = (songId) => songRehearsals(songId)[0] || null;

  // ---------- membro ativo (por aparelho) ----------

  const me = () => {
    const id = S.getRaw(keys.me);
    const m = id && state.members && state.members[id];
    return m && !m.archived ? id : null;
  };

  const setMe = (id) => { if (id) S.setRaw(keys.me, id); else S.remove(keys.me); };

  const saveMember = ({ id, name, instrument, order, archived }) => {
    const memberId = id || `m-${U.randomId().slice(0, 10)}`;
    const current = (state.members && state.members[memberId]) || {};
    const nextOrder = order ?? current.order ?? (Math.max(0, ...allMembers().map((m) => m.order || 0)) + 1);
    const leaf = {
      name: String(name ?? current.name ?? 'Membro').trim().slice(0, 40) || 'Membro',
      instrument: RH.MEMBER_INSTRUMENTS[instrument] ? instrument : (current.instrument || 'outro'),
      order: nextOrder,
      t: now(),
    };
    const isArchived = archived ?? current.archived;
    if (isArchived) leaf.archived = true;
    write({ [`members/${memberId}`]: leaf });
    return memberId;
  };

  const moveMember = (memberId, delta) => {
    const list = members();
    const from = list.findIndex((m) => m.id === memberId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    const t = now();
    const updates = {};
    list.forEach((m, i) => {
      const { id, ...rest } = m;
      updates[`members/${id}`] = { ...rest, order: i + 1, t };
    });
    write(updates);
  };

  // ---------- backup ----------

  const exportData = () => ({
    app: 'rocks-hero',
    format: 1,
    exportedAt: new Date().toISOString(),
    data: U.clone(state),
  });

  const validLeaf = {
    member: (m) => m && typeof m.name === 'string' && m.name.trim() && RH.MEMBER_INSTRUMENTS[m.instrument] && typeof m.order === 'number',
    progress: (p) => p && (p.v === 'na' || (typeof p.v === 'number' && p.v >= 0 && p.v <= 100)),
    item: (it) => it && typeof it.pos === 'number' && isFinite(it.pos),
    tun: (o) => o && typeof o.val === 'string' && o.val.length <= 60,
    ins: (o) => o && typeof o.val === 'string' && (o.val === '' || RH.parseIns(o.val)),
    note: (n) => n && typeof n.v === 'string' && n.v.trim() && n.v.length <= NOTE_MAX,
    dur: (o) => o && Number.isInteger(o.val) && o.val >= NUMBER_FIELDS.dur[0] && o.val <= NUMBER_FIELDS.dur[1],
    bpm: (o) => o && Number.isInteger(o.val) && o.val >= NUMBER_FIELDS.bpm[0] && o.val <= NUMBER_FIELDS.bpm[1],
    want: (w) => w && w.v === true,
    custom: (c) => c && typeof c.n === 'string' && c.n.trim() && typeof c.a === 'string' && c.a.trim(),
    day: (d) => d && (d.v === 'na' || (typeof d.v === 'number' && d.v >= 0 && d.v <= 100)),
    rehearsal: (r) => r && /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') && (r.note == null || (typeof r.note === 'string' && r.note.length <= NOTE_REHEARSAL_MAX)),
  };

  const importData = (file) => {
    if (!file || file.app !== 'rocks-hero' || !file.data) throw new Error('Este arquivo não é um backup do Rocks Hero.');
    const incoming = file.data;
    const limit = now();
    const updates = {};
    const memberIdOk = (id) => /^m-[a-z0-9-]+$/.test(id) && id.length <= 42;
    // As músicas da banda entram antes: sem elas, o progresso e os set lists delas seriam descartados.
    const customIn = new Set();
    const songOk = (id) => !!SONGS()[id] || customIn.has(id);
    const consider = (path, value, kind) => {
      if (!validLeaf[kind](value)) return;
      const t = typeof value.t === 'number' ? Math.min(value.t, limit) : 0;
      const current = U.getPath(state, path);
      if (current && typeof current.t === 'number' && current.t >= t) return;
      const clean = { ...U.clone(value), t };
      updates[path] = clean;
    };
    const customIdOk = (id) => new RegExp(`^${CUSTOM_PREFIX}[a-z0-9-]+$`).test(id) && id.length <= 120;
    for (const [id, c] of Object.entries(incoming.custom || {})) {
      if (!customIdOk(id) || !validLeaf.custom(c)) continue;
      const clean = { n: cleanText(c.n), a: cleanText(c.a), t: c.t };
      if (Number.isInteger(c.y) && c.y >= CUSTOM_YEAR[0] && c.y <= CUSTOM_YEAR[1]) clean.y = c.y;
      if (typeof c.by === 'string' && c.by.length <= 42) clean.by = c.by;
      consider(`custom/${id}`, clean, 'custom');
      if (updates[`custom/${id}`] || customSong(id)) customIn.add(id);
    }
    for (const [id, m] of Object.entries(incoming.members || {})) {
      if (!memberIdOk(id)) continue;
      const clean = { name: String(m.name).slice(0, 40), instrument: m.instrument, order: m.order, t: m.t };
      if (m.archived) clean.archived = true;
      consider(`members/${id}`, clean, 'member');
    }
    for (const [songId, perMember] of Object.entries(incoming.progress || {})) {
      if (!songOk(songId)) continue;
      for (const [memberId, leaf] of Object.entries(perMember || {})) {
        if (!memberIdOk(memberId) || !leaf) continue;
        const clean = { v: leaf.v, t: leaf.t };
        if (typeof leaf.by === 'string' && leaf.by.length <= 42) clean.by = leaf.by;
        consider(`progress/${songId}/${memberId}`, clean, 'progress');
      }
    }
    const byOk = (clean, leaf) => { if (typeof leaf.by === 'string' && leaf.by.length <= 42) clean.by = leaf.by; return clean; };
    for (const [listId, list] of Object.entries(incoming.setlists || {})) {
      if (!/^[a-z0-9-]+$/.test(listId) || listId.length > 40 || !list) continue;
      for (const [songId, it] of Object.entries(list.items || {})) {
        if (songOk(songId) && it) consider(`setlists/${listId}/items/${songId}`, { pos: it.pos, t: it.t }, 'item');
      }
      // Campos sem data de edição: só preenchem o que ainda não existe aqui.
      const here = listNode(listId) || {};
      if (typeof list.name === 'string' && list.name && !here.name) updates[`setlists/${listId}/name`] = list.name.slice(0, 80);
      if (typeof list.created === 'number' && here.created == null) updates[`setlists/${listId}/created`] = Math.min(list.created, limit);
      for (const field of Object.keys(LIST_FIELDS)) {
        if (list[field] == null || here[field] != null) continue;
        const v = LIST_FIELDS[field](list[field]);
        if (v !== undefined && v !== false) updates[`setlists/${listId}/${field}`] = v;
      }
    }
    for (const [songId, fields] of Object.entries(incoming.overrides || {})) {
      if (!songOk(songId) || !fields) continue;
      for (const field of ['tun', 'ins', 'dur', 'bpm']) {
        const o = fields[field];
        if (!o) continue;
        const clean = { val: o.val, t: o.t };
        if (typeof o.by === 'string' && o.by.length <= 42) clean.by = o.by;
        consider(`overrides/${songId}/${field}`, clean, field);
      }
    }
    for (const [songId, perMember] of Object.entries(incoming.notes || {})) {
      if (!songOk(songId)) continue;
      for (const [memberId, leaf] of Object.entries(perMember || {})) {
        if (!memberIdOk(memberId) || !leaf) continue;
        const clean = { v: leaf.v, t: leaf.t };
        if (typeof leaf.by === 'string' && leaf.by.length <= 42) clean.by = leaf.by;
        consider(`notes/${songId}/${memberId}`, clean, 'note');
      }
    }
    for (const [songId, perMember] of Object.entries(incoming.wants || {})) {
      if (!songOk(songId)) continue;
      for (const [memberId, leaf] of Object.entries(perMember || {})) {
        if (memberIdOk(memberId) && leaf) consider(`wants/${songId}/${memberId}`, { v: leaf.v, t: leaf.t }, 'want');
      }
    }
    for (const [songId, perMember] of Object.entries(incoming.history || {})) {
      if (!songOk(songId)) continue;
      for (const [memberId, perDay] of Object.entries(perMember || {})) {
        if (!memberIdOk(memberId)) continue;
        for (const [day, leaf] of Object.entries(perDay || {})) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(day) && leaf) consider(`history/${songId}/${memberId}/${day}`, { v: leaf.v, t: leaf.t }, 'day');
        }
      }
    }
    for (const [rid, r] of Object.entries(incoming.rehearsals || {})) {
      if (!/^r-[a-z0-9]+$/.test(rid) || rid.length > 42 || !r) continue;
      const clean = { date: r.date, t: r.t };
      if (typeof r.note === 'string' && r.note.trim()) clean.note = r.note;
      const songs = {};
      for (const songId of Object.keys(r.songs || {})) if (songOk(songId)) songs[songId] = true;
      if (Object.keys(songs).length) clean.songs = songs;
      consider(`rehearsals/${rid}`, byOk(clean, r), 'rehearsal');
    }
    write(updates);
    return Object.keys(updates).length;
  };

  // ---------- ciclo de vida ----------

  const start = () => {
    emit(rebuild(), 'cache');
    adapter.onStatus((s) => emitStatus({ connected: !!s.connected }));
    adapter.onAuth((user, err) => {
      if (err) emitStatus({ authKnown: true, error: { code: err.code || 'init-failed', detail: String(err.message || err) } });
      if (user) {
        S.setRaw(keys.hadSession, '1');
        emitStatus({ authenticated: true, authKnown: true, error: null });
        if (!unsubscribe) unsubscribe = adapter.subscribe(onRemote, onRemoteError);
      } else {
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        receivedServer = false;
        emitStatus({ authenticated: false, authKnown: true, synced: false });
      }
    });
  };

  const login = (password) => adapter.login(password);

  const logout = async () => {
    S.remove(keys.hadSession);
    await adapter.logout();
  };

  return {
    SESSION,
    adapter,
    get state() { return state; },
    get status() { return { ...status, pending: pendingCount() }; },
    hadSession: () => S.getRaw(keys.hadSession) === '1',
    hasServerData: () => receivedServer,
    onChange: (fn) => { changeListeners.add(fn); return () => changeListeners.delete(fn); },
    onStatus: (fn) => { statusListeners.add(fn); fn({ ...status, pending: pendingCount() }); return () => statusListeners.delete(fn); },
    now,
    start,
    login,
    logout,
    write,
    members,
    allMembers,
    me,
    setMe,
    saveMember,
    moveMember,
    tuning,
    instrumentation,
    note,
    progress,
    setProgress,
    setOverride,
    memberNote,
    songNotes,
    setNote,
    NOTE_MAX,
    applicableMembers,
    median,
    uncovered,
    duration,
    bpm,
    progressHistory,
    readyTimeline,
    lastActivity,
    staleSongs,
    wants,
    wanters,
    setWant,
    wantScore,
    isCustom,
    customSong,
    customSongs,
    findSongByName,
    saveCustomSong,
    deleteCustomSong,
    CUSTOM_TEXT_MAX,
    setlists,
    currentSetlistId,
    selectSetlist,
    setlist,
    inSetlist,
    addToSetlist,
    removeFromSetlist,
    moveSetlistItem,
    applyOrder,
    renameSetlist,
    setSetlistFields,
    createSetlist,
    deleteSetlist,
    tuningChanges,
    optimizeOrder,
    setlistTiming,
    setlistSummary,
    playedShows,
    songPlays,
    mostPlayed,
    rehearsals,
    saveRehearsal,
    deleteRehearsal,
    songRehearsals,
    lastRehearsal,
    NOTE_REHEARSAL_MAX,
    exportData,
    importData,
  };
};
