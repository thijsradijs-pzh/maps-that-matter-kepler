// api/ngr-wms-tile.js
// Proxies a single WMS GetMap tile for an arbitrary NGR-indexed service.
//
// GET /api/ngr-wms-tile
//   ?wmsUrl=<base WMS URL>       (must be https)
//   &layer=<layer name>
//   &bbox=<minX,minY,maxX,maxY>  (EPSG:3857 — MapLibre's {bbox-epsg-3857} tile token)
//
// Used as the tile source for vraag-de-kennisgraaf's WMS fallback (shown
// when a dataset has no WFS distribution to render as-is). WMS 1.1.1 is
// used deliberately over 1.3.0: axis order for BBOX is always x,y in 1.1.1
// regardless of CRS, sidestepping 1.3.0's CRS-dependent axis-order
// footgun, and 1.1.1 has the widest support among the older Dutch
// government WMS servers NGR indexes.
//
// Same host validation as api/ngr-wfs-proxy.js: any https host, but not
// private/loopback/link-local (SSRF hygiene, not a fixed allowlist).

const BLOCKED_HOST_RE = /^(localhost|127\.|0\.0\.0\.0|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[?::1\]?)/i;
const BBOX_RE = /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/;
const TILE_SIZE = 256;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { wmsUrl, layer, bbox } = req.query;
  if (!wmsUrl || !layer || !bbox) {
    return res.status(400).json({ error: 'wmsUrl, layer and bbox are required' });
  }
  if (!BBOX_RE.test(bbox)) {
    return res.status(400).json({ error: 'Invalid bbox' });
  }

  let target;
  try {
    target = new URL(wmsUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid wmsUrl' });
  }
  if (target.protocol !== 'https:') {
    return res.status(400).json({ error: 'wmsUrl must be https' });
  }
  if (BLOCKED_HOST_RE.test(target.hostname)) {
    return res.status(400).json({ error: 'wmsUrl host is not allowed' });
  }

  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.1.1',
    REQUEST: 'GetMap',
    LAYERS: layer,
    STYLES: '',
    SRS: 'EPSG:3857',
    BBOX: bbox,
    WIDTH: String(TILE_SIZE),
    HEIGHT: String(TILE_SIZE),
    FORMAT: 'image/png',
    TRANSPARENT: 'TRUE',
  });

  const fullUrl = `${target.origin}${target.pathname}?${params}`;

  try {
    const upstream = await fetch(fullUrl, {
      headers: { 'User-Agent': 'MapsThatMatter/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    const ct = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !ct.startsWith('image/')) {
      const body = await upstream.text();
      return res.status(502).json({ error: 'WMS did not return an image', detail: body.slice(0, 300) });
    }

    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buffer = await upstream.arrayBuffer();
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    if (err.name === 'TimeoutError') return res.status(504).json({ error: 'WMS tile request timed out' });
    return res.status(500).json({ error: err.message });
  }
}
