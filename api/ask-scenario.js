// api/ask-scenario.js
// POST { question: string }
// Returns spatial scenario analysis: dual SQL, assumptions, reasoning log
//
// Inspired by Geo-GraphRAG (FOSS4G 2026): combining DGGS aggregate reasoning (H3 datacube)
// with policy knowledge context for exploratory spatial questions.

const DATACUBE_SCHEMA = `
Table: datacube  (H3 resolution 8, ~460 m cells, 225,684 hexagons, heel Nederland)

Geographic:
  h3_id VARCHAR         — H3 hex ID (altijd opnemen in SELECT)
  gemeentenaam VARCHAR  — gemeente (bijv. 'Rotterdam', 'Delft', 'Den Haag', 'Leiden', 'Goeree-Overflakkee')
  wijknaam VARCHAR, buurtnaam VARCHAR

Time: year_int BIGINT   — 2018, 2019, 2020, 2021, 2022, 2023

Environment [gebruik year_int = 2023, echte waarden]:
  groenklasse DOUBLE [0–255]            — stedelijk groen index (hoger = meer groen)
  hitte DOUBLE [0–255]                  — hitte-eiland (hoger = heter)
  soortenrijkdomsklasse DOUBLE [0–255]  — biodiversiteit (hoger = rijker)
  geluid_lden DOUBLE [dB]               — omgevingsgeluid (WHO norm ≤53 dB)
  waterberging DOUBLE                   — waterbergingscapaciteit
  groundheight DOUBLE [m NAP]           — maaiveldniveau
  flooddepth_1 DOUBLE [m]              — overstromingsdiepte scenario 1
  flooddepth_2 DOUBLE [m]              — overstromingsdiepte scenario 2
  flooddepth_3 DOUBLE [m]              — overstromingsdiepte scenario 3

Land use [fracties 0.0–1.0, gebruik year_int = 2023]:
  agrarisch_gras_fraction        — landbouwgrasland
  loofbos_fraction               — loofbos
  naaldbos_fraction              — naaldbos
  maïs_fraction                  — maïs
  glastuinbouw_fraction          — glastuinbouw
  natuurgraslanden_fraction      — natuurgrasland
  heide_fraction                 — heide
  rietvegetatie_fraction         — rietvegetatie
  zoet_water_fraction            — zoet water
  zonneparken_fraction           — zonneparken
  bebouwing_in_primair_bebouwd_gebied_fraction — bestaande bebouwing

Demographics [tijdreeks, filter op year_int]:
  aantal_inwoners_sum BIGINT
  aantal_woningen_sum BIGINT
  mediaan_inkomen_huishouden_area_weighted_average DOUBLE [€]

Distances [km]:
  dichtstbijzijnde_treinstation_afstand_in_km_min DOUBLE
  dichtstbijzijnde_basisonderwijs_afstand_in_km_min DOUBLE
  dichtstbijzijnde_grote_supermarkt_afstand_in_km_min DOUBLE
`;

const POLICY_CONTEXT = `
Beleidskader Provincie Zuid-Holland:
- Woningbouwopgave: 240.000 extra woningen t/m 2030
- Natuur Netwerk Nederland (NNN): beschermde gebieden, bebouwing niet toegestaan
- EU Natuurherstelverordening (2024): herstel ≥20% gedegradeerde ecosystemen voor 2030
- Klimaatadaptatie: waterberging en hitte-eiland reductie zijn speerpunten
- WHO geluidsnorm: ≤53 dB Lden voor woongebieden
- Ruimtelijk Arrangement Rijk–ZH: balans wonen, werken en natuur
`;

