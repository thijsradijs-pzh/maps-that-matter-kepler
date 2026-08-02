// api/pdok-location.js
// GET /api/pdok-location?q=<place name>
//
// Resolves a Dutch place name (gemeente, woonplaats, wijk/buurt, provincie) to a
// bounding box, via the PDOK Location API — the successor to the legacy
// Locatieserver v3 (see api/suggest-location.js), which only ever returns a
// centroid point. Location API's search results include a real `bbox` per
// feature (the boundary's extent), which is what's actually needed to scope a
// WFS GetFeature request to "data near <place>".
//
// Returns: { display_name, bbox: [minLon, minLat, maxLon, maxLat] } | { bbox: null }
// `bbox: null` (200) is a normal outcome when nothing matches — not an error.

// Order matters: preferred collection when a query names a place exactly,
// e.g. "Utrecht" should resolve to the municipality, not a same-named wijk.
const COLLECTIONS = ['gemeentegebied', 'woonplaats', 'plaats', 'provinciegebied'];
const COLLECTION_PRIORITY = Object.fromEntries(COLLECTIONS.map((c, i) => [c, i]));
const BASE = 'https://api.pdok.nl/kadaster/location-api/v1/search';

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// display_name looks like "Utrecht, Utrecht, Utrecht" (woonplaats),
// "Gemeente Utrecht, Utrecht" (gemeentegebied), "Provincie Utrecht"
// (provinciegebied), or "Utrechtseweg (wijk)" (plaats). Strip the
// administrative prefix and anything from the first "," or "(" onward to
// get the bit that should match a bare place-name query.
function primaryName(displayName) {
  return normalize(displayName)
    .replace(/^(gemeente|provincie)\s+/, '')
    .split(/[,(]/)[0]
    .trim();
}

// Location API's own relevance score doesn't distinguish "the municipality"
// from "a same-named neighbourhood elsewhere" — a plain query like "Utrecht"
// can score a minor wijk above the actual city. Prefer a feature whose
// primary name exactly matches the query, ranked by collection priority;
// only fall back to raw score when nothing matches exactly (partial/fuzzy
// queries, e.g. "Rotterdam-Zuid").
function pickBest(features, query) {
  const q = normalize(query);
  const withBbox = features.filter(f => Array.isArray(f.bbox) && f.bbox.length === 4);
  const exact = withBbox
    .filter(f => primaryName(f.properties?.display_name) === q)
    .sort((a, b) => (COLLECTION_PRIORITY[a.properties?.collection_id] ?? 99) -
                     (COLLECTION_PRIORITY[b.properties?.collection_id] ?? 99));
  if (exact.length) return exact[0];
  return withBbox.sort((a, b) => (b.properties?.score || 0) - (a.properties?.score || 0))[0];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.status(200).json({ bbox: null });

  const params = new URLSearchParams({ q });
  COLLECTIONS.forEach(c => params.set(`${c}[version]`, '1'));

  try {
    const upstream = await fetch(`${BASE}?${params}`, {
      headers: { 'User-Agent': 'MapsThatMatter/1.0', Accept: 'application/geo+json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) return res.status(200).json({ bbox: null });

    const data = await upstream.json();
    const best = pickBest(data.features || [], q);

    if (!best) return res.status(200).json({ bbox: null });

    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({
      display_name: best.properties?.display_name || q,
      bbox: best.bbox,
    });
  } catch {
    return res.status(200).json({ bbox: null });
  }
}
