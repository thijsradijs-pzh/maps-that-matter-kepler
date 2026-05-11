// js/wms.js

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

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
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

        const baseUrl = item.url.split('?')[0];
        const rawLegendUrl = `${baseUrl}?SERVICE=WMS&REQUEST=GetLegendGraphic&VERSION=1.3.0&FORMAT=image/png&LAYER=${encodeURIComponent(finalLayerName)}`;
        const legendUrl = `/api/proxy?url=${encodeURIComponent(rawLegendUrl)}`;

        activeWmsLayers.push({
            id: Date.now(),
            url: item.url,
            layer: finalLayerName,
            title: item.name,
            publisher: item.publisher || 'NGR',
            bbox,
            legendUrl,
            showLegend: false
        });

        document.getElementById('search-results').style.display = 'none';
        document.getElementById('layer-search').value = '';
        updateActiveLayersUI();
        renderLayers();
        updatePermalink();
        if (bbox) zoomToBbox(bbox);

    } catch (err) {
        const errEl = document.getElementById('add-layer-error');
        if (errEl) { errEl.textContent = `Kon laag niet toevoegen: ${err.message}`; errEl.style.display = 'block'; setTimeout(() => { errEl.style.display = 'none'; }, 5000); }
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
            zoom,
            transitionDuration: 1000,
            transitionInterpolator: new deck.FlyToInterpolator()
        }
    });
}

function removeWmsLayer(id) {
    activeWmsLayers = activeWmsLayers.filter(l => l.id !== id);
    updateActiveLayersUI();
    renderLayers();
    updatePermalink();
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
            div.id = `wms-item-${l.id}`;
            div.className = 'active-wms-item';
            div.style.flexDirection = 'column';
            div.style.alignItems = 'flex-start';
            if (l.hasError) div.style.borderColor = '#e74c3c';

            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.width = '100%';
            header.style.alignItems = 'center';

            const pubBadge = `<span style="font-size:9px; color:#999; border:1px solid #ddd; border-radius:3px; padding:0 3px; margin-left:6px;">${l.publisher}</span>`;
            const errBadge = l.hasError ? `<span style="font-size:9px; color:#e74c3c; margin-left:6px;" title="Laad fout">⚠ fout</span>` : '';

            header.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <i class="fa fa-check-square" style="color:#007ac2; margin-right:5px;"></i>
                    <span>${l.title}</span>
                    ${pubBadge}${errBadge}
                </div>
                <i class="fa fa-trash" style="cursor:pointer; color:#999;" onclick="removeWmsLayer(${l.id})"></i>
            `;
            div.appendChild(header);

            const controls = document.createElement('div');
            controls.className = 'layer-controls';
            let html = l.bbox
                ? `<button class="layer-btn" onclick="zoomToWmsLayer(${l.id})"><i class="fa fa-crosshairs"></i> Zoom</button>`
                : `<span style="color:#ccc; font-size:11px;"><i class="fa fa-ban"></i> Geen zoom</span>`;
            html += `<button class="layer-btn" onclick="toggleLegend(${l.id})">
                        <i class="fa ${l.showLegend ? 'fa-chevron-up' : 'fa-list'}"></i> Legenda
                     </button>`;
            controls.innerHTML = html;
            div.appendChild(controls);

            if (l.showLegend) {
                const img = document.createElement('img');
                img.src = l.legendUrl;
                img.className = 'layer-legend-img';
                img.onerror = function() {
                    this.style.display = 'none';
                    const err = document.createElement('div');
                    err.style.color = 'red'; err.style.fontSize = '10px'; err.innerText = '(Legenda niet beschikbaar)';
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
