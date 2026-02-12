// --- STATE ---
let deckInstance;
let activeWmsLayers = [];
let agroData = []; 
let selectionPoly = null; 
let drawState = { active: false, start: null, end: null };
let currentViewState = VIZ_CONFIG.initialView;
let isSatellite = false;

// Credentials State
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
    const btn = document.getElementById('btn-basemap');
    if(btn) btn.innerText = isSatellite ? "Kaart" : "Satelliet";
    renderLayers();
};

window.zoomIn = function() { deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom + 1 } }); };
window.zoomOut = function() { deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom - 1 } }); };
window.resetView = function() { deckInstance.setProps({ initialViewState: VIZ_CONFIG.initialView }); };

window.closeModal = function() { document.getElementById('key-modal').style.display = 'none'; };
window.openModal = function() { document.getElementById('key-modal').style.display = 'flex'; };

// --- DRAWING LOGIC (Agro) ---

window.fetchAgroDataTrigger = function() {
    // If we have a box, ask for token. If not, start drawing.
    if(!selectionPoly) {
        window.startDrawMode();
    } else {
        askForAgroToken();
    }
};

window.startDrawMode = function() {
    drawState.active = true;
    drawState.start = null; selectionPoly = null;
    deckInstance.setProps({ controller: { dragPan: false } });
    document.getElementById('container').style.cursor = 'crosshair';
    document.getElementById('agro-status').innerHTML = '<b><i class="fa fa-pen"></i> Teken Modus:</b> Klik start, beweeg, klik stop.';
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

    // Finish Drawing
    drawState.end = [lon, lat];
    drawState.active = false;
    deckInstance.setProps({ controller: true });
    document.getElementById('container').style.cursor = 'default';
    createSelectionPoly(drawState.start, drawState.end);
    document.getElementById('agro-status').innerHTML = '✅ Gebied geselecteerd. Bevestig nu.';
    setTimeout(askForAgroToken, 300); // Auto-open modal
    renderLayers();
}

function onMapHover(info) {
    if (drawState.active && drawState.start && info.coordinate) {
        drawState.end = info.coordinate;
        renderLayers();
    }
}

function createSelectionPoly(p1, p2) {
    const minLon = Math.min(p1[0], p2[0]), maxLon = Math.max(p1[0], p2[0]);
    const minLat = Math.min(p1[1], p2[1]), maxLat = Math.max(p1[1], p2[1]);
    selectionPoly = {
        type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[minLon, minLat],[maxLon, minLat],[maxLon, maxLat],[minLon, maxLat],[minLon, minLat]]] }
    };
}

// --- CREDENTIALS LOGIC ---

function askForAgroToken() {
    setupModal(
        'AgroDataCube Token', 
        'Voer je <b>WUR API Token</b> in.', 
        'Token...', 
        'password',
        (val) => { fetchAgroData(val); }
    );
}

function askForNSOCreds() {
    setupModal(
        'NSO Satelliet Login',
        'Voer in: <code>gebruikersnaam:wachtwoord</code>',
        'bv. thijs:Geheim123',
        'text',
        (val) => {
            if (!val || !val.includes(':')) { alert("Gebruik formaat: user:pass"); return; }
            nsoCreds = val;
            window.closeModal();
            renderLayers();
        }
    );
}

function setupModal(title, desc, placeholder, type, onConfirm) {
    const modal = document.getElementById('key-modal');
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-desc').innerHTML = desc;
    
    const input = document.getElementById('user-api-key');
    input.placeholder = placeholder;
    input.type = type;
    input.value = '';

    const btn = document.getElementById('modal-confirm-btn');
    btn.onclick = () => {
        if(!input.value) { alert("Invoer vereist."); return; }
        onConfirm(input.value);
        // Note: fetchAgroData closes modal inside itself on success
    };
    window.openModal();
}

// --- DATA FETCHING ---

async function fetchAgroData(token) {
    const endpoint = document.getElementById('agro-endpoint').value;
    const year = document.getElementById('agro-year').value;
    const statusDiv = document.getElementById('agro-status');
    
    // WKT Geometry for V2 API
    const coords = selectionPoly.geometry.coordinates[0];
    const wkt = `POLYGON((${coords.map(p => p.join(' ')).join(',')}))`;
    
    statusDiv.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Ophalen...';
    window.closeModal();
    
    try {
        const params = new URLSearchParams({
            year: year, page_size: 1000, geometry: wkt, epsg: 4326, output_epsg: 4326
        });

        // Use V2 API via Proxy
        const queryPath = `${endpoint}?${params.toString()}`;
        const res = await fetch(`/api/agro-proxy?path=${encodeURIComponent(queryPath)}`, {
            headers: { 'x-agro-token': token }
        });
        
        if(!res.ok) {
            if(res.status === 403) throw new Error("Token ongeldig (403).");
            throw new Error(`Fout ${res.status}`);
        }
        
        const data = await res.json();
        if(data.features) {
            agroData = data.features;
            statusDiv.innerHTML = `✅ ${agroData.length} percelen geladen.`;
        } else {
             statusDiv.innerHTML = `⚠️ Geen data (0)`;
             agroData = [];
        }
        renderLayers();
    } catch (e) {
        console.error(e);
        statusDiv.innerHTML = `<span style="color:red">❌ ${e.message}</span>`;
        alert(e.message);
    }
}

