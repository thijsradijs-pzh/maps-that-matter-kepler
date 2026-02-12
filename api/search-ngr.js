// api/search-ngr.js
export const config = {
  api: {
    bodyParser: false, // Disable default parsing to handle XML stream manually
  },
};

It seems like we have two separate issues:

NGR Search: The search logic was relying on an old external script (csw-search.js) which isn't connected correctly anymore. We will move that logic directly into app.js.

NSO 500 Error: This is likely a URL construction error. The URL we built (.../wmts/LAYER/wmts) is slightly wrong for NSO, causing the server to reject it, which crashes the proxy or returns an error the proxy doesn't handle gracefully.

Here is the fix for both.

Step 1: Fix api/search-ngr.js (Server-Side)
First, ensure you have the server-side script that actually performs the search. Create/Update this file in your api/ folder.

File: api/search-ngr.js

JavaScript

export default async function handler(req, res) {
  const { q } = req.query;
  
  if (!q) return res.status(400).json({ error: 'Query required' });

  // CSW Endpoint for Nationaal Georegister
  const cswUrl = 'https://nationaalgeoregister.nl/geonetwork/srv/dut/csw';
  
  const body = `
    <csw:GetRecords 
      xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" 
      xmlns:ogc="http://www.opengis.net/ogc" 
      service="CSW" version="2.0.2" 
      resultType="results" startPosition="1" maxRecords="15" outputFormat="application/xml" 
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
    </csw:GetRecords>
  `;

  try {
    const response = await fetch(cswUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: body
    });
    
    const text = await response.text();
    res.setHeader('Content-Type', 'text/xml');
    res.send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}