// api/ndvi-series.js
// Live NDVI-punttijdreeks uit het Copernicus Data Space Ecosystem via openEO.
//
// GET /api/ndvi-series?lon=4.8355&lat=52.1478[&start=2016-01-01][&end=2025-12-31][&index=ndvi]
// GET /api/ndvi-series?probe=1        -> 200 als de credentials er zijn, anders 503
//
// Gebruikt door /fenologie voor punten buiten de voorberekende kubus. De kubus
// zelf komt uit GRASS (scripts/export_fenologie_raster.py); dit endpoint is het
// tweede pad, zodat een klik overal in Nederland iets oplevert.
//
// Vereist twee env-vars in Vercel (CDSE service account, gratis):
//   CDSE_CLIENT_ID
//   CDSE_CLIENT_SECRET
// De secrets blijven server-side; de browser praat nooit rechtstreeks met CDSE.

const TOKEN_URL =
  'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const OPENEO_URL = 'https://openeo.dataspace.copernicus.eu/openeo/1.2';

// SCL-klassen die we weggooien: 3 cloud shadow, 8/9 cloud medium/high,
// 10 thin cirrus, 11 snow/ice.
const SCL_DROP = [3, 8, 9, 10, 11];

// Een synchrone openEO-run over tien jaar duurt tientallen seconden.
// 60 s is het maximum op het huidige Vercel-plan; met Pro kan dit in
// vercel.json onder "functions" naar 300 s.
export const config = { maxDuration: 60 };

const INDICES = {
  ndvi: { bands: ['B04', 'B08'], red: 0, nir: 1 },
  ndmi: { bands: ['B08', 'B11'], red: 1, nir: 0 },
};

let cachedToken = null; // { value, expires }

async function getToken() {
  const id = process.env.CDSE_CLIENT_ID;
  const secret = process.env.CDSE_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.expires > Date.now() + 30000) return cachedToken.value;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: id,
    client_secret: secret,
    // Zonder scope=openid geeft CDSE wel een geldig token, maar antwoordt
    // openEO met 403 "TokenInvalid" -- wat op een verlopen sleutel lijkt en
    // het niet is.
    scope: 'openid',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('CDSE-token geweigerd (' + res.status + ')');
  const json = await res.json();
  cachedToken = {
    value: json.access_token,
    expires: Date.now() + (json.expires_in || 300) * 1000,
  };
  return cachedToken.value;
}

/**
 * openEO process graph: laad de banden, gooi bewolkte pixels weg, reduceer
 * naar de index en middel over een piepklein vierkant rond het punt.
 */
function buildGraph(lon, lat, start, end, spec) {
  const d = 0.00007; // ~ 8 m, dus binnen een Sentinel-2 pixel van 10 m
  const bands = spec.bands.concat(['SCL']);
  const sclIndex = bands.length - 1;

  // reducer over de banddimensie
  const reducer = {
    red: { process_id: 'array_element', arguments: { data: { from_parameter: 'data' }, index: spec.red } },
    nir: { process_id: 'array_element', arguments: { data: { from_parameter: 'data' }, index: spec.nir } },
    scl: { process_id: 'array_element', arguments: { data: { from_parameter: 'data' }, index: sclIndex } },
    nd: {
      process_id: 'normalized_difference',
      arguments: { x: { from_node: 'nir' }, y: { from_node: 'red' } },
    },
  };
  SCL_DROP.forEach((cls, i) => {
    reducer['c' + i] = {
      process_id: 'eq',
      arguments: { x: { from_node: 'scl' }, y: cls },
    };
  });
  reducer.cloudy = {
    process_id: 'any',
    arguments: {
      data: SCL_DROP.map((_, i) => ({ from_node: 'c' + i })),
      ignore_nodata: true,
    },
  };
  // CDSE's backend laat een null-argument vallen en klaagt dan dat `accept`
  // ontbreekt: { value: cloudy, accept: null, reject: nd } geeft
  // "Process [if] expects a accept argument". Dus omgedraaid — toets op
  // NIET-bewolkt, geef de index als `accept` en laat `reject` weg, dat is
  // vanzelf null en daarmee nodata.
  reducer.clear = {
    process_id: 'not',
    arguments: { x: { from_node: 'cloudy' } },
  };
  reducer.out = {
    process_id: 'if',
    arguments: {
      value: { from_node: 'clear' },
      accept: { from_node: 'nd' },
    },
    result: true,
  };

  return {
    load: {
      process_id: 'load_collection',
      arguments: {
        id: 'SENTINEL2_L2A',
        spatial_extent: { west: lon - d, east: lon + d, south: lat - d, north: lat + d },
        temporal_extent: [start, end],
        bands,
        properties: {
          'eo:cloud_cover': {
            process_graph: {
              lte: { process_id: 'lte', arguments: { x: { from_parameter: 'value' }, y: 85 }, result: true },
            },
          },
        },
      },
    },
    index: {
      process_id: 'reduce_dimension',
      arguments: {
        data: { from_node: 'load' },
        dimension: 'bands',
        reducer: { process_graph: reducer },
      },
    },
    agg: {
      process_id: 'aggregate_spatial',
      arguments: {
        data: { from_node: 'index' },
        geometries: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [lon, lat] },
        },
        reducer: {
          process_graph: {
            mean: {
              process_id: 'mean',
              arguments: { data: { from_parameter: 'data' } },
              result: true,
            },
          },
        },
      },
    },
    save: {
      process_id: 'save_result',
      arguments: { data: { from_node: 'agg' }, format: 'JSON' },
      result: true,
    },
  };
}

