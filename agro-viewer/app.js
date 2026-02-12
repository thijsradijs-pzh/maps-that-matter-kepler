// agro-viewer/app.js

// --- STATE ---
let deckInstance;
let activeWmsLayers = [];
let agroData = []; 
let selectionPoly = null; // The finished polygon
let drawState = {
    active: false,
    start: null,    // [lon, lat]
    end: null       // [lon, lat]
};
let currentViewState = VIZ_CONFIG.initialView;
let isSatellite = false;
let userToken = '';

// --- GLOBAL UTILS (Fixes ReferenceErrors) ---
window.switchTab = function(t) {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.sidebar-content').forEach(x => x.classList.remove('active'));
    
    const tabMap = { 'data': 0, 'layers': 1 };
    const contentMap = { 'data': 'data-content', 'layers': 'layer-content' };
    
    // Fix: Handle cases where tab/content might not exist
    if(document.querySelectorAll('.tab')[tabMap[t]]) {
        document.querySelectorAll('.tab')[tabMap[t]].classList.add('active');
    }
    if(document.getElementById(contentMap[t])) {
        document.getElementById(contentMap[t]).classList.add('active');
    }
};

window.toggleBasemap = function() {
    isSatellite = !isSatellite;
    const btn = document.getElementById('btn-basemap');
    if(btn) btn.innerText = isSatellite ? "Kaart" : "Satelliet";
    renderLayers();
};

window.startDrawMode = function() {
    drawState.active = true;
    drawState.start = null;
    drawState.end = null;
    selectionPoly = null;
    
    // Disable map panning/rotating while drawing
    deckInstance.setProps({ controller: { dragPan: false } });
    document.getElementById('container').style.cursor = 'crosshair';
    
    // UI Feedback
    const statusDiv = document.getElementById('agro-status');
    if(statusDiv) statusDiv.innerHTML = '<b>Teken Modus:</b> Klik op de kaart om te beginnen.';
    
    renderLayers();
};

window.zoomIn = function() { deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom + 1 } }); };
window.zoomOut = function() { deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom - 1 } }); };
window.resetView = function() { deckInstance.setProps({ initialViewState: VIZ_CONFIG.initialView }); };

window.closeModal = function() {
    document.getElementById('key-modal').style.display = 'none';
};

window.openModal = function() {
    if(userToken) document.getElementById('user-api-key').value = userToken;
    document.getElementById('key-modal').style.display = 'flex';
};

window.confirmFetch = async function() {
    const inputKey = document.getElementById('user-api-key').value;
    if (!inputKey) { alert("Vul een API token in."); return; }
    userToken = inputKey;
    closeModal();
    await fetchAgroData(userToken);
};

window.fetchAgroDataTrigger = function() {
    // This function is called by the "Data Ophalen" button
    if(!selectionPoly) {
        // Automatically start drawing if no selection
        window.startDrawMode();
        return;
    }
    window.openModal();
};

// --- MAP EVENTS ---

function onMapClick(info) {
    if (!info.coordinate || !drawState.active) return;

    const [lon, lat] = info.coordinate;

    // Step 1: Start Drawing
    if (!drawState.start) {
        drawState.start = [lon, lat];
        drawState.end = [lon, lat]; // Initialize end same as start
        document.getElementById('agro-status').innerHTML = '<b>Teken Modus:</b> Klik nogmaals om af te ronden.';
        renderLayers();
        return;
    }

    // Step 2: Finish Drawing
    drawState.end = [lon, lat];
    drawState.active = false;
    
    // Re-enable map controller
    deckInstance.setProps({ controller: true });
    document.getElementById('container').style.cursor = 'default';

    // Create the final Polygon Feature
    createSelectionPoly(drawState.start, drawState.end);
    
    document.getElementById('agro-status').innerHTML = '✅ Gebied geselecteerd.';
    
    // Automatically open modal
    setTimeout(window.openModal, 200);
    renderLayers();
}

function onMapHover(info) {
    // Live update of the rectangle while moving mouse
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
        properties: { 
            bboxString: `${minLon},${minLat},${maxLon},${maxLat}` 
        }
    };
}

// --- DATA FETCHING ---

