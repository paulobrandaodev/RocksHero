/* Tela de login: senha única da banda. */
window.RH = window.RH || {};

RH.login = (() => {
  const ui = RH.ui;
  let el = null;

  const messages = {
    'wrong-password': 'Senha errada! A plateia vaiou…',
    'auth/wrong-password': 'Senha errada! A plateia vaiou…',
    'auth/invalid-credential': 'Senha errada! A plateia vaiou…',
    'auth/invalid-login-credentials': 'Senha errada! A plateia vaiou…',
    'auth/user-not-found': 'A conta da banda não existe no Firebase (veja o README).',
    'auth/too-many-requests': 'Muitas tentativas erradas. O Firebase bloqueou o login por alguns minutos, para todo mundo (a conta é da banda).',
    'auth/network-request-failed': 'Sem internet. O primeiro acesso em cada aparelho precisa de conexão.',
    'auth/user-disabled': 'A conta da banda está desativada no Firebase.',
    'auth/operation-not-allowed': 'O login por e-mail/senha não está ativado no Firebase.',
    'auth/invalid-api-key': 'A apiKey do Firebase está errada em js/firebase-config.js.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'A apiKey do Firebase está errada em js/firebase-config.js.',
    'sdk-load-failed': 'Não deu para carregar o Firebase. Confira a internet e tente de novo.',
  };

  const messageFor = (code) => messages[code] || `Não deu para entrar (${code}).`;

  const highwayNotes = () => {
    const colors = ['var(--gem-green)', 'var(--gem-red)', 'var(--gem-yellow)', 'var(--gem-blue)', 'var(--gem-orange)'];
    const lanes = [10, 30, 50, 70, 90];
    return Array.from({ length: 14 }, (_, i) => {
      const lane = (i * 7 + (i % 3)) % 5;
      const delay = -(i * 0.57).toFixed(2);
      return `<span class="note" style="left:${lanes[lane]}%;--c:${colors[lane]};animation-delay:${delay}s"></span>`;
    }).join('');
  };

  const setMeter = (pct) => {
    const needle = el && el.querySelector('.login-meter .needle');
    if (needle) needle.style.transform = `rotate(${(pct * 1.8).toFixed(1)}deg)`;
  };

  const show = ({ reason } = {}) => {
    if (!el) {
      el = document.createElement('section');
      el.className = 'login';
      el.setAttribute('aria-label', 'Entrar');
      const settings = RH.settings || {};
      const modeNote = settings.mode === 'local'
        ? 'Modo local: os dados ficam só neste navegador. Configure o Firebase para sincronizar a banda.'
        : settings.emulator ? 'Conectado ao emulador do Firebase (teste).' : '';
      el.innerHTML = `
        <div class="highway" aria-hidden="true"><div class="highway-board">${highwayNotes()}</div></div>
        <div class="crowd" aria-hidden="true"></div>
        <div class="login-box">
          <img class="login-logo" src="assets/logo/rocks-hero.svg" alt="Rocks Hero" width="420" height="269">
          <form class="login-plate panel panel-rivets" novalidate>
            <label for="login-password">Senha da banda</label>
            <input class="visually-hidden" type="text" name="username" autocomplete="username" value="${ui.esc((RH.FIREBASE && RH.FIREBASE.bandEmail) || 'rockshero')}" tabindex="-1" aria-hidden="true">
            <input id="login-password" class="input" type="password" name="password" autocomplete="current-password" required enterkeyhint="go">
            <button type="submit" class="btn btn-fire">Rock!</button>
            <p class="login-msg" role="alert"></p>
            <div class="login-meter">${ui.rockMeter(50, { label: 'Rock meter' })}</div>
          </form>
          ${modeNote ? `<p class="login-note">${ui.esc(modeNote)}</p>` : ''}
        </div>`;
      el.querySelector('.login-meter text').remove();
      el.querySelector('form').addEventListener('submit', onSubmit);
      document.body.appendChild(el);
    }
    el.hidden = false;
    el.classList.remove('is-failed');
    const msg = el.querySelector('.login-msg');
    msg.className = 'login-msg';
    msg.textContent = reason === 'expired' ? 'Sua sessão expirou. Entre de novo.' : '';
    setMeter(50);
    setTimeout(() => { const input = el && el.querySelector('#login-password'); if (input) input.focus(); }, 50);
  };

  const hide = () => {
    if (el) el.hidden = true;
  };

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const input = form.password;
    const button = form.querySelector('button');
    const msg = form.querySelector('.login-msg');
    if (!input.value) {
      input.focus();
      return;
    }
    button.disabled = true;
    msg.className = 'login-msg';
    msg.textContent = 'Afinando…';
    el.classList.remove('is-failed');
    const result = await RH.store.login(input.value);
    button.disabled = false;
    if (result.ok) {
      setMeter(100);
      msg.textContent = '';
      input.value = '';
      const flash = document.createElement('div');
      flash.className = 'you-rock';
      flash.innerHTML = '<span class="fire-text">YOU ROCK!</span>';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 950);
      return;
    }
    setMeter(4);
    void el.offsetWidth;
    el.classList.add('is-failed');
    msg.className = 'login-msg is-error';
    msg.textContent = messageFor(result.error);
    input.select();
  }

  return { show, hide, messageFor };
})();
