# Fenologie Nieuwkoop

Tien jaar Sentinel-2 per **pixel** over de Nieuwkoopse Plassen & De Haeck.
De kaart toont de per-pixel trend uit de GRASS-pipeline van het rapport; klik
ergens in het gebied en je krijgt de trendcijfers van die ene pixel, met de
tijdreeks eronder op verzoek.

Methodiek volgt *Monitoring habitatveranderingen Nieuwkoop* (HAS green academy
en Provincie Zuid-Holland, 2026): DOY-klimatologie in stappen van 5 dagen op een
365-daagse kalender, spreiding als 1,4826 × MAD, z-anomalie met een SD-drempel
van 0,02, en Theil-Sen + Mann-Kendall op de jaarstatistieken van de
HANTS-jaarcurven — met Benjamini-Hochberg over alle pixels, zoals hoofdstuk 11
voorschrijft.

> **Geen H3 meer.** Tot september 2026 aggregeerde deze viewer naar H3-hexagonen
> (res 10) met een voorberekende kubus. Dat was onze eigen toevoeging, niet die
> van het rapport: de pipeline is van begin tot eind pixel-gebaseerd. De
> hexagonen, `build_fenologie_cube.py` en de shards zijn verwijderd; ze staan
> nog wel in de git-historie tot en met commit `498cc49`.

## Wat waar vandaan komt

| | de kaart | een klik |
|---|---|---|
| bron | GRASS-rasters uit hoofdstuk 11 | openEO op Copernicus Data Space |
| wat | slope, tau, q, aantal jaren | de ruwe NDVI-reeks van dat punt |
| snelheid | direct, alles zit in vier PNG's | 10–40 s, daarna een dag gecachet |
| nodig | `data/fenologie/raster/` | `CDSE_CLIENT_ID` + `CDSE_CLIENT_SECRET` |

Zonder die twee env-vars zegt het paneel dat de reeks niet op te halen is; de
trendkaart zelf blijft gewoon werken.

De reeks is bewust **niet** voorberekend: 550.000 pixels × tien jaar past niet
in een statische download. De trend per pixel wél, want dat zijn vier getallen.

## De trendkaart maken

Draai eerst notebook 11 (Seizoensdecompositie) uit het rapport. Dat schrijft
per jaarstatistiek zes rasters weg, `<index>_decomp_<stat>_trend_<grootheid>`.
Daarna exporteert dit script ze naar de viewer:

```bash
grass /pad/naar/GRASSdb/UTM_NLD/NDVI --exec \
  python3 scripts/export_fenologie_raster.py --from-grass \
    --index ndvi --stat median
```

`--stat` kiest welke trend je toont: `median` is de niveautrend, `max` de
piektrend, `min` de daltrend en `range` het groter of kleiner worden van het
seizoensbereik.

Het script **rekent niets uit**. Het leest de rasters, herprojecteert ze naar
EPSG:3857 met `gdalwarp` en pakt ze in. Alle statistiek blijft waar hij hoort:
in de notebooks.

Verifiëren voordat je iets gelooft:

```bash
grass ... --exec python3 scripts/export_fenologie_raster.py --from-grass \
    --index ndvi --stat median --verify 8
```

Dat leest acht willekeurige pixels rechtstreeks met `r.what`, buiten de
exportketen om, zodat je ziet of `r.out.gdal` → `gdalwarp` → Int16 onderweg
iets stukmaakt.

Zonder GRASS-database, voor ontwikkelen en voor de publieke demo:

```bash
python3 scripts/export_fenologie_raster.py --demo
```

De viewer zet dan zelf een `demo-data`-badge in het paneel — het trendveld is
gesimuleerd, de weergave erna is dezelfde code.

## Zonder GRASS: de openEO-route

Geen toegang tot de GRASS-database van HAS/PZH? Dan bouwt
`scripts/build_fenologie_openeo.py` dezelfde PNG's uit echte Sentinel-2 data.
De zware temporele reductie gebeurt op Copernicus, de trendberekening hier:

| openEO (CDSE) | lokaal |
|---|---|
| laden, wolken maskeren (SCL 3/8/9/10/11), NDVI | Theil-Sen + Mann-Kendall per pixel |
| mediaan per jaar, herprojectie naar EPSG:3857 | Benjamini-Hochberg over alle pixels |
| → 10 rasters, ~26 MB | → dezelfde vier PNG's |

```bash
export CDSE_CLIENT_ID='...'
export CDSE_CLIENT_SECRET='...'
python3 scripts/build_fenologie_openeo.py            # ~10-40 min
python3 scripts/build_fenologie_openeo.py --dry-run  # alleen de process graph
```

