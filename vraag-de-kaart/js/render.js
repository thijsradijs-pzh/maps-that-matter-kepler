// js/render.js

function interpolateColor(value, min, max, colors) {
  if (value == null || isNaN(value)) return [40, 40, 60, 0];
  const t  = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const n  = colors.length - 1;
  const i  = Math.floor(t * n);
  const f  = t * n - i;
  const c0 = colors[Math.min(i, n)];
  const c1 = colors[Math.min(i + 1, n)];
  return [
    Math.round(c0[0] + f * (c1[0] - c0[0])),
    Math.round(c0[1] + f * (c1[1] - c0[1])),
    Math.round(c0[2] + f * (c1[2] - c0[2])),
    210,
  ];
}

function buildLayer(rows, metricCol, colorScale) {
  const colors = SCALES[colorScale] || SCALES['blue-orange'];
  const vals   = rows.map(r => r[metricCol]).filter(v => v != null && !isNaN(v));
  const min    = Math.min(...vals);
  const max    = Math.max(...vals);

  return new deck.H3HexagonLayer({
    id: 'result-layer',
    data: rows,
    getHexagon:    r => r.h3_id,
    getFillColor:  r => interpolateColor(r[metricCol], min, max, colors),
    getElevation:  r => {
      const v = r[metricCol];
      if (v == null || isNaN(v)) return 0;
      return Math.max(0, ((v - min) / (max - min || 1))) * 400;
    },
    extruded:       true,
    elevationScale: 1,
    pickable:       true,
    updateTriggers: { getFillColor: [metricCol, min, max], getElevation: [metricCol] },
  });
}

function updateMap() {
  if (!deckInstance) return;
  const layers = [DeckGLUtils.createBasemap('dark-matter')];
  if (currentRows?.length) layers.push(buildLayer(currentRows, currentMetric, currentColorScale));
  wmsLayers.forEach((info, id) => layers.push(createWmsTileLayer(id, info.wmsUrl, info.layerName)));
  deckInstance.setProps({ layers });
}

function renderLayer(rows, metricCol, colorScale) {
  currentRows = rows; currentMetric = metricCol; currentColorScale = colorScale;
  updateMap();
}

function flyToResults(rows) {
  if (!rows || !rows.length || !rows[0].h3_id) return;
  const lats = [], lngs = [];
  rows.slice(0, 200).forEach(r => {
    if (!r.h3_id) return;
    try {
      const [lat, lng] = h3.cellToLatLng(r.h3_id);
      lats.push(lat); lngs.push(lng);
    } catch {}
  });
  if (!lats.length) return;
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const spread = Math.max(maxLat - minLat, maxLng - minLng);
  const zoom   = spread < 0.1 ? 11 : spread < 0.5 ? 9 : spread < 2 ? 8 : spread < 5 ? 7 : 6;
  deckInstance.setProps({
    viewState: { longitude: centerLng, latitude: centerLat, zoom, pitch: 40, bearing: 0, transitionDuration: 800 }
  });
}

function buildTooltip({ object }, rows, metricCol) {
  if (!object) return null;
  const row = rows.find(r => r.h3_id === object.properties?.hexId || r.h3_id === object) || object;
  const name = row.buurtnaam || row.wijknaam || row.gemeentenaam || row.naam || row.h3_id || '–';
  const val  = row[metricCol];
  const fmt  = val != null ? (typeof val === 'number' ? val.toLocaleString('nl') : val) : '–';
  return {
    html: `<div style="font-size:12px;line-height:1.8">
      <b>${name}</b><br>
      ${metricCol.replace(/_/g,' ')}: <b>${fmt}</b><br>
      ${row.gemeentenaam && row.buurtnaam ? `<span style="color:#666;font-size:10px">${row.gemeentenaam}</span>` : ''}
    </div>`,
    style: { background:'rgba(10,10,20,0.95)', color:'#ddd', border:'1px solid #333', borderRadius:'6px', padding:'8px 12px', fontSize:'12px' },
  };
}
