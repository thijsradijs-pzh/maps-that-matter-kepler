// api/ask-wfs.js
// Receives: POST { question: string }
// Returns:  { wfsUrl, typeName, propertyNames, cqlFilter, aggregation,
//             h3Resolution, metric_column, title_nl, title_en, color_scale, ngr_keywords }

const SCHEMA = `
Available PDOK WFS data sources for the Netherlands:

────────────────────────────────────────────────────────────
1. CBS Vierkantstatistieken 100m (Statistics Netherlands, 100×100m grid)
────────────────────────────────────────────────────────────
URL pattern: https://service.pdok.nl/cbs/vierkantstatistieken100m/{year}/wfs/v1_0
Available years: 2003, 2008, 2019, 2021, 2023, 2024
TypeName: vierkantstatistieken100m:vierkant_100m
GeometryType: MultiPolygon (100×100m squares, Netherlands only)
Cell identifier: crs28992res100m  (e.g. "E85900N436000")

EXACT property names for 2024 (copy verbatim — wrong names return 0 results):
  Demographics:
    aantalInwoners              — total population
    aantalMannen                — male residents
    aantalVrouwen               — female residents
    aantalInwoners0Tot15Jaar    — residents age 0–15
    aantalInwoners15Tot25Jaar   — residents age 15–25
    aantalInwoners25Tot45Jaar   — residents age 25–45
    aantalInwoners45Tot65Jaar   — residents age 45–65
    aantalInwoners65JaarEnOuder — residents age 65+
    aantalGeboorten             — births
    percentageGebNederlandHerkomstNederland      — % born in NL with Dutch background
    percentageGebNederlandHerkomstOverigEuropa   — % born in NL, European background
    percentageGebNederlandHerkomstBuitenEuropa   — % born in NL, non-European background
    percentageGebBuitenNederlandHerkomstEuropa   — % born abroad, European background
    percentageGebBuitenNederlandHerkmstBuitenEuropa — % born abroad, non-European background
  Households:
    aantalPartHuishoudens                    — total households
    aantalEenpersoonshuishoudens             — single-person households
    aantalMeerpersoonshuishoudensZonderKind  — multi-person, no children
    aantalEenouderhuishoudens                — single-parent households
    aantalTweeouderhuishoudens               — two-parent households
    gemiddeldeHuishoudensgrootte             — avg household size
  Housing:
    aantalWoningen                             — total homes
    aantalNietBewoondeWoningen                 — unoccupied homes
    aantalHuurwoningenInBezitWoningcorporaties — social housing units
    aantalMeergezinsWoningen                   — multi-family homes (apartments)
    percentageKoopwoningen                     — % owner-occupied
    percentageHuurwoningen                     — % rental
    aantalWoningenBouwjaarVoor1945   — homes built before 1945
    aantalWoningenBouwjaar45Tot65    — homes built 1945–1965
    aantalWoningenBouwjaar65Tot75    — homes built 1965–1975
    aantalWoningenBouwjaar75Tot85    — homes built 1975–1985
    aantalWoningenBouwjaar85Tot95    — homes built 1985–1995
    aantalWoningenBouwjaar95Tot05    — homes built 1995–2005
    aantalWoningenBouwjaar05Tot15    — homes built 2005–2015
    aantalWoningenBouwjaar15EnLater  — homes built 2015 or later
  Energy (⚠ often suppressed by CBS — only published for cells with enough homes):
    gemiddeldGasverbruikWoning             — avg gas use per home (m³/year)
    gemiddeldElektriciteitsverbruikWoning  — avg electricity per home (kWh/year)
  Income & Benefits (⚠ often suppressed):
    aantalPersonenMetUitkeringOnderAowlft  — persons on benefits (below pension age)
  Housing values (⚠ frequently suppressed — CBS withholds when fewer than 5 homes per cell):
    gemiddeldeWozWaardeWoning              — avg WOZ property value (euros)
  Distances to services (km, nearest) — use avg aggregation:
    dichtstbijzijndeGroteSupermarktAfstandInKm        — nearest large supermarket
    dichtstbijzijndeWinkelsOvDagelLevensmAfstInKm     — nearest daily groceries store
    dichtstbijzijndeWarenhuisAfstandInKm               — nearest department store
    dichtstbijzijndeCafeAfstandInKm                    — nearest café
    dichtstbijzijndeCafetariaAfstandInKm               — nearest fast food / cafetaria
    dichtstbijzijndeRestaurantAfstandInKm               — nearest restaurant
    dichtstbijzijndeBioscoopAfstandInKm                — nearest cinema
    dichtstbijzijndeMuseumAfstandInKm                  — nearest museum
    dichtstbijzijndeTheaterAfstandInKm                 — nearest theatre
    dichtstbijzijndeBibliotheekAfstandInKm             — nearest library
    dichtstbijzijndeZwembadAfstandInKm                 — nearest swimming pool
    dichtstbijzijndeBasisonderwijsAfstandInKm          — nearest primary school
    dichtstbijzijndeHavoVwoAfstandInKm                 — nearest havo/vwo school
    dichtstbijzijndeVmboAfstandInKm                    — nearest vmbo school
    dichtstbijzijndeVoortgezetOnderwijsAfstandInKm     — nearest secondary school (any)
    dichtstbijzijndeKinderdagverblijfAfstandInKm       — nearest daycare
    dichtstbijzijndeBuitenschoolseOpvangAfstandInKm    — nearest after-school care
    dichtstbijzijndeHuisartsenpraktijkAfstandInKm      — nearest GP/doctor practice
    dichtstbijzijndeHuisartsenpostAfstandInKm          — nearest GP emergency post
    dichtstbijzijndeApotheekAfstandInKm                — nearest pharmacy
    dichtstbijzijndeZiekenhExclBuitenpoliAfstInKm      — nearest hospital (excl. outpatient)
    dichtstbijzijndeZiekenhInclBuitenpoliAfstInKm      — nearest hospital (incl. outpatient)
    dichtstbijzijndeTreinstationAfstandInKm            — nearest train station
    dichtstbijzijndeOverstapstationAfstandInKm         — nearest transfer station
    dichtstbijzijndeOpritHoofdverkeerswegAfstandInKm   — nearest motorway on-ramp
    dichtstbijzijndeBrandweerkazerneAfstandInKm        — nearest fire station
    dichtstbijzijndeAttractieparkAfstandInKm           — nearest theme park
    dichtstbijzijndePoppodiumAfstandInKm               — nearest music venue
    dichtstbijzijndeSaunaAfstandInKm                   — nearest sauna
    dichtstbijzijndeKunstijsbaanAfstandInKm            — nearest ice rink

────────────────────────────────────────────────────────────
2. BAG — Buildings and Addresses Register
────────────────────────────────────────────────────────────
URL: https://service.pdok.nl/lv/bag/wfs/v2_0
TypeNames:
  bag:pand — building footprints
    Properties: bouwjaar (construction year), status, gebruiksdoel (use type),
                oppervlakte_min, oppervlakte_max (floor area m²),
                aantal_verblijfsobjecten (number of units in building)
  bag:verblijfsobject — residential/commercial units (addresses)
    Properties: gebruiksdoel, oppervlakte (m²), status
  bag:woonplaats — city/place name polygons
    Properties: naam (place name)
GeometryType: MultiPolygon (building footprints; use for density / construction year maps)
`;

