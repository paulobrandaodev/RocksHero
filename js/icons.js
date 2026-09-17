/* Ícones: sprite SVG inline (funciona em file://) e máscaras CSS para listas longas. */
window.RH = window.RH || {};

RH.icons = (() => {
  // Instrumentos: silhuetas em viewBox 48×48 (preenchimento e traços em currentColor).
  const INSTRUMENTS = {
    guitar: `
      <g transform="rotate(42 24 24)">
        <path d="M20.6 1.5h6.8l1.2 8.2h-9.2z"/>
        <path d="M18.4 2.4h2v1.4h-2zM18.4 5.2h2v1.4h-2zM18.4 8h2v1.4h-2zM27.6 2.4h2v1.4h-2zM27.6 5.2h2v1.4h-2zM27.6 8h2v1.4h-2z"/>
        <path d="M22.2 9.2h3.6v17h-3.6z"/>
        <path fill-rule="evenodd" d="M20 24.5h8l9.2 21.2-5.2 1.2L24 35.3l-8 11.6-5.2-1.2zM21.4 28.6h5.2v2.6h-5.2zM21.6 33h4.8v1.6h-4.8z"/>
      </g>`,
    bass: `
      <g transform="rotate(42 24 24)">
        <path d="M22.6 .5h4.6l1.1 9.4h-5.9z"/>
        <path d="M18.6 1.6h4v1.6h-4zM18.6 4.1h4v1.6h-4zM18.6 6.6h4v1.6h-4zM18.6 9.1h4v1.6h-4z"/>
        <path d="M22.9 9.5h3.4v19.5h-3.4z"/>
        <path fill-rule="evenodd" d="M24.6 28.2c-2.6 0-4.1-1.9-6.2-1.2-2 .6-1.4 3.2-2.4 5.2-1.2 2.4-3.6 4.4-3.6 8 0 4.6 4.2 7.3 11.4 7.3s12-2.8 12-7.4c0-3.6-2.6-5.2-3.3-7.5-.6-2.1 1-4.9-1.1-5.7-2-.8-3.5 1.3-6.8 1.3zM19.8 33.6h7.6v2.2h-7.6zM20.6 40.8h8.4v1.8h-8.4z"/>
      </g>`,
    drums: `
      <path fill-rule="evenodd" d="M24 19.5a12.5 12.5 0 1 0 .01 0zM24 24.5a7.5 7.5 0 1 1-.01 0zM24 29.5a2.5 2.5 0 1 0 .01 0z"/>
      <path d="M16.5 11h15c.8 0 1.5.7 1.5 1.5v4.2c0 .8-.7 1.5-1.5 1.5h-15c-.8 0-1.5-.7-1.5-1.5v-4.2c0-.8.7-1.5 1.5-1.5z"/>
      <path d="M1.5 9.2l13-3 .5 2-13 3zM46.5 9.2l-13-3-.5 2 13 3z"/>
      <path d="M7.5 9.5h2v35h-2zM38.5 9.5h2v35h-2z"/>
      <path d="M3 44h11v2.5H3zM34 44h11v2.5H34z"/>`,
    keys: `
      <path fill-rule="evenodd" d="M4 13h40a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V16a3 3 0 0 1 3-3zM4.5 20.5v11h39v-11z"/>
      <path d="M8.3 20.5h3v6.2h-3zM14.6 20.5h3v6.2h-3zM23.8 20.5h3v6.2h-3zM30.1 20.5h3v6.2h-3zM36.4 20.5h3v6.2h-3z"/>
      <path d="M12.3 26.7h1.2v4.8h-1.2zM18.6 26.7h1.2v4.8h-1.2zM22.2 26.7h1.2v4.8h-1.2zM28.1 26.7h1.2v4.8h-1.2zM34.4 26.7h1.2v4.8h-1.2zM40.2 26.7h1.2v4.8h-1.2z"/>`,
    mic: `
      <circle cx="34" cy="14" r="10"/>
      <path d="M23.2 19.8l5 5-17.2 19.1c-1.4 1.5-3.7 1.6-5.2.1l-.4-.4c-1.5-1.5-1.4-3.8.1-5.2z"/>`,
    perc: `
      <path d="M3 14.5h19l-3.2 27H6.2z"/>
      <path d="M25 10.5h21l-3.8 32H28.8z"/>
      <path d="M2 11h21v3H2zM24 7h23v3H24z"/>`,
    horn: `
      <path fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M9 4.5c3 0 6.5 1.5 8.5 4.5v24c0 7 5 10.5 10 10.5s9.5-3.5 9.5-10v-3"/>
      <path d="M29.5 21.5c2.5-3 12.5-4 16.5-1-.5 5.5-7.5 9-15.5 6.5z"/>
      <circle cx="17.5" cy="15" r="2.6"/><circle cx="17.5" cy="22" r="2.6"/><circle cx="17.5" cy="29" r="2.6"/>
      <path d="M4 2.5h6v4.5H4z"/>`,
    violin: `
      <path fill-rule="evenodd" d="M27.4 13.9c3.4-1.1 7.4.6 8.4 4 .6 2.3-.3 4.4-2.1 5.9 2.6 1.6 4 4.8 3 8.2-1.3 4.5-6.9 7.3-12.5 5.6s-8.8-7-7.4-11.5c1-3.4 4-5.3 7.1-5.2-.6-2.3-.1-4.6 1.6-6 .5-.4 1.1-.8 1.9-1zM23.8 25.5a1 1 0 1 0 .01 0zM28.9 27a1 1 0 1 0 .01 0z"/>
      <path d="M30.6 18.2l2.3.7L41.2 3l-2.3-.7z"/>
      <path d="M39.6 1.2a3 3 0 1 1 4.6 3.8l-2 .5-2.5-1.4z"/>
      <path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M5 42.5L45.5 11"/>`,
    harmonica: `
      <path fill-rule="evenodd" d="M4 16h40a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V19a3 3 0 0 1 3-3zM5 23v3h4v-3zM12 23v3h4v-3zM19 23v3h4v-3zM26 23v3h4v-3zM33 23v3h4v-3zM40 23v3h3v-3z"/>`,
    turntable: `
      <path fill-rule="evenodd" d="M6 6h36a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4zM20 10a14 14 0 1 0 .01 0zM20 21.5a2.5 2.5 0 1 0 .01 0z"/>
      <path d="M40.5 10.5h3v17.8l-8.2 7.2-2-2.2 7.2-6.3z"/>`,
    star: `<path d="M24 2.5l6.6 13.8 15.1 1.9-11.1 10.5 2.8 15-13.4-7.3-13.4 7.3 2.8-15L2.3 18.2l15.1-1.9z"/>`,
  };

  // Interface: traços em viewBox 24×24.
  const UI = {
    grip: '<circle cx="9" cy="6" r="1.6" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.6" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.6" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.6" fill="currentColor" stroke="none"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="M4.5 12.5l5 5 10-11"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M9 12h10"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6"/><circle cx="17" cy="9" r="2.8"/><path d="M16.5 14c3 0 4.8 1.8 5.2 5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6-1.3A4.7 4.7 0 0 0 7 18z"/>',
    cloudOff: '<path d="M3 3l18 18M9 5.3A5.5 5.5 0 0 1 17.5 10a4 4 0 0 1 2.9 6.5M17 18H7a4.7 4.7 0 0 1-2.2-8.9"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.2"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M4 4h16"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.2"/>',
    wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3z"/><path d="M14.5 6.5L17 4l3 3-2.5 2.5"/>',
    sort: '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"/>',
    flame: '<path d="M12 21c-4 0-7-2.7-7-6.5 0-3.3 2.3-5 3.5-7.5.8 1.8 2 2.8 3 3-.2-3 1-5.8 3.5-7 0 3.5 4 6 4 10.8C19 18.3 16 21 12 21z"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4"/>',
  };

  const toDataUri = (body) =>
    `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'>${body.replace(/"/g, "'")}</svg>`)}")`;

  let installed = false;

  const install = () => {
    if (installed) return;
    installed = true;
    const symbols = [
      ...Object.entries(INSTRUMENTS).map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 48 48">${body}</symbol>`),
      ...Object.entries(UI).map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`),
    ].join('');
    document.body.insertAdjacentHTML('afterbegin', `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${symbols}</svg>`);

    const css = Object.entries(INSTRUMENTS)
      .map(([name, body]) => `.mi-${name}{-webkit-mask-image:${toDataUri(body)};mask-image:${toDataUri(body)}}`)
      .join('\n');
    const style = document.createElement('style');
    style.id = 'rh-icon-masks';
    style.textContent = css;
    document.head.appendChild(style);
  };

  // Ícone inline (<use>): herda a cor do texto.
  const svg = (name, cls = '') =>
    `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

  // Ícone leve para listas longas: <span> com máscara CSS.
  const mask = (name, cls = '') => `<span class="mi mi-${name} ${cls}" aria-hidden="true"></span>`;

  return { INSTRUMENTS, UI, install, svg, mask };
})();
