// gebiedsviewer/js/catalog.js — custom layers, GeoNetwork search, MCA, permalink

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

async function addCustomMapServerLayer(mapServerUrl, layerId, layerName) {
  const key = `custom::${++_customLayerCount}`;
  const entry = {
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
  };

  activeLayers.set(key, entry);
  rebuildDeck();
  renderLayerPanel();
  updateLegend();
  updatePermalink();
  closeAddLayerModal();
  switchTab('layers');

  // Async group layer detection (same pattern as enableLayer)
  try {
    const infoUrl = `/api/proxy?url=${encodeURIComponent(`${mapServerUrl}/${layerId}?f=json`)}`;
    const data = await (await fetch(infoUrl)).json();
    const subLayerIds = data.subLayerIds ?? data.subLayers?.map(s => s.id) ?? [];
    if (data.type === 'Group Layer' && subLayerIds.length) {
      entry.isGroupLayer = true;
      const nameMap = Object.fromEntries((data.subLayers || []).map(s => [s.id, s.name]));
      entry.subLayerDetails = subLayerIds.map(id => ({ id, name: nameMap[id] || `Laag ${id}`, geometryType: null }));
      entry.activeSubLayers = new Set([subLayerIds[0]]);
      renderLayerPanel();
      rebuildDeck();
    }
  } catch (e) { /* ignore */ }
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
// KLIMAATEFFECTATLAS (KEA) — standard WMS layers
// ═══════════════════════════════════════════════════════

const _KEA_WMS = 'https://cas.cloud.sogelink.com/public/data/org/gws/YWFMLMWERURF/kea_public/wms';
let _keaCount = 0;

function addKeaLayer(layerName, label) {
  if ([...activeLayers.values()].some(e => e.isStandardWms && e.layerId === layerName)) return;
  const key = `kea::${++_keaCount}`;
  activeLayers.set(key, {
    wmsUrl: _KEA_WMS,
    layerId: layerName,
    label,
    serviceId: '_kea',
    isStandardWms: true,
    color: '#e65100',
    opacity: 0.85,
    visible: true,
    minScale: 0,
    isCustom: true,
  });
  rebuildDeck();
  renderLayerPanel();
  updateLegend();
  updateBadges();
  updatePermalink();
  switchTab('layers');
}

function initKeaSection() {
  const section = document.getElementById('kea-catalog-section');
  if (!section) return;
  const layers = [
    { layer: 'hitteeiland',                   label: 'Hitte-eiland effect' },
    { layer: 'warme_nachten_huidig',           label: 'Warme nachten (huidig)' },
    { layer: 'droogtestress_huidig',           label: 'Droogtestress (huidig)' },
    { layer: 'waterdiepte_neerslag_70mm_2uur', label: 'Waterdiepte bij 70mm/2u' },
    { layer: 'bodemdaling_2020_2050',          label: 'Bodemdaling 2020–2050' },
    { layer: 'risicopaalrot_huidig',           label: 'Risico paalrot (huidig)' },
  ];
  section.innerHTML = `
    <div class="kea-cat-header">
      <i class="fa fa-cloud-sun-rain"></i> Klimaateffectatlas
      <span class="kea-cat-badge">CC BY 4.0</span>
    </div>
    <p class="kea-cat-intro">~380 klimaatlagen over hitte, droogte, wateroverlast en bodemdaling. Klik om een laag toe te voegen.</p>
    ${layers.map(l => `
      <div class="kea-cat-row" onclick="addKeaLayer('${l.layer}', '${l.label.replace(/'/g, "\\'")}')">
        <span>${l.label}</span>
        <i class="fa fa-plus-circle"></i>
      </div>`).join('')}
  `;
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
  updatePermalink();
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

  const { data, weights } = mcaState;

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
    const apiUrl = `https://opendata.Zuid-Holland.nl/geonetwork/srv/dut/q?any=${encodeURIComponent(query)}&_content_type=json&fast=index&from=1&to=20`;
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
  if (params.mca) {
    const vals = params.mca.split('-').map(Number);
    MCA_CRITERIA.forEach((c, i) => {
      if (vals[i] != null && !isNaN(vals[i])) mcaState.weights[c.weightKey] = vals[i];
    });
  }
}

