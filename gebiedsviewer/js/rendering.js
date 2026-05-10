// gebiedsviewer/js/rendering.js — Deck.GL, basemap, legend, scale bar

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

  activeLayers.forEach((entry) => {
    const { mapServerUrl, layerId, label, isGeoJson, color } = entry;
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
      const body = div.querySelector('.legend-body');
      const allLayers = data.layers || [];

      // For group layers show legend entries for each active sublayer
      let legendHtml = '';
      if (entry.isGroupLayer && entry.activeSubLayers?.size) {
        const activeSubs = [...entry.activeSubLayers];
        activeSubs.forEach(subId => {
          const sub = allLayers.find(l => String(l.layerId) === String(subId));
          if (!sub?.legend?.length) return;
          legendHtml += sub.legend.map(item => `
            <div class="legend-row">
              <img src="data:${item.contentType};base64,${item.imageData}" width="${item.width}" height="${item.height}">
              <span>${item.label || sub.layerName || ''}</span>
            </div>
          `).join('');
        });
      } else {
        const layerEntry = allLayers.find(l => String(l.layerId) === String(layerId));
        if (layerEntry?.legend?.length) {
          legendHtml = layerEntry.legend.map(item => `
            <div class="legend-row">
              <img src="data:${item.contentType};base64,${item.imageData}" width="${item.width}" height="${item.height}">
              <span>${item.label || ''}</span>
            </div>
          `).join('');
        }
      }
      body.innerHTML = legendHtml;
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
    onDblClick: ({ coordinate }) => {
      if (measureState.active && coordinate) handleMeasureDblClick(coordinate);
    },
  });

  updateScaleBar(currentViewState);
}

function rebuildDeck() {
  if (!deckInstance) return;
  const bm = BASEMAPS.find(b => b.id === currentBasemap) || BASEMAPS[0];
  const basemap = bm.create();

  const layers = [...activeLayers.entries()].map(([key, entry]) => {
    entry.hasError = false; // reset error state on each rebuild
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
    // For group layers use explicit sublayer IDs so only selected geometries render.
    // Include layerIds in the deck.gl layer ID so that toggling sublayers busts the
    // tile cache — without this deck.gl reuses cached tiles and ignores the new show: param.
    const layerIds = entry.activeSubLayers?.size
      ? [...entry.activeSubLayers].sort((a, b) => a - b).join(',')
      : entry.layerId;
    // Mark card as loading
    entry.pendingTiles = (entry.pendingTiles || 0) + 1;
    const card = document.getElementById(`layer-card-${CSS.escape(key)}`);
    if (card) card.classList.add('layer-card--loading');

    return createWMSLayer({
      id: `${key}::${layerIds}`,
      url: entry.wmsUrl,
      layer: layerIds,
      title: entry.label,
      opacity: entry.visible ? entry.opacity : 0,
      onTileLoad: () => {
        entry.pendingTiles = Math.max(0, (entry.pendingTiles || 1) - 1);
        if (entry.pendingTiles === 0) {
          const c = document.getElementById(`layer-card-${CSS.escape(key)}`);
          if (c) c.classList.remove('layer-card--loading');
        }
      },
      onError: () => {
        entry.pendingTiles = Math.max(0, (entry.pendingTiles || 1) - 1);
        if (entry.pendingTiles === 0) {
          const c = document.getElementById(`layer-card-${CSS.escape(key)}`);
          if (c) c.classList.remove('layer-card--loading');
        }
        if (entry.hasError) return;
        entry.hasError = true;
        const c2 = document.getElementById(`layer-card-${CSS.escape(key)}`);
        if (c2) c2.classList.add('layer-card--error');
      },
    });
  });

  deckInstance.setProps({ layers: [basemap, ...layers, ...buildMcaLayers(), ..._buildMeasureLayers()] });
}

function createDarkLayer() {
  return new deck.TileLayer({
    id: 'dark',
    data: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    tileSize: 256,
    renderSubLayers: props => {
      const { bbox: { west, south, east, north } } = props.tile;
      return new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] });
    },
    pickable: false,
  });
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
