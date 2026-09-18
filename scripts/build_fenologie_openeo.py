#!/usr/bin/env python3
"""
Bouw de fenologie-trendkaart uit echte Sentinel-2 data, zonder GRASS.

De GRASS-route (scripts/export_fenologie_raster.py) gaat uit van de STRDS'en
van de HAS/PZH-pipeline. Zonder toegang daartoe is dit het alternatief: laat
Copernicus de zware temporele reductie doen en reken de trend hier uit.

  openEO (CDSE)                         hier, lokaal
  ------------------------------        ----------------------------------
  laden, wolken maskeren, NDVI          Theil-Sen + Mann-Kendall per pixel
  mediaan per jaar                      Benjamini-Hochberg over alle pixels
  -> 10 rasters, ~26 MB                 -> dezelfde PNG's als de GRASS-route

De trendberekening is een portering van hoofdstuk 11 van *Monitoring
habitatveranderingen Nieuwkoop* (HAS green academy + PZH, 2026), regel voor
regel uit `theilsen_mk()` en `fdr_pvalue()` van notebook 11. Bewust een
kopie en geen eigen variant: de uitkomst hoort gelijk te zijn aan wat hun
pipeline geeft.

AFWIJKING VAN HET RAPPORT, lees dit voordat je de kaart gebruikt
----------------------------------------------------------------
Notebook 11 vat per jaar de *met HANTS gladgestreken* jaarcurve samen
(notebook 9). openEO kent geen HANTS, dus dit script neemt de mediaan van de
waarnemingen in dat jaar.

Voor `median` -- de niveautrend, en wat de viewer standaard toont -- is dat
verdedigbaar: de mediaan van een gladgestreken curve en die van de
waarnemingen zijn allebei robuuste centrummaten en liggen dicht bij elkaar.
Voor max, min en bereik geldt dat NIET: de extremen van een gladgestreken
curve zijn iets heel anders dan de extremen van ruwe waarnemingen. Daarom
berekent dit script alleen de niveautrend. Wil je de piek-, dal- of
bereiktrend, dan heb je de volledige 73-staps jaarcurve nodig en daarmee de
GRASS-route.

Gebruik
-------
  export CDSE_CLIENT_ID='...'
  export CDSE_CLIENT_SECRET='...'
  python3 scripts/build_fenologie_openeo.py

  --dry-run     print de process graph en stop; heeft geen credentials nodig
  --job-id ID   sla het indienen over en haal de resultaten van een eerdere
                job op (handig als de download afbrak)
  --keep-tif    gooi de gedownloade GeoTIFF's niet weg

De credentials komen uit de omgeving en worden nergens weggeschreven.
Aanmaken: Sentinel Hub Dashboard -> User Settings -> OAuth clients -> Create.
"""

import argparse
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_fenologie_raster import (  # noqa: E402
    BANDS, DEMO_RING, NODATA_I16, lonlat_to_merc, merc_to_lonlat,
    point_in_ring, write_value_png,
)

TOKEN_URL = ("https://identity.dataspace.copernicus.eu/auth/realms/CDSE"
             "/protocol/openid-connect/token")
OPENEO_URL = "https://openeo.dataspace.copernicus.eu/openeo/1.2"

# openEO verlangt twee dingen die niet vanzelf goed gaan:
#  1. het token moet met scope=openid aangevraagd zijn -- zonder die scope
#     geeft CDSE wel een geldig token, maar antwoordt openEO met 403
#     "TokenInvalid", wat naar een verlopen sleutel lijkt en het niet is;
#  2. de Authorization-header is "Bearer oidc/<provider>/<token>", niet een
#     kaal "Bearer <token>". De provider-id staat in /credentials/oidc.
OIDC_PROVIDER = "CDSE"
OIDC_SCOPE = "openid"

# Zelfde maskering als api/ndvi-series.js: 3 schaduw, 8/9 wolk, 10 cirrus,
# 11 sneeuw/ijs. Gelijk houden, anders wijkt de kaart af van wat je krijgt
# als je in de viewer op een pixel klikt.
SCL_DROP = [3, 8, 9, 10, 11]
INDICES = {
    "ndvi": {"bands": ["B04", "B08"], "red": 0, "nir": 1},
    "ndmi": {"bands": ["B08", "B11"], "red": 1, "nir": 0},
}

