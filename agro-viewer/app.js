// --- GLOBAL STATE ---
let deckInstance; 
let activeWmsLayers = [];
let agroData = []; 
let selectionPoly = null; 
let drawState = { active: false, start: null, end: null };
let currentViewState = VIZ_CONFIG.initialView; //
let isSatellite = false;
let nsoCreds = null; 
let nsoActive = false;

// --- GLOBAL UI FUNCTIONS ---
window.switchTab = function(t) {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.sidebar-content').forEach(x => x.classList.remove('active'));
    const tabMap = { 'data': 0, 'nso': 1, 'layers': 2 };
    const contentMap = { 'data': 'data-content', 'nso': 'nso-content', 'layers': 'layer-content' };
    if(document.querySelectorAll('.tab')[tabMap[t]]) document.querySelectorAll('.tab')[tabMap[t]].classList.add('active');
    if(document.getElementById(contentMap[t])) document.getElementById(contentMap[t]).classList.add('active');
};

window.toggleBasemap = function() {
    isSatellite = !isSatellite;
    document.getElementById('btn-basemap').innerText = isSatellite ? "Kaart" : "Satelliet";
    renderLayers();
};

window.zoomIn = () => deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom + 1 } });
window.zoomOut = () => deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom - 1 } });
window.resetView = () => deckInstance.setProps({ initialViewState: VIZ_CONFIG.initialView });
window.closeModal = () => document.getElementById('key-modal').style.display = 'none';
window.openModal = () => document.getElementById('key-modal').style.display = 'flex';

// --- NGR SEARCH LOGIC (MATCHING MCA XML POST STRUCTURE) ---
function initSearch() {
    const input = document.getElementById('layer-search');
    const resultsContainer = document.getElementById('search-results');
    if(!input) return;

    let debounceTimer;
    input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => performSearch(e.target.value), 500);
    });

    async function performSearch(term) {
        if (term.length < 3) { resultsContainer.innerHTML = ''; return; }
        resultsContainer.innerHTML = '<div style="padding:10px; color:#888; font-size:12px;"><i class="fa fa-spinner fa-spin"></i> Zoeken in NGR...</div>';
        
        const xmlRequest = `<?xml version="1.0" encoding="UTF-8"?>
<csw:GetRecords xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" xmlns:ogc="http://www.opengis.net/ogc" service="CSW" version="2.0.2" resultType="results" startPosition="1" maxRecords="20">
    <csw:Query typeNames="csw:Record">
        <csw:ElementSetName>full</csw:ElementSetName>
        <csw:Constraint version="1.1.0">
            <ogc:Filter>
                <ogc:Or>
                    <ogc:PropertyIsLike wildCard="%" singleChar="_" escapeChar="\\\\"><ogc:PropertyName>title</ogc:PropertyName><ogc:Literal>%${term}%</ogc:Literal></ogc:PropertyIsLike>
                    <ogc:PropertyIsLike wildCard="%" singleChar="_" escapeChar="\\\\"><ogc:PropertyName>abstract</ogc:PropertyName><ogc:Literal>%${term}%</ogc:Literal></ogc:PropertyIsLike>
                </ogc:Or>
            </ogc:Filter>
        </csw:Constraint>
    </csw:Query>
</csw:GetRecords>`;

        try {
            const response = await fetch('/api/search-ngr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: xmlRequest
            });
            const text = await response.text();
            const xmlDoc = new DOMParser().parseFromString(text, "text/xml");
            const records = Array.from(xmlDoc.getElementsByTagNameNS("*", "SummaryRecord"));
            displayResults(records);
        } catch (e) { resultsContainer.innerHTML = '<div style="color:red; padding:10px;">Fout bij zoeken.</div>'; }
    }

    function displayResults(records) {
        resultsContainer.innerHTML = '';
        if(records.length === 0) { resultsContainer.innerHTML = '<div style="padding:10px;">Geen resultaten gevonden.</div>'; return; }

        records.forEach(rec => {
            const title = rec.getElementsByTagNameNS("*", "title")[0]?.textContent || "Naamloos";
            const abstract = rec.getElementsByTagNameNS("*", "abstract")[0]?.textContent || "";
            let url = "";
            const uriNodes = rec.getElementsByTagNameNS("*", "URI");
            for(let i=0; i<uriNodes.length; i++) {
                if(uriNodes[i].getAttribute('protocol')?.includes('OGC:WMS')) { url = uriNodes[i].textContent; break; }
            }
            if(url) {
                const div = document.createElement('div');
                div.className = 'result-item';
                div.innerHTML = `<div style="font-weight:bold; color:#007ac2;">${title}</div><div style="font-size:10px; color:#666;">${abstract.substring(0,60)}...</div>`;
                div.onclick = () => addWmsLayer(title, url);
                resultsContainer.appendChild(div);
            }
        });
    }
}

