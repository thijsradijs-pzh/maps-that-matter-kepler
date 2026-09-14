# Fenologie Nieuwkoop

Tien jaar Sentinel-2 per H3-hexagon over de Nieuwkoopse Plassen & De Haeck.
Klik een cel en je krijgt de reeks, de eigen seizoensreferentie, de
z-anomalieën, een decompositie en de trend. Buiten de kubus haalt een
serverless functie de reeks live op bij Copernicus.

Methodiek volgt *Monitoring habitatveranderingen Nieuwkoop* (HAS green academy
en Provincie Zuid-Holland, 2026): DOY-klimatologie in stappen van 5 dagen op een
365-daagse kalender, spreiding als 1,4826 × MAD, z-anomalie met een SD-drempel
van 0,02, en Theil-Sen + Mann-Kendall op de jaarmedianen.

## Twee databronnen achter één klik

| | binnen het gebied | daarbuiten |
|---|---|---|
| bron | voorberekende kubus uit GRASS | openEO op Copernicus Data Space |
| snelheid | direct, alles zit in het JSON-bestand | 10–40 s, daarna een dag gecachet |
| dekking | Nieuwkoopse Plassen, H3 res 9 | heel Nederland, per punt |
| nodig | `data/fenologie-nieuwkoop.json` | `CDSE_CLIENT_ID` + `CDSE_CLIENT_SECRET` |

Zonder die twee env-vars valt de live-knop stil weg; de kubus blijft werken.

## De kubus bouwen

De echte variant draait binnen een GRASS-sessie op de mapset waar de STRDS'en
van de pipeline staan:

```bash
grass /pad/naar/GRASSdb/UTM_NLD/NDVI --exec \
  python3 scripts/build_fenologie_cube.py --from-grass \
    --strds S2_ndvi --res 9 \
    --out data/fenologie-nieuwkoop.json
```

Dat bemonstert per hexagon het centroïde-punt met één `t.rast.what`-aanroep,
haalt de Natura 2000-begrenzing bij PDOK op, en schrijft klimatologie, reeks,
z-tellingen en trend per cel weg.

Zonder GRASS-database, voor ontwikkelen en voor de publieke demo:

```bash
python3 scripts/build_fenologie_cube.py --demo --res 9 \
  --out data/fenologie-nieuwkoop.json
```

De viewer zet dan zelf een `demo-data`-badge in het paneel — de reeksen zijn
gesimuleerd, de verwerking erna is dezelfde code.

Resolutie kiezen: res 9 geeft ~626 cellen van ~0,1 km² en een bestand van
1,7 MB (756 kB gzipped). Res 10 vervijfvoudigt beide.

## Bestanden

```
fenologie/index.html          markup, meta/OG, CDN-scripts
fenologie/config.js           kubus-URL, basemaps, kaartlagen, kleuren
fenologie/css/style.css       licht thema, bottom sheet op mobiel
fenologie/js/cube.js          base64-Int16 decoderen, decompositie, Theil-Sen, Mann-Kendall
fenologie/js/charts.js        vier SVG-grafieken, geen chartbibliotheek
fenologie/js/app.js           MapLibre, interactie, permalink, CSV-export
api/ndvi-series.js            live openEO-punt (CDSE), server-side credentials
scripts/build_fenologie_cube.py   GRASS -> kubus, en de demo-generator
data/fenologie-nieuwkoop.json     de kubus zelf
```

## Verwant

De GRASS-addon `t.rast.pointseries` doet hetzelfde voor één punt op de
commandline en kan de JSON leveren waarop dit viewer-ontwerp gebaseerd is.
De knop "⌨ GRASS-commando" in het detailpaneel drukt de aanroep af voor de
geselecteerde cel.

## Nog open

- De habitatlabels komen in de demo uit het simulatieprofiel. Voor de echte
  kubus moet `build_fenologie_cube.py` nog joinen op de habitatkartering
  (NDVH) in plaats van `hab` leeg te laten.
- De decompositie in de browser is bewust simpel (seizoen = referentiecurve,
  trend = lopende mediaan). Een echte STL hoort in `t.rast.pointseries`, waar
  de volledige reeks beschikbaar is.
- Het live-pad is tegen CDSE geschreven maar nooit tegen een echte
  service-account gedraaid; de process graph is de eerste plek om te kijken
  als er iets misgaat.
