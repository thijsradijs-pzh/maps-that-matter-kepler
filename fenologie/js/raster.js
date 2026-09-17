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
      var q = opts.onlySig ? Raster.bands.qvalue : null;
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
    countSignificant: function (alpha) {
      var q = Raster.bands.qvalue;
      if (!q) return 0;
      var n = 0;
      for (var i = 0; i < q.length; i++) if (!isNaN(q[i]) && q[i] < alpha) n++;
      return n;
    },

    countValid: function () {
      var s = Raster.bands.slope;
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
