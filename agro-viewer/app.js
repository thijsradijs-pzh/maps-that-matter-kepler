// --- GLOBAL STATE ---
let deckInstance;
let activeWmsLayers = [];
let agroData = []; 
let selectionPoly = null; 
let drawState = { active: false, start: null, end: null };
let currentViewState = VIZ_CONFIG.initialView;
let isSatellite = false;

// Credentials & NSO State
let nsoCreds = null; 
let nsoActive = false;

// --- DEBOUNCE HELPER ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

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

window.zoomIn = () => deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom + 1, transitionDuration: 300 } });
window.zoomOut = () => deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom - 1, transitionDuration: 300 } });
window.resetView = () => deckInstance.setProps({ initialViewState: { ...VIZ_CONFIG.initialView, transitionDuration: 800 } });
window.closeModal = () => { document.getElementById('key-modal').style.display = 'none'; };
window.openModal = () => { document.getElementById('key-modal').style.display = 'flex'; };

// --- NGR SEARCH LOGIC (MCA EXACT STRUCTURE) ---
function initSearch() {
    const input = document.getElementById('layer-search');
    const resultsContainer = document.getElementById('search-results');
    if(!input) return;

    const performSearch = debounce(async (term) => {
        if (term.length < 3) { resultsContainer.style.display = 'none'; return; }
        resultsContainer.innerHTML = '<div style="padding:10px;color:#888;font-size:12px;"><i class="fa fa-spinner fa-spin"></i> Zoeken in NGR...</div>';
        resultsContainer.style.display = 'block';

        // Exacte XML Request zoals in MCA
        const xmlRequest = `<?xml version="1.0" encoding="UTF-8"?>
<csw:GetRecords xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" xmlns:ogc="http://www.opengis.net/ogc" service="CSW" version="2.0.2" resultType="results" startPosition="1" maxRecords="20">
    <csw:Query typeNames="csw:Record">
        <csw:ElementSetName>full</csw:ElementSetName>
        <csw:Constraint version="1.1.0">
            <ogc:Filter>
                <ogc:And>
                    <ogc:Or>
                        <ogc:PropertyIsLike wildCard="%" singleChar="_" escapeChar="\\\\"><ogc:PropertyName>title</ogc:PropertyName><ogc:Literal>%${term}%</ogc:Literal></ogc:PropertyIsLike>
                        <ogc:PropertyIsLike wildCard="%" singleChar="_" escapeChar="\\\\"><ogc:PropertyName>abstract</ogc:PropertyName><ogc:Literal>%${term}%</ogc:Literal></ogc:PropertyIsLike>
                    </ogc:Or>
                    <ogc:PropertyIsEqualTo><ogc:PropertyName>type</ogc:PropertyName><ogc:Literal>service</ogc:Literal></ogc:PropertyIsEqualTo>
                </ogc:And>
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
            const xmlText = await response.text();
            const xmlDoc = new DOMParser().parseFromString(xmlText, "text/xml");
            const records = Array.from(xmlDoc.getElementsByTagNameNS("*", "SummaryRecord"));
            
            displayResults(records);
        } catch (e) {
            resultsContainer.innerHTML = '<div style="color:red;padding:10px;">Fout bij zoeken.</div>';
        }
    }, 500);

    function displayResults(records) {
        resultsContainer.innerHTML = '';
        if (records.length === 0) { resultsContainer.innerHTML = '<div style="padding:10px;color:#888;font-size:12px;">Geen resultaten</div>'; return; }
        
        records.forEach(rec => {
            const title = rec.getElementsByTagNameNS("*", "title")[0]?.textContent || "Naamloos";
            const abstract = rec.getElementsByTagNameNS("*", "abstract")[0]?.textContent || "";
            let url = "";
            const uriNodes = rec.getElementsByTagNameNS("*", "URI");
            for(let i=0; i<uriNodes.length; i++) {
                if(uriNodes[i].getAttribute('protocol')?.includes('OGC:WMS')) {
                    url = uriNodes[i].textContent;
                    break;
                }
            }

            if(url) {
                const div = document.createElement('div');
                div.className = 'result-item';
                div.innerHTML = `
                    <div style="flex:1;">
                       <div style="font-weight:bold; color:#007ac2; font-size:12px; margin-bottom:2px;">
                          <i class="fa fa-globe" style="color:#E3001B; margin-right:5px;"></i> ${title}
                       </div>
                       <div style="font-size:11px; color:#666; line-height:1.2;">${abstract.substring(0,80)}...</div>
                    </div>
                `;
                div.onclick = () => addWmsLayer({ name: title, url: url });
                resultsContainer.appendChild(div);
            }
        });
    }
    input.addEventListener('input', (e) => performSearch(e.target.value));
}

// --- WMS LAYER MANAGEMENT (MCA STRUCTURE) ---
async function addWmsLayer(item) {
    if (activeWmsLayers.find(l => l.title === item.name)) return;
    try {
        // Haal Capabilities op voor de juiste laagnaam en BBOX
        const capUrl = `${item.url}${item.url.includes('?') ? '&' : '?'}SERVICE=WMS&REQUEST=GetCapabilities`;
        const resp = await fetch(`/api/proxy?url=${encodeURIComponent(capUrl)}`);
        const xmlText = await resp.text();
        const xmlDoc = new DOMParser().parseFromString(xmlText, "text/xml");
        
        const allLayers = Array.from(xmlDoc.querySelectorAll('Layer'));
        const namedLayers = allLayers.filter(l => l.querySelector('Name'));
        const targetLayer = namedLayers.length > 0 ? namedLayers[namedLayers.length - 1] : null;

        if (!targetLayer) throw new Error("Geen lagen gevonden");
        const layerName = targetLayer.querySelector('Name').textContent;
        
        // Extraheer BBOX voor zoom
        let bbox = null;
        const geoBbox = targetLayer.querySelector('EX_GeographicBoundingBox');
        if (geoBbox) {
            bbox = [
                parseFloat(geoBbox.querySelector('westBoundLongitude').textContent),
                parseFloat(geoBbox.querySelector('southBoundLatitude').textContent),
                parseFloat(geoBbox.querySelector('eastBoundLongitude').textContent),
                parseFloat(geoBbox.querySelector('northBoundLatitude').textContent)
            ];
        }

        activeWmsLayers.push({ 
            id: Date.now(), title: item.name, url: item.url, layer: layerName, bbox: bbox 
        });
        
        updateActiveLayersUI();
        renderLayers();
        if(bbox) zoomToBbox(bbox);
    } catch (e) { 
        console.error(e);
        alert("Kon laag niet laden."); 
    }
}

function zoomToBbox(bbox) {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    deckInstance.setProps({
        initialViewState: {
            ...currentViewState,
            longitude: (minLon + maxLon) / 2,
            latitude: (minLat + maxLat) / 2,
            zoom: 10,
            transitionDuration: 1000,
            transitionInterpolator: new deck.FlyToInterpolator()
        }
    });
}

function updateActiveLayersUI() {
    const list = document.getElementById('wms-list-content');
    const container = document.getElementById('active-wms-layers');
    if(!list) return;
    list.innerHTML = '';
    if (activeWmsLayers.length > 0) {
        container.style.display = 'block';
        activeWmsLayers.forEach(l => {
            const div = document.createElement('div');
            div.className = 'active-wms-item';
            div.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <i class="fa fa-check-square" style="color:#007ac2; margin-right:8px;"></i> 
                    <span style="font-size:12px;">${l.title}</span>
                </div>
                <i class="fa fa-trash" style="cursor:pointer; color:#999;" onclick="window.removeLayer('${l.id}')"></i>`;
            list.appendChild(div);
        });
    } else { container.style.display = 'none'; }
}

