// app.js — kaart, interactie en het detailpaneel.
//
// Per pixel, niet per hexagon: de trendkaart is een raster uit de GRASS-
// pipeline (zie scripts/export_fenologie_raster.py) dat als image-source in
// EPSG:3857 op de kaart ligt. Een klik leest de waarde van die ene pixel uit
// het al gedecodeerde raster -- geen netwerk, dus meteen. De onderliggende
// tijdreeks is niet voorberekend en komt op verzoek live van Copernicus.

(function () {
  'use strict';

  var CFG = window.FENO_CONFIG;
  var C = CFG.colors;
  var ALPHA = CFG.alpha || 0.05;   // verschuifbaar, zie het drempelschuifje
  var view = CFG.defaultView || 'pixel';
  var aerialId = 'actueel';

  var map, metric = 'slope', onlySig = false, liveAvailable = null;
  var picked = null;      // { lon, lat, slope, tau, qvalue, count }
  var livePoint = null;   // resultaat van Series.fromLive voor het gekozen punt
  var liveToken = 0;

  var $ = function (id) { return document.getElementById(id); };
  var nl = window.Charts.nl;

  /* ── kleurschalen ───────────────────────────────────────── */
  function hex2rgb(h) {
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16),
            parseInt(h.substr(5, 2), 16)];
  }

  /** Kleurverloop voor een metriek, als stops die Raster.colorize begrijpt. */
  function rampFor(spec) {
    if (spec.type === 'diverging') {
      return [[0, hex2rgb(C.neg)], [0.5, hex2rgb(C.mid)], [1, hex2rgb(C.pos)]];
    }
    var a = hex2rgb('#f2f0e8'), b = hex2rgb(spec.color);
    return spec.invert ? [[0, b], [1, a]] : [[0, a], [1, b]];
  }

  function domainFor(spec) {
    if (spec.type === 'diverging') return [-spec.domain, spec.domain];
    if (spec.domain) return [0, spec.domain];
    var band = Raster.bands[spec.band];
    var hi = Raster.meta.bands[spec.band].max || 1;
    return [0, hi];
  }

  /* ── rasterlaag ─────────────────────────────────────────── */
  function paintRaster() {
    var spec = CFG.metrics[metric];
    var canvas = Raster.colorize({
      band: spec.band,
      ramp: rampFor(spec),
      domain: domainFor(spec),
      // Het significantiefilter slaat alleen ergens op bij een trendmetriek:
      // bij 'bruikbare jaren' zou het de kaart om niets leegmaken.
      onlySig: onlySig && !!spec.qband,
      qband: spec.qband,
      alpha: ALPHA,
    });
    var src = map.getSource('trend');
    if (src) src.updateImage({ url: canvas.toDataURL() });
    renderLegend();
    updateSigHint();
  }

  /* Na FDR-correctie kan het filter alle pixels wegnemen. Dat is een geldige
     uitkomst, geen laadfout, dus zeg het er expliciet bij. */
  /* Het drempelschuifje maakt de afweging uit par. 5.3 van het rapport
     zichtbaar: te streng mist veranderingen, te los levert valse positieven.
     Bij een FDR-correctie is die afweging uitzonderlijk goed uit te leggen,
     want alpha IS de verwachte fractie onterechte vondsten onder wat je
     markeert. Vandaar dat de hint niet alleen het aantal toont maar ook
     hoeveel daarvan naar verwachting onterecht is. */
  function updateSigHint() {
    var el = $('sig-hint');
    if (!el) return;
    var spec = CFG.metrics[metric];
    var actief = onlySig && !!spec.qband;
    $('alpha-row').hidden = !actief;
    if (!actief) { el.hidden = true; return; }

    var eenheid = Raster.meta.aggregation
      ? (Raster.meta.aggregation.by === 'grid' ? 'cellen' : 'zones')
      : 'pixels';
    var n = Raster.countSignificant(ALPHA, spec.qband);
    var tot = Raster.countValid(spec.band);
    el.hidden = false;

    if (n === 0) {
      el.textContent = 'Geen enkele van de ' + tot.toLocaleString('nl-NL') + ' '
        + eenheid + ' haalt q < ' + nl(ALPHA, 2) + '. Schuif de drempel omhoog '
        + 'om te zien wat er dan verschijnt — en wat dat aan zekerheid kost.';
      return;
    }
    var fout = Math.round(n * ALPHA);
    el.textContent = n.toLocaleString('nl-NL') + ' van ' + tot.toLocaleString('nl-NL')
      + ' ' + eenheid + ' bij q < ' + nl(ALPHA, 2) + '. Daarvan '
      + (fout === 0 ? 'is er naar verwachting minder dan één onterecht.'
                    : 'zijn er naar verwachting ~' + fout + ' onterecht.');
  }

  /* ── "Waar moet ik kijken?" ─────────────────────────────── */
  /* Het rapport (par. 5.1) zegt dat de meerwaarde van deze methode zit in het
     selecteren van locaties waar veldbezoek het meest relevant is. Een kaart
     alleen doet dat niet: je moet de gekleurde vlekken zelf zien te vinden en
     onderling wegen. Deze lijst doet dat wegen expliciet. */
  function renderShortlist() {
    var box = $('shortlist');
    if (!box) return;
    // Bij een zoneweergave is "aaneengesloten vlekken zoeken" zinloos: de
    // vlekken zijn de zones. Dan tonen we de sterkste zones uit de tabel die
    // het aggregatiescript in meta.json heeft gezet.
    if (Raster.meta.aggregation) { renderZoneList(); return; }
    var cfg = CFG.shortlist || { aantal: 6, minPixels: 12 };
    var all = Raster.clusters({ alpha: ALPHA, minPixels: cfg.minPixels });
    var top = all.slice(0, cfg.aantal);

    if (!all.length) {
      box.hidden = false;
      $('shortlist-sub').textContent = 'Geen enkele aaneengesloten plek houdt '
        + 'stand na correctie voor het aantal getoetste pixels. Dat is bij tien '
        + 'jaar data een normale uitkomst, geen storing.';
      $('shortlist-items').innerHTML = '';
      return;
    }

    var dalend = all.filter(function (c) { return c.meanSlope < 0; }).length;
    box.hidden = false;
    $('shortlist-sub').textContent = all.length + ' aaneengesloten plek'
      + (all.length === 1 ? '' : 'ken') + ' van minstens ' + cfg.minPixels
      + ' pixels, ' + dalend + ' dalend. Gesorteerd op oppervlak × sterkte '
      + 'van de trend.';

    var ol = $('shortlist-items');
    ol.innerHTML = '';
    top.forEach(function (c, i) {
      var li = document.createElement('li');
      li.className = 'shortlist-item ' + (c.meanSlope < 0 ? 'down' : 'up');
      li.innerHTML =
        '<span class="sl-rank">' + (i + 1) + '</span>'
        + '<span class="sl-body">'
        + '<span class="sl-main">' + (c.meanSlope < 0 ? 'Afname' : 'Toename')
        + ' · ' + nl(c.hectare, c.hectare < 1 ? 2 : 1) + ' ha</span>'
        + '<span class="sl-sub">' + (c.meanSlope > 0 ? '+' : '−')
        + nl(Math.abs(c.meanSlope), 4) + ' ' + Raster.meta.index + '/jaar gemiddeld'
        + ' · ' + nl(c.lat, 4) + ' N, ' + nl(c.lon, 4) + ' E</span>'
        + '</span>';
      li.title = 'Zoom naar deze plek en open de sterkste pixel erin';
      li.onclick = function () {
        map.jumpTo({ center: [c.lon, c.lat], zoom: 15 });
        showPixel(c.lon, c.lat);
      };
      ol.appendChild(li);
    });
  }

  /* De sterkste zones, op q gesorteerd door het aggregatiescript. */
  function renderZoneList() {
    var m = Raster.meta, agg = m.aggregation;
    var rows = (agg.table || []).slice(0, (CFG.shortlist || {}).aantal || 6);
    $('shortlist').hidden = false;
    $('shortlist-sub').textContent = agg.zones_tested + ' zones getoetst van '
      + agg.zones_total + ' (' + (agg.zones_total - agg.zones_tested)
      + ' te klein). Gesorteerd op q; ' + agg.zones_significant + ' significant.';
    var ol = $('shortlist-items');
    ol.innerHTML = '';
    rows.forEach(function (r, i) {
      var li = document.createElement('li');
      li.className = 'shortlist-item ' + (r.slope < 0 ? 'down' : 'up');
      li.innerHTML = '<span class="sl-rank">' + (i + 1) + '</span>'
        + '<span class="sl-body"><span class="sl-main">' + esc(r.zone)
        + ' · ' + (r.slope < 0 ? 'afname' : 'toename') + '</span>'
        + '<span class="sl-sub">' + (r.slope > 0 ? '+' : '−')
        + nl(Math.abs(r.slope), 4) + ' ' + m.index + '/jaar · τ '
        + nl(r.tau, 2) + ' · q ' + (r.q < 0.001 ? '< 0,001' : nl(r.q, 3))
        + ' · ' + r.pixels.toLocaleString('nl-NL') + ' px</span></span>';
      ol.appendChild(li);
    });
  }

  /* De kaartlagen komen uit de config, niet uit de HTML: sommige bestaan
     alleen op bepaalde weergaven (de piek-, dal- en bereiktrend vragen de
     volledige waarnemingsreeks per eenheid, en die is er alleen op het grid). */
  function renderMetricOptions() {
    var sel = $('metric');
    sel.innerHTML = '';
    var beschikbaar = [];
    Object.keys(CFG.metrics).forEach(function (id) {
      var m = CFG.metrics[id];
      if (m.views && m.views.indexOf(view) < 0) return;
      if (!Raster.meta.bands[m.band]) return;   // band ontbreekt in deze weergave
      beschikbaar.push(id);
      var o = document.createElement('option');
      o.value = id;
      o.textContent = m.label + (m.unit ? ' (' + m.unit + ')' : '');
      sel.appendChild(o);
    });
    if (beschikbaar.indexOf(metric) < 0) metric = beschikbaar[0] || 'slope';
    sel.value = metric;
  }

  /* ── legenda ────────────────────────────────────────────── */
  function renderLegend() {
    var spec = CFG.metrics[metric];
    var d = domainFor(spec);
    var grad, lo, hi;
    if (spec.type === 'diverging') {
      grad = 'linear-gradient(90deg,' + C.neg + ',' + C.mid + ',' + C.pos + ')';
    } else if (spec.invert) {
      grad = 'linear-gradient(90deg,' + spec.color + ',#f2f0e8)';
    } else {
      grad = 'linear-gradient(90deg,#f2f0e8,' + spec.color + ')';
    }
    lo = spec.fmt(d[0]);
    hi = spec.fmt(d[1]);
    $('legend').innerHTML =
      '<div class="bar" style="background:' + grad + '"></div>' +
      '<div class="ends"><span>' + lo + '</span><span>' + spec.unit
      + '</span><span>' + hi + '</span></div>' +
      '<div class="note">' + spec.note + '</div>';
  }

  function renderMeta() {
    var m = Raster.meta;
    var badge = m.demo
      ? '<span class="badge">demo-data</span><br>'
      : '<span class="badge live">' + m.source + '</span><br>';
    var px = Raster.countValid();
    $('meta-block').innerHTML = badge +
      px.toLocaleString('nl-NL') + ' pixels &middot; ' + m.width + '&times;' + m.height
      + ' &middot; ' + m.period[0].slice(0, 4) + '–' + m.period[1].slice(0, 4)
      + ' &middot; ' + m.index + '<br>' +
      'Jaarstatistiek: <code>' + m.stat + '</code>. ' + m.method + '<br>' +
      (m.aggregation
        ? m.aggregation.zones_significant + ' van ' + m.aggregation.zones_tested
          + ' zones significant bij q &lt; ' + nl(m.fdr_alpha, 2) + '.'
        : m.pixels_significant.toLocaleString('nl-NL')
          + ' pixels significant bij q &lt; ' + nl(m.fdr_alpha, 2) + '.') +
      (m.demo ? '<br><strong>Let op:</strong> gesimuleerd trendveld. Draai '
        + '<code>export_fenologie_raster.py --from-grass</code> voor de echte kaart.'
        : '');
  }

  /* ── detailpaneel ───────────────────────────────────────── */
  function statRow(label, value, unit) {
    return '<div><dt>' + label + '</dt><dd>' + value +
      (unit ? ' <span class="unit">' + unit + '</span>' : '') + '</dd></div>';
  }

  function fmtP(v) {
    if (v === null || v === undefined || isNaN(v)) return '–';
    return v < 0.001 ? '< 0,001' : '= ' + nl(v, 3);
  }

  /** Toont de rastercijfers van een pixel. De reeks komt pas op verzoek. */
  function showPixel(lon, lat) {
    var vals = Raster.valuesAt(lon, lat);
    if (!vals) {
      showToast('Buiten het onderzoeksgebied — hier is geen trend berekend.', null);
      return;
    }
    picked = { lon: lon, lat: lat, slope: vals.slope, tau: vals.tau,
               qvalue: vals.qvalue, count: vals.count };
    livePoint = null;
    liveToken++;

    var idx = Raster.meta.index;
    var agg = Raster.meta.aggregation;
    var eenheid = { type: 'Beheertype', polygon: 'Beheerperceel',
                    grid: 'Gridcel ' + (agg && agg.cell_m) + ' m' };
    $('d-title').textContent = agg
      ? (eenheid[agg.by] || 'Zone')
      : 'Pixel — ' + Math.round(pixelMetres()) + ' m';
    $('d-sub').textContent = nl(lat, 5) + ' N, ' + nl(lon, 5) + ' E  ·  '
      + Raster.meta.crs;

    /* De tegels volgen de GEKOZEN kaartlaag. Op de gridweergave bestaan vier
       trends naast elkaar (niveau, piek, dal, bereik); altijd het niveau tonen
       terwijl je naar de bereikkaart kijkt is misleidend. */
    var spec = CFG.metrics[metric];
    var suffix = (spec.band || '').replace(/^slope/, '');
    var sv = vals[spec.band] !== undefined && spec.qband ? vals[spec.band] : vals.slope;
    var tv = vals['tau' + suffix] !== undefined ? vals['tau' + suffix] : vals.tau;
    var qv = spec.qband && vals[spec.qband] !== undefined ? vals[spec.qband] : vals.qvalue;
    var statNaam = spec.qband && suffix
      ? spec.label.replace(/^Trend in (het|de) /, '')
      : null;

    var sig = qv !== null && qv < ALPHA;
    var toets = 'τ = ' + nl(tv, 2) + ', q ' + fmtP(qv)
      + ' (Mann-Kendall + FDR, n = ' + (vals.count === null ? '?' : Math.round(vals.count)) + ')';

    $('d-stats').innerHTML =
      statRow(statNaam || 'trend', (sv > 0 ? '+' : '−')
        + nl(Math.abs(sv), 4), idx + '/jaar') +
      statRow('τ', nl(tv, 2), '') +
      statRow('q', qv === null ? '–'
        : (qv < 0.001 ? '< 0,001' : nl(qv, 3)), '') +
      statRow('jaren', vals.count === null ? '–' : Math.round(vals.count), 'met curve') +
      (agg ? statRow('eenheid', agg.zones_tested + ' van ' + agg.zones_total,
                     'zones getoetst') : '');

    var v = $('d-verdict');
    if (!sig) {
      v.className = 'verdict flat';
      v.textContent = 'Geen significante trend: ' + toets + '. De variatie tussen '
        + 'jaren overheerst — met tien jaar data is dat de normale uitkomst.';
    } else if (vals.slope > 0) {
      v.className = 'verdict up';
      v.textContent = 'Het ' + (statNaam || 'seizoensniveau') + ' loopt op. ' + toets + '. Denk aan '
        + 'verlanding, opslag, gestopt maaibeheer of een verandering in waterpeil.';
    } else {
      v.className = 'verdict down';
      v.textContent = 'Het ' + (statNaam || 'seizoensniveau') + ' daalt. ' + toets + '. Kandidaat voor '
        + 'veldbezoek: leg dit naast beheerregistraties en waterstanden voordat '
        + 'je het als achteruitgang leest.';
    }

    ['c-annual', 'c-ts', 'c-season', 'c-decomp'].forEach(function (id) {
      $(id).innerHTML = '';
    });
    $('grass-cmd').hidden = true;
    $('detail').hidden = false;
    markPixel(lon, lat);
    renderIngrepen(lon, lat);

    // De reeks is vooraf opgehaald: direct tekenen in plaats van een knop die
    // tien tot veertig seconden op Copernicus wacht. Eerst de zone (fijnst wat
    // we hebben), anders de gridcel die het gebied dekkend afdekt.
    var zoneIdx = (agg && vals.zone) ? Math.round(vals.zone) : null;
    livePoint = zoneIdx ? Series.fromZone(zoneIdx, lon, lat) : null;
    if (livePoint) {
      renderCharts();
      if (livePoint.zone) $('d-title').textContent += ' · ' + livePoint.zone;
      updateURL();
      return;
    }

    var token = ++liveToken;
    $('chart-status').hidden = false;
    $('chart-status').textContent = 'Reeks laden…';
    Series.loadGrid(CFG.gridSeriesUrl).then(function () {
      if (token !== liveToken) return;
      livePoint = Series.fromGrid(lon, lat);
      if (livePoint) {
        renderCharts();
        $('d-title').textContent += ' · ' + livePoint.zone;
      } else {
        updateSeriesPrompt();
      }
    });
    updateURL();
  }

  /* Beheeringrepen die op deze pixel van toepassing zijn. Zonder die context
     is een dip in de reeks een raadsel (hoofdstuk 5.3.2 van het rapport). */
  function renderIngrepen(lon, lat) {
    var ul = $('ingrepen-list');
    if (!ul) return;
    var lijst = Ingrepen.near(lon, lat);
    if (!lijst.length) { ul.hidden = true; ul.innerHTML = ''; return; }
    ul.hidden = false;
    ul.innerHTML = (Ingrepen.voorbeeld
      ? '<li class="ingreep-waarschuwing">Onderstaande ingrepen zijn '
        + '<strong>verzonnen voorbeelddata</strong>, net als de trendkaart. '
        + 'Vervang ze door de echte beheerregistraties in '
        + '<code>ingrepen.json</code>.</li>'
      : '')
      + lijst.map(function (g) {
        var d = g.start.toISOString().slice(0, 10).split('-').reverse().join('-');
        var per = g.eind
          ? d + ' t/m ' + g.eind.toISOString().slice(0, 10).split('-').reverse().join('-')
          : d;
        return '<li><span class="ingreep-dot" style="background:' + g.kleur + '"></span>'
          + '<span><strong>' + esc(g.type) + '</strong> · ' + per
          + (g.omschrijving ? '<br><span class="ingreep-om">' + esc(g.omschrijving)
             + '</span>' : '') + '</span></li>';
      }).join('');
  }

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /** Ruwe pixelgrootte op de grond, uit de 3857-bounds gedeeld door de breedte. */
  function pixelMetres() {
    var m = Raster.meta;
    var b = m.bounds_3857;
    var lat = (m.corners[0][1] + m.corners[2][1]) / 2;
    return ((b[2] - b[0]) / m.width) * Math.cos(lat * Math.PI / 180);
  }

  /* De reeks is niet voorberekend: 550.000 pixels x tien jaar past niet in een
     statische download. Een klik geeft dus meteen de trendcijfers uit het
     raster, en de reeks eronder alleen op verzoek. */
  function updateSeriesPrompt() {
    var box = $('chart-status');
    box.hidden = false;
    if (livePoint) { box.hidden = true; return; }
    if (Raster.meta.aggregation && !Series.zones) {
      box.innerHTML = 'De reeksen van deze weergave konden niet geladen worden. '
        + 'Draai <code>scripts/build_fenologie_series.py</code> om ze te maken.';
      return;
    }
    if (liveAvailable === false) {
      box.innerHTML = 'De tijdreeks achter deze pixel is niet voorberekend en '
        + 'live ophalen staat uit. Zet <code>CDSE_CLIENT_ID</code> en '
        + '<code>CDSE_CLIENT_SECRET</code> in Vercel om dat aan te zetten.';
      return;
    }
    box.innerHTML = '';
    var b = document.createElement('button');
    b.className = 'btn';
    b.textContent = '↓ Reeks ophalen bij Copernicus (10–40 s)';
    b.onclick = function () { fetchSeries(picked.lon, picked.lat); };
    box.appendChild(b);
  }

  function fetchSeries(lon, lat) {
    var token = ++liveToken;
    var period = Raster.meta.period;
    $('chart-status').textContent = 'Reeks ophalen bij Copernicus… '
      + 'dit duurt 10–40 seconden.';
    return fetch(CFG.liveUrl + '?lon=' + lon.toFixed(5) + '&lat=' + lat.toFixed(5)
                 + '&start=' + period[0] + '&end=' + period[1])
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || r.status); });
        return r.json();
      })
      .then(function (payload) {
        if (token !== liveToken) return;
        if (!payload.observations || payload.observations.length < 20) {
          throw new Error('te weinig wolkvrije waarnemingen op dit punt');
        }
        livePoint = Series.fromLive(payload, lon, lat);
        renderCharts();
      })
      .catch(function (e) {
        if (token !== liveToken) return;
        $('chart-status').hidden = false;
        $('chart-status').textContent = 'De reeks kon niet opgehaald worden: ' + e.message;
      });
  }

  function renderCharts() {
    var idx = Raster.meta.index;
    var series = livePoint._series;
    $('chart-status').hidden = true;
    Charts.annual($('c-annual'), livePoint);
    Charts.timeseries($('c-ts'), $('tt-ts'), series, idx,
      Ingrepen.near(picked.lon, picked.lat));
    Charts.season($('c-season'), series);
    Charts.decomposition($('c-decomp'), Series.decompose(livePoint));
  }

  /* ── markering van de gekozen pixel ─────────────────────── */
  function pickGeoJSON() {
    if (!picked) return { type: 'FeatureCollection', features: [] };
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature', properties: {},
        geometry: { type: 'Point', coordinates: [picked.lon, picked.lat] },
      }],
    };
  }

  function markPixel(lon, lat) {
    var src = map.getSource('pick');
    if (src) src.setData(pickGeoJSON());
  }

  /* Haalt de ruwe reeks van dit punt uit de STRDS. t.rast.what verwacht
     coordinaten in het CRS van de location, vandaar de m.proj-stap. Voor een
     echte additieve STL bestaat de add-on t.rast.stl (hoofdstuk 11 van het
     rapport); die werkt per locatie en de aanroep is hier bewust niet
     ingevuld, omdat het rapport alleen de naam noemt en niet de parameters. */
  function grassCommand(p) {
    var idx = Raster.meta.index.toLowerCase();
    var ll = p.lon.toFixed(5) + ' ' + p.lat.toFixed(5);
    return 'xy=$(echo "' + ll + '" \\\n'
      + '  | m.proj -i input=- proj_in=EPSG:4326 separator=space \\\n'
      + '  | cut -d" " -f1,2 | tr " " ",")\n\n'
      + 't.rast.what strds=S2_' + idx + ' coordinates="$xy" \\\n'
      + '  layout=col null_value="*" separator="|" \\\n'
      + '  output=punt.csv';
  }

  function downloadCSV() {
    if (!livePoint) return;
    var idx = Raster.meta.index.toLowerCase();
    var lines = ['datum,doy,' + idx + ',referentie,robuuste_sd,z'];
    livePoint._series.obs.forEach(function (o) {
      lines.push([o.iso, o.doy, o.value.toFixed(4),
        o.baseline === null ? '' : o.baseline.toFixed(4),
        o.sd === null ? '' : o.sd.toFixed(4),
        o.z === null ? '' : o.z.toFixed(3)].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fenologie_' + picked.lat.toFixed(5) + '_' + picked.lon.toFixed(5) + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ── live openEO ────────────────────────────────────────── */
  function checkLive() {
    return fetch(CFG.liveUrl + '?probe=1').then(function (r) {
      liveAvailable = r.ok;
      if (picked) updateSeriesPrompt();
      return liveAvailable;
    }).catch(function () {
      liveAvailable = false;
      if (picked) updateSeriesPrompt();
      return false;
    });
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
    if (view !== (CFG.defaultView || 'pixel')) p.set('view', view);
    if ($('basemap').value !== CFG.defaultBasemap) p.set('base', $('basemap').value);
    if (aerialId !== 'actueel') p.set('jaar', aerialId);
    if (onlySig) p.set('sig', '1');
    if (Math.abs(ALPHA - (CFG.alpha || 0.05)) > 1e-9) p.set('alpha', ALPHA.toFixed(2));
    if (picked) {
      p.set('lon', picked.lon.toFixed(5));
      p.set('lat', picked.lat.toFixed(5));
    }
    history.replaceState(null, '', location.pathname + '?' + p.toString());
  }

  function restoreURL() {
    var p = new URLSearchParams(location.search);
    if (p.get('metric') && CFG.metrics[p.get('metric')]) {
      metric = p.get('metric');
      $('metric').value = metric;
    }
    if (p.get('sig') === '1') { onlySig = true; $('only-sig').checked = true; }
    var a = parseFloat(p.get('alpha'));
    if (!isNaN(a) && a >= 0.01 && a <= 0.5) {
      ALPHA = a;
      $('alpha').value = Math.round(a * 100);
      $('alpha-val').textContent = nl(a, 2);
    }
    if (p.get('jaar') && (CFG.aerial || []).some(function (a) { return a.id === p.get('jaar'); })) {
      aerialId = p.get('jaar');
    }
    var base = p.get('base');
    if (base && CFG.basemaps[base]) {
      $('basemap').value = base;
      setBasemap(base);
    }
    renderAerialStrip();

    var lon = parseFloat(p.get('lon')), lat = parseFloat(p.get('lat'));
    var hasPoint = !isNaN(lon) && !isNaN(lat);
    function openPoint() {
      if (!hasPoint) return;
      showPixel(lon, lat);
      map.jumpTo({ center: [lon, lat], zoom: 14.2 });
    }

    // Een weergavewissel laadt asynchroon. Het punt pas openen als die klaar
    // is, anders wordt het tegen de nog geladen pixelkaart getoetst en meldt
    // de viewer "buiten het onderzoeksgebied" voor een punt dat in een zone
    // ligt.
    var vw = p.get('view');
    if (vw && vw !== view && (CFG.views || []).some(function (x) { return x.id === vw; })) {
      $('view').value = vw;
      switchView(vw, openPoint);
    } else {
      openPoint();
    }
  }

  /* ── kaart ──────────────────────────────────────────────── */
  /* De luchtfoto kan een ander opnamejaar zijn dan "nu". Zelfde PDOK-archief
     als pdok-viewer gebruikt; de reeks 2016-2025 dekt precies de periode van
     de trendkaart, zodat je een trend visueel kunt narekenen. */
  function aerialSpec() {
    var list = CFG.aerial || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === aerialId) return list[i];
    return list[0];
  }

  /* setStyle() doet standaard een DIFF: MapLibre vergelijkt de oude stijl met
     de nieuwe en past alleen de verschillen toe. Onze `trend`- en `pick`-lagen
     zitten niet in de nieuwe stijl, dus de diff besluit dat ze weg moeten --
     en omdat het een diff is en geen volledige herlaadbeurt vuurt 'style.load'
     niet, dus zet niets ze terug. Gevolg: na een wissel van ondergrond of
     opnamejaar was de trendkaart weg tot je herlaadde.

     diff: false dwingt een volledige herlaadbeurt af, en dan vuurt
     'style.load' wel. Kost een korte flits van de ondergrond; dat is de prijs
     voor lagen die blijven staan. */
  function setBasemap(key) {
    map.setStyle(basemapStyle(key), { diff: false });
  }

  function basemapStyle(key) {
    var b = CFG.basemaps[key] || CFG.basemaps[CFG.defaultBasemap];
    if (key === 'luchtfoto' && CFG.aerialBase) {
      var a = aerialSpec();
      b = {
        tiles: [CFG.aerialBase.replace('%LAYER%', a.layer)],
        tileSize: b.tileSize,
        maxzoom: b.maxzoom,
        attribution: '&copy; Kadaster / PDOK &mdash; luchtfoto ' + a.layer,
      };
    }
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

  /** Zoom naar het raster, zodat het gebied op elk schermformaat past. */
  function fitToRaster() {
    var c = Raster.meta.corners;
    var lons = c.map(function (p) { return p[0]; });
    var lats = c.map(function (p) { return p[1]; });
    // Het bedieningspaneel zweeft links over de kaart; houd daar ruimte voor
    // vrij zodat het gebied er niet achter verdwijnt.
    var wide = window.innerWidth > 820;
    map.fitBounds(
      [[Math.min.apply(null, lons), Math.min.apply(null, lats)],
       [Math.max.apply(null, lons), Math.max.apply(null, lats)]],
      {
        padding: {
          top: wide ? 24 : 56,
          bottom: wide ? 40 : 30,
          left: wide ? 340 : 18,
          right: wide ? 32 : 18,
        },
        duration: 0,
      });
  }

  function addDataLayers() {
    if (map.getSource('trend')) return;
    var spec = CFG.metrics[metric];
    var canvas = Raster.colorize({
      band: spec.band,
      ramp: rampFor(spec),
      domain: domainFor(spec),
      onlySig: onlySig && !!spec.qband,
      qband: spec.qband,
      alpha: ALPHA,
    });
    map.addSource('trend', {
      type: 'image',
      url: canvas.toDataURL(),
      coordinates: Raster.meta.corners,
    });
    map.addLayer({
      id: 'trend', type: 'raster', source: 'trend',
      paint: {
        'raster-opacity': +$('opacity').value / 100,
        // Nearest: elke pixel is een meetwaarde, geen plaatje. Interpolatie
        // zou waarden suggereren die niet berekend zijn.
        'raster-resampling': 'nearest',
        'raster-fade-duration': 0,
      },
    });
    map.addSource('pick', { type: 'geojson', data: pickGeoJSON() });
    map.addLayer({
      id: 'pick', type: 'circle', source: 'pick',
      paint: {
        'circle-radius': 5,
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': C.ink,
        'circle-stroke-width': 2,
      },
    });
  }

  /* setStyle() gooit alle sources en layers weg. Het opnieuw toevoegen hing
     alleen aan 'style.load', en dat signaal is hier niet betrouwbaar: als de
     tegelserver hapert komt de stijl soms nooit "klaar". Gevolg was dat de
     trendkaart na een wissel van ondergrond of opnamejaar weg bleef tot je
     herlaadde.

     Geen isStyleLoaded()-guard: die is juist false op het moment dat het
     misgaat, dus dan doet het herstel niets. In plaats daarvan gewoon
     proberen en de "Style is not done loading"-fout opvangen -- een van de
     volgende signalen probeert het dan opnieuw. Toevoegen is idempotent. */
  function ensureDataLayers() {
    if (!map || map.getSource('trend')) return;
    try {
      addDataLayers();
      if (picked) markPixel(picked.lon, picked.lat);
    } catch (e) {
      // stijl nog niet zover; styledata / idle / load proberen het opnieuw
    }
  }

  function onMapClick(ev) {
    $('toast').hidden = true;
    showPixel(ev.lngLat.lng, ev.lngLat.lat);
  }

  /* Wissel van analyse-eenheid: zelfde reeks, andere schaal waarop getoetst
     wordt. Alle weergaven delen hetzelfde grid, dus alleen de banden en de
     meta veranderen -- de image-source hoeft niet opnieuw aangemaakt. */
  function switchView(id, done) {
    var v = (CFG.views || []).filter(function (x) { return x.id === id; })[0];
    if (!v) return;
    var prev = view;
    view = id;
    $('loader').hidden = false;
    $('loader-text').textContent = 'Trendkaart laden…';
    Raster.bands = {};
    Series.zones = null;
    var jobs = [Raster.load(v.base)];
    if (v.series) jobs.push(Series.loadZones(v.series));
    Promise.all(jobs).then(function () {
      $('loader').hidden = true;
      renderMetricOptions();
      paintRaster();
      renderMeta();
      renderShortlist();
      if (picked) showPixel(picked.lon, picked.lat);
      if (done) done();
      updateURL();
    }).catch(function (e) {
      view = prev;
      $('view').value = prev;
      $('loader').hidden = true;
      showToast('Deze weergave kon niet geladen worden: ' + e.message
        + '. Draai scripts/aggregate_fenologie_zones.py om hem te maken.', null);
    });
  }

  /* Jaarstrip onder de ondergrondkeuze, alleen zichtbaar bij de luchtfoto. */
  function renderAerialStrip() {
    var box = $('aerial');
    if (!box) return;
    var isAerial = $('basemap').value === 'luchtfoto';
    box.hidden = !isAerial;
    if (!isAerial) return;

    var strip = $('aerial-strip');
    if (!strip.childElementCount) {
      (CFG.aerial || []).forEach(function (a) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'aerial-pip';
        b.dataset.id = a.id;
        b.textContent = a.label;
        b.title = a.year
          ? a.year + ' ' + a.season + ', ' + a.res
          : 'meest recente opname, ' + a.res;
        b.onclick = function () {
          aerialId = a.id;
          setBasemap('luchtfoto');
          renderAerialStrip();
          updateURL();
        };
        strip.appendChild(b);
      });
    }
    var cur = aerialSpec();
    Array.prototype.forEach.call(strip.children, function (el) {
      el.classList.toggle('on', el.dataset.id === aerialId);
    });
    $('aerial-info').textContent = cur.year
      ? '· ' + cur.season + ', ' + cur.res
      : '· ' + cur.res;
  }

  /* ── uitleg ─────────────────────────────────────────────── */
  /* Bij het eerste bezoek vanzelf, daarna via de ?-knop. De keuze staat in
     localStorage: dat is per browser en overleeft geen andere machine, maar
     voor "heb ik dit al gelezen" is dat precies genoeg. Blijft de opslag
     ontoegankelijk (privémodus, geblokkeerde site-data), dan valt het terug op
     "wel tonen" -- liever een keer te veel uitleg dan een viewer zonder. */
  var INTRO_KEY = 'fenologie.intro.gezien';

  function introSeen() {
    try { return localStorage.getItem(INTRO_KEY) === '1'; }
    catch (e) { return false; }
  }

  function openIntro() {
    $('intro').hidden = false;
    $('btn-intro-go').focus();
    document.addEventListener('keydown', introKey);
  }

  function closeIntro() {
    $('intro').hidden = true;
    document.removeEventListener('keydown', introKey);
    try { localStorage.setItem(INTRO_KEY, '1'); } catch (e) { /* niet erg */ }
    $('btn-help').focus();
  }

  function introKey(e) {
    if (e.key === 'Escape') closeIntro();
  }

  /* ── start ──────────────────────────────────────────────── */
  function boot() {
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

    // Deze vier lezen alleen uit Raster, niet uit de kaart. Ze hingen eerst aan
    // 'style.load' en verdwenen dus zodra de tegelserver haperde, terwijl de
    // cijfers al lang in het geheugen stonden.
    renderMetricOptions();
    renderLegend();
    renderMeta();
    updateSigHint();
    renderShortlist();
    renderAerialStrip();

    // De loader hoort bij het laden van de DATA, niet van de ondergrond. Hij
    // hing eerst aan 'style.load' en bleef daardoor staan zodra de
    // PDOK-tegelserver haperde -- terwijl de trendkaart al in het geheugen
    // stond. Hetzelfde geldt voor de permalink: die heeft de kaart alleen
    // nodig voor jumpTo, en dat verdraagt een nog niet geladen stijl.
    $('loader').hidden = true;
    restoreURL();

    // 'style.load' in plaats van 'load': dat laatste wacht ook op de tegels van
    // de ondergrond, en een trage tegelserver mag de trendkaart niet ophouden.
    // Vuurt ook opnieuw na elke setStyle, dus de basemap-wissel hangt er
    // vanzelf aan.
    var firstStyle = true;
    map.on('style.load', function () {
      addDataLayers();
      if (picked) markPixel(picked.lon, picked.lat);
      if (!firstStyle) return;
      firstStyle = false;
      // Niet de uitsnede overschrijven als de permalink al een plek koos.
      if (!picked) fitToRaster();
    });
    /* setStyle() gooit alle sources en layers weg; de trendlaag moet er daarna
       weer bij. Dat hing alleen aan 'style.load', en die vuurt in de praktijk
       niet altijd -- dezelfde oorzaak als de loader die bleef hangen. Gevolg:
       na een wissel van ondergrond of opnamejaar was de trendkaart weg tot je
       de pagina herlaadde. Daarom hangt het herstel nu aan meerdere signalen;
       addDataLayers() is idempotent, dus vaker aanroepen kost niets. */
    map.on('styledata', ensureDataLayers);
    map.on('idle', ensureDataLayers);
    map.on('load', ensureDataLayers);
    map.on('sourcedata', ensureDataLayers);

    map.on('click', onMapClick);
    map.on('mousemove', function (ev) {
      var over = Raster.indexAt(ev.lngLat.lng, ev.lngLat.lat) >= 0;
      map.getCanvas().style.cursor = over ? 'crosshair' : '';
    });

    var vsel = $('view');
    (CFG.views || []).forEach(function (v) {
      var o = document.createElement('option');
      o.value = v.id; o.textContent = v.label;
      vsel.appendChild(o);
    });
    vsel.value = view;
    vsel.onchange = function (e) { switchView(e.target.value); };

    $('metric').onchange = function (e) {
      metric = e.target.value;
      paintRaster();
      if (picked) showPixel(picked.lon, picked.lat);   // tegels volgen de kaartlaag
      updateURL();
    };
    $('only-sig').onchange = function (e) {
      onlySig = e.target.checked;
      paintRaster();
      updateURL();
    };
    $('alpha').oninput = function (e) {
      ALPHA = +e.target.value / 100;
      $('alpha-val').textContent = nl(ALPHA, 2);
      paintRaster();
      if (picked) showPixel(picked.lon, picked.lat);   // verdict volgt de drempel
      updateURL();
    };
    $('opacity').oninput = function (e) {
      $('opacity-val').textContent = e.target.value + '%';
      if (map.getLayer('trend')) {
        map.setPaintProperty('trend', 'raster-opacity', +e.target.value / 100);
      }
    };
    $('btn-collapse').onclick = function () {
      var card = $('controls');
      card.classList.toggle('collapsed');
      this.textContent = card.classList.contains('collapsed') ? '+' : '−';
    };
    $('basemap').onchange = function (e) {
      // style.load hangt de trendlaag er daarna weer aan
      setBasemap(e.target.value);
      renderAerialStrip();
      updateURL();
    };
    $('btn-close').onclick = function () {
      $('detail').hidden = true;
      picked = null;
      livePoint = null;
      liveToken++;
      $('chart-status').hidden = true;
      markPixel();
      updateURL();
    };
    $('btn-share').onclick = function () {
      navigator.clipboard.writeText(location.href).then(function () {
        showToast('Link gekopieerd.', null);
        setTimeout(function () { $('toast').hidden = true; }, 2200);
      });
    };
    $('btn-csv').onclick = function () {
      if (!picked) return;
      if (!livePoint) {
        showToast('Haal eerst de reeks op; zonder reeks valt er niets te exporteren.', null);
        return;
      }
      downloadCSV();
    };
    $('btn-grass').onclick = function () {
      if (!picked) return;
      var pre = $('grass-cmd');
      pre.textContent = grassCommand(picked);
      pre.hidden = !pre.hidden;
    };
    $('btn-toast-close').onclick = function () { $('toast').hidden = true; };

    $('btn-help').onclick = openIntro;
    $('btn-intro-go').onclick = closeIntro;
    $('btn-intro-close').onclick = closeIntro;
    $('intro').onclick = function (e) { if (e.target === this) closeIntro(); };
    if (!introSeen()) openIntro();

    checkLive();
    // Voorbeelddata alleen bij een demo-kaart, zodat verzonnen ingrepen nooit
    // naast echte metingen komen te staan.
    Ingrepen.load(Raster.meta.demo ? CFG.ingrepenVoorbeeldUrl : CFG.ingrepenUrl)
      .then(function () { if (picked) renderIngrepen(picked.lon, picked.lat); });
  }

  $('loader-text').textContent = 'Trendkaart laden…';
  Raster.load(CFG.rasterBase).then(boot).catch(function (e) {
    $('loader').innerHTML = '<div style="max-width:420px;text-align:center">'
      + '<strong>De trendkaart kon niet geladen worden.</strong><br>'
      + '<span style="font-size:12px;color:#8b8d83">' + e.message
      + '<br>Genereer hem met <code>python3 scripts/export_fenologie_raster.py --demo</code>'
      + ' of, met een GRASS-sessie, <code>--from-grass</code>.</span></div>';
  });
})();
