// js/ui.js

function setLoadingBar(pct) {
  const bar = document.getElementById('loading-bar');
  if (bar) bar.style.width = pct + '%';
}

function setLoadingSub(txt) {
  const el = document.getElementById('loading-sub');
  if (el) el.textContent = txt;
}

function scrollToBottom() {
  const m = document.getElementById('messages');
  m.scrollTop = m.scrollHeight;
}

function addUserMessage(text) {
  const el = document.createElement('div');
  el.className = 'msg-user';
  el.textContent = text;
  document.getElementById('messages').appendChild(el);
  scrollToBottom();
  return el;
}

function addThinking() {
  const el = document.createElement('div');
  el.className = 'msg-thinking';
  el.innerHTML = lang === 'nl'
    ? 'Nadenken<span class="dots"><span>.</span><span>.</span><span>.</span></span>'
    : 'Thinking<span class="dots"><span>.</span><span>.</span><span>.</span></span>';
  document.getElementById('messages').appendChild(el);
  scrollToBottom();
  return el;
}

function addError(msg) {
  const el = document.createElement('div');
  el.className = 'msg-error';
  el.textContent = msg;
  document.getElementById('messages').appendChild(el);
  scrollToBottom();
}

function formatValue(v, colName) {
  if (v == null) return '–';
  if (typeof v !== 'number') return String(v);
  if (colName.includes('inkomen') || colName.includes('woz')) return '€' + Math.round(v).toLocaleString('nl');
  if (colName.includes('percentage') || colName.includes('fraction')) return v.toFixed(1) + '%';
  if (colName.includes('afstand')) return v.toFixed(2) + ' km';
  if (colName.includes('verbruik')) return Math.round(v).toLocaleString('nl');
  if (colName.includes('lden') || colName.includes('geluid')) return v.toFixed(1) + ' dB';
  if (Number.isInteger(v)) return v.toLocaleString('nl');
  return v.toLocaleString('nl', { maximumFractionDigits: 1 });
}

function addResultMessage(title, rows, metricCol, sql) {
  const displayName = r => r.buurtnaam || r.wijknaam || r.gemeentenaam || r.naam || r.h3_id || '–';
  const top = rows.slice(0, 10);

  const el = document.createElement('div');
  el.className = 'msg-assistant';

  const rowsHtml = top.map((r, i) => `
    <div class="result-row">
      <span class="result-name">${i + 1}. ${displayName(r)}</span>
      <span class="result-value">${formatValue(r[metricCol], metricCol)}</span>
    </div>`).join('');

  const moreHtml = rows.length > 10
    ? `<div class="result-more">+ ${rows.length - 10} meer op de kaart</div>` : '';

  el.innerHTML = `
    <div class="msg-card">
      <div class="msg-title">${title}</div>
      <div class="msg-results">${rowsHtml}${moreHtml}</div>
      <div class="msg-count">${rows.length.toLocaleString('nl')} hexagonen${rows.length >= 100 ? ' · mogelijk niet volledig' : ''} · klik op de kaart voor details</div>
      <div class="result-actions">
        <button class="action-btn share-btn" onclick="shareUrl()">${lang === 'nl' ? '🔗 Deel' : '🔗 Share'}</button>
        <button class="action-btn" onclick="downloadCsv()">↓ CSV</button>
        <button class="action-btn" onclick="downloadGeoJson()">↓ GeoJSON</button>
      </div>
      <div class="sql-toggle" onclick="toggleSql(this)">
        <span class="arrow">&#9658;</span>
        <span>SQL-query</span>
      </div>
      <div class="sql-body">
        <pre class="sql-pre">${sql.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
      </div>
    </div>`;

  document.getElementById('messages').appendChild(el);
  scrollToBottom();
}

function toggleSql(toggleEl) {
  toggleEl.classList.toggle('open');
  toggleEl.nextElementSibling.classList.toggle('open');
}

async function addTrendChart(metricCol) {
  if (!metricCol || typeof Chart === 'undefined') return;

  let trendData;
  try {
    const sql = `SELECT year_int, AVG("${metricCol}") AS v FROM datacube WHERE "${metricCol}" > -9000 GROUP BY year_int ORDER BY year_int`;
    trendData = await loader.query(sql);
  } catch { return; }

  if (!trendData?.length || trendData.every(r => r.v == null)) return;

  const uid = Date.now();
  const card = document.createElement('div');
  card.className = 'msg-assistant';
  card.innerHTML = `
    <div class="msg-card">
      <div class="msg-title trend-title">
        <span>${lang === 'nl' ? 'Trend 2018–2023' : 'Trend 2018–2023'}</span>
        <span class="trend-subtitle">${lang === 'nl' ? 'Nederland gemiddeld' : 'Netherlands average'}</span>
      </div>
      <div class="trend-chart-wrap"><canvas id="tc-${uid}"></canvas></div>
    </div>`;
  document.getElementById('messages').appendChild(card);
  scrollToBottom();

  const ctx = document.getElementById(`tc-${uid}`);
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: trendData.map(r => r.year_int),
      datasets: [{
        data: trendData.map(r => r.v),
        borderColor: '#4da6ff',
        backgroundColor: 'rgba(77,166,255,0.08)',
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: '#4da6ff',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => formatValue(ctx.raw, metricCol) },
          backgroundColor: 'rgba(10,10,20,0.95)',
          bodyColor: '#ddd',
          borderColor: '#333',
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#555', font: { size: 10 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#555', font: { size: 10 }, callback: v => formatValue(v, metricCol) },
        },
      },
    },
  });
}
