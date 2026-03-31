// gebiedsviewer/js/app.js

// --- BASEMAPS ---
const BASEMAPS = [
  { id: 'light',     label: 'Licht',   icon: 'fa-sun',            create: () => DeckGLUtils.createBasemap('light') },
  { id: 'voyager',   label: 'Straten', icon: 'fa-road',           create: () => DeckGLUtils.createBasemap('voyager') },
  { id: 'dark',      label: 'Donker',  icon: 'fa-moon',           create: () => DeckGLUtils.createBasemap('dark-matter') },
  { id: 'satellite', label: 'Foto',    icon: 'fa-satellite-dish', create: () => createSatelliteLayer() },
];

// --- MCA CONFIG ---
const MCA_CRITERIA = [
  { key: 'verzilting',       label: 'Verzilting',       color: [0, 150, 136],  weightKey: 'w_verzilting' },
  { key: 'bodemdaling',      label: 'Bodemdaling',      color: [239, 83, 80],  weightKey: 'w_bodemdaling' },
  { key: 'wateroverlast',    label: 'Wateroverlast',    color: [30, 136, 229], weightKey: 'w_wateroverlast' },
  { key: 'boerenlandvogels', label: 'Boerenlandvogels', color: [255, 179, 0],  weightKey: 'w_boerenlandvogels' },
  { key: 'peilgebieden',     label: 'Peilgebieden',     color: [142, 68, 173], weightKey: 'w_peilgebieden' },
];
const MCA_VIEW = { longitude: 4.70, latitude: 52.08, zoom: 10, pitch: 45, bearing: 0 };

// --- STATE ---
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
  view: '3d',   // '3d' or 'heatmap'
  weights: Object.fromEntries(MCA_CRITERIA.map(c => [c.weightKey, 2])),
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  parsePermalinkState();
  buildLayerTree();
  initDeck();
  initSearch();
  initAddressSearch();
  initBasemapPanel();
  initCatalogSearch();
  initMcaTab();
  setupFileDrop();
  enablePermalinkLayers();
  document.getElementById('loading').style.display = 'none';
});

// ═══════════════════════════════════════════════════════
// LAYER TREE
// ═══════════════════════════════════════════════════════

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
    const metaUrl = `https://opendata.Zuid-Holland.nl/geonetwork/srv/dut/catalog.search#/search?any=${encodeURIComponent(layer.label)}`;
    div.innerHTML = `
      <div class="layer-row">
        <label class="layer-label">
          <input type="checkbox" class="layer-checkbox" data-key="${key}">
          <span class="layer-name">${layer.label}</span>
        </label>
        <a href="${metaUrl}" target="_blank" class="layer-meta-link" title="Metadata in GeoNetwork">
          <i class="fa fa-circle-info"></i>
        </a>
      </div>
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

// ═══════════════════════════════════════════════════════
// SEARCH (LAYER TREE)
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// LAYER MANAGEMENT
// ═══════════════════════════════════════════════════════

function getThemeColor(serviceId) {
  const theme = CATALOG.find(t => t.services.some(s => s.id === serviceId));
  return theme ? theme.color : '#007ac2';
}

async function enableLayer(key, service, layer) {
  const mapServerUrl = service.wmsUrl.replace(/\/WMSServer$/, '');
  const entry = {
    wmsUrl: service.wmsUrl,
    mapServerUrl,
    layerId: layer.id,
    label: layer.label,
    serviceId: service.id,
    color: getThemeColor(service.id),
    opacity: 0.9,
    visible: true,
    minScale: 0,
  };
  activeLayers.set(key, entry);
  rebuildDeck();
  updateLegend();
  updateBadges();
  renderLayerPanel();
  updateLayerTreeActiveState();
  updatePermalink();

  try {
    const infoUrl = `/api/proxy?url=${encodeURIComponent(`${mapServerUrl}/${layer.id}?f=json`)}`;
    const data = await (await fetch(infoUrl)).json();
    if (data.minScale !== undefined) {
      entry.minScale = data.minScale;
      updateScaleDependency(currentViewState.zoom);
    }
  } catch (e) { /* minScale stays 0 */ }
}

function disableLayer(key) {
  activeLayers.delete(key);
  rebuildDeck();
  updateLegend();
  updateBadges();
  renderLayerPanel();
  updateLayerTreeActiveState();
  updatePermalink();
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

function updateLayerTreeActiveState() {
  document.querySelectorAll('.layer-item').forEach(el => {
    el.classList.toggle('layer-item--active', activeLayers.has(el.dataset.key));
  });
}

// ═══════════════════════════════════════════════════════
// SCALE-DEPENDENT VISIBILITY
// ═══════════════════════════════════════════════════════

function updateScaleDependency(zoom) {
  const lat = currentViewState.latitude || 52;
  const metersPerPixel = (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);
  const scaleDenom = metersPerPixel / 0.000264583;

  activeLayers.forEach((entry, key) => {
    const outOfScale = entry.minScale > 0 && scaleDenom > entry.minScale;
    const card = document.getElementById(`layer-card-${CSS.escape(key)}`);
    if (card) card.classList.toggle('layer-card--outofscale', outOfScale);
    const treeItem = document.querySelector(`.layer-item[data-key="${key}"]`);
    if (treeItem) treeItem.classList.toggle('layer-item--outofscale', outOfScale);
  });
}

// ═══════════════════════════════════════════════════════
// ZOOM TO LAYER
// ═══════════════════════════════════════════════════════

async function zoomToLayer(key) {
  const entry = activeLayers.get(key);
  if (!entry || !entry.mapServerUrl) return;
  try {
    const qUrl = `${entry.mapServerUrl}/${entry.layerId}/query?where=1%3D1&returnExtentOnly=true&outSR=4326&f=json`;
    const data = await (await fetch(`/api/proxy?url=${encodeURIComponent(qUrl)}`)).json();
    const ext = data.extent;
    if (!ext || ext.xmin == null) return;
    const lon = (ext.xmin + ext.xmax) / 2;
    const lat = (ext.ymin + ext.ymax) / 2;
    const maxDelta = Math.max(ext.xmax - ext.xmin, ext.ymax - ext.ymin);
    const zoom = Math.max(6, Math.min(15, Math.log2(360 / maxDelta) - 0.5));
    currentViewState = { longitude: lon, latitude: lat, zoom, transitionDuration: 800 };
    deckInstance.setProps({ initialViewState: currentViewState });
  } catch (e) { console.warn('zoomToLayer failed', e); }
}

// ═══════════════════════════════════════════════════════
// ACTIVE LAYERS PANEL
// ═══════════════════════════════════════════════════════

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
    const metaUrl = `https://opendata.Zuid-Holland.nl/geonetwork/srv/dut/catalog.search#/search?any=${encodeURIComponent(entry.label)}`;

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
          ${!entry.isGeoJson ? `<i class="fa fa-crosshairs lc-btn" onclick="zoomToLayer('${key}')" title="Zoom naar laag"></i>` : ''}
          ${!entry.isGeoJson ? `<i class="fa fa-table lc-btn" onclick="openTableView('${key}')" title="Bekijk attributentabel"></i>` : ''}
          <a href="${metaUrl}" target="_blank" class="lc-btn lc-meta" title="Metadata in GeoNetwork"><i class="fa fa-circle-info"></i></a>
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

  updateScaleDependency(currentViewState.zoom);
}