window.removeLayer = (id) => { activeWmsLayers = activeWmsLayers.filter(l => l.id != id); updateActiveLayersUI(); renderLayers(); };

// --- AGRO DATA & DRAWING LOGIC ---
window.fetchAgroDataTrigger = () => { 
    if(!selectionPoly) window.startDrawMode(); 
    else askForAgroToken(); 
};

window.startDrawMode = () => {
    drawState.active = true; drawState.start = null; selectionPoly = null;
    deckInstance.setProps({ controller: { dragPan: false } });
    document.getElementById('container').style.cursor = 'crosshair';
    document.getElementById('agro-status').innerHTML = '<b>Teken Modus:</b> Klik start, beweeg muis, klik stop.';
    renderLayers();
};

function onMapClick(info) {
    if (!info.coordinate || !drawState.active) return;
    const [lon, lat] = info.coordinate;
    if (!drawState.start) { 
        drawState.start = [lon, lat]; 
        drawState.end = [lon, lat]; 
        renderLayers(); 
        return; 
    }
    drawState.end = [lon, lat];
    drawState.active = false;
    deckInstance.setProps({ controller: true });
    document.getElementById('container').style.cursor = 'default';
    createSelectionPoly(drawState.start, drawState.end);
    document.getElementById('agro-status').innerHTML = '✅ Gebied geselecteerd. Bezig met aanvraag...';
    setTimeout(askForAgroToken, 300);
    renderLayers();
}

