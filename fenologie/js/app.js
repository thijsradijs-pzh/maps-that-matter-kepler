// app.js — kaart, interactie en het detailpaneel.

(function () {
  'use strict';

  var CFG = window.FENO_CONFIG;
  var C = CFG.colors;
  var map, selected = null, metric = 'slope', onlySig = false, liveAvailable = null;

  var $ = function (id) { return document.getElementById(id); };
  var nl = window.Charts.nl;

  /* ── kleurschalen ───────────────────────────────────────── */
  function hex2rgb(h) {
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
  }
  function mix(a, b, t) {
    var A = hex2rgb(a), B = hex2rgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ','
                  + Math.round(A[1] + (B[1] - A[1]) * t) + ','
                  + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  function colorFor(cell) {
    var spec = CFG.metrics[metric];
    var v = cell[metric];
    if (v === null || v === undefined || isNaN(v)) return 'rgba(0,0,0,0)';
    if (spec.type === 'diverging') {
      var t = Math.max(-1, Math.min(1, v / spec.domain));
      return t < 0 ? mix(C.mid, C.neg, -t) : mix(C.mid, C.pos, t);
    }
    var max = window.__metricMax[metric] || 1;
    return mix('#f2f0e8', spec.color, Math.min(1, v / max));
  }
  function visible(cell) {
    if (!onlySig) return true;
    if (metric !== 'slope') return true;
    return cell.p !== null && cell.p !== undefined && cell.p < 0.05;
  }

  /* ── geometrie ──────────────────────────────────────────── */
  function buildGeoJSON() {
    var feats = Cube.data.cells.map(function (cell) {
      var ring = h3.h3ToGeoBoundary(cell.h3, true);
      ring.push(ring[0]);
      return {
        type: 'Feature',
        id: cell.h3,
        properties: {
          h3: cell.h3,
          color: visible(cell) ? colorFor(cell) : 'rgba(0,0,0,0)',
          value: cell[metric],
        },
        geometry: { type: 'Polygon', coordinates: [ring] },
      };
    });
    return { type: 'FeatureCollection', features: feats };
  }

  function refreshFill() {
    map.getSource('cells').setData(buildGeoJSON());
    renderLegend();
  }

  /* ── legenda ────────────────────────────────────────────── */
  function renderLegend() {
    var spec = CFG.metrics[metric];
    var grad, lo, hi;
    if (spec.type === 'diverging') {
      grad = 'linear-gradient(90deg,' + C.neg + ',' + C.mid + ',' + C.pos + ')';
      lo = spec.fmt(-spec.domain);
      hi = spec.fmt(spec.domain);
    } else {
      grad = 'linear-gradient(90deg,#f2f0e8,' + spec.color + ')';
      lo = '0';
      hi = String(window.__metricMax[metric]);
    }
    $('legend-bar').style.background = grad;
    $('legend-lo').textContent = lo;
    $('legend-hi').textContent = hi;
    $('legend-unit').textContent = spec.unit;
    $('legend-note').textContent = spec.note;
  }

  function renderMeta() {
    var m = Cube.data.meta;
    var badge = $('source-badge');
    badge.textContent = m.demo ? 'demo-data' : m.source;
    badge.className = m.demo ? 'badge' : 'badge live';
    badge.title = m.demo
      ? 'Gesimuleerde reeksen; de verwerking erna is de productiecode.'
      : 'Echte kubus uit ' + m.source;
    badge.hidden = false;
    $('meta-block').innerHTML =
      Cube.data.cells.length + ' hexagonen (H3 res ' + m.h3_res + ') &middot; ' +
      m.period[0].slice(0, 4) + '–' + m.period[1].slice(0, 4) + ' &middot; ' + m.index + '.<br>' +
      m.boundary + '.<br>' + m.method + '.' +
      (m.demo ? '<br><strong>Let op:</strong> de reeksen zijn gesimuleerd. Draai ' +
        '<code>build_fenologie_cube.py --from-grass</code> voor de echte kubus.' : '');
  }

  /* ── detailpaneel ───────────────────────────────────────── */
  function statRow(label, value, unit) {
    return '<div><dt>' + label + '</dt><dd>' + value +
      (unit ? ' <span class="unit">' + unit + '</span>' : '') + '</dd></div>';
  }

  function showCell(cell) {
    selected = cell;
    var series = cell._series ? cell._series : Cube.series(cell);
    var idx = Cube.data.meta.index;

    $('d-title').textContent = cell.live
      ? 'Live punt (buiten de kubus)'
      : (cell.hab ? cell.hab + ' — hexagon' : 'Hexagon');
    $('d-sub').textContent = nl(cell.lat, 5) + ' N, ' + nl(cell.lon, 5) + ' E'
      + (cell.h3 ? '  ·  ' + cell.h3 : '  ·  openEO / CDSE');

    var sig = cell.p !== null && cell.p !== undefined && cell.p < 0.05;
    var toets = 'τ = ' + nl(cell.tau, 2) + ', p '
      + (cell.p < 0.001 ? '< 0,001' : '= ' + nl(cell.p, 3)) + ' (Mann-Kendall, n = '
      + (cell.years ? cell.years.length : '?') + ')';
    $('d-stats').innerHTML =
      statRow('waarnemingen', cell.n, '') +
      statRow('trend', (cell.slope > 0 ? '+' : '−') + nl(Math.abs(cell.slope), 4), idx + '/jaar') +
      statRow('z ≤ −2', cell.zlow, 'keer') +
      statRow('z ≥ +2', cell.zhigh, 'keer');

    var v = $('d-verdict');
    if (!sig) {
      v.className = 'verdict flat';
      v.textContent = 'Geen significante trend: ' + toets + '. De variatie tussen jaren '
        + 'overheerst — met tien jaar data is dat de normale uitkomst.';
    } else if (cell.slope > 0) {
      v.className = 'verdict up';
      v.textContent = 'Het seizoensniveau loopt op (' + toets + '). Denk aan verlanding, '
        + 'opslag, gestopt maaibeheer of een verandering in waterpeil.';
    } else {
      v.className = 'verdict down';
      v.textContent = 'Het seizoensniveau daalt (' + toets + '). Kandidaat voor veldbezoek: '
        + 'leg dit naast beheerregistraties en waterstanden voordat je het als achteruitgang leest.';
    }

    Charts.timeseries($('c-ts'), $('tt-ts'), series, idx);
    Charts.season($('c-season'), series);
    Charts.decomposition($('c-decomp'), cell.live
      ? { obs: series.obs,
          seasonal: series.obs.map(function (o) { return o.baseline === null ? NaN : o.baseline; }),
          trend: series.obs.map(function () { return NaN; }),
          remainder: series.obs.map(function () { return NaN; }) }
      : Cube.decompose(cell));
    Charts.annual($('c-annual'), cell);

    $('grass-cmd').hidden = true;
    $('d-verdict').hidden = false;
    $('btn-close').hidden = false;
    if (cell.h3) {
      map.setFilter('cells-selected', ['==', ['get', 'h3'], cell.h3]);
    } else {
      map.setFilter('cells-selected', ['==', ['get', 'h3'], '__none__']);
    }
    updateURL();
  }

  function grassCommand(cell) {
    var idx = Cube.data.meta.index.toLowerCase();
    return 't.rast.pointseries input=S2_' + idx + ' \\\n'
      + '  baseline=' + idx + '_xyr_median_hants \\\n'
      + '  baseline_sd=' + idx + '_xyr_robust_sd \\\n'
      + '  coordinates=' + cell.lon.toFixed(5) + ',' + cell.lat.toFixed(5) + ' \\\n'
      + '  coordinates_crs=4326 trend=theilsen,ols period=73 \\\n'
      + '  plot=' + (cell.h3 || 'punt') + '.png json=' + (cell.h3 || 'punt') + '.json';
  }

  function downloadCSV(cell) {
    var series = cell._series || Cube.series(cell);
    var idx = Cube.data.meta.index.toLowerCase();
    var lines = ['datum,doy,' + idx + ',referentie,robuuste_sd,z'];
    series.obs.forEach(function (o) {
      lines.push([o.iso, o.doy, o.value.toFixed(4),
        o.baseline === null ? '' : o.baseline.toFixed(4),
        o.sd === null ? '' : o.sd.toFixed(4),
        o.z === null ? '' : o.z.toFixed(3)].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fenologie_' + (cell.h3 || 'punt') + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ── live openEO ────────────────────────────────────────── */
  function checkLive() {
    return fetch(CFG.liveUrl + '?probe=1').then(function (r) {
      liveAvailable = r.ok;
      return liveAvailable;
    }).catch(function () { liveAvailable = false; return false; });
  }

  function fetchLive(lon, lat) {
    $('loader').hidden = false;
    $('loader-text').textContent = 'Live reeks ophalen bij Copernicus… dit duurt 10–40 seconden.';
    var period = Cube.data.meta.period;
    return fetch(CFG.liveUrl + '?lon=' + lon.toFixed(5) + '&lat=' + lat.toFixed(5)
                 + '&start=' + period[0] + '&end=' + period[1])
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.status); });
        return r.json();
      })
      .then(function (payload) {
        if (!payload.observations || payload.observations.length < 20) {
          throw new Error('te weinig wolkvrije waarnemingen op dit punt');
        }
        showCell(Cube.fromLive(payload, lon, lat));
      })
      .catch(function (e) {
        showToast('Live ophalen lukte niet: ' + e.message, null);
      })
      .then(function () { $('loader').hidden = true; });
  }

  function showToast(text, action) {
    $('toast-text').textContent = text;
    $('btn-live').hidden = !action;
    $('btn-live').onclick = action || null;
    $('toast').hidden = false;
  }

  /* ── permalink ──────────────────────────────────────────── */
  function updateURL() {
    var p = new URLSearchParams();
    p.set('metric', metric);
    if (onlySig) p.set('sig', '1');
    if (selected && selected.h3) p.set('h3', selected.h3);
    history.replaceState(null, '', location.pathname + '?' + p.toString());
  }

  function restoreURL() {
    var p = new URLSearchParams(location.search);
    if (p.get('metric') && CFG.metrics[p.get('metric')]) {
      metric = p.get('metric');
      $('metric').value = metric;
    }
    if (p.get('sig') === '1') { onlySig = true; $('only-sig').checked = true; }
    var h = p.get('h3');
    if (h && Cube.byH3[h]) {
      showCell(Cube.byH3[h]);
      map.jumpTo({ center: [Cube.byH3[h].lon, Cube.byH3[h].lat], zoom: 13.8 });
    }
  }

  /* ── kaart ──────────────────────────────────────────────── */
  function basemapStyle(key) {
    var b = CFG.basemaps[key] || CFG.basemaps[CFG.defaultBasemap];
    return {
      version: 8,
      sources: {
        base: {
          type: 'raster', tiles: b.tiles, tileSize: b.tileSize,
          attribution: b.attribution, maxzoom: b.maxzoom || 19,
        },
      },
      layers: [{ id: 'base', type: 'raster', source: 'base' }],
    };
  }

  /** Zoom naar de kubus, zodat het gebied op elk schermformaat past. */
  function fitToCube() {
    var pts = (Cube.data.ring && Cube.data.ring.length)
      ? Cube.data.ring
      : Cube.data.cells.map(function (c) { return [c.lon, c.lat]; });
    var b = pts.reduce(function (acc, p) {
      return [Math.min(acc[0], p[0]), Math.min(acc[1], p[1]),
              Math.max(acc[2], p[0]), Math.max(acc[3], p[1])];
    }, [Infinity, Infinity, -Infinity, -Infinity]);
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], {
      padding: { top: 62, bottom: 34, left: 22, right: 22 },
      duration: 0,
    });
  }

  function addDataLayers() {
    if (map.getSource('cells')) return;
    map.addSource('cells', { type: 'geojson', data: buildGeoJSON() });
    map.addLayer({
      id: 'cells-fill', type: 'fill', source: 'cells',
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': +$('opacity').value / 100 },
    });
    map.addLayer({
      id: 'cells-line', type: 'line', source: 'cells',
      paint: { 'line-color': 'rgba(26,26,26,.16)', 'line-width': 0.5 },
    });
    map.addLayer({
      id: 'cells-selected', type: 'line', source: 'cells',
      filter: ['==', ['get', 'h3'], '__none__'],
      paint: { 'line-color': '#1a1a1a', 'line-width': 2.4 },
    });
    if (Cube.data.ring && Cube.data.ring.length) {
      var ring = Cube.data.ring.slice();
      ring.push(ring[0]);
      map.addSource('n2000', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring } },
      });
      map.addLayer({
        id: 'n2000-line', type: 'line', source: 'n2000',
        paint: { 'line-color': C.accent, 'line-width': 1.6, 'line-dasharray': [3, 2] },
      });
    }
  }

  function onMapClick(ev) {
    var hits = map.queryRenderedFeatures(ev.point, { layers: ['cells-fill'] });
    if (hits.length) {
      var cell = Cube.byH3[hits[0].properties.h3];
      if (cell) { $('toast').hidden = true; showCell(cell); }
      return;
    }
    var ll = ev.lngLat;
    if (liveAvailable) {
      showToast('Buiten de kubus. Live ophalen bij Copernicus voor dit punt?', function () {
        $('toast').hidden = true;
        fetchLive(ll.lng, ll.lat);
      });
    } else {
      showToast('Buiten de kubus. Live ophalen staat uit — zet CDSE_CLIENT_ID '
        + 'en CDSE_CLIENT_SECRET in Vercel om dat aan te zetten.', null);
    }
  }

  /* ── start ──────────────────────────────────────────────── */
  function boot() {
    window.__metricMax = {};
    ['zlow', 'zhigh', 'n'].forEach(function (k) {
      window.__metricMax[k] = Cube.data.cells.reduce(function (m, c) {
        return Math.max(m, c[k] || 0);
      }, 1);
    });

    $('basemap').value = CFG.defaultBasemap;
    map = new maplibregl.Map({
      container: 'map',
      style: basemapStyle(CFG.defaultBasemap),
      center: CFG.map.center,
      zoom: CFG.map.zoom,
      minZoom: CFG.map.minZoom,
      maxZoom: CFG.map.maxZoom,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');

    // 'style.load' in plaats van 'load': dat laatste wacht ook op de tegels van
    // de ondergrond, en een trage of haperende tegelserver mag de hexagonen niet
    // tegenhouden. Vuurt ook opnieuw na elke setStyle, dus de basemap-wissel
    // hangt er vanzelf aan.
    var firstStyle = true;
    map.on('style.load', function () {
      addDataLayers();
      if (selected && selected.h3) {
        map.setFilter('cells-selected', ['==', ['get', 'h3'], selected.h3]);
      }
      if (!firstStyle) return;
      firstStyle = false;
      fitToCube();
      renderLegend();
      renderMeta();
      $('loader').hidden = true;
      restoreURL();
      if (!selected) {
        // open met een cel die iets te vertellen heeft
        var pick = Cube.data.cells.slice().sort(function (a, b) {
          return Math.abs(b.slope || 0) - Math.abs(a.slope || 0);
        })[0];
        if (pick) showCell(pick);
      }
    });
    map.on('click', onMapClick);
    map.on('mousemove', 'cells-fill', function () { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'cells-fill', function () { map.getCanvas().style.cursor = ''; });

    $('metric').onchange = function (e) { metric = e.target.value; refreshFill(); updateURL(); };
    $('only-sig').onchange = function (e) { onlySig = e.target.checked; refreshFill(); updateURL(); };
    $('opacity').oninput = function (e) {
      $('opacity-val').textContent = e.target.value + '%';
      if (map.getLayer('cells-fill')) {
        map.setPaintProperty('cells-fill', 'fill-opacity', +e.target.value / 100);
      }
    };
    $('basemap').onchange = function (e) {
      // style.load hangt de hexagonen er daarna weer aan
      map.setStyle(basemapStyle(e.target.value));
    };
    $('btn-close').onclick = function () {
      selected = null;
      $('d-title').textContent = 'Klik een hexagon';
      $('d-sub').textContent = 'Elke cel is \u00e9\u00e9n Sentinel-2 pixel, 2016 tot 2025.';
      $('d-stats').innerHTML = '';
      $('d-verdict').hidden = true;
      $('grass-cmd').hidden = true;
      ['c-ts', 'c-season', 'c-decomp', 'c-annual'].forEach(function (id) {
        $(id).innerHTML = '';
      });
      this.hidden = true;
      map.setFilter('cells-selected', ['==', ['get', 'h3'], '__none__']);
      updateURL();
    };
    $('btn-share').onclick = function () {
      navigator.clipboard.writeText(location.href).then(function () {
        showToast('Link gekopieerd.', null);
        setTimeout(function () { $('toast').hidden = true; }, 2200);
      });
    };
    $('btn-csv').onclick = function () { if (selected) downloadCSV(selected); };
    $('btn-grass').onclick = function () {
      if (!selected) return;
      var pre = $('grass-cmd');
      pre.textContent = grassCommand(selected);
      pre.hidden = !pre.hidden;
    };
    $('btn-toast-close').onclick = function () { $('toast').hidden = true; };

    checkLive();
  }

  $('loader-text').textContent = 'Kubus laden…';
  Cube.load(CFG.cubeUrl).then(boot).catch(function (e) {
    $('loader').innerHTML = '<div style="max-width:380px;text-align:center">'
      + '<strong>De fenologie-kubus kon niet geladen worden.</strong><br>'
      + '<span style="font-size:12px;color:#8b8d83">' + e.message
      + '<br>Genereer hem met <code>python3 scripts/build_fenologie_cube.py --demo</code>'
      + ' en zet het resultaat in <code>data/</code>.</span></div>';
  });
})();