// ═══════════════════════════════════════════════════════
// LEGEND
// ═══════════════════════════════════════════════════════

function updateLegend() {
  const container = document.getElementById('legend-items');
  container.innerHTML = '';

  if (activeLayers.size === 0) {
    container.innerHTML = '<p class="legend-empty">Geen actieve kaartlagen.<br>Kies lagen via het tabblad "Kaartlagen".</p>';
    return;
  }

  activeLayers.forEach(({ mapServerUrl, layerId, label, isGeoJson, color }) => {
    const div = document.createElement('div');
    div.className = 'legend-item';

    if (isGeoJson) {
      div.innerHTML = `
        <div class="legend-layer-name">${label}</div>
        <div class="legend-body">
          <div class="legend-row">
            <span style="display:inline-block;width:16px;height:16px;background:${color};border-radius:3px;flex-shrink:0"></span>
            <span>GeoJSON laag</span>
          </div>
        </div>`;
      container.appendChild(div);
      return;
    }

    const proxyUrl = `/api/proxy?url=${encodeURIComponent(`${mapServerUrl}/legend?f=pjson`)}`;
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

// ═══════════════════════════════════════════════════════
// DECK.GL
// ═══════════════════════════════════════════════════════

function initDeck() {
  deckInstance = new deck.Deck({
    canvas: 'deck-canvas',
    initialViewState: currentViewState,
    controller: true,
    layers: [DeckGLUtils.createBasemap('light')],

    onViewStateChange: ({ viewState }) => {
      currentViewState = viewState;
      updateScaleBar(viewState);
      updateScaleDependency(viewState.zoom);
      updatePermalink();
    },

    onHover: ({ coordinate }) => {
      if (!coordinate) return;
      const [lon, lat] = coordinate;
      document.getElementById('coords-widget').textContent =
        `${lat.toFixed(5)}°N  |  ${lon.toFixed(5)}°E`;
    },

    onClick: handleMapClick,

    getTooltip: ({ object, layer }) => {
      if (!object || !layer?.id?.startsWith('mca-stack')) return null;
      let total = 0;
      const lines = MCA_CRITERIA.map(c => {
        const score = (Number(object[c.key]) || 0) * (mcaState.weights[c.weightKey] || 0);
        total += score;
        return score > 0
          ? `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
               <span style="width:8px;height:8px;border-radius:50%;background:rgb(${c.color.join(',')});flex-shrink:0"></span>
               <span style="flex:1;color:#555">${c.label}</span>
               <b style="color:#333">${score}</b>
             </div>`
          : '';
      }).join('');
      return {
        html: `<div style="background:white;border-radius:5px;box-shadow:0 2px 10px rgba(0,0,0,0.2);overflow:hidden;min-width:180px">
          <div style="background:#007ac2;color:white;padding:6px 10px;font-size:11px;font-weight:700">MCA Score: ${total}</div>
          <div style="padding:8px 10px;font-size:11px">${lines || '<em style="color:#aaa">Score: 0</em>'}</div>
        </div>`,
        style: { padding: '0', background: 'transparent', boxShadow: 'none' },
      };
    },
  });

  updateScaleBar(currentViewState);
}

function rebuildDeck() {
  if (!deckInstance) return;
  const bm = BASEMAPS.find(b => b.id === currentBasemap) || BASEMAPS[0];
  const basemap = bm.create();

  const layers = [...activeLayers.entries()].map(([key, entry]) => {
    if (entry.isGeoJson && entry.geojsonData) {
      return new deck.GeoJsonLayer({
        id: key,
        data: entry.geojsonData,
        opacity: entry.visible ? entry.opacity : 0,
        pickable: true,
        stroked: true,
        filled: true,
        lineWidthMinPixels: 1,
        getFillColor: [230, 126, 34, 100],
        getLineColor: [230, 126, 34, 220],
        getLineWidth: 2,
        getPointRadius: 6,
        pointRadiusMinPixels: 4,
      });
    }
    return createWMSLayer({
      id: key,
      url: entry.wmsUrl,
      layer: entry.layerId,
      title: entry.label,
      opacity: entry.visible ? entry.opacity : 0,
    });
  });

  deckInstance.setProps({ layers: [basemap, ...layers, ...buildMcaLayers()] });
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

// ═══════════════════════════════════════════════════════
// BASEMAP SELECTOR
// ═══════════════════════════════════════════════════════

function initBasemapPanel() {
  const panel = document.createElement('div');
  panel.id = 'basemap-panel';
  panel.className = 'basemap-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="basemap-panel-title">Achtergrondkaart</div>
    ${BASEMAPS.map(b => `
      <div class="basemap-option${b.id === currentBasemap ? ' active' : ''}" onclick="setBasemap('${b.id}')" data-bm="${b.id}">
        <i class="fa ${b.icon}"></i>
        <span>${b.label}</span>
      </div>
    `).join('')}
  `;
  document.body.appendChild(panel);

  document.addEventListener('click', e => {
    if (!e.target.closest('#btn-basemap') && !e.target.closest('#basemap-panel')) {
      panel.style.display = 'none';
    }
  });
}

function toggleBasemapPanel() {
  const panel = document.getElementById('basemap-panel');
  if (panel.style.display === 'none') {
    const btn = document.getElementById('btn-basemap');
    const rect = btn.getBoundingClientRect();
    panel.style.top = `${rect.top}px`;
    panel.style.left = `${rect.right + 6}px`;
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}

function setBasemap(id) {
  currentBasemap = id;
  document.querySelectorAll('.basemap-option').forEach(el => {
    el.classList.toggle('active', el.dataset.bm === id);
  });
  const panel = document.getElementById('basemap-panel');
  if (panel) panel.style.display = 'none';
  rebuildDeck();
}

// ═══════════════════════════════════════════════════════
// CLICK / IDENTIFY
// ═══════════════════════════════════════════════════════

const SKIP_FIELDS = new Set([
  'OBJECTID', 'Shape', 'Shape.STArea()', 'Shape.STLength()',
  'Shape_Length', 'Shape_Area', 'FID', 'GlobalID',
]);

function handleMapClick({ coordinate, x, y }) {
  if (!coordinate || activeLayers.size === 0) { closePopup(); return; }
  const visibleLayers = [...activeLayers.values()].filter(e => e.visible && !e.isGeoJson);
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

// ═══════════════════════════════════════════════════════
// PRINT MAP
// ═══════════════════════════════════════════════════════

function printMap() {
  // Force a synchronous redraw so the WebGL backbuffer is populated
  // (without preserveDrawingBuffer we capture right after render to avoid it being cleared)
  if (deckInstance && deckInstance.redraw) deckInstance.redraw(true);

  const canvas = document.getElementById('deck-canvas');
  let imgData;
  try {
    imgData = canvas.toDataURL('image/png');
  } catch (e) {
    alert('Canvas kon niet worden geëxporteerd. Zorg dat de kaart volledig geladen is.');
    return;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' });
  const { zoom, latitude, longitude } = currentViewState;

  const legendItems = [...activeLayers.values()].map(entry =>
    `<div class="pl-item"><span class="pl-dot" style="background:${entry.color}"></span><span>${entry.label}</span></div>`
  ).join('') || '<em style="color:#aaa;font-size:11px">Geen actieve lagen</em>';

  const basemapLabel = BASEMAPS.find(b => b.id === currentBasemap)?.label || currentBasemap;

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>Kaartexport – Zuid-Holland Gebiedsviewer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Avenir, sans-serif; background: white; display: flex; height: 100vh; }
    .map-area { flex: 1; overflow: hidden; background: #ddd; }
    .map-area img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .panel { width: 210px; min-width: 210px; background: white; border-left: 2px solid #e0e0e0;
             display: flex; flex-direction: column; padding: 18px 14px; overflow: hidden; }
    .brand { font-size: 15px; font-weight: 700; line-height: 1.3; color: #333; }
    .brand-sub { font-size: 10px; color: #aaa; margin-top: 2px; }
    .print-btn { margin: 6px 0; padding: 9px; background: #007ac2; color: white; border: none;
                 border-radius: 5px; font-size: 12px; font-weight: 600; cursor: pointer; width: 100%; }
    .print-btn:hover { background: #005f99; }
    .back-btn { margin: 6px 0; padding: 9px; background: white; color: #555; border: 1px solid #ccc;
                border-radius: 5px; font-size: 12px; font-weight: 600; cursor: pointer; width: 100%; }
    .back-btn:hover { background: #f5f5f5; }
    h3 { font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; color: #999;
         font-weight: 700; margin: 14px 0 5px; border-top: 1px solid #f0f0f0; padding-top: 10px; }
    .pl-item { display: flex; align-items: center; gap: 7px; font-size: 11px; color: #333;
               margin-bottom: 5px; line-height: 1.3; }
    .pl-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
    .meta { font-size: 10px; color: #bbb; margin-top: auto; padding-top: 12px; line-height: 1.7;
            border-top: 1px solid #f0f0f0; }
    .pzh-stripe { height: 4px; background: #E3001B; margin: 0 0 14px; border-radius: 2px; }
    @media print {
      @page { margin: 0; size: A4 landscape; }
      .print-btn, .back-btn { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="map-area">
    <img src="${imgData}" alt="Kaartexport Zuid-Holland Gebiedsviewer">
  </div>
  <div class="panel">
    <div class="pzh-stripe"></div>
    <div class="brand">Zuid-Holland<br>Gebiedsviewer</div>
    <div class="brand-sub">Maps That Matter</div>
    <button class="print-btn" onclick="window.print()">&#128438; Afdrukken / Opslaan als PDF</button>
    <button class="back-btn" onclick="window.close()">&#8592; Terug naar viewer</button>
    <h3>Actieve lagen</h3>
    ${legendItems}
    <h3>Kaartpositie</h3>
    <div class="pl-item">Zoom: ${zoom.toFixed(1)}</div>
    <div class="pl-item">Lat: ${latitude.toFixed(4)}°N</div>
    <div class="pl-item">Lon: ${longitude.toFixed(4)}°E</div>
    <div class="pl-item">Achtergrond: ${basemapLabel}</div>
    <div class="meta">Gegenereerd op ${dateStr}<br>© Provincie Zuid-Holland<br>Bron: geoservices.Zuid-Holland.nl</div>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

// ═══════════════════════════════════════════════════════
// ATTRIBUTE TABLE VIEW
// ═══════════════════════════════════════════════════════

let _tableState = { key: null, offset: 0, pageSize: 100, hasMore: false, fields: [] };
let _tableData = [];

async function openTableView(key) {
  const entry = activeLayers.get(key);
  if (!entry || !entry.mapServerUrl) return;
  _tableState = { key, offset: 0, pageSize: 100, hasMore: false, fields: [] };
  _tableData = [];

  document.getElementById('table-panel-title').textContent = entry.label;
  document.getElementById('table-panel').style.display = 'flex';
  document.getElementById('table-content').innerHTML =
    '<div class="table-loading"><i class="fa fa-circle-notch fa-spin"></i> Laden...</div>';
  document.getElementById('table-count-info').textContent = '';
  document.getElementById('table-prev').disabled = true;
  document.getElementById('table-next').disabled = true;

  await _loadTablePage(entry, 0);
}

async function _loadTablePage(entry, offset) {
  const url = `${entry.mapServerUrl}/${entry.layerId}/query?where=1%3D1&outFields=*&resultOffset=${offset}&resultRecordCount=${_tableState.pageSize}&returnGeometry=false&f=json`;
  try {
    const data = await (await fetch(`/api/proxy?url=${encodeURIComponent(url)}`)).json();
    _tableState.hasMore = !!data.exceededTransferLimit;
    _tableState.offset = offset;
    _tableData = data.features || [];

    if (!_tableData.length) {
      document.getElementById('table-content').innerHTML =
        '<div class="table-loading">Geen data gevonden voor deze laag.</div>';
      document.getElementById('table-count-info').textContent = '0 rijen';
      return;
    }

    const allKeys = Object.keys(_tableData[0].attributes || {}).filter(k => !SKIP_FIELDS.has(k));
    _tableState.fields = allKeys;

    const headerHtml = `<tr>${allKeys.map(k => `<th>${k}</th>`).join('')}</tr>`;
    const rowsHtml = _tableData.map(f => {
      const a = f.attributes || {};
      return `<tr>${allKeys.map(k => `<td>${a[k] ?? ''}</td>`).join('')}</tr>`;
    }).join('');

    document.getElementById('table-content').innerHTML = `
      <table class="attr-data-table">
        <thead>${headerHtml}</thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;

    const pageNum = Math.floor(offset / _tableState.pageSize) + 1;
    document.getElementById('table-page-info').textContent = `Pagina ${pageNum}`;
    document.getElementById('table-count-info').textContent = `${_tableData.length} rijen${_tableState.hasMore ? ' (meer beschikbaar)' : ''}`;
    document.getElementById('table-prev').disabled = offset === 0;
    document.getElementById('table-next').disabled = !_tableState.hasMore;

  } catch (e) {
    document.getElementById('table-content').innerHTML =
      '<div class="table-loading">Fout bij laden van attributen.</div>';
  }
}

async function tablePrevPage() {
  const entry = activeLayers.get(_tableState.key);
  if (!entry || _tableState.offset === 0) return;
  await _loadTablePage(entry, Math.max(0, _tableState.offset - _tableState.pageSize));
}

async function tableNextPage() {
  const entry = activeLayers.get(_tableState.key);
  if (!entry || !_tableState.hasMore) return;
  await _loadTablePage(entry, _tableState.offset + _tableState.pageSize);
}

function closeTableView() {
  document.getElementById('table-panel').style.display = 'none';
  _tableData = [];
}

function exportTableCSV() {
  if (!_tableData.length || !_tableState.fields.length) return;
  const rows = [
    _tableState.fields,
    ..._tableData.map(f => _tableState.fields.map(k => String(f.attributes?.[k] ?? ''))),
  ];
  const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${activeLayers.get(_tableState.key)?.label || 'export'}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ═══════════════════════════════════════════════════════
// ADD CUSTOM LAYER (URL + FILE)
// ═══════════════════════════════════════════════════════

function showAddLayerModal() {
  document.getElementById('add-layer-modal').style.display = 'flex';
  document.getElementById('add-layer-url').value = '';
  document.getElementById('add-layer-status').innerHTML = '';
  document.getElementById('file-status').innerHTML = '';
  switchModalTab('url');
}

function closeAddLayerModal() {
  document.getElementById('add-layer-modal').style.display = 'none';
}

function modalOverlayClick(e) {
  if (e.target === document.getElementById('add-layer-modal')) closeAddLayerModal();
}

function switchModalTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.mtab === tab));
  document.getElementById('modal-url-tab').style.display = tab === 'url' ? 'block' : 'none';
  document.getElementById('modal-file-tab').style.display = tab === 'file' ? 'block' : 'none';
}

async function addLayerFromUrl() {
  const input = document.getElementById('add-layer-url').value.trim();
  const status = document.getElementById('add-layer-status');
  if (!input) return;

  status.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i> Detecteren...';

  try {
    let rawUrl = input.replace(/\/$/, '');

    // Strip query string for type detection
    const urlWithoutQuery = rawUrl.split('?')[0];

    if (urlWithoutQuery.includes('/MapServer')) {
      // Normalize to get the MapServer base URL and optional layer ID
      const layerMatch = urlWithoutQuery.match(/\/MapServer\/(\d+)$/);
      const layerId = layerMatch ? parseInt(layerMatch[1]) : null;
      const mapServerUrl = layerMatch
        ? urlWithoutQuery.replace(/\/\d+$/, '')
        : urlWithoutQuery.replace(/\/MapServer.*$/, '/MapServer');

      // Fetch service metadata
      const infoUrl = `/api/proxy?url=${encodeURIComponent(`${mapServerUrl}?f=json`)}`;
      const info = await (await fetch(infoUrl)).json();
      if (!info.layers?.length) throw new Error('Geen geldige ArcGIS MapServer gevonden op dit adres');

      // Show layer picker if multiple layers and none specified
      if (layerId === null && info.layers.length > 1) {
        status.innerHTML = info.layers.map(l =>
          `<button class="modal-layer-pick-btn" onclick="addCustomMapServerLayer('${mapServerUrl}', ${l.id}, '${l.name.replace(/'/g, "\\'")}')">
             <i class="fa fa-plus"></i> ${l.name} (layer ${l.id})
           </button>`
        ).join('');
        return;
      }

      const targetId = layerId ?? info.layers[0].id;
      const targetName = info.layers.find(l => l.id === targetId)?.name || `Layer ${targetId}`;
      addCustomMapServerLayer(mapServerUrl, targetId, targetName);
      closeAddLayerModal();
      status.innerHTML = '';

    } else {
      status.innerHTML = `<span class="status-error">Gebruik een ArcGIS MapServer URL (eindigend op /MapServer of /MapServer/0)</span>`;
    }
  } catch (e) {
    status.innerHTML = `<span class="status-error">Fout: ${e.message}</span>`;
  }
}

function addCustomMapServerLayer(mapServerUrl, layerId, layerName) {
  const key = `custom::${++_customLayerCount}`;
  activeLayers.set(key, {
    wmsUrl: `${mapServerUrl}/WMSServer`,
    mapServerUrl,
    layerId,
    label: layerName,
    serviceId: key,
    color: '#e67e22',
    opacity: 0.9,
    visible: true,
    minScale: 0,
    isCustom: true,
  });
  rebuildDeck();
  renderLayerPanel();
  updateLegend();
  updatePermalink();
  closeAddLayerModal();
  switchTab('layers');
}

function setupFileDrop() {
  const zone = document.getElementById('file-drop-zone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) handleFile(file);
}

function handleFile(file) {
  const status = document.getElementById('file-status');
  status.innerHTML = '<i class="fa fa-circle-notch fa-spin"></i> Verwerken...';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const geojson = JSON.parse(e.target.result);
      if (geojson.type !== 'FeatureCollection' && geojson.type !== 'Feature' && !geojson.features) {
        throw new Error('Geen geldig GeoJSON bestand');
      }
      const data = geojson.type === 'FeatureCollection' ? geojson : { type: 'FeatureCollection', features: [geojson] };
      addGeoJsonLayer(file.name.replace(/\.[^.]+$/, ''), data);
      closeAddLayerModal();
      status.innerHTML = '';
    } catch (err) {
      status.innerHTML = `<span class="status-error">Fout: ${err.message}</span>`;
    }
  };
  reader.readAsText(file);
}

