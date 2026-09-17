// Fenologie Nieuwkoop — configuratie
window.FENO_CONFIG = {
  // De per-pixel trendkaarten die scripts/export_fenologie_raster.py schrijft
  // uit de GRASS-uitvoer van hoofdstuk 11. Geen H3, geen kubus: een raster in
  // EPSG:3857 dat als image-source op de kaart ligt.
  rasterBase: '/data/fenologie/raster',

  // Serverless endpoint voor de reeks achter een klik (live openEO op CDSE).
  // Zonder CDSE_CLIENT_ID / CDSE_CLIENT_SECRET geeft het endpoint 503; de
  // viewer toont dan wel de trendcijfers uit het raster, maar geen grafieken.
  liveUrl: '/api/ndvi-series',

  // Beheeringrepen op de tijdas (hoofdstuk 5.3.2 van het rapport). Het
  // voorbeeldbestand wordt alleen geladen als de trendkaart zelf demo-data is,
  // zodat verzonnen ingrepen nooit naast echte metingen staan.
  ingrepenUrl: '/data/fenologie/ingrepen.json',
  ingrepenVoorbeeldUrl: '/data/fenologie/ingrepen.voorbeeld.json',

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

  // Alle drie PDOK, geen sleutel nodig, geen CARTO.
  basemaps: {
    brtGrijs: {
      tiles: ['https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png'],
      attribution: '&copy; Kadaster / PDOK &mdash; BRT Achtergrondkaart',
      tileSize: 256,
      maxzoom: 16,
    },
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

  // Kaartlagen: welk veld, welke schaal, welke legenda
  defaultBasemap: 'brtGrijs',

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
