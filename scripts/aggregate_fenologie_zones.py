#!/usr/bin/env python3
"""
Aggregeer de fenologie-trend naar gebiedseenheden in plaats van losse pixels.

Waarom
------
De pixelkaart uit build_fenologie_openeo.py levert over Nieuwkoop NUL
significante pixels. Niet omdat er geen signaal is -- 9,1% van de pixels
haalt ruwe p < 0,05 waar 5% door toeval verwacht wordt -- maar omdat
Mann-Kendall op tien jaarwaarden een harde p-ondergrens van 8,3e-5 heeft en
Benjamini-Hochberg over 1,5 miljoen pixels dan minstens ~3.100 pixels op die
ondergrens eist. Zie detection_floor() in het buildscript.

De uitweg is niet fijner meten maar grover toetsen. Hoofdstuk 5.3.1 van
*Monitoring habitatveranderingen Nieuwkoop* stelt dat zelf voor: "Resultaten
kunnen eerst per habitattype worden samengevat." Met 17 beheertypen in plaats
van 1,5 miljoen pixels valt de meervoudigheidscorrectie vijf ordes van grootte
milder uit.

Belangrijk: dit middelt GEEN pixelhellingen. Per zone wordt eerst de
jaarreeks samengevat (mediaan over de pixels, per jaar), en daarna draait
Theil-Sen + Mann-Kendall op die ene reeks van tien waarden. Dat is dezelfde
volgorde als hoofdstuk 11 aanhoudt en de enige die statistisch klopt: het
gemiddelde van duizend hellingen heeft geen bruikbare toetsingsverdeling.

Zones
-----
PDOK heeft geen bruikbare habitattypenkaart (de Natura 2000-service van RVO
geeft alleen begrenzing, en "Habitatrichtlijn verspreiding van habitattypen"
is het EU-rapportageraster van 10x10 km; de echte kaart zit in de NDVH bij
BIJ12). Publiek alternatief, en wat dit script standaard gebruikt: de
beheertypenkaart uit het provinciale Natuurbeheerplan, dezelfde service die
gebiedsviewer al ontsluit.

  --by type      alle polygonen met hetzelfde beheertype vormen een zone
                 (17 zones over Nieuwkoop; dit is wat het rapport voorstelt)
  --by polygon   elk polygoon een eigen zone (2.315 zones; fijner, dichter
                 bij "welk perceel moet ik bezoeken", maar de correctie is
                 navenant strenger)

Gebruik
-------
  python3 scripts/aggregate_fenologie_zones.py --by type

Vereist de jaarrasters uit een eerdere run met --keep-tif:
  data/fenologie/_openeo/*.tif

Uitvoer: dezelfde vier PNG's plus meta.json als de pixelkaart, maar elke
pixel draagt de waarde van zijn zone. De viewer hoeft daardoor niets te
weten van zones -- hij toont gewoon een trendkaart. In meta.json staat
daarnaast een tabel met alle zones, zodat de cijfers na te lezen zijn.
"""

import argparse
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_fenologie_raster import (  # noqa: E402
    BANDS, DEMO_RING, NODATA_I16, lonlat_to_merc, merc_to_lonlat,
    point_in_ring, write_value_png,
)
from build_fenologie_openeo import (  # noqa: E402
    FDR_ALPHA, MIN_OBS, _with_retry, detection_floor, fdr_pvalue, theilsen_mk,
)

NBP_QUERY = ("https://geoservices.zuid-holland.nl/arcgis/rest/services"
             "/Landelijk_gebied/Landelijk_gebied_NBP_2026/MapServer/0/query")
ZONE_FIELD = "beheerType"
MIN_ZONE_AREA_HA = 0.25   # kleiner zegt niets over een trend
MIN_ZONE_PIXELS = 10      # harde ondergrens voor een stabiele mediaan


