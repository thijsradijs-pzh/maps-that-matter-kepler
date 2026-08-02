// api/ngr-wfs-proxy.js
// Fetches WFS GeoJSON for an arbitrary NGR-indexed service.
//
// GET /api/ngr-wfs-proxy
//   ?wfsUrl=<base WFS URL>       (must be https, resolved server-side via /api/ngr-record)
//   &typeName=<namespace:typename>
//   &bbox=<minLon,minLat,maxLon,maxLat>  (WGS84 lon/lat, optional)
//   &pageSize=<number>           (features, default/max 1000)
//   &startIndex=<number>         (for pagination, default 0)
//
// Unlike api/wfs-proxy.js (which only allows *.pdok.nl / *.nationaalgeoregister.nl),
// NGR indexes WFS services hosted by many different organisations (provinces,
// municipalities, ...). This proxy accepts any https host but still builds the
// GetFeature request itself server-side (no passthrough of arbitrary query
// strings) and rejects private/loopback/link-local hostnames as basic SSRF
// hygiene.

const BLOCKED_HOST_RE = /^(localhost|127\.|0\.0\.0\.0|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[?::1\]?)/i;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { wfsUrl, typeName, bbox, pageSize, startIndex } = req.query;

  if (!wfsUrl || !typeName) {
    return res.status(400).json({ error: 'wfsUrl and typeName are required' });
  }

  let target;
  try {
    target = new URL(wfsUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid wfsUrl' });
  }
  if (target.protocol !== 'https:') {
    return res.status(400).json({ error: 'wfsUrl must be https' });
  }
  if (BLOCKED_HOST_RE.test(target.hostname)) {
    return res.status(400).json({ error: 'wfsUrl host is not allowed' });
  }

  const requestedCount = Math.min(parseInt(pageSize, 10) || 1000, 1000);

  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: typeName,
    SRSNAME: 'EPSG:4326',
    outputFormat: 'application/json',
    count: requestedCount,
  });

  if (startIndex && parseInt(startIndex, 10) > 0) {
    params.set('startIndex', startIndex);
  }
  if (bbox) {
    params.set('BBOX', `${bbox},urn:ogc:def:crs:OGC:1.3:CRS84`);
  }

  const fullUrl = `${target.origin}${target.pathname}?${params}`;

  try {
    const upstream = await fetch(fullUrl, {
      headers: { 'User-Agent': 'MapsThatMatter/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      return res.status(502).json({ error: `WFS error ${upstream.status}`, detail: body.slice(0, 500) });
    }

    const ct = upstream.headers.get('content-type') || '';
    if (ct.includes('xml') || ct.includes('html')) {
      // Common on ArcGIS Server-hosted WFS (frequent among NGR's provincial/gemeente
      // sources), which often only speak GML — we don't parse GML in v1.
      const body = await upstream.text();
      return res.status(502).json({
        error: 'Deze WFS-service levert geen GeoJSON (mogelijk alleen GML-uitvoer)',
        detail: body.slice(0, 500),
      });
    }

    const geojson = await upstream.json();

    const featureCount = geojson.features?.length ?? 0;
    const truncated = featureCount >= requestedCount;
    res.setHeader('X-Feature-Count', featureCount);
    res.setHeader('X-Truncated', truncated ? '1' : '0');
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).json(geojson);
  } catch (err) {
    if (err.name === 'TimeoutError') return res.status(504).json({ error: 'WFS request timed out' });
    return res.status(500).json({ error: err.message });
  }
}
