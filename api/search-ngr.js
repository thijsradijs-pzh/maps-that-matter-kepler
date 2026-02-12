// api/search-ngr.js
export default async function handler(req, res) {
  const { q } = req.query;

  // 1. Validate Input
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  // 2. Define NGR Endpoint
  const cswUrl = 'https://nationaalgeoregister.nl/geonetwork/srv/dut/csw';

  // 3. Construct CSW XML Query (Standard 2.0.2)
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<csw:GetRecords xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" 
                xmlns:ogc="http://www.opengis.net/ogc" 
                service="CSW" 
                version="2.0.2" 
                resultType="results" 
                startPosition="1" 
                maxRecords="20" 
                outputFormat="application/xml" 
                outputSchema="http://www.opengis.net/cat/csw/2.0.2">
  <csw:Query typeNames="csw:Record">
    <csw:ElementSetName>full</csw:ElementSetName>
    <csw:Constraint version="1.1.0">
      <ogc:Filter>
        <ogc:And>
          <ogc:PropertyIsLike wildCard="%" singleChar="_" escapeChar="\\">
            <ogc:PropertyName>AnyText</ogc:PropertyName>
            <ogc:Literal>%${q}%</ogc:Literal>
          </ogc:PropertyIsLike>
          <ogc:PropertyIsEqualTo>
            <ogc:PropertyName>type</ogc:PropertyName>
            <ogc:Literal>service</ogc:Literal>
          </ogc:PropertyIsEqualTo>
        </ogc:And>
      </ogc:Filter>
    </csw:Constraint>
  </csw:Query>
</csw:GetRecords>`;

  try {
    console.log(`Searching NGR for: ${q}`); // Debug Log

    const response = await fetch(cswUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'User-Agent': 'AgroViewer/1.0 (MapsThatMatter)', // REQUIRED by NGR
        'Accept': 'application/xml'
      },
      body: body
    });

    // 4. Handle Upstream Errors
    if (!response.ok) {
      const errorText = await response.text();
      console.error('NGR Upstream Error:', response.status, errorText);
      return res.status(response.status).send(errorText);
    }

    // 5. Return XML
    const xmlText = await response.text();
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(xmlText);

  } catch (error) {
    console.error('NGR Search Script Error:', error);
    res.status(500).json({ error: 'Internal Server Error: ' + error.message });
  }
}