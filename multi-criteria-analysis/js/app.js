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
let _activeTab = 'welcome';
const _capabilitiesCache = new Map();

// --- DEBOUNCE HELPER ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- PERMALINK ---
const _debouncedUpdatePermalink = debounce(() => updatePermalink(), 400);

function updatePermalink() {
    const p = new URLSearchParams();
    p.set('tab', _activeTab);
    p.set('lat', currentViewState.latitude.toFixed(5));
    p.set('lon', currentViewState.longitude.toFixed(5));
    p.set('zoom', currentViewState.zoom.toFixed(2));
    p.set('pitch', (currentViewState.pitch || 0).toFixed(1));
    p.set('br', (currentViewState.bearing || 0).toFixed(1));
    if (isSatellite) p.set('sat', '1');
    p.set('w', VIZ_CONFIG.filters.map(f => currentWeights[f.key] ?? f.default).join(','));
    if (activeWmsLayers.length > 0) {
        p.set('layers', JSON.stringify(activeWmsLayers.map(l => ({ u: l.url, l: l.layer, t: l.title, p: l.publisher, b: l.bbox }))));
    }
    history.replaceState(null, '', '#' + p.toString());
}

function loadFromPermalink() {
    const hash = location.hash.slice(1);
    if (!hash) return;
    try {
        const p = new URLSearchParams(hash);
        const lat = parseFloat(p.get('lat')), lon = parseFloat(p.get('lon')), zoom = parseFloat(p.get('zoom'));
        const pitch = parseFloat(p.get('pitch') || '0'), bearing = parseFloat(p.get('br') || '0');
        if (!isNaN(lat) && !isNaN(lon) && !isNaN(zoom)) {
            currentViewState = { ...currentViewState, latitude: lat, longitude: lon, zoom, pitch, bearing };
            deckInstance.setProps({ initialViewState: currentViewState });
        }
        if (p.get('sat') === '1') { isSatellite = true; document.getElementById('btn-basemap').innerText = 'Kaart'; }
        const w = p.get('w');
        if (w) {
            w.split(',').map(Number).forEach((val, i) => {
                const f = VIZ_CONFIG.filters[i];
                if (!f || isNaN(val)) return;
                currentWeights[f.key] = val;
                const el = document.getElementById(`${f.key}-slider`); if (el) el.value = val;
                const disp = document.getElementById(`${f.key}-display`); if (disp) disp.textContent = val;
            });
        }
        const lj = p.get('layers');
        if (lj) {
            JSON.parse(lj).forEach(s => {
                const base = s.u.split('?')[0];
                const rawLegend = `${base}?SERVICE=WMS&REQUEST=GetLegendGraphic&VERSION=1.3.0&FORMAT=image/png&LAYER=${encodeURIComponent(s.l)}`;
                activeWmsLayers.push({ id: Date.now() + Math.random(), url: s.u, layer: s.l, title: s.t, publisher: s.p, bbox: s.b, legendUrl: `/api/proxy?url=${encodeURIComponent(rawLegend)}`, showLegend: false });
            });
            updateActiveLayersUI();
        }
        renderLayers();
        const tab = p.get('tab');
        if (tab) switchTab(tab);
    } catch(e) { /* corrupt hash, ignore */ }
}

// --- HEATMAP LEGEND ---
function updateHeatmapLegend() {
    if (!showHeatmap || !showMainLayer || allData.length === 0) return;
    const scores = allData.map(d => {
        let s = 0;
        VIZ_CONFIG.criteria.forEach(c => { s += (Number(d[c.key]) || 0) * (currentWeights[c.weightKey] || 0); });
        return s;
    }).filter(s => s > 0);
    if (scores.length === 0) return;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const labels = document.querySelectorAll('#heatmap-legend .legend-labels span');
    if (labels[0]) labels[0].textContent = min.toFixed(1);
    if (labels[1]) labels[1].textContent = max.toFixed(1);
}

