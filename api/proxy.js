// api/proxy.js
export default async function handler(req, res) {
  const { url } = req.query;
  const authHeader = req.headers['x-proxy-auth'] || req.headers['authorization'];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-proxy-auth, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!url) return res.status(400).send('Missing url');

  try {
    const headers = { 'User-Agent': 'MapsThatMatter-Proxy/1.0' };
    if (authHeader) headers['Authorization'] = authHeader;

    const response = await fetch(url, { headers });
    if (!response.ok) return res.status(response.status).send(await response.text());

    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).send(err.message);
  }
}