// --- WMS & NGR LAYER LOGIC ---
async function addWmsLayer(title, url) {
    activeWmsLayers.push({ id: Date.now(), title: title, url: url, layer: '0', version: '1.3.0' });
    updateActiveLayersUI();
    renderLayers();
}

function updateActiveLayersUI() {
    const list = document.getElementById('wms-list-content');
    if(!list) return;
    list.innerHTML = '';
    activeWmsLayers.forEach(l => {
        const div = document.createElement('div');
        div.className = 'active-wms-item';
        div.innerHTML = `<span>${l.title}</span> <i class="fa fa-trash" style="cursor:pointer; color:red;" onclick="window.removeLayer('${l.id}')"></i>`;
        list.appendChild(div);
    });
    document.getElementById('active-wms-layers').style.display = activeWmsLayers.length ? 'block' : 'none';
}

window.removeLayer = (id) => { activeWmsLayers = activeWmsLayers.filter(l => l.id != id); updateActiveLayersUI(); renderLayers(); };

// --- AGRO LOGIC (TEKENEN & DATA) ---
window.fetchAgroDataTrigger = () => { if(!selectionPoly) window.startDrawMode(); else askForAgroToken(); };

window.startDrawMode = () => {
    drawState.active = true; drawState.start = null; selectionPoly = null;
    deckInstance.setProps({ controller: { dragPan: false } });
    document.getElementById('container').style.cursor = 'crosshair';
    document.getElementById('agro-status').innerHTML = '<b>Teken Modus:</b> Klik start, beweeg, klik stop.';
    renderLayers();
};

function onMapClick(info) {
    if (!info.coordinate || !drawState.active) return;
    if (!drawState.start) { drawState.start = info.coordinate; return; }
    drawState.active = false;
    deckInstance.setProps({ controller: true });
    document.getElementById('container').style.cursor = 'default';
    createSelectionPoly(drawState.start, info.coordinate);
    renderLayers();
    askForAgroToken();
}

function createSelectionPoly(p1, p2) {
    const minLon = Math.min(p1[0], p2[0]), maxLon = Math.max(p1[0], p2[0]);
    const minLat = Math.min(p1[1], p2[1]), maxLat = Math.max(p1[1], p2[1]);
    selectionPoly = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[minLon, minLat],[maxLon, minLat],[maxLon, maxLat],[minLon, maxLat],[minLon, minLat]]] } };
}

async function fetchAgroData(token) {
    const statusDiv = document.getElementById('agro-status');
    const endpoint = document.getElementById('agro-endpoint').value;
    const year = document.getElementById('agro-year').value;
    const coords = selectionPoly.geometry.coordinates[0];
    const wkt = `POLYGON((${coords.map(p => p.join(' ')).join(',')}))`;
    window.closeModal();
    statusDiv.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Ophalen...';
    try {
        const params = new URLSearchParams({ year, page_size: 1000, geometry: wkt, epsg: 4326, output_epsg: 4326 });
        const res = await fetch(`/api/agro-proxy?path=${encodeURIComponent(`${endpoint}?${params}`)}`, { headers: { 'x-agro-token': token } }); //
        const data = await res.json();
        agroData = data.features || [];
        const crops = [...new Set(agroData.map(f => f.properties.crop_name || 'Onbekend'))];
        statusDiv.innerHTML = `✅ <b>${agroData.length} percelen</b>.<br><small>Gewassen: ${crops.slice(0,3).join(', ')}...</small>`;
        renderLayers();
    } catch (e) { statusDiv.innerHTML = `❌ Fout: ${e.message}`; }
}

function askForAgroToken() {
    document.getElementById('modal-title').innerText = 'AgroDataCube Token';
    document.getElementById('modal-desc').innerText = 'Voer je API Token in.';
    document.getElementById('modal-confirm-btn').onclick = () => fetchAgroData(document.getElementById('user-api-key').value);
    window.openModal();
}

