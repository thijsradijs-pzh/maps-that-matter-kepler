// js/config.js

const DATA_URL = '/data/som_export.json';
const INITIAL_VIEW = { longitude: 4.35, latitude: 52.02, zoom: 9, pitch: 0, bearing: 0 };
const CHANGED_COLOR = [255, 140, 66, 220];
const ZH_BOUNDS = { minLat: 51.66, maxLat: 52.40, minLon: 3.84, maxLon: 5.06 };

const SCENARIOS = [
  { col: 'scenario_pop_plus20',  label: 'Bevolking +20%' },
  { col: 'scenario_pop_min20',   label: 'Bevolking -20%' },
  { col: 'scenario_heat_plus30', label: 'Hitte +30%' },
  { col: 'scenario_heat_plus50', label: 'Hitte +50%' },
  { col: 'scenario_woz_plus20',  label: 'WOZ +20%' },
];
const TRENDS = [
  { col: 'trend_2030', label: '2030' },
  { col: 'trend_2035', label: '2035' },
];

// 15 hues × 15 lightness levels → 225 visually distinct cluster colors (15×15 SOM)
const SOM_X = 15, SOM_Y = 15, N_CLUSTERS = SOM_X * SOM_Y;

function hslToRgb(h, s, l) {
  h /= 360;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h)       * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

const CLUSTER_COLORS = Array.from({ length: N_CLUSTERS }, (_, id) => {
  const cx = Math.floor(id / SOM_Y), cy = id % SOM_Y;
  return [...hslToRgb(cx * (360 / SOM_X), 1.0, 0.10 + cy * 0.046), 230];
});

function clusterColor(id) {
  if (id == null || id < 0 || id >= N_CLUSTERS) return [60, 60, 60, 60];
  return CLUSTER_COLORS[id];
}

function inZuidHolland(h3Id) {
  const [lat, lon] = h3.h3ToGeo(h3Id);
  return lat >= ZH_BOUNDS.minLat && lat <= ZH_BOUNDS.maxLat
      && lon >= ZH_BOUNDS.minLon && lon <= ZH_BOUNDS.maxLon;
}

function hasContent(d) {
  return d.cluster_2023 != null;
}

// Shared helper: 0-255 index → readable level label
function idxLbl(v) {
  if (v == null) return '–';
  if (v < 30)  return 'laag';
  if (v < 90)  return 'matig';
  if (v < 160) return 'gemiddeld';
  if (v < 220) return 'hoog';
  return 'zeer hoog';
}
