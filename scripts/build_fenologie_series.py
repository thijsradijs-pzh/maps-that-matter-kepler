#!/usr/bin/env python3
"""
Haal de volledige NDVI-tijdreeks per zone op, zodat de viewer hem paraat heeft.

Waarom dit wel past en per pixel niet
-------------------------------------
De reeks per pixel is onbetaalbaar als statische download: ruim 500.000
pixels maal zo'n 700 opnamedatums is honderden miljoenen getallen. Per zone
is het een rekensom van niets. Met 17 beheertypen komen er ~12.000 waarden
terug (tientallen kB), met 828 percelen ~580.000 (ruim een MB als Int16).

Dat verschil zit in openEO zelf: `aggregate_spatial` doet de ruimtelijke
samenvatting op de backend, dus er komt alleen het eindresultaat over de
lijn. Dezelfde process graph als api/ndvi-series.js gebruikt voor een punt,
maar met polygonen in plaats van een punt, en alle zones in een keer.

Gevolg voor de viewer: in een zoneweergave levert een klik meteen de
tijdreeks, de seizoensreferentie, de z-anomalieen en de decompositie --
zonder tien tot veertig seconden wachten op Copernicus. Het live-pad blijft
bestaan voor een losse pixel buiten elke zone.

Gebruik
-------
  python3 scripts/build_fenologie_series.py --by type
  python3 scripts/build_fenologie_series.py --by polygon

  --dry-run    print de process graph en stop
  --job-id ID  haal een eerdere job op in plaats van een nieuwe in te dienen

Uitvoer: data/fenologie/series-<by>.json

  {
    "meta": {...},
    "dates": ["2016-01-06", ...],        // gedeelde tijdas
    "zones": [
      { "zone": "N12.02", "v": "<base64 Int16, NDVI*10000, -32768 = leeg>" }
    ]
  }

De viewer decodeert dat net als de rasterbanden en voert het aan
Series.climatology(), dezelfde code die een live opgehaalde punt-reeks
verwerkt.
"""

import argparse
import base64
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_fenologie_raster import DEMO_RING, lonlat_to_merc, merc_to_lonlat  # noqa: E402
from build_fenologie_openeo import (  # noqa: E402
    INDICES, OPENEO_URL, SCL_DROP, _get, _post, auth_header, get_token,
    job_id_from,
)
from aggregate_fenologie_zones import NBP_QUERY, ZONE_FIELD, fetch_zones  # noqa: E402

SCALE = 10000
NODATA = -32768


def build_graph(bbox, years, index, geometries):
    """Zelfde maskering als de rest, maar samengevat per polygoon.

    aggregate_spatial reduceert op de backend tot een waarde per geometrie per
    datum, dus er komt geen raster over de lijn. Het antwoord is JSON.
    """
    spec = INDICES[index]
    bands = spec["bands"] + ["SCL"]
    scl_index = len(bands) - 1

    reducer = {
        "red": {"process_id": "array_element",
                "arguments": {"data": {"from_parameter": "data"}, "index": spec["red"]}},
        "nir": {"process_id": "array_element",
                "arguments": {"data": {"from_parameter": "data"}, "index": spec["nir"]}},
        "scl": {"process_id": "array_element",
                "arguments": {"data": {"from_parameter": "data"}, "index": scl_index}},
        "nd": {"process_id": "normalized_difference",
               "arguments": {"x": {"from_node": "nir"}, "y": {"from_node": "red"}}},
    }
    for i, cls in enumerate(SCL_DROP):
        reducer["c%d" % i] = {"process_id": "eq",
                              "arguments": {"x": {"from_node": "scl"}, "y": cls}}
    reducer["cloudy"] = {
        "process_id": "any",
        "arguments": {"data": [{"from_node": "c%d" % i} for i in range(len(SCL_DROP))],
                      "ignore_nodata": True}}
    # accept: null wordt door CDSE geweigerd, dus omgedraaid -- zie de
    # toelichting in build_fenologie_openeo.build_graph().
    reducer["clear"] = {"process_id": "not",
                        "arguments": {"x": {"from_node": "cloudy"}}}
    reducer["out"] = {
        "process_id": "if",
        "arguments": {"value": {"from_node": "clear"},
                      "accept": {"from_node": "nd"}},
        "result": True}

    return {
        "load": {
            "process_id": "load_collection",
            "arguments": {
                "id": "SENTINEL2_L2A",
                "spatial_extent": {"west": bbox[0], "south": bbox[1],
                                   "east": bbox[2], "north": bbox[3],
                                   "crs": "EPSG:4326"},
                "temporal_extent": ["%d-01-01" % years[0], "%d-01-01" % (years[-1] + 1)],
                "bands": bands,
                "properties": {"eo:cloud_cover": {"process_graph": {
                    "lte": {"process_id": "lte",
                            "arguments": {"x": {"from_parameter": "value"}, "y": 85},
                            "result": True}}}},
            }},
        "index": {
            "process_id": "reduce_dimension",
            "arguments": {"data": {"from_node": "load"}, "dimension": "bands",
                          "reducer": {"process_graph": reducer}}},
        "agg": {
            "process_id": "aggregate_spatial",
            "arguments": {
                "data": {"from_node": "index"},
                "geometries": geometries,
                "reducer": {"process_graph": {
                    "m": {"process_id": "median",
                          "arguments": {"data": {"from_parameter": "data"}},
                          "result": True}}}}},
        "save": {
            "process_id": "save_result",
            "arguments": {"data": {"from_node": "agg"}, "format": "JSON"},
            "result": True},
    }


