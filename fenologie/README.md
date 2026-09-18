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

### Drie valkuilen bij CDSE openEO

Alle drie kosten een 403 of een 500 die iets anders suggereert dan er aan de
hand is. Ze zaten alle drie ook in `api/ndvi-series.js`, wat verklaart waarom
dat endpoint nooit tegen een echte service-account werkte.

**1. Het token heeft `scope=openid` nodig.** Zonder die scope geeft CDSE
gewoon een geldig token terug — de aanvraag slaagt, de claims kloppen — maar
antwoordt openEO met:

```
403 {"code":"TokenInvalid","message":"Authorization token has expired or is invalid."}
```

Dat leest als een verlopen of verkeerde sleutel en is het niet. Te zien door
het token te decoderen: `scope` staat dan op `email profile user-context`.

**2. De header is `Bearer oidc/<provider>/<token>`**, niet een kaal
`Bearer <token>`. De provider-id staat in `/credentials/oidc` en is hier
`CDSE`. Alleen scope óf alleen header goed hebben helpt niet; het moet allebei.

**3. `if` met `accept: null` wordt geweigerd.** De voor de hand liggende
manier om bewolkte waarnemingen op nodata te zetten is
`{"value": cloudy, "accept": null, "reject": nd}`. De backend laat het
null-argument vallen en klaagt dan dat het verplichte argument ontbreekt:

```
500 Process [if] expects a accept argument. These arguments were found: reject, value
```

Draai het om: toets met `not` op *niet*-bewolkt, geef de index als `accept`
en laat `reject` weg — die is vanzelf null en dus nodata.

**En een vierde, minder gemeen:** `POST /jobs` geeft een 201 zonder id in de
body. Het id staat in de `OpenEO-Identifier`-header, of anders achteraan
`Location`. Pak je `body["id"]`, dan valt het script om nádat de job is
aangemaakt en blijft er een weesjob in status `created` staan die nooit
gestart wordt.

### Aggregeren naar beheertype of perceel

`scripts/aggregate_fenologie_zones.py` toetst op gebiedseenheden in plaats
van losse pixels — wat §5.3.1 van het rapport zelf voorstelt ("Resultaten
kunnen eerst per habitattype worden samengevat").

```bash
python3 scripts/aggregate_fenologie_zones.py --by type      # 17 beheertypen
python3 scripts/aggregate_fenologie_zones.py --by polygon   # 2.315 percelen
```

Zones komen uit de beheertypenkaart van het provinciale Natuurbeheerplan
(dezelfde service die `gebiedsviewer` al ontsluit). PDOK heeft geen bruikbare
habitattypenkaart: de Natura 2000-service van RVO geeft alleen begrenzing en
"Habitatrichtlijn verspreiding van habitattypen" is het EU-rapportageraster
van 10x10 km; de echte kaart zit in de NDVH bij BIJ12.

**Dit middelt geen pixelhellingen.** Per zone wordt eerst de jaarreeks
samengevat (mediaan over de pixels, per jaar), en daarna draait Theil-Sen +
Mann-Kendall op die ene reeks van tien waarden. Dezelfde volgorde als
hoofdstuk 11, en de enige die klopt: het gemiddelde van duizend hellingen
heeft geen bruikbare toetsingsverdeling.

De uitvoer is hetzelfde PNG-formaat, met per pixel de waarde van zijn zone,
plus een zonetabel in `meta.json`. De viewer heeft er een keuzelijst
"Analyse-eenheid" voor.

**Uitkomst over Nieuwkoop: allebei nul significante zones**, maar om
tegengestelde redenen, en dat is het leerzame deel:

| eenheid | getoetst | beste tau | beste q | waarom het strandt |
|---|---|---|---|---|
| pixel | 1.468.511 | — | 0,350 | correctie veel te streng |
| beheertype | 17 | −0,51 | 0,417 | correctie mild, maar aggregeren middelt het signaal weg |
| beheerperceel | 828 | +0,82 | 0,755 | signaal sterk genoeg, correctie net te streng |

De bindende beperking is overal **n = 10**. Met p_min = 8,3 x 10^-5 kan boven
ongeveer **600 zones** niets ooit significant heten, hoe sterk de trend ook
is. Daaronder kan het wel, maar dan moet de trend ook echt sterk zijn.

Praktische consequentie: stel een afgebakende vraag. Toets 50 percelen van
een enkel beheertype in plaats van alle 828, en het sterkste perceel dat we
vonden (tau = +0,82, ruwe p = 0,0009) haalt de drempel wel. Dat sluit aan bij
§5.3, dat stelt dat een beslisregel pas vast te stellen is nadat duidelijk is
welke verandering je wilt signaleren.

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

## Tijdreeksen paraat in de viewer

Een klik levert de tijdreeks direct, zonder op Copernicus te wachten.
`scripts/build_fenologie_series.py` haalt die vooraf op met
`aggregate_spatial`: de ruimtelijke samenvatting gebeurt op de backend, dus
er komt alleen het eindresultaat over de lijn.

```bash
python3 scripts/build_fenologie_series.py --by type            # 17 beheertypen, 39 kB
python3 scripts/build_fenologie_series.py --by grid --cell 200 # 1.386 cellen, ~2,4 MB
```

Per pixel kan dit niet — 500.000 pixels maal 644 datums is honderden
miljoenen getallen — maar per zone of gridcel wel. De viewer zoekt in
volgorde: eerst de zone waar de klik in valt (fijnste wat er is), anders de
gridcel, en pas als allebei niets opleveren het live-pad.

Het gridbestand wordt **lui geladen**, pas bij de eerste klik, zodat de
kaart er niet op hoeft te wachten. Het grid dekt ook de ~75% van het gebied
zonder beheertype-polygoon.

| celmaat | cellen | payload naar openEO | bestand |
|---|---|---|---|
| 100 m | 5.533 | 1,24 MB | ~9,5 MB |
| 150 m | 2.462 | 0,55 MB | ~4,2 MB |
| **200 m** | **1.386** | **0,31 MB** | **~2,4 MB** |
| 250 m | 885 | 0,20 MB | ~1,5 MB |

Een grid is geometrisch spotgoedkoop (vijf punten per cel), waar de
beheertypenkaart met 140.000 punten tegen de 413-limiet aanliep.

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

## Luchtfoto door de jaren heen

De luchtfoto is de standaardondergrond, met een jaarstrip eronder: nu, en
2016 t/m 2025. BRT grijs is eruit; BRT standaard blijft als alternatief.
De trendlaag staat standaard op 60% dekking, zodat de luchtfoto eronder
leesbaar blijft. Zelfde archief en zelfde laaglijst als `pdok-viewer` gebruikt
(`service.pdok.nl/hwh/luchtfotorgb`), maar via het REST-pad dat de andere
basemaps hier ook gebruiken — dat geeft byte-identieke tegels als de
KVP-vorm en scheelt een tweede URL-patroon.

De reeks dekt precies de periode van de trendkaart, dus je kunt een trend
visueel narekenen: zet de dekking van de trendkaart op ~25% en vergelijk
2016 met 2025 op een perceel dat volgens de kaart daalt.

Let op de opnames: t/m 2020 zomer op 25 cm, vanaf 2021 winter op 8 cm.
2021 heeft geen zomeropname. Een zomer- en een winterbeeld naast elkaar
leggen zegt dus weinig over vegetatieverandering — dat verschil is seizoen,
geen trend.

Jaar en ondergrond zitten in de permalink (`?base=luchtfoto&jaar=2018`).

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
