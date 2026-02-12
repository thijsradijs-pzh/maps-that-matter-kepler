// agro-viewer/app.js

// --- STATE ---
let deckInstance;
let activeWmsLayers = [];
let agroData = []; 
let selectionPoly = null; // Store the selected BBOX geometry
let currentViewState = VIZ_CONFIG.initialView;
let isSatellite = false;
let userToken = '';      // Store token temporarily

// --- UI INTERACTIONS ---
function closeModal() {
    document.getElementById('key-modal').style.display = 'none';
}

function openModal() {
    // Pre-fill if we already have it
    if(userToken) document.getElementById('user-api-key').value = userToken;
    document.getElementById('key-modal').style.display = 'flex';
}

async function confirmFetch() {
    const inputKey = document.getElementById('user-api-key').value;
    if (!inputKey) { alert("Vul een API token in."); return; }
    
    userToken = inputKey;
    closeModal();
    await fetchAgroData(userToken); // Trigger fetch
}

// --- MAP INTERACTION ---
function onMapClick(info) {
    if (!info.coordinate) return;

    // 1. Create a Bounding Box around the click (approx 1km x 1km)
    // 0.01 degrees lat/lon is roughly 1km
    const [lon, lat] = info.coordinate;
    const offset = 0.005; // ~500m radius
    
    const bbox = [
        lon - offset, lat - offset, // minLon, minLat
        lon + offset, lat + offset  // maxLon, maxLat
    ];

    // 2. Create Polygon for visualization
    selectionPoly = {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [[
                [bbox[0], bbox[1]],
                [bbox[2], bbox[1]],
                [bbox[2], bbox[3]],
                [bbox[0], bbox[3]],
                [bbox[0], bbox[1]]
            ]]
        },
        properties: { bboxString: bbox.join(',') }
    };

    // 3. Update map to show the blue box
    renderLayers();

    // 4. Open modal to ask for key
    openModal();
}

// --- AGRO DATA LOGIC ---
async function fetchAgroData(token) {
    if (!selectionPoly) { alert("Klik eerst op de kaart om een gebied te selecteren."); return; }

    const endpoint = document.getElementById('agro-endpoint').value;
    const year = document.getElementById('agro-year').value;
    const statusDiv = document.getElementById('agro-status');
    const bboxStr = selectionPoly.properties.bboxString; // minx,miny,maxx,maxy
    
    statusDiv.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Ophalen...';
    
    try {
        // Construct path: endpoint + geometry (bbox) + output epsg
        // Note: AgroDataCube expects 'geometry' param as WKT or bbox. 
        // For 'fields', it often supports a bbox param or geometry=bbox:...
        // Let's try standard bbox param if supported, or generic OGC filter.
        // NOTE: The exact param depends on the specific Agro endpoint. 
        // Assuming REST API v1 style:
        
        const queryPath = `${endpoint}?year=${year}&page_size=1000&geometry=${bboxStr}&epsg=4326`; 
        
        const res = await fetch(`/api/agro-proxy?path=${encodeURIComponent(queryPath)}`, {
            headers: {
                'x-agro-token': token // Send token in header
            }
        });
        
        if(!res.ok) {
            if(res.status === 401) throw new Error("Token ongeldig (401)");
            if(res.status === 404) throw new Error("Endpoint niet gevonden (404)");
            throw new Error(`Fout: ${res.status}`);
        }
        
        const data = await res.json();
        
        if(data.features) {
            agroData = data.features;
            statusDiv.innerHTML = `✅ ${agroData.length} objecten.`;
        } else {
             statusDiv.innerHTML = `⚠️ Geen data (0)`;
             agroData = [];
        }
        
        renderLayers();

    } catch (e) {
        console.error(e);
        statusDiv.innerText = e.message;
        alert("Fout bij ophalen: " + e.message);
    }
}

