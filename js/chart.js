/* Gráfico de evolução no tempo (linhas em degrau), com dica ao passar o dedo/mouse, legenda,
   rótulo no fim de cada linha e tabela. Cores = cor do instrumento de cada membro (a mesma do avatar). */
window.RH = window.RH || {};

RH.chart = (() => {
  const esc = (s) => RH.util.escapeHtml(s);
  const U = RH.util;

  const niceMax = (v) => {
    if (v <= 4) return Math.max(1, v);
    const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500];
    for (const s of steps) if (v <= s) return s;
    return Math.ceil(v / 100) * 100;
  };

  const shortDay = (key) => U.formatDay(key, { day: '2-digit', month: '2-digit' });

  // data: {days: ['AAAA-MM-DD'...], series: [{id, name, instrument?, values: [...], band?}]}
  // opts: {unit: 'músicas', percent: false, height: 220, label}
  const timeline = (container, data, opts = {}) => {
    const { unit = '', percent = false, height = 220, label = 'Evolução' } = opts;
    const series = data.series.filter((s) => s.values.length);
    container.classList.add('chart');
    container.innerHTML = `
      <div class="chart-legend">${series.map((s) => `
        <span class="chart-key ${s.band ? 'is-band' : `inst-${esc(s.instrument || 'outro')}`}"><i></i>${esc(s.name)}</span>`).join('')}</div>
      <div class="chart-plot" role="img" aria-label="${esc(label)}"><svg></svg><div class="chart-tip" hidden></div></div>
      <details class="chart-table"><summary>Ver em tabela</summary><div class="chart-table-wrap"></div></details>`;
    const plot = container.querySelector('.chart-plot');
    const svg = plot.querySelector('svg');
    const tip = plot.querySelector('.chart-tip');
    const n = data.days.length;
    const max = percent ? 100 : niceMax(Math.max(1, ...series.flatMap((s) => s.values)));

    // Tabela: uma linha por semana (e o último dia), para não virar um paredão.
    const rows = [];
    for (let i = 0; i < n; i++) if (i === n - 1 || (n - 1 - i) % 7 === 0) rows.push(i);
    container.querySelector('.chart-table-wrap').innerHTML = `
      <table><thead><tr><th>Dia</th>${series.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr></thead>
      <tbody>${rows.reverse().map((i) => `<tr><td>${esc(shortDay(data.days[i]))}</td>${series.map((s) => `<td>${s.values[i]}${percent ? '%' : ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

    let geo = null;
    const draw = () => {
      const w = Math.max(260, Math.round(plot.clientWidth || 600));
      const pad = { l: 34, r: 96, t: 12, b: 26 };
      const iw = w - pad.l - pad.r;
      const ih = height - pad.t - pad.b;
      const x = (i) => pad.l + (n <= 1 ? iw : (i / (n - 1)) * iw);
      const y = (v) => pad.t + ih - (v / max) * ih;
      geo = { x, y, pad, iw, ih, w };
      const ticksY = [0, max / 2, max].map((v) => Math.round(v));
      const tickIdx = n <= 1 ? [0] : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
      const grid = ticksY.map((v) => `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}${percent ? '%' : ''}</text>`).join('');
      const xlabels = [...new Set(tickIdx)].map((i) => `<text x="${x(i)}" y="${height - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(shortDay(data.days[i]))}</text>`).join('');
      const pathOf = (vals) => {
        let d = `M${x(0).toFixed(1)} ${y(vals[0]).toFixed(1)}`;
        for (let i = 1; i < vals.length; i++) d += `H${x(i).toFixed(1)}V${y(vals[i]).toFixed(1)}`;
        return d;
      };
      // Rótulos no fim das linhas, afastados para não se sobrepor.
      const ends = series.map((s) => ({ s, y: y(s.values[n - 1]) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
      const labels = ends.map(({ s, y: ly }) => `
        <g class="${s.band ? 'is-band' : `inst-${esc(s.instrument || 'outro')}`}">
          <circle cx="${x(n - 1) + 8}" cy="${ly}" r="3.5"/>
          <text x="${x(n - 1) + 15}" y="${ly + 4}">${esc(s.name.length > 11 ? `${s.name.slice(0, 10)}…` : s.name)} ${s.values[n - 1]}</text>
        </g>`).join('');
      svg.setAttribute('viewBox', `0 0 ${w} ${height}`);
      svg.setAttribute('width', w);
      svg.setAttribute('height', height);
      svg.innerHTML = `
        <g class="chart-grid">${grid}</g>
        <g class="chart-x">${xlabels}</g>
        ${series.map((s) => `<path class="chart-line ${s.band ? 'is-band' : `inst-${esc(s.instrument || 'outro')}`}" d="${pathOf(s.values)}"/>`).join('')}
        <g class="chart-ends">${labels}</g>
        <line class="chart-cross" y1="${pad.t}" y2="${pad.t + ih}" visibility="hidden"/>
        <rect class="chart-hit" x="${pad.l}" y="0" width="${iw}" height="${height}"/>`;
    };

    const show = (clientX) => {
      if (!geo) return;
      const box = svg.getBoundingClientRect();
      const px = ((clientX - box.left) / box.width) * geo.w;
      const i = U.clamp(Math.round(((px - geo.pad.l) / geo.iw) * (n - 1)), 0, n - 1);
      const cx = geo.x(i);
      const cross = svg.querySelector('.chart-cross');
      cross.setAttribute('x1', cx);
      cross.setAttribute('x2', cx);
      cross.setAttribute('visibility', 'visible');
      const list = series.map((s) => ({ s, v: s.values[i] })).sort((a, b) => b.v - a.v);
      tip.innerHTML = `<b>${esc(U.formatDay(data.days[i]))}</b>${list.map(({ s, v }) => `
        <span class="${s.band ? 'is-band' : `inst-${esc(s.instrument || 'outro')}`}"><i></i>${esc(s.name)}<em>${v}${percent ? '%' : ''}${unit ? ` ${esc(unit)}` : ''}</em></span>`).join('')}`;
      tip.hidden = false;
      const left = (cx / geo.w) * box.width;
      tip.style.left = `${Math.min(Math.max(8, left + 12), box.width - tip.offsetWidth - 8)}px`;
    };
    const hide = () => {
      tip.hidden = true;
      const cross = svg.querySelector('.chart-cross');
      if (cross) cross.setAttribute('visibility', 'hidden');
    };
    plot.addEventListener('pointermove', (e) => show(e.clientX));
    plot.addEventListener('pointerdown', (e) => show(e.clientX));
    plot.addEventListener('pointerleave', hide);

    draw();
    let ro = null;
    if (window.ResizeObserver) {
      let lastW = plot.clientWidth;
      ro = new ResizeObserver(() => { if (Math.abs(plot.clientWidth - lastW) > 4) { lastW = plot.clientWidth; draw(); } });
      ro.observe(plot);
    }
    return { destroy: () => { if (ro) ro.disconnect(); } };
  };

  return { timeline };
})();