function parseResult(raw) {
  // aggregate_spatial + JSON geeft { "<iso-datum>": [[waarde]] }
  const out = [];
  for (const key of Object.keys(raw || {}).sort()) {
    const entry = raw[key];
    let v = entry;
    while (Array.isArray(v)) v = v[0];
    if (v === null || v === undefined || typeof v !== 'number' || !isFinite(v)) continue;
    const date = key.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({ date, value: Math.round(v * 10000) / 10000 });
  }
  // meerdere scenes op dezelfde dag: mediaan
  const byDate = new Map();
  out.forEach((o) => {
    if (!byDate.has(o.date)) byDate.set(o.date, []);
    byDate.get(o.date).push(o.value);
  });
  return Array.from(byDate.entries()).map(([date, vals]) => {
    vals.sort((a, b) => a - b);
    const m = vals.length % 2
      ? vals[(vals.length - 1) >> 1]
      : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
    return { date, value: Math.round(m * 10000) / 10000 };
  }).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const hasCreds = Boolean(process.env.CDSE_CLIENT_ID && process.env.CDSE_CLIENT_SECRET);
  if (req.query.probe) {
    return hasCreds
      ? res.status(200).json({ available: true, backend: OPENEO_URL })
      : res.status(503).json({ available: false, error: 'CDSE-credentials ontbreken' });
  }
  if (!hasCreds) {
    return res.status(503).json({
      error: 'Live ophalen staat uit: zet CDSE_CLIENT_ID en CDSE_CLIENT_SECRET in Vercel.',
    });
  }

  const lon = parseFloat(req.query.lon);
  const lat = parseFloat(req.query.lat);
  if (!isFinite(lon) || !isFinite(lat)) {
    return res.status(400).json({ error: 'lon en lat zijn verplicht' });
  }
  // Ruim om Nederland heen; voorkomt dat dit endpoint een wereldwijde proxy wordt.
  if (lon < 3.0 || lon > 7.4 || lat < 50.6 || lat > 53.8) {
    return res.status(400).json({ error: 'punt ligt buiten Nederland' });
  }

  const indexKey = (req.query.index || 'ndvi').toLowerCase();
  const spec = INDICES[indexKey];
  if (!spec) return res.status(400).json({ error: 'onbekende index: ' + indexKey });

  const start = /^\d{4}-\d{2}-\d{2}$/.test(req.query.start || '') ? req.query.start : '2016-01-01';
  const end = /^\d{4}-\d{2}-\d{2}$/.test(req.query.end || '') ? req.query.end : '2025-12-31';

  try {
    const token = await getToken();
    const body = JSON.stringify({
      process: { process_graph: buildGraph(lon, lat, start, end, spec) },
    });
    const result = await fetch(OPENEO_URL + '/result', {
      method: 'POST',
      headers: {
        // openEO-conventie voor OIDC: Bearer oidc/<provider>/<token>,
        // niet een kaal Bearer <token>. Provider-id uit /credentials/oidc.
        Authorization: 'Bearer oidc/CDSE/' + token,
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(52000),
    });
    if (!result.ok) {
      const text = await result.text();
      return res.status(502).json({
        error: 'openEO gaf ' + result.status,
        detail: text.slice(0, 400),
      });
    }
    const raw = await result.json();
    const observations = parseResult(raw);
    // reeksen veranderen alleen als er een nieuwe opname bijkomt
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({
      provider: 'openeo',
      backend: OPENEO_URL,
      collection: 'SENTINEL2_L2A',
      index: indexKey.toUpperCase(),
      lon,
      lat,
      period: [start, end],
      n: observations.length,
      observations,
    });
  } catch (err) {
    return res.status(502).json({ error: 'live ophalen mislukt', detail: String(err).slice(0, 300) });
  }
}