def fetch_zones(bbox_ll, out_sr=3857, field=ZONE_FIELD, url=NBP_QUERY,
                cache=None):
    """Haal de beheertypen-polygonen op als GeoJSON in EPSG:3857.

    outSR=3857 laat de server projecteren, dan hoeft dat hier niet en sluit
    het naadloos aan op het raster.

    Het antwoord is een kleine 6 MB en de verbinding hiernaartoe is niet
    altijd stabiel: een afgekapt antwoord geeft een JSONDecodeError midden in
    het bestand, niet een nette HTTP-fout. Vandaar het lezen-tot-het-einde met
    retry, plus een cache zodat een herhaalde run niets opnieuw hoeft te halen.
    """
    cache = Path(cache) if cache else None
    if cache and cache.exists():
        try:
            gj = json.loads(cache.read_text(encoding="utf-8"))
            feats = [f for f in gj.get("features", []) if f.get("geometry")]
            if feats:
                print("  beheertypen uit de cache (%s)" % cache.name,
                      file=sys.stderr)
                return feats
        except (ValueError, OSError):
            print("  cache onbruikbaar, opnieuw ophalen", file=sys.stderr)

    q = urllib.parse.urlencode({
        "where": "1=1",
        "geometry": "%f,%f,%f,%f" % tuple(bbox_ll),
        "geometryType": "esriGeometryEnvelope",
        "inSR": 4326,
        "outSR": out_sr,
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": field,
        "returnGeometry": "true",
        "f": "geojson",
    })
    full = url + "?" + q

    def get():
        with urllib.request.urlopen(full, timeout=300) as r:
            raw = r.read()
        # Een afgekapt antwoord is geldige bytes maar ongeldige JSON; die
        # moet als netwerkfout tellen zodat de retry hem oppakt.
        try:
            return json.loads(raw)
        except ValueError as e:
            raise OSError("afgekapt antwoord (%d bytes): %s" % (len(raw), e))

    print("  beheertypen ophalen bij de provincie (~6 MB)...", file=sys.stderr)
    gj = _with_retry(get, "beheertypen")

    feats = [f for f in gj.get("features", []) if f.get("geometry")]
    if not feats:
        raise SystemExit("geen polygonen teruggekregen; is de bbox goed?")
    if gj.get("exceededTransferLimit"):
        print("  LET OP: de server kapte het resultaat af; niet alle polygonen "
              "zijn meegenomen.", file=sys.stderr)
    if cache:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(gj), encoding="utf-8")
        print("  gecachet in %s" % cache, file=sys.stderr)
    return feats


def build_zone_raster(feats, by, field, shape, transform):
    """Rasteriseer de polygonen tot een zonelaag met 0 = buiten elke zone."""
    from rasterio.features import rasterize

    if by == "type":
        labels = sorted({str(f["properties"].get(field)) for f in feats})
        index = {lab: i + 1 for i, lab in enumerate(labels)}
        shapes = [(f["geometry"], index[str(f["properties"].get(field))])
                  for f in feats]
        names = labels
    else:
        shapes = [(f["geometry"], i + 1) for i, f in enumerate(feats)]
        names = ["%s #%d" % (f["properties"].get(field), i + 1)
                 for i, f in enumerate(feats)]

    zones = rasterize(shapes, out_shape=shape, transform=transform,
                      fill=0, dtype="int32", all_touched=False)
    return zones, names


