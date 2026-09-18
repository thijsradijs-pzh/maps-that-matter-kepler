// Fenologie Nieuwkoop — configuratie
window.FENO_CONFIG = {
  // De per-pixel trendkaarten die scripts/export_fenologie_raster.py schrijft
  // uit de GRASS-uitvoer van hoofdstuk 11. Geen H3, geen kubus: een raster in
  // EPSG:3857 dat als image-source op de kaart ligt.
  rasterBase: '/data/fenologie/raster',

  // Analyse-eenheid. Dezelfde reeks, andere schaal waarop getoetst wordt:
  // per pixel is 1,5 miljoen toetsen en loopt vast op de meervoudigheids-
  // correctie; per beheertype zijn het er 17 en is die correctie mild, maar
  // middelt het aggregeren ook signaal weg. Zie scripts/aggregate_fenologie_zones.py.
  views: [
    { id: 'pixel', label: 'Per pixel', base: '/data/fenologie/raster' },
    { id: 'type', label: 'Per beheertype', base: '/data/fenologie/raster-type',
      series: '/data/fenologie/series-type.json' },
    { id: 'polygon', label: 'Per beheerperceel', base: '/data/fenologie/raster-polygon',
      series: '/data/fenologie/series-polygon.json' },
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

  // Reeksen op een grof grid, voor het deel van het gebied zonder
  // beheertype-polygoon. Lui geladen: pas bij de eerste klik, want het is
  // ~2,4 MB en de kaart hoeft er niet op te wachten.
  gridSeriesUrl: '/data/fenologie/series-grid.json',

  // Benjamini-Hochberg-niveau, gelijk aan fdr_alpha in de rasterexport.
  alpha: 0.05,

  // "Waar moet ik kijken?": hoeveel vlekken tonen, en hoe klein mag een vlek
  // zijn voordat we hem als ruis beschouwen.
  shortlist: { aantal: 6, minPixels: 12 },

  map: {
    center: [4.838, 52.150],
    zoom: 12.1,
    minZoom: 8,
    maxZoom: 16,
  },

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
      fmt: function (v) { return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(4).replace('.', ','); },
      note: 'Theil-Sen op de jaarmedianen van de HANTS-jaarcurven. Bruin = afname, groen = toename.',
    },
    tau: {
      band: 'tau',
      label: 'Sterkte van de monotone trend',
      unit: "Kendall's tau-b",
      type: 'diverging',
      domain: 1.0,
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
