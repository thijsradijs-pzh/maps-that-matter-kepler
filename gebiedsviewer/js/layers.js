// gebiedsviewer/js/layers.js — layer tree, layer management, active layers panel

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
  let anyVisible = false;
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
    if (themeVisible) anyVisible = true;
  });
  const emptyEl = document.getElementById('layer-search-empty');
  const termEl = document.getElementById('layer-search-term');
  if (emptyEl) {
    emptyEl.style.display = searchTerm && !anyVisible ? 'block' : 'none';
    if (termEl) termEl.textContent = `"${searchTerm}"`;
  }
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

  // Render immediately for fast perceived performance
  activeLayers.set(key, entry);
  rebuildDeck();
  updateLegend();
  updateBadges();
  renderLayerPanel();
  updateLayerTreeActiveState();
  updatePermalink();

  // Async detection — one request to get layer type, minScale, and sublayer list.
  // Does NOT fetch per-sublayer info (avoids N round-trips for large group layers).
  try {
    const infoUrl = `/api/proxy?url=${encodeURIComponent(`${mapServerUrl}/${layer.id}?f=json`)}`;
    const data = await (await fetch(infoUrl)).json();

    let changed = false;

    if (data.minScale !== undefined && data.minScale !== entry.minScale) {
      entry.minScale = data.minScale;
      updateScaleDependency(currentViewState.zoom);
      changed = true;
    }

    // ArcGIS ≤10.x: subLayerIds (int[]); ArcGIS 11.x: subLayers ([{id,name}])
    const subLayerIds = data.subLayerIds ?? data.subLayers?.map(s => s.id) ?? [];

    if (data.type === 'Group Layer' && subLayerIds.length) {
      entry.isGroupLayer = true;
      const nameMap = Object.fromEntries((data.subLayers || []).map(s => [s.id, s.name]));

      // Build sublayer list from group response only — no per-child fetch needed
      entry.subLayerDetails = subLayerIds.map(id => ({
        id,
        name: nameMap[id] || `Laag ${id}`,
        geometryType: null,
      }));
      // Default: show only the first sublayer. Showing all simultaneously layers
      // multiple analyses on top of each other, making each toggle barely visible.
      entry.activeSubLayers = new Set([subLayerIds[0]]);
      changed = true;
    }

    if (changed) {
      renderLayerPanel(); // update sublayer checkboxes if group layer
      rebuildDeck();      // re-render tiles with correct show: param + cache-busted ID
    }
  } catch (e) { /* ignore — initial render remains */ }
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

function clearAllLayers() {
  [...activeLayers.keys()].forEach(key => {
    const cb = document.querySelector(`input[data-key="${key}"]`);
    if (cb) cb.checked = false;
  });
  activeLayers.clear();
  rebuildDeck();
  updateLegend();
  updateBadges();
  renderLayerPanel();
  updateLayerTreeActiveState();
  updatePermalink();
}

