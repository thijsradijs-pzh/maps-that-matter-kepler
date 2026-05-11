// js/render.js

function blendToOrange(baseColor, t) {
  const [r, g, b, a] = baseColor;
  return [
    Math.round(r + (255 - r) * t),
    Math.round(g + (140 - g) * t),
    Math.round(b + (0   - b) * t),
    a,
  ];
}

function getColor(d) {
  if (mode === 'jaar') return clusterColor(d[`cluster_${activeYear}`]);
  const col = mode === 'scenario' ? activeScenarioCol : activeTrendCol;
  const base = d.cluster_2023, cur = d[col];

  if (mode === 'scenario') {
    const distCol = activeScenarioCol + '_dist';
    const dist = d[distCol];
    if (dist == null) return clusterColor(base);
    if (changedOnly && cur === base) return [0, 0, 0, 0];
    // Map dist 0-255 → t 0-1, raised to 0.5 for more visible low-dist values
    const t = Math.pow(dist / 255, 0.5);
    return blendToOrange(clusterColor(base), t);
  }

  // Trend mode: binary changed / unchanged
  if (trendChangedOnly && cur === base) return [0, 0, 0, 0];
  if (cur !== base) return CHANGED_COLOR;
  return clusterColor(base);
}

function isMeaningful(d) {
  return (
    (d.inwoners || 0) > 0 ||
    (d.woz      || 0) > 0 ||
    (d.hitte    || 0) > 0.5 ||
    (d.bebouwing || 0) >= 5
  );
}

function getActiveData() {
  if (mode === 'jaar') return allData.filter(d => d[`cluster_${activeYear}`] != null && isMeaningful(d));
  const col = mode === 'scenario' ? activeScenarioCol : activeTrendCol;
  const showOnly = mode === 'scenario' ? changedOnly : trendChangedOnly;
  const valid = allData.filter(d => d[col] != null && isMeaningful(d));
  return showOnly ? valid.filter(d => d[col] !== d.cluster_2023) : valid;
}

function buildLayer() {
  return DeckGLUtils.createH3Layer({
    id: 'som-layer', data: getActiveData(),
    getHexagon: d => d.h3, getFillColor: getColor,
    extruded: false, pickable: true, coverage: 0.92,
    updateTriggers: { getFillColor: [mode, activeYear, activeScenarioCol, activeTrendCol, changedOnly, trendChangedOnly] },
  });
}

function render() {
  if (!deckInstance) return;
  deckInstance.setProps({
    layers: [DeckGLUtils.createBasemap('dark-matter'), buildLayer()],
    getTooltip: ({ object }) => object ? buildTooltip(object) : null,
    onClick: ({ object }) => { if (object) showTrajectory(object); },
  });
  updateStats();
}

function buildTooltip(d) {
  const col = mode === 'scenario' ? activeScenarioCol : activeTrendCol;
  const id = mode === 'jaar' ? d[`cluster_${activeYear}`] : d[col];
  const cx = id != null ? Math.floor(id / 10) : '–';
  const cy = id != null ? id % 10 : '–';
  let changed = '';
  if (mode !== 'jaar' && d[col] !== d.cluster_2023)
    changed = `<br><b style="color:#ff8c42">↑ gebiedstype verschoven</b> (was ${d.cluster_2023} → nu ${d[col]})`;
  return {
    html: `<div style="font-size:12px;line-height:1.7">
      <b>${d.gemeente || '–'}</b>${d.wijk ? ` / ${d.wijk}` : ''}<br>
      Gebiedstype: <b>${id ?? '–'}</b> (${cx},${cy})${changed}<br>
      Bevolkingsdichtheid: <b>${d.inwoners != null ? idxLbl(d.inwoners) : '–'}</b><br>
      Woningwaarde: <b>${d.woz != null ? idxLbl(d.woz) : '–'}</b><br>
      Hitte-index: <b>${d.hitte != null ? d.hitte.toFixed(1) : '–'}</b><br>
      Bebouwingsgraad: <b>${d.bebouwing != null ? idxLbl(d.bebouwing) : '–'}</b>
    </div>`,
    style: { background:'rgba(13,13,22,0.97)', color:'#ddd', border:'1px solid #2a2a4a', borderRadius:'8px', padding:'10px 14px' },
  };
}

function updateStats() {
  const el = document.getElementById('stats');
  const banner = document.getElementById('counter-banner');
  const pctNum = document.getElementById('counter-pct-num');
  const pctLabel = document.getElementById('counter-pct-label');

  if (mode === 'jaar') {
    banner.classList.remove('visible');
    if (!el) return;
    const n = allData.filter(d => d[`cluster_${activeYear}`] != null).length;
    el.innerHTML = `<b>Jaar:</b> <span>${activeYear}</span> &nbsp; <b>Gebieden:</b> <span>${n.toLocaleString('nl')}</span>`;
    return;
  }
  const col = mode === 'scenario' ? activeScenarioCol : activeTrendCol;
  const valid = allData.filter(d => d[col] != null);

  let pct, label, subLabel;

  if (mode === 'scenario') {
    const distCol = activeScenarioCol + '_dist';
    const IMPACT_THRESHOLD = 30;
    const impacted = valid.filter(d => (d[distCol] || 0) > IMPACT_THRESHOLD).length;
    const switched  = valid.filter(d => d[col] !== d.cluster_2023).length;
    pct = valid.length > 0 ? Math.round(impacted / valid.length * 100) : 0;
    label = 'van bewoonbaar ZH beweegt door dit scenario';
    subLabel = `${switched.toLocaleString('nl')} gebieden wisselen werkelijk van type`;
  } else {
    const switched = valid.filter(d => d[col] !== d.cluster_2023).length;
    pct = valid.length > 0 ? Math.round(switched / valid.length * 100) : 0;
    label = 'van Zuid-Holland verandert autonoom van gebiedstype';
    subLabel = `${switched.toLocaleString('nl')} hexagonen`;
  }

  pctNum.textContent = pct + '%';
  pctLabel.textContent = label;
  banner.classList.add('visible');
  if (el) el.innerHTML = `<span class="changed-count">${subLabel}</span>`;
}
