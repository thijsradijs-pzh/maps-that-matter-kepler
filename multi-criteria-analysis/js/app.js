// js/app.js

// --- GLOBAL STATE ---
let deckInstance;
let allData = [];
const currentWeights = {};
let showHeatmap = false;
let showMainLayer = true;
let currentViewState = VIZ_CONFIG.initialView;
let isSatellite = false;
let isMeasuring = false;
let measurePoints = [];
let activeWmsLayers = [];

// --- DEBOUNCE HELPER ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- SEARCH UI LOGIC ---
function initSearch() {
    const input = document.getElementById('layer-search');
    const resultsContainer = document.getElementById('search-results');
    
    const performSearch = debounce(async (term) => {
        if (term.length < 2) { resultsContainer.style.display = 'none'; return; }

        resultsContainer.innerHTML = '<div style="padding:10px;color:#888;font-size:12px;"><i class="fa fa-spinner fa-spin"></i> Zoeken...</div>';
        resultsContainer.style.display = 'block';

        // Run Search
        const [geonetworkResults, localResults] = await Promise.all([
            searchGeoNetwork(term),
            Promise.resolve(VIZ_CONFIG.catalog.filter(item => 
                item.name.toLowerCase().includes(term.toLowerCase()) || 
                item.description.toLowerCase().includes(term.toLowerCase())
            ))
        ]);

        // Combine
        const combinedMap = new Map();
        localResults.forEach(item => combinedMap.set(item.name, {...item, hasWms: true, source: 'local', publisher: 'Lokaal'}));
        geonetworkResults.forEach(item => { if (item.hasWms) combinedMap.set(item.name, {...item, source: 'geonetwork'}); });
        
        displayResults(Array.from(combinedMap.values()));
    }, 800);

    function displayResults(results) {
        resultsContainer.innerHTML = '';
        if (results.length === 0) { resultsContainer.innerHTML = '<div style="padding:10px;color:#888;font-size:12px;">Geen resultaten gevonden</div>'; return; }
        
        const geoItems = results.filter(r => r.source === 'geonetwork');
        const localItems = results.filter(r => r.source === 'local');

        if (geoItems.length > 0) appendSection('Nationaal Geo Register', geoItems, '#f0f8ff', '#007ac2');
        if (localItems.length > 0) appendSection('Lokale catalogus', localItems, '#f9f9f9', '#666');
    }

    function appendSection(title, items, bg, color) {
        const header = document.createElement('div');
        header.style.cssText = `padding:5px 15px;background:${bg};font-size:11px;font-weight:bold;color:${color};`;
        header.textContent = `${title} (${items.length})`;
        resultsContainer.appendChild(header);
        items.forEach(item => resultsContainer.appendChild(createResultItem(item)));
    }

    function createResultItem(item) {
        const div = document.createElement('div');
        div.className = 'result-item';
        const iconClass = item.source === 'geonetwork' ? 'fa-globe' : 'fa-layer-group';
        const iconColor = item.source === 'geonetwork' ? '#E3001B' : '#007ac2';
        
        // Bepaal de badge tekst (Publisher) en kleur
        const pubText = item.publisher || "NGR";
        const pubColor = item.source === 'geonetwork' ? '#E3001B' : '#666';
        
        div.innerHTML = `
            <div style="flex:1;">
               <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <span><i class="fa ${iconClass}" style="color:${iconColor}; margin-right:8px;"></i> <b>${item.name}</b></span>
                    <span style="background:${pubColor}; color:white; font-size:9px; padding:1px 4px; border-radius:3px; white-space:nowrap; margin-left:5px;">${pubText}</span>
               </div>
               <span style="color:#888; font-size:11px;">${item.description}</span>
            </div>
            <i class="fa fa-plus-circle" style="color:#ccc; margin-left:8px;"></i>
        `;
        div.onclick = () => addWmsLayer(item);
        return div;
    }

    input.addEventListener('input', (e) => performSearch(e.target.value));
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !resultsContainer.contains(e.target)) resultsContainer.style.display = 'none';
    });
}

