// gebiedsviewer/js/state.js — shared global state (must load first)

const BASEMAPS = [
  { id: 'light',     label: 'Licht',   icon: 'fa-sun',            create: () => DeckGLUtils.createBasemap('light') },
  { id: 'voyager',   label: 'Straten', icon: 'fa-road',           create: () => DeckGLUtils.createBasemap('voyager') },
  { id: 'dark',      label: 'Donker',  icon: 'fa-moon',           create: () => createDarkLayer() },
  { id: 'satellite', label: 'Foto',    icon: 'fa-satellite-dish', create: () => createSatelliteLayer() },
];

// MCA_CRITERIA loaded from /shared/mca-criteria.js
const MCA_VIEW = { longitude: 4.70, latitude: 52.08, zoom: 10, pitch: 0, bearing: 0 };

let deckInstance = null;
let currentViewState = { ...CONFIG.initialView };
let currentBasemap = 'light';
// key → { wmsUrl, mapServerUrl, layerId, label, serviceId, color, opacity, visible, minScale, isCustom, isGeoJson, geojsonData }
const activeLayers = new Map();
let popupEl = null;
let searchTerm = '';
let _customLayerCount = 0;

const mcaState = {
  active: false,
  data: null,
  weights: Object.fromEntries(MCA_CRITERIA.map(c => [c.weightKey, 2])),
};
