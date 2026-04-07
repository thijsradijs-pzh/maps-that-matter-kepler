// api/suggest-location.js
// Proxies to PDOK Locatieserver (Dutch geocoder)
//
// GET /api/suggest-location?q=amster
//   → { docs: [{ id, weergavenaam, type, gemeentenaam }] }
//
// GET /api/suggest-location?id=<locatieserver_id>
//   → { doc: { weergavenaam, type, gemeentenaam, centroide_ll } }
//      centroide_ll is WKT: "POINT(lon lat)" in WGS84

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  // Lookup mode: resolve a locatieserver id to centroid + type
  if (req.query.id) {
    try {
      const upstream = await fetch(
        `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${encodeURIComponent(req.query.id)}&fl=weergavenaam,type,gemeentenaam,centroide_ll`,
        { headers: { 'User-Agent': 'MapsThatMatter/1.0' } }
      );
      if (!upstream.ok) return res.status(200).json({ doc: null });
      const data = await upstream.json();
      const doc = data.response?.docs?.[0] || null;
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).json({ doc });
    } catch {
      return res.status(200).json({ doc: null });
    }
  }

  // Suggest mode: autocomplete by query string
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.status(200).json({ docs: [] });

  try {
    const params = new URLSearchParams({
      q: q.trim(),
      fq: 'type:(gemeente OR wijk OR buurt OR woonplaats)',
      rows: '6',
      fl: 'id,weergavenaam,type,gemeentenaam',
    });

    const upstream = await fetch(
      `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?${params}`,
      { headers: { 'User-Agent': 'MapsThatMatter/1.0' } }
    );

    if (!upstream.ok) return res.status(200).json({ docs: [] });

    const data = await upstream.json();
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ docs: data.response?.docs || [] });
  } catch {
    return res.status(200).json({ docs: [] });
  }
}