// --- NSO LOGIC ---
window.toggleNSO = () => { nsoActive = document.getElementById('toggle-nso').checked; if (nsoActive && !nsoCreds) askForNSOCreds(); else renderLayers(); };
window.updateNSOLayer = () => renderLayers();
function askForNSOCreds() {
    document.getElementById('modal-title').innerText = 'NSO Login';
    document.getElementById('modal-desc').innerText = 'Gebruik gebruiker:wachtwoord';
    document.getElementById('modal-confirm-btn').onclick = () => { nsoCreds = document.getElementById('user-api-key').value; window.closeModal(); renderLayers(); };
    window.openModal();
}

// --- RENDER LOGIC ---
function renderLayers() {
    const layers = [];
    if (!nsoActive) {
        if (isSatellite) {
            layers.push(new deck.TileLayer({
                id: 'basemap-sat', data: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg',
                renderSubLayers: props => new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [props.tile.bbox.west, props.tile.bbox.south, props.tile.bbox.east, props.tile.bbox.north] })
            }));
        } else { layers.push(DeckGLUtils.createBasemap(VIZ_CONFIG.basemap)); } //
    }
    if (nsoActive && nsoCreds) {
        const lName = document.getElementById('nso-layer-select').value;
        const targetUrl = `https://wmts.satellietdataportaal.nl/wmts/${lName}/service?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${lName}&STYLE=default&TILEMATRIXSET=EPSG:3857&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png`;
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl).replace(/%7Bz%7D/g, '{z}').replace(/%7Bx%7D/g, '{x}').replace(/%7By%7D/g, '{y}')}`;
        layers.push(new deck.TileLayer({
            id: 'nso', data: proxyUrl, getTileData: async ({url}) => {
                const r = await fetch(url, { headers: { 'x-proxy-auth': `Basic ${btoa(nsoCreds)}` } });
                return r.ok ? r.arrayBuffer() : null;
            },
            renderSubLayers: props => new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [props.tile.bbox.west, props.tile.bbox.south, props.tile.bbox.east, props.tile.bbox.north] })
        }));
    }
    if (selectionPoly) layers.push(new deck.GeoJsonLayer({ id: 'selection', data: [selectionPoly], filled: false, stroked: true, getLineColor: [0, 122, 194, 255], getLineWidth: 2 }));
    if (agroData.length) layers.push(new deck.GeoJsonLayer({ id: 'agro', data: agroData, filled: true, pickable: true, getFillColor: [0, 255, 100, 120], autoHighlight: true }));
    
    activeWmsLayers.forEach(l => {
        layers.push(new deck.TileLayer({
            id: `wms-${l.id}`, data: `${l.url}?SERVICE=WMS&VERSION=${l.version}&REQUEST=GetMap&LAYERS=${l.layer}&STYLES=&FORMAT=image/png&TRANSPARENT=true&WIDTH=256&HEIGHT=256&CRS=EPSG:3857&BBOX={west},{south},{east},{north}`,
            renderSubLayers: props => new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [props.tile.bbox.west, props.tile.bbox.south, props.tile.bbox.east, props.tile.bbox.north] })
        }));
    });
    deckInstance.setProps({ layers });
}

function init() {
    deckInstance = new deck.DeckGL({
        container: 'container', initialViewState: VIZ_CONFIG.initialView, controller: true,
        onClick: onMapClick, onViewStateChange: ({viewState}) => { currentViewState = viewState; return viewState; },
        getTooltip: ({object}) => {
            if (object && object.properties && (object.properties.fieldid || object.properties.crop_name)) {
                return { html: `<div style="background:white; padding:8px; border-radius:4px; font-size:12px; box-shadow: 0 4px 8px rgba(0,0,0,0.15);"><b>${object.properties.crop_name || 'Onbekend'}</b><br>ID: ${object.properties.fieldid}<br>Opp: ${(object.properties.area/10000).toFixed(2)} ha</div>` };
            }
            return null;
        },
        onHover: (info) => { if (drawState.active && drawState.start && info.coordinate) { drawState.end = info.coordinate; renderLayers(); } }
    });
    initSearch(); renderLayers();
}
init();