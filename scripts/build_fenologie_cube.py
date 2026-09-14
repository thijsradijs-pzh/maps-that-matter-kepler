#!/usr/bin/env python3
"""
Bouw de fenologie-kubus voor /fenologie.

Twee modi:

  --from-grass   Draai dit BINNEN een GRASS-sessie op de Nieuwkoop-mapset.
                 Bemonstert per H3-cel het centroide-punt uit de STRDS'en van
                 de HAS/PZH-pipeline en rekent klimatologie, z-anomalieen,
                 STL-trend en Theil-Sen/Mann-Kendall uit.

                   grass /db/UTM_NLD/NDVI --exec \
                     python3 scripts/build_fenologie_cube.py --from-grass \
                       --strds S2_ndvi --res 10 \
                       --out data/fenologie-nieuwkoop.json

  --demo         Gesimuleerde reeksen in exact hetzelfde schema, zodat de
                 viewer direct werkt zonder GRASS-database.

                   python3 scripts/build_fenologie_cube.py --demo \
                     --res 10 --out data/fenologie-nieuwkoop.json

Uitvoerschema (JSON, gzip't door Vercel):

  {
    "meta": {...},
    "dates": ["2016-01-06", ...],          // gedeelde tijdas
    "doys":  [1, 6, 11, ...],              // gedeelde DOY-as van de referentie
    "cells": [
      { "h3": "8a1fb...", "lat":.., "lon":.., "hab": "H7140B",
        "n": 253, "slope": -0.0047, "tau": -0.69, "p": 0.0073,
        "zlow": 6, "zhigh": 5,
        "v":  "<base64 Int16, NDVI*10000, -32768 = geen waarneming>",
        "b":  "<base64 Int16, referentiecurve per DOY>",
        "s":  "<base64 Int16, robuuste SD per DOY>" }
    ]
  }
"""

import argparse
import base64
import json
import math
import sys
from datetime import date, timedelta

import numpy as np

YEAR_LENGTH = 365
NODATA = -32768
SCALE = 10000

# Benaderende omtrek van Nieuwkoopse Plassen & De Haeck. Alleen een fallback:
# met netwerk haalt --boundary-wfs de echte begrenzing bij PDOK op.
FALLBACK_RING = [
    (4.7760, 52.1320), (4.7910, 52.1180), (4.8180, 52.1120), (4.8520, 52.1140),
    (4.8810, 52.1250), (4.8980, 52.1420), (4.8960, 52.1610), (4.8770, 52.1760),
    (4.8480, 52.1860), (4.8150, 52.1880), (4.7900, 52.1780), (4.7770, 52.1580),
]

PDOK_N2000_WFS = (
    "https://service.pdok.nl/rvo/natura2000/wfs/v1_0"
    "?service=WFS&version=2.0.0&request=GetFeature"
    "&typeNames=natura2000:natura2000&outputFormat=application/json"
    "&count=50&CQL_FILTER=naamN2K%20LIKE%20%27Nieuwkoopse%25%27"
)


# ---------------------------------------------------------------- helpers
def no_leap_doy(d):
    doy = int(d.strftime("%j"))
    leap = d.year % 4 == 0 and (d.year % 100 != 0 or d.year % 400 == 0)
    if leap:
        if d.month == 2 and d.day == 29:
            return 59
        if doy > 60:
            return doy - 1
    return doy


def b64_int16(arr):
    a = np.asarray(arr, dtype=np.float64)
    out = np.where(np.isnan(a), NODATA, np.clip(np.round(a * SCALE), -32000, 32000))
    return base64.b64encode(out.astype("<i2").tobytes()).decode("ascii")


def theil_sen(x, y):
    i, j = np.triu_indices(len(x), k=1)
    slope = float(np.median((y[j] - y[i]) / (x[j] - x[i])))
    return slope, float(np.median(y - slope * x))


def mann_kendall(y):
    from scipy.stats import norm

    y = np.asarray(y, float)
    n = len(y)
    i, j = np.triu_indices(n, k=1)
    s = float(np.sum(np.sign(y[j] - y[i])))
    _, counts = np.unique(np.round(y, 6), return_counts=True)
    tie = float(np.sum(counts * (counts - 1) * (2 * counts + 5)))
    var = (n * (n - 1) * (2 * n + 5) - tie) / 18.0
    sd = math.sqrt(var) if var > 0 else float("nan")
    n0 = n * (n - 1) / 2.0
    ty = float(np.sum(counts * (counts - 1)) / 2.0)
    tau = s / math.sqrt(n0 * (n0 - ty)) if n0 > ty else float("nan")
    if not sd or math.isnan(sd):
        return tau, float("nan")
    z = (s - 1) / sd if s > 0 else ((s + 1) / sd if s < 0 else 0.0)
    return tau, float(2.0 * norm.sf(abs(z)))


