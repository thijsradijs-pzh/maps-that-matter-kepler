export default async function handler(req, res) {
  const { path } = req.query;
  // Read the token from the custom header sent by the frontend
  const token = req.headers['x-agro-token'];

  if (!path) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  // Define the WUR Base URL
  const BASE_URL = 'https://agrodatacube.wur.nl/api/v1';
  const targetUrl = `${BASE_URL}/${path}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'token': token, // Pass the client-provided token
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const txt = await response.text();
      // Forward the status code from AgroDataCube (e.g., 401 if token is invalid)
      return res.status(response.status).send(txt);
    }

    const data = await response.json();
    res.status(200).json(data);

  } catch (error) {
    console.error('Agro Proxy Error:', error);
    res.status(500).json({ error: error.message });
  }
}