// agro-viewer/app.js

// --- STATE ---
let deckInstance;
let activeWmsLayers = [];
let agroData = []; // Store fetched GeoJSON here
let currentViewState = VIZ_CONFIG.initialView;
let isSatellite = false;

// --- AGRO DATA LOGIC ---
async function fetchAgroData() {
    const endpoint = document.getElementById('agro-endpoint').value;
    const year = document.getElementById('agro-year').value;
    const statusDiv = document.getElementById('agro-status');
    
    // For demo purposes, we limit the geometry to the current view or a small bbox 
    // because AgroDataCube data can be huge.
    // Example BBOX construction (simplified):
    const bbox = "180000,440000,190000,450000"; // RD Coordinates (EPSG:28992) often required by AgroDataCube
    // Note: You might need a coordinate transformer if the API requires RD. 
    // For this example, we assume we just call the endpoint.
    
    statusDiv.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Ophalen...';
    
    try {
        // Construct path for our proxy
        // Example: rest/v1/fields?year=2022&page_size=100
        const queryPath = `${endpoint}?year=${year}&page_size=500&epsg=4326`; // Request WGS84 for DeckGL
        
        const res = await fetch(`/api/agro-proxy?path=${encodeURIComponent(queryPath)}`);
        
        if(!res.ok) throw new Error("API Fout");
        
        const data = await res.json();
        
        // AgroDataCube often returns a 'features' array or similar. 
        // Adjust based on exact API response structure.
        if(data.features) {
            agroData = data.features;
            statusDiv.innerHTML = `✅ ${agroData.length} objecten geladen.`;
            
            // Zoom to first feature
            if(agroData.length > 0 && agroData[0].geometry) {
                // simple zoom logic could go here
            }
        } else {
             statusDiv.innerHTML = `⚠️ Geen standaard GeoJSON ontvangen.`;
             console.log("Received:", data);
        }
        
        renderLayers();

    } catch (e) {
        console.error(e);
        statusDiv.innerText = "Fout bij ophalen data: " + e.message;
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

    // 2. Agro Data Layer (GeoJSON)
    if (agroData.length > 0) {
        layers.push(new deck.GeoJsonLayer({
            id: 'agro-data',
            data: agroData,
            filled: true,
            stroked: true,
            getFillColor: [0, 150, 0, 150], // Green for agriculture
            getLineColor: [255, 255, 255, 100],
            getLineWidth: 1,
            lineWidthMinPixels: 1,
            pickable: true,
            autoHighlight: true,
            tooltip: true
        }));
    }

    // 3. Active WMS Layers (Reusable from MCA)
    activeWmsLayers.forEach(l => layers.push(createWMSLayer(l)));

    deckInstance.setProps({ layers: layers });
}

// --- INIT & UTILS ---
function init() {
    deckInstance = new deck.DeckGL({
        container: 'container',
        initialViewState: VIZ_CONFIG.initialView,
        controller: true,
        getTooltip: ({object}) => object && {
             html: `<div style="background:white; padding:5px; border-radius:3px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                    <b>ID:</b> ${object.properties?.fieldid || object.id}<br>
                    <b>Crop:</b> ${object.properties?.crop_name || 'Onbekend'}
                    </div>`
        },
        onViewStateChange: ({viewState}) => { currentViewState = viewState; return viewState; }
    });
    
    // Reuse the search logic from MCA
    initSearch(); 
    renderLayers();
}

// Reuse the search UI logic from the original app.js, 
// just simplified to target the new IDs in index.html
function initSearch() {
    const input = document.getElementById('layer-search');
    const resultsContainer = document.getElementById('search-results');
    
    // ... Copy 'debounce', 'addWmsLayer', etc from existing app.js ...
    // ... Or better yet, modularize them. For now, you can copy-paste the 
    // logic from multi-criteria-analysis/js/app.js related to 'initSearch', 
    // 'addWmsLayer', 'removeWmsLayer' into this file.
    
    // Ensure you use the global 'activeWmsLayers' and call 'renderLayers' on change.
}

// Basic Tabs
function switchTab(t) {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.sidebar-content').forEach(x => x.classList.remove('active'));
    
    const tabMap = { 'data': 0, 'layers': 1 };
    const contentMap = { 'data': 'data-content', 'layers': 'layer-content' };
    
    document.querySelectorAll('.tab')[tabMap[t]].classList.add('active');
    document.getElementById(contentMap[t]).classList.add('active');
}

function zoomIn() { deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom + 1 } }); }
function zoomOut() { deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom - 1 } }); }
function resetView() { deckInstance.setProps({ initialViewState: VIZ_CONFIG.initialView }); }
function toggleBasemap() { isSatellite = !isSatellite; renderLayers(); }

// Start
init();