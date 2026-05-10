// gebiedsviewer/js/interactions.js — click/identify, measure, address search, zoom controls

// ═══════════════════════════════════════════════════════
// CLICK / IDENTIFY
// ═══════════════════════════════════════════════════════

const SKIP_FIELDS = new Set([
  'OBJECTID', 'Shape', 'Shape.STArea()', 'Shape.STLength()',
  'Shape_Length', 'Shape_Area', 'FID', 'GlobalID',
]);

let _identifyController = null;

function handleMapClick({ coordinate, x, y }) {
  if (!coordinate) return;
  if (measureState.active) { handleMeasureClick(coordinate, x, y); return; }
  if (activeLayers.size === 0) { closePopup(); return; }
  const visibleLayers = [...activeLayers.values()].filter(e => e.visible && !e.isGeoJson);
  if (!visibleLayers.length) { closePopup(); return; }

  // Cancel any in-flight identify requests
  if (_identifyController) _identifyController.abort();
  _identifyController = new AbortController();
  const { signal } = _identifyController;

  const [lon, lat] = coordinate;
  showPopup(x, y, '<span class="popup-loading"><i class="fa fa-circle-notch fa-spin"></i> Laden...</span>');

  const R = 6378137;
  const mx = lon * Math.PI / 180 * R;
  const my = Math.log(Math.tan((90 + lat) * Math.PI / 360)) * R;
  const delta = 300;
  const mapExtent = `${mx - delta},${my - delta},${mx + delta},${my + delta}`;

  const requests = visibleLayers.map(entry => {
    // For group layers use the active sublayer IDs so identify matches what's visible
    const identifyLayerId = entry.activeSubLayers?.size
      ? [...entry.activeSubLayers].join(',')
      : entry.layerId;
    const url = new URL(`${entry.mapServerUrl}/identify`);
    url.searchParams.set('geometry', `${mx},${my}`);
    url.searchParams.set('geometryType', 'esriGeometryPoint');
    url.searchParams.set('sr', '3857');
    url.searchParams.set('layers', `top:${identifyLayerId}`);
    url.searchParams.set('tolerance', '8');
    url.searchParams.set('mapExtent', mapExtent);
    url.searchParams.set('imageDisplay', '256,256,96');
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('f', 'json');
    return fetch(`/api/proxy?url=${encodeURIComponent(url.toString())}`, { signal })
      .then(r => r.json())
      .then(data => ({
        label: entry.label,
        results: (data.results || []).map(r =>
          Object.fromEntries(
            Object.entries(r.attributes || {}).filter(([k]) => !SKIP_FIELDS.has(k))
          )
        ),
      }))
      .catch(e => ({ label: entry.label, results: [], aborted: e.name === 'AbortError' }));
  });

  Promise.all(requests).then(responses => {
    if (responses.some(r => r.aborted)) return; // superseded by a newer click
    const found = responses.filter(r => r.results.length > 0);

    if (!found.length) {
      showPopup(x, y, '<em class="popup-empty">Geen objecten gevonden op deze locatie.</em>');
      return;
    }
    const allAttrs = found.map(({ label, results }) => ({ label, attrs: results[0] }));
    const copyJson = JSON.stringify(
      allAttrs.length === 1 ? allAttrs[0].attrs : Object.fromEntries(allAttrs.map(a => [a.label, a.attrs])),
      null, 2
    );
    const html = found.map(({ label, results }) => {
      const attrs = results[0];
      const rows = Object.entries(attrs)
        .filter(([, v]) => v !== null && v !== '' && v !== undefined && v !== 'Null' && v !== 0 || v === 0)
        .map(([k, v]) => {
          const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return `<tr><th>${label}</th><td>${v}</td></tr>`;
        })
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
    showPopup(x, y, html, copyJson);
  });
}

function showPopup(x, y, html, copyJson) {
  closePopup();
  const container = document.getElementById('map-container');
  const rect = container.getBoundingClientRect();
  const left = Math.min(x + 12, rect.width - 340);
  const top = Math.min(y + 12, rect.height - 260);
  popupEl = document.createElement('div');
  popupEl.className = 'info-popup';
  popupEl.style.left = `${left}px`;
  popupEl.style.top = `${top}px`;
  const copyBtn = copyJson
    ? `<i class="fa fa-copy popup-copy lc-btn" title="Kopieer als JSON" onclick="copyPopupAttrs(this, '${encodeURIComponent(copyJson)}')"></i>`
    : '';
  popupEl.innerHTML = `
    <div class="popup-header">
      <span>Objectinformatie</span>
      <div style="display:flex;align-items:center;gap:6px">${copyBtn}<i class="fa fa-times popup-close" onclick="closePopup()"></i></div>
    </div>
    <div class="popup-body">${html}</div>
  `;
  container.appendChild(popupEl);
}

function copyPopupAttrs(btn, encodedJson) {
  navigator.clipboard.writeText(decodeURIComponent(encodedJson)).then(() => {
    btn.classList.remove('fa-copy'); btn.classList.add('fa-check');
    btn.style.color = '#2d7a3a';
    setTimeout(() => { btn.classList.remove('fa-check'); btn.classList.add('fa-copy'); btn.style.color = ''; }, 1800);
  });
}

function closePopup() {
  if (popupEl) { popupEl.remove(); popupEl = null; }
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

function resetApp() {
  location.replace(location.pathname);
}

// ═══════════════════════════════════════════════════════
// MEASURE TOOL
// ═══════════════════════════════════════════════════════

const measureState = { active: false, points: [] };

function toggleMeasure() {
  measureState.active = !measureState.active;
  measureState.points = [];
  const btn = document.getElementById('btn-measure');
  btn.classList.toggle('active', measureState.active);
  btn.querySelector('span').textContent = measureState.active ? 'Stop meten' : 'Meten';
  document.getElementById('deck-canvas').style.cursor = measureState.active ? 'crosshair' : '';
  document.getElementById('measure-tooltip').style.display = 'none';
  rebuildDeck();
}

function _haversineMeters([lon1, lat1], [lon2, lat2]) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function _measureTotalMeters(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += _haversineMeters(pts[i-1], pts[i]);
  return d;
}

function _formatDist(m) {
  return m >= 1000 ? `${(m/1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function _buildMeasureLayers() {
  if (!measureState.active && !measureState.points.length) return [];
  const pts = measureState.points;
  const layers = [];
  if (pts.length >= 2) {
    layers.push(new deck.PathLayer({
      id: '_measure-line',
      data: [{ path: pts }],
      getPath: d => d.path,
      getColor: [230, 57, 70],
      getWidth: 2,
      widthMinPixels: 2,
      pickable: false,
    }));
  }
  if (pts.length >= 1) {
    layers.push(new deck.ScatterplotLayer({
      id: '_measure-dots',
      data: pts,
      getPosition: d => d,
      getRadius: 5,
      radiusMinPixels: 5,
      getFillColor: [230, 57, 70],
      getLineColor: [255, 255, 255],
      stroked: true,
      lineWidthMinPixels: 1.5,
      pickable: false,
    }));
  }
  return layers;
}

function handleMeasureClick(coordinate, x, y) {
  measureState.points.push(coordinate);
  const totalM = _measureTotalMeters(measureState.points);
  const tooltip = document.getElementById('measure-tooltip');
  tooltip.style.display = 'block';
  tooltip.style.left = `${x + 14}px`;
  tooltip.style.top = `${y - 10}px`;
  const n = measureState.points.length;
  tooltip.innerHTML = n === 1
    ? 'Klik voor volgend punt · Dubbelklik om te stoppen'
    : `<strong>${_formatDist(totalM)}</strong><br><span style="font-size:10px;color:#aaa">${n} punten · dubbelklik om te stoppen</span>`;
  rebuildDeck();
}

function handleMeasureDblClick(coordinate) {
  // Last point was already added on the preceding click; just stop
  measureState.active = false;
  const btn = document.getElementById('btn-measure');
  btn.classList.remove('active');
  btn.querySelector('span').textContent = 'Meten';
  document.getElementById('deck-canvas').style.cursor = '';
  // Keep the drawn line visible (don't clear points)
  rebuildDeck();
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
