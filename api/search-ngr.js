// api/search-ngr.js

export const config = {
  api: {
    // Schakel de automatische body-parser uit. 
    // Dit is essentieel om de ruwe XML-stream van de MCA en Agro-viewer te kunnen lezen.
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const NGR_URL = 'https://www.nationaalgeoregister.nl/geonetwork/srv/dut/csw';

  // Alleen POST toestaan, omdat beide frontends XML-zoekopdrachten versturen
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).send('Gebruik een POST-verzoek met een CSW XML-body.');
  }

  try {
    // 1. Lees de binnenkomende XML-stream van de frontend
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const rawBody = Buffer.concat(buffers).toString();

    // 2. Stuur de zoekvraag 1-op-1 door naar het Nationaal Georegister
    const response = await fetch(NGR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Accept': 'application/xml',
        // NGR vereist een User-Agent om verzoeken te accepteren
        'User-Agent': 'MapsThatMatter-Proxy/1.1' 
      },
      body: rawBody
    });

    // 3. Foutafhandeling voor de upstream server
    if (!response.ok) {
      const errorText = await response.text();
      console.error('NGR Upstream Error:', response.status, errorText);
      return res.status(response.status).send(errorText);
    }

    // 4. Stuur het resultaat terug naar de viewer
    const xmlData = await response.text();
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(xmlData);

  } catch (error) {
    console.error('NGR Proxy Search Error:', error);
    res.status(500).json({ 
      error: 'Interne Proxy Fout', 
      details: error.message 
    });
  }
}