// --- NSO LOGIC ---

window.toggleNSO = function() {
    nsoActive = document.getElementById('toggle-nso').checked;
    if (nsoActive && !nsoCreds) {
        askForNSOCreds();
    } else {
        renderLayers();
    }
};

window.updateNSOLayer = function() {
    if (nsoActive) renderLayers();
};

// --- RENDER ---

function renderLayers() {
    const layers = [];

    // 1. BASEMAP (Only if NSO is OFF)
    if (!nsoActive) {
        if (isSatellite) {
            layers.push(new deck.TileLayer({
                id: 'basemap-sat',
                data: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg',
                minZoom: 0, maxZoom: 19, tileSize: 256,
                renderSubLayers: props => {
                    const {bbox: {west, south, east, north}} = props.tile;
                    return new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] });
                }
            }));
        } else {
            layers.push(DeckGLUtils.createBasemap(VIZ_CONFIG.basemap));
        }
    }

    // 2. NSO SATELLITE (Requires Proxy + Auth)
    if (nsoActive && nsoCreds) {
        const layerName = document.getElementById('nso-layer-select').value;
        const authString = btoa(nsoCreds); // Base64 encode user:pass
        
        // WMTS KVP URL for DeckGL (EPSG:3857)
        const wmtsParams = [
            `SERVICE=WMTS`, `REQUEST=GetTile`, `VERSION=1.0.0`,
            `LAYER=${layerName}`, `STYLE=default`,
            `TILEMATRIXSET=EPSG:3857`,
            `TILEMATRIX={z}`, `TILEROW={y}`, `TILECOL={x}`,
            `FORMAT=image/png`
        ].join('&');

        const targetUrl = `https://wmts.satellietdataportaal.nl/wmts/${layerName}/wmts?${wmtsParams}`;
        const proxyUrl = `https://maps.mapsthatmatter.io/api/proxy?url=${encodeURIComponent(targetUrl)}`;

        layers.push(new deck.TileLayer({
            id: 'nso-sat-layer',
            data: proxyUrl,
            minZoom: 0, maxZoom: 19, tileSize: 256,
            // Custom fetcher to inject header
            getTileData: async ({url}) => {
                const response = await fetch(url, {
                    headers: { 'x-proxy-auth': `Basic ${authString}` }
                });
                if (!response.ok) return null;
                return response.arrayBuffer();
            },
            renderSubLayers: props => {
                const {bbox: {west, south, east, north}} = props.tile;
                return new deck.BitmapLayer(props, {
                    data: null, image: props.data, bounds: [west, south, east, north]
                });
            }
        }));
    }

    // 3. DRAWING
    if (drawState.active && drawState.start && drawState.end) {
        const poly = {
            type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[drawState.start[0], drawState.start[1]], [drawState.end[0], drawState.start[1]], [drawState.end[0], drawState.end[1]], [drawState.start[0], drawState.end[1]], [drawState.start[0], drawState.start[1]]]] }
        };
        layers.push(new deck.GeoJsonLayer({
            id: 'drawing', data: [poly], filled: true, stroked: true, getFillColor: [0, 122, 194, 50], getLineColor: [0, 122, 194, 255], getLineWidth: 2, getLineDashArray: [4,2], extensions: [new deck.PathStyleExtension({dash:true})]
        }));
    }
    
    if (selectionPoly && !drawState.active) {
        layers.push(new deck.GeoJsonLayer({
            id: 'selection', data: [selectionPoly], filled: false, stroked: true, getLineColor: [0, 122, 194, 255], getLineWidth: 2
        }));
    }

    // 4. AGRO DATA
    if (agroData.length > 0) {
        layers.push(new deck.GeoJsonLayer({
            id: 'agro-data', data: agroData, filled: true, stroked: true, getFillColor: [0, 255, 100, 100], getLineColor: [255, 255, 255, 200], getLineWidth: 1, pickable: true, autoHighlight: true
        }));
    }

    // 5. WMS LAYERS
    activeWmsLayers.forEach(l => layers.push(createWMSLayer(l)));

    deckInstance.setProps({ layers: layers });
}

// --- INIT ---

function init() {
    deckInstance = new deck.DeckGL({
        container: 'container',
        initialViewState: VIZ_CONFIG.initialView,
        controller: true,
        onClick: onMapClick,
        onHover: onMapHover,
        getTooltip: ({object}) => {
             if (!object || !object.properties) return null;
             if (object.geometry.type === 'Polygon' && !object.properties.fieldid) return null; // Skip selection box
             const props = object.properties;
             return { html: `<div style="background:white; padding:8px; border-radius:4px; font-size:12px;"><b>ID:</b> ${props.fieldid || '-'}<br><b>Gewas:</b> ${props.crop_name || '-'}</div>` };
        },
        onViewStateChange: ({viewState}) => { currentViewState = viewState; return viewState; }
    });
    
    // Init Search (imported from csw-search.js)
    if(typeof initSearch === 'function') initSearch();
    renderLayers();
}

init();