def dissolve_by_type(feats, field, tolerance=0.0):
    """Voeg alle polygonen van een beheertype samen tot een geldige geometrie.

    Niet door de coordinaat-arrays aan elkaar te plakken: dat geeft een
    MultiPolygon waarin gaten niet meer bij hun schil horen, en GEOS antwoordt
    dan met "TopologyException: unable to assign free hole to a shell". Het
    moet een echte dissolve zijn, met unary_union, en elk polygoon eerst
    valideren -- de bronkaart bevat zelf ook ongeldige ringen.

    tolerance vereenvoudigt daarna in graden (1e-4 is ~11 m, ongeveer een
    pixelbreedte). De process graph gaat als JSON in de POST mee en CDSE
    antwoordt boven een paar MB met 413 Request Entity Too Large.
    """
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union

    groups = {}
    for f in feats:
        geom = shape(f["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)          # herstelt zelfsnijdende ringen
        if geom.is_empty:
            continue
        groups.setdefault(str(f["properties"].get(field)), []).append(geom)

    out = []
    for key in sorted(groups):
        merged = unary_union(groups[key])
        if tolerance:
            merged = merged.simplify(tolerance, preserve_topology=True)
            if not merged.is_valid:
                merged = merged.buffer(0)
        if merged.is_empty:
            continue
        out.append({
            "type": "Feature",
            "properties": {"zone": key},
            "geometry": mapping(merged),
        })
    return out


def simplify(zones, decimals):
    """Rond coordinaten af en gooi opeenvolgende duplicaten weg.

    De process graph gaat als JSON in de POST mee, en de beheertypenkaart is
    met volle precisie 5,7 MB -- daar antwoordt CDSE met 413 Request Entity
    Too Large op. Afronden op 4 decimalen is ~11 m, ongeveer een pixelbreedte:
    op de rand van een zone kan daardoor een pixel omvallen, maar de mediaan
    over duizenden pixels merkt daar niets van.
    """
    if not decimals:
        return zones

    def rnd(o):
        if isinstance(o, list):
            if o and isinstance(o[0], (int, float)):
                return [round(o[0], decimals), round(o[1], decimals)]
            return [rnd(x) for x in o]
        return o

    out = json.loads(json.dumps(zones))
    for z in out:
        z["geometry"]["coordinates"] = rnd(z["geometry"]["coordinates"])
        for poly in z["geometry"]["coordinates"]:
            for i, ring in enumerate(poly):
                new = [ring[0]]
                for pt in ring[1:]:
                    if pt != new[-1]:
                        new.append(pt)
                poly[i] = new if len(new) >= 4 else ring
    return out


def parse_result(raw, names):
    """openEO geeft { "<iso-datum>": [[v_zone0], [v_zone1], ...] }."""
    dates, rows = [], []
    for key in sorted(raw.keys()):
        date = key[:10]
        if len(date) != 10 or date[4] != "-":
            continue
        entry = raw[key]
        vals = []
        for i in range(len(names)):
            v = entry[i] if i < len(entry) else None
            while isinstance(v, list):
                v = v[0] if v else None
            vals.append(np.nan if v is None or not np.isfinite(v) else float(v))
        if np.all(np.isnan(vals)):
            continue          # datum waarop alles bewolkt was
        dates.append(date)
        rows.append(vals)
    if not rows:
        raise SystemExit("geen bruikbare datums in het antwoord")
    return dates, np.array(rows)          # (datums, zones)


def b64_int16(values):
    a = np.asarray(values, dtype="float64")
    q = np.where(np.isnan(a), NODATA, np.clip(np.round(a * SCALE), -32000, 32000))
    return base64.b64encode(q.astype("<i2").tobytes()).decode("ascii")


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--by", choices=["type", "polygon"], default="type")
    ap.add_argument("--index", default="ndvi", choices=sorted(INDICES))
    ap.add_argument("--field", default=ZONE_FIELD)
    ap.add_argument("--zones-url", default=NBP_QUERY)
    ap.add_argument("--start-year", type=int, default=2016)
    ap.add_argument("--end-year", type=int, default=2025)
    ap.add_argument("--simplify", type=int, default=4,
                    help="decimalen om de zonegrenzen op af te ronden; 4 is "
                         "~11 m. Met volle precisie is de process graph 5,7 MB "
                         "en antwoordt CDSE met 413. 0 = niet vereenvoudigen.")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--job-id", default=None)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    years = list(range(args.start_year, args.end_year + 1))
    ring = [lonlat_to_merc(lo, la) for lo, la in DEMO_RING]
    sw = merc_to_lonlat(min(p[0] for p in ring), min(p[1] for p in ring))
    ne = merc_to_lonlat(max(p[0] for p in ring), max(p[1] for p in ring))
    bbox = [round(sw[0], 6), round(sw[1], 6), round(ne[0], 6), round(ne[1], 6)]

    feats = fetch_zones(bbox, out_sr=4326, field=args.field, url=args.zones_url,
                        cache=Path("data/fenologie/_zones-4326.geojson"))
    if args.by == "type":
        zones = dissolve_by_type(feats, args.field,
                                 tolerance=10 ** -args.simplify if args.simplify else 0.0)
    else:
        zones = [{"type": "Feature",
                  "properties": {"zone": "%s #%d" % (f["properties"].get(args.field), i + 1)},
                  "geometry": f["geometry"]}
                 for i, f in enumerate(feats)]
    names = [z["properties"]["zone"] for z in zones]
    if args.by != "type":
        zones = simplify(zones, args.simplify)
    fc = {"type": "FeatureCollection", "features": zones}
    print("  %d zones, payload %.2f MB"
          % (len(names), len(json.dumps(fc)) / 1e6), file=sys.stderr)
    graph = build_graph(bbox, years, args.index, fc)

    if args.dry_run:
        slim = json.loads(json.dumps(graph))
        slim["agg"]["arguments"]["geometries"] = "<FeatureCollection met %d zones>" % len(names)
        print(json.dumps({"process_graph": slim}, indent=1))
        return

    token = get_token()
    hdr = auth_header(token)
    if args.job_id:
        job_id = args.job_id
    else:
        job, headers = _post(OPENEO_URL + "/jobs",
                             {"process": {"process_graph": graph},
                              "title": "fenologie reeksen per %s" % args.by}, hdr)
        job_id = job_id_from(job, headers)
        if not job_id:
            raise SystemExit("geen job-id: %s / %s" % (job, list(headers or {})))
        _post(OPENEO_URL + "/jobs/%s/results" % job_id, {}, hdr)
        print("job %s ingediend en gestart" % job_id, file=sys.stderr)
        print("volgen met: --job-id %s" % job_id, file=sys.stderr)
        return

    res = _get(OPENEO_URL + "/jobs/%s/results" % job_id, hdr)
    assets = res.get("assets", {})
    jsons = [a["href"] for n, a in assets.items() if n.lower().endswith(".json")]
    if not jsons:
        raise SystemExit("geen JSON in de resultaten: %s" % list(assets))

    import urllib.request
    # Voorondertekende S3-link: geen Authorization meesturen, dat weigert S3.
    with urllib.request.urlopen(jsons[0], timeout=600) as r:
        raw = json.loads(r.read())

    dates, table = parse_result(raw, names)
    print("  %d datums, %d zones" % (len(dates), table.shape[1]), file=sys.stderr)

    out = {
        "meta": {
            "source": "openEO / Copernicus Data Space, aggregate_spatial per %s"
                      % ("beheertype" if args.by == "type" else "beheerperceel"),
            "index": args.index.upper(),
            "by": args.by,
            "field": args.field,
            "scale": SCALE,
            "nodata": NODATA,
            "period": ["%d-01-01" % years[0], "%d-12-31" % years[-1]],
            "note": ("Mediaan over de pixels van de zone, per opnamedatum. "
                     "Wolken gemaskeerd op SCL 3/8/9/10/11, scenes met meer dan "
                     "85% bewolking overgeslagen."),
        },
        "dates": dates,
        "zones": [{"zone": names[i], "n": int(np.isfinite(table[:, i]).sum()),
                   "v": b64_int16(table[:, i])}
                  for i in range(table.shape[1])],
    }
    dest = Path(args.out or ("data/fenologie/series-%s.json" % args.by))
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print("\n%s: %.0f kB, %d datums, %d zones"
          % (dest, dest.stat().st_size / 1e3, len(dates), len(names)), file=sys.stderr)
    cov = [z["n"] for z in out["zones"]]
    print("  waarnemingen per zone: min %d, mediaan %d, max %d"
          % (min(cov), int(np.median(cov)), max(cov)), file=sys.stderr)


if __name__ == "__main__":
    main()
