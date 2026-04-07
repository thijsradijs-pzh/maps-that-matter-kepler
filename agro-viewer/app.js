// --- GLOBAL STATE ---
let deckInstance;
let activeWmsLayers = [];
let agroData = [];
let selectionPoly = null;
let drawState = { active: false, start: null, end: null };
let currentViewState = VIZ_CONFIG.initialView;
let isSatellite = false;

// Cache WMS GetCapabilities responses to avoid re-fetching the same service twice
const _capabilitiesCache = new Map();

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

// --- NGR SEARCH LOGIC (MATCHING MCA STYLE) ---

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
        if (term.length < 3) { resultsContainer.innerHTML = ''; resultsContainer.style.display = 'none'; return; }
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = '<div style="padding:10px;color:#888;font-size:12px;"><i class="fa fa-spinner fa-spin"></i> Zoeken in NGR...</div>';

        try {
            const results = await searchGeoNetwork(term);
            displayResults(results);
        } catch (e) {
            console.error("Search Error:", e);
            resultsContainer.innerHTML = '<div style="color:red; padding:10px;">Fout bij zoeken.</div>';
        }
    }

    function displayResults(results) {
        resultsContainer.innerHTML = '';
        resultsContainer.style.display = 'block';
        if(results.length === 0) {
            resultsContainer.innerHTML = '<div style="padding:10px;color:#888;font-size:12px;">Geen resultaten gevonden.</div>';
            return;
        }

        const header = document.createElement('div');
        header.style.cssText = 'padding:5px 15px;background:#f0f8ff;font-size:11px;font-weight:bold;color:#007ac2;';
        header.textContent = `Nationaal Geo Register (${results.length})`;
        resultsContainer.appendChild(header);

        results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'result-item';
            const pubText = item.publisher || 'NGR';
            div.innerHTML = `
                <div style="flex:1;">
                   <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                       <span><i class="fa fa-globe" style="color:#E3001B; margin-right:8px;"></i> <b>${item.name || item.title}</b></span>
                       <span style="background:#E3001B; color:white; font-size:9px; padding:1px 4px; border-radius:3px; white-space:nowrap; margin-left:5px;">${pubText}</span>
                   </div>
                   <span style="color:#888; font-size:11px;">${(item.description || "").substring(0,80)}</span>
                </div>
                <i class="fa fa-plus-circle" style="color:#ccc; margin-left:8px;"></i>
            `;
            div.onclick = () => addWmsLayer(item);
            resultsContainer.appendChild(div);
        });
    }
}

