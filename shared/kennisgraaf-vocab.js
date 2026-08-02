// shared/kennisgraaf-vocab.js
// Pure grounding functions over the kennisgraaf NGR graph — no DOM dependency.
// Used by vraag-de-kennisgraaf. kennisgraaf-viewer keeps its own inline copy.

function kgNormalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function kgLevenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], row[j - 1]);
    }
    prev = row;
  }
  return prev[b.length];
}

// Builds a searchable index of topic/trefwoord nodes from a kennisgraaf graph
// object (shape: { nodes: [...], links: [...] }, as served from /data/kennisgraaf_ngr.json).
function kgBuildVocabIndex(graph) {
  return graph.nodes
    .filter(n => n.type === 'topic' || n.type === 'trefwoord')
    .map(n => ({ id: n.id, norm: kgNormalize(n.label), node: n }));
}

// Finds real graph terms matching a (possibly hallucinated) AI-proposed term.
// Only terms that actually occur in the catalogue are ever returned.
function kgMatchTerm(vocab, term, maxResults = 5) {
  const q = kgNormalize(term);
  if (!q) return [];
  const scored = [];
  for (const v of vocab) {
    let score = 0;
    if (v.norm === q) score = 1.0;
    else if (v.norm.includes(q) || q.includes(v.norm)) score = 0.75;
    else {
      const dist = kgLevenshtein(q, v.norm);
      const maxLen = Math.max(q.length, v.norm.length);
      if (maxLen > 3 && dist <= Math.ceil(maxLen * 0.3)) score = 0.55 * (1 - dist / maxLen);
    }
    if (score > 0.3) scored.push({ ...v, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { kgNormalize, kgLevenshtein, kgBuildVocabIndex, kgMatchTerm };
}