function createSelectionPoly(p1, p2) {
    const minLon = Math.min(p1[0], p2[0]), maxLon = Math.max(p1[0], p2[0]);
    const minLat = Math.min(p1[1], p2[1]), maxLat = Math.max(p1[1], p2[1]);
    selectionPoly = {
        type: 'Feature', 
        geometry: { type: 'Polygon', coordinates: [[[minLon, minLat],[maxLon, minLat],[maxLon, maxLat],[minLon, maxLat],[minLon, minLat]]] }
    };
}

async function fetchAgroData(token) {
    const endpoint = document.getElementById('agro-endpoint').value;
    const year = document.getElementById('agro-year').value;
    const statusDiv = document.getElementById('agro-status');
    const coords = selectionPoly.geometry.coordinates[0];
    const wkt = `POLYGON((${coords.map(p => p.join(' ')).join(',')}))`;
    statusDiv.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Ophalen...'; 
    window.closeModal();
    try {
        const params = new URLSearchParams({ year, page_size: 1000, geometry: wkt, epsg: 4326, output_epsg: 4326 });
        const response = await fetch(`/api/agro-proxy?path=${encodeURIComponent(`${endpoint}?${params.toString()}`)}`, { headers: { 'x-agro-token': token } });
        if(!response.ok) throw new Error(`API Fout: ${response.status}`);
        const data = await response.json();
        agroData = data.features || [];
        
        // Gewasstatistieken herstellen
        const crops = [...new Set(agroData.map(f => f.properties.crop_name || 'Onbekend'))];
        statusDiv.innerHTML = `✅ <b>${agroData.length} percelen</b>.<br><small>Gewassen: ${crops.slice(0,3).join(', ')}...</small>`;
        renderLayers();
    } catch (e) { statusDiv.innerHTML = `<span style="color:red">❌ Fout: ${e.message}</span>`; }
}

// --- NSO & MODALS ---
window.toggleNSO = () => { nsoActive = document.getElementById('toggle-nso').checked; if (nsoActive && !nsoCreds) askForNSOCreds(); else renderLayers(); };
window.updateNSOLayer = () => { if (nsoActive) renderLayers(); };
function askForAgroToken() { setupModal('AgroDataCube Token', 'WUR API Token vereist.', 'Token...', 'password', (val) => fetchAgroData(val)); }
function askForNSOCreds() { setupModal('NSO Login', '<code>user:pass</code>', 'user:pass', 'text', (val) => { nsoCreds = val; window.closeModal(); renderLayers(); }); }

function setupModal(title, desc, place, type, cb) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-desc').innerHTML = desc;
    const inp = document.getElementById('user-api-key');
    inp.placeholder = place; inp.type = type; inp.value = '';
    document.getElementById('modal-confirm-btn').onclick = () => { if(inp.value) cb(inp.value); };
    window.openModal();
}

