#!/usr/bin/env python3
"""
Trend in het seizoensBEREIK, naast de trend in het seizoensNIVEAU.

Waarom dit de moeite is
-----------------------
Hoofdstuk 4.5 van *Monitoring habitatveranderingen Nieuwkoop* doet precies
een concrete ecologische interpretatie, en die gaat niet over het niveau:
bij een perceel verdwijnt na 2021 de zomerdip, wat op gestopt maaibeheer
wijst (Kolecka et al. 2018 laat zien dat Sentinel-2 maaibeheer kan volgen).
Dat lees je af aan het BEREIK van de jaarcurve -- het verschil tussen zomer
en winter -- niet aan de mediaan die de hoofdkaart toont.

Hoofdstuk 11 berekent daarom vier trends: niveau (mediaan), piek (max),
dal (min) en bereik (max - min). Dit script levert die vier voor het grid
van 200 m, waar de volledige waarnemingsreeks per cel beschikbaar is.

Geen nieuwe openEO-job nodig: data/fenologie/series-grid.json bevat al per
cel alle ~430 waarnemingen over tien jaar.

Waarom p90/p10 en niet max/min of een HANTS-curve
--------------------------------------------------
Het rapport vat de met HANTS gladgestreken jaarcurve samen. Twee metingen
hebben me daarvan doen afzien:

1. Een kale harmonische fit (nf=4, zoals het rapport) is op deze data
   instabiel: 3% van de jaarcurves fit buiten [-1,1] en ~1% geeft een bereik
   groter dan 1,0 NDVI, wat fysiek onmogelijk is. Dat komt door gaten in de
   reeks (tot 60 dagen in 2016). r.hants vangt dat op met outlier-rejectie
   via `fet`, maar notebook 8 noemt die parameter niet, dus die waarde is
   niet te reproduceren. Zonder is het geen gladstrijken maar ringen.

2. Echte max/min zouden hier een SCHIJNTREND opleveren. Het aantal
   waarnemingen per jaar groeit hard (+1,17 per jaar, van 22 in 2016 naar 58
   in 2025, doordat Sentinel-2B pas in 2017 ging vliegen). Meer opnames
   vinden vanzelf een hogere piek en een lager dal, dus het bereik zou
   stijgen zonder dat er iets in het veld gebeurt.

   p90/p10 is daar ongevoelig voor: gemeten over de tien jaren is de
   correlatie tussen aantal waarnemingen en gemeten bereik -0,10, terwijl het
   aantal waarnemingen met +1,17/jaar stijgt. De percentielen zijn met 22+
   waarnemingen al goed bepaald.

Dit is dus geen luie vereenvoudiging maar een bewuste keuze, met de meting
erbij. Het blijft wel een afwijking van het rapport; vergelijk de getallen
niet een-op-een met die uit hoofdstuk 11.

Gebruik
-------
  python3 scripts/build_fenologie_seasonstats.py

Uitvoer: data/fenologie/raster-grid/ -- zelfde PNG-formaat als de andere
weergaven, maar met twee sets trendbanden: de niveautrend (slope/tau/qvalue)
en de bereiktrend (slope_range/tau_range/qvalue_range), plus piek en dal.
"""

import argparse
import base64
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_fenologie_raster import (  # noqa: E402
    BANDS, NODATA_I16, merc_to_lonlat, write_value_png,
)
from build_fenologie_openeo import (  # noqa: E402
    FDR_ALPHA, MIN_OBS, fdr_pvalue, theilsen_mk,
)

MIN_OBS_PER_YEAR = 12      # onder dit aantal zegt een jaarpercentiel niets
STATS = {
    "level": {"label": "seizoensniveau", "q": 0.50},
    "peak": {"label": "seizoenspiek", "q": 0.90},
    "trough": {"label": "seizoensdal", "q": 0.10},
    "range": {"label": "seizoensbereik", "q": None},   # p90 - p10
}


