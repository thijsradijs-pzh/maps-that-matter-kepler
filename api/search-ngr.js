// api/search-ngr.js
export const config = {
  api: {
    bodyParser: false, // Disable default parsing to handle XML stream manually
  },
};

export default async function handler(req, res) {
  const NGR_URL = 'https://www.nationaalgeoregister.nl/geonetwork/srv/dut/csw';

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. Read the raw body stream from the request
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const rawBody = Buffer.concat(buffers).toString();

    // 2. Forward the raw XML string to NGR
    const response = await fetch(NGR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Accept': 'application/xml',
        // Optional: Pass through user agent to avoid blocking
        'User-Agent': 'MapsThatMatter-Proxy/1.0' 
      },
      body: rawBody
    });

    if (!response.ok) {
      // Forward the upstream error text for debugging
      const errorText = await response.text();
      throw new Error(`NGR responded with ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await response.text();
    
    // 3. Return the XML response
    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(data);

  } catch (error) {
    console.error('NGR Proxy Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch from Nationaal Geo Register',
      details: error.message 
    });
  }
}