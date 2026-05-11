// gebiedsviewer/js/app.js — init, sidebar/tab, print

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  parsePermalinkState();
  buildLayerTree();
  initDeck();
  initSearch();
  initAddressSearch();
  initBasemapPanel();
  initCatalogSearch();
  initKeaSection();
  initMcaTab();
  setupFileDrop();
  enablePermalinkLayers();
  document.getElementById('loading').style.display = 'none';

  // Escape key: stop measure → close popup → close address search → close table
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (measureState.active) { toggleMeasure(); return; }
    if (popupEl) { closePopup(); return; }
    if (document.getElementById('address-search-container').style.display !== 'none') {
      closeAddressSearch(); return;
    }
    if (document.getElementById('table-panel').style.display !== 'none') {
      closeTableView(); return;
    }
  });

  // Coords widget: click to copy
  const coordsEl = document.getElementById('coords-widget');
  coordsEl.title = 'Klik om coördinaten te kopiëren';
  coordsEl.style.cursor = 'pointer';
  coordsEl.addEventListener('click', () => {
    const text = coordsEl.textContent;
    navigator.clipboard.writeText(text).then(() => {
      const prev = coordsEl.textContent;
      coordsEl.textContent = 'Gekopieerd!';
      setTimeout(() => coordsEl.textContent = prev, 1500);
    });
  });
});

// ═══════════════════════════════════════════════════════
// SIDEBAR / TABS
// ═══════════════════════════════════════════════════════

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('sidebar-toggle');
  const open = sidebar.classList.toggle('sidebar-open');
  btn.innerHTML = open ? '<i class="fa fa-times"></i>' : '<i class="fa fa-bars"></i>';
}

function switchTab(tab) {
  const leavingAnalyse = mcaState.active && tab !== 'analyse';

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sidebar-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`${tab}-content`).classList.add('active');

  if (tab === 'analyse') {
    mcaState.active = true;
    currentViewState = { ...currentViewState, ...MCA_VIEW, pitch: 0, transitionDuration: 900 };
    deckInstance.setProps({ initialViewState: currentViewState });
    loadMcaData();
  } else if (leavingAnalyse) {
    mcaState.active = false;
    currentViewState = { ...currentViewState, pitch: 0, bearing: 0, transitionDuration: 600 };
    deckInstance.setProps({ initialViewState: currentViewState });
    rebuildDeck();
  }
  updatePermalink();
}

// ═══════════════════════════════════════════════════════
// PRINT MAP
// ═══════════════════════════════════════════════════════

function openPrintDialog() {
  document.getElementById('print-dialog').style.display = 'flex';
  document.getElementById('print-title').focus();
}
function closePrintDialog() {
  document.getElementById('print-dialog').style.display = 'none';
}
function printDialogOverlayClick(e) {
  if (e.target === document.getElementById('print-dialog')) closePrintDialog();
}