// --- RENDERING ---
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

    // 2. Selection Box (The area user clicked)
    if (selectionPoly) {
        layers.push(new deck.GeoJsonLayer({
            id: 'selection-box',
            data: [selectionPoly],
            filled: false,
            stroked: true,
            getLineColor: [0, 122, 194, 255], // Bright Blue
            getLineWidth: 2,
            lineWidthMinPixels: 2,
            getLineDashArray: [4, 2],
            lineDashJustified: true,
            extensions: [new deck.PathStyleExtension({dash: true})]
        }));
    }

    // 3. Agro Data Layer (Results)
    if (agroData.length > 0) {
        layers.push(new deck.GeoJsonLayer({
            id: 'agro-data',
            data: agroData,
            filled: true,
            stroked: true,
            getFillColor: [0, 255, 100, 100], // Green
            getLineColor: [255, 255, 255, 150],
            getLineWidth: 1,
            lineWidthMinPixels: 1,
            pickable: true,
            autoHighlight: true
        }));
    }

    // 4. WMS Layers
    activeWmsLayers.forEach(l => layers.push(createWMSLayer(l)));

    deckInstance.setProps({ layers: layers });
}
// --- HELPER: DEBOUNCE ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- SEARCH LOGIC (Fixes initSearch error) ---
function initSearch() {
    const input = document.getElementById('layer-search');
    const resultsContainer = document.getElementById('search-results');
    
    // Prevent errors if elements don't exist (e.g. simplified UI)
    if (!input || !resultsContainer) return;

    const performSearch = debounce(async (term) => {
        if (term.length < 2) { resultsContainer.style.display = 'none'; return; }

        resultsContainer.innerHTML = '<div style="padding:10px;color:#888;font-size:12px;"><i class="fa fa-spinner fa-spin"></i> Zoeken...</div>';
        resultsContainer.style.display = 'block';

        // Run Search via existing scripts
        const results = await searchGeoNetwork(term);
        displayResults(results);
    }, 500);

    function displayResults(results) {
        resultsContainer.innerHTML = '';
        if (results.length === 0) { 
            resultsContainer.innerHTML = '<div style="padding:10px;color:#888;font-size:12px;">Geen resultaten gevonden</div>'; 
            return; 
        }
        
        // Header
        const header = document.createElement('div');
        header.style.cssText = `padding:5px 15px;background:#f0f8ff;font-size:11px;font-weight:bold;color:#007ac2;`;
        header.textContent = `Resultaten (${results.length})`;
        resultsContainer.appendChild(header);

        results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'result-item';
            div.innerHTML = `
                <div style="flex:1;">
                   <div style="display:flex; justify-content:space-between;">
                        <span><i class="fa fa-globe" style="color:#E3001B; margin-right:8px;"></i> <b>${item.name}</b></span>
                   </div>
                   <span style="color:#888; font-size:11px;">${item.description}</span>
                </div>
                <i class="fa fa-plus-circle" style="color:#ccc; margin-left:8px;"></i>
            `;
            div.onclick = () => addWmsLayer(item);
            resultsContainer.appendChild(div);
        });
    }

    input.addEventListener('input', (e) => performSearch(e.target.value));
    
    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !resultsContainer.contains(e.target)) {
            resultsContainer.style.display = 'none';
        }
    });
}

// --- WMS LAYER MANAGEMENT ---
async function addWmsLayer(item) {
    // Check if already added
    if (activeWmsLayers.find(l => l.title === item.name)) return;
    
    // UI Feedback
    const resultItem = Array.from(document.querySelectorAll('.result-item')).find(el => el.innerText.includes(item.name));
    if(resultItem) resultItem.style.opacity = '0.5';

    try {
        console.log(`Adding layer: ${item.name}`);
        
        // 1. Fetch Capabilities to find BBOX and Layer Name
        const capUrl = new URL(item.url);
        capUrl.searchParams.set('service', 'WMS');
        capUrl.searchParams.set('request', 'GetCapabilities');
        
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(capUrl.toString())}`;
        const resp = await fetch(proxyUrl);
        const xmlText = await resp.text();
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        // Simple logic: pick the last named layer if exact match fails
        const allLayers = Array.from(xmlDoc.querySelectorAll('Layer'));
        const targetLayerNode = allLayers.filter(l => l.querySelector('Name')).pop();
        
        if (!targetLayerNode) throw new Error("Geen lagen gevonden");
        
        const finalLayerName = targetLayerNode.querySelector('Name').textContent;

        // 2. Extract BBOX (for zooming)
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

        // 3. Add to state
        activeWmsLayers.push({ 
            id: Date.now(), 
            url: item.url, 
            layer: finalLayerName, 
            title: item.name,
            bbox: bbox 
        });
        
        // 4. Update UI
        document.getElementById('search-results').style.display = 'none';
        document.getElementById('layer-search').value = '';
        updateActiveLayersUI();
        renderLayers();
        
        if(bbox) zoomToBbox(bbox);

    } catch (err) {
        console.error(err);
        alert("Kon laag niet laden.");
        if(resultItem) resultItem.style.opacity = '1';
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
    const centerLon = (minLon + maxLon) / 2;
    const centerLat = (minLat + maxLat) / 2;
    
    deckInstance.setProps({
        initialViewState: {
            ...currentViewState,
            longitude: centerLon,
            latitude: centerLat,
            zoom: 10,
            transitionDuration: 1000,
            transitionInterpolator: new deck.FlyToInterpolator()
        }
    });
}
// --- INIT ---
function init() {
    deckInstance = new deck.DeckGL({
        container: 'container',
        initialViewState: VIZ_CONFIG.initialView,
        controller: true,
        onClick: onMapClick, // ACTIVATE CLICK LISTENER
        getTooltip: ({object}) => object && object.properties && {
             html: `<div style="background:white; padding:5px; font-size:12px;">
                    <b>ID:</b> ${object.properties.fieldid || '-'}<br>
                    <b>Crop:</b> ${object.properties.crop_name || '-'}
                    </div>`
        },
        onViewStateChange: ({viewState}) => { currentViewState = viewState; return viewState; }
    });
    
    initSearch(); 
    renderLayers();
}

// ... keep switchTab, zoomIn, zoomOut, toggleBasemap ...
// (These can remain the same as previous step)

init();