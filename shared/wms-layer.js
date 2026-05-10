// shared/wms-layer.js
// Standard WMS TileLayer via proxy. Used by multi-criteria-analysis and agro-viewer.
// For ArcGIS MapServer export endpoint, see gebiedsviewer/js/wms-layer.js.

function tileToBoundingBox(x, y, z) {
    const e = 20037508.34;
    const resolution = e * 2 / Math.pow(2, z);
    const west = x * resolution - e;
    const north = e - y * resolution;
    const east = west + resolution;
    const south = north - resolution;
    return [west, south, east, north];
}

function createWMSLayer(layerConfig) {
    return new deck.TileLayer({
        id: `wms-${layerConfig.id}`,
        tileSize: 256,
        minZoom: 0,
        maxZoom: 19,
        zIndex: 5,

        getTileData: async (props) => {
            const { x, y, z } = props.index;
            const bbox = tileToBoundingBox(x, y, z);

            const wmsUrl = new URL(layerConfig.url);
            wmsUrl.searchParams.set('SERVICE', 'WMS');
            wmsUrl.searchParams.set('VERSION', '1.1.1');
            wmsUrl.searchParams.set('REQUEST', 'GetMap');
            wmsUrl.searchParams.set('LAYERS', layerConfig.layer);
            wmsUrl.searchParams.set('STYLES', '');
            wmsUrl.searchParams.set('SRS', 'EPSG:3857');
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
                bounds: [west, south, east, north]
            });
        }
    });
}
