// js/app.js

// --- STATE ---
const loader      = new DuckDBLoader();
let   deckInstance = null;
let   lang         = 'nl';
let   acItems      = [];
let   acFocused    = -1;
let   busy         = false;

let currentViewState = { longitude: 5.1, latitude: 52.2, zoom: 7, pitch: 40, bearing: 0 };
let currentQuestion  = '';

const wmsLayers   = new Map();
const _ngrData    = {};
let   currentRows = null, currentMetric = null, currentColorScale = 'blue-orange';

// --- SUBMIT ---
async function submitQuestion(question) {
  if (busy || !question.trim()) return;
  busy = true;
  closeAutocomplete();
  document.getElementById('submit-btn').disabled = true;

  addUserMessage(question);
  const thinkingEl = addThinking();

  let result;
  try {
    const res = await fetch('/api/ask-map', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ question }),
    });
    result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || 'API fout');
  } catch (err) {
    thinkingEl.remove();
    addError((lang === 'nl' ? 'Fout: ' : 'Error: ') + err.message);
    busy = false;
    document.getElementById('submit-btn').disabled = false;
    return;
  }

  const { sql, title_nl, title_en, metric_column, color_scale } = result;

  // Safety: only run SELECT (or WITH...SELECT for CTEs)
  if (!sql?.trim().toLowerCase().startsWith('select') && !sql?.trim().toLowerCase().startsWith('with')) {
    thinkingEl.remove();
    addError('Onveilige query geweigerd / Unsafe query rejected');
    busy = false;
    document.getElementById('submit-btn').disabled = false;
    return;
  }

  let rows;
  try {
    rows = await loader.query(sql);
  } catch (err) {
    thinkingEl.remove();
    addError('SQL fout: ' + err.message);
    busy = false;
    document.getElementById('submit-btn').disabled = false;
    return;
  }

  thinkingEl.remove();

  if (!rows.length) {
    addError(lang === 'nl' ? 'Geen resultaten gevonden.' : 'No results found.');
    busy = false;
    document.getElementById('submit-btn').disabled = false;
    return;
  }

  const title = lang === 'nl' ? title_nl : title_en;
  const mc    = rows[0].hasOwnProperty(metric_column) ? metric_column : Object.keys(rows[0]).find(k => k !== 'h3_id' && k !== 'gemeentenaam' && k !== 'buurtnaam' && k !== 'naam' && k !== 'year_int' && k !== 'wijknaam') || Object.keys(rows[0])[0];

  addResultMessage(title, rows, mc, sql);
  addTrendChart(mc);
  renderLayer(rows, mc, color_scale || 'blue-orange');
  flyToResults(rows);

  currentQuestion = question;
  pushQueryState(question, sql, mc, color_scale || 'blue-orange', lang);

  plausible('ask-map', { props: { question: question.slice(0, 80) } });

  if (result.ngr_keywords?.length) searchAndSuggestLayers(result.ngr_keywords);

  busy = false;
  document.getElementById('submit-btn').disabled = false;
}

// --- EVENTS ---
function setupEvents() {
  const input  = document.getElementById('question-input');
  const btn    = document.getElementById('submit-btn');

  input.addEventListener('input', e => fetchSuggestions(e.target.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveAcFocus(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveAcFocus(-1); }
    else if (e.key === 'Escape') closeAutocomplete();
    else if (e.key === 'Enter') {
      e.preventDefault();
      closeAutocomplete();
      const q = input.value.trim();
      if (q) { input.value = ''; submitQuestion(q); }
    }
  });
  input.addEventListener('blur', () => setTimeout(closeAutocomplete, 150));

  btn.addEventListener('click', () => {
    const q = input.value.trim();
    if (q) { input.value = ''; submitQuestion(q); }
  });

  document.querySelectorAll('.example-question').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      input.value = '';
      submitQuestion(a.textContent.trim());
    });
  });

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      lang = btn.dataset.lang;
    });
  });
}

// --- INIT ---
async function init() {
  try {
    setLoadingBar(10);
    setLoadingSub('DuckDB initialiseren...');
    await loader.loadParquetFile(PARQUET_URL, 'datacube', setLoadingBar);

    document.getElementById('loading').classList.add('hidden');

    const sharedState = readQueryState();

    let INITIAL_VIEW = { longitude: 5.1, latitude: 52.2, zoom: 7, pitch: 40, bearing: 0 };
    if (sharedState?.view) {
      const [sLng, sLat, sZoom, sPitch, sBearing] = sharedState.view.split(',').map(Number);
      INITIAL_VIEW = { longitude: sLng, latitude: sLat, zoom: sZoom, pitch: sPitch, bearing: sBearing };
      currentViewState = { ...INITIAL_VIEW };
    }
    if (sharedState?.lang) {
      lang = sharedState.lang;
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    }

    deckInstance = new deck.DeckGL({
      container: 'container',
      initialViewState: INITIAL_VIEW,
      controller: true,
      onViewStateChange: ({ viewState }) => { currentViewState = viewState; },
      layers: [DeckGLUtils.createBasemap('dark-matter')],
      getTooltip: ({ object }) => null,
    });

    setupEvents();

    if (sharedState) {
      addUserMessage(sharedState.question);
      const thinkingEl = addThinking();
      try {
        const rows = await loader.query(sharedState.sql);
        thinkingEl.remove();
        if (rows.length) {
          const mc = sharedState.metric && rows[0].hasOwnProperty(sharedState.metric)
            ? sharedState.metric
            : Object.keys(rows[0]).find(k => !['h3_id','gemeentenaam','buurtnaam','naam','year_int','wijknaam'].includes(k)) || Object.keys(rows[0])[0];
          addResultMessage(sharedState.question, rows, mc, sharedState.sql);
          addTrendChart(mc);
          renderLayer(rows, mc, sharedState.scale);
          currentQuestion = sharedState.question;
        } else {
          addError(lang === 'nl' ? 'Geen resultaten gevonden.' : 'No results found.');
        }
      } catch (err) {
        thinkingEl.remove();
        addError((lang === 'nl' ? 'Fout bij laden van gedeelde query: ' : 'Error loading shared query: ') + err.message);
      }
    } else {
      document.getElementById('question-input').focus();
    }

  } catch (err) {
    console.error(err);
    document.getElementById('loading').innerHTML = '<div style="font-size:18px;margin-bottom:8px;">⚠️ Data kon niet worden geladen</div><div style="font-size:12px;color:#aaa;line-height:1.5;">Ververs de pagina om opnieuw te proberen.</div>';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