def climatology(doys, vals, step=5, window=20):
    """Gepoolde DOY-mediaan + 1,4826 x MAD, zoals hoofdstuk 8 van het rapport."""
    doys = np.asarray(doys)
    vals = np.asarray(vals, float)
    half = window // 2
    targets = list(range(1, YEAR_LENGTH + 1, step))
    base, sd = [], []
    for t in targets:
        diff = np.abs(doys - t)
        sel = np.minimum(diff, YEAR_LENGTH - diff) <= half
        if sel.sum() < 3:
            base.append(np.nan)
            sd.append(np.nan)
            continue
        m = float(np.median(vals[sel]))
        base.append(m)
        sd.append(float(1.4826 * np.median(np.abs(vals[sel] - m))))
    return targets, np.array(base), np.array(sd)


def analyse(dates, vals, targets, base, sd, sd_floor=0.02):
    """z-anomalieen + jaarstatistieken + trendtoets.

    Geen STL hier: de decompositie van een enkele cel is goedkoop en gebeurt
    client-side in de viewer. Wat de kaart nodig heeft is de trend, en die
    volgt uit de jaarstatistieken van de seizoenscurve, net als hoofdstuk 11
    van het rapport (Theil-Sen + Mann-Kendall op n = aantal jaren).
    """
    keys = np.array([t for t, b in zip(targets, base) if not math.isnan(b)])
    lut_b = {t: b for t, b in zip(targets, base) if not math.isnan(b)}
    lut_s = {t: s for t, s in zip(targets, sd) if not math.isnan(s)}
    if len(keys) < 20:
        return None

    doys = np.array([no_leap_doy(d) for d in dates])
    diff = np.abs(doys[:, None] - keys[None, :])
    nearest = keys[np.argmin(np.minimum(diff, YEAR_LENGTH - diff), axis=1)]

    b = np.array([lut_b[k] for k in nearest])
    s = np.array([lut_s.get(k, 0.0) for k in nearest])
    v = np.asarray(vals, float)
    z = np.where(s > sd_floor, (v - b) / np.where(s > sd_floor, s, 1.0), np.nan)

    years = np.array([d.year for d in dates])
    uniq = sorted(set(years.tolist()))
    ymed, ymax, ymin, yrng = [], [], [], []
    for y in uniq:
        sel = years == y
        if sel.sum() < 8:
            ymed.append(np.nan); ymax.append(np.nan)
            ymin.append(np.nan); yrng.append(np.nan)
            continue
        # jaarcurve = waarneming minus de gedeelde seizoensvorm, terug op niveau
        lvl = v[sel] - b[sel]
        ymed.append(float(np.median(v[sel])))
        ymax.append(float(np.percentile(v[sel], 90)))
        ymin.append(float(np.percentile(v[sel], 10)))
        yrng.append(float(np.median(lvl)))
    ok = ~np.isnan(np.array(ymed))
    if ok.sum() < 5:
        return None
    x = np.array(uniq, float)[ok]
    slope, _ = theil_sen(x, np.array(ymed)[ok])
    tau, p = mann_kendall(np.array(ymed)[ok])
    return {
        "slope": round(slope, 5),
        "tau": None if math.isnan(tau) else round(tau, 3),
        "p": None if math.isnan(p) else float(f"{p:.3g}"),
        "zlow": int(np.nansum(z <= -2)),
        "zhigh": int(np.nansum(z >= 2)),
        "years": uniq,
        "ymed": [None if math.isnan(q) else round(q, 4) for q in ymed],
        "ymax": [None if math.isnan(q) else round(q, 4) for q in ymax],
        "ymin": [None if math.isnan(q) else round(q, 4) for q in ymin],
        "ylvl": [None if math.isnan(q) else round(q, 4) for q in yrng],
    }


# ---------------------------------------------------------------- geometrie
def boundary_ring(use_wfs):
    if not use_wfs:
        return FALLBACK_RING, "benaderende omtrek (geen WFS opgehaald)"
    try:
        import urllib.request

        with urllib.request.urlopen(PDOK_N2000_WFS, timeout=30) as fh:
            gj = json.load(fh)
        coords = []
        for feat in gj.get("features", []):
            g = feat["geometry"]
            polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
            for poly in polys:
                coords.append([(float(x), float(y)) for x, y in poly[0]])
        if coords:
            ring = max(coords, key=len)
            return ring, "Natura 2000-begrenzing, PDOK WFS (RVO)"
    except Exception as exc:  # pragma: no cover
        print("WFS-ophalen mislukt (%s); val terug op benadering" % exc, file=sys.stderr)
    return FALLBACK_RING, "benaderende omtrek (WFS niet bereikbaar)"


