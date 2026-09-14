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
| nodig | `data/fenologie/` | `CDSE_CLIENT_ID` + `CDSE_CLIENT_SECRET` |

Zonder die twee env-vars valt de live-knop stil weg; de kubus blijft werken.

## De kubus bouwen

De echte variant draait binnen een GRASS-sessie op de mapset waar de STRDS'en
van de pipeline staan:

```bash
grass /pad/naar/GRASSdb/UTM_NLD/NDVI --exec \
  python3 scripts/build_fenologie_cube.py --from-grass \
    --strds S2_ndvi --res 10 \
    --out-dir data/fenologie
```

Dat rasteriseert de hexagonen tot zones, draait `t.rast.univar -e` over de
STRDS en neemt per datum per cel de **mediaan over alle pixels**, plus de
pixeltelling als kwaliteitsmaat. Het haalt de Natura 2000-begrenzing bij PDOK
op en schrijft klimatologie, reeks, z-tellingen en trend per cel weg.

## Bemonstering: zonal of centroid

Op res 10 zitten er ruim 150 Sentinel-2 pixels in een hexagon.

- `--sampling zonal` (default) neemt de mediaan van al die pixels en bewaart
  hoeveel er meededen (`npix` in de index, zichtbaar in het paneel).
  `--min-pixels 8` laat een datum vallen als er te weinig wolkvrije pixels over
  zijn.
- `--sampling centroid` bemonstert alleen het middelpunt. Sneller, maar dan
  toont een cel van 1,5 ha het verhaal van 100 m². De viewer zet er dan zelf
  een waarschuwing bij.

Verifiëren voordat je iets gelooft:

```bash
grass ... --exec python3 scripts/build_fenologie_cube.py --from-grass \
    --strds S2_ndvi --res 10 --verify 8 --out-dir /tmp/probe
```

Dat trekt acht willekeurige cellen na met een losse `t.rast.what` op het
middelpunt. Bij `centroid` horen de verschillen nul te zijn; bij `zonal` zegt
het verschil hoe heterogeen een cel is.

## Habitat- of beheertype

```bash
  --habitat pad/naar/beheertypen.gpkg --habitat-field beheertype
```

Vult `hab` per cel met het type dat het meeste oppervlak beslaat. PDOK heeft
hiervoor niets bruikbaars: de Natura 2000-service van RVO geeft alleen
gebiedsgrenzen, en "Habitatrichtlijn verspreiding van habitattypen" is het
EU-rapportageraster van 10 bij 10 km. De habitattypenkaart zelf zit in de NDVH
bij BIJ12. Publiek bruikbaar alternatief: de beheertypen uit het
Natuurbeheerplan van de provincie, per jaar beschikbaar.

Zonder GRASS-database, voor ontwikkelen en voor de publieke demo:

```bash
python3 scripts/build_fenologie_cube.py --demo --res 10 \
  --out-dir data/fenologie
```

De viewer zet dan zelf een `demo-data`-badge in het paneel — de reeksen zijn
gesimuleerd, de verwerking erna is dezelfde code.

## Index en shards

De uitvoer is gesplitst, anders wordt res 10 een download van megabytes
voordat er iets op het scherm staat:

- `data/fenologie/index.json` — alles wat de kaart nodig heeft (trend,
  z-tellingen, jaarstatistieken). 1,4 MB, 319 kB gzipped, laadt direct.
- `data/fenologie/s/<h3-ouder>.json` — de reeksen, gegroepeerd per H3-cel
  twee resoluties grover. 108 stuks, gemiddeld 92 kB (35 kB gzipped).
  Komen pas binnen als je een cel aanklikt, en blijven daarna in het geheugen.

`lat`/`lon` en de jarenreeks staan bewust niet in de index; de browser leidt
die af uit de H3-id en uit `meta.years`. Dat scheelt een derde.

Resolutie kiezen: res 10 geeft 4.353 cellen van 152 m breed (1,5 ha), res 9
geeft er 626 van 402 m. Met de splitsing schaalt res 10 prima; res 11 zou
~31.000 cellen geven en dan is de index zelf aan de beurt om te splitsen.

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