function buildPrompt(question) {
  return `Je bent een ruimtelijke scenario-analist voor Provincie Zuid-Holland (Geo-GraphRAG aanpak).
Je analyseert beleidsvragen en genereert ruimtelijke scenario's op basis van H3-hexagon data.

GEBRUIKERSVRAAG: "${question}"

${DATACUBE_SCHEMA}

${POLICY_CONTEXT}

CLASSIFICEER DE VRAAG ALS ÉÉN VAN:
- "descriptief": beschrijft huidige situatie → alleen base_sql nodig
- "wat-als": simuleert hypothetisch scenario ("wat als...", "stel dat...") → base_sql + scenario_sql
- "conflict": identificeert spanning tussen twee doelen ("botst", "conflict", "tegenstrijdig") → base_sql berekent conflict_score
- "vergelijking": vergelijkt twee gebieden ("vergelijk", "versus", "verschil") → base_sql voor A, scenario_sql voor B

DuckDB SQL REGELS (strikt volgen):
1. Altijd h3_id opnemen in SELECT
2. De te visualiseren metriek aliaseren als "waarde"
3. Berekende expressies altijd casten: CAST(expr AS DOUBLE)
4. Milieu/landgebruik data: filter op year_int = 2023
5. Demografie: filter op year_int = 2022 (2023 is onvolledig)
6. Gemeente filter: WHERE gemeentenaam = 'Exacte Naam' AND year_int = 2023
7. NULL-veilig: COALESCE(kolom, 0.0)
8. Geen subqueries buiten CTE. Geen window functions.

KRITISCHE WAARSCHUWING OVER DREMPELWAARDEN:
groenklasse, hitte en soortenrijkdomsklasse zijn 0-255 geïndexeerde waarden maar de werkelijke
verdeling varieert sterk per gemeente. In stedelijke gemeenten (Rotterdam, Delft, Den Haag)
liggen typische waarden voor groenklasse tussen 0-30. In landelijke gemeenten (Goeree-Overflakkee,
Hoeksche Waard) kan groenklasse oplopen tot 80-200. Gebruik NOOIT vaste absolute drempels zoals
groenklasse > 150 — die treffen in een stad nul hexagonen en leveren een zinloze scenario-SQL op.

Gebruik altijd RELATIEVE drempels via CTE met AVG of PERCENTILE:
  WITH gemeente_stats AS (
    SELECT AVG(groenklasse) as avg_groen,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY groenklasse) as p75_groen
    FROM datacube WHERE gemeentenaam = 'Delft' AND year_int = 2023
  )
  SELECT d.h3_id,
    CAST(CASE
      WHEN d.groenklasse > (SELECT p75_groen FROM gemeente_stats)
           AND d.bebouwing_in_primair_bebouwd_gebied_fraction < 0.3
        THEN GREATEST(0.0, d.groenklasse * 0.25)
      ELSE d.groenklasse
    END AS DOUBLE) AS waarde
  FROM datacube d WHERE d.gemeentenaam = 'Delft' AND d.year_int = 2023

WAT-ALS SCENARIO AANPAK:
base_sql = huidige situatie, scenario_sql = gesimuleerd resultaat via CASE WHEN transformatie.
Gebruik bovenstaand CTE-patroon met relatieve drempels (AVG / PERCENTILE_CONT).
Zorg altijd dat scenario_sql andere waarden geeft dan base_sql voor minstens een deel van de hexagonen.

CONFLICT SCORE AANPAK (hoog = sterke spanning):
Voorbeeld (natuur vs. woningbouwpotentie):
  SELECT h3_id,
    CAST(
      (COALESCE(soortenrijkdomsklasse, 0) / 255.0) *
      (COALESCE(agrarisch_gras_fraction, 0) + COALESCE(loofbos_fraction, 0) + COALESCE(natuurgraslanden_fraction, 0)) * 255.0
    AS DOUBLE) AS waarde
  FROM datacube WHERE gemeentenaam = 'Rotterdam' AND year_int = 2023

RETOURNEER UITSLUITEND GELDIGE JSON (geen markdown, geen tekst buiten de JSON):
{
  "scenario_type": "descriptief|wat-als|conflict|vergelijking",
  "title_nl": "Beknopte beschrijvende titel",
  "base_sql": "SELECT h3_id, ... AS waarde FROM datacube WHERE ...",
  "scenario_sql": null,
  "base_label": "Huidige situatie (2023)",
  "scenario_label": null,
  "assumptions": [
    "Aanname 1: ...",
    "Aanname 2: ...",
    "Aanname 3: ..."
  ],
  "reasoning_steps": [
    {"step": "Vraaganalyse", "content": "De vraag gaat over..."},
    {"step": "Dataselectie", "content": "We gebruiken kolom X omdat..."},
    {"step": "Methodiek", "content": "De berekening werkt als volgt..."},
    {"step": "Beperkingen", "content": "Dit model vereenvoudigt doordat..."}
  ],
  "color_scale": "conflict|nature|heat|sequential",
  "unit": "index|m|km|€|dB|score"
}

Instructies per type:
- wat-als: vul scenario_sql en scenario_label in; leg simulatielogica uit in Methodiek
- vergelijking: vul scenario_sql en scenario_label in (beide gebieden, zelfde metriek als "waarde")
- conflict: color_scale = "conflict"; leg conflict-formule uit in aannames
- groen/natuur metrics: color_scale = "nature"
- hitte/geluid/overstroming: color_scale = "heat"
`;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') return res.status(405).end('Method not allowed');

  const { question } = req.body || {};
  if (!question?.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  let geminiRes;
  try {
    geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(question) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
        })
      }
    );
  } catch (err) {
    return res.status(504).json({ error: 'Gemini timeout of netwerkfout', detail: err.message });
  }

  if (!geminiRes.ok) {
    const detail = await geminiRes.text().catch(() => '');
    return res.status(502).json({ error: 'Gemini API fout', detail: detail.slice(0, 300) });
  }

  const data = await geminiRes.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!raw) return res.status(502).json({ error: 'Lege response van Gemini' });

  let result;
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    result = JSON.parse(cleaned);
  } catch {
    return res.status(502).json({ error: 'Kon JSON niet parsen', raw: raw.slice(0, 500) });
  }

  // SQL safety: only SELECT or CTE queries allowed
  for (const key of ['base_sql', 'scenario_sql']) {
    const sql = result[key];
    if (!sql) continue;
    const t = sql.trim().toLowerCase();
    if (!t.startsWith('select') && !t.startsWith('with')) {
      return res.status(400).json({ error: `Onveilige SQL in ${key}` });
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(result);
};
