// gebiedsviewer/js/app.js

// --- STATE ---
let deckInstance = null;
let currentViewState = { ...CONFIG.initialView };
let isSatellite = false;
const activeLayers = new Map(); // key → { wmsUrl, layerId, label, deckLayer }
let popupEl = null;
let searchTerm = '';

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  buildLayerTree();
  initDeck();
  initSearch();
  initAddressSearch();
  document.getElementById('loading').style.display = 'none';
});

// --- LAYER TREE ---
function buildLayerTree() {
  const tree = document.getElementById('layer-tree');
  CATALOG.forEach(theme => tree.appendChild(createThemeEl(theme)));
}

function createThemeEl(theme) {
  const details = document.createElement('details');
  details.className = 'theme-group';
  details.dataset.themeId = theme.id;

  const summary = document.createElement('summary');
  summary.className = 'theme-summary';
  summary.innerHTML = `
    <i class="fa fa-chevron-right toggle-arrow"></i>
    <span class="theme-dot" style="background:${theme.color}"></span>
    <span class="theme-label">${theme.label}</span>
    <span class="theme-badge" id="badge-${theme.id}"></span>
  `;
  details.appendChild(summary);

  theme.services.forEach(service => {
    details.appendChild(createServiceEl(service));
  });

  return details;
}

function createServiceEl(service) {
  const details = document.createElement('details');
  details.className = 'service-group';
  details.dataset.serviceId = service.id;

  const summary = document.createElement('summary');
  summary.className = 'service-summary';
  summary.innerHTML = `
    <i class="fa fa-chevron-right toggle-arrow"></i>
    <span>${service.label}</span>
  `;
  details.appendChild(summary);

  const layerList = document.createElement('div');
  layerList.className = 'layers-list';

  service.layers.forEach(layer => {
    const key = `${service.id}::${layer.id}`;
    const div = document.createElement('div');
    div.className = 'layer-item';
    div.dataset.key = key;
    div.dataset.label = layer.label.toLowerCase();
    div.innerHTML = `
      <label class="layer-label">
        <input type="checkbox" class="layer-checkbox" data-key="${key}">
        <span class="layer-name">${layer.label}</span>
      </label>
    `;
    div.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) {
        enableLayer(key, service.wmsUrl, layer.id, layer.label, service.id);
      } else {
        disableLayer(key, service.id);
      }
    });
    layerList.appendChild(div);
  });

  details.appendChild(layerList);
  return details;
}

// --- SEARCH FILTER ---
function initSearch() {
  const input = document.getElementById('layer-search');
  input.addEventListener('input', e => {
    searchTerm = e.target.value.toLowerCase().trim();
    filterLayerTree();
  });
  document.getElementById('search-clear').addEventListener('click', () => {
    input.value = '';
    searchTerm = '';
    filterLayerTree();
  });
}

function filterLayerTree() {
  const clearBtn = document.getElementById('search-clear');
  clearBtn.style.display = searchTerm ? 'block' : 'none';

  document.querySelectorAll('.theme-group').forEach(themeEl => {
    let themeVisible = false;

    themeEl.querySelectorAll('.service-group').forEach(serviceEl => {
      let serviceVisible = false;
      const summaryText = serviceEl.querySelector('.service-summary span:last-child')
        .textContent.toLowerCase();

      serviceEl.querySelectorAll('.layer-item').forEach(layerEl => {
        const match = !searchTerm
          || layerEl.dataset.label.includes(searchTerm)
          || summaryText.includes(searchTerm);
        layerEl.style.display = match ? '' : 'none';
        if (match) serviceVisible = true;
      });

      serviceEl.style.display = serviceVisible ? '' : 'none';
      if (serviceVisible && searchTerm) serviceEl.open = true;
      if (serviceVisible) themeVisible = true;
    });

    themeEl.style.display = themeVisible ? '' : 'none';
    if (themeVisible && searchTerm) themeEl.open = true;
  });
}

// --- LAYER MANAGEMENT ---
function enableLayer(key, wmsUrl, layerId, label, serviceId) {
  const deckLayer = createWMSLayer({ id: key, url: wmsUrl, layer: layerId, title: label });
  activeLayers.set(key, { wmsUrl, layerId, label, deckLayer, serviceId });
  rebuildDeck();
  updateLegend();
  updateBadges();
  showActiveLayersPanel();
}

function disableLayer(key) {
  activeLayers.delete(key);
  rebuildDeck();
  updateLegend();
  updateBadges();
  showActiveLayersPanel();
}

function updateBadges() {
  // Count active layers per theme
  const counts = {};
  activeLayers.forEach(({ serviceId }) => {
    const theme = CATALOG.find(t => t.services.some(s => s.id === serviceId));
    if (theme) counts[theme.id] = (counts[theme.id] || 0) + 1;
  });

  CATALOG.forEach(theme => {
    const badge = document.getElementById(`badge-${theme.id}`);
    if (!badge) return;
    const n = counts[theme.id] || 0;
    badge.textContent = n > 0 ? n : '';
    badge.style.display = n > 0 ? 'inline-flex' : 'none';
  });
}

