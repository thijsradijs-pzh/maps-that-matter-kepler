// agro-viewer/app.js

// --- STATE ---
let deckInstance;
let activeWmsLayers = [];
let agroData = []; 
let selectionPoly = null; 
let drawState = { active: false, start: null, end: null };
let currentViewState = VIZ_CONFIG.initialView;
let isSatellite = false;
let userToken = '';
// --- PRESET LAYERS CONFIG ---
const PRESETS = {
    'pzh': {
        id: 'pzh-nnn',
        title: 'Natuurnetwerk Nederland',
        // Use PDOK (National standard, faster, no weird characters in layer name)
        url: 'https://service.pdok.nl/provincies/natuurnetwerk-nederland/wms/v1_0',
        layer: 'NatuurnetwerkNederland', 
        version: '1.3.0'
    },
    'ahn': {
        id: 'ahn-4',
        title: 'AHN4 Maaiveld (Hoogte)',
        url: 'https://service.pdok.nl/rws/ahn/wms/v1_0',
        layer: 'dtm_05m',
        version: '1.3.0'
    }
};
// --- HELPER: DEBOUNCE ---
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
    
    const tabMap = { 'data': 0, 'layers': 1 };
    const contentMap = { 'data': 'data-content', 'layers': 'layer-content' };
    
    if(document.querySelectorAll('.tab')[tabMap[t]]) document.querySelectorAll('.tab')[tabMap[t]].classList.add('active');
    if(document.getElementById(contentMap[t])) document.getElementById(contentMap[t]).classList.add('active');
};

window.toggleBasemap = function() {
    isSatellite = !isSatellite;
    const btn = document.getElementById('btn-basemap');
    if(btn) btn.innerText = isSatellite ? "Kaart" : "Foto";
    renderLayers();
};

window.zoomIn = function() { deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom + 1 } }); };
window.zoomOut = function() { deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom - 1 } }); };
window.resetView = function() { deckInstance.setProps({ initialViewState: VIZ_CONFIG.initialView }); };

window.closeModal = function() { document.getElementById('key-modal').style.display = 'none'; };

window.openModal = function() {
    if(userToken) document.getElementById('user-api-key').value = userToken;
    document.getElementById('key-modal').style.display = 'flex';
};

window.confirmFetch = async function() {
    const inputKey = document.getElementById('user-api-key').value;
    if (!inputKey) { alert("Vul een API token in."); return; }
    userToken = inputKey;
    window.closeModal();
    await fetchAgroData(userToken);
};

window.fetchAgroDataTrigger = function() {
    if(!selectionPoly) {
        window.startDrawMode();
    } else {
        window.openModal();
    }
};

window.startDrawMode = function() {
    drawState.active = true;
    drawState.start = null;
    drawState.end = null;
    selectionPoly = null;
    
    deckInstance.setProps({ controller: { dragPan: false } });
    document.getElementById('container').style.cursor = 'crosshair';
    document.getElementById('agro-status').innerHTML = '<b><i class="fa fa-pen"></i> Teken Modus:</b> Klik 1x om te starten, beweeg muis, klik nogmaals om te stoppen.';
    renderLayers();
};

window.togglePreset = function(key) {
    const checkbox = document.getElementById(`toggle-${key}`);
    const config = PRESETS[key];
    
    if (checkbox.checked) {
        // Add to activeWmsLayers if not present
        if (!activeWmsLayers.find(l => l.id === config.id)) {
            activeWmsLayers.push({
                id: config.id,
                title: config.title,
                url: config.url,
                layer: config.layer,
                version: config.version
            });
        }
    } else {
        // Remove
        activeWmsLayers = activeWmsLayers.filter(l => l.id !== config.id);
    }
    
    // Update the "Active Layers" list in the other tab just in case
    if(typeof updateActiveLayersUI === 'function') updateActiveLayersUI();
    
    renderLayers();
};