// --- RENDER ---
function renderLayers() {
    const layers = [];
    if (!nsoActive) {
        if (isSatellite) {
            layers.push(new deck.TileLayer({
                id: 'basemap-sat', data: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg',
                minZoom: 0, maxZoom: 19, tileSize: 256,
                renderSubLayers: props => {
                    const {bbox: {west, south, east, north}} = props.tile;
                    return new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] });
                }
            }));
        } else { layers.push(DeckGLUtils.createBasemap(VIZ_CONFIG.basemap)); }
    }

    if (nsoActive && nsoCreds) {
        const lName = document.getElementById('nso-layer-select').value;
        const targetUrl = `https://wmts.satellietdataportaal.nl/wmts/${lName}/service?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${lName}&STYLE=default&TILEMATRIXSET=EPSG:3857&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png`;
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl).replace(/%7Bz%7D/g, '{z}').replace(/%7Bx%7D/g, '{x}').replace(/%7By%7D/g, '{y}')}`;
        layers.push(new deck.TileLayer({
            id: 'nso-sat', data: proxyUrl, minZoom: 0, maxZoom: 19, tileSize: 256,
            getTileData: async ({url}) => {
                const r = await fetch(url, { headers: { 'x-proxy-auth': `Basic ${btoa(nsoCreds)}` } });
                return r.ok ? r.arrayBuffer() : null;
            },
            renderSubLayers: props => {
                const {bbox: {west, south, east, north}} = props.tile;
                return new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] });
            }
        }));
    }

    if (drawState.active && drawState.start && drawState.end) {
        const poly = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[drawState.start[0], drawState.start[1]], [drawState.end[0], drawState.start[1]], [drawState.end[0], drawState.end[1]], [drawState.start[0], drawState.end[1]], [drawState.start[0], drawState.start[1]]]] } };
        layers.push(new deck.GeoJsonLayer({ id: 'drawing', data: [poly], filled: true, stroked: true, getFillColor: [0, 122, 194, 50], getLineColor: [0, 122, 194, 255], getLineWidth: 2, getLineDashArray: [4,2], extensions: [new deck.PathStyleExtension({dash:true})] }));
    }
    
    if (selectionPoly && !drawState.active) layers.push(new deck.GeoJsonLayer({ id: 'selection', data: [selectionPoly], filled: false, stroked: true, getLineColor: [0, 122, 194, 255], getLineWidth: 2 }));
    if (agroData.length > 0) layers.push(new deck.GeoJsonLayer({ id: 'agro-data', data: agroData, filled: true, stroked: true, getFillColor: [0, 255, 100, 120], getLineColor: [255, 255, 255, 200], getLineWidth: 1, pickable: true, autoHighlight: true }));
    
    activeWmsLayers.forEach(l => { 
        if (typeof createWMSLayer === 'function') layers.push(createWMSLayer(l)); 
    });

    deckInstance.setProps({ layers: layers });
}

function init() {
    deckInstance = new deck.DeckGL({
        container: 'container', initialViewState: VIZ_CONFIG.initialView, controller: true,
        onClick: onMapClick, onHover: (info) => { if (drawState.active && drawState.start && info.coordinate) { drawState.end = info.coordinate; renderLayers(); } },
        getTooltip: ({object}) => {
             if (!object || !object.properties || (object.geometry && object.geometry.type === 'Polygon' && !object.properties.fieldid)) return null;
             const p = object.properties;
             if (p.fieldid || p.crop_name) return { html: `<div style="background:white; padding:8px; border-radius:4px; font-size:12px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);"><b>${p.crop_name || 'Onbekend'}</b><br>ID: ${p.fieldid}<br>Opp: ${(p.area/10000).toFixed(2)} ha</div>` };
             return null;
        },
        onViewStateChange: ({viewState}) => { currentViewState = viewState; return viewState; }
    });
    initSearch(); renderLayers();
}
init();