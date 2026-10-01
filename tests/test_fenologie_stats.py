"""Tests op de statistische kern van de fenologie-pipeline.

Draaien:  python3 -m pytest tests/

Elk van deze functies is ooit één keer met de hand geverifieerd; deze tests
houden die verificatie vast, zodat een refactor (of een weggevallen
cos²-correctie) niet onopgemerkt de uitkomst verandert.
"""
import math
import sys
from pathlib import Path

import numpy as np
import pytest
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from build_fenologie_openeo import detection_floor, fdr_pvalue, theilsen_mk  # noqa: E402
from fenologie_gebieden import lonlat_to_merc, oppervlak_ha, punt_in_gebied  # noqa: E402


# ------------------------------------------------------------ theilsen_mk
def test_theilsen_mk_gelijk_aan_scipy():
    """Helling en tau-b exact gelijk aan scipy (zonder gelijke waarden)."""
    rng = np.random.default_rng(42)
    t = np.arange(10, dtype="float64")
    cube = (0.01 * t[:, None, None]
            + rng.normal(0, 0.02, size=(10, 4, 5)))
    res = theilsen_mk(cube)
    for i in range(4):
        for j in range(5):
            y = cube[:, i, j]
            assert res["slope"][i, j] == pytest.approx(stats.theilslopes(y, t)[0], abs=1e-12)
            assert res["tau"][i, j] == pytest.approx(stats.kendalltau(t, y)[0], abs=1e-12)


def test_theilsen_mk_pvalue_normaalbenadering():
    """p wijkt van scipy's exacte toets af (normaalbenadering), maar max 0,010."""
    rng = np.random.default_rng(7)
    t = np.arange(10, dtype="float64")
    cube = rng.normal(0, 1, size=(10, 6, 6)) + 0.15 * t[:, None, None]
    res = theilsen_mk(cube)
    for i in range(6):
        for j in range(6):
            p_exact = stats.kendalltau(t, cube[:, i, j])[1]
            assert abs(res["pvalue"][i, j] - p_exact) <= 0.010


def test_theilsen_mk_te_weinig_jaren_wordt_nan():
    cube = np.full((10, 1, 2), np.nan)
    cube[:, 0, 0] = np.arange(10)          # 10 geldige jaren
    cube[:4, 0, 1] = np.arange(4)          # 4 geldige jaren, onder MIN_OBS
    res = theilsen_mk(cube, min_obs=5)
    assert np.isfinite(res["slope"][0, 0])
    for k in ("slope", "tau", "pvalue", "count"):
        assert np.isnan(res[k][0, 1])


# ------------------------------------------------------------- fdr_pvalue
def test_fdr_pvalue_gelijk_aan_scipy_bh():
    rng = np.random.default_rng(1)
    p = rng.uniform(0, 1, size=(20, 30)) ** 3
    q = fdr_pvalue(p)
    verwacht = stats.false_discovery_control(p.ravel(), method="bh").reshape(p.shape)
    np.testing.assert_allclose(q, verwacht, rtol=1e-12)


def test_fdr_pvalue_laat_nan_staan():
    p = np.array([[0.01, np.nan], [0.04, 0.5]])
    q = fdr_pvalue(p)
    assert np.isnan(q[0, 1])
    verwacht = stats.false_discovery_control([0.01, 0.04, 0.5], method="bh")
    np.testing.assert_allclose(q[np.isfinite(q)], verwacht, rtol=1e-12)


# -------------------------------------------------------- detection_floor
def test_detection_floor_p_bodem_bij_tien_jaar():
    p_min, _, _ = detection_floor(n_tests=1, n_years=10)
    assert p_min == pytest.approx(8.3e-5, rel=0.02)


def test_detection_floor_is_resolutie_onafhankelijk():
    """Zelfde gebied, 4x grovere pixels: zelfde minimale oppervlakte."""
    gebied_m2 = 20e6
    _, _, fijn = detection_floor(gebied_m2 / 100, 10, pixel_m2=100)
    _, _, grof = detection_floor(gebied_m2 / 400, 10, pixel_m2=400)
    assert fijn == pytest.approx(grof, rel=1e-12)


def test_detection_floor_langere_reeks_helpt():
    _, _, tien = detection_floor(550_000, 10)
    _, _, twaalf = detection_floor(550_000, 12)
    assert twaalf < tien / 5


# -------------------------------------------------- gebied: masker en oppervlak
def _vierkant(lon0, lat0, d_lon, d_lat):
    return [lonlat_to_merc(lon0, lat0), lonlat_to_merc(lon0 + d_lon, lat0),
            lonlat_to_merc(lon0 + d_lon, lat0 + d_lat), lonlat_to_merc(lon0, lat0 + d_lat)]


def test_punt_in_gebied_respecteert_gaten():
    buiten = [(0, 0), (10, 0), (10, 10), (0, 10)]
    gat = [(4, 4), (6, 4), (6, 6), (4, 6)]
    X = np.array([1.0, 5.0, 11.0])
    Y = np.array([1.0, 5.0, 5.0])
    m = punt_in_gebied(X, Y, [[buiten, gat]])
    assert m.tolist() == [True, False, False]   # binnen, in het gat, erbuiten


def test_punt_in_gebied_multipolygoon():
    a = [(0, 0), (1, 0), (1, 1), (0, 1)]
    b = [(5, 5), (6, 5), (6, 6), (5, 6)]
    m = punt_in_gebied(np.array([0.5, 5.5, 3.0]), np.array([0.5, 5.5, 3.0]), [[a], [b]])
    assert m.tolist() == [True, True, False]


def test_oppervlak_ha_met_cos2_correctie():
    """Een vierkant van ~1 km bij 52°N moet ~100 ha zijn, niet ~265 ha."""
    lat = 52.1
    d_lat = 1000 / 111_320
    d_lon = 1000 / (111_320 * math.cos(math.radians(lat)))
    ha = oppervlak_ha([[_vierkant(4.8, lat, d_lon, d_lat)]])
    assert ha == pytest.approx(100, rel=0.01)


def test_oppervlak_ha_trekt_gaten_af():
    lat = 52.1
    d = 1000 / 111_320
    k = math.cos(math.radians(lat))
    buiten = _vierkant(4.8, lat, d / k, d)
    gat = _vierkant(4.8 + 0.25 * d / k, lat + 0.25 * d, 0.5 * d / k, 0.5 * d)
    ha = oppervlak_ha([[buiten, gat]])
    assert ha == pytest.approx(75, rel=0.01)