// --- SEARCH LOGIC (Restored) ---
function initSearch() {
    const input = document.getElementById('layer-search');
    const resultsContainer = document.getElementById('search-results');
    
    if (!input || !resultsContainer) return;

    const performSearch = debounce(async (term) => {
        if (term.length < 2) { resultsContainer.style.display = 'none'; return; }

        resultsContainer.innerHTML = '<div style="padding:10px;color:#888;font-size:12px;"><i class="fa fa-spinner fa-spin"></i> Zoeken...</div>';
        resultsContainer.style.display = 'block';

        // Uses csw-search.js functions
        const results = await searchGeoNetwork(term);
        displayResults(results);
    }, 500);

    function displayResults(results) {
        resultsContainer.innerHTML = '';
        if (results.length === 0) { 
            resultsContainer.innerHTML = '<div style="padding:10px;color:#888;font-size:12px;">Geen resultaten gevonden</div>'; 
            return; 
        }
        
        const header = document.createElement('div');
        header.style.cssText = `padding:5px 15px;background:#f0f8ff;font-size:11px;font-weight:bold;color:#007ac2;`;
        header.textContent = `Resultaten (${results.length})`;
        resultsContainer.appendChild(header);

        results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'result-item'; // Style comes from style.css
            div.innerHTML = `
                <div style="flex:1;">
                   <div style="display:flex; justify-content:space-between;">
                        <span><i class="fa fa-layer-group" style="color:#007ac2; margin-right:8px;"></i> <b>${item.name}</b></span>
                   </div>
                   <span style="color:#888; font-size:11px;">${item.description.substring(0,60)}...</span>
                </div>
                <i class="fa fa-plus-circle" style="color:#ccc; margin-left:8px;"></i>
            `;
            div.onclick = () => addWmsLayer(item);
            resultsContainer.appendChild(div);
        });
    }

    input.addEventListener('input', (e) => performSearch(e.target.value));
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !resultsContainer.contains(e.target)) resultsContainer.style.display = 'none';
    });
}

// --- WMS LOGIC ---
async function addWmsLayer(item) {
    if (activeWmsLayers.find(l => l.title === item.name)) return;
    
    // UI Feedback
    document.getElementById('loading').style.display = 'block';

    try {
        const capUrl = new URL(item.url);
        capUrl.searchParams.set('service', 'WMS');
        capUrl.searchParams.set('request', 'GetCapabilities');
        
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(capUrl.toString())}`;
        const resp = await fetch(proxyUrl);
        const xmlText = await resp.text();
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        // Find layer
        const allLayers = Array.from(xmlDoc.querySelectorAll('Layer'));
        const targetLayerNode = allLayers.filter(l => l.querySelector('Name')).pop();
        
        if (!targetLayerNode) throw new Error("Geen lagen gevonden");
        const finalLayerName = targetLayerNode.querySelector('Name').textContent;

        // BBOX
        let bbox = null;
        const geoBbox = targetLayerNode.querySelector('EX_GeographicBoundingBox');
        if (geoBbox) {
            bbox = [
                parseFloat(geoBbox.querySelector('westBoundLongitude').textContent),
                parseFloat(geoBbox.querySelector('southBoundLatitude').textContent),
                parseFloat(geoBbox.querySelector('eastBoundLongitude').textContent),
                parseFloat(geoBbox.querySelector('northBoundLatitude').textContent)
            ];
        }

        activeWmsLayers.push({ id: Date.now(), url: item.url, layer: finalLayerName, title: item.name, bbox: bbox });
        
        document.getElementById('search-results').style.display = 'none';
        document.getElementById('layer-search').value = '';
        updateActiveLayersUI();
        renderLayers();
        if(bbox) zoomToBbox(bbox);

    } catch (err) {
        console.error(err);
        alert("Kon laag niet laden (CORS of Proxy fout).");
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function removeWmsLayer(id) {
    activeWmsLayers = activeWmsLayers.filter(l => l.id !== id);
    updateActiveLayersUI();
    renderLayers();
}

function updateActiveLayersUI() {
    const container = document.getElementById('active-wms-layers');
    const list = document.getElementById('wms-list-content');
    list.innerHTML = '';
    
    if (activeWmsLayers.length > 0) {
        container.style.display = 'block';
        activeWmsLayers.forEach(l => {
            const div = document.createElement('div');
            div.className = 'active-wms-item';
            div.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <i class="fa fa-check-square" style="color:#007ac2; margin-right:5px;"></i> 
                    <span>${l.title}</span>
                </div>
                <i class="fa fa-trash" style="cursor:pointer; color:#999;" onclick="removeWmsLayer(${l.id})"></i>
            `;
            list.appendChild(div);
        });
    } else { 
        container.style.display = 'none'; 
    }
}