const SYSTEM_PROMPT = `You are a geospatial data expert. Convert natural language questions about the Netherlands into PDOK WFS API query parameters for H3 hexagon map visualization.

${SCHEMA}

RULES:
1. Choose the most appropriate source. CBS Vierkantstatistieken for demographics / housing / income. BAG for buildings, construction years, building density.
2. For CBS: default to year 2024 unless the question specifies a year. Prefer properties that are rarely suppressed: aantalInwoners, aantalWoningen, percentageKoopwoningen, aantalEenpersoonshuishoudens, distance properties. Avoid gemiddeldeWozWaardeWoning / gemiddeldGasverbruikWoning / gemiddeldElektriciteitsverbruikWoning unless specifically asked — these are suppressed in most cells.
3. propertyNames: array of EXACT column names from the schema above. Include the metric column you want to visualize plus crs28992res100m for CBS (for identification). Max 4 properties to keep response small.
4. cqlFilter: CQL filter string for attribute filtering (e.g. "aantalInwoners > 0"). Empty string if no filter.
5. aggregation: how to combine multiple features into one H3 cell:
   - For CBS Vierkantstatistieken: ALWAYS use "avg" — CBS cells are already per-100m² values; summing them gives nonsensical totals
   - "sum" — only for BAG counts (buildings, units)
   - "avg" — for all CBS properties (population density, percentages, distances, WOZ, energy)
   - "count" — to count number of BAG features per H3 cell
6. h3Resolution: 8 for city/region overview (~460m hexagons), 9 for neighborhood (~170m), 10 for building-level (~65m, only for BAG).
7. metric_column must be one of the propertyNames.
8. color_scale:
   - "sequential"  — single-hue gradient for counts / quantities
   - "blue-orange" — neutral diverging (income, WOZ, distances)
   - "green-red"   — where low=good, high=bad (energy use, pollution)
   - "blue-green"  — nature / greenery
9. ngr_keywords: 2–3 short Dutch nouns to discover related WMS layers on nationaalgeoregister.nl

Return ONLY valid JSON with exactly these fields:
{
  "reasoning": "1-2 sentences in Dutch explaining why you chose this source and metric (shown to the user as a short explanation)",
  "wfsUrl": "https://service.pdok.nl/...",
  "typeName": "namespace:typename",
  "propertyNames": ["prop1", "prop2"],
  "cqlFilter": "",
  "aggregation": "avg",
  "h3Resolution": 8,
  "metric_column": "the_property_to_visualize",
  "title_nl": "Dutch title (max 60 chars)",
  "title_en": "English title (max 60 chars)",
  "color_scale": "sequential",
  "ngr_keywords": ["keyword1", "keyword2"]
}
`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const question = (body.question || '').trim();
  if (question.length < 3) return res.status(400).json({ error: 'Question too short' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: SYSTEM_PROMPT + '\n\nQuestion: ' + question }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      let message = 'Gemini API error';
      try { message = JSON.parse(detail)?.error?.message || message; } catch {}
      return res.status(502).json({ error: message, detail });
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(502).json({ error: 'Empty Gemini response' });

    const result = JSON.parse(text);

    // Validate required fields
    if (!result.wfsUrl || !result.typeName || !result.propertyNames?.length) {
      return res.status(502).json({ error: 'Incomplete response from AI', raw: result });
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