function addGeoJsonLayer(name, geojson) {
  const key = `custom::${++_customLayerCount}`;
  activeLayers.set(key, {
    wmsUrl: null,
    mapServerUrl: null,
    layerId: null,
    label: name,
    serviceId: key,
    color: '#e67e22',
    opacity: 0.85,
    visible: true,
    minScale: 0,
    isCustom: true,
    isGeoJson: true,
    geojsonData: geojson,
  });
  rebuildDeck();
  renderLayerPanel();
  updateLegend();
  updatePermalink();
  switchTab('layers');
}

// ═══════════════════════════════════════════════════════
// MULTI-CRITERIA ANALYSIS
// ═══════════════════════════════════════════════════════

function initMcaTab() {
  const container = document.getElementById('mca-sliders');
  if (!container) return;

  MCA_CRITERIA.forEach(c => {
    const w = mcaState.weights[c.weightKey];
    const row = document.createElement('div');
    row.className = 'mca-slider-row';
    row.innerHTML = `
      <div class="mca-slider-label">
        <span class="mca-dot" style="background:rgb(${c.color.join(',')})"></span>
        <span>${c.label}</span>
      </div>
      <div class="mca-slider-track">
        <input type="range" min="0" max="10" step="1" value="${w}"
               class="mca-slider" data-key="${c.weightKey}"
               oninput="onMcaSlider(this)">
        <span class="mca-slider-val" id="mca-val-${c.weightKey}">${w}</span>
      </div>
    `;
    container.appendChild(row);
  });

  _renderMcaLegend();
}