function zoomToBbox(bbox) {
    if (!bbox) return;
    const [minLon, minLat, maxLon, maxLat] = bbox;
    deckInstance.setProps({
        initialViewState: {
            ...currentViewState,
            longitude: (minLon + maxLon) / 2,
            latitude: (minLat + maxLat) / 2,
            zoom: 10,
            transitionDuration: 1000
        }
    });
}

// --- MAP & DATA LOGIC ---
function onMapClick(info) {
    if (!info.coordinate || !drawState.active) return;
    const [lon, lat] = info.coordinate;

    if (!drawState.start) {
        drawState.start = [lon, lat];
        drawState.end = [lon, lat];
        document.getElementById('agro-status').innerHTML = '<b><i class="fa fa-pen"></i> Bezig...</b> Klik nogmaals om het vak te sluiten.';
        renderLayers();
        return;
    }

    drawState.end = [lon, lat];
    drawState.active = false;
    deckInstance.setProps({ controller: true });
    document.getElementById('container').style.cursor = 'default';

    createSelectionPoly(drawState.start, drawState.end);
    document.getElementById('agro-status').innerHTML = '✅ Gebied geselecteerd. Klik op "Data Ophalen" in de popup.';
    setTimeout(window.openModal, 200);
    renderLayers();
}

function onMapHover(info) {
    if (drawState.active && drawState.start && info.coordinate) {
        drawState.end = info.coordinate;
        renderLayers();
    }
}

function createSelectionPoly(p1, p2) {
    const minLon = Math.min(p1[0], p2[0]);
    const maxLon = Math.max(p1[0], p2[0]);
    const minLat = Math.min(p1[1], p2[1]);
    const maxLat = Math.max(p1[1], p2[1]);

    selectionPoly = {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [[
                [minLon, minLat],
                [maxLon, minLat],
                [maxLon, maxLat],
                [minLon, maxLat],
                [minLon, minLat]
            ]]
        },
        properties: { bboxString: `${minLon},${minLat},${maxLon},${maxLat}` }
    };
}

// In agro-viewer/app.js

async function fetchAgroData(token) {
    if (!selectionPoly) return;

    const endpoint = document.getElementById('agro-endpoint').value;
    const year = document.getElementById('agro-year').value;
    const statusDiv = document.getElementById('agro-status');
    
    // 1. Convert BBOX to WKT (Well Known Text) Polygon
    // format: POLYGON((minx miny, maxx miny, maxx maxy, minx maxy, minx miny))
    const coords = selectionPoly.geometry.coordinates[0];
    const wkt = `POLYGON((${coords.map(p => p.join(' ')).join(',')}))`;

    statusDiv.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Ophalen bij WUR...';
    
    try {
        // 2. Construct Query Parameters
        const params = new URLSearchParams({
            year: year,
            page_size: 1000,     // Limit results
            geometry: wkt,       // WKT Geometry
            epsg: 4326,          // Input Geometry is WGS84
            output_epsg: 4326    // OUTPUT MUST BE WGS84 (for DeckGL)
        });

        // 3. Construct Proxy URL
        // We use the 'endpoint' from the dropdown (e.g., "rest/fields")
        const queryPath = `${endpoint}?${params.toString()}`;
        console.log("Requesting:", queryPath);
        
        const res = await fetch(`/api/agro-proxy?path=${encodeURIComponent(queryPath)}`, {
            headers: { 'x-agro-token': token }
        });
        
        if(!res.ok) {
            const errTxt = await res.text();
            // Handle specific 404 (Path not found) vs 401 (Unauthorized)
            if (res.status === 404) throw new Error("Endpoint bestaat niet (404).");
            if (res.status === 401) throw new Error("Token geweigerd (401).");
            throw new Error(`API Fout (${res.status}): ${errTxt.substring(0,100)}`);
        }
        
        const data = await res.json();
        
        if(data.features && data.features.length > 0) {
            agroData = data.features;
            statusDiv.innerHTML = `✅ <b>Succes!</b> ${agroData.length} percelen geladen.`;
        } else {
             statusDiv.innerHTML = `⚠️ Geen data gevonden in dit gebied.`;
             agroData = [];
        }
        
        renderLayers();

    } catch (e) {
        console.error(e);
        statusDiv.innerHTML = `<span style="color:#d9534f;">❌ ${e.message}</span>`;
    }
}

