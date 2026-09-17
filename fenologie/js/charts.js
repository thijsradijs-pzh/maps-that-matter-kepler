// charts.js — vier SVG-grafieken, geen chartbibliotheek.
// Alles tekent in de viewBox-coordinaten van de <svg> in index.html.

(function (global) {
  'use strict';

  var C = global.FENO_CONFIG.colors;
  var NS = 'http://www.w3.org/2000/svg';
  var MONTHS = ['j', 'f', 'm', 'a', 'm', 'j', 'j', 'a', 's', 'o', 'n', 'd'];
  var MONTH_DOY = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

  function el(name, attrs) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    return e;
  }
  function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }
  function nl(v, d) {
    if (v === null || v === undefined || isNaN(v)) return '–';
    // Nederlandse notatie: decimale komma en een echt minteken (U+2212),
    // niet het ASCII-koppelteken dat toFixed() teruggeeft.
    return v.toFixed(d === undefined ? 3 : d)
            .replace('.', ',')
            .replace(/^-/, '−');
  }
  function extent(values, padFrac) {
    var lo = Infinity, hi = -Infinity;
    values.forEach(function (v) {
      if (v === null || isNaN(v)) return;
      if (v < lo) lo = v; if (v > hi) hi = v;
    });
    if (!isFinite(lo)) return [0, 1];
    var pad = (hi - lo) * (padFrac || 0.08) || 0.05;
    return [lo - pad, hi + pad];
  }
  function yAxis(svg, x, y0, y1, lo, hi, width, ticks, digits) {
    var n = ticks || 4;
    for (var i = 0; i <= n; i++) {
      var v = lo + (hi - lo) * i / n;
      var yy = y1 - (v - lo) / (hi - lo) * (y1 - y0);
      svg.appendChild(el('line', { x1: x, x2: x + width, y1: yy, y2: yy, class: 'gridline' }));
      var t = el('text', { x: x - 6, y: yy + 3.2, 'text-anchor': 'end', class: 'axlabel' });
      t.textContent = nl(v, digits === undefined ? 2 : digits);
      svg.appendChild(t);
    }
  }
  function caption(svg, x, y, text) {
    var t = el('text', { x: x, y: y, class: 'axlabel' });
    t.textContent = text;
    svg.appendChild(t);
  }

  /* ── 1. tijdreeks + z-anomalie ──────────────────────────── */
  function timeseries(svg, tip, series, indexName, ingrepen) {
    clear(svg);
    var obs = series.obs;
    if (obs.length < 5) return;
    var W = 640, L = 44, R = 10, T = 14, topH = 168, gap = 26, botH = 60;
    var pw = W - L - R;
    var t0 = obs[0].date.getTime(), t1 = obs[obs.length - 1].date.getTime();
    var X = function (ms) { return L + (ms - t0) / (t1 - t0) * pw; };
    var ex = extent(obs.map(function (o) { return o.value; }), 0.07);
    var Y = function (v) { return T + topH - (v - ex[0]) / (ex[1] - ex[0]) * topH; };

    yAxis(svg, L, T, T + topH, ex[0], ex[1], pw, 4);

    for (var y = obs[0].date.getUTCFullYear(); y <= obs[obs.length - 1].date.getUTCFullYear() + 1; y++) {
      var xx = X(Date.UTC(y, 0, 1));
      if (xx < L - 1 || xx > L + pw + 1) continue;
      svg.appendChild(el('line', { x1: xx, x2: xx, y1: T, y2: T + topH + gap + botH,
        stroke: C.line, 'stroke-width': 1 }));
      var lt = el('text', { x: xx + 4, y: T + topH + gap + botH + 14, class: 'axlabel' });
      lt.textContent = String(y);
      svg.appendChild(lt);
    }

    var up = '', dn = '', cv = '', i;
    var withBase = obs.filter(function (o) { return o.baseline !== null && o.sd !== null; });
    withBase.forEach(function (o, k) {
      var x = X(o.date.getTime());
      up += (k ? 'L' : 'M') + x.toFixed(1) + ' ' + Y(o.baseline + o.sd).toFixed(1);
      cv += (k ? 'L' : 'M') + x.toFixed(1) + ' ' + Y(o.baseline).toFixed(1);
    });
    for (i = withBase.length - 1; i >= 0; i--) {
      dn += 'L' + X(withBase[i].date.getTime()).toFixed(1) + ' '
          + Y(withBase[i].baseline - withBase[i].sd).toFixed(1);
    }
    if (up) {
      svg.appendChild(el('path', { d: up + dn + 'Z', fill: C.accentSoft, stroke: 'none' }));
      svg.appendChild(el('path', { d: cv, fill: 'none', stroke: C.accent,
        'stroke-width': 1.2, 'stroke-opacity': 0.85 }));
    }
    obs.forEach(function (o) {
      svg.appendChild(el('circle', { cx: X(o.date.getTime()), cy: Y(o.value), r: 1.9,
        fill: C.ink2, stroke: '#fff', 'stroke-width': 0.6 }));
    });
    caption(svg, L, T + 8, indexName || 'NDVI');

    var zy0 = T + topH + gap, zh = botH, zmax = 3;
    var ZY = function (z) { return zy0 + zh / 2 - Math.max(-zmax, Math.min(zmax, z)) / zmax * (zh / 2); };
    [-2, 2].forEach(function (lv) {
      svg.appendChild(el('line', { x1: L, x2: L + pw, y1: ZY(lv), y2: ZY(lv),
        stroke: C.muted, 'stroke-width': 1, 'stroke-dasharray': '2 3' }));
    });
    svg.appendChild(el('line', { x1: L, x2: L + pw, y1: ZY(0), y2: ZY(0),
      stroke: C.muted, 'stroke-width': 1 }));
    obs.forEach(function (o) {
      if (o.z === null) return;
      var x = X(o.date.getTime()), a = ZY(0), b = ZY(o.z);
      svg.appendChild(el('rect', { x: x - 1.3, y: Math.min(a, b), width: 2.6,
        height: Math.max(1, Math.abs(b - a)), rx: 1.1,
        fill: o.z < 0 ? C.neg : C.pos, 'fill-opacity': Math.abs(o.z) >= 2 ? 1 : 0.6 }));
    });
    [['+2', 2], ['0', 0], ['−2', -2]].forEach(function (p) {
      var t = el('text', { x: L - 6, y: ZY(p[1]) + 3.2, 'text-anchor': 'end', class: 'axlabel' });
      t.textContent = p[0];
      svg.appendChild(t);
    });
    caption(svg, L, zy0 - 4, 'z-anomalie');

    /* Beheeringrepen op de tijdas (hoofdstuk 5.3.2). Een losse datum wordt
       een streepje, een periode een bandje. Bewust achter de meetpunten
       getekend: het is context, niet de meting zelf. */
    if (ingrepen && ingrepen.length) {
      var gLayer = el('g', { 'pointer-events': 'none' });
      ingrepen.forEach(function (g) {
        var x0 = X(g.start.getTime());
        if (x0 < L - 2 || x0 > L + pw + 2) return;
        if (g.eind) {
          var x1 = Math.min(L + pw, X(g.eind.getTime()));
          gLayer.appendChild(el('rect', { x: x0, y: T, width: Math.max(1.5, x1 - x0),
            height: topH, fill: g.kleur, 'fill-opacity': 0.12 }));
        }
        gLayer.appendChild(el('line', { x1: x0, x2: x0, y1: T, y2: T + topH,
          stroke: g.kleur, 'stroke-width': 1.2, 'stroke-opacity': 0.75,
          'stroke-dasharray': '3 2' }));
        gLayer.appendChild(el('path', {
          d: 'M' + (x0 - 3.2) + ' ' + (T - 1) + 'L' + (x0 + 3.2) + ' ' + (T - 1)
             + 'L' + x0 + ' ' + (T + 4.5) + 'Z',
          fill: g.kleur }));
      });
      svg.insertBefore(gLayer, svg.firstChild);
    }

    // hover
    var line = el('line', { y1: T, y2: T + topH + gap + botH, stroke: C.muted,
      'stroke-width': 1, opacity: 0 });
    svg.appendChild(line);
    function move(ev) {
      var r = svg.getBoundingClientRect();
      var px = (ev.clientX - r.left) / r.width * W;
      var frac = (px - L) / pw;
      if (frac < 0 || frac > 1) { tip.style.opacity = 0; line.setAttribute('opacity', 0); return; }
      var target = t0 + frac * (t1 - t0), best = null, bd = Infinity;
      obs.forEach(function (o) {
        var d = Math.abs(o.date.getTime() - target);
        if (d < bd) { bd = d; best = o; }
      });
      if (!best) return;
      var bx = X(best.date.getTime());
      line.setAttribute('x1', bx); line.setAttribute('x2', bx); line.setAttribute('opacity', 1);
      tip.innerHTML = '<b>' + best.iso + '</b>'
        + '<div class="row"><span>waarde</span><span>' + nl(best.value, 3) + '</span></div>'
        + '<div class="row"><span>referentie</span><span>' + nl(best.baseline, 3) + '</span></div>'
        + '<div class="row"><span>z</span><span>' + (best.z === null ? '–' : nl(best.z, 2)) + '</span></div>';
      tip.style.opacity = 1;
      var sx = bx / W * r.width;
      tip.style.left = Math.max(2, Math.min(r.width - tip.offsetWidth - 2, sx + 12)) + 'px';
      tip.style.top = '8px';
    }
    svg.onpointermove = move;
    svg.onpointerleave = function () { tip.style.opacity = 0; line.setAttribute('opacity', 0); };
  }

  /* ── 2. seizoensprofiel ─────────────────────────────────── */
  function season(svg, series) {
    clear(svg);
    var W = 640, L = 44, R = 10, T = 12, B = 22, H = 190;
    var pw = W - L - R, ph = H - T - B;
    var obs = series.obs, doys = series.doys, base = series.base, sd = series.sd;
    var ex = extent(obs.map(function (o) { return o.value; }), 0.08);
    var X = function (d) { return L + (d - 1) / 364 * pw; };
    var Y = function (v) { return T + ph - (v - ex[0]) / (ex[1] - ex[0]) * ph; };
    yAxis(svg, L, T, T + ph, ex[0], ex[1], pw, 4);

    var up = '', dn = '', cv = '', idx = [];
    for (var i = 0; i < doys.length; i++) if (!isNaN(base[i]) && !isNaN(sd[i])) idx.push(i);
    idx.forEach(function (i, k) {
      up += (k ? 'L' : 'M') + X(doys[i]).toFixed(1) + ' ' + Y(base[i] + sd[i]).toFixed(1);
      cv += (k ? 'L' : 'M') + X(doys[i]).toFixed(1) + ' ' + Y(base[i]).toFixed(1);
    });
    for (var j = idx.length - 1; j >= 0; j--) {
      dn += 'L' + X(doys[idx[j]]).toFixed(1) + ' ' + Y(base[idx[j]] - sd[idx[j]]).toFixed(1);
    }
    if (up) svg.appendChild(el('path', { d: up + dn + 'Z', fill: C.accentSoft, stroke: 'none' }));
    obs.forEach(function (o) {
      svg.appendChild(el('circle', { cx: X(o.doy), cy: Y(o.value), r: 1.7,
        fill: C.ink2, 'fill-opacity': 0.4 }));
    });
    if (cv) svg.appendChild(el('path', { d: cv, fill: 'none', stroke: C.accent, 'stroke-width': 2 }));

    MONTH_DOY.forEach(function (d, i) {
      var t = el('text', { x: X(d) + pw / 24, y: H - 6, 'text-anchor': 'middle', class: 'axlabel' });
      t.textContent = MONTHS[i];
      svg.appendChild(t);
    });
    svg.appendChild(el('line', { x1: L, x2: L + pw, y1: T + ph, y2: T + ph,
      stroke: C.line, 'stroke-width': 1 }));
  }

  /* ── 3. decompositie ────────────────────────────────────── */
  function decomposition(svg, dec) {
    clear(svg);
    var W = 640, L = 44, R = 10, pw = W - L - R;
    var obs = dec.obs;
    if (obs.length < 5) return;
    var t0 = obs[0].date.getTime(), t1 = obs[obs.length - 1].date.getTime();
    var X = function (ms) { return L + (ms - t0) / (t1 - t0) * pw; };
    var rows = [
      { name: 'trend', values: dec.trend, color: C.accent, width: 2, h: 66, zero: false },
      { name: 'seizoen', values: dec.seasonal, color: C.s1, width: 1, h: 62, zero: false },
      { name: 'rest', values: dec.remainder, color: C.ink2, width: 0.8, h: 54, zero: true },
    ];
    var top = 14;
    rows.forEach(function (row) {
      var ex = extent(row.values, 0.14);
      var Y = function (v) { return top + row.h - (v - ex[0]) / (ex[1] - ex[0]) * row.h; };
      if (row.zero && ex[0] < 0 && ex[1] > 0) {
        svg.appendChild(el('line', { x1: L, x2: L + pw, y1: Y(0), y2: Y(0),
          stroke: C.muted, 'stroke-width': 1 }));
      }
      [ex[0] + (ex[1] - ex[0]) * 0.1, ex[1] - (ex[1] - ex[0]) * 0.1].forEach(function (v) {
        var t = el('text', { x: L - 6, y: Y(v) + 3.2, 'text-anchor': 'end', class: 'axlabel' });
        t.textContent = nl(v, 2);
        svg.appendChild(t);
      });
      var path = '', started = false;
      row.values.forEach(function (v, i) {
        if (isNaN(v)) { started = false; return; }
        var x = X(obs[i].date.getTime()).toFixed(1), y = Y(v).toFixed(1);
        path += (started ? 'L' : 'M') + x + ' ' + y;
        started = true;
      });
      svg.appendChild(el('path', { d: path, fill: 'none', stroke: row.color,
        'stroke-width': row.width, 'stroke-linejoin': 'round' }));
      caption(svg, L, top - 3, row.name);
      top += row.h + 20;
    });
    for (var y = obs[0].date.getUTCFullYear() + 1; y <= obs[obs.length - 1].date.getUTCFullYear(); y++) {
      var xx = X(Date.UTC(y, 0, 1));
      if (xx < L || xx > L + pw) continue;
      svg.appendChild(el('line', { x1: xx, x2: xx, y1: 8, y2: top - 18,
        stroke: C.line, 'stroke-width': 1 }));
      var t2 = el('text', { x: xx + 4, y: top - 4, class: 'axlabel' });
      t2.textContent = String(y);
      svg.appendChild(t2);
    }
  }

  /* ── 4. jaarstatistieken ────────────────────────────────── */
  function annual(svg, cell) {
    clear(svg);
    if (!cell.years || !cell.years.length) return;
    var W = 640, L = 44, R = 96, T = 20, B = 24, H = 180;
    var pw = W - L - R, ph = H - T - B;
    var series = [
      { key: 'ymax', name: 'p90', color: C.s1 },
      { key: 'ymed', name: 'mediaan', color: C.accent },
      { key: 'ymin', name: 'p10', color: C.s2 },
    ];
    var all = [];
    series.forEach(function (s) { all = all.concat(cell[s.key] || []); });
    var ex = extent(all, 0.14);
    var years = cell.years;
    var X = function (y) { return L + (y - years[0]) / Math.max(1, years.length - 1) * pw; };
    var Y = function (v) { return T + ph - (v - ex[0]) / (ex[1] - ex[0]) * ph; };
    yAxis(svg, L, T, T + ph, ex[0], ex[1], pw, 4);
    years.forEach(function (y, i) {
      if (years.length > 8 && i % 2) return;
      var t = el('text', { x: X(y), y: H - 6, 'text-anchor': 'middle', class: 'axlabel' });
      t.textContent = String(y);
      svg.appendChild(t);
    });
    series.forEach(function (s) {
      var vals = cell[s.key] || [];
      var path = '', started = false;
      vals.forEach(function (v, i) {
        if (v === null || isNaN(v)) { started = false; return; }
        path += (started ? 'L' : 'M') + X(years[i]).toFixed(1) + ' ' + Y(v).toFixed(1);
        started = true;
        svg.appendChild(el('circle', { cx: X(years[i]), cy: Y(v), r: 3.4,
          fill: s.color, stroke: '#fff', 'stroke-width': 1.4 }));
      });
      svg.appendChild(el('path', { d: path, fill: 'none', stroke: s.color, 'stroke-width': 1.8 }));
      var last = null;
      for (var i = vals.length - 1; i >= 0; i--) {
        if (vals[i] !== null && !isNaN(vals[i])) { last = vals[i]; break; }
      }
      if (last === null) return;
      var lab = el('text', { x: L + pw + 8, y: Y(last) + 3.6, class: 'axlabel', fill: C.ink2 });
      lab.textContent = s.name;
      svg.appendChild(lab);
    });
    caption(svg, L, T - 8, 'jaarstatistieken');
  }

  global.Charts = {
    timeseries: timeseries,
    season: season,
    decomposition: decomposition,
    annual: annual,
    nl: nl,
  };
})(window);