function onMcaSlider(el) {
  mcaState.weights[el.dataset.key] = Number(el.value);
  document.getElementById(`mca-val-${el.dataset.key}`).textContent = el.value;
  if (mcaState.active && mcaState.data) rebuildDeck();
}

function setMcaView(view) {
  mcaState.view = view;
  document.getElementById('mca-btn-3d').classList.toggle('active', view === '3d');
  document.getElementById('mca-btn-heatmap').classList.toggle('active', view === 'heatmap');
  // Heatmap works better flat; 3D needs pitch
  const pitch = view === '3d' ? 45 : 0;
  currentViewState = { ...currentViewState, pitch, transitionDuration: 500 };
  deckInstance.setProps({ initialViewState: currentViewState });
  if (mcaState.data) rebuildDeck();
}

async function loadMcaData() {
  if (mcaState.data) {
    // Already loaded — just show controls and rebuild
    document.getElementById('mca-loading').style.display = 'none';
    document.getElementById('mca-controls').style.display = 'block';
    rebuildDeck();
    return;
  }

  document.getElementById('mca-loading').style.display = 'block';
  document.getElementById('mca-controls').style.display = 'none';

  try {
    const res = await fetch('/data/h3_binary_matrix.csv');
    const text = await res.text();
    const result = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
    mcaState.data = result.data;
    document.getElementById('mca-loading').style.display = 'none';
    document.getElementById('mca-controls').style.display = 'block';
    rebuildDeck();
  } catch (e) {
    document.getElementById('mca-loading').innerHTML =
      '<span style="color:#c0392b"><i class="fa fa-triangle-exclamation"></i> Data kon niet worden geladen.</span>';
    console.error('MCA data load failed', e);
  }
}