async function fetchAgroData(token) {
    if (!selectionPoly) return;

    const endpoint = document.getElementById('agro-endpoint').value;
    const year = document.getElementById('agro-year').value;
    const statusDiv = document.getElementById('agro-status');
    const bboxStr = selectionPoly.properties.bboxString;
    
    statusDiv.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Ophalen...';
    
    try {
        // Determine geometry param based on endpoint
        let geomParam = `geometry=${bboxStr}`;
        // Some endpoints like 'fields' might prefer just 'bbox' or WKT. 
        // We stick to the standard bbox string for now.
        
        const queryPath = `${endpoint}?year=${year}&page_size=1000&${geomParam}&epsg=4326`; 
        
        console.log("Fetching proxy:", `/api/agro-proxy?path=${encodeURIComponent(queryPath)}`);

        const res = await fetch(`/api/agro-proxy?path=${encodeURIComponent(queryPath)}`, {
            headers: { 'x-agro-token': token }
        });
        
        if(!res.ok) {
            const errTxt = await res.text();
            throw new Error(`API Error (${res.status}): ${errTxt}`);
        }
        
        const data = await res.json();
        
        if(data.features) {
            agroData = data.features;
            statusDiv.innerHTML = `✅ ${agroData.length} objecten gevonden.`;
        } else {
             statusDiv.innerHTML = `⚠️ Geen features gevonden.`;
             agroData = [];
        }
        
        renderLayers();

    } catch (e) {
        console.error(e);
        statusDiv.innerHTML = `<span style="color:red; font-size:10px;">${e.message.substring(0, 50)}...</span>`;
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

    // 2. Active Drawing (The "Rubber Band")
    if (drawState.active && drawState.start && drawState.end) {
        const tempPoly = {
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
        };
        
        layers.push(new deck.GeoJsonLayer({
            id: 'drawing-box',
            data: [tempPoly],
            filled: true,
            stroked: true,
            getFillColor: [0, 122, 194, 50],
            getLineColor: [0, 122, 194, 255],
            getLineWidth: 2,
            lineWidthMinPixels: 2,
            getLineDashArray: [4, 2],
            extensions: [new deck.PathStyleExtension({dash: true})]
        }));
    }

    // 3. Finished Selection
    if (selectionPoly && !drawState.active) {
        layers.push(new deck.GeoJsonLayer({
            id: 'selection-box',
            data: [selectionPoly],
            filled: false,
            stroked: true,
            getLineColor: [0, 122, 194, 255], // Solid Blue
            getLineWidth: 3
        }));
    }

    // 4. Agro Data
    if (agroData.length > 0) {
        layers.push(new deck.GeoJsonLayer({
            id: 'agro-data',
            data: agroData,
            filled: true,
            stroked: true,
            getFillColor: [0, 200, 100, 160], 
            getLineColor: [255, 255, 255, 200],
            getLineWidth: 1,
            pickable: true,
            autoHighlight: true
        }));
    }

    // 5. WMS Layers
    activeWmsLayers.forEach(l => layers.push(createWMSLayer(l)));

    deckInstance.setProps({ layers: layers });
}

// --- INIT ---

function init() {
    deckInstance = new deck.DeckGL({
        container: 'container',
        initialViewState: VIZ_CONFIG.initialView,
        controller: true, // Default controller state
        onClick: onMapClick,
        onHover: onMapHover,
        getTooltip: ({object}) => {
             if (!object || !object.properties) return null;
             // Don't show tooltip for the selection box itself
             if (object.geometry.type === 'Polygon' && !object.properties.fieldid) return null;
             
             return {
                 html: `<div style="background:white; padding:6px; font-size:12px; border:1px solid #ccc; border-radius:4px;">
                        <b>ID:</b> ${object.properties.fieldid || object.id || '-'}<br>
                        <b>Gewas:</b> ${object.properties.crop_name || object.properties.cropname || '-'}
                        </div>`
             };
        },
        onViewStateChange: ({viewState}) => { 
            currentViewState = viewState; 
            return viewState; 
        }
    });
    
    // Initialize Search if function exists (re-add initSearch block if needed)
    if(typeof initSearch === 'function') initSearch();
    
    renderLayers();
}

// Start the app
init();