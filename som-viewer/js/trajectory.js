// js/trajectory.js

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023];

function getAreaType(d) {
  const beb   = d.bebouwing || 0;
  const inw   = d.inwoners  || 0;
  const ndvi  = d.ndvi      || 1;
  const ndwi  = d.ndwi      || 1;
  const hitte = d.hitte     || 0;
  if (ndwi > 1.4)               return 'Watergebied / natte natuur';
  if (beb > 115 && inw < 10)    return 'Bedrijventerrein / industrie';
  if (beb > 90)                  return 'Dicht stedelijk gebied';
  if (beb > 38 && inw > 20)     return 'Woonwijk';
  if (beb > 20)                  return 'Suburbaan / gemengd';
  if (ndvi > 1.6 && hitte > 1)  return 'Tuinbouw / glastuinbouw';
  if (ndvi > 1.5)                return 'Agrarisch / natuur';
  return 'Buitengebied';
}

function showTrajectory(d) {
  document.getElementById('traj-location').textContent =
    [d.gemeente, d.wijk].filter(Boolean).join(' / ') || '–';

  let changes = 0;
  for (let i = 1; i < YEARS.length; i++) {
    if (d[`cluster_${YEARS[i]}`] !== d[`cluster_${YEARS[i-1]}`]) changes++;
  }
  const stability = changes === 0 ? 'Stabiel 2018–2023' : `${changes}× van type gewisseld`;
  document.getElementById('traj-type').textContent = `${getAreaType(d)}  ·  ${stability}`;

  const statsEl = document.getElementById('traj-stats');
  const pills = [];
  if ((d.inwoners || 0) > 0)  pills.push(`Bevolkingsdichtheid <b>${idxLbl(d.inwoners)}</b>`);
  if ((d.woz || 0) > 0)       pills.push(`Woningwaarde <b>${idxLbl(d.woz)}</b>`);
  if ((d.bebouwing || 0) > 0) pills.push(`Bebouwingsgraad <b>${idxLbl(d.bebouwing)}</b>`);
  if ((d.hitte || 0) > 0)     pills.push(`Hitte-index <b>${d.hitte.toFixed(1)}</b>`);
  if (d.geluid != null && d.geluid > 0) pills.push(`Geluid <b>${d.geluid.toFixed(0)} dB</b>`);
  if (d.groundheight != null) {
    const gh = d.groundheight;
    const sign = gh >= 0 ? '+' : '';
    const warn = gh < -2 ? ' ⚠' : '';
    pills.push(`Hoogte NAP <b style="color:${gh < 0 ? '#ff8c42' : '#6ee8a2'}">${sign}${gh.toFixed(1)}m${warn}</b>`);
  }
  if (d.flood1 != null && d.flood1 > 0) pills.push(`Overstromingsdiepte <b style="color:#ff6b6b">${d.flood1.toFixed(1)}m</b>`);
  if (d.bodem) pills.push(`Bodem <b>${d.bodem}</b>`);
  if (d.ndvi != null) pills.push(`NDVI <b>${(d.ndvi - 1).toFixed(2)}</b>`);
  if (d.ndwi != null) pills.push(`NDWI <b>${(d.ndwi - 1).toFixed(2)}</b>`);
  statsEl.innerHTML = pills.map(p => `<span class="traj-pill">${p}</span>`).join('');

  const yearsEl = document.getElementById('traj-years');
  yearsEl.innerHTML = '';
  YEARS.forEach((year, i) => {
    const id = d[`cluster_${year}`];
    const [r, g, b] = clusterColor(id);
    const prevId = i > 0 ? d[`cluster_${YEARS[i-1]}`] : id;
    const changed = i > 0 && id !== prevId;
    const cell = document.createElement('div');
    cell.className = 'traj-cell' + (changed ? ' changed' : '');
    cell.innerHTML = `
      <div class="traj-dot" style="background:rgb(${r},${g},${b})"></div>
      <div class="traj-year">${year}</div>
      <div class="traj-id">${id ?? '–'}</div>`;
    yearsEl.appendChild(cell);
  });

  const scenDefs = [
    { col: 'scenario_pop_plus20',  label: 'Woningnood' },
    { col: 'scenario_pop_min20',   label: 'Krimp' },
    { col: 'scenario_heat_plus30', label: 'Hitte +30%' },
    { col: 'scenario_heat_plus50', label: 'Hitte +50%' },
    { col: 'scenario_woz_plus20',  label: 'Betaalbaar' },
  ];
  const items = scenDefs.map(s => {
    const dist = d[s.col + '_dist'] || 0;
    const barW = Math.round(Math.sqrt(dist / 255) * 100);
    const col  = dist > 180 ? '#ff4444' : dist > 80 ? '#ff8c42' : dist > 20 ? '#ffcc44' : '#2a2a4a';
    return `<div class="sens-item">
      <div class="sens-bar-wrap"><div class="sens-bar-fill" style="width:${barW}%;background:${col}"></div></div>
      <div class="sens-label">${s.label}</div>
    </div>`;
  }).join('');
  document.getElementById('traj-sensitivity').innerHTML =
    `<div class="sens-title">Gevoeligheid voor scenario's</div><div class="sens-grid">${items}</div>`;

  document.getElementById('traj-panel').classList.add('visible');
}

function hideTrajectory() {
  document.getElementById('traj-panel').classList.remove('visible');
}
