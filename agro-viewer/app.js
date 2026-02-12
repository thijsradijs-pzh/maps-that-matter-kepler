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