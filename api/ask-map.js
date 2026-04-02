// api/ask-map.js
// Receives: POST { question: string }
// Returns:  { sql, title_nl, title_en, metric_column, color_scale }

const SCHEMA = `
Table name: datacube

Geographic identifiers (always include h3_id in SELECT):
  h3_id VARCHAR          — H3 hexagon ID (level 8), required for map rendering
  gemeentenaam VARCHAR   — municipality (e.g. 'Rotterdam', 'Amsterdam', 'Den Haag', 'Utrecht')
  wijknaam VARCHAR       — neighborhood name
  buurtnaam VARCHAR      — district/buurt name
  naam VARCHAR           — area name
  gemeentecode VARCHAR, wijkcode VARCHAR, buurtcode VARCHAR

Year dimension:
  year_int BIGINT        — 2018, 2019, 2020, 2021, 2022, 2023
  year_date VARCHAR      — ISO date string for the year

CBS Demographics (time-series, filter with year_int):
  aantal_inwoners_sum                              — total residents
  aantal_mannen_sum                                — male residents
  aantal_vrouwen_sum                               — female residents
  aantal_inwoners_0_tot_15_jaar_sum                — residents age 0-15
  aantal_inwoners_15_tot_25_jaar_sum               — residents age 15-25
  aantal_inwoners_25_tot_45_jaar_sum               — residents age 25-45
  aantal_inwoners_45_tot_65_jaar_sum               — residents age 45-65
  aantal_inwoners_65_jaar_en_ouder_sum             — residents age 65+
  aantal_geboorten_sum                             — births
  aantal_personen_met_uitkering_onder_aowlft_sum   — people on benefits (under pension age)
  percentage_niet_westerse_migr_achtergr_area_weighted_average  — % non-western background
  percentage_westerse_migr_achtergr_area_weighted_average       — % western migration background
  gemiddelde_huishoudensgrootte_area_weighted_average           — avg household size

CBS Housing & Economy (time-series, filter with year_int):
  aantal_woningen_sum                                         — total homes
  aantal_eenpersoonshuishoudens_sum                           — single-person households
  aantal_meerpersoonshuishoudens_zonder_kind_sum              — multi-person households without children
  aantal_eenouderhuishoudens_sum                              — single-parent households
  aantal_tweeouderhuishoudens_sum                             — two-parent households
  aantal_huurwoningen_in_bezit_woningcorporaties_sum          — social housing units
  aantal_niet_bewoonde_woningen_sum                           — unoccupied homes
  mediaan_inkomen_huishouden_area_weighted_average            — median household income (euros)
  gemiddelde_woz_waarde_woning_area_weighted_average          — avg WOZ property value (euros)
  percentage_koopwoningen_area_weighted_average               — % owner-occupied homes
  percentage_huurwoningen_area_weighted_average               — % rental homes
  gemiddeld_gasverbruik_woning_area_weighted_average          — avg gas use per home (m3/year)
  gemiddeld_elektriciteitsverbruik_woning_area_weighted_average — avg electricity per home (kWh/year)
  aantal_woningen_bouwjaar_voor_1945_sum                      — homes built before 1945

Environment (mostly year_int = 2023):
  geluid_lden DOUBLE     — noise level dB Lden (WHO norm: 53 dB)
  groenklasse DOUBLE     — green index 0-255
  hitte DOUBLE           — urban heat island index 0-255
  soortenrijkdomsklasse DOUBLE — biodiversity richness class
  waterberging DOUBLE    — water retention capacity
  groundheight DOUBLE    — ground elevation (m NAP)
  flooddepth_1 DOUBLE    — flood depth scenario 1 (meters)
  flooddepth_2 DOUBLE    — flood depth scenario 2 (meters)
  flooddepth_3 DOUBLE    — flood depth scenario 3 (meters)

Land use fractions (LGN, 0.0–1.0 where 1.0 = 100% of hexagon):
  loofbos_fraction                               — deciduous forest
  naaldbos_fraction                              — coniferous forest
  agrarisch_gras_fraction                        — agricultural grassland
  heide_fraction                                 — heathland
  bebouwing_in_primair_bebouwd_gebied_fraction   — built-up urban core
  glastuinbouw_fraction                          — greenhouse horticulture
  maïs_fraction                                  — maize fields
  zoet_water_fraction                            — freshwater bodies
  rietvegetatie_fraction                         — reed vegetation
  natuurgraslanden_fraction                      — natural grasslands
  zonneparken_fraction                           — solar parks

Distances to services (km, minimum within hexagon):
  dichtstbijzijnde_treinstation_afstand_in_km_min            — nearest train station
  dichtstbijzijnde_huisartsenpraktijk_afstand_in_km_min      — nearest GP/doctor
  dichtstbijzijnde_basisonderwijs_afstand_in_km_min          — nearest primary school
  dichtstbijzijnde_grote_supermarkt_afstand_in_km_min        — nearest supermarket
  dichtstbijzijnde_ziekenh_incl_buitenpoli_afst_in_km_min    — nearest hospital
  dichtstbijzijnde_cafe_afstand_in_km_min                    — nearest cafe
  dichtstbijzijnde_restaurant_afstand_in_km_min              — nearest restaurant
`;