// --- LAYER MANAGEMENT & ZOOM ---
async function addWmsLayer(item) {
    if (activeWmsLayers.find(l => l.title === item.name)) return;
    
    const resultItem = Array.from(document.querySelectorAll('.result-item')).find(el => el.innerText.includes(item.name));
    if(resultItem) resultItem.style.opacity = '0.5';

    try {
        console.log(`[MCA] Fetching capabilities for: ${item.name}...`);
        
        // Always fetch capabilities to get BBOX and check layer name
        const capUrl = new URL(item.url);
        capUrl.searchParams.set('service', 'WMS');
        capUrl.searchParams.set('request', 'GetCapabilities');
        
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(capUrl.toString())}`;
        const resp = await fetch(proxyUrl);
        const xmlText = await resp.text();
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        // Find all Layer nodes
        const allLayers = Array.from(xmlDoc.querySelectorAll('Layer'));
        
        let targetLayerNode = null;
        let finalLayerName = item.layer;

        if (finalLayerName === '0' || !finalLayerName) {
            // Strategy: Pick the last layer with a Name (usually the most specific one)
            const namedLayers = allLayers.filter(l => l.querySelector('Name'));
            if (namedLayers.length > 0) {
                targetLayerNode = namedLayers[namedLayers.length - 1];
                finalLayerName = targetLayerNode.querySelector('Name').textContent;
            } else {
                throw new Error("Geen lagen gevonden in WMS.");
            }
        } else {
            // Find the specific layer node by name
            targetLayerNode = allLayers.find(l => {
                const n = l.querySelector('Name');
                return n && n.textContent === finalLayerName;
            });
            if (!targetLayerNode && allLayers.length > 0) targetLayerNode = allLayers[allLayers.length - 1];
        }

        console.log(`[MCA] Selected Layer: ${finalLayerName}`);

        // Extract BBOX for Zoom
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
        let baseUrl = item.url.split('?')[0];
        const rawLegendUrl = `${baseUrl}?SERVICE=WMS&REQUEST=GetLegendGraphic&VERSION=1.3.0&FORMAT=image/png&LAYER=${encodeURIComponent(finalLayerName)}`;
        const legendUrl = `/api/proxy?url=${encodeURIComponent(rawLegendUrl)}`;

        activeWmsLayers.push({ 
            id: Date.now(), 
            url: item.url, 
            layer: finalLayerName, 
            title: item.name,
            publisher: item.publisher || 'NGR', // Store publisher
            bbox: bbox,
            legendUrl: legendUrl,
            showLegend: false 
        });
        
        document.getElementById('search-results').style.display = 'none';
        document.getElementById('layer-search').value = '';
        updateActiveLayersUI();
        renderLayers();
        
        if(bbox) zoomToBbox(bbox);

    } catch (err) {
        console.error(err);
        alert(`Kon laag niet toevoegen: ${err.message}`);
        if(resultItem) resultItem.style.opacity = '1';
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

function removeWmsLayer(id) {
    activeWmsLayers = activeWmsLayers.filter(l => l.id !== id);
    updateActiveLayersUI();
    renderLayers();
}

function toggleLegend(id) {
    const layer = activeWmsLayers.find(l => l.id === id);
    if (layer) {
        layer.showLegend = !layer.showLegend;
        updateActiveLayersUI();
    }
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
            div.style.flexDirection = 'column';
            div.style.alignItems = 'flex-start';
            
            // Header
            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.width = '100%';
            header.style.alignItems = 'center';

            // Gebruik de publisher in de UI (bijv. [RWS])
            const pubBadge = `<span style="font-size:9px; color:#999; border:1px solid #ddd; border-radius:3px; padding:0 3px; margin-left:6px;">${l.publisher}</span>`;

            header.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <i class="fa fa-check-square" style="color:#007ac2; margin-right:5px;"></i> 
                    <span>${l.title}</span>
                    ${pubBadge}
                </div>
                <i class="fa fa-trash" style="cursor:pointer; color:#999;" onclick="removeWmsLayer(${l.id})"></i>
            `;
            div.appendChild(header);

            // Controls
            const controls = document.createElement('div');
            controls.className = 'layer-controls';
            
            let html = ``;
            if (l.bbox) {
                html += `<button class="layer-btn" onclick="zoomToWmsLayer(${l.id})"><i class="fa fa-crosshairs"></i> Zoom</button>`;
            } else {
                 html += `<span style="color:#ccc; font-size:11px;"><i class="fa fa-ban"></i> Geen zoom</span>`;
            }

            html += `<button class="layer-btn" onclick="toggleLegend(${l.id})">
                        <i class="fa ${l.showLegend ? 'fa-chevron-up' : 'fa-list'}"></i> Legenda
                     </button>`;
            
            controls.innerHTML = html;
            div.appendChild(controls);

            // Legend Image
            if (l.showLegend) {
                const img = document.createElement('img');
                img.src = l.legendUrl;
                img.className = 'layer-legend-img';
                img.onerror = function() { 
                    this.style.display = 'none'; 
                    const err = document.createElement('div');
                    err.style.color = 'red'; err.style.fontSize='10px'; err.innerText = '(Legenda niet beschikbaar)';
                    div.appendChild(err);
                }; 
                div.appendChild(img);
            }

            list.appendChild(div);
        });
    } else { 
        container.style.display = 'none'; 
    }
}

