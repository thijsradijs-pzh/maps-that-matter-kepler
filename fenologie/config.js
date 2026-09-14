// Fenologie Nieuwkoop — configuratie
window.FENO_CONFIG = {
  // De kubus die scripts/build_fenologie_cube.py schrijft.
  cubeUrl: '/data/fenologie-nieuwkoop.json',

  // Serverless endpoint voor punten buiten de kubus (live openEO op CDSE).
  // Zonder CDSE_CLIENT_ID / CDSE_CLIENT_SECRET geeft het endpoint 503 en
  // verbergt de viewer de knop.
  liveUrl: '/api/ndvi-series',

  map: {
    center: [4.838, 52.150],
    zoom: 12.1,
    minZoom: 8,
    maxZoom: 16,
  },

  basemaps: {
    positron: {
      tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
      attribution: '© OpenStreetMap · © CARTO',
      tileSize: 256,
    },
    // PDOK WMTS, CORS-open, geen sleutel nodig
    luchtfoto: {
      tiles: ['https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg'],
      attribution: '© Kadaster / PDOK — luchtfoto Actueel_orthoHR',
      tileSize: 256,
    },
  },

  // Kaartlagen: welk veld, welke schaal, welke legenda
  metrics: {
    slope: {
      label: 'Trend in het seizoensniveau',
      unit: 'NDVI/jaar',
      type: 'diverging',
      domain: 0.010,
      fmt: function (v) { return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(4).replace('.', ','); },
      note: 'Theil-Sen op de jaarmedianen. Bruin = afname, groen = toename.',
    },
    zlow: {
      label: 'Uitzonderlijk lage waarnemingen',
      unit: 'waarnemingen met z ≤ −2',
      type: 'sequential',
      color: '#9a5b1f',
      fmt: function (v) { return String(v); },
      note: 'Hoe donkerder, hoe vaker de index ver onder de eigen referentie zakte.',
    },
    zhigh: {
      label: 'Uitzonderlijk hoge waarnemingen',
      unit: 'waarnemingen met z ≥ +2',
      type: 'sequential',
      color: '#1e7a45',
      fmt: function (v) { return String(v); },
      note: 'Hoe donkerder, hoe vaker de index ver boven de eigen referentie lag.',
    },
    n: {
      label: 'Bruikbare waarnemingen',
      unit: 'wolkvrije dagcomposieten',
      type: 'sequential',
      color: '#0d6675',
      fmt: function (v) { return String(v); },
      note: 'Dekking van de reeks: lage waarden maken elke conclusie zwakker.',
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
