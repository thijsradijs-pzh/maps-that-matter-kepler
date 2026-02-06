export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send('Missing "url" parameter');
  }

  try {
    // 1. Fetch the requested URL (WMS Image or XML)
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Proxy error: ${response.status} ${response.statusText}`);
    }

    // 2. Get the data as a buffer (works for both images and text)
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Forward the Content-Type (e.g., image/png or application/xml)
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // 4. Send back to your app
    res.send(buffer);

  } catch (error) {
    console.error('Proxy Request Failed:', error);
    res.status(500).send(`Failed to fetch URL: ${error.message}`);
  }
}