def cells_for_ring(ring, res):
    import h3

    poly = h3.LatLngPoly([(lat, lon) for lon, lat in ring])
    return sorted(h3.h3shape_to_cells(poly, res))


# ---------------------------------------------------------------- GRASS-modus
def sample_from_grass(cells, strds, epsg):
    """Bemonster elk celcentroide uit de STRDS met een enkele t.rast.what."""
    import grass.script as gs
    import h3

    pts = [h3.cell_to_latlng(c) for c in cells]  # (lat, lon)
    # projecteer in een keer naar de project-CRS
    stdin = "\n".join("%.7f %.7f" % (lon, lat) for lat, lon in pts)
    proj = gs.read_command("m.proj", flags="i", input="-", stdin=stdin,
                           proj_in="+init=epsg:4326", separator="space").strip()
    xy = []
    for line in proj.splitlines():
        f = line.replace("|", " ").split()
        xy.append((float(f[0]), float(f[1])))

    coords = ",".join("%s,%s" % (x, y) for x, y in xy)
    txt = gs.read_command("t.rast.what", strds=strds, coordinates=coords,
                          layout="col", null_value="*", separator="|", quiet=True)

    dates, rows = [], []
    for line in txt.splitlines():
        line = line.strip()
        if not line or line.startswith("start"):
            continue
        f = line.split("|")
        stamp = f[0].split(" ")[0].replace("T", " ").strip()
        try:
            d = date.fromisoformat(stamp[:10])
        except ValueError:
            continue
        dates.append(d)
        rows.append(f[2:])  # kolom 0/1 = start/end
    series = []
    for i in range(len(cells)):
        col = []
        for r in rows:
            v = r[i] if i < len(r) else "*"
            col.append(np.nan if v in ("*", "", "None", "nan") else float(v))
        series.append(np.array(col, float))
    return dates, series, epsg


# ---------------------------------------------------------------- demo-modus
DEMO_PROFILES = [
    dict(hab="H7140B", naam="veenmosrietland", base=.30, amp=.30, peak=196,
         width=.95, drought=.10, trend=-0.006, noise=.030, mow=None),
    dict(hab="H6410", naam="blauwgrasland / hooiland", base=.34, amp=.28, peak=178,
         width=.85, drought=.16, trend=0.004, noise=.028,
         mow=dict(doy=181, depth=.26, until=2021)),
    dict(hab="H7140A", naam="trilveen", base=.28, amp=.26, peak=190, width=1.0,
         drought=.14, trend=-0.009, noise=.034, mow=None),
    dict(hab="H91D0", naam="moerasbos op legakker", base=.42, amp=.34, peak=200,
         width=1.15, drought=.07, trend=0.003, noise=.022, mow=None),
    dict(hab="H3140", naam="open water", base=-.18, amp=.07, peak=210, width=.9,
         drought=.03, trend=0.001, noise=.045, mow=None),
]
CLOUD = {1: .80, 2: .75, 3: .68, 4: .58, 5: .50, 6: .50,
         7: .48, 8: .48, 9: .55, 10: .70, 11: .80, 12: .85}
DROUGHT = {2016: .2, 2017: .1, 2018: -1.9, 2019: -0.9, 2020: -0.7,
           2021: .5, 2022: -1.7, 2023: .3, 2024: .6, 2025: -0.4}


def demo_dates(start, end):
    out, d = [], start
    while d <= end:
        out.append(d)
        d += timedelta(days=10 if d.year < 2017 else 5)
    return out


def demo_series(prof, dates, rng, jitter):
    vals = np.full(len(dates), np.nan)
    for i, d in enumerate(dates):
        if rng.random() < CLOUD[d.month]:
            continue
        doy = no_leap_doy(d)
        x = (doy - prof["peak"] - jitter["peak"]) / (52.0 * prof["width"])
        v = prof["base"] + jitter["base"] + (prof["amp"] + jitter["amp"]) * math.exp(-0.5 * x * x)
        v += prof["drought"] * DROUGHT[d.year] * math.exp(-0.5 * ((doy - 220) / 55.0) ** 2)
        m = prof["mow"]
        if m and d.year <= m["until"]:
            delta = doy - m["doy"]
            if 0 <= delta < 55:
                v -= m["depth"] * math.exp(-delta / 18.0)
        v += (prof["trend"] + jitter["trend"]) * (d.year + doy / 365.0 - 2016)
        v += rng.normal(0, prof["noise"])
        if rng.random() < 0.012:
            v -= abs(rng.normal(0.12, 0.06))
        vals[i] = max(-0.95, min(0.95, v))
    return vals


