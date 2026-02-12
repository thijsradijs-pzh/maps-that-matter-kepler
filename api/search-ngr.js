// api/search-ngr.js
export default async function handler(req, res) {
  const { q } = req.query;

  if (!q) {
    return res.status(400).send('Query parameter "q" is required');
  }

  // NGR CSW Endpoint
  const cswUrl = 'https://nationaalgeoregister.nl/geonetwork/srv/dut/csw';

  // Construct the XML Query
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<csw:GetRecords xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" 
                xmlns:ogc="http://www.opengis.net/ogc" 
                service="CSW" 
                version="2.0.2" 
                resultType="results" 
                startPosition="1" 
                maxRecords="15" 
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
    const response = await fetch(cswUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'User-Agent': 'MapsThatMatter/1.0' // NGR blocks requests without User-Agent
      },
      body: body
    });

    const xml = await response.text();
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(xml);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}