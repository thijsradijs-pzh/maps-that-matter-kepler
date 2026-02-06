// js/csw-search.js

// Point to our own Vercel API proxy
const GEONETWORK_CSW_URL = '/api/search-ngr';

// Helper for debugging
const DEBUG_CSW = true;
function debugLog(...args) {
    if (DEBUG_CSW) console.log('[MCA Debug]', ...args);
}

// 1. Build CSW XML Request
function buildCSWRequest(searchTerm, maxRecords = 50) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<csw:GetRecords xmlns:csw="http://www.opengis.net/cat/csw/2.0.2" xmlns:ogc="http://www.opengis.net/ogc" service="CSW" version="2.0.2" resultType="results" startPosition="1" maxRecords="${maxRecords}">
    <csw:Query typeNames="csw:Record">
        <csw:ElementSetName>full</csw:ElementSetName>
        <csw:Constraint version="1.1.0">
            <ogc:Filter>
                <ogc:Or>
                    <ogc:PropertyIsLike wildCard="%" singleChar="_" escapeChar="\\"><ogc:PropertyName>title</ogc:PropertyName><ogc:Literal>%${searchTerm}%</ogc:Literal></ogc:PropertyIsLike>
                    <ogc:PropertyIsLike wildCard="%" singleChar="_" escapeChar="\\"><ogc:PropertyName>abstract</ogc:PropertyName><ogc:Literal>%${searchTerm}%</ogc:Literal></ogc:PropertyIsLike>
                </ogc:Or>
            </ogc:Filter>
        </csw:Constraint>
    </csw:Query>
</csw:GetRecords>`;
}

// 2. Parse XML Response (Greedy/Robust)
function parseCSWResponse(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const records = [];
    
    const searchResults = xmlDoc.querySelector('SearchResults') || xmlDoc.documentElement;
    const childNodes = searchResults.children || searchResults.childNodes;
    
    for (let i = 0; i < childNodes.length; i++) {
        const node = childNodes[i];
        if (node.nodeType !== 1) continue;

        let title = node.querySelector('title')?.textContent || Array.from(node.getElementsByTagNameNS('*', 'title'))[0]?.textContent || "Naamloos";
        let abstract = node.querySelector('abstract')?.textContent || Array.from(node.getElementsByTagNameNS('*', 'abstract'))[0]?.textContent || "";

        let wmsUrl = null;
        
        // Find WMS URL (Greedy)
        const allLinks = [
            ...Array.from(node.getElementsByTagNameNS('*', 'references')),
            ...Array.from(node.getElementsByTagNameNS('*', 'URI')),
            ...Array.from(node.getElementsByTagNameNS('*', 'URL'))
        ];

        for (const link of allLinks) {
            const text = link.textContent;
            const scheme = link.getAttribute('scheme') || '';
            const protocol = link.getAttribute('protocol') || '';
            
            if ((scheme && scheme.toLowerCase().includes('wms')) ||
                (protocol && protocol.toLowerCase().includes('wms')) ||
                (text && text.toLowerCase().includes('wms')) || 
                (text && text.toLowerCase().includes('mapserver'))) {
                
                let url = text.trim();
                if (url.startsWith('http:')) url = url.replace('http:', 'https:');
                url = url.split('?')[0];
                wmsUrl = url;
                break;
            }
        }
        
        if (wmsUrl) {
            records.push({
                name: title,
                description: abstract.substring(0, 100) + '...',
                url: wmsUrl,
                layer: '0', 
                hasWms: true,
                source: 'geonetwork'
            });
        }
    }
    debugLog(`Parsed ${records.length} WMS layers.`);
    return records;
}

// 3. Main Search Function
async function searchGeoNetwork(searchTerm) {
    const xmlRequest = buildCSWRequest(searchTerm);
    try {
        const response = await fetch(GEONETWORK_CSW_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
            body: xmlRequest
        });
        if (!response.ok) throw new Error(`CSW request failed: ${response.status}`);
        const xmlText = await response.text();
        return parseCSWResponse(xmlText);
    } catch (error) {
        console.warn('CSW search failed:', error);
        return [];
    }
}