function setLayerOpacity(key, value) {
  const entry = activeLayers.get(key);
  if (!entry) return;
  entry.opacity = parseFloat(value);
  const label = document.querySelector(`#layer-card-${CSS.escape(key)} .opacity-val`);
  if (label) label.textContent = `${Math.round(entry.opacity * 100)}%`;
  rebuildDeck();
  updatePermalink();
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

function toggleSubLayer(key, subId) {
  const entry = activeLayers.get(key);
  if (!entry?.activeSubLayers) return;
  if (entry.activeSubLayers.has(subId)) {
    entry.activeSubLayers.delete(subId);
  } else {
    entry.activeSubLayers.add(subId);
  }
  rebuildDeck();
  updateLegend();
  updatePermalink();
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
    if (card) {
      card.classList.toggle('layer-card--outofscale', outOfScale);
      const scaleHint = card.querySelector('.scale-hint');
      if (outOfScale && scaleHint) {
        const neededZoom = Math.ceil(Math.log2(
          (156543.03392 * Math.cos(lat * Math.PI / 180)) / (entry.minScale * 0.000264583)
        ));
        scaleHint.textContent = `Inzoomen naar niveau ~${neededZoom} om te zien`;
        scaleHint.style.display = 'block';
      } else if (scaleHint) {
        scaleHint.style.display = 'none';
      }
    }
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

  function flyToExtent(ext) {
    if (!ext || ext.xmin == null) return false;
    const lon = (ext.xmin + ext.xmax) / 2;
    const lat = (ext.ymin + ext.ymax) / 2;
    const maxDelta = Math.max(ext.xmax - ext.xmin, ext.ymax - ext.ymin);
    const zoom = Math.max(6, Math.min(15, Math.log2(360 / maxDelta) - 0.5));
    currentViewState = { longitude: lon, latitude: lat, zoom, transitionDuration: 800 };
    deckInstance.setProps({ initialViewState: currentViewState });
    return true;
  }

  try {
    // Try query extent first (most accurate)
    const qUrl = `${entry.mapServerUrl}/${entry.layerId}/query?where=1%3D1&returnExtentOnly=true&outSR=4326&f=json`;
    const data = await (await fetch(`/api/proxy?url=${encodeURIComponent(qUrl)}`)).json();
    if (flyToExtent(data.extent)) return;
  } catch (e) { /* fall through to layer info */ }

  try {
    // Fallback: use fullExtent from layer info
    const infoUrl = `/api/proxy?url=${encodeURIComponent(`${entry.mapServerUrl}/${entry.layerId}?f=json`)}`;
    const info = await (await fetch(infoUrl)).json();
    const ext = info.fullExtent || info.extent;
    if (!ext) return;
    // fullExtent may be in a projected CRS — convert if needed
    if (ext.spatialReference?.wkid === 28992) {
      // RD New → approximate WGS84 center for Zuid-Holland region
      const lon = 4.5 + (ext.xmin + ext.xmax) / 2 / 700000 * 3.5;
      const lat = 52.0 + (ext.ymin + ext.ymax) / 2 / 700000 * 2.0;
      currentViewState = { longitude: lon, latitude: lat, zoom: 10, transitionDuration: 800 };
      deckInstance.setProps({ initialViewState: currentViewState });
    } else {
      flyToExtent(ext);
    }
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

  // Group entries by theme
  const themeGroups = new Map(); // themeId → { label, color, entries[] }
  entries.forEach(([key, entry]) => {
    const theme = CATALOG.find(t => t.services.some(s => s.id === entry.serviceId));
    const groupId = theme ? theme.id : '_custom';
    const groupLabel = theme ? theme.label : 'Eigen lagen';
    const groupColor = theme ? theme.color : '#e67e22';
    if (!themeGroups.has(groupId)) themeGroups.set(groupId, { label: groupLabel, color: groupColor, entries: [] });
    themeGroups.get(groupId).entries.push([key, entry]);
  });

  themeGroups.forEach(({ label: groupLabel, color: groupColor, entries: groupEntries }) => {
    if (themeGroups.size > 1) {
      const header = document.createElement('div');
      header.className = 'active-group-header';
      header.innerHTML = `<span class="active-group-dot" style="background:${groupColor}"></span>${groupLabel}`;
      list.appendChild(header);
    }
    groupEntries.forEach(([key, entry], idx) => {
    const pct = Math.round(entry.opacity * 100);
    const eyeIcon = entry.visible ? 'fa-eye' : 'fa-eye-slash';
    const metaUrl = `https://opendata.Zuid-Holland.nl/geonetwork/srv/dut/catalog.search#/search?any=${encodeURIComponent(entry.label)}`;

    const card = document.createElement('div');
    card.className = 'layer-card';
    card.id = `layer-card-${CSS.escape(key)}`;
    card.innerHTML = `
      <div class="layer-card-header">
        <div class="layer-card-order drag-handle" title="Versleep om volgorde te wijzigen">
          <i class="fa fa-grip-vertical"></i>
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
      <div class="scale-hint" style="display:none"></div>
      ${entry.subLayerDetails?.length ? (() => {
        const activeCount = entry.activeSubLayers?.size || 0;
        return `
        <div class="sublayer-list">
          <div class="sublayer-list-title">
            <i class="fa fa-layer-group"></i> Sublagen
            <span class="sublayer-count">${activeCount} / ${entry.subLayerDetails.length} actief</span>
          </div>
          ${entry.subLayerDetails.map(sub => {
            const checked = entry.activeSubLayers?.has(sub.id) ? 'checked' : '';
            return `<label class="sublayer-toggle">
              <input type="checkbox" ${checked} onchange="toggleSubLayer('${key}', ${sub.id})">
              <span>${sub.name}</span>
            </label>`;
          }).join('')}
        </div>`;
      })() : ''}
    `;
      list.appendChild(card);
    });
  });

  updateScaleDependency(currentViewState.zoom);

  // Drag-to-reorder with SortableJS
  if (typeof Sortable !== 'undefined') {
    Sortable.create(list, {
      handle: '.drag-handle',
      animation: 150,
      onEnd: evt => {
        // Rebuild activeLayers Map in new order
        const cards = [...list.querySelectorAll('.layer-card[id]')];
        const orderedKeys = cards.map(el => el.id.replace('layer-card-', ''));
        const snapshot = new Map([...activeLayers]);
        activeLayers.clear();
        orderedKeys.forEach(k => { if (snapshot.has(k)) activeLayers.set(k, snapshot.get(k)); });
        // Re-append any theme headers (they're not cards)
        rebuildDeck();
        renderLayerPanel();
      },
    });
  }
}