async function addWmsLayer(item) {
    if (activeWmsLayers.find(l => l.title === item.name)) return;

    const resultItem = Array.from(document.querySelectorAll('.result-item')).find(el => el.innerText.includes(item.name));
    if (resultItem) resultItem.style.opacity = '0.5';

    try {
        const capUrl = new URL(item.url);
        capUrl.searchParams.set('service', 'WMS');
        capUrl.searchParams.set('request', 'GetCapabilities');

        const proxyUrl = `/api/proxy?url=${encodeURIComponent(capUrl.toString())}`;
        let xmlText;
        if (_capabilitiesCache.has(proxyUrl)) {
            xmlText = _capabilitiesCache.get(proxyUrl);
        } else {
            const resp = await fetch(proxyUrl);
            xmlText = await resp.text();
            _capabilitiesCache.set(proxyUrl, xmlText);
        }
        const xmlDoc = new DOMParser().parseFromString(xmlText, "text/xml");

        const allLayers = Array.from(xmlDoc.querySelectorAll('Layer'));
        let targetLayerNode = null;
        let finalLayerName = item.layer;

        if (finalLayerName === '0' || !finalLayerName) {
            const namedLayers = allLayers.filter(l => l.querySelector('Name'));
            if (namedLayers.length > 0) {
                targetLayerNode = namedLayers[namedLayers.length - 1];
                finalLayerName = targetLayerNode.querySelector('Name').textContent;
            } else {
                throw new Error("Geen lagen gevonden in WMS.");
            }
        } else {
            targetLayerNode = allLayers.find(l => {
                const n = l.querySelector('Name');
                return n && n.textContent === finalLayerName;
            });
            if (!targetLayerNode && allLayers.length > 0) targetLayerNode = allLayers[allLayers.length - 1];
        }

        // Extract BBOX for zoom
        let bbox = null;
        if (targetLayerNode) {
            const geoBbox = targetLayerNode.querySelector('EX_GeographicBoundingBox');
            const llBbox = targetLayerNode.querySelector('LatLonBoundingBox');
            if (geoBbox) {
                bbox = [
                    parseFloat(geoBbox.querySelector('westBoundLongitude').textContent),
                    parseFloat(geoBbox.querySelector('southBoundLatitude').textContent),
                    parseFloat(geoBbox.querySelector('eastBoundLongitude').textContent),
                    parseFloat(geoBbox.querySelector('northBoundLatitude').textContent)
                ];
            } else if (llBbox) {
                bbox = [
                    parseFloat(llBbox.getAttribute('minx')),
                    parseFloat(llBbox.getAttribute('miny')),
                    parseFloat(llBbox.getAttribute('maxx')),
                    parseFloat(llBbox.getAttribute('maxy'))
                ];
            }
        }

        // Legend URL
        const baseUrl = item.url.split('?')[0];
        const rawLegendUrl = `${baseUrl}?SERVICE=WMS&REQUEST=GetLegendGraphic&VERSION=1.3.0&FORMAT=image/png&LAYER=${encodeURIComponent(finalLayerName)}`;
        const legendUrl = `/api/proxy?url=${encodeURIComponent(rawLegendUrl)}`;

        activeWmsLayers.push({
            id: Date.now(),
            title: item.name,
            url: item.url,
            layer: finalLayerName,
            publisher: item.publisher || 'NGR',
            bbox: bbox,
            legendUrl: legendUrl,
            showLegend: false
        });

        document.getElementById('search-results').innerHTML = '';
        document.getElementById('search-results').style.display = 'none';
        updateActiveLayersUI();
        renderLayers();
        if (bbox) zoomToBbox(bbox);
    } catch (err) {
        console.error(err);
        const resultsEl = document.getElementById('search-results');
        resultsEl.innerHTML = `<div style="padding:10px;color:#c0392b;font-size:13px;">❌ Kon laag niet toevoegen.<br><small style="color:#888;">${err.message}</small></div>`;
        resultsEl.style.display = 'block';
        if (resultItem) resultItem.style.opacity = '1';
    }
}

