// js/wms.js

function tileBbox3857(x, y, z) {
  const R = 20037508.342789244;
  const n = Math.pow(2, z);
  return {
    west:  -R + (x / n) * 2 * R,
    east:  -R + ((x + 1) / n) * 2 * R,
    north:  R - (y / n) * 2 * R,
    south:  R - ((y + 1) / n) * 2 * R,
  };
}

function createWmsTileLayer(id, wmsUrl, layerName) {
  return new deck.TileLayer({
    id: `wms-${id}`,
    tileSize: 256, minZoom: 0, maxZoom: 19,
    getTileData: async ({ x, y, z }) => {
      const { west, south, east, north } = tileBbox3857(x, y, z);
      const params = new URLSearchParams({
        SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap',
        LAYERS: layerName, STYLES: '',
        BBOX: `${west},${south},${east},${north}`,
        WIDTH: '256', HEIGHT: '256',
        SRS: 'EPSG:3857', FORMAT: 'image/png', TRANSPARENT: 'TRUE',
      });
      try {
        const r = await fetch(`/api/proxy?url=${encodeURIComponent(wmsUrl + '?' + params)}`);
        if (!r.ok) return null;
        const ct = r.headers.get('content-type') || '';
        if (!ct.startsWith('image/')) return null;
        return createImageBitmap(await r.blob());
      } catch { return null; }
    },
    renderSubLayers: props => {
      if (!props.data) return null;
      const { bbox: { west, south, east, north } } = props.tile;
      return new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] });
    },
    pickable: false,
  });
}

function addNgrLayer(id, info) {
  wmsLayers.set(id, info);
  updateMap();
  updateWmsPanel();
}

function removeNgrLayer(id) {
  wmsLayers.delete(id);
  updateMap();
  updateWmsPanel();
}

function updateWmsPanel() {
  const panel = document.getElementById('wms-panel');
  if (!panel) return;
  panel.innerHTML = [...wmsLayers.entries()].map(([id, info]) => `
    <div class="wms-chip">
      <span class="wms-chip-title">${info.title.replace(/</g,'&lt;').slice(0, 36)}</span>
      <button class="wms-chip-remove" onclick="removeNgrLayer('${id}')" title="Verwijder laag">×</button>
    </div>`).join('');
}

async function searchAndSuggestLayers(keywords) {
  if (!keywords?.length) return;
  for (const kw of keywords.slice(0, 2)) {
    try {
      const res = await fetch(`/api/search-wms?q=${encodeURIComponent(kw)}`);
      const { layers } = await res.json();
      if (layers?.length) { addLayerSuggestionsMessage(kw, layers); return; }
    } catch {}
  }
}

function addLayerSuggestionsMessage(keyword, layers) {
  const ts = Date.now();
  const rowsHtml = layers.map((l, i) => {
    const id = `ngr-${ts}-${i}`;
    _ngrData[id] = l;
    return `<div class="layer-row" id="row-${id}">
      <div class="layer-row-info">
        <div class="layer-row-title">${l.title.replace(/</g,'&lt;')}</div>
        ${l.abstract ? `<div class="layer-row-abstract">${l.abstract.replace(/</g,'&lt;')}</div>` : ''}
      </div>
      <button class="layer-add-btn" onclick="toggleNgrLayer('${id}')">
        ${lang === 'nl' ? 'Toon' : 'Show'}
      </button>
    </div>`;
  }).join('');

  const el = document.createElement('div');
  el.className = 'msg-layers';
  el.innerHTML = `
    <div class="layers-header">
      <span>🗺</span>
      <span class="layers-header-title">${lang === 'nl' ? 'Gerelateerde kaartlagen' : 'Related map layers'}</span>
      <span class="layers-source">NGR · ${keyword.replace(/</g,'&lt;')}</span>
    </div>
    ${rowsHtml}`;
  document.getElementById('messages').appendChild(el);
  scrollToBottom();
}

function toggleNgrLayer(id) {
  const info = _ngrData[id];
  if (!info) return;
  const btn = document.querySelector(`#row-${id} .layer-add-btn`);
  if (wmsLayers.has(id)) {
    removeNgrLayer(id);
    if (btn) { btn.textContent = lang === 'nl' ? 'Toon' : 'Show'; btn.classList.remove('active'); }
  } else {
    addNgrLayer(id, info);
    if (btn) { btn.textContent = lang === 'nl' ? 'Verberg' : 'Hide'; btn.classList.add('active'); }
  }
}