def build_demo(cells, seed=20260914):
    import h3

    rng = np.random.default_rng(seed)
    dates = demo_dates(date(2016, 1, 1), date(2025, 12, 31))
    latlng = {c: h3.cell_to_latlng(c) for c in cells}
    lats = [latlng[c][0] for c in cells]
    lons = [latlng[c][1] for c in cells]
    la0, la1 = min(lats), max(lats)
    lo0, lo1 = min(lons), max(lons)
    series, habs = [], []
    for c in cells:
        lat, lon = latlng[c]
        u = (lon - lo0) / max(lo1 - lo0, 1e-9)
        v = (lat - la0) / max(la1 - la0, 1e-9)
        # ruimtelijk samenhangend habitatpatroon in plaats van willekeur
        f = (math.sin(u * 7.1 + 0.4) * math.cos(v * 5.3 - 1.1)
             + 0.6 * math.sin((u + v) * 9.7))
        idx = int(min(len(DEMO_PROFILES) - 1,
                      max(0, round((f + 1.6) / 3.2 * (len(DEMO_PROFILES) - 1)))))
        prof = DEMO_PROFILES[idx]
        jitter = dict(base=rng.normal(0, .018), amp=rng.normal(0, .022),
                      peak=rng.normal(0, 5), trend=rng.normal(0, .0018))
        series.append(demo_series(prof, dates, rng, jitter))
        habs.append(prof["hab"])
    return dates, series, habs


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-grass", action="store_true")
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--strds", default="S2_ndvi")
    ap.add_argument("--index", default="ndvi")
    ap.add_argument("--res", type=int, default=10)
    ap.add_argument("--epsg", default="32631")
    ap.add_argument("--no-wfs", action="store_true",
                    help="sla het ophalen van de N2000-begrenzing over")
    ap.add_argument("--out", default="data/fenologie-nieuwkoop.json")
    args = ap.parse_args()
    if args.from_grass == args.demo:
        ap.error("kies --from-grass of --demo")

    import h3

    ring, ring_src = boundary_ring(not args.no_wfs and args.from_grass)
    cells = cells_for_ring(ring, args.res)
    print("%d H3-cellen op resolutie %d" % (len(cells), args.res), file=sys.stderr)

    habs = None
    if args.from_grass:
        dates, series, _ = sample_from_grass(cells, args.strds, args.epsg)
    else:
        dates, series, habs = build_demo(cells)

    doys_shared = list(range(1, YEAR_LENGTH + 1, 5))
    out_cells = []
    for i, c in enumerate(cells):
        vals = series[i]
        ok = ~np.isnan(vals)
        if ok.sum() < 60:
            continue
        d_ok = [dates[j] for j in np.flatnonzero(ok)]
        v_ok = vals[ok]
        targets, base, sd = climatology([no_leap_doy(d) for d in d_ok], v_ok)
        stats = analyse(d_ok, v_ok, targets, base, sd)
        if stats is None:
            continue
        lat, lon = h3.cell_to_latlng(c)
        out_cells.append({
            "h3": c, "lat": round(lat, 6), "lon": round(lon, 6),
            "hab": habs[i] if habs else None,
            "n": int(ok.sum()),
            "slope": stats["slope"], "tau": stats["tau"], "p": stats["p"],
            "zlow": stats["zlow"], "zhigh": stats["zhigh"],
            "years": stats["years"], "ymed": stats["ymed"],
            "ymax": stats["ymax"], "ymin": stats["ymin"], "ylvl": stats["ylvl"],
            "v": b64_int16(vals), "b": b64_int16(base), "s": b64_int16(sd),
        })
        if (i + 1) % 100 == 0:
            print("  %d/%d" % (i + 1, len(cells)), file=sys.stderr)

    payload = {
        "meta": {
            "index": args.index.upper(),
            "source": "GRASS STRDS %s" % args.strds if args.from_grass
                      else "gesimuleerd (demo)",
            "demo": bool(args.demo),
            "h3_res": args.res,
            "boundary": ring_src,
            "period": [dates[0].isoformat(), dates[-1].isoformat()],
            "scale": SCALE, "nodata": NODATA,
            "method": ("DOY-klimatologie stap 5 d, venster +/-10 d, "
                       "spreiding 1,4826 x MAD; Theil-Sen + Mann-Kendall "
                       "op de jaarmedianen; decompositie client-side"),
        },
        "ring": [[round(x, 6), round(y, 6)] for x, y in ring],
        "dates": [d.isoformat() for d in dates],
        "doys": doys_shared,
        "cells": out_cells,
    }
    with open(args.out, "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    print("%s geschreven: %d cellen, %d tijdstappen"
          % (args.out, len(out_cells), len(dates)), file=sys.stderr)


if __name__ == "__main__":
    main()
