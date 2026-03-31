// gebiedsviewer/js/app.js

// --- STATE ---
let deckInstance = null;
let currentViewState = { ...CONFIG.initialView };
let isSatellite = false;
// key → { wmsUrl, mapServerUrl, layerId, label, serviceId, color, opacity, visible }
const activeLayers = new Map();
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
  theme.services.forEach(service => details.appendChild(createServiceEl(service)));
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
      if (e.target.checked) enableLayer(key, service, layer);
      else disableLayer(key);
    });
    layerList.appendChild(div);
  });

  details.appendChild(layerList);
  return details;
}

// --- SEARCH ---
function initSearch() {
  const input = document.getElementById('layer-search');
  input.addEventListener('input', e => {
    searchTerm = e.target.value.toLowerCase().trim();
    filterLayerTree();
  });
  document.getElementById('search-clear').addEventListener('click', () => {
    input.value = ''; searchTerm = ''; filterLayerTree();
  });
}

function filterLayerTree() {
  document.getElementById('search-clear').style.display = searchTerm ? 'block' : 'none';
  document.querySelectorAll('.theme-group').forEach(themeEl => {
    let themeVisible = false;
    themeEl.querySelectorAll('.service-group').forEach(serviceEl => {
      let serviceVisible = false;
      const summaryText = serviceEl.querySelector('.service-summary span:last-child').textContent.toLowerCase();
      serviceEl.querySelectorAll('.layer-item').forEach(layerEl => {
        const match = !searchTerm || layerEl.dataset.label.includes(searchTerm) || summaryText.includes(searchTerm);
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
function getThemeColor(serviceId) {
  const theme = CATALOG.find(t => t.services.some(s => s.id === serviceId));
  return theme ? theme.color : '#007ac2';
}

function enableLayer(key, service, layer) {
  const mapServerUrl = service.wmsUrl.replace(/\/WMSServer$/, '');
  activeLayers.set(key, {
    wmsUrl: service.wmsUrl,
    mapServerUrl,
    layerId: layer.id,
    label: layer.label,
    serviceId: service.id,
    color: getThemeColor(service.id),
    opacity: 0.9,
    visible: true,
  });
  rebuildDeck();
  updateLegend();
  updateBadges();
  renderLayerPanel();
}

function disableLayer(key) {
  activeLayers.delete(key);
  rebuildDeck();
  updateLegend();
  updateBadges();
  renderLayerPanel();
}

function removeLayer(key) {
  const cb = document.querySelector(`input[data-key="${key}"]`);
  if (cb) cb.checked = false;
  disableLayer(key);
}

function setLayerOpacity(key, value) {
  const entry = activeLayers.get(key);
  if (!entry) return;
  entry.opacity = parseFloat(value);
  const label = document.querySelector(`#layer-card-${CSS.escape(key)} .opacity-val`);
  if (label) label.textContent = `${Math.round(entry.opacity * 100)}%`;
  rebuildDeck();
}

function toggleLayerVisible(key) {
  const entry = activeLayers.get(key);
  if (!entry) return;
  entry.visible = !entry.visible;
  const btn = document.querySelector(`#layer-card-${CSS.escape(key)} .btn-eye`);
  if (btn) {
    btn.classList.toggle('fa-eye', entry.visible);
    btn.classList.toggle('fa-eye-slash', !entry.visible);
  }
  rebuildDeck();
}

function moveLayerUp(key) {
  const entries = [...activeLayers.entries()];
  const idx = entries.findIndex(([k]) => k === key);
  if (idx <= 0) return;
  [entries[idx - 1], entries[idx]] = [entries[idx], entries[idx - 1]];
  activeLayers.clear();
  entries.forEach(([k, v]) => activeLayers.set(k, v));
  rebuildDeck(); renderLayerPanel();
}

function moveLayerDown(key) {
  const entries = [...activeLayers.entries()];
  const idx = entries.findIndex(([k]) => k === key);
  if (idx < 0 || idx >= entries.length - 1) return;
  [entries[idx], entries[idx + 1]] = [entries[idx + 1], entries[idx]];
  activeLayers.clear();
  entries.forEach(([k, v]) => activeLayers.set(k, v));
  rebuildDeck(); renderLayerPanel();
}

function updateBadges() {
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

// --- ACTIVE LAYERS PANEL ---
function renderLayerPanel() {
  const panel = document.getElementById('active-layers-panel');
  const list = document.getElementById('active-layers-list');

  if (activeLayers.size === 0) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  list.innerHTML = '';

  const entries = [...activeLayers.entries()];
  entries.forEach(([key, entry], idx) => {
    const pct = Math.round(entry.opacity * 100);
    const eyeIcon = entry.visible ? 'fa-eye' : 'fa-eye-slash';

    const statusHtml = `<span class="lc-status lc-count" style="color:${entry.color}"><i class="fa fa-circle" style="font-size:7px"></i></span>`;

    const card = document.createElement('div');
    card.className = 'layer-card';
    card.id = `layer-card-${CSS.escape(key)}`;
    card.innerHTML = `
      <div class="layer-card-header">
        <div class="layer-card-order">
          <i class="fa fa-chevron-up lc-btn${idx === 0 ? ' lc-disabled' : ''}" onclick="moveLayerUp('${key}')"></i>
          <i class="fa fa-chevron-down lc-btn${idx === entries.length - 1 ? ' lc-disabled' : ''}" onclick="moveLayerDown('${key}')"></i>
        </div>
        <span class="layer-card-dot" style="background:${entry.color}"></span>
        <span class="layer-card-name" title="${entry.label}">${entry.label}</span>
        <div class="layer-card-actions">
          ${statusHtml}
          <i class="fa ${eyeIcon} lc-btn btn-eye" onclick="toggleLayerVisible('${key}')"></i>
          <i class="fa fa-times lc-btn lc-remove" onclick="removeLayer('${key}')"></i>
        </div>
      </div>
      <div class="layer-card-opacity">
        <i class="fa fa-adjust" style="color:#bbb;font-size:10px;flex-shrink:0"></i>
        <input type="range" class="opacity-slider" min="0" max="100" value="${pct}"
               oninput="setLayerOpacity('${key}', this.value/100)">
        <span class="opacity-val">${pct}%</span>
      </div>
    `;
    list.appendChild(card);
  });
}

// --- LEGEND ---
function updateLegend() {
  const container = document.getElementById('legend-items');
  container.innerHTML = '';

  if (activeLayers.size === 0) {
    container.innerHTML = '<p class="legend-empty">Geen actieve kaartlagen.<br>Kies lagen via het tabblad "Kaartlagen".</p>';
    return;
  }

  activeLayers.forEach(({ mapServerUrl, layerId, label }) => {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(`${mapServerUrl}/legend?f=pjson`)}`;
    const div = document.createElement('div');
    div.className = 'legend-item';
    div.innerHTML = `<div class="legend-layer-name">${label}</div><div class="legend-body"><span class="legend-loading">Laden...</span></div>`;
    container.appendChild(div);

    fetch(proxyUrl).then(r => r.json()).then(data => {
      const layerEntry = (data.layers || []).find(l => String(l.layerId) === String(layerId));
      const body = div.querySelector('.legend-body');
      if (!layerEntry?.legend?.length) { body.innerHTML = ''; return; }
      body.innerHTML = layerEntry.legend.map(item => `
        <div class="legend-row">
          <img src="data:${item.contentType};base64,${item.imageData}" width="${item.width}" height="${item.height}">
          <span>${item.label || ''}</span>
        </div>
      `).join('');
    }).catch(() => { div.querySelector('.legend-body').innerHTML = ''; });
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
  const tileLayers = [...activeLayers.entries()].map(([key, entry]) =>
    createWMSLayer({
      id: key,
      url: entry.wmsUrl,
      layer: entry.layerId,
      title: entry.label,
      opacity: entry.visible ? entry.opacity : 0,
    })
  );
  deckInstance.setProps({ layers: [basemap, ...tileLayers] });
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
    pickable: false,
  });
}

// --- CLICK / IDENTIFY ---
const SKIP_FIELDS = new Set([
  'OBJECTID', 'Shape', 'Shape.STArea()', 'Shape.STLength()',
  'Shape_Length', 'Shape_Area', 'FID', 'GlobalID',
]);

function handleMapClick({ coordinate, x, y }) {
  if (!coordinate || activeLayers.size === 0) { closePopup(); return; }

  const visibleLayers = [...activeLayers.values()].filter(e => e.visible);
  if (!visibleLayers.length) { closePopup(); return; }

  const [lon, lat] = coordinate;
  showPopup(x, y, '<span class="popup-loading"><i class="fa fa-circle-notch fa-spin"></i> Laden...</span>');

  const R = 6378137;
  const mx = lon * Math.PI / 180 * R;
  const my = Math.log(Math.tan((90 + lat) * Math.PI / 360)) * R;
  const delta = 300;
  const mapExtent = `${mx - delta},${my - delta},${mx + delta},${my + delta}`;

  const requests = visibleLayers.map(entry => {
    const url = new URL(`${entry.mapServerUrl}/identify`);
    url.searchParams.set('geometry', `${mx},${my}`);
    url.searchParams.set('geometryType', 'esriGeometryPoint');
    url.searchParams.set('sr', '3857');
    url.searchParams.set('layers', `top:${entry.layerId}`);
    url.searchParams.set('tolerance', '8');
    url.searchParams.set('mapExtent', mapExtent);
    url.searchParams.set('imageDisplay', '256,256,96');
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('f', 'json');
    return fetch(`/api/proxy?url=${encodeURIComponent(url.toString())}`)
      .then(r => r.json())
      .then(data => ({
        label: entry.label,
        results: (data.results || []).map(r =>
          Object.fromEntries(
            Object.entries(r.attributes || {}).filter(([k]) => !SKIP_FIELDS.has(k))
          )
        ),
      }))
      .catch(() => ({ label: entry.label, results: [] }));
  });

  Promise.all(requests).then(responses => {
    const found = responses.filter(r => r.results.length > 0);
    if (!found.length) {
      showPopup(x, y, '<em class="popup-empty">Geen objecten gevonden op deze locatie.</em>');
      return;
    }

    const html = found.map(({ label, results }) => {
      const attrs = results[0];
      const rows = Object.entries(attrs)
        .filter(([, v]) => v !== null && v !== '' && v !== undefined)
        .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`)
        .join('');
      const more = results.length > 1
        ? `<p class="popup-more">+${results.length - 1} meer object${results.length > 2 ? 'en' : ''}</p>` : '';
      return `
        <div class="popup-layer">
          <div class="popup-layer-title">${label}</div>
          <table class="attr-table"><tbody>${rows}</tbody></table>
          ${more}
        </div>`;
    }).join('');

    showPopup(x, y, html);
  });
}

function showPopup(x, y, html) {
  closePopup();
  const container = document.getElementById('map-container');
  const rect = container.getBoundingClientRect();
  const left = Math.min(x + 12, rect.width - 340);
  const top = Math.min(y + 12, rect.height - 260);

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

// --- ZOOM / BASEMAP ---
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

// --- EXPORT CSV ---
function exportCatalogCSV() {
  const header = ['Thema', 'Service', 'Laag', 'GeoJSON URL'];
  const rows = [header];

  CATALOG.forEach(theme => {
    theme.services.forEach(service => {
      const mapServerUrl = service.wmsUrl.replace(/\/WMSServer$/, '');
      service.layers.forEach(layer => {
        const params = new URLSearchParams({
          where: '1=1',
          outFields: '*',
          returnGeometry: 'true',
          outSR: '4326',
          f: 'geojson',
        });
        const url = `${mapServerUrl}/${layer.id}/query?${params}`;
        rows.push([theme.label, service.label, layer.label, url]);
      });
    });
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'zuidholland-geojson-catalogus.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- SCALE BAR ---
const SCALE_DISTANCES = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

function updateScaleBar(viewState) {
  const lat = viewState.latitude || 52;
  const zoom = viewState.zoom || 9;
  const metersPerPixel = (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);
  const maxBarWidth = 120;
  const maxDist = metersPerPixel * maxBarWidth;
  const dist = SCALE_DISTANCES.find(d => d <= maxDist) || SCALE_DISTANCES[0];
  document.getElementById('scale-bar').style.width = `${dist / metersPerPixel}px`;
  document.getElementById('scale-text').textContent = dist >= 1000 ? `${dist / 1000} km` : `${dist} m`;
}

// --- ADDRESS SEARCH ---
function initAddressSearch() {
  const input = document.getElementById('address-input');
  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => searchAddress(input.value.trim()), 300); });
  document.addEventListener('click', e => {
    if (!e.target.closest('#address-search-container'))
      document.getElementById('address-results').style.display = 'none';
  });
}

async function searchAddress(query) {
  const results = document.getElementById('address-results');
  if (query.length < 2) { results.style.display = 'none'; return; }
  try {
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(query)}&fq=type:(gemeente%20OR%20woonplaats%20OR%20weg%20OR%20adres%20OR%20postcode)&fl=*&rows=6`;
    const docs = (await (await fetch(url)).json())?.response?.docs || [];
    if (!docs.length) { results.style.display = 'none'; return; }
    results.innerHTML = docs.map(d => `
      <div class="result-item" onclick="flyToAddress(${d.centroide_ll ? parseFloat(d.centroide_ll.replace('POINT(','').split(' ')[0]) : 4.48}, ${d.centroide_ll ? parseFloat(d.centroide_ll.replace('POINT(','').split(' ')[1].replace(')','')) : 51.9}, '${(d.weergavenaam||'').replace(/'/g,"\\'")}')">
        <i class="fa fa-map-marker-alt"></i><span>${d.weergavenaam || ''}</span>
      </div>`).join('');
    results.style.display = 'block';
  } catch { results.style.display = 'none'; }
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
