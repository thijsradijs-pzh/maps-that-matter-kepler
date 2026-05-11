// js/ui.js

function toggleMainLayer(e) {
    e.preventDefault(); e.stopPropagation();
    showMainLayer = !showMainLayer;
    const icon = document.getElementById('ghn-checkbox');
    if (showMainLayer) { icon.className = 'fa fa-check-square checkbox-icon'; icon.style.color = 'var(--esri-blue)'; }
    else { icon.className = 'fa fa-square checkbox-icon unchecked'; icon.style.color = '#ccc'; }
    renderLayers();
}

function showInfoModal(title, html) {
    document.getElementById('info-modal-title').textContent = title;
    document.getElementById('info-modal-body').innerHTML = html;
    document.getElementById('info-modal').style.display = 'flex';
}

function closeInfoModal() {
    document.getElementById('info-modal').style.display = 'none';
}

function showDataInfo() {
    showInfoModal('Gegevens & Bronnen', `
        <p><strong>Dataset:</strong> Groene Hart Noord (MCA)<br>
        <strong>Records:</strong> ${allData.length} hexagonen</p>
        <p><strong>Bronnen:</strong></p>
        <ul style="margin:0;padding-left:20px;">
          <li>Provincie Zuid-Holland (PPLG)</li>
          <li>PDOK / Nationaal Geo Register</li>
          <li>Basisregistratie Ondergrond (BRO)</li>
        </ul>
    `);
}

function printMap() { window.print(); }

function switchTab(t) {
    _activeTab = t === 'layer' ? 'layers' : t;
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.sidebar-content').forEach(x => x.classList.remove('active'));
    const tabMap = {
        'welcome': { idx: 0, id: 'welcome-content' },
        'layers':  { idx: 1, id: 'layer-content' },
        'layer':   { idx: 1, id: 'layer-content' },
        'legend':  { idx: 2, id: 'legend-content' }
    };
    const target = tabMap[t];
    if (target) { document.querySelectorAll('.tab')[target.idx].classList.add('active'); document.getElementById(target.id).classList.add('active'); }
    updatePermalink();
}

function showCredits() { showInfoModal('Over deze tool', '<p>Gemaakt voor Provincie Zuid-Holland.</p>'); }

function zoomIn() { if (deckInstance) deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom + 1, transitionDuration: 300, transitionInterpolator: new deck.FlyToInterpolator() } }); }
function zoomOut() { if (deckInstance) deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom - 1, transitionDuration: 300, transitionInterpolator: new deck.FlyToInterpolator() } }); }
function resetView() { deckInstance.setProps({ initialViewState: { ...VIZ_CONFIG.initialView, transitionDuration: 800, transitionInterpolator: new deck.FlyToInterpolator() } }); }
function toggle3D() {
    const newPitch = currentViewState.pitch > 10 ? 0 : 45;
    deckInstance.setProps({ initialViewState: { ...currentViewState, pitch: newPitch, transitionDuration: 800, transitionInterpolator: new deck.FlyToInterpolator() } });
    document.getElementById('btn-2d3d').innerText = newPitch === 0 ? "3D" : "2D";
}
function resetBearing() { deckInstance.setProps({ initialViewState: { ...currentViewState, bearing: 0, transitionDuration: 800, transitionInterpolator: new deck.FlyToInterpolator() } }); }
function toggleBasemap() { isSatellite = !isSatellite; renderLayers(); document.getElementById('btn-basemap').innerText = isSatellite ? "Kaart" : "Foto"; updatePermalink(); }

function toggleMeasure() {
    isMeasuring = !isMeasuring; measurePoints = [];
    const btn = document.getElementById('btn-measure');
    const container = document.getElementById('container');
    if (isMeasuring) { btn.classList.add('active'); container.classList.add('measuring-cursor'); }
    else { btn.classList.remove('active'); container.classList.remove('measuring-cursor'); }
    renderLayers();
}

function onMapClick(info) { if (isMeasuring && info.coordinate) { measurePoints = [...measurePoints, info.coordinate]; renderLayers(); return true; } }

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; const φ1 = lat1 * Math.PI/180; const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1)*Math.PI/180; const Δλ = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(Δφ/2)*Math.sin(Δφ/2) + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)*Math.sin(Δλ/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function updateScaleBar(vs) {
    if (!vs) return;
    const { zoom, latitude } = vs;
    const metersPerPixel = (40075016 * Math.cos(latitude * Math.PI/180)) / Math.pow(2, zoom + 8);
    const targetM = metersPerPixel * 120;
    let rounded = targetM >= 1000 ? Math.round(targetM/1000)*1000 : Math.round(targetM/100)*100;
    if (rounded === 0) rounded = 100;
    document.getElementById('scale-bar').style.width = `${rounded/metersPerPixel}px`;
    document.getElementById('scale-text').innerText = rounded >= 1000 ? (rounded/1000)+" km" : rounded+" m";
}

function updateCoords(info) { if (info.coordinate) document.getElementById('coords-widget').innerText = `${info.coordinate[1].toFixed(5)} | ${info.coordinate[0].toFixed(5)}`; }
