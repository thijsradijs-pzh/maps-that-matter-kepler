// api/wfs-proxy.js
// Fetches WFS GeoJSON from PDOK for a given viewport bbox.
//
// GET /api/wfs-proxy
//   ?wfsUrl=<base WFS URL>
//   &typeName=<namespace:typename>
//   &cqlFilter=<CQL filter string>   (optional)
//   &bbox=<minLon,minLat,maxLon,maxLat>  (WGS84 lon/lat)
//   &pageSize=<number>               (features per page, default 1000)
//   &startIndex=<number>             (for pagination, default 0)
//
// Returns: GeoJSON FeatureCollection + X-Feature-Count + X-Truncated headers

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { wfsUrl, typeName, cqlFilter, bbox, pageSize, startIndex } = req.query;

  if (!wfsUrl || !typeName) {
    return res.status(400).json({ error: 'wfsUrl and typeName are required' });
  }

  // Validate wfsUrl is a known PDOK domain
  try {
    const u = new URL(wfsUrl);
    if (!u.hostname.endsWith('.pdok.nl') && !u.hostname.endsWith('.nationaalgeoregister.nl')) {
      return res.status(400).json({ error: 'Only PDOK WFS services are supported' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid wfsUrl' });
  }

  const requestedCount = Math.min(parseInt(pageSize, 10) || 1000, 1000); // PDOK max per page

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

  // Spatial filter — BBOX in CRS84 guarantees lon/lat axis order
  if (bbox) {
    params.set('BBOX', `${bbox},urn:ogc:def:crs:OGC:1.3:CRS84`);
  }

  // Attribute filter
  if (cqlFilter) {
    params.set('CQL_FILTER', cqlFilter);
  }

  const fullUrl = `${wfsUrl}?${params}`;

  try {
    const upstream = await fetch(fullUrl, {
      headers: { 'User-Agent': 'MapsThatMatter/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      return res.status(502).json({ error: `WFS error ${upstream.status}`, detail: body.slice(0, 500) });
    }

    const ct = upstream.headers.get('content-type') || '';
    // If server returns XML error instead of JSON, surface it
    if (ct.includes('xml') || ct.includes('html')) {
      const body = await upstream.text();
      return res.status(502).json({ error: 'WFS returned non-JSON', detail: body.slice(0, 500) });
    }

    const geojson = await upstream.json();

    const featureCount = geojson.features?.length ?? 0;
    const truncated = featureCount >= requestedCount;
    res.setHeader('X-Feature-Count', featureCount);
    res.setHeader('X-Truncated', truncated ? '1' : '0');
    res.setHeader('X-Page-Size', requestedCount);
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).json(geojson);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
