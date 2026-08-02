// api/ngr-record.js
// GET /api/ngr-record?id=<NGR dataset uuid>
//
// Fetches the full ISO19139 metadata record for a dataset from the
// Nationaal Georegister GeoNetwork API and extracts its OGC:WFS and
// OGC:WMS distribution links (if any), so the frontend doesn't need to
// parse ISO19139 JSON itself.
//
// Returns: { wfs: { url, typeName, description } | null,
//            wms: { url, layer, description } | null }
// null values are a normal outcome — not every dataset has a WFS or WMS
// distribution — and are returned with 200, not an error status. WMS is
// a fallback: vraag-de-kennisgraaf renders WFS features as-is when
// available, and only falls back to a WMS raster overlay when there's no
// WFS to work with.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// ISO19139-as-JSON wraps most text in { "gco:CharacterString": { "#text": "..." } },
// but some converters flatten that to a plain string. Handle both.
function text(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (v['#text'] != null) return String(v['#text']);
  if (v['gco:CharacterString'] != null) return text(v['gco:CharacterString']);
  return '';
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

    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({ wfs, wms });
  } catch (err) {
    if (err.name === 'TimeoutError') return res.status(504).json({ error: 'NGR record lookup timed out' });
    return res.status(500).json({ error: 'Kon dataset-metadata niet ophalen' });
  }
}
