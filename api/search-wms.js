// api/search-wms.js
// Searches the Dutch National Geo Register (NGR) CSW for WMS layers matching a keyword.
// GET /api/search-wms?q=keyword
// Returns: { layers: [{ title, abstract, wmsUrl, layerName }] }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).end();

  const q = (req.query.q || '').trim().replace(/[<>&"]/g, '');
  if (q.length < 2) return res.status(200).json({ layers: [] });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<csw:GetRecords xmlns:csw="http://www.opengis.net/cat/csw/2.0.2"
               xmlns:ogc="http://www.opengis.net/ogc"
               service="CSW" version="2.0.2"
               resultType="results" maxRecords="10"
               outputSchema="http://www.opengis.net/cat/csw/2.0.2">
  <csw:Query typeNames="csw:Record">
    <csw:ElementSetName>full</csw:ElementSetName>
    <csw:Constraint version="1.1.0">
      <ogc:Filter>
        <ogc:PropertyIsLike wildCard="%" singleChar="_" escapeChar="\\">
          <ogc:PropertyName>AnyText</ogc:PropertyName>
          <ogc:Literal>%${q}%</ogc:Literal>
        </ogc:PropertyIsLike>
      </ogc:Filter>
    </csw:Constraint>
  </csw:Query>
</csw:GetRecords>`;

  try {
    const upstream = await fetch('https://www.nationaalgeoregister.nl/geonetwork/srv/dut/csw', {
      method:  'POST',
      headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml', 'User-Agent': 'MapsThatMatter/1.0' },
      body:    xml,
      signal:  AbortSignal.timeout(10000),
    });
    if (!upstream.ok) return res.status(200).json({ layers: [] });

    const text = await upstream.text();
    const layers = [];

    // Split on record boundaries (handles both csw:Record and dc:Record)
    const recordRe = /<(?:csw:)?Record>([\s\S]*?)<\/(?:csw:)?Record>/g;
    let m;
    while ((m = recordRe.exec(text)) !== null) {
      const rec = m[1];

      // Title
      const titleM = rec.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/);
      if (!titleM) continue;
      const title = titleM[1].replace(/<[^>]+>/g, '').trim();
      if (!title) continue;

      // Abstract (first 140 chars)
      const absM = rec.match(/<dct:abstract[^>]*>([\s\S]*?)<\/dct:abstract>/i);
      const abstract = absM ? absM[1].replace(/<[^>]+>/g, '').trim().slice(0, 140) : '';

      // Find dct:URI elements with protocol OGC:WMS
      const uriRe = /<dct:URI([^>]*)>([\s\S]*?)<\/dct:URI>/g;
      let um;
      while ((um = uriRe.exec(rec)) !== null) {
        const attrs = um[1];
        const uri   = um[2].trim();

        if (!attrs.includes('OGC:WMS'))         continue;
        if (!uri.startsWith('http'))             continue;

        // Layer name from name= attribute
        const nameM = attrs.match(/\bname="([^"]+)"/);
        let layerName = nameM ? nameM[1].trim() : '';

        // Fallback: layer name embedded in the URL as ?layers=X or &layers=X
        if (!layerName) {
          const urlLayerM = uri.match(/[?&]layers?=([^&]+)/i);
          if (urlLayerM) layerName = decodeURIComponent(urlLayerM[1]);
        }

        if (!layerName) continue; // can't render without a layer name

        // Strip query string from WMS base URL
        const wmsUrl = uri.split('?')[0];

        layers.push({ title, abstract, wmsUrl, layerName });
        break; // one WMS per record
      }

      if (layers.length >= 5) break;
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ layers });
  } catch {
    return res.status(200).json({ layers: [] });
  }
}
