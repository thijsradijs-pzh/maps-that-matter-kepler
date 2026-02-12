export default async function handler(req, res) {
  const { path } = req.query;
  const token = req.headers['x-agro-token'];

  if (!path) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  // FIXED: Changed v1 to v2
  const BASE_URL = 'https://agrodatacube.wur.nl/api/v2';
  const targetUrl = `${BASE_URL}/${path}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'token': token, // The API expects the header simply named 'token'
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const txt = await response.text();
      return res.status(response.status).send(txt);
    }

    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    console.error('Agro Proxy Error:', error);
    res.status(500).json({ error: error.message });
  }
}