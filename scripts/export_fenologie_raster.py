#!/usr/bin/env python3
"""
Exporteer de per-pixel trendkaarten van de fenologie-pipeline naar /fenologie.

Dit script rekent NIETS uit. Hoofdstuk 11 van *Monitoring habitatveranderingen
Nieuwkoop* (HAS green academy + PZH, 2026) berekent de per-pixel Theil-Sen-
helling, Kendall's tau, de Mann-Kendall-p, de FDR-gecorrigeerde q en het aantal
geldige jaren al, en schrijft die als rasters weg:

    <index>_decomp_<stat>_trend_slope     Theil-Sen-helling (index/jaar)
    <index>_decomp_<stat>_trend_tau       Kendall's tau-b
    <index>_decomp_<stat>_trend_pvalue    ruwe Mann-Kendall-p
    <index>_decomp_<stat>_trend_qvalue    Benjamini-Hochberg-q
    <index>_decomp_<stat>_trend_sig       1 waar q < alpha, anders 0
    <index>_decomp_<stat>_trend_count     aantal geldige jaren

met <stat> in {median, max, min, range}. Dit script pakt die rasters in een
vorm die de viewer direct kan tonen, zonder dat de browser GDAL, geotiff.js of
een tegelserver nodig heeft.

Twee modi:

  --from-grass   Draai BINNEN een GRASS-sessie op de Nieuwkoop-mapset, nadat
                 notebook 11 gedraaid heeft.

                   grass /db/UTM_NLD/NDVI --exec \
                     python3 scripts/export_fenologie_raster.py --from-grass \
                       --index ndvi --stat median

  --demo         Een gesimuleerd trendveld in exact hetzelfde schema, zodat de
                 viewer werkt zonder GRASS-database. De viewer zet er dan zelf
                 een demo-badge bij.

                   python3 scripts/export_fenologie_raster.py --demo

LET OP: het GRASS-pad hier is nooit tegen een echte sessie gedraaid. Controleer de eerste export met --verify, dat trekt
een handvol pixels na met r.what.

Uitvoer (alles onder <out-dir>, standaard data/fenologie/raster):

  meta.json       bounds, afmetingen, per band de schaal en het waardenbereik
  <band>.png      de waarden zelf, verliesloos als Int16 in een PNG:
                    R = hoge byte, G = lage byte, B = 0, A = 255 (0 = nodata)
                  De browser decodeert dat met een gewone <img> + canvas, dus
                  zonder extra bibliotheek. Waarde = int16(R<<8 | G) * scale.

Het raster staat in EPSG:3857, zodat MapLibre het als image-source met vier
hoekcoordinaten exact op zijn plek legt zonder herprojectie in de browser.
"""

import argparse
import json
import math
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

import numpy as np

NODATA_I16 = -32768
WEB_MERCATOR_R = 6378137.0

# Welke grootheden we exporteren en hoe fijn ze in Int16 passen.
#   slope  NDVI/jaar, praktisch binnen +/-0,05 -> 1e-5 geeft +/-0,327
#   tau    [-1, 1]
#   qvalue [0, 1]
#   count  klein geheel getal
BANDS = {
    "slope": {"scale": 1e-5, "label": "Theil-Sen-helling", "unit": "index/jaar"},
    "tau": {"scale": 1e-4, "label": "Kendall's tau-b", "unit": ""},
    "qvalue": {"scale": 1e-4, "label": "FDR-gecorrigeerde q", "unit": ""},
    "count": {"scale": 1.0, "label": "geldige jaren", "unit": "jaar"},
}

# Benaderende omtrek van Nieuwkoopse Plassen & De Haeck, alleen voor --demo.
# Het GRASS-pad neemt de echte regio-uitsnede.
DEMO_RING = [
    (4.7760, 52.1320), (4.7910, 52.1180), (4.8180, 52.1120), (4.8520, 52.1140),
    (4.8810, 52.1250), (4.8980, 52.1420), (4.8960, 52.1610), (4.8770, 52.1760),
    (4.8480, 52.1860), (4.8150, 52.1880), (4.7900, 52.1780), (4.7770, 52.1580),
]


# ---------------------------------------------------------------- projectie
def lonlat_to_merc(lon, lat):
    x = math.radians(lon) * WEB_MERCATOR_R
    y = math.log(math.tan(math.pi / 4.0 + math.radians(lat) / 2.0)) * WEB_MERCATOR_R
    return x, y


def merc_to_lonlat(x, y):
    lon = math.degrees(x / WEB_MERCATOR_R)
    lat = math.degrees(2.0 * math.atan(math.exp(y / WEB_MERCATOR_R)) - math.pi / 2.0)
    return lon, lat