window.zoomToWmsLayer = function(id) {
    const layer = activeWmsLayers.find(l => l.id === id);
    if (layer && layer.bbox) zoomToBbox(layer.bbox);
};

// --- MAIN RENDER ---
function renderLayers() {
    const layers = [];
    document.getElementById('heatmap-legend').style.display = showHeatmap && showMainLayer ? 'flex' : 'none';

    // 1. Basemap
    if (isSatellite) {
        layers.push(new deck.TileLayer({
            id: 'satellite-basemap',
            data: 'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg',
            minZoom: 6, maxZoom: 19, tileSize: 256, zIndex: 0,
            renderSubLayers: props => {
                const {bbox: {west, south, east, north}} = props.tile;
                return new deck.BitmapLayer(props, { data: null, image: props.data, bounds: [west, south, east, north] });
            }
        }));
    } else {
        layers.push(DeckGLUtils.createBasemap(VIZ_CONFIG.basemap));
    }

    // 2. Active WMS Layers
    activeWmsLayers.forEach(l => layers.push(createWMSLayer(l)));

    // 3. Data Layers
    if (showMainLayer && allData.length > 0) {
        const allH3 = allData.map(d => d.h3);
        layers.push(new deck.GeoJsonLayer(VIZ_CONFIG.createBoundaryLayer(allH3)));
        if (showHeatmap) {
            layers.push(new deck.HeatmapLayer(VIZ_CONFIG.createHeatmapLayer(allData, currentWeights)));
        } else {
            const stackConfigs = VIZ_CONFIG.createLayer(allData, currentWeights);
            stackConfigs.forEach(conf => layers.push(new deck.H3HexagonLayer(conf)));
        }
    }

    // 4. Measuring
    if (isMeasuring && measurePoints.length > 0) {
        layers.push(new deck.ScatterplotLayer({ id: 'measure-p', data: measurePoints.map(p=>({p})), getPosition: d=>d.p, getFillColor:[0,122,194], getRadius:5, radiusUnits:'pixels' }));
        if (measurePoints.length > 1) {
             const lineData = [];
             for(let i=0; i<measurePoints.length-1; i++){
                 const p1=measurePoints[i], p2=measurePoints[i+1];
                 const dist = calculateDistance(p1[1], p1[0], p2[1], p2[0]);
                 const mid = [(p1[0]+p2[0])/2, (p1[1]+p2[1])/2];
                 lineData.push({s:p1, t:p2, l: dist>=1000?(dist/1000).toFixed(2)+" km":Math.round(dist)+" m", mid});
             }
             layers.push(new deck.LineLayer({ id: 'measure-l', data: lineData, getSourcePosition:d=>d.s, getTargetPosition:d=>d.t, getColor:[0,122,194], getWidth:3 }));
             layers.push(new deck.TextLayer({ id: 'measure-t', data: lineData, getPosition:d=>d.mid, getText:d=>d.l, getSize:14, getColor:[0,0,0], getBackgroundColor:[255,255,255], background:true }));
        }
    }
    deckInstance.setProps({ layers: layers });
}

