// api/ngr-record.js
// GET /api/ngr-record?id=<NGR dataset uuid>
//
// Fetches the full ISO19139 metadata record for a dataset from the
// Nationaal Georegister GeoNetwork API and extracts its OGC:WFS and
// OGC:WMS distribution links (if any), so the frontend doesn't need to
// parse ISO19139 JSON itself.
//
// Returns: { wfs: { url, typeName, description } | null,
//            wms: { url, layer, description } | null,
//            extent: [minLon, minLat, maxLon, maxLat] | null }
// null values are a normal outcome — not every dataset has a WFS or WMS
// distribution — and are returned with 200, not an error status. WMS is
// a fallback: vraag-de-kennisgraaf renders WFS features as-is when
// available, and only falls back to a WMS raster overlay when there's no
// WFS to work with. `extent` is the last resort: the dataset's geographic
// bounding box (a mandatory ISO19115 field, present even when there's no
// live map service at all — most NGR records only ever have this).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// ISO19139-as-JSON wraps most values in { "gco:<Type>": { "#text": "..." } }
// (CharacterString for text, Decimal for numbers, ...), but some converters
// flatten that to a plain string. Handle both, for any gco: wrapper.
function text(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (v['#text'] != null) return String(v['#text']);
  const gcoKey = Object.keys(v).find(k => k.startsWith('gco:'));
  if (gcoKey) return text(v[gcoKey]);
  return '';
}

function num(v) {
  const n = parseFloat(text(v));
  return Number.isFinite(n) ? n : null;
}

// Depth-first search for the first object carrying the given key, anywhere
// in the record. Simpler and more robust than chasing every ISO19139 path
// variant (MD_DataIdentification vs SV_ServiceIdentification, etc.) for a
// field — geographic extent — that's mandatory and always in roughly the
// same shape regardless of which identification branch it hangs off of.
function findFirst(obj, key) {
  if (obj == null || typeof obj !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  for (const v of Object.values(obj)) {
    const found = findFirst(v, key);
    if (found != null) return found;
  }
  return null;
}

function extractExtent(record) {
  const bbox = findFirst(record, 'gmd:EX_GeographicBoundingBox');
  if (!bbox) return null;
  const west = num(bbox['gmd:westBoundLongitude']);
  const east = num(bbox['gmd:eastBoundLongitude']);
  const south = num(bbox['gmd:southBoundLatitude']);
  const north = num(bbox['gmd:northBoundLatitude']);
  if ([west, east, south, north].some(v => v == null)) return null;
  return [west, south, east, north];
}

// Walks every gmd:CI_OnlineResource in the record's distribution info once,
// returning the first WFS match and the first WMS match found.
function extractServices(record) {
  let wfs = null, wms = null;
  const distributions = asArray(record?.['gmd:distributionInfo']);
  for (const dist of distributions) {
    const transferOptions = asArray(dist?.['gmd:MD_Distribution']?.['gmd:transferOptions']);
    for (const to of transferOptions) {
      const onLines = asArray(to?.['gmd:MD_DigitalTransferOptions']?.['gmd:onLine']);
      for (const on of onLines) {
        const res = on?.['gmd:CI_OnlineResource'];
        if (!res) continue;
        const protocol = text(res['gmd:protocol']).toUpperCase();
        const url = res['gmd:linkage']?.['gmd:URL'];
        const name = text(res['gmd:name']);
        if (!url || !name) continue;
        if (!wfs && protocol.includes('WFS')) {
          wfs = { url, typeName: name, description: text(res['gmd:description']) };
        } else if (!wms && protocol.includes('WMS')) {
          wms = { url, layer: name, description: text(res['gmd:description']) };
        }
      }
    }
  }
  return { wfs, wms };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id || !UUID_RE.test(id)) {
    return res.status(400).json({ error: 'A valid dataset uuid is required as ?id=' });
  }

  const url = `https://nationaalgeoregister.nl/geonetwork/srv/api/records/${id}`;

  try {
    const upstream = await fetch(url, {
      // GeoNetwork's servlet 500s (NotAllowedException) without Accept-Language —
      // it doesn't fall back to a default locale, so this header is required, not cosmetic.
      headers: { 'User-Agent': 'MapsThatMatter/1.0', Accept: 'application/json', 'Accept-Language': 'nl-NL,nl;q=0.9' },
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `NGR record lookup failed (${upstream.status})` });
    }

    const record = await upstream.json();
    const { wfs, wms } = extractServices(record);
    const extent = extractExtent(record);

    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({ wfs, wms, extent });
  } catch (err) {
    if (err.name === 'TimeoutError') return res.status(504).json({ error: 'NGR record lookup timed out' });
    return res.status(500).json({ error: 'Kon dataset-metadata niet ophalen' });
  }
}
