// js/search.js

const KEA_WMS = 'https://cas.cloud.sogelink.com/public/data/org/gws/YWFMLMWERURF/kea_public/wms';

const KEA_FEATURED = [
    {
        theme: '🌡 Hitte', color: '#c62828',
        layers: [
            { name: 'Hitte-eiland effect', description: 'Gebieden waar de temperatuur aanzienlijk hoger is dan de omgeving', layer: 'hitteeiland' },
            { name: 'Afstand tot koelte', description: 'Loopafstand naar de dichtstbijzijnde koele plek (park, water, schaduw)', layer: 'Afstand_tot_koelte' },
            { name: 'Warme nachten (huidig)', description: 'Aantal tropische nachten per jaar (T ≥ 20°C)', layer: 'warme_nachten_huidig' },
        ]
    },
    {
        theme: '🌧 Wateroverlast', color: '#1565c0',
        layers: [
            { name: 'Waterdiepte bij 70mm/2u', description: 'Wateraccumulatie bij extreme neerslag (terugkeertijd ~10 jaar)', layer: 'waterdiepte_neerslag_70mm_2uur' },
            { name: 'Kans op grondwateroverlast', description: 'Gebieden met verhoogde kans dat grondwater tot aan maaiveld stijgt', layer: 'kans_grondwateroverlast_wateroverlast' },
        ]
    },
    {
        theme: '☀️ Droogte', color: '#e65100',
        layers: [
            { name: 'Droogtestress (huidig)', description: 'Mate van droogtestress voor landbouw en natuur', layer: 'droogtestress_huidig' },
            { name: 'Droogtegevoeligheid natuur', description: 'Gevoeligheid van grondwaterafhankelijke natuur voor droogteperiodes', layer: 'Droogtegevoeligheid' },
        ]
    },
    {
        theme: '🌊 Overstroming', color: '#0277bd',
        layers: [
            { name: 'Overstromingskans huidig (>20cm)', description: 'Kans per jaar op overstroming met meer dan 20 cm water', layer: 'plaatsgebonden_overstromingskans_huidig_20_cm_20251120' },
            { name: 'Max. overstromingsdiepte (kleine kans)', description: 'Maximale waterdiepte bij overstroming met kleine kans', layer: 'maximale_waterdiepte_nederland_kleine_kans_20251219' },
        ]
    },
    {
        theme: '🏗️ Bodemdaling', color: '#6d4c41',
        layers: [
            { name: 'Bodemdaling 2020–2050', description: 'Verwachte bodemdaling in centimeters tot 2050', layer: 'bodemdaling_2020_2050' },
            { name: 'Risico paalrot (huidig)', description: 'Gebieden met verhoogd risico op paalrot door toenemende droogte', layer: 'risicopaalrot_huidig' },
        ]
    },
];

let keaLayerCache = null;
let keaFetchPromise = null;

async function fetchKeaLayers() {
    if (keaLayerCache) return keaLayerCache;
    if (keaFetchPromise) return keaFetchPromise;

    const capsUrl = `${KEA_WMS}?service=WMS&request=GetCapabilities`;
    keaFetchPromise = fetch(`/api/proxy?url=${encodeURIComponent(capsUrl)}`)
        .then(r => r.text())
        .then(xml => {
            const names = [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map(m => m[1].trim());
            const titles = [...xml.matchAll(/<Title>([^<]+)<\/Title>/g)].map(m => m[1].trim());
            const layers = [];
            for (let i = 0; i < names.length; i++) {
                const name = names[i];
                if (!name || name === 'kea_public') continue;
                layers.push({ layer: name, name: titles[i] || name, description: '' });
            }
            keaLayerCache = layers;
            return layers;
        })
        .catch(() => {
            keaFetchPromise = null;
            return [];
        });
    return keaFetchPromise;
}

function makeResultItem(item) {
    const div = document.createElement('div');
    div.className = 'result-item';
    const isKea = item.source === 'kea';
    const iconClass = isKea ? 'fa-cloud-sun-rain' : item.source === 'geonetwork' ? 'fa-globe' : 'fa-layer-group';
    const iconColor = isKea ? '#e65100' : item.source === 'geonetwork' ? '#E3001B' : '#007ac2';
    const pubColor = isKea ? '#e65100' : item.source === 'geonetwork' ? '#E3001B' : '#666';
    const pubText = item.publisher || 'NGR';
    div.innerHTML = `
        <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <span style="flex:1;min-width:0;"><i class="fa ${iconClass}" style="color:${iconColor};margin-right:6px;flex-shrink:0;"></i><b style="word-break:break-word;">${item.name}</b></span>
                <span style="background:${pubColor};color:white;font-size:9px;padding:1px 5px;border-radius:3px;white-space:nowrap;margin-left:6px;flex-shrink:0;">${pubText}</span>
            </div>
            ${item.description ? `<span style="color:#888;font-size:11px;display:block;margin-top:2px;">${item.description}</span>` : ''}
        </div>
        <i class="fa fa-plus-circle" style="color:#ccc;margin-left:8px;flex-shrink:0;"></i>`;
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.onclick = () => addWmsLayer(item);
    div.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addWmsLayer(item); } };
    return div;
}