Credentials maak je op het [Sentinel Hub-dashboard](https://shapps.dataspace.copernicus.eu/dashboard)
→ User Settings → OAuth clients → Create. De secret is daarna niet meer op te
halen. Ze komen uit de omgeving en worden nergens weggeschreven.

`theilsen_mk()` en `fdr_pvalue()` zijn een portering van notebook 11, bewust
een kopie en geen eigen variant. Getoetst tegen `scipy.stats.theilslopes` en
`scipy.stats.kendalltau`: de helling en tau-b komen exact overeen. De
p-waarden wijken af omdat het rapport de normaal-benadering met
continuïteitscorrectie gebruikt waar scipy bij n = 10 de exacte
permutatieverdeling neemt — maximaal 0,010 verschil, en bij de drempel die
wij gebruiken (q < 0,05) geeft het precies hetzelfde aantal.

**Afwijking van het rapport.** Notebook 11 vat per jaar de *HANTS-gladgestreken*
jaarcurve samen; openEO kent geen HANTS, dus dit script neemt de mediaan van
de waarnemingen in dat jaar. Voor de niveautrend (`median`) is dat
verdedigbaar — beide zijn robuuste centrummaten. Voor piek, dal en bereik
niet: de extremen van een gladgestreken curve zijn iets heel anders dan die
van ruwe waarnemingen. Daarom berekent dit script alleen de niveautrend.

### De detectiegrens, lees dit voordat je conclusies trekt

Mann-Kendall op tien jaarwaarden heeft een **harde ondergrens** voor de
p-waarde: een reeks kan niet monotoner dan perfect. Bij n = 10 is dat
p = 8,3 × 10⁻⁵. Benjamini-Hochberg verwerpt de k-de kleinste p als
p ≤ k/N × α, dus er moeten er minstens `k = p_min × N / α` op die ondergrens
zitten voordat er ook maar één significant heet.

Omdat N = gebied / pixeloppervlak valt het pixeloppervlak tegen elkaar weg:
**de minimale oppervlakte is onafhankelijk van de resolutie.**

| reeks | kleinste p | minimaal aaneengesloten |
|---|---|---|
| 10 jaar | 8,3 × 10⁻⁵ | **9,2 ha** |
| 12 jaar | 8,3 × 10⁻⁶ | 0,92 ha |
| 15 jaar | 2,7 × 10⁻⁷ | 0,03 ha |

Over Nieuwkoop (55 km² binnen de omtrek) kan een sterk dalend perceel van
2 ha bij tien jaar data dus **nooit** significant heten, hoe overtuigend de
reeks ook is. Dat is geen fout in de data of de code, het is wat deze toets
op deze schaal kan.

Fijner bemonsteren helpt niet. Een langere reeks wel, en hard: p_min daalt
ruwweg een factor tien per twee extra jaren. Dat geeft een concreet getal bij
wat §5.3.3 van het rapport voorstelt — Landsat-harmonisatie om de reeks te
verlengen. Twee jaar erbij is al een factor tien in gevoeligheid.

Het script drukt deze grens na afloop af, juist als de uitkomst nul is.

## Het bestandsformaat

Vier PNG's plus een `meta.json`, samen ~2,9 MB:

```
data/fenologie/raster/meta.json     bounds, afmeting, per band schaal + bereik
data/fenologie/raster/slope.png     Theil-Sen-helling (NDVI/jaar)
data/fenologie/raster/tau.png       Kendall's tau-b
data/fenologie/raster/qvalue.png    FDR-gecorrigeerde q
data/fenologie/raster/count.png     aantal jaren met een curve
```

De waarde zit **verliesloos als Int16 in de PNG**: R is de hoge byte, G de lage,
en alpha is het nodata-masker. De browser decodeert dat met een gewone `<img>`
plus canvas, dus zonder geotiff.js, GDAL of tegelserver — dat past bij de
CDN-first-opzet van dit repo. Terugrekenen is `int16(R<<8 | G) × scale`, met
`scale` per band in `meta.json`.

Het raster staat in EPSG:3857, zodat MapLibre het als image-source met vier
hoekcoördinaten precies op zijn plek legt zonder in de browser te
herprojecteren. `raster-resampling` staat op `nearest`: elke pixel is een
meetwaarde, en interpolatie zou waarden suggereren die niet berekend zijn.

## Waar moet ik kijken?

Paragraaf 5.1 van het rapport zegt dat de meerwaarde van deze methode zit in
het *"locaties selecteren waar veldbezoek het meest relevant is"*. Een kaart
alleen doet dat niet: je moet de gekleurde vlekken zelf vinden en onderling
wegen. Het paneel doet dat wegen expliciet.

`Raster.clusters()` zoekt aaneengesloten vlekken van significante pixels
(8-verbonden, iteratieve flood fill — recursie loopt op 700.000 pixels de call
stack over). Een vlek is eenduidig stijgend of dalend; een dalende en een
stijgende plek die elkaar raken zijn twee bevindingen, geen één.

De rangschikking is oppervlak × |gemiddelde helling|. Een vlek van 16 ha met
een matige helling verdient eerder een veldbezoek dan drie pixels met een
steile helling. Vlekken onder `shortlist.minPixels` (standaard 12, dus 0,12 ha)
vallen af: een enkele significante pixel tussen honderdduizenden is precies wat
de FDR-correctie nog nét doorlaat.

Klik een regel en de kaart springt naar de sterkste pixel in die vlek.

## Beheeringrepen op de tijdas

Paragraaf 5.3.2 noemt maaibeheer, rietoogst, het opschonen van petgaten en
perioden met afwijkend hoog water als een beter eerste aangrijpingspunt dan
droogte, juist omdat ze locatiegebonden zijn en in de tijd te plaatsen. Zonder
die context is een dip in de reeks een raadsel; met een streepje erbij is het
een maaibeurt.

Die registraties heeft het rapport zelf nog niet — er staat letterlijk *"met
PZH overleggen of we een kaart met ingrepen, inclusief wanneer deze hebben
plaatsgevonden, kunnen krijgen"*. `data/fenologie/ingrepen.json` is de
aansluiting, klaar voor het moment dat ze er zijn:

```json
{
  "voorbeeld": false,
  "ingrepen": [
    {
      "datum": "2021-07-15",
      "type": "maaibeheer",
      "omschrijving": "eerste maaironde noordelijke percelen",
      "bbox": [4.80, 52.145, 4.84, 52.168]
    }
  ]
}
```

`start` + `eind` in plaats van `datum` maakt er een periode van (een bandje in
plaats van een streepje). Zonder `bbox` geldt een ingreep voor het hele gebied;
mét bbox alleen voor pixels erbinnen. `type` stuurt de kleur en mag groeien —
onbekende types krijgen gewoon de neutrale kleur.

`ingrepen.voorbeeld.json` bevat verzonnen entries en wordt **alleen** geladen
als de trendkaart zelf ook demo-data is (`meta.demo`), zodat verzonnen ingrepen
nooit naast echte metingen komen te staan. De viewer zet er bovendien een
waarschuwing boven.

## Significantie

Het vinkje "alleen significante trends" toetst op **q, niet op p**. Over een
half miljoen pixels levert p < 0,05 anders vanzelf tienduizenden valse
positieven; hoofdstuk 11 corrigeert daarom met Benjamini-Hochberg en schrijft
de q al als raster weg. Houdt geen enkele pixel stand, dan zegt de viewer dat
er expliciet bij in plaats van een lege kaart te tonen.

Een losse klik is iets anders: dat is één toets, zonder
meervoudigheidsprobleem. Daar rapporteert het paneel de q uit het raster, en de
live opgehaalde reeks krijgt alleen een ruwe p.

## Bestanden

```
fenologie/index.html          markup, meta/OG, CDN-scripts
fenologie/config.js           raster-URL, basemaps, kaartlagen, kleuren
fenologie/css/style.css       licht thema, bottom sheet op mobiel
fenologie/js/raster.js        PNG decoderen, georeferentie, inkleuren
fenologie/js/series.js        klimatologie, z, decompositie, Theil-Sen, MK
fenologie/js/ingrepen.js      beheerregistraties laden en op locatie filteren
fenologie/js/charts.js        vier SVG-grafieken, geen chartbibliotheek
fenologie/js/app.js           MapLibre, interactie, permalink, CSV-export
api/ndvi-series.js            live openEO-punt (CDSE), server-side credentials
scripts/export_fenologie_raster.py  GRASS-rasters -> PNG's, en de demo-generator
scripts/build_fenologie_openeo.py   openEO -> jaarmedianen -> trend -> dezelfde PNG's
data/fenologie/raster/        de trendkaart zelf
data/fenologie/ingrepen.json  beheerregistraties (leeg tot PZH ze aanlevert)
```

## Verwant

De knop "⌨ GRASS-commando" in het detailpaneel drukt een `t.rast.what`-aanroep
af waarmee je de ruwe reeks van het gekozen punt uit de STRDS haalt, zodat je
de cijfers in het paneel kunt natrekken.

Voor een echte additieve STL-decompositie (trend, seizoen en restterm op de
oorspronkelijke tijdas) is er de GRASS-addon `t.rast.stl`, genoemd in
hoofdstuk 11 van het rapport. Die werkt per locatie; de parameters staan niet
in het rapport, dus de aanroep is hier niet ingevuld.

## Nog open

- **Het GRASS-pad is nooit tegen een echte sessie gedraaid.** Dat gold al voor
  de oude kubus en geldt ook voor deze export: `r.out.gdal` → `gdalwarp` →
  `osgeo.gdal` is op papier geschreven. Draai `--verify` op de eerste echte
  export voordat je de kaart vertrouwt.
- De decompositie in de browser is bewust simpel (seizoen = referentiecurve,
  trend = lopende mediaan). Een echte STL hoort in `t.rast.stl`, waar de
  volledige reeks beschikbaar is.
- Het live-pad is tegen CDSE geschreven maar nooit tegen een echte
  service-account gedraaid; de process graph is de eerste plek om te kijken
  als er iets misgaat.
- De viewer toont één jaarstatistiek tegelijk, die je bij de export kiest met
  `--stat`. Hoofdstuk 11 berekent er vier; alle vier tegelijk tonen zou vier
  keer zoveel PNG's betekenen.