const SYSTEM_PROMPT = `You are a SQL expert for a Dutch geospatial datacube. The dataset covers all 225,684 H3 hexagons (resolution 8) in the Netherlands with CBS statistics and LGN land use data from 2018 to 2023.

${SCHEMA}

RULES:
1. Only generate SELECT queries. Never use CREATE, DROP, INSERT, UPDATE, DELETE, or any DDL.
2. ALWAYS include h3_id in SELECT — it is required to render hexagons on the map.
3. ALWAYS include gemeentenaam or buurtnaam in SELECT for readable labels.
4. Use LIMIT at most 500. Default LIMIT is 100.
5. For time-specific questions, filter with year_int. Default to year_int = 2023 unless the question specifies a different year or a range.
6. For trend/change analysis over multiple years, GROUP BY h3_id, gemeentenaam, year_int and ORDER BY year_int.
7. For change between two years (e.g. 2018 vs 2023), use a self-join or two CTEs.
8. Numeric columns may be NULL — use IS NOT NULL or COALESCE where needed.
9. Column names are exact — copy them precisely from the schema above.
10. For population questions, filter WHERE aantal_inwoners_sum > 10 to exclude uninhabited areas.
11. metric_column must be a column name that appears in your SELECT clause.
12. For "where is X highest/lowest" or "top N municipalities/areas" questions: GROUP BY gemeentenaam (or buurtnaam/wijknaam if relevant), use AVG() or MAX() on the metric, and pick a representative h3_id with ANY_VALUE(h3_id). This avoids showing the same municipality many times. Example: SELECT ANY_VALUE(h3_id) AS h3_id, gemeentenaam, AVG(soortenrijkdomsklasse) AS soortenrijkdomsklasse FROM datacube WHERE year_int = 2023 GROUP BY gemeentenaam ORDER BY soortenrijkdomsklasse DESC LIMIT 50

Return ONLY valid JSON with exactly these fields:
{
  "sql": "SELECT ...",
  "title_nl": "Dutch title (max 60 chars)",
  "title_en": "English title (max 60 chars)",
  "metric_column": "the_column_used_for_map_coloring",
  "color_scale": "blue-orange"
}

color_scale options:
  "blue-orange"   — neutral numeric values (counts, distances, WOZ)
  "green-red"     — environment where green=good, red=bad (geluid, hitte)
  "blue-green"    — nature/ecology (groen, forest, biodiversity)
  "sequential"    — single-hue for proportions/percentages
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
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      // Surface the Gemini error message directly so the frontend can show it
      let message = 'Gemini API error';
      try { message = JSON.parse(detail)?.error?.message || message; } catch {}
      return res.status(502).json({ error: message, detail });
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(502).json({ error: 'Empty Gemini response' });

    const result = JSON.parse(text);

    // Safety: only allow SELECT (and WITH ... SELECT for CTEs)
    const sqlStart = (result.sql || '').trim().toLowerCase();
    if (!sqlStart.startsWith('select') && !sqlStart.startsWith('with')) {
      return res.status(400).json({ error: 'Only SELECT queries are allowed' });
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
