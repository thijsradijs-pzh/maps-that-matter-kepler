// api/proxy.js
export default async function handler(req, res) {
  const { url } = req.query;
  const authHeader = req.headers['x-proxy-auth'] || req.headers['authorization'];

  // CORS - Allow everything
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-proxy-auth, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!url) return res.status(400).send('Missing "url" parameter');

  try {
    const headers = {
      'User-Agent': 'MapsThatMatter-Proxy/1.0'
    };

    // Forward Authentication if provided
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const txt = await response.text();
      return res.status(response.status).send(txt);
    }

    // Forward Content-Type
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    // Cache (Speed up the map)
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));

  } catch (error) {
    console.error("Proxy Error:", error);
    res.status(500).send(error.message);
  }
}