// --- MAIN RENDER ---
function renderLayers() {
    const layers = [];
    document.getElementById('heatmap-legend').style.display = showHeatmap && showMainLayer ? 'flex' : 'none';
    if (showHeatmap && showMainLayer) updateHeatmapLegend();

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

    activeWmsLayers.forEach(l => layers.push(createWMSLayer({
        ...l,
        onError: () => {
            if (l.hasError) return;
            l.hasError = true;
            updateActiveLayersUI();
        }
    })));

    if (showMainLayer && allData.length > 0) {
        const allH3 = allData.map(d => d.h3);
        layers.push(new deck.GeoJsonLayer(VIZ_CONFIG.createBoundaryLayer(allH3)));
        if (showHeatmap) {
            layers.push(new deck.HeatmapLayer(VIZ_CONFIG.createHeatmapLayer(allData, currentWeights)));
        } else {
            VIZ_CONFIG.createLayer(allData, currentWeights).forEach(conf => layers.push(new deck.H3HexagonLayer(conf)));
        }
    }

    if (isMeasuring && measurePoints.length > 0) {
        layers.push(new deck.ScatterplotLayer({ id: 'measure-p', data: measurePoints.map(p=>({p})), getPosition: d=>d.p, getFillColor:[0,122,194], getRadius:5, radiusUnits:'pixels' }));
        if (measurePoints.length > 1) {
            const lineData = [];
            for (let i=0; i<measurePoints.length-1; i++) {
                const p1=measurePoints[i], p2=measurePoints[i+1];
                const dist = calculateDistance(p1[1], p1[0], p2[1], p2[0]);
                const mid = [(p1[0]+p2[0])/2, (p1[1]+p2[1])/2];
                lineData.push({s:p1, t:p2, l: dist>=1000?(dist/1000).toFixed(2)+" km":Math.round(dist)+" m", mid});
            }
            layers.push(new deck.LineLayer({ id: 'measure-l', data: lineData, getSourcePosition:d=>d.s, getTargetPosition:d=>d.t, getColor:[0,122,194], getWidth:3 }));
            layers.push(new deck.TextLayer({ id: 'measure-t', data: lineData, getPosition:d=>d.mid, getText:d=>d.l, getSize:14, getColor:[0,0,0], getBackgroundColor:[255,255,255], background:true }));
        }
    }

    deckInstance.setProps({ layers });
}

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
                const val = parseInt(e.target.value);
                currentWeights[f.key] = val;
                document.getElementById(`${f.key}-display`).textContent = val;
                renderLayers();
                updatePermalink();
            });
            const legendItem = document.createElement('div');
            legendItem.style.display = 'flex'; legendItem.style.alignItems = 'center'; legendItem.style.marginBottom = '8px';
            legendItem.innerHTML = `<div style="width:16px; height:16px; background:rgb(${crit.color.join(',')}); border-radius:3px; margin-right:10px;"></div><div style="font-size:13px; color:#444;">${crit.label}</div>`;
            legendContainer.appendChild(legendItem);
        });

        document.getElementById('heatmap-toggle').addEventListener('change', (e) => { showHeatmap = e.target.checked; renderLayers(); });

        deckInstance = new deck.DeckGL({
            container: 'container',
            initialViewState: VIZ_CONFIG.initialView,
            controller: { doubleClickZoom: false },
            getTooltip: (info) => isMeasuring ? null : VIZ_CONFIG.tooltip(info),
            onViewStateChange: ({viewState}) => { currentViewState = viewState; updateScaleBar(viewState); document.getElementById('btn-2d3d').innerText = viewState.pitch > 10 ? "2D" : "3D"; _debouncedUpdatePermalink(); return viewState; },
            onHover: updateCoords,
            onClick: onMapClick,
            onLoad: () => updateScaleBar(VIZ_CONFIG.initialView)
        });

        renderLayers();
        updateScaleBar(VIZ_CONFIG.initialView);
        loadFromPermalink();
    } catch (e) {
        console.error(e);
        document.getElementById('loading').innerHTML = '<div style="font-size:18px;margin-bottom:8px;">⚠️ Data kon niet worden geladen</div><div style="font-size:13px;color:#888;line-height:1.5;font-weight:normal;">Ververs de pagina om opnieuw te proberen.</div>';
    }
}

init();