function buildMcaLayers() {
  if (!mcaState.active || !mcaState.data) return [];

  const { data, weights, view } = mcaState;

  if (view === 'heatmap') {
    return [new deck.HeatmapLayer({
      id: 'mca-heatmap',
      data,
      getPosition: d => { const [lat, lng] = h3.h3ToGeo(d.h3); return [lng, lat]; },
      getWeight: d => MCA_CRITERIA.reduce((s, c) => s + (Number(d[c.key]) || 0) * (weights[c.weightKey] || 0), 0),
      radiusPixels: 40,
      intensity: 1.5,
      threshold: 0.1,
      aggregation: 'SUM',
      colorRange: [[65,182,196],[127,205,187],[199,233,180],[237,248,177],[253,187,132],[227,74,51]],
      updateTriggers: { getWeight: Object.values(weights) },
    })];
  }

  // 3D stacked bars — one H3HexagonLayer per criterion, stacked by cumulative elevation
  const stackLayers = MCA_CRITERIA.map((c, index) =>
    new deck.H3HexagonLayer({
      id: `mca-stack-${index}`,
      data,
      extruded: true,
      pickable: true,
      elevationScale: 150,
      getHexagon: d => d.h3,
      coverage: 0.9,
      getFillColor: d => {
        if ((weights[c.weightKey] || 0) === 0 || (Number(d[c.key]) || 0) === 0) return [0, 0, 0, 0];
        return [...c.color, 220];
      },
      getElevation: d => {
        let sum = 0;
        for (let i = 0; i <= index; i++) {
          const cr = MCA_CRITERIA[i];
          sum += (Number(d[cr.key]) || 0) * (weights[cr.weightKey] || 0);
        }
        return sum;
      },
      updateTriggers: {
        getFillColor: Object.values(weights),
        getElevation: Object.values(weights),
      },
      transitions: { getElevation: 600, getFillColor: 600 },
    })
  ).reverse(); // reverse so lowest layer renders on top for picking

  // Region boundary outline
  const allH3 = data.map(d => d.h3);
  const polygon = h3.h3SetToMultiPolygon(allH3, true);
  const boundaryLayer = new deck.GeoJsonLayer({
    id: 'mca-boundary',
    data: [{ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: polygon } }],
    stroked: true,
    filled: false,
    lineWidthMinPixels: 2,
    getLineColor: [80, 80, 80, 160],
  });

  return [...stackLayers, boundaryLayer];
}

