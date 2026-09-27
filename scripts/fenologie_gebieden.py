"""Gebiedsdefinities voor de fenologie-pipeline.

Tot september 2026 hing de hele keten aan `DEMO_RING` in
export_fenologie_raster.py: een handgetekende twaalfpuntsvorm met het comment
"alleen voor --demo", die build_fenologie_openeo.py óók voor de productiekaart
gebruikte. Gemeten tegen de echte grens viel daardoor 457 ha (23%) van het
Natura 2000-gebied Nieuwkoopse Plassen & De Haeck buiten de analyse, terwijl er
~3.950 ha werd getoetst die geen N2000 is -- boerenland en dorpen, die wel
meetellen in de meervoudigheidscorrectie en de detectiegrens dus onnodig
omhoog duwen.

Hier komt de omtrek uit de landelijke Natura 2000-service van RVO bij PDOK. Dat
is dezelfde bron die de gebiedsbesluiten publiceert, hij is provincie-
onafhankelijk (het stuk Nieuwkoop dat in Utrecht ligt zit er gewoon in) en hij
kost niets.

LET OP bij de WFS: `CQL_FILTER` wordt door deze service stilzwijgend genegeerd
-- een query met een filter geeft gewoon alle 209 gebieden terug (24 MB). De
bbox-parameter werkt wel. Daarom staat er per gebied een ruime zoek-bbox in de
tabel hieronder en filteren we daarna op naam.
"""

import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

WEB_MERCATOR_R = 6378137.0

WFS = ("https://service.pdok.nl/rvo/natura2000/wfs/v1_0"
       "?service=WFS&version=2.0.0&request=GetFeature&typeNames=natura2000"
       "&outputFormat=application/json&srsName=EPSG:4326")

# Per gebied: de naam zoals RVO hem schrijft, een ruime zoek-bbox om de WFS mee
# te bevragen, en de rastermaat waarop de reeksen samengevat worden.
#
# `cell_m` verschilt bewust. Over Nieuwkoop (2.004 ha) geeft 200 m ~1.400
# cellen; over Coepelduynen (188 ha) zouden dat er nog geen 50 zijn en is de
# kaart onleesbaar, dus daar 100 m. Dat mag: de detectiegrens hangt aan het
# getoetste OPPERVLAK, niet aan de celmaat, dus fijner roosteren kost geen
# gevoeligheid (zie detection_floor() in build_fenologie_openeo.py).
GEBIEDEN = {
    "nieuwkoop": {
        "naam": "Nieuwkoopse Plassen & De Haeck",
        "label": "Nieuwkoopse Plassen & De Haeck",
        "zoek_bbox": [4.72, 52.09, 4.89, 52.19],
        "cell_m": 200.0,
        "centrum": [4.805, 52.138],
        "zoom": 12.1,
    },
    "coepelduynen": {
        "naam": "Coepelduynen",
        "label": "Coepelduynen",
        "zoek_bbox": [4.38, 52.19, 4.45, 52.25],
        "cell_m": 100.0,
        "centrum": [4.417, 52.223],
        "zoom": 13.6,
    },
}


# ---------------------------------------------------------------- projectie
def lonlat_to_merc(lon, lat):
    x = math.radians(lon) * WEB_MERCATOR_R
    y = math.log(math.tan(math.pi / 4.0 + math.radians(lat) / 2.0)) * WEB_MERCATOR_R
    return x, y


def merc_to_lonlat(x, y):
    lon = math.degrees(x / WEB_MERCATOR_R)
    lat = math.degrees(2.0 * math.atan(math.exp(y / WEB_MERCATOR_R)) - math.pi / 2.0)
    return lon, lat


# ---------------------------------------------------------------- ophalen
def _haal_geojson(zoek_bbox, naam, cache):
    """Het gebied als lijst van GeoJSON-geometrieën, met schijfcache."""
    if cache and cache.exists():
        try:
            gj = json.loads(cache.read_text(encoding="utf-8"))
            if gj.get("features"):
                return [f["geometry"] for f in gj["features"]]
        except (ValueError, OSError):
            print("  cache onbruikbaar, opnieuw ophalen", file=sys.stderr)

    # CRS84 als expliciete bbox-CRS: dan is de volgorde gegarandeerd lon,lat.
    # Zonder die URI valt de service terug op de as-volgorde van EPSG:4326
    # (lat,lon) en krijg je stilzwijgend nul features.
    q = "&bbox=" + urllib.parse.quote(
        "%f,%f,%f,%f,urn:ogc:def:crs:OGC:1.3:CRS84" % tuple(zoek_bbox))
    print("  gebiedsgrens ophalen bij PDOK (RVO Natura 2000)...", file=sys.stderr)
    with urllib.request.urlopen(WFS + q, timeout=180) as r:
        gj = json.loads(r.read())

    feats = [f for f in gj.get("features", [])
             if f.get("geometry") and f["properties"].get("naamN2K") == naam]
    if not feats:
        namen = sorted({f["properties"].get("naamN2K")
                        for f in gj.get("features", [])})
        raise SystemExit("geen polygonen voor %r in deze bbox; wel gevonden: %s"
                         % (naam, namen))

    if cache:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(
            {"type": "FeatureCollection", "features": feats}), encoding="utf-8")
        print("  gecachet in %s" % cache, file=sys.stderr)
    return [f["geometry"] for f in feats]


