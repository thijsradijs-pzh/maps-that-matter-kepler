// gebiedsviewer/js/wms-layer.js

function tileToBoundingBox(x, y, z) {
  const n = Math.pow(2, z);
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const northRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const southRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
  const north = northRad * 180 / Math.PI;
  const south = southRad * 180 / Math.PI;
  return [west, south, east, north];
}

function createWMSLayer(layerConfig) {
  return new deck.TileLayer({
    id: `wms-${layerConfig.id}`,
    tileSize: 256,
    minZoom: 0,
    maxZoom: 19,

    getTileData: async (props) => {
      const { x, y, z } = props.index;
      const bbox = tileToBoundingBox(x, y, z);

      const wmsUrl = new URL(layerConfig.url);
      wmsUrl.searchParams.set('SERVICE', 'WMS');
      wmsUrl.searchParams.set('VERSION', '1.1.1');
      wmsUrl.searchParams.set('REQUEST', 'GetMap');
      wmsUrl.searchParams.set('LAYERS', layerConfig.layer);
      wmsUrl.searchParams.set('STYLES', '');
      wmsUrl.searchParams.set('SRS', 'EPSG:4326');
      wmsUrl.searchParams.set('WIDTH', '256');
      wmsUrl.searchParams.set('HEIGHT', '256');
      wmsUrl.searchParams.set('FORMAT', 'image/png');
      wmsUrl.searchParams.set('TRANSPARENT', 'true');
      wmsUrl.searchParams.set('BBOX', bbox.join(','));

      const proxyUrl = `/api/proxy?url=${encodeURIComponent(wmsUrl.toString())}`;

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
