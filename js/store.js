/* Estado do app (local-first), cálculos da banda e escrita sincronizada.

   Estrutura (espelha /rockshero no Realtime Database):
     members/{memberId}:           {name, instrument, order, archived?, t}
     progress/{songId}/{memberId}: {v: 0..100 | "na", t, by}
     setlists/main/name:           string
     setlists/main/items/{songId}: {pos, t}
     overrides/{songId}/{tun|ins}: {val, t, by}
     notes/{songId}/{memberId}:    {v: texto, t, by}   (observação de cada músico)

   `remote` é a última cópia conhecida do servidor (também guardada em cache).
   `journal` guarda edições ainda não confirmadas, sobrevive a recarregar a página
   e é aplicado por cima de `remote` para formar `state`. */
window.RH = window.RH || {};

RH.createStore = (adapter, options = {}) => {
  const U = RH.util;
  const S = RH.safeStorage;
  const SONGS = () => RH.SONGS || {};
  const META = () => RH.META || {};
  const SESSION = options.session || U.randomId();
  const clock = options.clock || Date.now;
  const keys = {
    cache: `${adapter.scope}:cache`,
    journal: `${adapter.scope}:journal`,
    offset: `${adapter.scope}:offset`,
    me: `${adapter.scope}:me`,
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
    for (const branch of ['progress', 'overrides', 'notes']) {
      const a = prev[branch] || {};
      const b = next[branch] || {};
      for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!same(a[id], b[id])) songs.add(id);
      }
    }
    const members = !same(prev.members, next.members);
    const setlist = !same(prev.setlists, next.setlists);
    return { songs, members, setlist, any: members || setlist || songs.size > 0 };
  };

  const rebuild = () => {
    const next = U.clone(remote) || {};
    for (const [path, entry] of Object.entries(journal)) U.setPath(next, path, U.clone(entry.value));
    const changes = diff(state, next);
    state = next;
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

  const progress = (songId, memberId) => {
    const leaf = state.progress && state.progress[songId] && state.progress[songId][memberId];
    return leaf || null;
  };

  const applicableMembers = (songId) => {
    const counts = instrumentation(songId).counts;
    return members().filter((m) => {
      const leaf = progress(songId, m.id);
      if (leaf && leaf.v === 'na') return false;
      if (leaf && typeof leaf.v === 'number') return true;
      if (!counts) return true;
      const part = memberPart(m);
      return part ? counts[part] > 0 : true;
    });
  };

  const median = (songId) => {
    const list = applicableMembers(songId);
    if (!list.length) return null;
    const values = list.map((m) => {
      const leaf = progress(songId, m.id);
      return leaf && typeof leaf.v === 'number' ? leaf.v : 0;
    });
    return Math.round(U.median(values));
  };

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

  const setProgress = (songId, memberId, value) => {
    const path = `progress/${songId}/${memberId}`;
    if (value == null) return write({ [path]: null });
    const v = value === 'na' ? 'na' : U.clamp(Math.round(Number(value)), 0, 100);
    write({ [path]: { v, t: now(), by: me() || memberId } });
  };

  const setOverride = (songId, field, val) => {
    if (field !== 'tun' && field !== 'ins') throw new Error(`campo inválido: ${field}`);
    const path = `overrides/${songId}/${field}`;
    if (val === undefined) return write({ [path]: null });
    const leaf = { val: val == null ? '' : String(val), t: now() };
    if (me()) leaf.by = me();
    write({ [path]: leaf });
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

  // ---------- set list ----------

  const setlist = () => {
    const main = (state.setlists && state.setlists.main) || {};
    const items = Object.entries(main.items || {})
      .map(([id, it]) => ({ id, pos: it.pos, t: it.t }))
      .filter((it) => SONGS()[it.id])
      .sort((a, b) => a.pos - b.pos || a.id.localeCompare(b.id));
    return { name: main.name || '', items };
  };

  const inSetlist = (songId) => !!(state.setlists && state.setlists.main && state.setlists.main.items && state.setlists.main.items[songId]);

  const addToSetlist = (songId) => {
    if (inSetlist(songId)) return;
    const items = setlist().items;
    const last = items.length ? items[items.length - 1].pos : null;
    write({ [`setlists/main/items/${songId}`]: { pos: U.positionBetween(last, null), t: now() } });
  };

  const removeFromSetlist = (songId) => write({ [`setlists/main/items/${songId}`]: null });

  const moveSetlistItem = (songId, toIndex) => {
    const items = setlist().items.filter((it) => it.id !== songId);
    const index = U.clamp(toIndex, 0, items.length);
    const before = index > 0 ? items[index - 1].pos : null;
    const after = index < items.length ? items[index].pos : null;
    const t = now();
    if (U.needsRenormalize(before, after)) {
      items.splice(index, 0, { id: songId });
      const updates = {};
      items.forEach((it, i) => { updates[`setlists/main/items/${it.id}`] = { pos: i + 1, t }; });
      return write(updates);
    }
    write({ [`setlists/main/items/${songId}`]: { pos: U.positionBetween(before, after), t } });
  };

  const renameSetlist = (name) => write({ 'setlists/main/name': String(name).slice(0, 80) });

  const tuningChanges = (items) => {
    const changes = [];
    for (let i = 1; i < items.length; i++) {
      const from = tuning(items[i - 1].id).code;
      const to = tuning(items[i].id).code;
      if (from && to && from !== to) changes.push({ index: i, from, to });
    }
    return changes;
  };

  const setlistSummary = () => {
    const items = setlist().items;
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
    return { count: items.length, overall, weakest, changes: tuningChanges(items), songsWithGaps, parts };
  };

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
  };

  const importData = (file) => {
    if (!file || file.app !== 'rocks-hero' || !file.data) throw new Error('Este arquivo não é um backup do Rocks Hero.');
    const incoming = file.data;
    const limit = now();
    const updates = {};
    const memberIdOk = (id) => /^m-[a-z0-9-]+$/.test(id) && id.length <= 42;
    const songOk = (id) => !!SONGS()[id];
    const consider = (path, value, kind) => {
      if (!validLeaf[kind](value)) return;
      const t = typeof value.t === 'number' ? Math.min(value.t, limit) : 0;
      const current = U.getPath(state, path);
      if (current && typeof current.t === 'number' && current.t >= t) return;
      const clean = { ...U.clone(value), t };
      updates[path] = clean;
    };
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
    const main = (incoming.setlists && incoming.setlists.main) || {};
    for (const [songId, it] of Object.entries(main.items || {})) {
      if (songOk(songId) && it) consider(`setlists/main/items/${songId}`, { pos: it.pos, t: it.t }, 'item');
    }
    if (typeof main.name === 'string' && main.name && !setlist().name) updates['setlists/main/name'] = main.name.slice(0, 80);
    for (const [songId, fields] of Object.entries(incoming.overrides || {})) {
      if (!songOk(songId) || !fields) continue;
      for (const field of ['tun', 'ins']) {
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
    setlist,
    inSetlist,
    addToSetlist,
    removeFromSetlist,
    moveSetlistItem,
    renameSetlist,
    tuningChanges,
    setlistSummary,
    exportData,
    importData,
  };
};
