// api/proxy.js
export default async function handler(req, res) {
  const { url } = req.query;
  
  // Get Auth Header (Only used if the frontend sends it, e.g. for NSO)
  const authHeader = req.headers['x-proxy-auth'] || req.headers['authorization'];

  // 1. Robust CORS Headers (Safety net for all requests)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // We MUST allow these headers so the browser lets us send the password
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-proxy-auth, Authorization');

  // Handle "Pre-flight" checks (Browsers ask: "Can I send a password?")
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!url) {
    return res.status(400).send('Missing "url" parameter');
  }

  try {
    // 2. Prepare the Fetch Options
    const fetchOptions = {
      headers: {
        'User-Agent': 'MapsThatMatter-Proxy/1.0' // Keeps PDOK happy
      }
    };

    // ONLY add the password if the frontend actually sent one
    if (authHeader) {
        fetchOptions.headers['Authorization'] = authHeader;
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).send(errorText);
    }

    // 3. Handle Content-Type
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    // 4. Smart Caching (Your original logic + fallback)
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl) {
        res.setHeader('Cache-Control', cacheControl);
    } else {
        // Default to 24 hours for tiles (speeds up the map significantly)
        res.setHeader('Cache-Control', 'public, max-age=86400');
    }

    // 5. Send Binary Data
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);

  } catch (error) {
    console.error('Proxy Request Failed:', error);
    res.status(500).send(`Failed to fetch URL: ${error.message}`);
  }
}