def decode(entry, scale, nodata):
    raw = np.frombuffer(base64.b64decode(entry["v"]), dtype="<i2").astype("float64")
    return np.where(raw == nodata, np.nan, raw / scale)


def year_stats(values, years, year_list):
    """Per jaar p50, p90, p10 en het bereik, of NaN bij te weinig waarnemingen."""
    out = {k: np.full(len(year_list), np.nan) for k in STATS}
    for j, y in enumerate(year_list):
        v = values[(years == y) & np.isfinite(values)]
        if v.size < MIN_OBS_PER_YEAR:
            continue
        p50, p10, p90 = np.percentile(v, [50, 10, 90])
        out["level"][j] = p50
        out["peak"][j] = p90
        out["trough"][j] = p10
        out["range"][j] = p90 - p10
    return out


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--series", default="data/fenologie/series-grid.json")
    ap.add_argument("--out-dir", default="data/fenologie/raster-grid")
    ap.add_argument("--min-years", type=int, default=MIN_OBS,
                    help="minimaal aantal bruikbare jaren per cel (default 5)")
    args = ap.parse_args()

    src = json.loads(Path(args.series).read_text(encoding="utf-8"))
    meta, grid = src["meta"], src["meta"]["grid"]
    years_of = np.array([int(d[:4]) for d in src["dates"]])
    year_list = sorted(set(years_of.tolist()))
    ncol, nrow, step = grid["ncol"], grid["nrow"], grid["step"]
    ncell = ncol * nrow
    print("%d cellen, %d datums, %d jaren, grid %dx%d van %g m"
          % (len(src["zones"]), len(src["dates"]), len(year_list),
             ncol, nrow, grid["cell_m"]), file=sys.stderr)

    # per statistiek een (jaren, cellen)-tabel
    table = {k: np.full((len(year_list), ncell), np.nan) for k in STATS}
    cell_of = []
    for entry in src["zones"]:
        vals = decode(entry, meta["scale"], meta["nodata"])
        st = year_stats(vals, years_of, year_list)
        idx = entry["cell"]
        cell_of.append(idx)
        for k in STATS:
            table[k][:, idx] = st[k]

    # trend per statistiek: Theil-Sen + Mann-Kendall over de jaren, dan BH over
    # de cellen. Zelfde volgorde als hoofdstuk 11; nadrukkelijk niet het
    # gemiddelde van iets, maar een toets op de jaarreeks zelf.
    results = {}
    for k in STATS:
        res = theilsen_mk(table[k][:, None, :], min_obs=args.min_years)
        q = fdr_pvalue(res["pvalue"][0])
        results[k] = {"slope": res["slope"][0], "tau": res["tau"][0],
                      "q": q, "count": res["count"][0]}
        n_test = int(np.isfinite(res["pvalue"][0]).sum())
        n_sig = int(np.sum(np.isfinite(q) & (q < FDR_ALPHA)))
        print("  %-8s getoetst %4d cellen, %d significant, beste q %.3f"
              % (k, n_test, n_sig,
                 np.nanmin(q) if np.isfinite(q).any() else float("nan")),
              file=sys.stderr)

    # naar het raster: elke cel is een blok, dus gewoon reshape
    def as_grid(v):
        return v.reshape(nrow, ncol)[::-1]     # rij 0 is de onderste cel

    bands, band_meta = {}, {}
    specs = {}
    for k in STATS:
        suffix = "" if k == "level" else "_" + k
        specs["slope" + suffix] = dict(BANDS["slope"], label="helling " + STATS[k]["label"])
        specs["tau" + suffix] = dict(BANDS["tau"], label="tau " + STATS[k]["label"])
        specs["qvalue" + suffix] = dict(BANDS["qvalue"], label="q " + STATS[k]["label"])
        bands["slope" + suffix] = as_grid(results[k]["slope"])
        bands["tau" + suffix] = as_grid(results[k]["tau"])
        bands["qvalue" + suffix] = as_grid(results[k]["q"])
    specs["count"] = BANDS["count"]
    bands["count"] = as_grid(results["level"]["count"])
    # celindex, zodat een klik de vooraf opgehaalde reeks kan opzoeken
    specs["zone"] = {"scale": 1.0, "label": "celindex", "unit": ""}
    zone = np.full(ncell, np.nan)
    for n, idx in enumerate(cell_of):
        zone[idx] = n + 1
    bands["zone"] = as_grid(zone)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, spec in specs.items():
        write_value_png(out_dir / ("%s.png" % name), bands[name], spec["scale"])
        finite = bands[name][np.isfinite(bands[name])]
        band_meta[name] = {
            "file": "%s.png" % name, "scale": spec["scale"],
            "label": spec.get("label", name), "unit": spec.get("unit", ""),
            "min": None if not finite.size else round(float(finite.min()), 6),
            "max": None if not finite.size else round(float(finite.max()), 6),
        }

    x0, y0 = grid["x0"], grid["y0"]
    bounds = [x0, y0, x0 + step * ncol, y0 + step * nrow]
    corners = [merc_to_lonlat(bounds[0], bounds[3]), merc_to_lonlat(bounds[2], bounds[3]),
               merc_to_lonlat(bounds[2], bounds[1]), merc_to_lonlat(bounds[0], bounds[1])]

    qs = BANDS["qvalue"]["scale"]
    qq = np.round(bands["qvalue"] / qs) * qs

    out = {
        "source": "openEO / Copernicus Data Space, jaarstatistieken per gridcel "
                  "van %g m" % grid["cell_m"],
        "demo": False, "index": meta["index"], "stat": "p50/p90/p10 per jaar",
        "crs": "EPSG:3857", "width": ncol, "height": nrow,
        "bounds_3857": [round(v, 2) for v in bounds],
        "corners": [[round(lo, 7), round(la, 7)] for lo, la in corners],
        "nodata": NODATA_I16, "bands": band_meta,
        "pixels_valid": int(np.isfinite(bands["slope"]).sum()),
        "pixels_significant": int(np.sum(np.isfinite(qq) & (qq < FDR_ALPHA))),
        "fdr_alpha": FDR_ALPHA,
        "period": meta["period"],
        "aggregation": {
            "by": "grid", "field": "cel", "cell_m": grid["cell_m"],
            "zones_total": ncell,
            "zones_tested": int(np.isfinite(results["level"]["slope"]).sum()),
            "zones_significant": int(np.sum(np.isfinite(results["level"]["q"])
                                            & (results["level"]["q"] < FDR_ALPHA))),
            "min_years": args.min_years,
            "min_obs_per_year": MIN_OBS_PER_YEAR,
            "stats": {k: {
                "label": STATS[k]["label"],
                "tested": int(np.isfinite(results[k]["slope"]).sum()),
                "significant": int(np.sum(np.isfinite(results[k]["q"])
                                          & (results[k]["q"] < FDR_ALPHA))),
                "best_q": (None if not np.isfinite(results[k]["q"]).any()
                           else float("%.3g" % np.nanmin(results[k]["q"]))),
            } for k in STATS},
            "table": [],
        },
        "method": (
            "Per gridcel de jaarlijkse p50, p90 en p10 van de waarnemingen, en het "
            "bereik als p90 - p10. Daarna per cel Theil-Sen + Mann-Kendall over de "
            "jaren en Benjamini-Hochberg over de cellen. LET OP: het rapport gebruikt "
            "max/min van de HANTS-gladgestreken jaarcurve. Hier percentielen van de "
            "ruwe waarnemingen, omdat een kale harmonische fit op deze data instabiel "
            "is (1% onmogelijke curves) en echte max/min een schijntrend zouden geven "
            "doordat het aantal waarnemingen per jaar met +1,17 groeit."),
    }
    (out_dir / "meta.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print("\n%s: %dx%d, %d cellen met een trend"
          % (out_dir, ncol, nrow, out["aggregation"]["zones_tested"]), file=sys.stderr)


if __name__ == "__main__":
    main()