def zone_series(cube, zones, n_zones):
    """Mediaan per zone per jaar -> (jaren, zones), met NaN waar niets ligt."""
    from scipy import ndimage

    idx = np.arange(1, n_zones + 1)
    out = np.full((cube.shape[0], n_zones), np.nan)
    for t in range(cube.shape[0]):
        layer = cube[t]
        valid = np.isfinite(layer)
        # ndimage.median negeert NaN niet, dus zones zonder geldige pixels
        # apart afvangen via een telling op het geldige masker.
        counts = ndimage.sum(valid.astype("float64"), labels=zones, index=idx)
        safe = np.where(valid, layer, 0.0)
        med = ndimage.median(np.where(valid, layer, np.nan),
                             labels=np.where(valid, zones, 0), index=idx)
        med = np.asarray(med, dtype="float64")
        out[t] = np.where(counts > 0, med, np.nan)
        del safe
    return out


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--by", choices=["type", "polygon"], default="type")
    ap.add_argument("--field", default=ZONE_FIELD)
    ap.add_argument("--zones-url", default=NBP_QUERY)
    ap.add_argument("--zones-file", default=None,
                    help="lokale GeoJSON in EPSG:3857 in plaats van de service")
    ap.add_argument("--tif-dir", default="data/fenologie/_openeo")
    ap.add_argument("--out-dir", default=None,
                    help="standaard data/fenologie/raster-<by>")
    ap.add_argument("--min-area", type=float, default=MIN_ZONE_AREA_HA,
                    help="kleinste zone in hectare (default 0,25), in oppervlakte "
                         "en niet in pixels zodat runs bij verschillende "
                         "resoluties vergelijkbaar blijven")
    ap.add_argument("--min-pixels", type=int, default=MIN_ZONE_PIXELS,
                    help="harde ondergrens voor een stabiele mediaan (default 10)")
    args = ap.parse_args()

    tifs = sorted(Path(args.tif_dir).glob("*.tif"))
    if len(tifs) < 5:
        raise SystemExit(
            "Te weinig jaarrasters in %s (gevonden: %d).\n"
            "Draai eerst:  python3 scripts/build_fenologie_openeo.py --keep-tif"
            % (args.tif_dir, len(tifs)))

    import rasterio
    layers, transform, crs = [], None, None
    for p in tifs:
        with rasterio.open(p) as ds:
            a = ds.read(1).astype("float64")
            if ds.nodata is not None and np.isfinite(ds.nodata):
                a = np.where(a == ds.nodata, np.nan, a)
            layers.append(a)
            if transform is None:
                transform, crs = ds.transform, ds.crs
    cube = np.stack(layers)
    h, w = cube.shape[1], cube.shape[2]
    years = [int(p.name.split("_")[1][:4]) for p in tifs]
    print("%d jaarrasters, %d x %d, %s" % (len(tifs), w, h, crs), file=sys.stderr)

    if args.zones_file:
        feats = json.loads(Path(args.zones_file).read_text(encoding="utf-8"))["features"]
    else:
        ring_m = [lonlat_to_merc(lo, la) for lo, la in DEMO_RING]
        sw = merc_to_lonlat(min(p[0] for p in ring_m), min(p[1] for p in ring_m))
        ne = merc_to_lonlat(max(p[0] for p in ring_m), max(p[1] for p in ring_m))
        feats = fetch_zones([sw[0], sw[1], ne[0], ne[1]], field=args.field,
                            url=args.zones_url,
                            cache=Path(args.tif_dir).parent / "_zones.geojson")
    print("  %d polygonen" % len(feats), file=sys.stderr)

    zones, names = build_zone_raster(feats, args.by, args.field, (h, w), transform)
    n_zones = len(names)
    covered = int((zones > 0).sum())
    print("  %d zones, %d pixels binnen een zone (%.0f%% van het raster)"
          % (n_zones, covered, 100.0 * covered / (h * w)), file=sys.stderr)

    series = zone_series(cube, zones, n_zones)          # (jaren, zones)
    px_per_zone = np.bincount(zones.ravel(), minlength=n_zones + 1)[1:]

    # Theil-Sen + MK per zone. theilsen_mk() verwacht een (tijd, rij, kolom)
    # kubus; een rij van zones is precies dat, met hoogte 1.
    res = theilsen_mk(series[:, None, :], min_obs=MIN_OBS)
    slope = res["slope"][0]
    tau = res["tau"][0]
    pval = res["pvalue"][0]
    count = res["count"][0]

    # Drempel in OPPERVLAKTE, niet in pixels: een pixeldrempel schuift mee met
    # de resolutie en maakt twee runs onvergelijkbaar. Bij 6,14 m was 25 px
    # 945 m2 en bij 10 m 2.500 m2, waardoor precies de kleine percelen met de
    # sterkste trends uit de tweede run vielen.
    lat_mid = (merc_to_lonlat(transform.c, transform.f)[1]
               + merc_to_lonlat(transform.c, transform.f + transform.e * h)[1]) / 2
    px_area = abs(transform.a * transform.e) * math.cos(math.radians(lat_mid)) ** 2
    min_px = max(args.min_pixels, int(round(args.min_area * 1e4 / px_area)))

    too_small = px_per_zone < min_px
    for arr in (slope, tau, pval, count):
        arr[too_small] = np.nan
    q = fdr_pvalue(pval)

    n_tested = int(np.isfinite(pval).sum())
    n_sig = int(np.sum(np.isfinite(q) & (q < FDR_ALPHA)))
    print("\n  pixel %.1f m2, drempel %.2f ha = %d pixels"
          % (px_area, args.min_area, min_px), file=sys.stderr)
    print("  getoetst: %d zones (%d te klein)"
          % (n_tested, int(too_small.sum())), file=sys.stderr)
    print("  significant: %d bij q < %g" % (n_sig, FDR_ALPHA), file=sys.stderr)

    # terugschilderen naar het raster: elke pixel krijgt de waarde van zijn zone
    lut = lambda v: np.concatenate([[np.nan], v])[zones]   # noqa: E731
    bands = {"slope": lut(slope), "tau": lut(tau),
             "qvalue": lut(q), "count": lut(count)}
    # Extra band met de zone-index (1-based, 0 = buiten elke zone). Daarmee
    # weet een klik in de viewer bij welke zone hij hoort, en kan de vooraf
    # opgehaalde tijdreeks er direct bij gezocht worden.
    bands["zone"] = np.where(zones > 0, zones.astype("float64"), np.nan)

    # buiten de Natura 2000-omtrek niets tonen, net als de pixelkaart
    gx = transform.c + (np.arange(w) + 0.5) * transform.a
    gy = transform.f + (np.arange(h) + 0.5) * transform.e
    X, Y = np.meshgrid(gx, gy)
    inside = point_in_ring(X, Y, [lonlat_to_merc(lo, la) for lo, la in DEMO_RING])
    for k in bands:
        bands[k] = np.where(inside, bands[k], np.nan)

    out_dir = Path(args.out_dir or ("data/fenologie/raster-" + args.by))
    out_dir.mkdir(parents=True, exist_ok=True)
    specs = dict(BANDS)
    specs["zone"] = {"scale": 1.0, "label": "zone-index", "unit": ""}
    band_meta = {}
    for name, spec in specs.items():
        write_value_png(out_dir / ("%s.png" % name), bands[name], spec["scale"])
        finite = bands[name][np.isfinite(bands[name])]
        band_meta[name] = {
            "file": "%s.png" % name, "scale": spec["scale"],
            "label": spec["label"], "unit": spec["unit"],
            "min": None if not finite.size else round(float(finite.min()), 6),
            "max": None if not finite.size else round(float(finite.max()), 6),
        }

    bounds = [transform.c, transform.f + transform.e * h,
              transform.c + transform.a * w, transform.f]
    corners = [merc_to_lonlat(bounds[0], bounds[3]), merc_to_lonlat(bounds[2], bounds[3]),
               merc_to_lonlat(bounds[2], bounds[1]), merc_to_lonlat(bounds[0], bounds[1])]

    qs = BANDS["qvalue"]["scale"]
    qq = np.round(bands["qvalue"] / qs) * qs
    n_sig_px = int(np.sum(np.isfinite(qq) & (qq < FDR_ALPHA)))

    # Bij gelijke q -- heel gewoon, BH geeft hele groepen dezelfde waarde --
    # sorteert een enkele sleutel willekeurig. Dan het sterkste effect eerst.
    keyq = np.where(np.isfinite(q), q, 2.0)
    keyt = np.where(np.isfinite(tau), -np.abs(tau), 0.0)
    order = np.lexsort((keyt, keyq))
    table = []
    for i in order:
        if not np.isfinite(slope[i]):
            continue
        table.append({
            "index": int(i) + 1,
            "zone": names[i],
            "pixels": int(px_per_zone[i]),
            "slope": round(float(slope[i]), 6),
            "tau": None if not np.isfinite(tau[i]) else round(float(tau[i]), 3),
            "p": None if not np.isfinite(pval[i]) else float("%.3g" % pval[i]),
            "q": None if not np.isfinite(q[i]) else float("%.3g" % q[i]),
        })

    p_min, k_min, _ = detection_floor(max(1, n_tested), len(years), pixel_m2=1.0)
    meta = {
        "source": "openEO / Copernicus Data Space, jaarmedianen %d-%d, "
                  "geaggregeerd per %s uit het Natuurbeheerplan"
                  % (years[0], years[-1],
                     "beheertype" if args.by == "type" else "beheerperceel"),
        "demo": False,
        "index": "NDVI",
        "stat": "median per zone",
        "crs": str(crs),
        "width": w, "height": h,
        "bounds_3857": [round(v, 2) for v in bounds],
        "corners": [[round(lo, 7), round(la, 7)] for lo, la in corners],
        "nodata": NODATA_I16,
        "bands": band_meta,
        "pixels_valid": int(np.isfinite(bands["slope"]).sum()),
        "pixels_significant": n_sig_px,
        "fdr_alpha": FDR_ALPHA,
        "period": ["%d-01-01" % years[0], "%d-12-31" % years[-1]],
        "aggregation": {
            "by": args.by,
            "field": args.field,
            "zones_total": n_zones,
            "zones_tested": n_tested,
            "zones_significant": n_sig,
            "min_area_ha": args.min_area,
            "min_pixels": min_px,
            "pixel_m2": round(px_area, 1),
            "detection_floor_p": p_min,
            "zones_needed_at_floor": round(k_min, 1),
            "table": table,
        },
        "method": (
            "Per zone eerst de mediaan over de pixels per jaar, daarna Theil-Sen "
            "+ Mann-Kendall op die reeks van %d jaarwaarden, en Benjamini-Hochberg "
            "over de %d getoetste zones. Niet het gemiddelde van pixelhellingen: "
            "dat heeft geen bruikbare toetsingsverdeling. Zones uit de "
            "beheertypenkaart van het Natuurbeheerplan (provincie Zuid-Holland)."
            % (len(years), n_tested)),
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")

    print("\n  detectiegrens bij %d zones: p_min %.2e, minstens %.1f zones op de "
          "bodem nodig" % (n_tested, p_min, k_min), file=sys.stderr)
    print("\n  sterkste zones:", file=sys.stderr)
    for row in table[:8]:
        print("    %-28s %6d px  %+.5f/jaar  tau %+.2f  q %s"
              % (row["zone"][:28], row["pixels"], row["slope"],
                 row["tau"] if row["tau"] is not None else float("nan"),
                 row["q"]), file=sys.stderr)
    print("\n%s geschreven" % out_dir, file=sys.stderr)


if __name__ == "__main__":
    main()