MIN_OBS = 5      # minimaal aantal geldige jaren per pixel (notebook 11)
FDR_ALPHA = 0.05


# ---------------------------------------------------------------- http
# Uitgaande verbindingen zijn hier niet altijd betrouwbaar (losse timeouts,
# vermoedelijk een proxy ertussen). Een enkele hapering mag een job van een
# half uur niet omgooien, dus elke aanroep krijgt een paar pogingen.
RETRIES = 4


def _with_retry(fn, what):
    delay = 3
    for attempt in range(1, RETRIES + 1):
        try:
            return fn()
        except urllib.error.HTTPError:
            raise                      # echte foutcode: niet opnieuw proberen
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if attempt == RETRIES:
                raise
            print("  netwerkhapering bij %s (%s), poging %d/%d over %ds"
                  % (what, type(e).__name__, attempt, RETRIES, delay),
                  file=sys.stderr)
            time.sleep(delay)
            delay *= 2


def _post(url, data, headers=None, timeout=120):
    body = json.dumps(data).encode() if not isinstance(data, bytes) else data
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    def go():
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}, dict(r.headers)
    return _with_retry(go, "POST " + url.rsplit("/", 1)[-1])


def _get(url, headers=None, timeout=120):
    req = urllib.request.Request(url)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    def go():
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    return _with_retry(go, "GET " + url.rsplit("/", 1)[-1])


def _load_env_file(path=None):
    """Lees CDSE_* uit .env.local als ze niet al in de omgeving staan.

    Bedoeld zodat de sleutels in een gitignored bestand kunnen staan in plaats
    van in je shell-geschiedenis of in een commando dat iemand over je schouder
    meeleest. Formaat is simpel: KEY=waarde per regel, # is commentaar,
    aanhalingstekens eromheen mogen.
    """
    if path is None:
        path = Path(__file__).resolve().parent.parent / ".env.local"
    if not Path(path).exists():
        return
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key.startswith("CDSE_") and key not in os.environ:
            os.environ[key] = val


def get_token():
    _load_env_file()
    cid = os.environ.get("CDSE_CLIENT_ID")
    secret = os.environ.get("CDSE_CLIENT_SECRET")
    if not cid or not secret:
        raise SystemExit(
            "CDSE_CLIENT_ID en CDSE_CLIENT_SECRET ontbreken.\n\n"
            "Aanmaken: https://shapps.dataspace.copernicus.eu/dashboard\n"
            "  -> User Settings -> OAuth clients -> Create\n"
            "De secret is daarna niet meer op te halen, dus bewaar hem meteen.\n\n"
            "Zet ze daarna in .env.local in de repo-root (staat in .gitignore):\n"
            "  CDSE_CLIENT_ID=...\n"
            "  CDSE_CLIENT_SECRET=...\n\n"
            "Of als omgevingsvariabele:\n"
            "  export CDSE_CLIENT_ID='...'\n"
            "  export CDSE_CLIENT_SECRET='...'")
    form = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": cid,
        "client_secret": secret,
        "scope": OIDC_SCOPE,
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=form, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    def go():
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())["access_token"]
    try:
        return _with_retry(go, "token")
    except urllib.error.HTTPError as e:
        raise SystemExit("CDSE weigerde de credentials (HTTP %s). Controleer of "
                         "de OAuth-client nog geldig is." % e.code)


def job_id_from(body, headers):
    """openEO geeft bij POST /jobs een 201 terug zonder id in de body.

    Het id staat in de OpenEO-Identifier-header, of anders achteraan de
    Location-header. Headernamen zijn hoofdletterongevoelig.
    """
    if isinstance(body, dict) and body.get("id"):
        return body["id"]
    low = {k.lower(): v for k, v in (headers or {}).items()}
    if low.get("openeo-identifier"):
        return low["openeo-identifier"].strip()
    loc = low.get("location")
    if loc:
        return loc.rstrip("/").rsplit("/", 1)[-1]
    return None