def _naar_polys(geoms, project=True):
    """GeoJSON-geometrieën -> [[buitenring, gat, ...], ...].

    Met project=True in EPSG:3857-meters, anders in graden.
    """
    fn = lonlat_to_merc if project else (lambda a, b: (a, b))
    polys = []
    for g in geoms:
        delen = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for deel in delen:
            polys.append([[fn(c[0], c[1]) for c in ring] for ring in deel])
    return polys


def laad_gebied(gid, cache_dir="data/fenologie/_gebieden"):
    """Alles wat de pipeline van een gebied moet weten."""
    if gid not in GEBIEDEN:
        raise SystemExit("onbekend gebied %r; keuze uit: %s"
                         % (gid, ", ".join(sorted(GEBIEDEN))))
    spec = dict(GEBIEDEN[gid])
    cache = Path(cache_dir) / ("%s.geojson" % gid) if cache_dir else None
    geoms = _haal_geojson(spec["zoek_bbox"], spec["naam"], cache)

    polys = _naar_polys(geoms, project=True)
    xs = [c[0] for p in polys for ring in p for c in ring]
    ys = [c[1] for p in polys for ring in p for c in ring]
    sw = merc_to_lonlat(min(xs), min(ys))
    ne = merc_to_lonlat(max(xs), max(ys))

    spec.update({
        "id": gid,
        "polys": polys,
        "bbox": [round(sw[0], 6), round(sw[1], 6), round(ne[0], 6), round(ne[1], 6)],
        "bbox_merc": [min(xs), min(ys), max(xs), max(ys)],
        "oppervlak_ha": oppervlak_ha(polys),
    })
    return spec


# ---------------------------------------------------------------- meetkunde
def _ring_kruisingen(X, Y, ring):
    """Even-odd kruisingstelling van één ring, vectorieel."""
    inside = np.zeros(X.shape, dtype=bool)
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        cond = ((y1 > Y) != (y2 > Y))
        with np.errstate(divide="ignore", invalid="ignore"):
            xint = (x2 - x1) * (Y - y1) / (y2 - y1) + x1
        inside ^= cond & (X < xint)
    return inside


def punt_in_gebied(X, Y, polys):
    """Masker voor een multipolygoon MET gaten.

    Per polygoon worden alle ringen ge-XOR'd: dat is de even-odd-vulregel, dus
    een punt dat binnen de buitenring maar ook binnen een gat valt telt twee
    keer en valt er terecht buiten. Petgaten en open water middenin een gebied
    horen namelijk niet meegetoetst te worden.
    """
    uit = np.zeros(X.shape, dtype=bool)
    for ringen in polys:
        binnen = np.zeros(X.shape, dtype=bool)
        for ring in ringen:
            binnen ^= _ring_kruisingen(X, Y, ring)
        uit |= binnen
    return uit


def oppervlak_ha(polys):
    """Schoenveteroppervlak in hectare; gaten tellen negatief.

    De ringen staan in EPSG:3857, en die rekt op breedtegraad 52 met 1/cos(lat)
    -- in oppervlak dus met het kwadraat daarvan. Zonder die correctie komt
    Nieuwkoop op ~5.300 ha uit in plaats van ~2.000.
    """
    totaal = 0.0
    for ringen in polys:
        for i, ring in enumerate(ringen):
            s = 0.0
            for k in range(len(ring)):
                x1, y1 = ring[k]
                x2, y2 = ring[(k + 1) % len(ring)]
                s += x1 * y2 - x2 * y1
            vlak = abs(s) / 2.0
            lat = merc_to_lonlat(ring[0][0], ring[0][1])[1]
            vlak *= math.cos(math.radians(lat)) ** 2
            totaal += vlak if i == 0 else -vlak
    return totaal / 1e4


if __name__ == "__main__":
    for gid in sorted(GEBIEDEN):
        g = laad_gebied(gid)
        print("%-14s %-34s %7.0f ha  bbox %s  cel %g m"
              % (gid, g["naam"], g["oppervlak_ha"], g["bbox"], g["cell_m"]))
