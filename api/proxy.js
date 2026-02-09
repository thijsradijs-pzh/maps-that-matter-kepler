// api/proxy.js
export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('Missing "url" parameter');
  }

  try {
    // Add a User-Agent, as some APIs (like PDOK) block generic 'fetch' requests
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MapsThatMatter-Proxy/1.0'
      }
    });

    if (!response.ok) {
      // If the upstream (PDOK) fails, forward that specific status
      const errorText = await response.text();
      return res.status(response.status).send(errorText);
    }

    const contentType = response.headers.get('content-type');
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    res.send(buffer);

  } catch (error) {
    console.error('Proxy Request Failed:', error);
    res.status(500).send(`Failed to fetch URL: ${error.message}`);
  }
}