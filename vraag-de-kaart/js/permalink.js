// js/permalink.js

function pushQueryState(question, sql, metric, colorScale, currentLang) {
  const vs = currentViewState;
  const params = new URLSearchParams({
    q:      question,
    sql,
    metric,
    scale:  colorScale,
    lang:   currentLang,
    view:   [
      vs.longitude.toFixed(4),
      vs.latitude.toFixed(4),
      vs.zoom.toFixed(2),
      Math.round(vs.pitch),
      Math.round(vs.bearing),
    ].join(','),
  });
  history.replaceState({}, '', '?' + params.toString());
}

function readQueryState() {
  const params = new URLSearchParams(window.location.search);
  if (!params.get('sql')) return null;
  return {
    question: params.get('q')      || '',
    sql:      params.get('sql'),
    metric:   params.get('metric') || '',
    scale:    params.get('scale')  || 'blue-orange',
    lang:     params.get('lang')   || 'nl',
    view:     params.get('view')   || null,
  };
}

async function shareUrl() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    const btn = document.querySelector('.share-btn');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = '✓ ' + (lang === 'nl' ? 'Gekopieerd!' : 'Copied!');
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 2000);
    }
  } catch {
    const btn = document.querySelector('.share-btn');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = lang === 'nl' ? '📋 Kopieer URL uit adresbalk' : '📋 Copy URL from address bar';
      setTimeout(() => { btn.textContent = original; }, 3000);
    }
  }
}

function downloadCsv() {
  if (!currentRows?.length) return;
  const cols = Object.keys(currentRows[0]);
  const csv  = [
    cols.join(','),
    ...currentRows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vraag-de-kaart.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadGeoJson() {
  if (!currentRows?.length) return;
  const features = currentRows.map(r => {
    try {
      const boundary = h3.cellToBoundary(r.h3_id, true);
      return {
        type:       'Feature',
        geometry:   { type: 'Polygon', coordinates: [boundary] },
        properties: { ...r },
      };
    } catch { return null; }
  }).filter(Boolean);
  const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vraag-de-kaart.geojson';
  a.click();
  URL.revokeObjectURL(a.href);
}