function _renderMcaLegend() {
  const el = document.getElementById('mca-legend');
  if (!el) return;
  el.innerHTML = MCA_CRITERIA.map(c => `
    <div class="mca-legend-row">
      <span class="mca-dot" style="background:rgb(${c.color.join(',')})"></span>
      <span>${c.label}</span>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════
// GEONETWORK CATALOG SEARCH
// ═══════════════════════════════════════════════════════

let _catalogTimer = null;

function initCatalogSearch() {
  const input = document.getElementById('catalog-search-input');
  const clear = document.getElementById('catalog-search-clear');

  input.addEventListener('input', e => {
    const q = e.target.value.trim();
    clear.style.display = q ? 'block' : 'none';
    clearTimeout(_catalogTimer);
    if (q.length >= 2) {
      _catalogTimer = setTimeout(() => searchCatalog(q), 500);
    } else {
      document.getElementById('catalog-results').innerHTML =
        '<p class="legend-empty">Zoek naar kaartlagen in de provinciale catalogus van Zuid-Holland.</p>';
    }
  });

  clear.addEventListener('click', () => {
    input.value = '';
    clear.style.display = 'none';
    document.getElementById('catalog-results').innerHTML =
      '<p class="legend-empty">Zoek naar kaartlagen in de provinciale catalogus van Zuid-Holland.</p>';
  });
}

async function searchCatalog(query) {
  const resultsEl = document.getElementById('catalog-results');
  resultsEl.innerHTML = '<div class="catalog-loading"><i class="fa fa-circle-notch fa-spin"></i> Zoeken in GeoNetwork...</div>';

  try {
    // GeoNetwork 3.x/4.x search API
    const apiUrl = `https://opendata.Zuid-Holland.nl/geonetwork/srv/dut/q?q=${encodeURIComponent(query)}&_content_type=json&fast=index&from=1&to=20`;
    const data = await (await fetch(`/api/proxy?url=${encodeURIComponent(apiUrl)}`)).json();

    const rawRecords = data?.response?.metadata || data?.metadata || [];
    const records = Array.isArray(rawRecords) ? rawRecords : [rawRecords];

    if (!records.length) {
      resultsEl.innerHTML = '<p class="legend-empty">Geen resultaten gevonden voor deze zoekopdracht.</p>';
      return;
    }

    resultsEl.innerHTML = records.map(record => {
      const uuid = record['geonet:info']?.uuid || record.uuid || '';
      const title = record.title || record._title_ || 'Onbekende laag';
      const abstract = record.abstract || record._abstract_ || '';
      const abstractShort = abstract.length > 140 ? abstract.slice(0, 140) + '…' : abstract;

      const links = _parseGeoNetworkLinks(record.link);
      const serviceLink = links.find(l =>
        l.url && (l.url.includes('/MapServer') || l.url.includes('/FeatureServer'))
      );
      const wmsLink = links.find(l =>
        l.url && (l.protocol?.includes('WMS') || l.url.toLowerCase().includes('service=wms'))
      );
      const bestLink = serviceLink || wmsLink;

      const addBtnHtml = bestLink
        ? `<button class="catalog-add-btn" onclick="addLayerFromCatalog(${JSON.stringify(bestLink).replace(/"/g, '&quot;')}, '${title.replace(/['"]/g, ' ')}')">
             <i class="fa fa-plus"></i> Voeg toe
           </button>`
        : `<span class="catalog-no-service">Geen kaartdienst</span>`;

      const metaHref = uuid
        ? `https://opendata.Zuid-Holland.nl/geonetwork/srv/dut/catalog.search#/metadata/${uuid}`
        : `https://opendata.Zuid-Holland.nl/geonetwork/srv/dut/catalog.search#/search?any=${encodeURIComponent(title)}`;

      return `
        <div class="catalog-result">
          <div class="catalog-result-title">${title}</div>
          ${abstractShort ? `<div class="catalog-result-abstract">${abstractShort}</div>` : ''}
          <div class="catalog-result-footer">
            ${addBtnHtml}
            <a href="${metaHref}" target="_blank" class="catalog-meta-link">
              <i class="fa fa-circle-info"></i> Metadata
            </a>
          </div>
        </div>
      `;
    }).join('');

  } catch (e) {
    resultsEl.innerHTML = '<p class="legend-empty">Fout bij zoeken. Controleer de verbinding en probeer opnieuw.</p>';
    console.warn('GeoNetwork search error:', e);
  }
}

