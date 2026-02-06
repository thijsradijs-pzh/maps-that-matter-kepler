export default async function handler(req, res) {
  // The official NGR CSW endpoint
  const NGR_URL = 'https://www.nationaalgeoregister.nl/geonetwork/srv/dut/csw';

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // Forward the XML body from your frontend to NGR
    const response = await fetch(NGR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Accept': 'application/xml'
      },
      body: req.body // Vercel passes the body string here
    });

    if (!response.ok) {
      throw new Error(`NGR responded with ${response.status}`);
    }

    // Get the XML text back
    const data = await response.text();

    // Return the XML to your frontend
    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(data);

  } catch (error) {
    console.error('NGR Proxy Error:', error);
    res.status(500).json({ error: 'Failed to fetch from Nationaal Geo Register' });
  }
}