function renderLayers() {
    const layers = [];

    // 1. Basemap
    if (isSatellite) {
        layers.push(new deck.TileLayer({
            id: 'satellite',
            data: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg',
            minZoom: 6, maxZoom: 19, tileSize: 256,
            renderSubLayers: props => {
                const {bbox: {west, south, east, north}} = props.tile;
                return new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] });
            }
        }));
    } else {
        layers.push(DeckGLUtils.createBasemap(VIZ_CONFIG.basemap));
    }

    // 2. Drawing State
    if (drawState.active && drawState.start && drawState.end) {
        layers.push(new deck.GeoJsonLayer({
            id: 'drawing',
            data: [{
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [drawState.start[0], drawState.start[1]],
                        [drawState.end[0], drawState.start[1]],
                        [drawState.end[0], drawState.end[1]],
                        [drawState.start[0], drawState.end[1]],
                        [drawState.start[0], drawState.start[1]]
                    ]]
                }
            }],
            filled: true,
            stroked: true,
            getFillColor: [0, 122, 194, 50],
            getLineColor: [0, 122, 194, 255],
            getLineWidth: 2,
            getLineDashArray: [4,2],
            extensions: [new deck.PathStyleExtension({dash: true})]
        }));
    }

    // 3. Selection
    if (selectionPoly && !drawState.active) {
        layers.push(new deck.GeoJsonLayer({
            id: 'selection',
            data: [selectionPoly],
            filled: false,
            stroked: true,
            getLineColor: [0, 122, 194, 255],
            getLineWidth: 2
        }));
    }

    // 4. Results
    if (agroData.length > 0) {
        layers.push(new deck.GeoJsonLayer({
            id: 'agro-data',
            data: agroData,
            filled: true,
            stroked: true,
            getFillColor: [50, 200, 100, 140],
            getLineColor: [255, 255, 255, 100],
            getLineWidth: 1,
            pickable: true,
            autoHighlight: true
        }));
    }

    // 5. WMS
    activeWmsLayers.forEach(l => layers.push(createWMSLayer(l)));

    deckInstance.setProps({ layers: layers });
}

function init() {
    deckInstance = new deck.DeckGL({
        container: 'container',
        initialViewState: VIZ_CONFIG.initialView,
        controller: true,
        onClick: onMapClick,
        onHover: onMapHover,
        getTooltip: ({object}) => {
             if (!object || !object.properties) return null;
             // Basic Tooltip
             const props = object.properties;
             let content = '';
             // Fields
             if(props.fieldid) content += `<b>ID:</b> ${props.fieldid}<br><b>Gewas:</b> ${props.crop_name || '-'}`;
             // Soil
             else if(props.soilcode) content += `<b>Bodem:</b> ${props.soilcode}<br><b>Type:</b> ${props.soilname}`;
             // General
             else content = JSON.stringify(props).substring(0,100);
             
             return { html: `<div style="background:white; padding:8px; border-radius:4px; box-shadow:0 2px 5px rgba(0,0,0,0.2); font-size:12px;">${content}</div>` };
        },
        onViewStateChange: ({viewState}) => { currentViewState = viewState; return viewState; }
    });
    
    initSearch();
    renderLayers();
}

init();