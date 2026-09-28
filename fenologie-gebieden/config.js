// Fenologie Natura 2000 — configuratie
//
// Dit is de gebiedsoverstijgende variant van /fenologie. Twee verschillen die
// ertoe doen:
//
//  1. De omtrek komt uit de landelijke Natura 2000-service van RVO bij PDOK,
//     niet uit de handgetekende ring die /fenologie gebruikt. Over Nieuwkoop
//     scheelt dat 457 ha die er ten onrechte buiten viel, en ~3.950 ha
//     boerenland dat er ten onrechte in zat.
//  2. Meerdere gebieden naast elkaar, elk met een eigen raster en eigen
//     reeksen. De asdomeinen staan per gebied in de config zodat ze uit elkaar
//     KUNNEN lopen, maar zijn na meting bewust gelijk gehouden: alleen dan zijn
//     twee gebieden met het oog te vergelijken.
//
// /fenologie blijft ongewijzigd in productie staan.
window.FENO_CONFIG = {
  // Elk gebied heeft zijn eigen datamap onder data/fenologie-gebieden/<id>/.
  gebieden: [
    {
      id: 'nieuwkoop',
      label: 'Nieuwkoopse Plassen & De Haeck',
      kort: 'Nieuwkoop',
      basis: '/data/fenologie-gebieden/nieuwkoop',
      oppervlak_ha: 2003,
      cell_m: 200,
      map: { center: [4.805, 52.138], zoom: 12.0 },
      axis: {
        vast: true,
        index: [-0.2, 1],
        indexTicks: 6,
        residu: [-0.5, 0.5],
        bereik: [0, 0.8],
        z: 3,
      },
    },
    {
      id: 'coepelduynen',
      label: 'Coepelduynen',
      kort: 'Coepelduynen',
      basis: '/data/fenologie-gebieden/coepelduynen',
      oppervlak_ha: 188,
      cell_m: 100,
      map: { center: [4.417, 52.223], zoom: 13.6 },
      // BEWUST dezelfde assen als Nieuwkoop, al is de verdeling anders:
      // gemeten over 42.262 waarnemingen ligt de mediaan hier op 0,47 tegen
      // 0,78 bij Nieuwkoop (duin met zand tegen veen met water) en klemt
      // [-0,2 .. 1] hier 0,00% tegen 1,0% daar. Een eigen, strakker domein zou
      // ruimte winnen maar de twee gebieden onvergelijkbaar maken op het oog --
      // en dat is precies waarvoor de vaste as bestaat.
      axis: {
        vast: true,
        index: [-0.2, 1],
        indexTicks: 6,
        residu: [-0.5, 0.5],
        bereik: [0, 0.8],
        z: 3,
      },
    },
  ],
  defaultGebied: 'nieuwkoop',

  // Analyse-eenheid. Dezelfde reeks, andere schaal waarop getoetst wordt: per
  // pixel loopt het vast op de meervoudigheidscorrectie, per beheertype is die
  // correctie mild maar middelt het aggregeren ook signaal weg. De mappen zijn
  // relatief aan de basis van het gekozen gebied.
  viewDefs: [
    { id: 'pixel', label: 'Per pixel', dir: 'raster' },
    { id: 'type', label: 'Per beheertype', dir: 'raster-type',
      series: 'series-type.json' },
    { id: 'polygon', label: 'Per beheerperceel', dir: 'raster-polygon',
      series: 'series-polygon.json' },
    { id: 'grid', label: 'Per gridcel', dir: 'raster-grid',
      series: 'series-grid.json' },
  ],
  defaultView: 'pixel',

  // Serverless endpoint voor de reeks achter een klik (live openEO op CDSE).
  // Zonder CDSE_CLIENT_ID / CDSE_CLIENT_SECRET geeft het endpoint 503; de
  // viewer toont dan wel de trendcijfers uit het raster, maar geen grafieken.
  liveUrl: '/api/ndvi-series',

  // Beheeringrepen op de tijdas (hoofdstuk 5.3.2 van het rapport). Het
  // voorbeeldbestand wordt alleen geladen als de trendkaart zelf demo-data is,
  // zodat verzonnen ingrepen nooit naast echte metingen staan.
  ingrepenUrl: '/data/fenologie/ingrepen.json',
  ingrepenVoorbeeldUrl: '/data/fenologie/ingrepen.voorbeeld.json',

  // De gridreeksen worden per gebied opgebouwd uit basis + viewDefs; zie
  // gebiedPaden() in js/app.js. Lui geladen: pas bij de eerste klik.

  // Benjamini-Hochberg-niveau, gelijk aan fdr_alpha in de rasterexport.
  alpha: 0.05,

  // De vaste y-assen staan PER GEBIED in `gebieden[].axis`; app.js zet de
  // actieve op CFG.axis bij het wisselen. Een veenmoeras met open water en een
  // duingebied met zand hebben een andere NDVI-verdeling, dus één domein voor
  // beide zou in het ene gebied ruimte verspillen en in het andere klemmen.

  // "Waar moet ik kijken?": hoeveel vlekken tonen, en hoe klein mag een vlek
  // zijn voordat we hem als ruis beschouwen.
  shortlist: { aantal: 6, minPixels: 12 },

  // Zoomgrenzen zijn gebiedsoverstijgend; centrum en startzoom per gebied.
  map: { minZoom: 8, maxZoom: 16 },

  // Beide PDOK, geen sleutel nodig, geen CARTO. De luchtfoto is de standaard:
  // die laat zien wat er op de grond staat, en met de jaarstrip erbij is een
  // trend visueel na te rekenen. BRT grijs is eruit -- een grijze ondergrond
  // onder een trendkaart voegt weinig toe boven de standaard BRT.
  basemaps: {
    brtStandaard: {
      tiles: ['https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png'],
      attribution: '&copy; Kadaster / PDOK &mdash; BRT Achtergrondkaart',
      tileSize: 256,
      maxzoom: 16,
    },
    luchtfoto: {
      tiles: ['https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg'],
      attribution: '&copy; Kadaster / PDOK &mdash; luchtfoto Actueel_orthoHR',
      tileSize: 256,
      maxzoom: 19,
    },
  },

  // Historische luchtfoto's uit hetzelfde PDOK-archief, dezelfde lijst als
  // pdok-viewer gebruikt. De reeks loopt 2016-2025 en dekt daarmee precies de
  // periode van de trendkaart, dus je kunt een trend visueel narekenen.
  // 2021 heeft geen zomeropname; vanaf 2021 is er een winteropname van 8 cm.
  aerial: [
    { id: 'actueel', label: 'nu', layer: 'Actueel_orthoHR', res: '8cm' },
    { id: '2016', label: '2016', year: 2016, season: 'zomer', layer: '2016_ortho25', res: '25cm' },
    { id: '2017', label: '2017', year: 2017, season: 'zomer', layer: '2017_ortho25', res: '25cm' },
    { id: '2018', label: '2018', year: 2018, season: 'zomer', layer: '2018_ortho25', res: '25cm' },
    { id: '2019', label: '2019', year: 2019, season: 'zomer', layer: '2019_ortho25', res: '25cm' },
    { id: '2020', label: '2020', year: 2020, season: 'zomer', layer: '2020_ortho25', res: '25cm' },
    { id: '2021w', label: '2021', year: 2021, season: 'winter', layer: '2021_orthoHR', res: '8cm' },
    { id: '2022', label: '2022', year: 2022, season: 'zomer', layer: '2022_ortho25', res: '25cm' },
    { id: '2023', label: '2023', year: 2023, season: 'zomer', layer: '2023_ortho25', res: '25cm' },
    { id: '2024', label: '2024', year: 2024, season: 'zomer', layer: '2024_ortho25', res: '25cm' },
    { id: '2025', label: '2025', year: 2025, season: 'zomer', layer: '2025_ortho25', res: '25cm' },
    { id: '2026w', label: '2026', year: 2026, season: 'winter', layer: '2026_orthoHR', res: '8cm' },
    // Geen zomeropname 2026: PDOK's 2026_quickortho25 staat wel in de
    // capabilities maar levert overal een egale witte tegel (getoetst op vier
    // plekken in het land). Voeg 2026_ortho25 toe zodra die er is.
  ],
  aerialBase: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/%LAYER%/EPSG:3857/{z}/{x}/{y}.jpeg',

  // Kaartlagen: welk veld, welke schaal, welke legenda
  defaultBasemap: 'luchtfoto',

  // Kaartlagen: elk verwijst naar een band uit de rasterexport.
  metrics: {
    slope: {
      band: 'slope',
      label: 'Trend in het seizoensniveau',
      unit: 'NDVI/jaar',
      type: 'diverging',
      domain: 0.010,
      qband: 'qvalue',
      fmt: function (v) { return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(4).replace('.', ','); },
      note: 'Theil-Sen op de jaarmedianen. Bruin = afname, groen = toename.',
    },
    tau: {
      band: 'tau',
      label: 'Sterkte van de monotone trend',
      unit: "Kendall's tau-b",
      type: 'diverging',
      domain: 1.0,
      qband: 'qvalue',
      fmt: function (v) { return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2).replace('.', ','); },
      note: 'Gestandaardiseerde effectmaat: −1 is strikt dalend, +1 strikt stijgend.',
    },
    qvalue: {
      band: 'qvalue',
      label: 'Significantie (FDR-gecorrigeerd)',
      unit: 'q-waarde',
      type: 'sequential',
      color: '#0d6675',
      invert: true,
      domain: 1.0,
      fmt: function (v) { return v < 0.001 ? '< 0,001' : v.toFixed(3).replace('.', ','); },
      note: 'Donker = klein, dus sterker bewijs. Gecorrigeerd voor het aantal getoetste pixels.',
    },
    // Hoofdstuk 11 berekent vier trends. Deze drie bestaan alleen op de
    // gridweergave, want daar is de volledige waarnemingsreeks per cel
    // beschikbaar. Zie scripts/build_fenologie_seasonstats.py.
    slope_peak: {
      band: 'slope_peak',
      label: 'Trend in de seizoenspiek',
      unit: 'NDVI/jaar',
      type: 'diverging',
      domain: 0.010,
      qband: 'qvalue_peak',
      views: ['grid'],
      fmt: function (v) { return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(4).replace('.', ','); },
      note: 'De p90 van elk jaar. Lagere pieken kunnen wijzen op minder productie of vroeger maaien.',
    },
    slope_trough: {
      band: 'slope_trough',
      label: 'Trend in het seizoensdal',
      unit: 'NDVI/jaar',
      type: 'diverging',
      domain: 0.010,
      qband: 'qvalue_trough',
      views: ['grid'],
      fmt: function (v) { return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(4).replace('.', ','); },
      note: 'De p10 van elk jaar. Hogere dalen wijzen op meer groen in de winter.',
    },
    slope_range: {
      band: 'slope_range',
      label: 'Trend in het seizoensbereik',
      unit: 'NDVI/jaar',
      type: 'diverging',
      domain: 0.010,
      qband: 'qvalue_range',
      views: ['grid'],
      fmt: function (v) { return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(4).replace('.', ','); },
      note: 'p90 − p10 per jaar. Een krimpend bereik is wat hoofdstuk 4.5 bij gestopt maaibeheer beschrijft.',
    },
    count: {
      band: 'count',
      label: 'Bruikbare jaren',
      unit: 'jaren met een curve',
      type: 'sequential',
      color: '#55564f',
      domain: null,
      fmt: function (v) { return String(Math.round(v)); },
      note: 'Dekking van de reeks: minder jaren maakt elke conclusie zwakker.',
    },
  },

  // Kleuren, gedeeld met css/style.css
  colors: {
    neg: '#9a5b1f',
    pos: '#1e7a45',
    mid: '#ddd8c8',
    accent: '#0d6675',
    accentSoft: '#d9eaed',
    ink: '#1a1a1a',
    ink2: '#55564f',
    muted: '#8b8d83',
    line: '#e0ddd8',
    s1: '#2a78d6',
    s2: '#eb6834',
  },
};