function printMap() {
  closePrintDialog();
  // Force a synchronous redraw so the WebGL backbuffer is populated
  if (deckInstance && deckInstance.redraw) deckInstance.redraw(true);

  const canvas = document.getElementById('deck-canvas');
  let imgData;
  try {
    imgData = canvas.toDataURL('image/png');
  } catch (e) {
    const errEl = document.getElementById('print-error');
    if (errEl) { errEl.textContent = 'Canvas kon niet worden geëxporteerd. Zorg dat de kaart volledig geladen is.'; errEl.style.display = 'block'; }
    return;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' });
  const { zoom, latitude, longitude } = currentViewState;
  const printTitle = document.getElementById('print-title')?.value.trim() || '';
  const printNotes = document.getElementById('print-notes')?.value.trim() || '';

  // Capture legend from DOM (already rendered in the Legenda tab with real WMS images)
  const legendDomItems = document.querySelectorAll('#legend-items .legend-item');
  let legendItems;
  if (legendDomItems.length) {
    legendItems = [...legendDomItems].map(el => el.outerHTML).join('');
  } else {
    legendItems = [...activeLayers.values()].map(entry =>
      `<div class="pl-item"><span class="pl-dot" style="background:${entry.color}"></span><span>${entry.label}</span></div>`
    ).join('') || '<em style="color:#aaa;font-size:11px">Geen actieve lagen</em>';
  }

  const basemapLabel = BASEMAPS.find(b => b.id === currentBasemap)?.label || currentBasemap;

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>Kaartexport – Zuid-Holland Gebiedsviewer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Avenir, sans-serif; background: white; display: flex; height: 100vh; }
    .map-area { flex: 1; overflow: hidden; background: #ddd; }
    .map-area img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .panel { width: 210px; min-width: 210px; background: white; border-left: 2px solid #e0e0e0;
             display: flex; flex-direction: column; padding: 18px 14px; overflow: hidden; }
    .brand { font-size: 15px; font-weight: 700; line-height: 1.3; color: #333; }
    .brand-sub { font-size: 10px; color: #aaa; margin-top: 2px; }
    .print-btn { margin: 6px 0; padding: 9px; background: #007ac2; color: white; border: none;
                 border-radius: 5px; font-size: 12px; font-weight: 600; cursor: pointer; width: 100%; }
    .print-btn:hover { background: #005f99; }
    .back-btn { margin: 6px 0; padding: 9px; background: white; color: #555; border: 1px solid #ccc;
                border-radius: 5px; font-size: 12px; font-weight: 600; cursor: pointer; width: 100%; }
    .back-btn:hover { background: #f5f5f5; }
    h3 { font-size: 9px; text-transform: uppercase; letter-spacing: 0.6px; color: #999;
         font-weight: 700; margin: 14px 0 5px; border-top: 1px solid #f0f0f0; padding-top: 10px; }
    .pl-item { display: flex; align-items: center; gap: 7px; font-size: 11px; color: #333;
               margin-bottom: 5px; line-height: 1.3; }
    .pl-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
    .legend-item { margin-bottom: 8px; }
    .legend-layer-name { font-size: 10px; font-weight: 700; color: #555; margin-bottom: 3px; }
    .legend-body { padding-left: 2px; }
    .legend-row { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #333;
                  margin-bottom: 3px; line-height: 1.3; }
    .legend-row img { max-width: 20px; max-height: 20px; flex-shrink: 0; }
    .legend-loading { display: none; }
    .legend-empty { display: none; }
    .meta { font-size: 10px; color: #bbb; margin-top: auto; padding-top: 12px; line-height: 1.7;
            border-top: 1px solid #f0f0f0; }
    .pzh-stripe { height: 4px; background: #E3001B; margin: 0 0 14px; border-radius: 2px; }
    @media print {
      @page { margin: 0; size: A4 landscape; }
      .print-btn, .back-btn { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="map-area">
    <img src="${imgData}" alt="Kaartexport Zuid-Holland Gebiedsviewer">
  </div>
  <div class="panel">
    <div class="pzh-stripe"></div>
    <div class="brand">Zuid-Holland<br>Gebiedsviewer</div>
    <div class="brand-sub">Maps That Matter</div>
    ${printTitle ? `<div style="font-size:13px;font-weight:700;color:#222;margin-top:8px;line-height:1.3">${printTitle}</div>` : ''}
    ${printNotes ? `<div style="font-size:10px;color:#666;margin-top:4px;line-height:1.5">${printNotes}</div>` : ''}
    <button class="print-btn" onclick="window.print()">&#128438; Afdrukken / Opslaan als PDF</button>
    <button class="back-btn" onclick="window.close()">&#8592; Terug naar viewer</button>
    <h3>Actieve lagen</h3>
    ${legendItems}
    <h3>Kaartpositie</h3>
    <div class="pl-item">Zoom: ${zoom.toFixed(1)}</div>
    <div class="pl-item">Lat: ${latitude.toFixed(4)}°N</div>
    <div class="pl-item">Lon: ${longitude.toFixed(4)}°E</div>
    <div class="pl-item">Achtergrond: ${basemapLabel}</div>
    <div class="meta">Gegenereerd op ${dateStr}<br>© Provincie Zuid-Holland<br>Bron: geoservices.Zuid-Holland.nl</div>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}