function showActiveLayersPanel() {
  const panel = document.getElementById('active-layers-panel');
  const list = document.getElementById('active-layers-list');

  if (activeLayers.size === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  list.innerHTML = '';
  activeLayers.forEach(({ label }, key) => {
    const div = document.createElement('div');
    div.className = 'active-layer-chip';
    div.innerHTML = `
      <span>${label}</span>
      <i class="fa fa-times" onclick="removeLayer('${key}')"></i>
    `;
    list.appendChild(div);
  });
}

function removeLayer(key) {
  const checkbox = document.querySelector(`input[data-key="${key}"]`);
  if (checkbox) checkbox.checked = false;
  disableLayer(key);
}

// --- LEGEND ---
function updateLegend() {
  const container = document.getElementById('legend-items');
  container.innerHTML = '';

  if (activeLayers.size === 0) {
    container.innerHTML = '<p class="legend-empty">Geen actieve kaartlagen.<br>Kies lagen via het tabblad "Kaartlagen".</p>';
    return;
  }

  activeLayers.forEach(({ wmsUrl, layerId, label }) => {
    const legendUrl = `${wmsUrl}?SERVICE=WMS&REQUEST=GetLegendGraphic&VERSION=1.1.1&FORMAT=image/png&LAYER=${layerId}&TRANSPARENT=true`;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(legendUrl)}`;

    const div = document.createElement('div');
    div.className = 'legend-item';
    div.innerHTML = `
      <div class="legend-layer-name">${label}</div>
      <img src="${proxyUrl}" class="legend-img" onerror="this.style.display='none'" loading="lazy">
    `;
    container.appendChild(div);
  });
}

// --- DECK.GL ---
function initDeck() {
  deckInstance = new deck.Deck({
    canvas: 'deck-canvas',
    initialViewState: CONFIG.initialView,
    controller: true,
    layers: [DeckGLUtils.createBasemap('light')],

    onViewStateChange: ({ viewState }) => {
      currentViewState = viewState;
      updateScaleBar(viewState);
    },

    onHover: ({ coordinate }) => {
      if (!coordinate) return;
      const [lon, lat] = coordinate;
      document.getElementById('coords-widget').textContent =
        `${lat.toFixed(5)}°N  |  ${lon.toFixed(5)}°E`;
    },

    onClick: handleMapClick,
  });

  updateScaleBar(CONFIG.initialView);
}

function rebuildDeck() {
  if (!deckInstance) return;
  const basemap = isSatellite ? createSatelliteLayer() : DeckGLUtils.createBasemap('light');
  const wmsLayers = [...activeLayers.values()].map(l => l.deckLayer);
  deckInstance.setProps({ layers: [basemap, ...wmsLayers] });
}

function createSatelliteLayer() {
  return new deck.TileLayer({
    id: 'satellite',
    data: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    tileSize: 256,
    renderSubLayers: props => {
      const { bbox: { west, south, east, north } } = props.tile;
      return new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] });
    },
    pickable: false
  });
}

// --- GET FEATURE INFO ---
function handleMapClick({ coordinate, x, y }) {
  if (!coordinate || activeLayers.size === 0) {
    closePopup();
    return;
  }

  const [lon, lat] = coordinate;
  const delta = 0.0015;
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta].join(',');

  showPopup(x, y, 'Laden...');

  const requests = [...activeLayers.values()].map(({ wmsUrl, layerId, label }) => {
    const url = new URL(wmsUrl);
    url.searchParams.set('SERVICE', 'WMS');
    url.searchParams.set('VERSION', '1.1.1');
    url.searchParams.set('REQUEST', 'GetFeatureInfo');
    url.searchParams.set('QUERY_LAYERS', layerId);
    url.searchParams.set('LAYERS', layerId);
    url.searchParams.set('INFO_FORMAT', 'text/plain');
    url.searchParams.set('FEATURE_COUNT', '5');
    url.searchParams.set('X', '50');
    url.searchParams.set('Y', '50');
    url.searchParams.set('WIDTH', '101');
    url.searchParams.set('HEIGHT', '101');
    url.searchParams.set('SRS', 'EPSG:4326');
    url.searchParams.set('BBOX', bbox);
    return fetch(`/api/proxy?url=${encodeURIComponent(url.toString())}`)
      .then(r => r.text())
      .then(text => ({ label, text }))
      .catch(() => ({ label, text: '' }));
  });

  Promise.all(requests).then(results => {
    const filtered = results.filter(r => r.text && r.text.trim().length > 10
      && !r.text.toLowerCase().includes('no features'));
    if (filtered.length === 0) {
      showPopup(x, y, '<em style="color:#888">Geen objecten gevonden op deze locatie.</em>');
    } else {
      const html = filtered.map(r => `
        <div class="popup-layer">
          <div class="popup-layer-title">${r.label}</div>
          <pre class="popup-text">${r.text.trim().slice(0, 800)}</pre>
        </div>
      `).join('');
      showPopup(x, y, html);
    }
  });
}

function showPopup(x, y, html) {
  closePopup();
  const container = document.getElementById('map-container');
  const rect = container.getBoundingClientRect();
  const left = Math.min(x, rect.width - 320);
  const top = Math.min(y, rect.height - 200);

  popupEl = document.createElement('div');
  popupEl.className = 'info-popup';
  popupEl.style.left = `${left}px`;
  popupEl.style.top = `${top}px`;
  popupEl.innerHTML = `
    <div class="popup-header">
      <span>Objectinformatie</span>
      <i class="fa fa-times popup-close" onclick="closePopup()"></i>
    </div>
    <div class="popup-body">${html}</div>
  `;
  container.appendChild(popupEl);
}

function closePopup() {
  if (popupEl) { popupEl.remove(); popupEl = null; }
}

// --- ZOOM CONTROLS ---
function zoomIn() {
  currentViewState = { ...currentViewState, zoom: currentViewState.zoom + 1 };
  deckInstance.setProps({ initialViewState: { ...currentViewState, transitionDuration: 300 } });
}
function zoomOut() {
  currentViewState = { ...currentViewState, zoom: currentViewState.zoom - 1 };
  deckInstance.setProps({ initialViewState: { ...currentViewState, transitionDuration: 300 } });
}
function resetView() {
  currentViewState = { ...CONFIG.initialView, transitionDuration: 800 };
  deckInstance.setProps({ initialViewState: currentViewState });
}
function toggleBasemap() {
  isSatellite = !isSatellite;
  const btn = document.getElementById('btn-basemap');
  btn.textContent = isSatellite ? 'Kaart' : 'Foto';
  btn.classList.toggle('active', isSatellite);
  rebuildDeck();
}

// --- TABS ---
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sidebar-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`${tab}-content`).classList.add('active');
}

// --- SCALE BAR ---
const SCALE_DISTANCES = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

function updateScaleBar(viewState) {
  const lat = viewState.latitude || 52;
  const zoom = viewState.zoom || 9;
  const metersPerPixel = (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);
  const maxBarWidth = 120;
  const maxDist = metersPerPixel * maxBarWidth;

  let dist = SCALE_DISTANCES.find(d => d <= maxDist) || SCALE_DISTANCES[0];
  const barWidth = dist / metersPerPixel;

  document.getElementById('scale-bar').style.width = `${barWidth}px`;
  document.getElementById('scale-text').textContent = dist >= 1000
    ? `${dist / 1000} km` : `${dist} m`;
}

// --- ADDRESS SEARCH ---
function initAddressSearch() {
  const input = document.getElementById('address-input');
  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => searchAddress(input.value.trim()), 300);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#address-search-container')) {
      document.getElementById('address-results').style.display = 'none';
    }
  });
}

async function searchAddress(query) {
  const results = document.getElementById('address-results');
  if (query.length < 2) { results.style.display = 'none'; return; }

  try {
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(query)}&fq=type:(gemeente%20OR%20woonplaats%20OR%20weg%20OR%20adres%20OR%20postcode)&fl=*&rows=6`;
    const res = await fetch(url);
    const data = await res.json();
    const docs = data?.response?.docs || [];

    if (docs.length === 0) { results.style.display = 'none'; return; }

    results.innerHTML = docs.map(d => `
      <div class="result-item" onclick="flyToAddress(${d.centroide_ll ? parseFloat(d.centroide_ll.replace('POINT(','').split(' ')[0]) : 4.48}, ${d.centroide_ll ? parseFloat(d.centroide_ll.replace('POINT(','').split(' ')[1].replace(')','')) : 51.9}, '${(d.weergavenaam || '').replace(/'/g, "\\'")}')">
        <i class="fa fa-map-marker-alt"></i>
        <span>${d.weergavenaam || ''}</span>
      </div>
    `).join('');
    results.style.display = 'block';
  } catch {
    results.style.display = 'none';
  }
}

function flyToAddress(lon, lat, name) {
  document.getElementById('address-input').value = name;
  document.getElementById('address-results').style.display = 'none';
  currentViewState = { longitude: lon, latitude: lat, zoom: 13, transitionDuration: 1000 };
  deckInstance.setProps({ initialViewState: currentViewState });
}

function activateSearch() {
  document.getElementById('address-search-container').style.display = 'block';
  document.getElementById('address-input').focus();
}

function closeAddressSearch() {
  document.getElementById('address-search-container').style.display = 'none';
  document.getElementById('address-input').value = '';
  document.getElementById('address-results').style.display = 'none';
}
