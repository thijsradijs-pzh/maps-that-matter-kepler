"""Toets de catalogus van gebiedsviewer tegen de live ArcGIS-services.

    python3 scripts/check_gebiedsviewer_catalog.py

`gebiedsviewer/config.js` legt per service laag-id's en labels vast. De
provincie hernummert lagen af en toe, en dan toont de viewer stil een andere
laag onder het oude label -- op 2026-10-01 bleek "PM10 2025" bijvoorbeeld
"PM10 - 2015 - 2" te zijn. Er komt geen foutmelding van: de WMS levert gewoon
een plaatje. Dit script maakt die afwijkingen zichtbaar.

Drie soorten meldingen:
  WEG       service geeft een fout of 404
  ONTBREEKT laag-id bestaat niet meer in de service
  ANDERS    label en servicenaam delen weinig woorden -- mogelijk een andere
            laag; controleer met de hand (een ingekort label is prima)

Exitcode 1 bij WEG of ONTBREEKT, zodat het in een check kan.
"""
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CONFIG = Path(__file__).resolve().parent.parent / "gebiedsviewer" / "config.js"


def lees_catalogus():
    src = CONFIG.read_text()
    services = []
    for m in re.finditer(r"wmsUrl:\s*'([^']+)'(.*?)\]\s*\n\s*\}", src, re.S):
        lagen = re.findall(
            r"\{\s*id:\s*'([^']+)',\s*label:\s*(?:'((?:[^'\\]|\\.)*)'|\"([^\"]*)\")",
            m.group(2))
        services.append((m.group(1), [(i, a or b) for i, a, b in lagen]))
    return services


def woorden(s):
    return {w for w in re.findall(r"[a-z0-9.]+", s.lower()) if len(w) > 1}


def lijkt_op(label, naam):
    """Ingekorte labels zijn prima; jaartallen en getallen moeten wél kloppen."""
    a, b = woorden(label), woorden(naam)
    getallen_a = {w for w in a if re.fullmatch(r"\d[\d.]*", w)}
    getallen_b = {w for w in b if re.fullmatch(r"\d[\d.]*", w)}
    if getallen_a and not getallen_a <= getallen_b:
        return False
    return len(a & b) >= max(1, len(a) // 2)


def toets(service):
    url, lagen = service
    basis = url.replace("/WMSServer", "")
    try:
        with urllib.request.urlopen(basis + "?f=json", timeout=30) as r:
            d = json.load(r)
    except Exception as e:  # noqa: BLE001
        return basis, ["WEG       %s" % e]
    if "error" in d:
        return basis, ["WEG       %s" % d["error"].get("code")]
    namen = {str(l["id"]): l["name"] for l in d.get("layers", [])}
    meldingen = []
    for i, label in lagen:
        if i not in namen:
            meldingen.append("ONTBREEKT %-4s %s" % (i, label))
        elif not lijkt_op(label, namen[i]):
            meldingen.append("ANDERS    %-4s %r -> service: %r" % (i, label, namen[i]))
    return basis, meldingen


def main():
    services = lees_catalogus()
    with ThreadPoolExecutor(8) as ex:
        uitkomst = list(ex.map(toets, services))
    fout = False
    for basis, meldingen in uitkomst:
        if meldingen:
            print(basis.split("/services/")[1])
            for m in meldingen:
                print("   ", m)
            fout |= any(m.startswith(("WEG", "ONTBREEKT")) for m in meldingen)
    n = sum(len(l) for _, l in services)
    print("\n%d services, %d lagen getoetst." % (len(services), n))
    return 1 if fout else 0


if __name__ == "__main__":
    sys.exit(main())