# ---------------------------------------------------------------- PNG
def write_value_png(path, values, scale):
    """Schrijf een float-array verliesloos weg als Int16-in-PNG.

    Pure stdlib (zlib + struct): in een GRASS-sessie is Pillow er lang niet
    altijd, en een PNG is simpel genoeg om zelf te schrijven.

    Kanalen: R = hoge byte van de Int16, G = lage byte, B = 0,
    A = 0 waar de waarde ontbreekt en 255 waar hij geldig is. De alpha doet
    dubbel werk: hij is het nodata-masker en zorgt er meteen voor dat lege
    pixels doorzichtig blijven als je de PNG rechtstreeks zou tonen.
    """
    a = np.asarray(values, dtype="float64")
    valid = np.isfinite(a)
    q = np.where(valid, np.round(a / scale), NODATA_I16)
    q = np.clip(q, -32767, 32767).astype("<i2")

    hi = ((q.view("<u2") >> 8) & 0xFF).astype("uint8")
    lo = (q.view("<u2") & 0xFF).astype("uint8")
    h, w = a.shape
    rgba = np.zeros((h, w, 4), dtype="uint8")
    rgba[..., 0] = hi
    rgba[..., 1] = lo
    rgba[..., 3] = np.where(valid, 255, 0).astype("uint8")

    # elke scanline krijgt filterbyte 0 ervoor
    raw = np.concatenate(
        [np.zeros((h, 1), dtype="uint8"), rgba.reshape(h, w * 4)], axis=1
    ).tobytes()

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    Path(path).write_bytes(png)
    return len(png)


# ---------------------------------------------------------------- GRASS
def _gs():
    import grass.script as gs
    return gs


