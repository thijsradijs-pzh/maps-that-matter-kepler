// api/proxy.js
export default async function handler(req, res) {
  const { url } = req.query;

  // 1. CORS Headers (Safety net: ensures browser allows the request)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (!url) {
    return res.status(400).send('Missing "url" parameter');
  }

  try {
    // 2. Add User-Agent (Keeps PDOK/WUR happy)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MapsThatMatter-Proxy/1.0'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).send(errorText);
    }

    // 3. Handle Headers (Forward Content-Type and Cache-Control)
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    // Cache Control: Tell browser to cache tiles for 1 hour (speeds up map)
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl) {
        res.setHeader('Cache-Control', cacheControl);
    } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
    }

    // 4. Send Binary Data
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);

  } catch (error) {
    console.error('Proxy Request Failed:', error);
    res.status(500).send(`Failed to fetch URL: ${error.message}`);
  }
}