function _parseGeoNetworkLinks(links) {
  if (!links) return [];
  const arr = Array.isArray(links) ? links : [links];
  return arr.map(link => {
    if (typeof link === 'string') {
      const parts = link.split('|');
      return { protocol: parts[0], name: parts[1], url: parts[2], desc: parts[3] };
    }
    return link;
  }).filter(l => l?.url);
}

function addLayerFromCatalog(linkObj, title) {
  const url = (linkObj.url || '').replace(/\/$/, '');
  if (!url) return;

  if (url.includes('/MapServer') || url.includes('/FeatureServer')) {
    const layerMatch = url.match(/\/(MapServer|FeatureServer)\/(\d+)$/);
    const layerId = layerMatch ? parseInt(layerMatch[2]) : 0;
    const mapServerUrl = layerMatch ? url.replace(/\/\d+$/, '') : url;
    addCustomMapServerLayer(mapServerUrl, layerId, title);
  } else {
    // Fall back to showing URL for manual entry
    switchTab('layers');
    showAddLayerModal();
    document.getElementById('add-layer-url').value = url;
    document.getElementById('add-layer-status').innerHTML =
      '<span style="color:#888">Controleer de URL en klik op "Detecteer &amp; voeg toe"</span>';
  }
}

// ═══════════════════════════════════════════════════════
// ZOOM / VIEW
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════