function zoomToBbox(bbox) {
    if (!bbox) return;
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const centerLon = (minLon + maxLon) / 2;
    const centerLat = (minLat + maxLat) / 2;
    const maxDiff = Math.max(maxLon - minLon, maxLat - minLat);

    let zoom = 8;
    if (maxDiff < 0.05) zoom = 14;
    else if (maxDiff < 0.1) zoom = 12;
    else if (maxDiff < 0.5) zoom = 10;
    else if (maxDiff < 2.0) zoom = 8;
    else zoom = 7;

    deckInstance.setProps({
        initialViewState: {
            ...currentViewState,
            longitude: centerLon,
            latitude: centerLat,
            zoom: zoom,
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
            div.style.cssText = 'padding:8px 10px; border-bottom:1px solid #eee; display:flex; flex-direction:column; gap:4px;';

            const pubBadge = `<span style="font-size:9px; color:#999; border:1px solid #ddd; border-radius:3px; padding:0 3px; margin-left:6px;">${l.publisher}</span>`;

            // Header row
            const header = document.createElement('div');
            header.style.cssText = 'display:flex; justify-content:space-between; align-items:center;';
            header.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <i class="fa fa-check-square" style="color:#007ac2; margin-right:5px;"></i>
                    <span style="font-size:12px;">${l.title}</span>
                    ${pubBadge}
                </div>
                <i class="fa fa-trash" style="cursor:pointer; color:#999; font-size:11px;" onclick="window.removeLayer('${l.id}')"></i>
            `;
            div.appendChild(header);

            // Controls row
            const controls = document.createElement('div');
            controls.style.cssText = 'display:flex; gap:8px; margin-top:2px;';
            let html = '';
            if (l.bbox) {
                html += `<button onclick="window.zoomToLayer(${l.id})" style="font-size:10px; border:1px solid #ddd; background:#f8f8f8; padding:2px 6px; border-radius:3px; cursor:pointer;"><i class="fa fa-crosshairs"></i> Zoom</button>`;
            }
            html += `<button onclick="window.toggleLegend(${l.id})" style="font-size:10px; border:1px solid #ddd; background:#f8f8f8; padding:2px 6px; border-radius:3px; cursor:pointer;"><i class="fa ${l.showLegend ? 'fa-chevron-up' : 'fa-list'}"></i> Legenda</button>`;
            controls.innerHTML = html;
            div.appendChild(controls);

            // Legend image
            if (l.showLegend && l.legendUrl) {
                const img = document.createElement('img');
                img.src = l.legendUrl;
                img.style.cssText = 'max-width:100%; margin-top:4px; border:1px solid #eee; border-radius:3px;';
                img.onerror = function() { this.outerHTML = '<div style="color:#999; font-size:10px;">(Legenda niet beschikbaar)</div>'; };
                div.appendChild(img);
            }

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
};

window.zoomToLayer = function(id) {
    const layer = activeWmsLayers.find(l => l.id === id);
    if (layer && layer.bbox) zoomToBbox(layer.bbox);
};

window.toggleLegend = function(id) {
    const layer = activeWmsLayers.find(l => l.id === id);
    if (layer) {
        layer.showLegend = !layer.showLegend;
        updateActiveLayersUI();
    }
};

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
    document.getElementById('agro-status').innerHTML = '<b><i class="fa fa-pen"></i> Teken Modus:</b> Klik startpunt, beweeg muis, klik eindpunt.';
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

function onMapHover(info) {
    if (drawState.active && drawState.start && info.coordinate) {
        drawState.end = info.coordinate;
        renderLayers();
    }
}

// Herstelde functie voor het maken van de selectie-rechthoek
function createSelectionPoly(p1, p2) {
    const minLon = Math.min(p1[0], p2[0]), maxLon = Math.max(p1[0], p2[0]);
    const minLat = Math.min(p1[1], p2[1]), maxLat = Math.max(p1[1], p2[1]);
    selectionPoly = {
        type: 'Feature', 
        geometry: { 
            type: 'Polygon', 
            coordinates: [[[minLon, minLat],[maxLon, minLat],[maxLon, maxLat],[minLon, maxLat],[minLon, minLat]]] 
        }
    };
}

// --- MODALS ---

function askForAgroToken() {
    setupModal('AgroDataCube Token', 'Voer je <b>WUR API Token</b> in.', 'Token...', 'password', (val) => { fetchAgroData(val); });
}

function askForNSOCreds() {
    setupModal('NSO Login', '<code>gebruiker:wachtwoord</code>', 'user:pass', 'text', (val) => {
        if (!val || !val.includes(':')) { alert("Gebruik formaat: gebruiker:pass"); return; }
        nsoCreds = val; 
        window.closeModal(); 
        renderLayers();
    });
}

function setupModal(title, desc, place, type, cb) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-desc').innerHTML = desc;
    const inp = document.getElementById('user-api-key');
    inp.placeholder = place; 
    inp.type = type; 
    inp.value = '';
    document.getElementById('modal-confirm-btn').onclick = () => { if(inp.value) cb(inp.value); };
    window.openModal();
}

// --- DATA FETCHING ---

async function fetchAgroData(token) {
    const endpoint = document.getElementById('agro-endpoint').value;
    const year = document.getElementById('agro-year').value;
    const statusDiv = document.getElementById('agro-status');
    const coords = selectionPoly.geometry.coordinates[0];
    const wkt = `POLYGON((${coords.map(p => p.join(' ')).join(',')}))`;
    
    statusDiv.innerHTML = 'Ophalen...';
    window.closeModal();
    
    try {
        const params = new URLSearchParams({ 
            year: year, 
            page_size: 1000, 
            geometry: wkt, 
            epsg: 4326, 
            output_epsg: 4326 
        });

        const queryPath = `${endpoint}?${params.toString()}`;
        const response = await fetch(`/api/agro-proxy?path=${encodeURIComponent(queryPath)}`, { 
            headers: { 'x-agro-token': token } 
        });

        if(!response.ok) {
            const errTxt = await response.text();
            throw new Error(`API Fout (${response.status}): ${errTxt.substring(0,100)}`);
        }

        const data = await response.json();
        agroData = data.features || [];
        
        const cropCounts = {};
        agroData.forEach(f => {
            const crop = f.properties.crop_name || 'Onbekend';
            cropCounts[crop] = (cropCounts[crop] || 0) + 1;
        });
        
        const topCrops = Object.entries(cropCounts)
            .sort((a,b) => b[1] - a[1])
            .slice(0, 3)
            .map(c => `${c[0]} (${c[1]})`);

        statusDiv.innerHTML = `✅ <b>${agroData.length} percelen</b> geladen.<br>
                               <small style="display:block; margin-top:5px; line-height:1.2; color:#666;">
                               Top gewassen: ${topCrops.join(', ')}
                               </small>`;
        
        renderLayers();
    } catch (e) {
        console.error("Agro Fetch Error:", e);
        statusDiv.innerHTML = `<span style="color:#c0392b;">❌ Kon data niet ophalen.<br><small style="color:#888;">${e.message}</small></span>`;
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

    // 1. Basemap
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

    // 2. NSO Satellite
    if (nsoActive && nsoCreds) {
        const layerName = document.getElementById('nso-layer-select').value;
        const authString = btoa(nsoCreds);
        const baseUrl = `https://wmts.satellietdataportaal.nl/wmts/${layerName}/service`;
        
        const wmtsParams = [
            `SERVICE=WMTS`, `REQUEST=GetTile`, `VERSION=1.0.0`,
            `LAYER=${layerName}`, `STYLE=default`,
            `TILEMATRIXSET=EPSG:3857`,
            `TILEMATRIX={z}`, `TILEROW={y}`, `TILECOL={x}`,
            `FORMAT=image/png`
        ].join('&');

        const targetUrl = `${baseUrl}?${wmtsParams}`;
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl).replace(/%7Bz%7D/g, '{z}').replace(/%7Bx%7D/g, '{x}').replace(/%7By%7D/g, '{y}')}`;

        layers.push(new deck.TileLayer({
            id: 'nso-sat-layer',
            data: proxyUrl,
            minZoom: 0, maxZoom: 19, tileSize: 256,
            getTileData: async ({url}) => {
                const response = await fetch(url, { headers: { 'x-proxy-auth': `Basic ${authString}` } });
                if (!response.ok) return null;
                return response.arrayBuffer();
            },
            renderSubLayers: props => {
                const {bbox: {west, south, east, north}} = props.tile;
                return new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] });
            }
        }));
    }

    // 3. Drawing & Selection
    if (drawState.active && drawState.start && drawState.end) {
        const poly = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[drawState.start[0], drawState.start[1]], [drawState.end[0], drawState.start[1]], [drawState.end[0], drawState.end[1]], [drawState.start[0], drawState.end[1]], [drawState.start[0], drawState.start[1]]]] } };
        layers.push(new deck.GeoJsonLayer({ 
            id: 'drawing', data: [poly], filled: true, stroked: true, 
            getFillColor: [0, 122, 194, 50], getLineColor: [0, 122, 194, 255], 
            getLineWidth: 2, getLineDashArray: [4,2], 
            extensions: [new deck.PathStyleExtension({dash:true})] 
        }));
    }
    
    if (selectionPoly && !drawState.active) {
        layers.push(new deck.GeoJsonLayer({ id: 'selection', data: [selectionPoly], filled: false, stroked: true, getLineColor: [0, 122, 194, 255], getLineWidth: 2 }));
    }

    // 4. Agro Data
    if (agroData.length > 0) {
        layers.push(new deck.GeoJsonLayer({ 
            id: 'agro-data', data: agroData, filled: true, stroked: true, 
            getFillColor: [0, 255, 100, 120], getLineColor: [255, 255, 255, 200], 
            getLineWidth: 1, pickable: true, autoHighlight: true 
        }));
    }

    // 5. Active WMS Layers
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
        onHover: onMapHover,
        onViewStateChange: ({viewState}) => { currentViewState = viewState; return viewState; },
        getTooltip: ({object}) => {
             if (!object || !object.properties) return null;
             if (object.geometry && object.geometry.type === 'Polygon' && !object.properties.fieldid) return null;
             
             if (object.properties.fieldid || object.properties.crop_name) {
                 return {
                    html: `<div style="background:white; padding:10px; border-radius:4px; font-size:12px; box-shadow: 0 4px 8px rgba(0,0,0,0.15); border-left: 4px solid #007ac2;">
                           <b style="color:#007ac2;">${object.properties.crop_name || 'Onbekend'}</b><br>
                           <b>ID:</b> ${object.properties.fieldid}<br>
                           <b>Oppervlakte:</b> ${(object.properties.area / 10000).toFixed(2)} ha
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