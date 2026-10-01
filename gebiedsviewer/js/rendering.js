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

    if (entry.isStandardWms) {
      div.innerHTML = `<div class="legend-layer-name">${label}</div>
        <div class="legend-body" style="color:#888;font-size:11px;">Klimaateffectatlas — legenda in kaartviewer</div>`;
      container.appendChild(div);
      return;
    }

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
    // currentBasemap komt al uit de permalink (parsePermalinkState draait eerst);
    // hier 'light' hardcoderen gaf bij #bm=satellite de lichte kaart onder een
    // actieve Foto-knop.
    layers: [(BASEMAPS.find(b => b.id === currentBasemap) || BASEMAPS[0]).create()],

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
      if (measureState.active && coordinate) handleMeasureDblClick();
    },
  });

  updateScaleBar(currentViewState);
}

function rebuildDeck() {
  if (!deckInstance) return;
  const bm = BASEMAPS.find(b => b.id === currentBasemap) || BASEMAPS[0];
  const basemap = bm.create();

  const layers = [...activeLayers.entries()].map(([key, entry]) => {
    if (entry.isStandardWms) {
      const wmsEntry = entry;
      const wmsKey = key;
      return new deck.TileLayer({
        id: `${wmsKey}::${wmsEntry.layerId}`,
        tileSize: 256,
        minZoom: 0,
        maxZoom: 19,
        opacity: wmsEntry.visible ? wmsEntry.opacity : 0,
        getTileData: async ({index: {x, y, z}}) => {
          const e = 20037508.34;
          const res = e * 2 / Math.pow(2, z);
          const west = x * res - e;
          const north = e - y * res;
          const bbox = `${west},${north - res},${west + res},${north}`;
          const url = new URL(wmsEntry.wmsUrl);
          url.searchParams.set('SERVICE', 'WMS');
          url.searchParams.set('VERSION', '1.1.1');
          url.searchParams.set('REQUEST', 'GetMap');
          url.searchParams.set('LAYERS', wmsEntry.layerId);
          url.searchParams.set('STYLES', '');
          url.searchParams.set('SRS', 'EPSG:3857');
          url.searchParams.set('WIDTH', '256');
          url.searchParams.set('HEIGHT', '256');
          url.searchParams.set('FORMAT', 'image/png');
          url.searchParams.set('TRANSPARENT', 'true');
          url.searchParams.set('BBOX', bbox);
          try {
            const r = await fetch(`/api/proxy?url=${encodeURIComponent(url.toString())}`);
            if (!r.ok) return null;
            return await createImageBitmap(await r.blob());
          } catch { return null; }
        },
        renderSubLayers: props => {
          if (!props.data) return null;
          const {bbox: {west, south, east, north}} = props.tile;
          return new deck.BitmapLayer(props, {data: null, image: props.data, bounds: [west, south, east, north]});
        },
      });
    }

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
    // Groepslaag met alle sublagen uitgevinkt: niets tekenen. Zonder deze
    // check viel layerIds terug op de groeps-id, en dan tekent ArcGIS juist
    // álle sublagen.
    if (noSublayersSelected(entry)) return null;
    // For group layers use explicit sublayer IDs so only selected geometries render.
    // Include layerIds in the deck.gl layer ID so that toggling sublayers busts the
    // tile cache — without this deck.gl reuses cached tiles and ignores the new show: param.
    const layerIds = entry.activeSubLayers?.size
      ? [...entry.activeSubLayers].sort((a, b) => a - b).join(',')
      : entry.layerId;
    // Foutstatus hoort bij deze combinatie van sublagen; alleen bij een
    // wissel opnieuw beginnen (de tegels uit de cache worden niet opnieuw
    // opgevraagd, dus een reset bij elke rebuild wiste een echte fout).
    if (entry._renderedIds !== layerIds) {
      entry._renderedIds = layerIds;
      entry.hasError = false;
      entry.pendingTiles = 0;
    }

    // Laadstatus telt echte lopende tegelverzoeken. Eerder telde elke
    // rebuildDeck() één op, maar tegels uit de cache roepen getTileData niet
    // aan en tellen dus nooit af -- na een opaciteitswijziging bleef de
    // spinner eeuwig staan.
    const setCardState = () => {
      const c = document.getElementById(`layer-card-${key}`);
      if (!c) return;
      c.classList.toggle('layer-card--loading', (entry.pendingTiles || 0) > 0);
      c.classList.toggle('layer-card--error', !!entry.hasError);
    };
    setCardState();

    return createWMSLayer({
      id: `${key}::${layerIds}`,
      url: entry.wmsUrl,
      layer: layerIds,
      title: entry.label,
      opacity: entry.opacity,
      visible: entry.visible,
      onTileStart: () => {
        entry.pendingTiles = (entry.pendingTiles || 0) + 1;
        setCardState();
      },
      onTileLoad: () => {
        entry.pendingTiles = Math.max(0, (entry.pendingTiles || 0) - 1);
        setCardState();
      },
      onError: () => {
        entry.pendingTiles = Math.max(0, (entry.pendingTiles || 0) - 1);
        entry.hasError = true;
        setCardState();
      },
    });
  });

  deckInstance.setProps({ layers: [basemap, ...layers, ...buildMcaLayers(), ..._buildMeasureLayers()] });
}

// PDOK-luchtfoto (actueel, 8 cm) i.p.v. ArcGIS World Imagery: open data, geen
// sleutel, zelfde bron als pdok-viewer. Er is geen donkere ondergrond meer --
// PDOK heeft er geen en er komt geen derde partij voor terug.
function createSatelliteLayer() {
  return new deck.TileLayer({
    id: 'satellite',
    data: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg',
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
  const mpp = metersPerPixel(lat, zoom);
  const maxDist = mpp * 120;
  // Grootste ronde afstand die in 120 px past (de lijst loopt op; .find() gaf
  // altijd de kleinste en dus overal "10 m").
  const dist = [...SCALE_DISTANCES].reverse().find(d => d <= maxDist) || SCALE_DISTANCES[0];
  document.getElementById('scale-bar').style.width = `${dist / mpp}px`;
  document.getElementById('scale-text').textContent = dist >= 1000 ? `${dist / 1000} km` : `${dist} m`;
}
