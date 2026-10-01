// api/proxy.js
// CORS-proxy voor WMS/ArcGIS-services (gebiedsviewer, vraag-de-kaart).
//
// Bewust géén vaste lijst van hosts: gebiedsviewer laat gebruikers eigen
// MapServer-url's toevoegen en vraag-de-kaart haalt WMS'en uit het NGR, dus de
// hosts zijn niet vooraf bekend. In plaats daarvan (sinds 2026-10-01):
// - geen interne adressen, ook niet via DNS of een redirect (_safe-fetch.js);
// - geen Authorization-doorgifte meer -- geen enkele viewer gebruikte het, en
//   een open proxy die inloggegevens doorstuurt en 24 uur publiek cachet is
//   precies wat je niet wilt;
// - het antwoord wordt nooit als HTML of script op ons eigen domein geserveerd:
//   alleen bekende datatypes gaan door, de rest wordt octet-stream, en
//   CSP-sandbox + nosniff erop, zodat een geproxiede pagina geen XSS op
//   maps.mapsthatmatter.io kan worden.

import { safeFetch, UnsafeUrlError } from './_safe-fetch.js';

const PASSTHROUGH_TYPES = /^(image\/(png|jpe?g|gif|webp)|application\/(json|geo\+json|xml|vnd\.ogc\.[\w.+-]+|vnd\.google-earth\.kml\+xml)|text\/(xml|plain|csv))\b/i;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url');

  try {
    const response = await safeFetch(url, {
      headers: { 'User-Agent': 'MapsThatMatter-Proxy/1.0' },
      signal: AbortSignal.timeout(20000),
    });

    const contentType = response.headers.get('content-type') || '';
    res.setHeader('Content-Type', PASSTHROUGH_TYPES.test(contentType)
      ? contentType
      : 'application/octet-stream');

    if (!response.ok) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(response.status).send((await response.text()).slice(0, 2000));
    }

    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (err instanceof UnsafeUrlError) return res.status(400).send(err.message);
    if (err.name === 'TimeoutError') return res.status(504).send('Upstream request timed out');
    res.status(500).send('Proxy error');
  }
}
