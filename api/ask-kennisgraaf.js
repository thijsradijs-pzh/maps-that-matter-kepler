// api/ask-kennisgraaf.js
// Receives: POST { question: string }
// Returns:  { keywords: string[], reasoning: string }
//
// Turns a free-form Dutch question into candidate search terms for the
// Nationaal Georegister kennisgraaf. Terms are NOT trusted as-is — the
// frontend grounds them against the real topic/trefwoord vocabulary that
// was actually harvested from NGR (kennisgraaf-viewer/index.html), so a
// hallucinated term simply finds no match instead of showing fake data.

const SYSTEM_PROMPT = `Je bent een zoekassistent voor de Nederlandse geodata-catalogus (Nationaal Georegister).
Een gebruiker stelt een vraag in gewone taal over ruimtelijke data. Vertaal die vraag naar
3 tot 6 korte Nederlandse zoektermen (zelfstandige naamwoorden, geen zinnen) die in een
geodata-metadatacatalogus zouden voorkomen als onderwerp of trefwoord.

Voorbeelden:
"waar vind ik data over bodemvervuiling" -> ["bodem", "bodemkwaliteit", "vervuiling", "milieu"]
"ik zoek iets over overstromingsrisico in Zuid-Holland" -> ["overstroming", "waterveiligheid", "risico", "water"]
"is er data over fietspaden" -> ["fietspaden", "wegen", "infrastructuur", "verkeer"]

Retourneer UITSLUITEND geldige JSON:
{
  "reasoning": "1 zin in het Nederlands die uitlegt wat je zoekt",
  "keywords": ["term1", "term2", "term3"]
}`;

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
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: SYSTEM_PROMPT + '\n\nVraag: ' + question }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      let message = 'Gemini API error';
      try { message = JSON.parse(detail)?.error?.message || message; } catch {}
      return res.status(502).json({ error: message });
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(502).json({ error: 'Empty Gemini response' });

    const result = JSON.parse(text);
    if (!Array.isArray(result.keywords) || !result.keywords.length) {
      return res.status(502).json({ error: 'Incomplete response from AI', raw: result });
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
