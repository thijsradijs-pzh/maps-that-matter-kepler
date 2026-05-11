// js/legend.js

let selectedCluster = null;

function buildLegend() {
  const grid = document.getElementById('legend-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let id = 0; id < N_CLUSTERS; id++) {
    const [r, g, b] = CLUSTER_COLORS[id];
    const cell = document.createElement('div');
    cell.className = 'legend-cell';
    cell.style.background = `rgb(${r},${g},${b})`;
    cell.title = `Cluster ${id}`;
    cell.dataset.clusterId = id;
    cell.addEventListener('click', () => showClusterProfile(id));
    grid.appendChild(cell);
  }
}

function showClusterProfile(id) {
  if (selectedCluster === id) {
    selectedCluster = null;
    document.querySelectorAll('.legend-cell.selected').forEach(c => c.classList.remove('selected'));
    document.getElementById('cluster-panel').classList.remove('visible');
    return;
  }
  selectedCluster = id;
  document.querySelectorAll('.legend-cell.selected').forEach(c => c.classList.remove('selected'));
  const cell = document.querySelector(`.legend-cell[data-cluster-id="${id}"]`);
  if (cell) cell.classList.add('selected');

  const hexes = allData.filter(d => d.cluster_2023 === id && isMeaningful(d));
  const n = hexes.length;

  if (n === 0) {
    document.getElementById('cp-title').textContent = `Cluster ${id} — geen hexagonen`;
    document.getElementById('cp-body').innerHTML = '';
    document.getElementById('cluster-panel').classList.add('visible');
    return;
  }

  const gemeenteCounts = {};
  hexes.forEach(d => { if (d.gemeente) gemeenteCounts[d.gemeente] = (gemeenteCounts[d.gemeente] || 0) + 1; });
  const topG = Object.entries(gemeenteCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const avg = (key) => {
    const vals = hexes.map(d => d[key]).filter(v => v != null && !isNaN(v));
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const avgInw  = avg('inwoners');
  const avgWoz  = avg('woz');
  const avgBeb  = avg('bebouwing');
  const avgHit  = avg('hitte');
  const avgNdvi = avg('ndvi');

  const types = {};
  hexes.forEach(d => { const t = getAreaType(d); types[t] = (types[t] || 0) + 1; });
  const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];

  const [r, g, b] = CLUSTER_COLORS[id];
  document.getElementById('cp-title').innerHTML =
    `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:rgb(${r},${g},${b});margin-right:5px;vertical-align:middle"></span>Cluster ${id}`;

  document.getElementById('cp-body').innerHTML = `
    <div class="cp-row"><span>Hexagonen</span><b>${n.toLocaleString('nl')}</b></div>
    ${topType ? `<div class="cp-row"><span>Hoofdtype</span><b style="font-size:10px">${topType[0]}</b></div>` : ''}
    ${avgBeb  != null ? `<div class="cp-row"><span>Bebouwing</span><b>${idxLbl(avgBeb)}</b></div>` : ''}
    ${avgInw  != null ? `<div class="cp-row"><span>Bevolking</span><b>${idxLbl(avgInw)}</b></div>` : ''}
    ${avgWoz  != null ? `<div class="cp-row"><span>WOZ-waarde</span><b>${idxLbl(avgWoz)}</b></div>` : ''}
    ${avgHit  != null ? `<div class="cp-row"><span>Hitte-index</span><b>${avgHit.toFixed(1)}</b></div>` : ''}
    ${avgNdvi != null ? `<div class="cp-row"><span>NDVI</span><b>${(avgNdvi - 1).toFixed(2)}</b></div>` : ''}
    <div class="cp-gemeenten">${topG.map(([g, c]) => `${g} <span style="color:#555">(${c})</span>`).join('<br>')}</div>
  `;
  document.getElementById('cluster-panel').classList.add('visible');
}
