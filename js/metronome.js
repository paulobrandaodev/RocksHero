/* Metrônomo simples (Web Audio, com agendamento adiantado para não atrasar) e seu controle na tela.
   Só um toca por vez: abrir outro para o anterior. */
window.RH = window.RH || {};

RH.metronome = (() => {
  const U = RH.util;
  const BEATS_KEY = 'rh:v1:ui:metro-beats';
  let ctx = null;
  let active = null; // controle que está tocando

  const audio = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  const click = (ac, time, accent) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.frequency.value = accent ? 1760 : 1100;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.55, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(gain).connect(ac.destination);
    osc.start(time);
    osc.stop(time + 0.07);
  };

  // Controle montado em `el`. `bpm` inicial vem da música (ou 120).
  const mount = (el, { bpm = null } = {}) => {
    let tempo = U.clamp(Math.round(bpm || 120), 30, 300);
    let beats = Number(RH.safeStorage.getRaw(BEATS_KEY)) || 4;
    let running = false;
    let timer = null;
    let next = 0;
    let beat = 0;
    const taps = [];

    el.classList.add('metro');
    el.innerHTML = `
      <button type="button" class="btn btn-icon metro-play" data-m-play aria-label="Ligar o metrônomo"></button>
      <div class="metro-tempo">
        <button type="button" class="btn btn-icon btn-sm" data-m-step="-1" aria-label="Menos 1 BPM">${RH.icons.svg('minus')}</button>
        <label><span class="visually-hidden">BPM</span><input class="input metro-bpm" type="number" inputmode="numeric" min="30" max="300" data-m-bpm></label>
        <button type="button" class="btn btn-icon btn-sm" data-m-step="1" aria-label="Mais 1 BPM">${RH.icons.svg('plus')}</button>
        <span class="metro-unit">BPM</span>
      </div>
      <div class="metro-dots" data-m-dots aria-hidden="true"></div>
      <div class="seg metro-beats" role="group" aria-label="Tempos por compasso">
        ${[2, 3, 4, 6].map((n) => `<button type="button" data-m-beats="${n}">${n}/4</button>`).join('')}
      </div>
      <button type="button" class="btn btn-sm btn-ghost" data-m-tap title="Toque no ritmo para achar o BPM">Tap</button>
      ${bpm ? '' : '<p class="metro-hint">Sem BPM cadastrado: começando em 120. Dá para corrigir o BPM em “Corrigir dados”.</p>'}`;
    const input = el.querySelector('[data-m-bpm]');
    const dots = el.querySelector('[data-m-dots]');

    const paint = () => {
      input.value = String(tempo);
      const play = el.querySelector('[data-m-play]');
      play.innerHTML = RH.icons.svg(running ? 'pause' : 'play');
      play.setAttribute('aria-pressed', String(running));
      play.setAttribute('aria-label', running ? 'Parar o metrônomo' : 'Ligar o metrônomo');
      el.classList.toggle('is-running', running);
      dots.innerHTML = Array.from({ length: beats }, (_, i) => `<i class="${i === 0 ? 'is-accent' : ''}"></i>`).join('');
      el.querySelectorAll('[data-m-beats]').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.mBeats) === beats));
    };

    const flash = (i, delayMs) => {
      setTimeout(() => {
        if (!running) return;
        dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('is-on', k === i));
      }, Math.max(0, delayMs));
    };

    const schedule = () => {
      const ac = audio();
      while (next < ac.currentTime + 0.12) {
        const i = beat % beats;
        click(ac, next, i === 0);
        flash(i, (next - ac.currentTime) * 1000);
        next += 60 / tempo;
        beat++;
      }
    };

    const start = () => {
      const ac = audio();
      if (!ac) return RH.ui.toast('Este navegador não toca som pelo app', { kind: 'error' });
      if (active && active !== api) active.stop();
      active = api;
      running = true;
      beat = 0;
      next = ac.currentTime + 0.06;
      schedule();
      timer = setInterval(schedule, 25);
      paint();
    };

    const stop = () => {
      running = false;
      clearInterval(timer);
      timer = null;
      if (active === api) active = null;
      dots.querySelectorAll('i').forEach((d) => d.classList.remove('is-on'));
      paint();
    };

    const setTempo = (v) => {
      if (!Number.isFinite(v)) return;
      tempo = U.clamp(Math.round(v), 30, 300);
      paint();
    };

    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-m-play]')) return (running ? stop() : start());
      const s = e.target.closest('[data-m-step]');
      if (s) return setTempo(tempo + Number(s.dataset.mStep));
      const b = e.target.closest('[data-m-beats]');
      if (b) {
        beats = Number(b.dataset.mBeats);
        RH.safeStorage.setRaw(BEATS_KEY, String(beats));
        beat = 0;
        return paint();
      }
      if (e.target.closest('[data-m-tap]')) {
        const now = performance.now();
        if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
        taps.push(now);
        if (taps.length > 6) taps.shift();
        if (taps.length >= 3) setTempo(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
      }
    });
    input.addEventListener('change', () => setTempo(Number(input.value)));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });

    const api = { start, stop, setTempo, isRunning: () => running, destroy: stop };
    paint();
    return api;
  };

  const stopAll = () => { if (active) active.stop(); };

  return { mount, stopAll };
})();
