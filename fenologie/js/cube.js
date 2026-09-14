// cube.js — laden en decoderen van de fenologie-kubus, plus de
// afgeleide berekeningen die per cel pas bij een klik nodig zijn.
//
// Het bestandsformaat zit beschreven in scripts/build_fenologie_cube.py.
// Reeksen staan als base64 van little-endian Int16 (waarde * 10000),
// met -32768 als "geen waarneming".

(function (global) {
  'use strict';

  var YEAR_LENGTH = 365;

  function decodeInt16(b64, scale, nodata) {
    var bin = atob(b64);
    var n = bin.length >> 1;
    var out = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var lo = bin.charCodeAt(i * 2);
      var hi = bin.charCodeAt(i * 2 + 1);
      var v = (hi << 8) | lo;
      if (v > 32767) v -= 65536;
      out[i] = v === nodata ? NaN : v / scale;
    }
    return out;
  }

  function noLeapDoy(d) {
    var start = Date.UTC(d.getUTCFullYear(), 0, 1);
    var doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86400000) + 1;
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
      out[i] = buf.length % 2 ? buf[(buf.length - 1) >> 1]
                              : (buf[buf.length / 2 - 1] + buf[buf.length / 2]) / 2;
    }
    return out;
  }

  var Cube = {
    data: null,
    dates: null,     // Date[]
    doyOfDate: null, // Int16Array
    byH3: null,
    shards: {},      // h3-ouder -> { <h3>: {v,b,s} }, of een Promise tijdens het laden

    load: function (url) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('kubus niet gevonden (' + r.status + ')');
        return r.json();
      }).then(function (json) {
        Cube.data = json;
        Cube.dates = json.dates.map(function (s) { return new Date(s + 'T00:00:00Z'); });
        Cube.doyOfDate = Cube.dates.map(noLeapDoy);
        Cube.byH3 = {};
        var years = json.meta.years || [];
        json.cells.forEach(function (c) {
          // lat/lon en de jarenreeks staan niet in de index: die leidt de
          // browser zelf af, dat scheelt ruim een derde van het bestand.
          var ll = h3.h3ToGeo(c.h3);
          c.lat = ll[0];
          c.lon = ll[1];
          c.years = years;
          Cube.byH3[c.h3] = c;
        });
        return json;
      });
    },

    /** Naam van de shard waar een cel in zit. */
    shardFor: function (h3index) {
      return h3.h3ToParent(h3index, Cube.data.meta.shard_res);
    },

    /**
     * Zorg dat de reeks van deze cel beschikbaar is. De index bevat alleen
     * wat de kaart nodig heeft; de reeksen komen per shard binnen, zodat
     * een klik een bestand van tientallen kB kost in plaats van megabytes.
     */
    ensureSeries: function (cell) {
      if (cell._series || cell._raw) return Promise.resolve(cell);
      var key = Cube.shardFor(cell.h3);
      if (!Cube.shards[key]) {
        Cube.shards[key] = fetch(FENO_CONFIG.shardBase + key + '.json')
          .then(function (r) {
            if (!r.ok) throw new Error('shard ' + key + ' niet gevonden (' + r.status + ')');
            return r.json();
          })
          .then(function (payload) {
            Object.keys(payload).forEach(function (id) {
              if (Cube.byH3[id]) Cube.byH3[id]._raw = payload[id];
            });
            Cube.shards[key] = payload;
            return payload;
          })
          .catch(function (e) {
            delete Cube.shards[key];   // laat een volgende klik het opnieuw proberen
            throw e;
          });
      }
      return Promise.resolve(Cube.shards[key]).then(function () { return cell; });
    },

    /** Volledige, gedecodeerde reeks voor een cel (of voor een live antwoord). */
    series: function (cell) {
      if (cell._series) return cell._series;
      if (!cell._raw) throw new Error('reeks nog niet geladen; roep ensureSeries aan');
      var meta = Cube.data.meta;
      var v = decodeInt16(cell._raw.v, meta.scale, meta.nodata);
      var base = decodeInt16(cell._raw.b, meta.scale, meta.nodata);
      var sd = decodeInt16(cell._raw.s, meta.scale, meta.nodata);
      var doys = Cube.data.doys;

      var obs = [];
      for (var i = 0; i < v.length; i++) {
        if (isNaN(v[i])) continue;
        var doy = Cube.doyOfDate[i];
        var k = circularNearestIndex(doy, doys);
        var b = base[k], s = sd[k];
        obs.push({
          date: Cube.dates[i],
          iso: Cube.data.dates[i],
          doy: doy,
          value: v[i],
          baseline: isNaN(b) ? null : b,
          sd: isNaN(s) ? null : s,
          z: (!isNaN(b) && !isNaN(s) && s > 0.02) ? (v[i] - b) / s : null,
        });
      }
      cell._series = { obs: obs, doys: doys, base: base, sd: sd };
      return cell._series;
    },

    /**
     * Decompositie voor één cel. Bewust simpel en uitlegbaar:
     * seizoen = de eigen referentiecurve, trend = lopende mediaan van wat
     * daarna overblijft, rest = het verschil. Geen STL in de browser; die
     * hoort thuis in t.rast.pointseries, waar de volledige reeks staat.
     */
    decompose: function (cell, windowObs) {
      var s = Cube.series(cell);
      var obs = s.obs;
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
        trend: Array.prototype.map.call(trend, function (t) { return isNaN(t) ? NaN : t + mean; }),
        remainder: obs.map(function (o, i) {
          return isNaN(resid[i]) || isNaN(trend[i]) ? NaN : resid[i] - trend[i];
        }),
      };
    },

    /** Zet een live openEO-antwoord om in dezelfde vorm als een kubuscel. */
    fromLive: function (payload, lon, lat) {
      var obs = payload.observations.map(function (o) {
        return { date: new Date(o.date + 'T00:00:00Z'), iso: o.date,
                 doy: noLeapDoy(new Date(o.date + 'T00:00:00Z')), value: o.value };
      });
      // klimatologie uit de reeks zelf, zelfde recept als de kubus
      var doys = [];
      for (var t = 1; t <= YEAR_LENGTH; t += 5) doys.push(t);
      var base = new Float64Array(doys.length);
      var sd = new Float64Array(doys.length);
      doys.forEach(function (t, k) {
        var pick = obs.filter(function (o) {
          var diff = Math.abs(o.doy - t);
          return Math.min(diff, YEAR_LENGTH - diff) <= 10;
        }).map(function (o) { return o.value; });
        if (pick.length < 3) { base[k] = NaN; sd[k] = NaN; return; }
        pick.sort(function (a, b) { return a - b; });
        var m = pick.length % 2 ? pick[(pick.length - 1) >> 1]
                                : (pick[pick.length / 2 - 1] + pick[pick.length / 2]) / 2;
        var dev = pick.map(function (p) { return Math.abs(p - m); })
                      .sort(function (a, b) { return a - b; });
        base[k] = m;
        sd[k] = 1.4826 * (dev.length % 2 ? dev[(dev.length - 1) >> 1]
                                         : (dev[dev.length / 2 - 1] + dev[dev.length / 2]) / 2);
      });
      obs.forEach(function (o) {
        var k = circularNearestIndex(o.doy, doys);
        o.baseline = isNaN(base[k]) ? null : base[k];
        o.sd = isNaN(sd[k]) ? null : sd[k];
        o.z = (o.baseline !== null && o.sd !== null && o.sd > 0.02)
          ? (o.value - o.baseline) / o.sd : null;
      });
      var years = {};
      obs.forEach(function (o) {
        var y = o.date.getUTCFullYear();
        (years[y] = years[y] || []).push(o.value);
      });
      var ys = Object.keys(years).map(Number).sort();
      function q(a, p) {
        a = a.slice().sort(function (x, y) { return x - y; });
        var i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
        return a[i];
      }
      var cell = {
        h3: null, lon: lon, lat: lat, hab: null, live: true,
        n: obs.length,
        years: ys,
        ymed: ys.map(function (y) { return q(years[y], 0.5); }),
        ymax: ys.map(function (y) { return q(years[y], 0.9); }),
        ymin: ys.map(function (y) { return q(years[y], 0.1); }),
        zlow: obs.filter(function (o) { return o.z !== null && o.z <= -2; }).length,
        zhigh: obs.filter(function (o) { return o.z !== null && o.z >= 2; }).length,
        _series: { obs: obs, doys: doys, base: base, sd: sd },
      };
      var ts = Cube.theilSen(ys, cell.ymed);
      cell.slope = ts.slope;
      var mk = Cube.mannKendall(cell.ymed);
      cell.tau = mk.tau;
      cell.p = mk.p;
      return cell;
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
      var slope = slopes.length % 2 ? slopes[(slopes.length - 1) >> 1]
                                    : (slopes[slopes.length / 2 - 1] + slopes[slopes.length / 2]) / 2;
      var res = x.map(function (xi, i) { return y[i] - slope * xi; })
                 .filter(function (v) { return !isNaN(v); })
                 .sort(function (a, b) { return a - b; });
      var inter = res.length % 2 ? res[(res.length - 1) >> 1]
                                 : (res[res.length / 2 - 1] + res[res.length / 2]) / 2;
      return { slope: slope, intercept: inter };
    },

    mannKendall: function (y) {
      var v = y.filter(function (q) { return q !== null && !isNaN(q); });
      var n = v.length;
      if (n < 4) return { tau: NaN, p: NaN };
      var s = 0, i, j;
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) s += Math.sign(v[j] - v[i]);
      var variance = n * (n - 1) * (2 * n + 5) / 18;
      var sd = Math.sqrt(variance);
      var n0 = n * (n - 1) / 2;
      var tau = s / n0;
      var z = s > 0 ? (s - 1) / sd : (s < 0 ? (s + 1) / sd : 0);
      // tweezijdige p via een normale benadering (Abramowitz & Stegun 26.2.17)
      var t = 1 / (1 + 0.2316419 * Math.abs(z));
      var d = 0.3989422804014327 * Math.exp(-z * z / 2);
      var p = 2 * d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
              + t * (-1.821255978 + t * 1.330274429))));
      return { tau: tau, p: Math.min(1, Math.max(0, p)) };
    },

    noLeapDoy: noLeapDoy,
  };

  global.Cube = Cube;
})(window);
