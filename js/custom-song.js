/* Cadastro das músicas que não são do Guitar Hero: artista, nome e ano. */
window.RH = window.RH || {};

RH.customSong = (() => {
  const ui = RH.ui;
  const esc = ui.esc;

  const store = () => RH.store;

  const formHtml = (song) => `
    <form class="edit-grid" data-custom-form>
      <label class="field">
        <span>Artista ou banda</span>
        <input class="input" name="artist" maxlength="${store().CUSTOM_TEXT_MAX}" required autocomplete="off"
          placeholder="ex.: Legião Urbana" value="${esc(song ? song.a : '')}">
      </label>
      <label class="field">
        <span>Nome da música</span>
        <input class="input" name="title" maxlength="${store().CUSTOM_TEXT_MAX}" required autocomplete="off"
          placeholder="ex.: Tempo Perdido" value="${esc(song ? song.n : '')}">
      </label>
      <label class="field">
        <span>Ano <span class="faint">(opcional)</span></span>
        <input class="input" name="year" type="number" inputmode="numeric" min="1900" max="2100"
          placeholder="ex.: 1986" value="${song && song.y ? song.y : ''}">
      </label>
      <p class="dim small">Afinação, instrumentação, duração e BPM você preenche no painel da música, como nas dos jogos.</p>
      <div class="edit-actions">
        <button type="submit" class="btn btn-fire">${RH.icons.svg('check')} ${song ? 'Salvar' : 'Adicionar'}</button>
        <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
      </div>
    </form>`;

  // `id` presente = edição; ausente = cadastro novo.
  const open = ({ id = null, onSaved } = {}) => {
    const s = store();
    const song = id ? s.customSong(id) : null;
    if (id && !song) return ui.toast('Essa música não é da banda', { kind: 'error' });
    const sheet = ui.sheet({
      className: 'custom-song-sheet',
      title: song ? 'Editar música da banda' : 'Nova música',
      subtitle: song ? 'Vale para a banda toda.' : 'Para tocar o que não está no catálogo do Guitar Hero.',
      body: formHtml(song),
    });
    const form = ui.$('[data-custom-form]', sheet.body);

    const submit = async (e) => {
      e.preventDefault();
      const title = form.title.value;
      const artist = form.artist.value;
      const year = form.year.value.trim();
      if (!artist.trim()) return form.artist.focus();
      if (!title.trim()) return form.title.focus();
      if (year && !(Number(year) >= 1900 && Number(year) <= 2100)) {
        ui.toast('Ano entre 1900 e 2100', { kind: 'error' });
        return form.year.focus();
      }
      const dup = s.findSongByName(title, artist);
      if (dup && dup !== id) {
        const other = RH.SONGS[dup];
        const go = await ui.confirm(
          `“${other.t}”, de ${other.a}, já está no catálogo${s.isCustom(dup) ? ' (cadastrada pela banda)' : ''}. Cancelar volta para o formulário.`,
          { title: 'Essa música já existe', okLabel: 'Abrir a que existe' },
        );
        if (!go) return form.title.focus();
        sheet.close();
        RH.songSheet.open(dup);
        return;
      }
      let songId;
      try {
        songId = s.saveCustomSong({ id, title, artist, year });
      } catch (err) {
        return ui.toast(err.message || 'Não deu para salvar', { kind: 'error' });
      }
      sheet.close();
      if (id) {
        ui.toast('Música atualizada', { kind: 'ok' });
      } else {
        ui.toast(`“${title.trim()}” entrou no catálogo da banda!`, { kind: 'rock' });
        RH.songSheet.open(songId);
      }
      if (onSaved) onSaved(songId);
    };

    form.addEventListener('submit', submit);
    const first = ui.$('input[name="artist"]', form);
    setTimeout(() => first && first.focus({ preventScroll: true }), 120);
    return sheet;
  };

  const remove = async (id, { onDone } = {}) => {
    const s = store();
    const song = s.customSong(id);
    if (!song) return;
    const ok = await ui.confirm(
      `Apagar “${song.n}” para a banda toda? Some também o progresso, as observações e o lugar dela nos set lists e ensaios.`,
      { title: 'Apagar música', okLabel: 'Apagar', danger: true },
    );
    if (!ok) return;
    s.deleteCustomSong(id);
    ui.toast(`“${song.n}” foi apagada`);
    if (onDone) onDone();
  };

  return { open, remove };
})();