def read_grass_bands(index, stat, verify=0):
    """Lees de trendrasters van hoofdstuk 11 en herprojecteer naar EPSG:3857.

    GRASS kan niet binnen een location herprojecteren, dus de route loopt via
    r.out.gdal + gdalwarp. GDAL zit altijd onder GRASS, dus dat is geen extra
    afhankelijkheid -- maar het is wel het stuk dat nooit getest is.
    """
    from osgeo import gdal

    gs = _gs()
    gdal.UseExceptions()

    prefix = "%s_decomp_%s_trend" % (index.lower(), stat)
    want = list(BANDS.keys())

    existing = set(gs.list_strings(type="raster"))
    missing = []
    for b in want:
        name = "%s_%s" % (prefix, b)
        if not any(s.split("@")[0] == name for s in existing):
            missing.append(name)
    if missing:
        raise SystemExit(
            "Deze rasters ontbreken in de mapset:\n  "
            + "\n  ".join(missing)
            + "\n\nDraai eerst notebook 11 (Seizoensdecompositie) voor index "
            + "'%s' en statistiek '%s'." % (index, stat)
        )

    tmp = Path(tempfile.mkdtemp(prefix="fenologie_export_"))
    out = {}
    warped_meta = None
    for b in want:
        src = "%s_%s" % (prefix, b)
        native = tmp / ("%s_native.tif" % b)
        merc = tmp / ("%s_3857.tif" % b)
        gs.run_command("r.out.gdal", input=src, output=str(native),
                       format="GTiff", type="Float32", nodata=float("nan"),
                       flags="c", quiet=True, overwrite=True)
        subprocess.run(
            ["gdalwarp", "-t_srs", "EPSG:3857", "-r", "near",
             "-dstnodata", "nan", "-overwrite", str(native), str(merc)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

        ds = gdal.Open(str(merc))
        arr = ds.GetRasterBand(1).ReadAsArray().astype("float64")
        gt = ds.GetGeoTransform()
        w, h = ds.RasterXSize, ds.RasterYSize
        ds = None

        if warped_meta is None:
            warped_meta = {"gt": gt, "w": w, "h": h}
        elif (w, h) != (warped_meta["w"], warped_meta["h"]):
            raise SystemExit(
                "Band %s heeft afmeting %dx%d, verwacht %dx%d -- de rasters "
                "staan niet op dezelfde regio." % (b, w, h,
                                                   warped_meta["w"], warped_meta["h"]))
        out[b] = arr

    if verify:
        verify_pixels(gs, prefix, verify)

    gt, w, h = warped_meta["gt"], warped_meta["w"], warped_meta["h"]
    bounds_merc = [gt[0], gt[3] + gt[5] * h, gt[0] + gt[1] * w, gt[3]]
    return out, bounds_merc, (w, h)


def verify_pixels(gs, prefix, n_check):
    """Trek een paar pixels na met r.what, los van de export-route.

    Bij --from-grass komt de waarde in het PNG via r.out.gdal + gdalwarp + de
    Int16-kwantisatie. Deze controle leest dezelfde pixel rechtstreeks uit
    GRASS, zodat je ziet of die keten iets stuk maakt.
    """
    import random

    info = gs.region()
    print("\nverificatie: %d pixels via r.what (los van de exportketen)"
          % n_check, file=sys.stderr)
    for _ in range(n_check):
        x = random.uniform(info["w"], info["e"])
        y = random.uniform(info["s"], info["n"])
        txt = gs.read_command("r.what", map="%s_slope" % prefix,
                              coordinates="%f,%f" % (x, y),
                              null_value="*", quiet=True).strip()
        print("  %.1f,%.1f -> %s" % (x, y, txt.split("|")[-1]), file=sys.stderr)


# ---------------------------------------------------------------- demo
def _correlated_noise(rng, shape, sigma, scale=25):
    """Ruimtelijk samenhangende ruis, via bilineair opgeschaalde grove ruis.

    Per-pixel onafhankelijke ruis is voor dit doel onbruikbaar: de significante
    pixels worden dan peper-en-zout in plaats van vlekken, en juist die vlekken
    zijn wat de viewer in "Waar moet ik kijken?" rangschikt. Echte trends uit
    Sentinel-2 zijn wel ruimtelijk samenhangend, want buurpixels delen hun
    vegetatie, beheer en hydrologie.
    """
    h, w = shape
    ch, cw = max(2, h // scale), max(2, w // scale)
    small = rng.normal(0.0, 1.0, (ch, cw))

    yi = np.linspace(0, ch - 1, h)
    xi = np.linspace(0, cw - 1, w)
    y0 = np.floor(yi).astype(int)
    y1 = np.minimum(y0 + 1, ch - 1)
    x0 = np.floor(xi).astype(int)
    x1 = np.minimum(x0 + 1, cw - 1)
    fy = (yi - y0)[:, None]
    fx = (xi - x0)[None, :]

    top = small[y0][:, x0] * (1 - fx) + small[y0][:, x1] * fx
    bot = small[y1][:, x0] * (1 - fx) + small[y1][:, x1] * fx
    return (top * (1 - fy) + bot * fy) * sigma


def build_demo(px=10.0):
    """Een gesimuleerd trendveld over de Nieuwkoop-omtrek, direct in 3857.

    Geen herprojectie nodig: de data is verzonnen, dus we verzinnen hem meteen
    op het doelraster. Het patroon is bewust ruimtelijk samenhangend (twee
    gaussische kernen plus ruis) zodat de kleurschaal en de significantie-
    filtering iets te laten zien hebben.
    """
    xs, ys = zip(*[lonlat_to_merc(lon, lat) for lon, lat in DEMO_RING])
    # pixelgrootte op de grond -> 3857-eenheden (Mercator rekt op met 1/cos(lat))
    lat0 = sum(lat for _, lat in DEMO_RING) / len(DEMO_RING)
    step = px / math.cos(math.radians(lat0))
    x0, x1 = min(xs) - step * 5, max(xs) + step * 5
    y0, y1 = min(ys) - step * 5, max(ys) + step * 5
    w = int((x1 - x0) / step)
    h = int((y1 - y0) / step)

    gx = x0 + (np.arange(w) + 0.5) * step
    gy = y1 - (np.arange(h) + 0.5) * step
    X, Y = np.meshgrid(gx, gy)

    inside = point_in_ring(X, Y, [lonlat_to_merc(lon, lat) for lon, lat in DEMO_RING])

    rng = np.random.default_rng(20260917)

    def blob(cx_ll, cy_ll, sigma_m, amp):
        cx, cy = lonlat_to_merc(cx_ll, cy_ll)
        s = sigma_m / math.cos(math.radians(lat0))
        return amp * np.exp(-((X - cx) ** 2 + (Y - cy) ** 2) / (2 * s ** 2))

    slope = (blob(4.815, 52.155, 900, -0.016)   # verlanding: daling
             + blob(4.865, 52.132, 700, 0.011)  # herstel na beheer: stijging
             + _correlated_noise(rng, (h, w), 0.0030, scale=30))
    # tau loopt mee met de helling maar is begrensd
    tau = np.clip(slope / 0.014, -0.95, 0.95) + _correlated_noise(rng, (h, w), 0.10, scale=30)
    tau = np.clip(tau, -1, 1)
    # q: sterk signaal -> klein; ruis -> uniform hoog
    strength = np.abs(tau)
    q = np.clip(1.05 - strength ** 2.2 + _correlated_noise(rng, (h, w), 0.08, scale=22),
                0.0005, 1.0)
    count = np.full((h, w), 10.0)

    out = {}
    for name, arr in (("slope", slope), ("tau", tau), ("qvalue", q), ("count", count)):
        out[name] = np.where(inside, arr, np.nan)
    return out, [x0, y0, x1, y1], (w, h)


def point_in_ring(X, Y, ring):
    """Vectorieel punt-in-polygoon (even-odd) voor het demo-masker."""
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


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from-grass", action="store_true")
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--index", default="ndvi",
                    help="index waarvoor notebook 11 gedraaid heeft")
    ap.add_argument("--stat", default="median",
                    choices=["median", "max", "min", "range"],
                    help="welke jaarstatistiek; median = niveautrend")
    ap.add_argument("--pixel", type=float, default=10.0,
                    help="pixelgrootte in meter, alleen voor --demo")
    ap.add_argument("--verify", type=int, default=0,
                    help="trek N pixels na met r.what, alleen met --from-grass")
    ap.add_argument("--period", default="2016-01-01:2025-12-31",
                    help="start:eind van de reeks, komt in meta.json terecht "
                         "zodat de viewer de live-reeks op dezelfde periode vraagt")
    ap.add_argument("--out-dir", default="data/fenologie/raster")
    args = ap.parse_args()

    if args.from_grass == args.demo:
        ap.error("kies precies een van --from-grass of --demo")

    if args.from_grass:
        bands, bounds, (w, h) = read_grass_bands(args.index, args.stat, args.verify)
        source = "GRASS: %s_decomp_%s_trend_* (hoofdstuk 11)" % (
            args.index.lower(), args.stat)
    else:
        bands, bounds, (w, h) = build_demo(args.pixel)
        source = "gesimuleerd (demo)"

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    band_meta = {}
    total = 0
    for name, spec in BANDS.items():
        arr = bands[name]
        size = write_value_png(out_dir / ("%s.png" % name), arr, spec["scale"])
        total += size
        finite = arr[np.isfinite(arr)]
        band_meta[name] = {
            "file": "%s.png" % name,
            "scale": spec["scale"],
            "label": spec["label"],
            "unit": spec["unit"],
            "min": None if not finite.size else round(float(finite.min()), 6),
            "max": None if not finite.size else round(float(finite.max()), 6),
        }
        print("  %-7s %5d x %-5d  %6.1f kB" % (name, w, h, size / 1e3),
              file=sys.stderr)

    x0, y0, x1, y1 = bounds
    # MapLibre image-source wil de hoeken linksboven, rechtsboven, rechtsonder,
    # linksonder -- in lon/lat, terwijl het beeld zelf in 3857 staat.
    corners = [merc_to_lonlat(x0, y1), merc_to_lonlat(x1, y1),
               merc_to_lonlat(x1, y0), merc_to_lonlat(x0, y0)]

    valid = np.isfinite(bands["slope"])
    # Tel op de GEKWANTISEERDE q, niet op de ruwe float: de viewer leest de
    # Int16 uit het PNG terug en zou anders net een andere telling geven voor
    # pixels die vlak tegen de drempel aan liggen.
    qscale = BANDS["qvalue"]["scale"]
    q = np.round(bands["qvalue"] / qscale) * qscale
    n_sig = int(np.sum(np.isfinite(q) & (q < 0.05)))

    meta = {
        "source": source,
        "demo": bool(args.demo),
        "index": args.index.upper(),
        "stat": args.stat,
        "crs": "EPSG:3857",
        "width": w,
        "height": h,
        "bounds_3857": [round(v, 2) for v in bounds],
        "corners": [[round(lon, 7), round(lat, 7)] for lon, lat in corners],
        "nodata": NODATA_I16,
        "bands": band_meta,
        "pixels_valid": int(valid.sum()),
        "pixels_significant": n_sig,
        "fdr_alpha": 0.05,
        "period": args.period.split(":"),
        "method": (
            "Per pixel Theil-Sen + Mann-Kendall op de jaarstatistiek '%s' van de "
            "HANTS-jaarcurven, q via Benjamini-Hochberg over alle pixels "
            "(hoofdstuk 11). Dit script rekent niets uit, het exporteert alleen."
            % args.stat),
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")

    print("\n%s: %d x %d, %d geldige pixels, %d significant (q < 0,05), %.1f kB totaal"
          % (out_dir, w, h, valid.sum(), n_sig, total / 1e3), file=sys.stderr)


if __name__ == "__main__":
    main()
