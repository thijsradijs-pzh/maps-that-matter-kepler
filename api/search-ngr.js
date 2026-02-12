// api/search-ngr.js
export const config = {
  api: {
    bodyParser: false, // Required to handle the XML body stream manually
  },
};

export default async function handler(req, res) {
  const NGR_URL = 'https://www.nationaalgeoregister.nl/geonetwork/srv/dut/csw';

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // Read the raw XML stream from the frontend
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const rawBody = Buffer.concat(buffers).toString();

    const response = await fetch(NGR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Accept': 'application/xml',
        'User-Agent': 'MapsThatMatter-Proxy/1.0' 
      },
      body: rawBody
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).send(errorText);
    }

    const data = await response.text();
    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(data);

  } catch (error) {
    res.status(500).json({ error: 'NGR Proxy Error', details: error.message });
  }
}