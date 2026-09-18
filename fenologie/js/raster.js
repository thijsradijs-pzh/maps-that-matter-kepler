// raster.js — laden, decoderen en inkleuren van de per-pixel trendkaarten.
//
// Formaat: zie scripts/export_fenologie_raster.py. Per band een PNG waarin de
// waarde verliesloos als Int16 in twee kanalen zit (R = hoge byte, G = lage
// byte) en alpha het nodata-masker is. Dat scheelt een GeoTIFF-bibliotheek:
// de browser decodeert PNG zelf, en met een offscreen canvas lezen we de
// exacte bytes terug.
//
// Het raster staat in EPSG:3857, zodat MapLibre het als image-source met vier
// hoekcoordinaten neerlegt zonder in de browser te hoeven herprojecteren.

(function (global) {
  'use strict';

  var WEB_MERCATOR_R = 6378137.0;

  function lonLatToMerc(lon, lat) {
    return [
      lon * Math.PI / 180 * WEB_MERCATOR_R,
      Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * WEB_MERCATOR_R,
    ];
  }

  /** Decodeert een geladen PNG naar een Float64Array met NaN voor nodata. */
  function decodePng(img, scale, width, height) {
    var cv = document.createElement('canvas');
    cv.width = width;
    cv.height = height;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    var px = ctx.getImageData(0, 0, width, height).data;

    var out = new Float64Array(width * height);
    for (var i = 0, n = out.length; i < n; i++) {
      var o = i * 4;
      if (px[o + 3] === 0) { out[i] = NaN; continue; }
      var v = (px[o] << 8) | px[o + 1];
      if (v > 32767) v -= 65536;
      out[i] = v * scale;
    }
    return out;
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('kon ' + url + ' niet laden')); };
      img.src = url;
    });
  }

  var Raster = {
    meta: null,
    bands: {},   // naam -> Float64Array
    width: 0,
    height: 0,

    load: function (baseUrl) {
      return fetch(baseUrl + '/meta.json').then(function (r) {
        if (!r.ok) throw new Error('meta.json: HTTP ' + r.status);
        return r.json();
      }).then(function (meta) {
        Raster.meta = meta;
        Raster.width = meta.width;
        Raster.height = meta.height;
        var names = Object.keys(meta.bands);
        return Promise.all(names.map(function (name) {
          var b = meta.bands[name];
          return loadImage(baseUrl + '/' + b.file).then(function (img) {
            Raster.bands[name] = decodePng(img, b.scale, meta.width, meta.height);
          });
        }));
      }).then(function () { return Raster; });
    },

    /** Pixelindex voor een lon/lat, of -1 buiten het raster. */
    indexAt: function (lon, lat) {
      var m = Raster.meta;
      var xy = lonLatToMerc(lon, lat);
      var b = m.bounds_3857; // [minx, miny, maxx, maxy]
      var fx = (xy[0] - b[0]) / (b[2] - b[0]);
      var fy = (b[3] - xy[1]) / (b[3] - b[1]);
      if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return -1;
      var px = Math.floor(fx * m.width);
      var py = Math.floor(fy * m.height);
      return py * m.width + px;
    },

    valuesAt: function (lon, lat) {
      var i = Raster.indexAt(lon, lat);
      if (i < 0) return null;
      var out = { index: i };
      var any = false;
      Object.keys(Raster.bands).forEach(function (name) {
        var v = Raster.bands[name][i];
        out[name] = isNaN(v) ? null : v;
        if (!isNaN(v)) any = true;
      });
      return any ? out : null;
    },

    /**
     * Kleurt een band in en geeft een canvas terug dat MapLibre als image-
     * source kan gebruiken.
     *
     * opts.band        welke band de kleur bepaalt
     * opts.ramp        [[stop, [r,g,b]], ...] op genormaliseerde positie 0..1
     * opts.domain      [lo, hi]; waarden daarbuiten klemmen
     * opts.onlySig     laat pixels met q >= alpha doorzichtig
     * opts.alpha       FDR-drempel
     */
    colorize: function (opts) {
      var w = Raster.width, h = Raster.height;
      var data = Raster.bands[opts.band];
      var q = opts.onlySig ? Raster.bands[opts.qband || 'qvalue'] : null;
      var lo = opts.domain[0], hi = opts.domain[1];
      var span = (hi - lo) || 1;

      var cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      var ctx = cv.getContext('2d');
      var img = ctx.createImageData(w, h);
      var px = img.data;

      for (var i = 0, n = w * h; i < n; i++) {
        var v = data[i];
        var o = i * 4;
        if (isNaN(v) || (q && (isNaN(q[i]) || q[i] >= opts.alpha))) {
          px[o + 3] = 0;
          continue;
        }
        var t = Math.max(0, Math.min(1, (v - lo) / span));
        var c = sampleRamp(opts.ramp, t);
        px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return cv;
    },

    /** Hoeveel pixels houden de FDR-drempel? */
    countSignificant: function (alpha, band) {
      var q = Raster.bands[band || 'qvalue'];
      if (!q) return 0;
      var n = 0;
      for (var i = 0; i < q.length; i++) if (!isNaN(q[i]) && q[i] < alpha) n++;
      return n;
    },

    /** Lon/lat van het midden van een pixel, de omkering van indexAt(). */
    lonLatAt: function (i) {
      var m = Raster.meta, b = m.bounds_3857;
      var px = i % m.width, py = Math.floor(i / m.width);
      var x = b[0] + (px + 0.5) / m.width * (b[2] - b[0]);
      var y = b[3] - (py + 0.5) / m.height * (b[3] - b[1]);
      return [x / WEB_MERCATOR_R * 180 / Math.PI,
              (2 * Math.atan(Math.exp(y / WEB_MERCATOR_R)) - Math.PI / 2) * 180 / Math.PI];
    },

    /** Grondoppervlak van een pixel in m2. */
    pixelArea: function () {
      var m = Raster.meta, b = m.bounds_3857;
      var lat = (m.corners[0][1] + m.corners[2][1]) / 2;
      var k = Math.cos(lat * Math.PI / 180);   // Mercator rekt op met 1/cos(lat)
      var w = (b[2] - b[0]) / m.width * k;
      var h = (b[3] - b[1]) / m.height * k;
      return w * h;
    },

    /**
     * Aaneengesloten vlekken van significante pixels, gesorteerd op hoe
     * dringend ze zijn.
     *
     * Het rapport (par. 5.1) noemt als kern van de methode dat je er
     * "locaties mee selecteert waar veldbezoek het meest relevant is". Een
     * kaart vol losse gekleurde pixels doet dat niet; een gerangschikte lijst
     * van samenhangende vlekken wel. Losse pixels vallen af via minPixels,
     * want een enkele significante pixel tussen duizenden is precies wat de
     * FDR-correctie nog net doorlaat.
     *
     * Iteratieve flood fill met 8-verbondenheid over een expliciete stack --
     * recursie loopt op 700.000 pixels de call stack over.
     */
    clusters: function (opts) {
      opts = opts || {};
      var alpha = opts.alpha || 0.05;
      var minPixels = opts.minPixels || 8;
      var q = Raster.bands.qvalue, slope = Raster.bands.slope;
      if (!q || !slope) return [];

      var w = Raster.width, h = Raster.height, n = w * h;
      var seen = new Uint8Array(n);
      var stack = new Int32Array(n);
      var area = Raster.pixelArea();
      var out = [];

      for (var start = 0; start < n; start++) {
        if (seen[start]) continue;
        seen[start] = 1;
        if (isNaN(q[start]) || q[start] >= alpha) continue;

        var sign = slope[start] >= 0 ? 1 : -1;
        var top = 0, count = 0, sum = 0;
        var peak = start, peakAbs = -1;
        stack[top++] = start;

        while (top > 0) {
          var i = stack[--top];
          var v = slope[i];
          count++;
          sum += v;
          if (Math.abs(v) > peakAbs) { peakAbs = Math.abs(v); peak = i; }

          var px = i % w, py = (i - px) / w;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              var nx = px + dx, ny = py + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              var j = ny * w + nx;
              if (seen[j]) continue;
              // Een vlek is eenduidig stijgend of dalend; een dalende en een
              // stijgende plek die elkaar raken zijn twee bevindingen.
              if (isNaN(q[j]) || q[j] >= alpha) { seen[j] = 1; continue; }
              if ((slope[j] >= 0 ? 1 : -1) !== sign) continue;
              seen[j] = 1;
              stack[top++] = j;
            }
          }
        }

        if (count < minPixels) continue;
        var ll = Raster.lonLatAt(peak);
        var mean = sum / count;
        out.push({
          n: count,
          hectare: count * area / 10000,
          meanSlope: mean,
          peakSlope: slope[peak],
          lon: ll[0], lat: ll[1],
          // Rangschikking: een grote vlek met een matige helling verdient een
          // veldbezoek eerder dan een paar pixels met een steile helling.
          score: (count * area / 10000) * Math.abs(mean),
        });
      }

      out.sort(function (a, b) { return b.score - a.score; });
      return out;
    },

    countValid: function (band) {
      var s = Raster.bands[band || 'slope'];
      var n = 0;
      for (var i = 0; i < s.length; i++) if (!isNaN(s[i])) n++;
      return n;
    },
  };

  function sampleRamp(ramp, t) {
    for (var i = 1; i < ramp.length; i++) {
      if (t <= ramp[i][0]) {
        var a = ramp[i - 1], b = ramp[i];
        var f = (t - a[0]) / ((b[0] - a[0]) || 1);
        return [
          Math.round(a[1][0] + (b[1][0] - a[1][0]) * f),
          Math.round(a[1][1] + (b[1][1] - a[1][1]) * f),
          Math.round(a[1][2] + (b[1][2] - a[1][2]) * f),
        ];
      }
    }
    return ramp[ramp.length - 1][1];
  }

  Raster.sampleRamp = sampleRamp;
  global.Raster = Raster;
})(window);