def auth_header(token):
    """openEO-conventie voor een OIDC-token: Bearer oidc/<provider>/<token>."""
    return {"Authorization": "Bearer %s/%s/%s" % ("oidc", OIDC_PROVIDER, token)}


# ---------------------------------------------------------------- graph
def merc_resolution(ground_m, lat_deg):
    """Reken grondmeters om naar EPSG:3857-eenheden.

    Web Mercator rekt met 1/cos(lat) op, dus op 52 graden is een "meter"
    in 3857 maar 0,61 m op de grond. Vraag je openEO om resolution=10, dan
    krijg je pixels van 6,1 m: 2,6x zoveel pixels als bedoeld, een bestand
    dat 2,6x te groot is, en een viewer die "Pixel -- 6 m" meldt.

    Dit verandert de detectiegrens niet: die is in OPPERVLAKTE
    resolutie-onafhankelijk, zie detection_floor().
    """
    return ground_m / math.cos(math.radians(lat_deg))


def build_graph(bbox, years, index, resolution):
    """Process graph: laden, maskeren, index, mediaan per jaar, als GeoTIFF.

    De maskering is identiek aan api/ndvi-series.js en gebruikt alleen
    standaard-openEO-processen (geen backend-specifieke `mask_scl_dilation`),
    zodat dit ook elders draait.
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
    # CDSE's backend laat een null-argument vallen en klaagt dan dat `accept`
    # ontbreekt: {"value": cloudy, "accept": null, "reject": nd} geeft
    # "Process [if] expects a accept argument". Dus omgedraaid -- toets op
    # NIET-bewolkt, geef de index als `accept` en laat `reject` weg, dat is
    # vanzelf null en daarmee nodata.
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
        # Meteen naar 3857 op de doelresolutie: dan is het raster dat
        # terugkomt precies het raster dat de viewer neerlegt, en hoeft er
        # later niets meer geprojecteerd te worden.
        "reproj": {
            "process_id": "resample_spatial",
            "arguments": {"data": {"from_node": "index"}, "projection": 3857,
                          "resolution": resolution, "method": "near"}},
        "yearly": {
            "process_id": "aggregate_temporal_period",
            "arguments": {"data": {"from_node": "reproj"}, "period": "year",
                          "reducer": {"process_graph": {
                              "m": {"process_id": "median",
                                    "arguments": {"data": {"from_parameter": "data"},
                                                  "ignore_nodata": True},
                                    "result": True}}}}},
        "save": {
            "process_id": "save_result",
            "arguments": {"data": {"from_node": "yearly"}, "format": "GTiff"},
            "result": True},
    }


# ---------------------------------------------------------------- job
def run_job(graph, token, poll=20):
    hdr = auth_header(token)
    job, headers = _post(OPENEO_URL + "/jobs",
                         {"process": {"process_graph": graph},
                          "title": "fenologie Nieuwkoop jaarmedianen"},
                         hdr)
    job_id = job_id_from(job, headers)
    if not job_id:
        raise SystemExit("openEO gaf geen job-id terug: body=%s headers=%s"
                         % (job, list(headers or {})))
    print("job aangemaakt: %s" % job_id, file=sys.stderr)

    _post(OPENEO_URL + "/jobs/%s/results" % job_id, {}, hdr)
    print("job gestart, dit duurt doorgaans 10-40 minuten", file=sys.stderr)

    last = None
    while True:
        time.sleep(poll)
        info = _get(OPENEO_URL + "/jobs/%s" % job_id, hdr)
        status = info.get("status")
        if status != last:
            print("  status: %s%s" % (status,
                  ("  %s%%" % info["progress"]) if info.get("progress") else ""),
                  file=sys.stderr)
            last = status
        if status == "finished":
            return job_id
        if status in ("error", "canceled"):
            raise SystemExit("job %s: %s" % (status, info.get("message", "")))


def download_results(job_id, token, out_dir, keep=False):
    hdr = auth_header(token)
    res = _get(OPENEO_URL + "/jobs/%s/results" % job_id, hdr)
    assets = res.get("assets", {})
    tifs = [(n, a["href"]) for n, a in assets.items()
            if n.lower().endswith((".tif", ".tiff"))]
    if not tifs:
        raise SystemExit("geen GeoTIFF in de resultaten: %s" % list(assets))

    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for name, href in sorted(tifs):
        dest = out_dir / name
        print("  download %s" % name, file=sys.stderr)

        def fetch(href=href, dest=dest):
            # De asset-URL's zijn voorondertekende S3-links. Stuur je daar de
            # openEO-Bearer bij, dan weigert S3 met
            # "InternalError: Invalid authorization header" (HTTP 500) -- wat
            # eruitziet als een kapotte server en het niet is.
            req = urllib.request.Request(href)
            with urllib.request.urlopen(req, timeout=600) as r, open(dest, "wb") as fh:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    fh.write(chunk)
            return dest

        paths.append(_with_retry(fetch, "download " + name))
    return paths


# ---------------------------------------------------------------- lezen
def read_stack(paths):
    """Lees de jaarrasters als (jaren, rijen, kolommen) met NaN voor nodata.

    Drie lezers geprobeerd, in volgorde van hoeveel ze weten: rasterio en
    GDAL geven ook de geotransform, Pillow alleen de pixels. Zonder een van
    de drie kun je niet verder -- dat is geen webafhankelijkheid, dit script
    draait bij jou op de machine.
    """
    reader = None
    try:
        import rasterio  # noqa: F401
        reader = "rasterio"
    except ImportError:
        try:
            from osgeo import gdal  # noqa: F401
            reader = "gdal"
        except ImportError:
            try:
                from PIL import Image  # noqa: F401
                reader = "pil"
            except ImportError:
                pass
    if reader is None:
        raise SystemExit(
            "Geen GeoTIFF-lezer gevonden. Installeer er een:\n"
            "  pip install rasterio      (aanbevolen, geeft ook de geotransform)\n"
            "  pip install pillow        (werkt, maar zonder georeferentie)")

    layers, transform = [], None
    for p in paths:
        if reader == "rasterio":
            import rasterio
            with rasterio.open(p) as ds:
                a = ds.read(1).astype("float64")
                nod = ds.nodata
                if transform is None:
                    transform = (ds.transform.c, ds.transform.a, ds.transform.f,
                                 ds.transform.e)
        elif reader == "gdal":
            from osgeo import gdal
            ds = gdal.Open(str(p))
            band = ds.GetRasterBand(1)
            a = band.ReadAsArray().astype("float64")
            nod = band.GetNoDataValue()
            if transform is None:
                gt = ds.GetGeoTransform()
                transform = (gt[0], gt[1], gt[3], gt[5])
            ds = None
        else:
            from PIL import Image
            a = np.array(Image.open(p)).astype("float64")
            nod = None
        if nod is not None:
            a = np.where(a == nod, np.nan, a)
        layers.append(a)

    shapes = {l.shape for l in layers}
    if len(shapes) != 1:
        raise SystemExit("jaarrasters hebben verschillende afmetingen: %s" % shapes)
    return np.stack(layers, axis=0), transform, reader


# ---------------------------------------------------------------- statistiek
def theilsen_mk(cube, min_obs=MIN_OBS):
    """Per-pixel Theil-Sen-helling en Mann-Kendall-toets.

    Portering van `theilsen_mk()` uit notebook 11. Volledig gevectoriseerd
    over het pixelvlak; de enige lus loopt over de handvol tijdstappen.
    """
    import warnings
    from scipy.stats import norm

    n = cube.shape[0]
    i_idx, j_idx = np.triu_indices(n, k=1)
    gap = (j_idx - i_idx).astype("float64")

    diffs = cube[j_idx] - cube[i_idx]
    finite = np.isfinite(cube)
    n_valid = finite.sum(axis=0)
    nf = n_valid.astype("float64")

    with np.errstate(invalid="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        slope = np.nanmedian(diffs / gap[:, None, None], axis=0)

    S = np.nansum(np.sign(diffs), axis=0)

    # Aantal gelijke waarden per tijdstap, zodat de tie-correctie geen
    # pixel-lus nodig heeft.
    mult = np.zeros(cube.shape, dtype="float64")
    for k in range(n):
        mult[k] = ((cube == cube[k][None]) & finite).sum(axis=0)
    mult = np.where(finite, mult, np.nan)

    tie_term = np.nansum((mult - 1.0) * (2.0 * mult + 5.0), axis=0)
    var = (nf * (nf - 1.0) * (2.0 * nf + 5.0) - tie_term) / 18.0

    n0 = nf * (nf - 1.0) / 2.0
    Ty = np.nansum(mult - 1.0, axis=0) / 2.0
    with np.errstate(invalid="ignore", divide="ignore"):
        tau = S / np.sqrt(n0 * (n0 - Ty))

    sd = np.sqrt(var)
    with np.errstate(invalid="ignore", divide="ignore"):
        z = np.where(S > 0, (S - 1) / sd, np.where(S < 0, (S + 1) / sd, 0.0))
    pvalue = 2.0 * norm.sf(np.abs(z))

    enough = n_valid >= min_obs
    nan = np.nan
    return {
        "slope": np.where(enough, slope, nan),
        "tau": np.where(enough, tau, nan),
        "pvalue": np.where(enough, pvalue, nan),
        "count": np.where(enough, nf, nan),
    }


def fdr_pvalue(pvalue):
    """Benjamini-Hochberg over de eindige pixels.

    Notebook 11 gebruikt hiervoor statsmodels' `multipletests(method="fdr_bh")`.
    Dit is diezelfde step-up met monotoniciteitscorrectie, in numpy, zodat dit
    script geen statsmodels nodig heeft.
    """
    out = np.full(pvalue.shape, np.nan)
    flat = pvalue.ravel()
    finite = np.isfinite(flat)
    p = flat[finite]
    if p.size == 0:
        return out
    order = np.argsort(p)
    ranked = p[order]
    n = p.size
    q = ranked * n / np.arange(1, n + 1)
    q = np.minimum.accumulate(q[::-1])[::-1]   # monotoon niet-dalend
    adj = np.empty(n)
    adj[order] = np.minimum(q, 1.0)
    out.ravel()[finite] = adj
    return out


def detection_floor(n_tests, n_years, alpha=FDR_ALPHA, pixel_m2=100.0):
    """Hoe klein mag een vlek zijn en toch de FDR-drempel halen?

    Mann-Kendall op n jaarwaarden heeft een HARDE ondergrens voor de p-waarde:
    een reeks kan niet monotoner dan perfect. Bij n = 10 is die grens 8,3e-5.
    Benjamini-Hochberg verwerpt de k-de kleinste p als p <= k/N * alpha, dus
    zitten de sterkste pixels allemaal op die ondergrens, dan moeten er
    minstens  k = p_min * N / alpha  van zijn voordat er ook maar een enkele
    significant heet.

    Omdat N = gebied / pixeloppervlak, valt het pixeloppervlak tegen elkaar
    weg: de minimale OPPERVLAKTE is onafhankelijk van de resolutie. Fijner
    bemonsteren helpt dus niet, een langere reeks wel -- en hard ook, want
    p_min daalt ruwweg een factor 10 per twee extra jaren.

    Voor Nieuwkoop (55 km2) is dat bij tien jaar zo'n 9 ha. Een sterk dalend
    perceel van 2 ha kan dus nooit significant heten, hoe overtuigend de reeks
    ook is. Dat is geen fout in de data of de code, het is wat deze toets op
    deze schaal kan.
    """
    probe = theilsen_mk(np.arange(n_years, dtype="float64").reshape(n_years, 1, 1),
                        min_obs=3)
    p_min = float(probe["pvalue"][0, 0])
    k_min = p_min * n_tests / alpha
    return p_min, k_min, k_min * pixel_m2


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--index", default="ndvi", choices=sorted(INDICES))
    ap.add_argument("--start-year", type=int, default=2016)
    ap.add_argument("--end-year", type=int, default=2025)
    ap.add_argument("--resolution", type=float, default=10.0,
                    help="doelresolutie in meter OP DE GROND (default 10, de "
                         "native Sentinel-2-resolutie); intern omgerekend naar "
                         "EPSG:3857-eenheden, die op 52 graden 1,6x kleiner zijn")
    ap.add_argument("--dry-run", action="store_true",
                    help="print de process graph en stop")
    ap.add_argument("--submit-only", action="store_true",
                    help="dien de job in, print het id en stop (niet pollen)")
    ap.add_argument("--job-id", default=None,
                    help="sla indienen over, haal een eerdere job op")
    ap.add_argument("--keep-tif", action="store_true")
    ap.add_argument("--tif-dir", default="data/fenologie/_openeo")
    ap.add_argument("--out-dir", default="data/fenologie/raster")
    args = ap.parse_args()

    years = list(range(args.start_year, args.end_year + 1))
    ring = [lonlat_to_merc(lon, lat) for lon, lat in DEMO_RING]
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    sw = merc_to_lonlat(min(xs), min(ys))
    ne = merc_to_lonlat(max(xs), max(ys))
    bbox = [round(sw[0], 6), round(sw[1], 6), round(ne[0], 6), round(ne[1], 6)]

    lat_mid = (bbox[1] + bbox[3]) / 2.0
    res_merc = merc_resolution(args.resolution, lat_mid)
    graph = build_graph(bbox, years, args.index, res_merc)

    if args.dry_run:
        print(json.dumps({"process_graph": graph}, indent=1))
        print("\nbbox %s, jaren %d-%d" % (bbox, years[0], years[-1]),
              file=sys.stderr)
        print("resolutie %g m op de grond -> %.2f in EPSG:3857 (lat %.2f)"
              % (args.resolution, res_merc, lat_mid), file=sys.stderr)
        return

    token = get_token()
    tif_dir = Path(args.tif_dir)
    if args.submit_only:
        hdr = auth_header(token)
        job, headers = _post(OPENEO_URL + "/jobs",
                             {"process": {"process_graph": graph},
                              "title": "fenologie Nieuwkoop jaarmedianen"}, hdr)
        jid = job_id_from(job, headers)
        if not jid:
            raise SystemExit("openEO gaf geen job-id terug: body=%s headers=%s"
                             % (job, list(headers or {})))
        _post(OPENEO_URL + "/jobs/%s/results" % jid, {}, hdr)
        print(jid)
        print("ingediend en gestart. Volgen met:", file=sys.stderr)
        print("  python3 scripts/build_fenologie_openeo.py --job-id %s"
              % jid, file=sys.stderr)
        return
    job_id = args.job_id or run_job(graph, token)
    paths = download_results(job_id, token, tif_dir, keep=args.keep_tif)

    cube, transform, reader = read_stack(paths)
    print("gelezen met %s: %d jaren, %d x %d pixels"
          % (reader, cube.shape[0], cube.shape[2], cube.shape[1]), file=sys.stderr)
    if cube.shape[0] != len(years):
        print("LET OP: %d jaarrasters terug, %d jaren gevraagd. Jaren zonder "
              "enige wolkvrije waarneming ontbreken; de trend gaat uit van een "
              "aaneengesloten reeks (notebook 11 breekt hier zelfs op af)."
              % (cube.shape[0], len(years)), file=sys.stderr)

    res = theilsen_mk(cube)
    qvalue = fdr_pvalue(res["pvalue"])

    # Buiten de gebiedsomtrek hoort niets te staan, ook niet als de bbox
    # ruimer is dan het gebied zelf.
    if transform is None:
        raise SystemExit(
            "Zonder geotransform kan het raster niet geplaatst worden. "
            "Installeer rasterio (pip install rasterio) en draai opnieuw.")
    x0, dx, y0, dy = transform
    h, w = cube.shape[1], cube.shape[2]
    gx = x0 + (np.arange(w) + 0.5) * dx
    gy = y0 + (np.arange(h) + 0.5) * dy
    X, Y = np.meshgrid(gx, gy)
    inside = point_in_ring(X, Y, ring)
    for k in ("slope", "tau", "count"):
        res[k] = np.where(inside, res[k], np.nan)
    qvalue = np.where(inside, qvalue, np.nan)

    bands = {"slope": res["slope"], "tau": res["tau"],
             "qvalue": qvalue, "count": res["count"]}

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    band_meta = {}
    for name, spec in BANDS.items():
        arr = bands[name]
        write_value_png(out_dir / ("%s.png" % name), arr, spec["scale"])
        finite = arr[np.isfinite(arr)]
        band_meta[name] = {
            "file": "%s.png" % name, "scale": spec["scale"],
            "label": spec["label"], "unit": spec["unit"],
            "min": None if not finite.size else round(float(finite.min()), 6),
            "max": None if not finite.size else round(float(finite.max()), 6),
        }

    bounds = [x0, y0 + dy * h, x0 + dx * w, y0]
    corners = [merc_to_lonlat(bounds[0], bounds[3]), merc_to_lonlat(bounds[2], bounds[3]),
               merc_to_lonlat(bounds[2], bounds[1]), merc_to_lonlat(bounds[0], bounds[1])]

    qs = BANDS["qvalue"]["scale"]
    qq = np.round(qvalue / qs) * qs
    n_sig = int(np.sum(np.isfinite(qq) & (qq < FDR_ALPHA)))

    meta = {
        "source": "openEO / Copernicus Data Space, jaarmedianen %d-%d"
                  % (years[0], years[-1]),
        "demo": False,
        "index": args.index.upper(),
        "stat": "median",
        "crs": "EPSG:3857",
        "width": w, "height": h,
        "bounds_3857": [round(v, 2) for v in bounds],
        "corners": [[round(lo, 7), round(la, 7)] for lo, la in corners],
        "nodata": NODATA_I16,
        "bands": band_meta,
        "pixels_valid": int(np.isfinite(res["slope"]).sum()),
        "pixels_significant": n_sig,
        "fdr_alpha": FDR_ALPHA,
        "period": ["%d-01-01" % years[0], "%d-12-31" % years[-1]],
        "method": (
            "Sentinel-2 L2A via openEO, SCL 3/8/9/10/11 gemaskeerd, mediaan per "
            "jaar. Per pixel Theil-Sen + Mann-Kendall over de jaarmedianen, q via "
            "Benjamini-Hochberg over alle pixels (portering van hoofdstuk 11). "
            "LET OP: het rapport gebruikt de HANTS-gladgestreken jaarcurve als "
            "invoer, dit de ruwe jaarmediaan -- verdedigbaar voor de niveautrend, "
            "niet voor piek, dal of bereik."),
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")

    if not args.keep_tif:
        for p in paths:
            p.unlink(missing_ok=True)
        try:
            tif_dir.rmdir()
        except OSError:
            pass

    print("\n%s: %d x %d, %d geldige pixels, %d significant (q < %g)"
          % (out_dir, w, h, meta["pixels_valid"], n_sig, FDR_ALPHA), file=sys.stderr)

    # Context bij dat aantal, vooral als het nul is.
    px_m2 = abs(dx * dy) * math.cos(math.radians(
        (meta["corners"][0][1] + meta["corners"][2][1]) / 2)) ** 2
    p_min, k_min, a_min = detection_floor(meta["pixels_valid"], cube.shape[0],
                                          pixel_m2=px_m2)
    print("\nDetectiegrens bij %d jaar en %d getoetste pixels:"
          % (cube.shape[0], meta["pixels_valid"]), file=sys.stderr)
    print("  kleinst mogelijke Mann-Kendall p : %.2e" % p_min, file=sys.stderr)
    print("  minimaal aaneengesloten          : %.0f pixels = %.1f ha"
          % (k_min, a_min / 1e4), file=sys.stderr)
    print("  Een dalend gebied dat kleiner is dan dat kan nooit significant heten,",
          file=sys.stderr)
    print("  hoe overtuigend de reeks ook is. Een langere reeks helpt hard "
          "(p_min daalt", file=sys.stderr)
    print("  ruwweg 10x per twee extra jaren); fijner bemonsteren helpt niet.",
          file=sys.stderr)


if __name__ == "__main__":
    main()
