// charts.js — vier SVG-grafieken, geen chartbibliotheek.
// Alles tekent in de viewBox-coordinaten van de <svg> in index.html.
//
// Assen zijn standaard VAST (CFG.axis). Tot 2026-09-27 schaalde elke grafiek
// op elke klik naar zijn eigen data, met twee gevolgen die in de praktijk
// opvielen: twee pixels naast elkaar waren op het oog onvergelijkbaar, en een
// enkele uitschieter blies de hele as op -- en die uitschieters bestaan
// (series-grid.json bevat een NDVI van 2,32, fysisch onmogelijk, gevolg van een
// deling door bijna-nul in de openEO-berekening). Charts.auto = true zet de
// oude, meeschalende assen terug voor wie op een kleine variatie wil inzoomen.
// Bij een vaste as worden punten erbuiten geklemd EN geteld: de grafiek zegt
// er dan bij hoeveel er buiten vallen, zodat er niets stil verdwijnt.

(function (global) {
  'use strict';

  var CFG = global.FENO_CONFIG;
  var C = CFG.colors;
  var AX = CFG.axis || {};
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
    var t = v.toFixed(d === undefined ? 3 : d);
    // Een as van -0,2 tot 1 in zes stappen raakt de nul via -2,7e-17, en dat
    // toFixed() als "-0.00" afdrukt. Een minteken voor een nul is geen
    // afronding maar een leesfout.
    if (/^-0[,.]?0*$/.test(t)) t = t.slice(1);
    return t.replace('.', ',').replace(/^-/, '−');
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

  /**
   * Het domein van een y-as. Staat Charts.auto uit (de standaard) en is er een
   * vast domein geconfigureerd, dan wint dat: dezelfde as bij elke klik.
   */
  function domain(values, fixed, padFrac) {
    if (!Charts.auto && fixed && fixed.length === 2) return [fixed[0], fixed[1]];
    return extent(values, padFrac);
  }

  /** Aantal waarden dat buiten het domein valt; 0 als de as meeschaalt. */
  function outside(values, dom) {
    var n = 0;
    values.forEach(function (v) {
      if (v === null || isNaN(v)) return;
      if (v < dom[0] || v > dom[1]) n++;
    });
    return n;
  }

  /** Meldt geklemde punten in de grafiek zelf, rechtsboven. */
  function clipNote(svg, x, y, n, wat) {
    if (!n) return;
    var t = el('text', { x: x, y: y, 'text-anchor': 'end', class: 'axlabel clipnote' });
    t.textContent = '⚠ ' + n + ' ' + (wat || (n === 1 ? 'punt' : 'punten'))
      + ' buiten de as';
    svg.appendChild(t);
  }

  /* Bij een vaste index-as staan de labels op ronde stappen (0,2); schaalt de
     as mee, dan zegt het aantal stappen niets en zijn vier labels genoeg. */
  function idxTicks() {
    return (!Charts.auto && AX.indexTicks) ? AX.indexTicks : 4;
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
  function caption(svg, x, y, text, cls) {
    var t = el('text', { x: x, y: y, class: cls || 'axlabel' });
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
    var vals = obs.map(function (o) { return o.value; });
    var ex = domain(vals, AX.index, 0.07);
    var Y = function (v) {
      var c = Math.max(ex[0], Math.min(ex[1], v));
      return T + topH - (c - ex[0]) / (ex[1] - ex[0]) * topH;
    };

    yAxis(svg, L, T, T + topH, ex[0], ex[1], pw, idxTicks());

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
    // Een geklemd punt krijgt geen witte rand: zo is op het oog te zien dat
    // het op de asrand ligt en niet op zijn eigen waarde.
    obs.forEach(function (o) {
      var buiten = o.value < ex[0] || o.value > ex[1];
      svg.appendChild(el('circle', { cx: X(o.date.getTime()), cy: Y(o.value),
        r: buiten ? 2.4 : 1.9, fill: buiten ? C.s2 : C.ink2,
        stroke: buiten ? 'none' : '#fff', 'stroke-width': 0.6 }));
    });
    caption(svg, L, T + 8, indexName || 'NDVI');
    clipNote(svg, L + pw, T + 8, outside(vals, ex));

    var zy0 = T + topH + gap, zh = botH, zmax = AX.z || 3;
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
    var vals = obs.map(function (o) { return o.value; });
    var ex = domain(vals, AX.index, 0.08);
    var X = function (d) { return L + (d - 1) / 364 * pw; };
    var Y = function (v) {
      var c = Math.max(ex[0], Math.min(ex[1], v));
      return T + ph - (c - ex[0]) / (ex[1] - ex[0]) * ph;
    };
    yAxis(svg, L, T, T + ph, ex[0], ex[1], pw, idxTicks());

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
    clipNote(svg, L + pw, T + 8, outside(vals, ex));

    MONTH_DOY.forEach(function (d, i) {
      var t = el('text', { x: X(d) + pw / 24, y: H - 6, 'text-anchor': 'middle', class: 'axlabel' });
      t.textContent = MONTHS[i];
      svg.appendChild(t);
    });
    svg.appendChild(el('line', { x1: L, x2: L + pw, y1: T + ph, y2: T + ph,
      stroke: C.line, 'stroke-width': 1 }));
  }

  /* ── 3. decompositie ────────────────────────────────────── */
  /* De as van elke rij was eerder alleen een tweetal labels op 10% en 90% van
     het eigen bereik. Daardoor zag een volkomen vlakke trend er dramatisch uit
     en een echte stijging vlak -- precies de verwarring uit de feedback
     ("jaarcurve gaat omhoog, decompositie niet"). Nu een vaste as met een
     nullijn, zodat de schaal tussen rijen en tussen pixels vergelijkbaar is. */
  function decomposition(svg, dec) {
    clear(svg);
    var W = 640, L = 44, R = 10, pw = W - L - R;
    var obs = dec.obs;
    if (obs.length < 5) return;
    var t0 = obs[0].date.getTime(), t1 = obs[obs.length - 1].date.getTime();
    var X = function (ms) { return L + (ms - t0) / (t1 - t0) * pw; };
    var rows = [
      // trend en seizoen staan allebei op de index-schaal (Series.decompose telt
      // het gemiddelde van de seizoenscurve weer bij de trend op), dus dezelfde
      // as: alleen zo is te zien dat de trend om de seizoenscurve heen ligt.
      { name: 'trend', values: dec.trend, color: C.accent, width: 2, h: 66,
        fixed: AX.index, zero: false },
      { name: 'seizoen', values: dec.seasonal, color: C.s1, width: 1, h: 62,
        fixed: AX.index, zero: false },
      { name: 'rest', values: dec.remainder, color: C.ink2, width: 0.8, h: 54,
        fixed: AX.residu, zero: true },
    ];
    var top = 14, buiten = 0;
    rows.forEach(function (row) {
      var ex = domain(row.values, row.fixed, 0.14);
      var Y = function (v) {
        var c = Math.max(ex[0], Math.min(ex[1], v));
        return top + row.h - (c - ex[0]) / (ex[1] - ex[0]) * row.h;
      };
      buiten += outside(Array.prototype.slice.call(row.values), ex);
      // Twee gridlijnen plus de nullijn: genoeg om de schaal te lezen zonder
      // de rij vol te zetten.
      [ex[0], (ex[0] + ex[1]) / 2, ex[1]].forEach(function (v) {
        var yy = Y(v);
        svg.appendChild(el('line', { x1: L, x2: L + pw, y1: yy, y2: yy, class: 'gridline' }));
        var t = el('text', { x: L - 6, y: yy + 3.2, 'text-anchor': 'end', class: 'axlabel' });
        t.textContent = nl(v, 2);
        svg.appendChild(t);
      });
      if (row.zero && ex[0] < 0 && ex[1] > 0) {
        svg.appendChild(el('line', { x1: L, x2: L + pw, y1: Y(0), y2: Y(0),
          stroke: C.muted, 'stroke-width': 1 }));
      }
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
    clipNote(svg, L + pw, 11, buiten, buiten === 1 ? 'waarde' : 'waarden');
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

  /* ── 4. jaarstatistieken + amplitude ───────────────────── */
  /* Twee panelen. Boven de drie jaarstatistieken met de afstand tussen p90 en
     p10 als band -- dat IS de amplitude, en zo is hij zichtbaar zonder een
     tweede kaartlaag. Onder diezelfde amplitude als eigen reeks met zijn
     Theil-Sen-lijn, want "wordt hij groter of kleiner" is een trendvraag en
     die lees je niet af aan een band die over tien jaar iets vernauwt.
     De stippellijn in het bovenpaneel is dezelfde Theil-Sen die de kaartlaag
     'seizoensniveau' kleurt: zo is de kaart terug te vinden in de grafiek. */
  function annual(svg, cell) {
    clear(svg);
    if (!cell.years || !cell.years.length) return;
    var W = 640, L = 44, R = 96, T = 20, H1 = 176, gap = 42, H2 = 74;
    var pw = W - L - R;
    var series = [
      { key: 'ymax', name: 'p90', color: C.s1 },
      { key: 'ymed', name: 'mediaan', color: C.accent },
      { key: 'ymin', name: 'p10', color: C.s2 },
    ];
    var all = [];
    series.forEach(function (s) { all = all.concat(cell[s.key] || []); });
    var ex = domain(all, AX.index, 0.14);
    var years = cell.years;
    var X = function (y) { return L + (y - years[0]) / Math.max(1, years.length - 1) * pw; };
    var Y = function (v) {
      var c = Math.max(ex[0], Math.min(ex[1], v));
      return T + H1 - (c - ex[0]) / (ex[1] - ex[0]) * H1;
    };
    yAxis(svg, L, T, T + H1, ex[0], ex[1], pw, idxTicks());

    /* De amplitudeband: het vlak tussen p90 en p10. Achter de lijnen, want het
       is de ruimte tussen twee reeksen en niet een reeks op zichzelf. */
    var hi = cell.ymax || [], lo = cell.ymin || [];
    var bandUp = '', bandDn = '', k = 0;
    for (var i = 0; i < years.length; i++) {
      if (hi[i] === null || lo[i] === null || isNaN(hi[i]) || isNaN(lo[i])) continue;
      bandUp += (k ? 'L' : 'M') + X(years[i]).toFixed(1) + ' ' + Y(hi[i]).toFixed(1);
      k++;
    }
    for (var j = years.length - 1; j >= 0; j--) {
      if (hi[j] === null || lo[j] === null || isNaN(hi[j]) || isNaN(lo[j])) continue;
      bandDn += 'L' + X(years[j]).toFixed(1) + ' ' + Y(lo[j]).toFixed(1);
    }
    if (bandUp && bandDn) {
      svg.appendChild(el('path', { d: bandUp + bandDn + 'Z', fill: C.accentSoft,
        'fill-opacity': 0.55, stroke: 'none' }));
    }

    years.forEach(function (y, i) {
      if (years.length > 8 && i % 2) return;
      var t = el('text', { x: X(y), y: T + H1 + 14, 'text-anchor': 'middle', class: 'axlabel' });
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

    // De getoetste lijn: Theil-Sen op de mediaanreeks, dezelfde die de
    // kaartlaag 'seizoensniveau' kleurt.
    var fitMed = global.Series.theilSen(years, cell.ymed || []);
    if (!isNaN(fitMed.slope)) {
      svg.appendChild(el('line', {
        x1: X(years[0]), x2: X(years[years.length - 1]),
        y1: Y(fitMed.intercept + fitMed.slope * years[0]),
        y2: Y(fitMed.intercept + fitMed.slope * years[years.length - 1]),
        stroke: C.accent, 'stroke-width': 1.4, 'stroke-dasharray': '5 3',
        'stroke-opacity': 0.9 }));
    }
    caption(svg, L, T - 8, 'jaarstatistieken · band = p90 − p10');
    clipNote(svg, L + pw + R - 2, T - 8, outside(all, ex));

    /* Onderpaneel: de amplitude als eigen reeks. */
    var rng = years.map(function (y, i) {
      var a = hi[i], b = lo[i];
      return (a === null || b === null || isNaN(a) || isNaN(b)) ? NaN : a - b;
    });
    var T2 = T + H1 + gap;
    var ex2 = domain(rng, AX.bereik, 0.18);
    var Y2 = function (v) {
      var c = Math.max(ex2[0], Math.min(ex2[1], v));
      return T2 + H2 - (c - ex2[0]) / (ex2[1] - ex2[0]) * H2;
    };
    [ex2[0], (ex2[0] + ex2[1]) / 2, ex2[1]].forEach(function (v) {
      var yy = Y2(v);
      svg.appendChild(el('line', { x1: L, x2: L + pw, y1: yy, y2: yy, class: 'gridline' }));
      var t = el('text', { x: L - 6, y: yy + 3.2, 'text-anchor': 'end', class: 'axlabel' });
      t.textContent = nl(v, 2);
      svg.appendChild(t);
    });
    var rp = '', rstarted = false;
    rng.forEach(function (v, i) {
      if (isNaN(v)) { rstarted = false; return; }
      rp += (rstarted ? 'L' : 'M') + X(years[i]).toFixed(1) + ' ' + Y2(v).toFixed(1);
      rstarted = true;
      svg.appendChild(el('circle', { cx: X(years[i]), cy: Y2(v), r: 3.2,
        fill: C.ink2, stroke: '#fff', 'stroke-width': 1.3 }));
    });
    svg.appendChild(el('path', { d: rp, fill: 'none', stroke: C.ink2, 'stroke-width': 1.6 }));

    var fitRng = global.Series.theilSen(years, rng);
    if (!isNaN(fitRng.slope)) {
      svg.appendChild(el('line', {
        x1: X(years[0]), x2: X(years[years.length - 1]),
        y1: Y2(fitRng.intercept + fitRng.slope * years[0]),
        y2: Y2(fitRng.intercept + fitRng.slope * years[years.length - 1]),
        stroke: fitRng.slope < 0 ? C.neg : C.pos, 'stroke-width': 1.6,
        'stroke-dasharray': '5 3' }));
      var richting = fitRng.slope < 0 ? 'krimpt' : 'groeit';
      var lab2 = el('text', { x: L + pw + 8, y: T2 + H2 / 2 + 3.6,
        class: 'axlabel', fill: fitRng.slope < 0 ? C.neg : C.pos });
      lab2.textContent = richting;
      svg.appendChild(lab2);
    }
    caption(svg, L, T2 - 8, 'amplitude (p90 − p10) per jaar');
    years.forEach(function (y, i) {
      if (years.length > 8 && i % 2) return;
      var t = el('text', { x: X(y), y: T2 + H2 + 14, 'text-anchor': 'middle', class: 'axlabel' });
      t.textContent = String(y);
      svg.appendChild(t);
    });

    return { slopeMed: fitMed.slope, slopeRange: fitRng.slope };
  }

  /** Amplitude per jaar plus de Theil-Sen-trend erop, zonder te tekenen. */
  function amplitude(cell) {
    if (!cell || !cell.years || !cell.years.length) return null;
    var hi = cell.ymax || [], lo = cell.ymin || [];
    var rng = cell.years.map(function (y, i) {
      var a = hi[i], b = lo[i];
      return (a === null || b === null || isNaN(a) || isNaN(b)) ? NaN : a - b;
    });
    var geldig = rng.filter(function (v) { return !isNaN(v); });
    if (geldig.length < 4) return null;
    var fit = global.Series.theilSen(cell.years, rng);
    var mk = global.Series.mannKendall(rng);
    return {
      per_jaar: rng,
      slope: fit.slope,
      tau: mk.tau,
      p: mk.p,
      eerste: geldig[0],
      laatste: geldig[geldig.length - 1],
      gemiddeld: geldig.reduce(function (a, b) { return a + b; }, 0) / geldig.length,
    };
  }

  var Charts = {
    // false = vaste assen (de standaard, zie CFG.axis), true = meeschalend
    auto: !(AX.vast === undefined ? true : AX.vast),
    timeseries: timeseries,
    season: season,
    decomposition: decomposition,
    annual: annual,
    amplitude: amplitude,
    nl: nl,
  };
  global.Charts = Charts;
})(window);