// --- UI INTERACTIONS ---
function toggleMainLayer(e) {
    e.preventDefault(); e.stopPropagation();
    showMainLayer = !showMainLayer;
    const icon = document.getElementById('ghn-checkbox');
    if (showMainLayer) { icon.className = 'fa fa-check-square checkbox-icon'; icon.style.color = 'var(--esri-blue)'; } 
    else { icon.className = 'fa fa-square checkbox-icon unchecked'; icon.style.color = '#ccc'; }
    renderLayers();
}

function activateSearch() { switchTab('layers'); setTimeout(() => { document.getElementById('layer-search').focus(); }, 100); }
// --- ADDRESS SEARCH LOGIC ---

// Update the existing activateSearch function
function activateSearch() {
    // Hide the sidebar layer search behavior if you want to focus on map search
    const container = document.getElementById('address-search-container');
    container.style.display = 'block';
    const input = document.getElementById('address-input');
    input.focus();
    
    // Initialize the listener once
    if (!input.dataset.initialized) {
        initAddressSearch();
        input.dataset.initialized = "true";
    }
}

function closeAddressSearch() {
    document.getElementById('address-search-container').style.display = 'none';
    document.getElementById('address-results').style.display = 'none';
    document.getElementById('address-input').value = '';
}

function initAddressSearch() {
    const input = document.getElementById('address-input');
    const resultsContainer = document.getElementById('address-results');

// Inside multi-criteria-analysis/js/app.js

    const performAddressSearch = debounce(async (term) => {
        if (term.length < 3) {
            resultsContainer.style.display = 'none';
            return;
        }

        try {
            // Use URLSearchParams to ensure the filter and query are perfectly encoded
            const params = new URLSearchParams({
                q: term,
                fq: 'type:(adres OR woonplaats OR weg OR postcode)'
            });
            
            const pdokUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?${params.toString()}`;
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(pdokUrl)}`;
            
            const response = await fetch(proxyUrl);
            
            // CHECK if the response is OK before parsing JSON
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Proxy error (${response.status}): ${errorText}`);
            }
            
            const data = await response.json();
            displayAddressResults(data.response.docs);
        } catch (err) {
            console.error("PDOK Search error:", err);
            // Optionally show a small error message in the UI instead of just logging
        }
    }, 300);
    function displayAddressResults(results) {
        resultsContainer.innerHTML = '';
        if (results.length === 0) {
            resultsContainer.style.display = 'none';
            return;
        }

        resultsContainer.style.display = 'block';
        results.forEach(res => {
            const div = document.createElement('div');
            div.className = 'result-item'; // Re-use your existing CSS class
            div.style.padding = '8px 12px';
            div.innerHTML = `<i class="fa fa-location-dot" style="color:#007ac2; margin-right:8px;"></i> ${res.weergavenaam}`;
            div.onclick = () => selectAddress(res.id);
            resultsContainer.appendChild(div);
        });
    }

    input.addEventListener('input', (e) => performAddressSearch(e.target.value));
}

async function selectAddress(id) {
    try {
        // Construct the PDOK Lookup URL
        const lookupUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${id}`;
        
        // ROUTE THROUGH PROXY
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(lookupUrl)}`;
        const response = await fetch(proxyUrl);
        
        const data = await response.json();
        const doc = data.response.docs[0];

        // PDOK returns centroide_ll as "POINT(lon lat)"
        const coordsStr = doc.centroide_ll.replace('POINT(', '').replace(')', '');
        const [lon, lat] = coordsStr.split(' ').map(parseFloat);

        // Zoom map to location using your deckInstance
        deckInstance.setProps({
            initialViewState: {
                ...currentViewState,
                longitude: lon,
                latitude: lat,
                zoom: 16, 
                transitionDuration: 1500,
                transitionInterpolator: new deck.FlyToInterpolator()
            }
        });

        closeAddressSearch();
    } catch (err) {
        console.error("PDOK Lookup error:", err);
        alert("Kon locatie niet ophalen.");
    }
}
function showDataInfo() { alert("GEGEVENS & BRONNEN\n------------------\nDataset: Groene Hart Noord (MCA)\nRecords: " + allData.length + " hexagonen\n\nBRONNEN:\n- Provincie Zuid-Holland (PPLG)\n- PDOK / Nationaal Geo Register\n- Basisregistratie Ondergrond (BRO)"); }
function printMap() { window.print(); }

function switchTab(t) {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.sidebar-content').forEach(x => x.classList.remove('active'));
    const map = { 'welcome': { idx: 0, id: 'welcome-content' }, 'layers': { idx: 1, id: 'layer-content' }, 'layer': { idx: 1, id: 'layer-content' }, 'legend': { idx: 2, id: 'legend-content' } };
    const target = map[t];
    if (target) { document.querySelectorAll('.tab')[target.idx].classList.add('active'); document.getElementById(target.id).classList.add('active'); }
}

function showCredits() { alert("Gemaakt voor Provincie Zuid-Holland."); }
function zoomIn() { if(deckInstance) deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom + 1, transitionDuration: 300, transitionInterpolator: new deck.FlyToInterpolator() } }); }
function zoomOut() { if(deckInstance) deckInstance.setProps({ initialViewState: { ...currentViewState, zoom: currentViewState.zoom - 1, transitionDuration: 300, transitionInterpolator: new deck.FlyToInterpolator() } }); }
function resetView() { deckInstance.setProps({ initialViewState: { ...VIZ_CONFIG.initialView, transitionDuration: 800, transitionInterpolator: new deck.FlyToInterpolator() } }); }
function toggle3D() { 
    const newPitch = currentViewState.pitch > 10 ? 0 : 45;
    deckInstance.setProps({ initialViewState: { ...currentViewState, pitch: newPitch, transitionDuration: 800, transitionInterpolator: new deck.FlyToInterpolator() } });
    document.getElementById('btn-2d3d').innerText = newPitch === 0 ? "3D" : "2D";
}
function resetBearing() { deckInstance.setProps({ initialViewState: { ...currentViewState, bearing: 0, transitionDuration: 800, transitionInterpolator: new deck.FlyToInterpolator() } }); }
function toggleBasemap() { isSatellite = !isSatellite; renderLayers(); document.getElementById('btn-basemap').innerText = isSatellite ? "Kaart" : "Foto"; }
function toggleMeasure() {
  isMeasuring = !isMeasuring; measurePoints = [];
  const btn = document.getElementById('btn-measure');
  const container = document.getElementById('container');
  if (isMeasuring) { btn.classList.add('active'); container.classList.add('measuring-cursor'); } 
  else { btn.classList.remove('active'); container.classList.remove('measuring-cursor'); }
  renderLayers();
}
function onMapClick(info) { if (isMeasuring && info.coordinate) { measurePoints = [...measurePoints, info.coordinate]; renderLayers(); return true; } }
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; const φ1 = lat1 * Math.PI/180; const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1)*Math.PI/180; const Δλ = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(Δφ/2)*Math.sin(Δφ/2) + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)*Math.sin(Δλ/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function updateScaleBar(vs) {
    if(!vs)return; const {zoom, latitude} = vs;
    const metersPerPixel = (40075016 * Math.cos(latitude * Math.PI/180)) / Math.pow(2, zoom + 8);
    const targetW = 120; const targetM = metersPerPixel * targetW;
    let rounded = targetM >= 1000 ? Math.round(targetM/1000)*1000 : Math.round(targetM/100)*100; if(rounded===0) rounded=100;
    document.getElementById('scale-bar').style.width = `${rounded/metersPerPixel}px`;
    document.getElementById('scale-text').innerText = rounded >= 1000 ? (rounded/1000)+" km" : rounded+" m";
}
function updateCoords(info) { if (info.coordinate) document.getElementById('coords-widget').innerText = `${info.coordinate[1].toFixed(5)} | ${info.coordinate[0].toFixed(5)}`; }

// --- INITIALIZATION ---
async function init() {
  try {
    allData = await DeckGLUtils.loadCSV(VIZ_CONFIG.dataUrl);
    document.getElementById('loading').style.display = 'none';
    
    initSearch();

    const sliderContainer = document.getElementById('mca-sliders-container');
    const legendContainer = document.getElementById('static-legend-items');
    VIZ_CONFIG.filters.forEach(f => {
      currentWeights[f.key] = f.default;
      const crit = VIZ_CONFIG.criteria.find(c => c.weightKey === f.key);
      const wrapper = document.createElement('div');
      wrapper.className = 'mca-control';
      wrapper.innerHTML = `<div class="mca-label"><span style="display:flex; align-items:center;"><i class="fa fa-circle" style="color:rgb(${crit.color.join(',')}); font-size:10px; margin-right:6px;"></i>${crit.label}</span><span id="${f.key}-display" style="font-weight:bold;">${f.default}</span></div><input type="range" id="${f.key}-slider" min="${f.min}" max="${f.max}" step="${f.step}" value="${f.default}">`;
      sliderContainer.appendChild(wrapper);
      wrapper.querySelector('input').addEventListener('input', (e) => {
        const val = parseInt(e.target.value); currentWeights[f.key] = val; document.getElementById(`${f.key}-display`).textContent = val; renderLayers();
      });
      const legendItem = document.createElement('div');
      legendItem.style.display='flex'; legendItem.style.alignItems='center'; legendItem.style.marginBottom='8px';
      legendItem.innerHTML=`<div style="width:16px; height:16px; background:rgb(${crit.color.join(',')}); border-radius:3px; margin-right:10px;"></div><div style="font-size:13px; color:#444;">${crit.label}</div>`;
      legendContainer.appendChild(legendItem);
    });

    document.getElementById('heatmap-toggle').addEventListener('change', (e) => { showHeatmap = e.target.checked; renderLayers(); });

    deckInstance = new deck.DeckGL({
      container: 'container',
      initialViewState: VIZ_CONFIG.initialView,
      controller: { doubleClickZoom: false },
      getTooltip: (info) => isMeasuring ? null : VIZ_CONFIG.tooltip(info),
      onViewStateChange: ({viewState}) => { currentViewState = viewState; updateScaleBar(viewState); document.getElementById('btn-2d3d').innerText = viewState.pitch > 10 ? "2D" : "3D"; return viewState; },
      onHover: updateCoords,
      onClick: onMapClick,
      onLoad: () => updateScaleBar(VIZ_CONFIG.initialView)
    });

    renderLayers();
    updateScaleBar(VIZ_CONFIG.initialView);
  } catch (e) { console.error(e); document.getElementById('loading').textContent = "Kan data niet laden."; }
}

init();