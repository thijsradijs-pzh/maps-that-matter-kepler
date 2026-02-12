// --- STATE ---
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
        
        // MCA Style XML request
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
            
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(text, "text/xml");
            const records = Array.from(xmlDoc.getElementsByTagNameNS("*", "SummaryRecord"));
            
            displayResults(records);
        } catch (e) {
            resultsContainer.innerHTML = '<div style="color:red; padding:10px;">Fout bij zoeken.</div>';
        }
    }

    function displayResults(records) {
        resultsContainer.innerHTML = '';
        if(records.length === 0) {
            resultsContainer.innerHTML = '<div style="padding:10px;">Geen resultaten gevonden.</div>';
            return;
        }

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
                    <div style="font-weight:bold; color:#007ac2; margin-bottom:2px;">${title}</div>
                    <div style="font-size:10px; color:#666;">${abstract.substring(0,60)}...</div>
                `;
                div.onclick = () => addWmsLayer(title, url);
                resultsContainer.appendChild(div);
            }
        });
    }
}

async function addWmsLayer(title, url) {
    activeWmsLayers.push({
        id: Date.now(),
        title: title,
        url: url,
        layer: '0', 
        version: '1.3.0'
    });
    updateActiveLayersUI();
    renderLayers();
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
            div.style.padding = '5px';
            div.style.borderBottom = '1px solid #eee';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.innerHTML = `<span>${l.title}</span> <i class="fa fa-trash" style="cursor:pointer; color:red;" onclick="window.removeLayer('${l.id}')"></i>`;
            list.appendChild(div);
        });
    } else {
        container.style.display = 'none';
    }
}

window.removeLayer = function(id) {
    activeWmsLayers = activeWmsLayers.filter(l => l.id != id);
    updateActiveLayersUI();
    renderLayers();
}

// --- AGRO & DRAWING LOGIC ---

window.fetchAgroDataTrigger = function() {
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
    document.getElementById('agro-status').innerHTML = '<b>Teken Modus:</b> Klik start, beweeg, klik stop.';
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
    document.getElementById('agro-status').innerHTML = '✅ Gebied geselecteerd.';
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
    
    statusDiv.innerHTML = 'Ophalen...';
    window.closeModal();
    
    try {
        const params = new URLSearchParams({ year, page_size: 1000, geometry: wkt, epsg: 4326, output_epsg: 4326 });
        const response = await fetch(`/api/agro-proxy?path=${encodeURIComponent(`${endpoint}?${params.toString()}`)}`, { 
            headers: { 'x-agro-token': token } 
        });

        if(!response.ok) throw new Error(`API Fout: ${response.status}`);
        const data = await response.json();
        agroData = data.features || [];
        
        // Herstelde gewas-informatie
        const crops = [...new Set(agroData.map(f => f.properties.crop_name || 'Onbekend'))];
        statusDiv.innerHTML = `✅ <b>${agroData.length} percelen</b> geladen.<br>
                               <small>Gewassen: ${crops.slice(0,3).join(', ')}...</small>`;
        
        renderLayers();
    } catch (e) {
        statusDiv.innerHTML = `❌ Fout: ${e.message}`;
    }
}

// --- NSO & MODALS ---

window.toggleNSO = function() {
    nsoActive = document.getElementById('toggle-nso').checked;
    if (nsoActive && !nsoCreds) askForNSOCreds();
    else renderLayers();
};

function askForNSOCreds() {
    setupModal('NSO Login', 'Gebruik <code>user:pass</code>', 'user:pass', 'text', (val) => {
        nsoCreds = val; window.closeModal(); renderLayers();
    });
}

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

    if (nsoActive && nsoCreds) {
        const lName = document.getElementById('nso-layer-select').value;
        const targetUrl = `https://wmts.satellietdataportaal.nl/wmts/${lName}/service?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${lName}&STYLE=default&TILEMATRIXSET=EPSG:3857&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png`;
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl).replace(/%7Bz%7D/g, '{z}').replace(/%7Bx%7D/g, '{x}').replace(/%7By%7D/g, '{y}')}`;
        layers.push(new deck.TileLayer({
            id: 'nso-sat',
            data: proxyUrl,
            minZoom: 0, maxZoom: 19, tileSize: 256,
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
    
    if (selectionPoly && !drawState.active) {
        layers.push(new deck.GeoJsonLayer({ id: 'selection', data: [selectionPoly], filled: false, stroked: true, getLineColor: [0, 122, 194, 255], getLineWidth: 2 }));
    }

    if (agroData.length > 0) {
        layers.push(new deck.GeoJsonLayer({ 
            id: 'agro-data', data: agroData, filled: true, stroked: true, 
            getFillColor: [0, 255, 100, 120], getLineColor: [255, 255, 255, 200], 
            getLineWidth: 1, pickable: true, autoHighlight: true 
        }));
    }

    activeWmsLayers.forEach(l => {
        if (typeof createWMSLayer === 'function') layers.push(createWMSLayer(l));
    });

    deckInstance.setProps({ layers: layers });
}

function init() {
    deckInstance = new deck.DeckGL({
        container: 'container',
        initialViewState: VIZ_CONFIG.initialView,
        controller: true,
        onClick: onMapClick,
        onHover: (info) => { if (drawState.active && drawState.start && info.coordinate) { drawState.end = info.coordinate; renderLayers(); } },
        onViewStateChange: ({viewState}) => { currentViewState = viewState; return viewState; },
        getTooltip: ({object}) => {
             if (!object || !object.properties || (object.geometry && object.geometry.type === 'Polygon' && !object.properties.fieldid)) return null;
             const p = object.properties;
             // Herstelde uitgebreide tooltip
             if (p.fieldid || p.crop_name) {
                 return {
                    html: `<div style="background:white; padding:8px; border-radius:4px; font-size:12px; box-shadow: 0 4px 8px rgba(0,0,0,0.15); border-left: 4px solid #007ac2;">
                           <b style="color:#007ac2;">${p.crop_name || 'Onbekend'}</b><br>
                           <b>ID:</b> ${p.fieldid}<br>
                           <b>Opp:</b> ${(p.area / 10000).toFixed(2)} ha
                           </div>`
                 };
             }
             return null;
        }
    });
    
    initSearch();
    renderLayers();
}

init();