function renderKeaResults(layers, term) {
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';
    resultsContainer.style.display = 'block';

    if (term) {
        const q = term.toLowerCase();
        const matches = layers.filter(l =>
            l.name.toLowerCase().includes(q) || l.layer.toLowerCase().includes(q)
        );
        if (matches.length === 0) {
            resultsContainer.innerHTML = '<div style="padding:10px 15px;color:#888;font-size:12px;">Geen lagen gevonden</div>';
            return;
        }
        const header = document.createElement('div');
        header.className = 'kea-section-label';
        header.textContent = `Klimaateffectatlas (${matches.length} resultaten)`;
        resultsContainer.appendChild(header);
        matches.slice(0, 50).forEach(l => resultsContainer.appendChild(makeResultItem({
            name: l.name, description: l.description,
            url: KEA_WMS, layer: l.layer,
            hasWms: true, source: 'kea', publisher: 'KEA'
        })));
        return;
    }

    // No search term — show featured layers grouped by theme
    const featuredHeader = document.createElement('div');
    featuredHeader.className = 'kea-section-label';
    featuredHeader.textContent = 'Aanbevolen lagen';
    resultsContainer.appendChild(featuredHeader);

    for (const group of KEA_FEATURED) {
        const themeHeader = document.createElement('div');
        themeHeader.style.cssText = `padding:4px 15px;background:#f5f5f5;font-size:11px;font-weight:bold;color:${group.color};border-bottom:1px solid #eee;`;
        themeHeader.textContent = group.theme;
        resultsContainer.appendChild(themeHeader);
        for (const l of group.layers) {
            resultsContainer.appendChild(makeResultItem({
                name: l.name, description: l.description,
                url: KEA_WMS, layer: l.layer,
                hasWms: true, source: 'kea', publisher: 'KEA'
            }));
        }
    }

    if (layers.length > 0) {
        const allHeader = document.createElement('div');
        allHeader.className = 'kea-section-label';
        allHeader.style.borderTop = '2px solid #e0e0e0';
        allHeader.textContent = `Alle ${layers.length} lagen — gebruik zoekveld om te filteren`;
        resultsContainer.appendChild(allHeader);
    }
}

async function showKeaCatalog(term) {
    const resultsContainer = document.getElementById('search-results');

    if (!keaLayerCache) {
        resultsContainer.innerHTML = '<div style="padding:10px 15px;color:#888;font-size:12px;"><i class="fa fa-spinner fa-spin"></i> Laden...</div>';
        resultsContainer.style.display = 'block';
    }

    const layers = await fetchKeaLayers();
    renderKeaResults(layers, term || '');
}

function initSearch() {
    const input = document.getElementById('layer-search');
    const keaInput = document.getElementById('kea-search');
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
        items.forEach(item => resultsContainer.appendChild(makeResultItem(item)));
    }

    input.addEventListener('input', (e) => performSearch(e.target.value));

    const performKeaSearch = debounce((term) => showKeaCatalog(term), 300);
    keaInput.addEventListener('input', (e) => performKeaSearch(e.target.value));

    document.addEventListener('click', (e) => {
        const tabs = document.getElementById('search-source-tabs');
        const keaBar = document.getElementById('kea-filter-bar');
        if (!input.contains(e.target) && !resultsContainer.contains(e.target) &&
            !tabs.contains(e.target) && !keaBar.contains(e.target)) {
            resultsContainer.style.display = 'none';
        }
    });

    // Tab switching
    document.getElementById('tab-ngr').addEventListener('click', () => {
        document.getElementById('tab-ngr').classList.add('active');
        document.getElementById('tab-kea').classList.remove('active');
        document.getElementById('ngr-filter-bar').style.display = '';
        document.getElementById('kea-filter-bar').style.display = 'none';
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
        input.value = '';
        keaInput.value = '';
        input.focus();
    });

    document.getElementById('tab-kea').addEventListener('click', () => {
        document.getElementById('tab-kea').classList.add('active');
        document.getElementById('tab-ngr').classList.remove('active');
        document.getElementById('ngr-filter-bar').style.display = 'none';
        document.getElementById('kea-filter-bar').style.display = '';
        input.value = '';
        keaInput.focus();
        showKeaCatalog('');
        // Prefetch in background so search is instant
        fetchKeaLayers();
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
