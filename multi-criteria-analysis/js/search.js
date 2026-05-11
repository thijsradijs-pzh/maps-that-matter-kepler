// js/search.js

function initSearch() {
    const input = document.getElementById('layer-search');
    const resultsContainer = document.getElementById('search-results');

    const performSearch = debounce(async (term) => {
        if (term.length < 2) { resultsContainer.style.display = 'none'; return; }

        resultsContainer.innerHTML = '<div style="padding:10px;color:#888;font-size:12px;"><i class="fa fa-spinner fa-spin"></i> Zoeken...</div>';
        resultsContainer.style.display = 'block';

        const [geonetworkResults, localResults] = await Promise.all([
            searchGeoNetwork(term),
            Promise.resolve(VIZ_CONFIG.catalog.filter(item =>
                item.name.toLowerCase().includes(term.toLowerCase()) ||
                item.description.toLowerCase().includes(term.toLowerCase())
            ))
        ]);

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

function activateSearch() {
    const container = document.getElementById('address-search-container');
    container.style.display = 'block';
    const input = document.getElementById('address-input');
    input.focus();
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

    const performAddressSearch = debounce(async (term) => {
        if (term.length < 3) { resultsContainer.style.display = 'none'; return; }
        try {
            const params = new URLSearchParams({
                q: term,
                fq: 'type:(adres OR woonplaats OR weg OR postcode)'
            });
            const pdokUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest?${params.toString()}`;
            const response = await fetch(`/api/proxy?url=${encodeURIComponent(pdokUrl)}`);
            if (!response.ok) throw new Error(`Proxy error (${response.status})`);
            const data = await response.json();
            displayAddressResults(data.response.docs);
        } catch (err) {
            console.error("PDOK Search error:", err);
        }
    }, 300);

    function displayAddressResults(results) {
        resultsContainer.innerHTML = '';
        if (results.length === 0) { resultsContainer.style.display = 'none'; return; }
        resultsContainer.style.display = 'block';
        results.forEach(res => {
            const div = document.createElement('div');
            div.className = 'result-item';
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
        const lookupUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${id}`;
        const response = await fetch(`/api/proxy?url=${encodeURIComponent(lookupUrl)}`);
        const data = await response.json();
        const doc = data.response.docs[0];
        const coordsStr = doc.centroide_ll.replace('POINT(', '').replace(')', '');
        const [lon, lat] = coordsStr.split(' ').map(parseFloat);
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
        const res = document.getElementById('address-results');
        res.innerHTML = '<div style="padding:8px 12px;color:#c0392b;font-size:12px;">Kon locatie niet ophalen. Probeer opnieuw.</div>';
        res.style.display = 'block';
    }
}