function enablePermalinkLayers() {
  const hash = location.hash.replace('#', '');
  if (!hash) return;
  const params = Object.fromEntries(hash.split('&').map(p => {
    const i = p.indexOf('=');
    return i > 0 ? [p.slice(0, i), decodeURIComponent(p.slice(i + 1))] : [p, ''];
  }));
  if (!params.layers) return;

  // Parse saved sublayer selections: "serviceId::layerId:subId1+subId2"
  const sublayerMap = {};
  if (params.sublayers) {
    params.sublayers.split(',').forEach(part => {
      const colonIdx = part.lastIndexOf(':');
      if (colonIdx < 0) return;
      const key = part.slice(0, colonIdx);
      const ids = part.slice(colonIdx + 1).split('+').map(Number).filter(Boolean);
      if (ids.length) sublayerMap[key] = ids;
    });
  }

  // Parse saved opacity values: "key:0.70"
  const opacityMap = {};
  if (params.opacity) {
    params.opacity.split(',').forEach(part => {
      const colonIdx = part.lastIndexOf(':');
      if (colonIdx < 0) return;
      const key = part.slice(0, colonIdx);
      opacityMap[key] = parseFloat(part.slice(colonIdx + 1));
    });
  }

  const enables = params.layers.split(',').filter(Boolean).map(async key => {
    const [serviceId, layerId] = key.split('::');
    for (const theme of CATALOG) {
      const service = theme.services.find(s => s.id === serviceId);
      if (service) {
        const layer = service.layers.find(l => String(l.id) === layerId);
        if (layer) {
          const cb = document.querySelector(`input[data-key="${key}"]`);
          if (cb) cb.checked = true;
          await enableLayer(key, service, layer);
          if (sublayerMap[key]) {
            const entry = activeLayers.get(key);
            if (entry?.subLayerDetails?.length) {
              entry.activeSubLayers = new Set(sublayerMap[key]);
              renderLayerPanel();
              rebuildDeck();
            }
          }
          if (opacityMap[key] != null) {
            const entry = activeLayers.get(key);
            if (entry) { entry.opacity = opacityMap[key]; renderLayerPanel(); rebuildDeck(); }
          }
          break;
        }
      }
    }
  });

  const VALID_TABS = new Set(['layers', 'legend', 'catalog', 'analyse']);
  if (params.tab && VALID_TABS.has(params.tab) && params.tab !== 'layers') {
    Promise.all(enables).then(() => switchTab(params.tab));
  }
}

let _permalinkTimer = null;

function updatePermalink() {
  clearTimeout(_permalinkTimer);
  _permalinkTimer = setTimeout(() => {
    const { longitude, latitude, zoom } = currentViewState;
    const layerKeys = [...activeLayers.keys()].filter(k => !k.startsWith('custom::'));
    const parts = [
      `z=${zoom.toFixed(2)}`,
      `lat=${latitude.toFixed(5)}`,
      `lon=${longitude.toFixed(5)}`,
    ];
    if (currentBasemap !== 'light') parts.push(`bm=${currentBasemap}`);
    const activeTab = document.querySelector('.tab.active')?.dataset.tab;
    if (activeTab && activeTab !== 'layers') parts.push(`tab=${activeTab}`);
    const mcaVals = MCA_CRITERIA.map(c => mcaState.weights[c.weightKey] ?? 2);
    if (mcaVals.some(v => v !== 2)) parts.push(`mca=${mcaVals.join('-')}`);
    if (layerKeys.length) parts.push(`layers=${encodeURIComponent(layerKeys.join(','))}`);

    // Encode non-default sublayer selections: key:id+id+id
    const sublayerParts = layerKeys.map(k => {
      const entry = activeLayers.get(k);
      if (!entry?.activeSubLayers?.size) return null;
      return `${k}:${[...entry.activeSubLayers].sort((a, b) => a - b).join('+')}`;
    }).filter(Boolean);
    if (sublayerParts.length) parts.push(`sublayers=${encodeURIComponent(sublayerParts.join(','))}`);

    // Encode non-default opacity values (default is 0.9)
    const opacityParts = layerKeys.map(k => {
      const entry = activeLayers.get(k);
      if (!entry || Math.abs(entry.opacity - 0.9) < 0.01) return null;
      return `${k}:${entry.opacity.toFixed(2)}`;
    }).filter(Boolean);
    if (opacityParts.length) parts.push(`opacity=${encodeURIComponent(opacityParts.join(','))}`);

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
