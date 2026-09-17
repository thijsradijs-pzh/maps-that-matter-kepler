// series.js — analyse van een NDVI-puntreeks, los van waar die vandaan komt.
//
// Sinds de viewer per pixel werkt is er geen voorberekende kubus meer: de
// trendkaart komt als raster uit GRASS (scripts/export_fenologie_raster.py) en
// de reeks achter een klik wordt live opgehaald via api/ndvi-series.js. Dit
// bestand doet de statistiek die daarna nodig is, en volgt daarin hoofdstuk 8
// en 10 van *Monitoring habitatveranderingen Nieuwkoop*:
//
//   - 365-daagse kalender zonder schrikkeldag (29 feb valt op DOY 59)
//   - DOY-klimatologie in stappen van 5 dagen, circulair venster van +/-10 d
//   - spreiding als 1,4826 x MAD, z alleen waar die spreiding > 0,02
//
// De trendtoets draait op de jaarmedianen (n = aantal jaren), niet op de
// vijfdaagse reeks: die is zo sterk autogecorreleerd dat Mann-Kendall
// onzinnig kleine p-waarden geeft.

(function (global) {
  'use strict';

  var YEAR_LENGTH = 365;
  var DOY_STEP = 5;
  var HALF_WINDOW = 10;
  var SD_FLOOR = 0.02;

  function noLeapDoy(d) {
    var start = Date.UTC(d.getUTCFullYear(), 0, 1);
    var doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(),
      d.getUTCDate()) - start) / 86400000) + 1;
    var y = d.getUTCFullYear();
    var leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    if (leap) {
      if (d.getUTCMonth() === 1 && d.getUTCDate() === 29) return 59;
      if (doy > 60) return doy - 1;
    }
    return doy;
  }

  function circularNearestIndex(doy, doys) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < doys.length; i++) {
      var diff = Math.abs(doys[i] - doy);
      var d = Math.min(diff, YEAR_LENGTH - diff);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function median(sorted) {
    if (!sorted.length) return NaN;
    return sorted.length % 2 ? sorted[(sorted.length - 1) >> 1]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  }

  function movingMedian(arr, window) {
    var out = new Float64Array(arr.length);
    var half = Math.max(1, window >> 1);
    for (var i = 0; i < arr.length; i++) {
      var buf = [];
      for (var j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
        if (!isNaN(arr[j])) buf.push(arr[j]);
      }
      if (!buf.length) { out[i] = NaN; continue; }
      buf.sort(function (a, b) { return a - b; });
      out[i] = median(buf);
    }
    return out;
  }

  function quantile(values, p) {
    var a = values.slice().sort(function (x, y) { return x - y; });
    var i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
    return a[i];
  }

  var Series = {
    /** Bouwt de DOY-klimatologie uit de reeks zelf en hangt z aan elke obs. */
    climatology: function (obs) {
      var doys = [];
      for (var t = 1; t <= YEAR_LENGTH; t += DOY_STEP) doys.push(t);
      var base = new Float64Array(doys.length);
      var sd = new Float64Array(doys.length);

      doys.forEach(function (t, k) {
        var pick = obs.filter(function (o) {
          var diff = Math.abs(o.doy - t);
          return Math.min(diff, YEAR_LENGTH - diff) <= HALF_WINDOW;
        }).map(function (o) { return o.value; });
        if (pick.length < 3) { base[k] = NaN; sd[k] = NaN; return; }
        pick.sort(function (a, b) { return a - b; });
        var m = median(pick);
        var dev = pick.map(function (p) { return Math.abs(p - m); })
                      .sort(function (a, b) { return a - b; });
        base[k] = m;
        sd[k] = 1.4826 * median(dev);
      });

      obs.forEach(function (o) {
        var k = circularNearestIndex(o.doy, doys);
        o.baseline = isNaN(base[k]) ? null : base[k];
        o.sd = isNaN(sd[k]) ? null : sd[k];
        o.z = (o.baseline !== null && o.sd !== null && o.sd > SD_FLOOR)
          ? (o.value - o.baseline) / o.sd : null;
      });

      return { obs: obs, doys: doys, base: base, sd: sd };
    },

    /**
     * Decompositie van een puntreeks. Bewust simpel en uitlegbaar:
     * seizoen = de eigen referentiecurve, trend = lopende mediaan van wat
     * daarna overblijft, rest = het verschil. Geen STL in de browser; die
     * hoort thuis in de GRASS-addon t.rast.stl, waar de volledige reeks staat.
     */
    decompose: function (point, windowObs) {
      var obs = point._series.obs;
      var seasonal = obs.map(function (o) { return o.baseline === null ? NaN : o.baseline; });
      var resid = obs.map(function (o, i) {
        return o.baseline === null ? NaN : o.value - seasonal[i];
      });
      var trend = movingMedian(resid, windowObs || 51);
      var mean = 0, cnt = 0;
      for (var i = 0; i < seasonal.length; i++) {
        if (!isNaN(seasonal[i])) { mean += seasonal[i]; cnt++; }
      }
      mean = cnt ? mean / cnt : 0;
      return {
        obs: obs,
        seasonal: seasonal,
        trend: Array.prototype.map.call(trend, function (t) {
          return isNaN(t) ? NaN : t + mean;
        }),
        remainder: obs.map(function (o, i) {
          return isNaN(resid[i]) || isNaN(trend[i]) ? NaN : resid[i] - trend[i];
        }),
      };
    },

    /** Zet een openEO-antwoord om in het object dat het paneel verwacht. */
    fromLive: function (payload, lon, lat) {
      var obs = payload.observations.map(function (o) {
        var d = new Date(o.date + 'T00:00:00Z');
        return { date: d, iso: o.date, doy: noLeapDoy(d), value: o.value };
      });
      var series = Series.climatology(obs);

      var byYear = {};
      obs.forEach(function (o) {
        var y = o.date.getUTCFullYear();
        (byYear[y] = byYear[y] || []).push(o.value);
      });
      var ys = Object.keys(byYear).map(Number).sort(function (a, b) { return a - b; });

      var point = {
        lon: lon, lat: lat, live: true,
        n: obs.length,
        years: ys,
        ymed: ys.map(function (y) { return quantile(byYear[y], 0.5); }),
        ymax: ys.map(function (y) { return quantile(byYear[y], 0.9); }),
        ymin: ys.map(function (y) { return quantile(byYear[y], 0.1); }),
        zlow: obs.filter(function (o) { return o.z !== null && o.z <= -2; }).length,
        zhigh: obs.filter(function (o) { return o.z !== null && o.z >= 2; }).length,
        _series: series,
      };

      point.slope = Series.theilSen(ys, point.ymed).slope;
      var mk = Series.mannKendall(point.ymed);
      point.tau = mk.tau;
      point.p = mk.p;
      // Een losse klik is een enkele toets: geen meervoudigheidsprobleem, dus
      // geen FDR-correctie. De q op de kaart komt uit de rasterexport, waar
      // hoofdstuk 11 wel over alle pixels tegelijk corrigeert.
      point.q = null;
      return point;
    },

    theilSen: function (x, y) {
      var slopes = [];
      for (var i = 0; i < x.length; i++) {
        for (var j = i + 1; j < x.length; j++) {
          if (isNaN(y[i]) || isNaN(y[j])) continue;
          slopes.push((y[j] - y[i]) / (x[j] - x[i]));
        }
      }
      if (!slopes.length) return { slope: NaN, intercept: NaN };
      slopes.sort(function (a, b) { return a - b; });
      var slope = median(slopes);
      var res = x.map(function (xi, i) { return y[i] - slope * xi; })
                 .filter(function (v) { return !isNaN(v); })
                 .sort(function (a, b) { return a - b; });
      return { slope: slope, intercept: median(res) };
    },

    mannKendall: function (y) {
      var v = y.filter(function (q) { return q !== null && !isNaN(q); });
      var n = v.length;
      if (n < 4) return { tau: NaN, p: NaN };
      var s = 0, i, j;
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) s += Math.sign(v[j] - v[i]);
      var sd = Math.sqrt(n * (n - 1) * (2 * n + 5) / 18);
      var n0 = n * (n - 1) / 2;
      var z = s > 0 ? (s - 1) / sd : (s < 0 ? (s + 1) / sd : 0);
      // tweezijdige p via een normale benadering (Abramowitz & Stegun 26.2.17)
      var t = 1 / (1 + 0.2316419 * Math.abs(z));
      var d = 0.3989422804014327 * Math.exp(-z * z / 2);
      var p = 2 * d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
              + t * (-1.821255978 + t * 1.330274429))));
      return { tau: s / n0, p: Math.min(1, Math.max(0, p)) };
    },

    noLeapDoy: noLeapDoy,
  };

  global.Series = Series;
})(window);
