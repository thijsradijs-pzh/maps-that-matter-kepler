// gebiedsviewer/js/state.js — shared global state (must load first)

const BASEMAPS = [
  { id: 'light',     label: 'Licht',   icon: 'fa-sun',            create: () => DeckGLUtils.createBasemap('light') },
  { id: 'voyager',   label: 'Straten', icon: 'fa-road',           create: () => DeckGLUtils.createBasemap('voyager') },
  { id: 'satellite', label: 'Foto',    icon: 'fa-satellite-dish', create: () => createSatelliteLayer() },
];

// Meter per schermpixel. deck.gl rekent met een wereld van 512 px op zoom 0
// (net als MapLibre), niet de 256 px van klassieke tegelschema's -- vandaar
// 78271.5 en niet 156543. Met de oude constante was de schaalbalk 2x te lang
// en zat de schaalafhankelijke zichtbaarheid er een zoomniveau naast.
const MERCATOR_M_PER_PX_Z0 = 78271.51696;
function metersPerPixel(lat, zoom) {
  return MERCATOR_M_PER_PX_Z0 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
}

// Groepslaag waarvan de gebruiker alle sublagen heeft uitgevinkt. ArcGIS tekent
// bij `show:<groeps-id>` juist álle kinderen, dus dit moet expliciet "niets".
function noSublayersSelected(entry) {
  return !!(entry.isGroupLayer && entry.activeSubLayers && entry.activeSubLayers.size === 0);
}

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
