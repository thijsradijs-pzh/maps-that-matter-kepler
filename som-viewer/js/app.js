// js/app.js

const { DeckGL } = deck;

// --- STATE ---
let allData = [], deckInstance = null;
let viewState = { ...INITIAL_VIEW };
let playInterval = null;
let mode = 'jaar', activeYear = 2023;
let activeScenarioCol = 'scenario_pop_plus20', activeTrendCol = 'trend_2030';
let changedOnly = false, trendChangedOnly = false;

// --- INIT ---
async function init() {
  try {
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const raw = await resp.json();
    allData = raw.filter(d => inZuidHolland(d.h3) && hasContent(d));

    document.getElementById('loading').style.display = 'none';
    document.getElementById('controls').style.display = 'block';

    // Build gemeente centroid map
    const gemeenteSums = {};
    allData.forEach(d => {
      if (!d.gemeente) return;
      if (!gemeenteSums[d.gemeente]) gemeenteSums[d.gemeente] = { lat: 0, lon: 0, n: 0 };
      const [lat, lon] = h3.h3ToGeo(d.h3);
      gemeenteSums[d.gemeente].lat += lat;
      gemeenteSums[d.gemeente].lon += lon;
      gemeenteSums[d.gemeente].n++;
    });
    const gemeenteCentroids = {};
    Object.entries(gemeenteSums).forEach(([name, s]) => {
      gemeenteCentroids[name] = { lat: s.lat / s.n, lon: s.lon / s.n };
    });

    // Populate datalist
    const dl = document.getElementById('gemeente-list');
    Object.keys(gemeenteCentroids).sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      dl.appendChild(opt);
    });

    // Fly to gemeente on selection
    const gemeenteLower = {};
    Object.entries(gemeenteCentroids).forEach(([name, c]) => {
      gemeenteLower[name.toLowerCase()] = c;
    });
    const searchInput = document.getElementById('gemeente-search');
    searchInput.addEventListener('change', () => {
      const name = searchInput.value.trim();
      const c = gemeenteCentroids[name] || gemeenteLower[name.toLowerCase()];
      if (!c) return;
      viewState = {
        ...viewState, longitude: c.lon, latitude: c.lat, zoom: 12,
        transitionDuration: 1000,
        transitionInterpolator: new deck.LinearInterpolator(['longitude', 'latitude', 'zoom']),
      };
      deckInstance.setProps({ viewState });
      searchInput.value = '';
    });

    setupStory();
    setupControls();
    buildLegend();

    deckInstance = new DeckGL({
      container: 'container',
      initialViewState: INITIAL_VIEW, viewState,
      controller: false,
      layers: [DeckGLUtils.createBasemap('dark-matter'), buildLayer()],
      onViewStateChange: ({ viewState: vs }) => { viewState = vs; deckInstance.setProps({ viewState }); },
      getTooltip: ({ object }) => object ? buildTooltip(object) : null,
      onClick: ({ object }) => { if (object) showTrajectory(object); },
    });

    updateStats();
  } catch (err) {
    console.error(err);
    document.getElementById('loading').innerHTML = '<div style="font-size:18px;margin-bottom:8px;">⚠️ Data kon niet worden geladen</div><div style="font-size:12px;color:#aaa;line-height:1.5;">Ververs de pagina om opnieuw te proberen.</div>';
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
