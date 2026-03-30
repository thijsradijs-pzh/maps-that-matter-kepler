// gebiedsviewer/js/vector-layer.js
// Fetches features from ArcGIS REST query endpoint and renders with Deck.gl GeoJsonLayer.

async function fetchFeatures(mapServerUrl, layerId) {
  const base = `${mapServerUrl}/${layerId}/query`;
  const PAGE = 2000;

  async function fetchPage(offset) {
    const params = new URLSearchParams({
      where: '1=1',
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'geojson',
      resultRecordCount: PAGE,
      resultOffset: offset,
    });
    const url = `/api/proxy?url=${encodeURIComponent(`${base}?${params}`)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  const first = await fetchPage(0);
  if (!first.features) throw new Error('No features in response');

  let features = first.features;

  // Paginate if server indicates more records exist
  if (first.exceededTransferLimit) {
    let offset = PAGE;
    while (offset < 10000) {          // hard cap: 10 000 features
      const page = await fetchPage(offset);
      features = features.concat(page.features || []);
      if (!page.exceededTransferLimit) break;
      offset += PAGE;
    }
  }

  return { type: 'FeatureCollection', features };
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function createVectorLayer(key, entry) {
  if (!entry.geojson) return null;

  const [r, g, b] = hexToRgb(entry.color || '#007ac2');
  const opacity = entry.visible ? entry.opacity : 0;

  return new deck.GeoJsonLayer({
    id: `vector-${key}`,
    data: entry.geojson,
    opacity,
    stroked: true,
    filled: true,
    getFillColor:  [r, g, b, 160],
    getLineColor:  [r, g, b, 230],
    getLineWidth: 1.5,
    lineWidthMinPixels: 1,
    getPointRadius: 6,
    pointRadiusMinPixels: 4,
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 220, 0, 200],
    updateTriggers: {
      opacity: [opacity],
    },
  });
}