function switchTab(tab) {
  const leavingAnalyse = mcaState.active && tab !== 'analyse';

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sidebar-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`${tab}-content`).classList.add('active');

  if (tab === 'analyse') {
    mcaState.active = true;
    // Fly to Groene Hart Noord with pitch for 3D effect
    currentViewState = { ...currentViewState, ...MCA_VIEW, transitionDuration: 900 };
    deckInstance.setProps({ initialViewState: currentViewState });
    loadMcaData(); // no-op if already loaded
  } else if (leavingAnalyse) {
    mcaState.active = false;
    // Restore flat view
    currentViewState = { ...currentViewState, pitch: 0, bearing: 0, transitionDuration: 600 };
    deckInstance.setProps({ initialViewState: currentViewState });
    rebuildDeck();
  }
}

// ═══════════════════════════════════════════════════════
// PERMALINK
// ═══════════════════════════════════════════════════════

function parsePermalinkState() {
  const hash = location.hash.replace('#', '');
  if (!hash) return;
  const params = Object.fromEntries(hash.split('&').map(p => {
    const i = p.indexOf('=');
    return i > 0 ? [p.slice(0, i), decodeURIComponent(p.slice(i + 1))] : [p, ''];
  }));
  if (params.z || params.lat || params.lon) {
    currentViewState = {
      ...CONFIG.initialView,
      zoom: parseFloat(params.z) || CONFIG.initialView.zoom,
      latitude: parseFloat(params.lat) || CONFIG.initialView.latitude,
      longitude: parseFloat(params.lon) || CONFIG.initialView.longitude,
    };
  }
  if (params.bm && BASEMAPS.some(b => b.id === params.bm)) currentBasemap = params.bm;
}

function enablePermalinkLayers() {
  const hash = location.hash.replace('#', '');
  if (!hash) return;
  const params = Object.fromEntries(hash.split('&').map(p => {
    const i = p.indexOf('=');
    return i > 0 ? [p.slice(0, i), decodeURIComponent(p.slice(i + 1))] : [p, ''];
  }));
  if (!params.layers) return;

  params.layers.split(',').filter(Boolean).forEach(key => {
    const [serviceId, layerId] = key.split('::');
    for (const theme of CATALOG) {
      const service = theme.services.find(s => s.id === serviceId);
      if (service) {
        const layer = service.layers.find(l => String(l.id) === layerId);
        if (layer) {
          const cb = document.querySelector(`input[data-key="${key}"]`);
          if (cb) cb.checked = true;
          enableLayer(key, service, layer);
          break;
        }
      }
    }
  });
}

let _permalinkTimer = null;
function updatePermalink() {
  clearTimeout(_permalinkTimer);
  _permalinkTimer = setTimeout(() => {
    const { longitude, latitude, zoom } = currentViewState;
    const layers = [...activeLayers.keys()].filter(k => !k.startsWith('custom::')).join(',');
    const parts = [
      `z=${zoom.toFixed(2)}`,
      `lat=${latitude.toFixed(5)}`,
      `lon=${longitude.toFixed(5)}`,
    ];
    if (currentBasemap !== 'light') parts.push(`bm=${currentBasemap}`);
    if (layers) parts.push(`layers=${encodeURIComponent(layers)}`);
    history.replaceState(null, '', `#${parts.join('&')}`);
  }, 400);
}

function copyPermalink() {
  updatePermalink();
  setTimeout(() => {
    const url = location.href;
    const btn = document.getElementById('btn-share');
    navigator.clipboard.writeText(url).then(() => {
      btn.classList.add('active');
      btn.querySelector('span').textContent = 'Gekopieerd!';
      setTimeout(() => {
        btn.classList.remove('active');
        btn.querySelector('span').textContent = 'Deel';
      }, 2000);
    }).catch(() => prompt('Kopieer deze link:', url));
  }, 450);
}

// ═══════════════════════════════════════════════════════
// EXPORT CSV (CATALOG)
// ═══════════════════════════════════════════════════════

function exportCatalogCSV() {
  const header = ['Thema', 'Service', 'Laag', 'GeoJSON URL'];
  const rows = [header];
  CATALOG.forEach(theme => {
    theme.services.forEach(service => {
      const mapServerUrl = service.wmsUrl.replace(/\/WMSServer$/, '');
      service.layers.forEach(layer => {
        const params = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'geojson' });
        rows.push([theme.label, service.label, layer.label, `${mapServerUrl}/${layer.id}/query?${params}`]);
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

// ═══════════════════════════════════════════════════════
// SCALE BAR
// ═══════════════════════════════════════════════════════

const SCALE_DISTANCES = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

function updateScaleBar(viewState) {
  const lat = viewState.latitude || 52;
  const zoom = viewState.zoom || 9;
  const metersPerPixel = (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);
  const maxDist = metersPerPixel * 120;
  const dist = SCALE_DISTANCES.find(d => d <= maxDist) || SCALE_DISTANCES[0];
  document.getElementById('scale-bar').style.width = `${dist / metersPerPixel}px`;
  document.getElementById('scale-text').textContent = dist >= 1000 ? `${dist / 1000} km` : `${dist} m`;
}

// ═══════════════════════════════════════════════════════
// ADDRESS SEARCH
// ═══════════════════════════════════════════════════════

function initAddressSearch() {
  const input = document.getElementById('address-input');
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => searchAddress(input.value.trim()), 300);
  });
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
      <div class="result-item" onclick="flyToAddress(${
        d.centroide_ll ? parseFloat(d.centroide_ll.replace('POINT(', '').split(' ')[0]) : 4.48
      }, ${
        d.centroide_ll ? parseFloat(d.centroide_ll.replace('POINT(', '').split(' ')[1].replace(')', '')) : 51.9
      }, '${(d.weergavenaam || '').replace(/'/g, "\\'")}')">
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
