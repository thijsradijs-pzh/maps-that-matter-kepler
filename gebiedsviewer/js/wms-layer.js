// gebiedsviewer/js/wms-layer.js
// Uses ArcGIS MapServer REST export API instead of WMS

function tileToWebMercatorBbox(x, y, z) {
  const e = 20037508.34;
  const n = Math.pow(2, z);
  const tileSize = e * 2 / n;
  const xmin = x * tileSize - e;
  const ymax = e - y * tileSize;
  const xmax = xmin + tileSize;
  const ymin = ymax - tileSize;
  return [xmin, ymin, xmax, ymax];
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

    getTileData: async (props) => {
      const { x, y, z } = props.index;
      const [xmin, ymin, xmax, ymax] = tileToWebMercatorBbox(x, y, z);

      const exportUrl = new URL(`${mapServerUrl}/export`);
      exportUrl.searchParams.set('bbox', `${xmin},${ymin},${xmax},${ymax}`);
      exportUrl.searchParams.set('bboxSR', '3857');
      exportUrl.searchParams.set('imageSR', '3857');
      exportUrl.searchParams.set('size', '256,256');
      exportUrl.searchParams.set('format', 'png');
      exportUrl.searchParams.set('layers', `show:${layerConfig.layer}`);
      exportUrl.searchParams.set('transparent', 'true');
      exportUrl.searchParams.set('f', 'image');

      const proxyUrl = `/api/proxy?url=${encodeURIComponent(exportUrl.toString())}`;

      try {
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error('Proxy failed');
        const blob = await response.blob();
        return await createImageBitmap(blob);
      } catch (error) {
        console.warn(`Error loading tile for ${layerConfig.title}:`, error);
        return null;
      }
    },

    renderSubLayers: props => {
      if (!props.data) return null;
      const { bbox: { west, south, east, north } } = props.tile;
      return new deck.BitmapLayer(props, {
        data: null,
        image: props.data,
        bounds: [west, south, east, north]
      });
    }
  });
}
