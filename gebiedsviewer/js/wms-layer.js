// gebiedsviewer/js/wms-layer.js
// Renders ArcGIS MapServer layers as raster tiles via the export endpoint.
// Feature data is only fetched on click (via identify in app.js).

function tileToWebMercatorBbox(x, y, z) {
  const e = 20037508.34;
  const n = Math.pow(2, z);
  const tileSize = e * 2 / n;
  const xmin = x * tileSize - e;
  const ymax = e - y * tileSize;
  return [xmin, ymax - tileSize, xmin + tileSize, ymax];
}

function createWMSLayer(layerConfig) {
  const mapServerUrl = layerConfig.url.replace(/\/WMSServer$/, '');

  return new deck.TileLayer({
    id: `wms-${layerConfig.id}`,
    tileSize: 256,
    maxCacheSize: 100,
    opacity: layerConfig.opacity ?? 0.9,
    minZoom: 0,
    maxZoom: 19,

    getTileData: async ({ index: { x, y, z } }) => {
      const [xmin, ymin, xmax, ymax] = tileToWebMercatorBbox(x, y, z);
      const params = new URLSearchParams({
        bbox: `${xmin},${ymin},${xmax},${ymax}`,
        bboxSR: '3857',
        imageSR: '3857',
        size: '256,256',
        format: 'png',
        layers: `show:${layerConfig.layer}`,
        transparent: 'true',
        f: 'image',
      });
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(`${mapServerUrl}/export?${params}`)}`;
      try {
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bitmap = await createImageBitmap(await response.blob());
        if (layerConfig.onTileLoad) layerConfig.onTileLoad();
        return bitmap;
      } catch (e) {
        if (layerConfig.onError) layerConfig.onError();
        return null;
      }
    },

    renderSubLayers: props => {
      if (!props.data) return null;
      const { bbox: { west, south, east, north } } = props.tile;
      return new deck.BitmapLayer(props, {
        data: null,
        image: props.data,
        bounds: [west, south, east, north],
      });
    },
  });
}
