// api/suggest-location.js
// Proxies to PDOK Locatieserver suggest endpoint (Dutch geocoder)
// Usage: GET /api/suggest-location?q=amster

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.status(200).json({ docs: [] });

  try {
    const params = new URLSearchParams({
      q: q.trim(),
      fq: 'type:(gemeente OR wijk OR buurt OR woonplaats)',
      rows: '6',
      fl: 'weergavenaam,type,gemeentenaam',
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
