# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collection of standalone interactive geospatial visualizations built with Kepler.gl and Deck.gl, deployed to Vercel. Each visualization is a self-contained HTML/JS/CSS application with no build process — all dependencies are loaded from CDNs.

## Exobrain

My personal exobrain lives at `~/Documents/exobrain-vault`. After substantive work on this repo, I capture insights there in `inbox/`. Relevant existing exobrain notes:
- [[project-maps-that-matter]] — overall project context
- [[concept-h3-indexing]] — H3 hex spatial indexing
- [[concept-deck-gl]] — deck.gl architecture decisions

## Development & Deployment

**No build step required.** Open any `index.html` directly in a browser or use a local server:
```bash
python3 -m http.server 8080
# or
npx serve .
```

**Deploy to Vercel:**
```bash
bash deploy.sh              # preview deployment
bash deploy.sh --production # production deployment
```

**Create a new example:**
```bash
bash new-example.sh
```

## Architecture

### Structure
Each visualization lives in its own directory as a standalone app. The `/shared/` directory holds utilities reused across examples.

Current examples:
- `population-3d/` — 3D population time-series over Dutch H3 hexagons (Kepler.gl)
- `agro-viewer/` — Agricultural WMS layer browser with NGR search (Deck.gl, most complex)
- `multi-criteria-analysis/` — Multi-criteria spatial analysis with CSW/WMS layer search
- `explorer-3d/` — Generic Parquet data explorer using DuckDB WASM + Deck.gl
- `geluid-groen-viewer/` — Noise & green space analysis for Dutch municipalities (Deck.gl, H3)
- `groundheight/` — Ground height (AHN) visualization over H3 hexagons (Deck.gl)
- `schiedam-bos/` — Forest accessibility analysis around Schiedam (Deck.gl, H3)
- `som-viewer/` — Self-organizing map / spatial intelligence viewer for Zuid-Holland with story overlay (Deck.gl, H3)
- `gebiedsviewer/` — Zuid-Holland Gebiedsviewer: WMS layer browser for 6 thematic categories (Grenzen, Landelijk Gebied, Bodem, Klimaat, Water, Milieu) sourced from geoservices.zuid-holland.nl (Deck.gl, no H3)
- `pdok-viewer/` — AI-powered natural language interface for Dutch geodata (CBS/BAG/NGR). 2-step flow: draw bbox → ask question. AI picks WFS dataset → data fetched live as H3 res-9 hexagons (~174m). Two-click bbox drawing. Panel is a floating draggable/resizable chat window that snaps right after results load. (Deck.gl, H3 res 9)
- `vraag-de-kaart/` — AI-powered natural language queries over a pre-built H3 datacube (225,684 hexagons, CBS + LGN, 2018–2023). Uses DuckDB WASM to query a 11MB Parquet file in-browser. NL & EN. (Deck.gl, H3, DuckDB WASM)
- `ufo-viewer/` — 18,291 UFO meldingen (ufomeldpunt.nl) als H3-hexagoonkaart; correlatie met windmolens (PDOK WFS) en coffeeshops (bundled JSON); client-side H3 aggregation van GeoJSON punten
- `kennisgraaf-viewer/` — 5,824 datasets uit het landelijke Nationaal Georegister (CSW-harvest) als interactieve force-directed graph (force-graph CDN); knopen = dataset/topic/trefwoord, data uit `/data/kennisgraaf_ngr.json`. "Vraag de kennisgraaf"-balk: NL vraag → `api/ask-kennisgraaf.js` (Gemini) stelt kandidaat-zoektermen voor → client-side fuzzy matching (Levenshtein) grondt die tegen de écht geoogste trefwoorden/topics, dus een gehallucineerde term levert gewoon geen match op i.p.v. nepdata. Harvest-tooling leeft in het aparte repo `graph-geonetwork` (niet in dit repo)
- `vraag-de-kennisgraaf/` — chat-eerste ingang tot dezelfde kennisgraaf-data, zonder graafvisualisatie: vraag stellen → gegronde datasets als lijst (zelfde grounding-logica als kennisgraaf-viewer, geëxtraheerd naar `shared/kennisgraaf-vocab.js`) → klik = laad de data van die dataset **as-is** (ruwe geometrie, MapLibre, geen H3-aggregatie) op de kaart. Voorkeur WFS boven WMS: `api/ngr-record.js` haalt beide serviceURLs uit NGR's ISO19139-metadata; WMS is de fallback (van de datasets heeft ~15% alleen WMS, ~72% geen van beide — pure metadata zonder kaartservice, een eigenschap van NGR zelf). Noemt de vraag een plaatsnaam (`ask-kennisgraaf.js`'s `location`-veld), dan scoped `api/pdok-location.js` de kaart + WFS-bbox naar die plek (PDOK Location API, niet de oudere Locatieserver). `kennisgraaf-viewer` en `pdok-viewer` blijven ongewijzigd
- `blog-h3-examples/` — Static article page ("From Hexagons to Foresight"), not a map app

### Shared Utilities (`/shared/`)
- `deckgl-utils.js` — Color scales, color mapping functions, Carto basemap layer factory
- `duckdb-loader.js` — DuckDB WASM integration for in-browser data loading
- `wms-layer.js` — Standard WMS TileLayer via proxy (`createWMSLayer()`). Used by multi-criteria-analysis and agro-viewer. For ArcGIS MapServer export endpoint, see `gebiedsviewer/js/wms-layer.js`.
- `kennisgraaf-vocab.js` — Pure grounding functions (`kgNormalize`, `kgLevenshtein`, `kgBuildVocabIndex`, `kgMatchTerm`) over the kennisgraaf graph, no DOM dependency. Used by vraag-de-kennisgraaf; kennisgraaf-viewer keeps its own inline copy (untouched).

### Backend (`/api/`)
Vercel serverless functions used as CORS proxies and AI endpoints:
- `proxy.js` — Generic proxy for external WMS/geospatial services
- `agro-proxy.js` — Agricultural data cube proxy
- `search-ngr.js` — Dutch National Geo Register (NGR) search
- `ask-wfs.js` — POST `{ question }` → calls Gemini 2.5 Flash to select the right PDOK WFS source and metric column; returns full query params for the frontend (used by pdok-viewer)
- `wfs-proxy.js` — GET proxy for PDOK WFS requests; supports pagination via `startIndex`; caps at 1000 features per page and sets `X-Truncated: 1` header when truncated (used by pdok-viewer)
- `search-wms.js` — Searches NGR for WMS layers by keyword; used by pdok-viewer to suggest related layers after a WFS result
- `suggest-location.js` — Proxies to PDOK Locatieserver; supports two modes:
  - `GET ?q=...` → autocomplete suggestions (gemeente, wijk, buurt, woonplaats)
  - `GET ?id=<locatieserver_id>` → lookup returning `{ doc: { weergavenaam, type, gemeentenaam, centroide_ll } }` where `centroide_ll` is WKT `POINT(lon lat)` in WGS84
- `ask-map.js` — AI endpoint used by vraag-de-kaart (separate from ask-wfs.js)
- `ask-kennisgraaf.js` — POST `{ question }` → Gemini proposes 3–6 Dutch search terms for kennisgraaf-viewer's "vraag de kennisgraaf" bar; terms are grounded client-side against the real harvested vocabulary, never trusted as-is (also used by vraag-de-kennisgraaf)
- `ngr-record.js` — GET `?id=<uuid>` → fetches a dataset's full ISO19139 metadata from NGR's GeoNetwork API and extracts its OGC:WFS **and** OGC:WMS distribution links; returns `{ wfs: {url, typeName, description}|null, wms: {url, layer, description}|null }`, `null` is a normal (not error) response. Used by vraag-de-kennisgraaf.
- `ngr-wfs-proxy.js` — GET proxy for WFS GetFeature requests (`wfsUrl, typeName, bbox, pageSize, startIndex`), accepts any `https` host (not just pdok.nl/nationaalgeoregister.nl) since NGR indexes services from many hosts (provinces, gemeentes); blocks private/loopback/link-local hostnames. Caps at 1000 features, sets `X-Truncated: 1`. Used by vraag-de-kennisgraaf.
- `ngr-wms-tile.js` — GET proxy for a single WMS GetMap tile (`wmsUrl, layer, bbox` in EPSG:3857 — MapLibre's `{bbox-epsg-3857}` raster tile token), WMS 1.1.1 to sidestep 1.3.0's CRS-dependent axis-order issues. Same host validation as `ngr-wfs-proxy.js`. Used by vraag-de-kennisgraaf as the WMS fallback when a dataset has no WFS (or its WFS is GML-only, e.g. many ArcGIS-hosted services — common enough in NGR that the frontend falls back mid-request, not just up front).
- `pdok-location.js` — GET `?q=<place name>` → resolves a Dutch place name to a real bounding box via the **PDOK Location API** (`api.pdok.nl/kadaster/location-api/v1`, the successor to the legacy Locatieserver v3 used by `suggest-location.js` — that one only returns a centroid point). Queries `gemeentegebied`/`woonplaats`/`plaats`/`provinciegebied` collections. Picks the best match by exact-name priority (gemeentegebied > woonplaats > plaats > provinciegebied) before falling back to raw relevance score — the API's own score alone can rank a same-named neighbourhood above the actual city (e.g. "Utrecht" scoring a wijk called "Utrechtseweg" above the municipality). Used by vraag-de-kennisgraaf to scope map view + WFS `bbox` filter when a question names a place (`ask-kennisgraaf.js`'s `location` field).

### Landing page (`/index.html`)
Root `index.html` serves as the homepage at mapsthatmatter.io — lists all projects with descriptions and tech tags. Dark GitHub-style design. The `/` rewrite in `vercel.json` points here.

### Routing (`vercel.json`)
Clean URL rewrites map `/example-name` → `/example-name/index.html`. CORS headers (`X-Frame-Options: ALLOWALL`, `Access-Control-Allow-Origin: *`) enable iframe embedding in Substack posts. Root `/` serves `index.html` (landing page).

When adding a new example, add a rewrite rule to `vercel.json` AND add the project to `index.html`:
```json
{ "source": "/my-example", "destination": "/my-example/index.html" }
```

### WMS Proxy Pattern
External WMS/geospatial services are proxied through `/api/proxy.js` to bypass CORS. Pass the full target URL as a `url` query parameter:
```js
fetch(`/api/proxy?url=${encodeURIComponent('https://external-wms-service/wms?SERVICE=WMS&...')}`)
```
Optional auth can be forwarded via the `x-proxy-auth` request header. Responses are cached for 24 hours (`Cache-Control: public, max-age=86400`).

### Data (`/data/`)
Large CSV/Parquet files with Netherlands geospatial data (H3 hexagons, population time series). These are loaded at runtime by the visualizations — not bundled.

## Key Patterns

- **Basemaps**: Light and voyager use Carto (no API key needed). Dark basemap uses ArcGIS World Dark Gray as a custom `TileLayer` (not Carto `dark-matter`). Satellite uses ESRI World Imagery.
- **H3 hexagons**: Most aggregations use H3 resolution 7–8 via `h3.js` loaded from CDN. Exception: `pdok-viewer` uses resolution 9 (~174m) for live WFS aggregation. `vraag-de-kaart` uses resolution 8 (~460m) — the pre-built datacube Parquet is at res 8.
- **Deck.gl layers**: Prefer `H3HexagonLayer`, `ScatterplotLayer`, `BitmapLayer` for raster imagery
- **Two rendering approaches**: Kepler.gl examples embed a full React/Redux stack (loaded from CDN) inside a `<div id="app">` and drive it with a JSON config exported from the Kepler.gl UI. Deck.gl examples use bare canvas rendering with no React — they instantiate `new Deck({...})` directly. Don't mix the two in one file.
- **WMS tile cache-busting**: When toggling sublayers, include the active sublayer IDs in the deck.gl layer `id` (e.g. `${key}::${layerIds}`) so deck.gl invalidates the tile cache on change.
- **Group layers (ArcGIS)**: ArcGIS ≤10.x returns `subLayerIds` (int[]), ArcGIS 11.x returns `subLayers` ([{id,name}]). Detect both. Default to showing only the first sublayer to avoid stacking multiple analyses.

## Example: Gebiedsviewer
The most complex example (1929 lines). Key files:
- `gebiedsviewer/index.html` — entry point; loads SortableJS, Font Awesome, Deck.gl, shared utils
- `gebiedsviewer/js/app.js` — main application logic: WMS layer management, measure tool, drag-to-reorder (SortableJS), theme-grouped active layers, permalink with sublayer+opacity state, print dialog, table view with row count, identify/popup with JSON copy, mobile sidebar, MCA tab
- `gebiedsviewer/js/wms-layer.js` — `createWMSLayer()`: TileLayer wrapping WMS tiles via proxy, with `onTileLoad`/`onError` callbacks for loading/error card states
- `gebiedsviewer/config.js` — `CATALOG`: 6 thematic categories (Grenzen, Landelijk Gebied, Bodem, Klimaat, Water, Milieu), each with services and layer IDs from geoservices.zuid-holland.nl

## Example: PDOK Verkenner (`pdok-viewer/`)
Key files:
- `pdok-viewer/index.html` — single-file app (~2200 lines); all logic, CSS, and HTML inline

UX flow:
1. Welcome splash (skippable, "don't show again" in localStorage)
2. **Step 1** — Draw bbox: floating chat panel shows draw card with municipality autocomplete. Two-click drawing (first click = anchor, mousemove = live preview, second click = finish). Panel glows blue.
3. **Step 2** — Ask question: question card appears with example buttons, input bar slides in at the bottom of the panel. Panel glows green.
4. **Step 3** — Results: AI card + result card shown, panel snaps to right side, map fills the screen. Year switcher for CBS data, retry buttons for suppressed metrics.

Key JS patterns:
- `initDrawStep()` — resets all state, clears messages, shows draw card, activates draw mode
- `clearDrawnArea()` — calls `initDrawStep()` to fully reset (not just clear the bbox)
- `askAI(question)` → `fetchDataForBbox(bbox)` — two-phase: AI picks dataset, then WFS data is fetched
- `snapPanelRight()` — switches panel from centered floating to right-side fixed after results load
- `wireLocationSearch(inputEl, dropdownEl)` — reusable PDOK Locatieserver autocomplete wiring
- `CBS_SUPPRESSED = -9000` — values below this threshold are CBS-suppressed, filtered out
- `SUPPRESSION_PRONE` set + `SUPPRESSION_ALTS` map — pre-warn users and offer retry alternatives
- `switchYear(year)` — replaces year in WFS URL and re-fetches for same bbox
- `pixelToLatLon(cx, cy)` — converts screen pixels to WGS84 using current viewport state

## Example: Agro Viewer
Key files:
- `agro-viewer/index.html` — entry point
- `agro-viewer/app.js` — main application logic (560 lines): handles WMS layers, NGR search, satellite toggle, Deck.gl rendering
- `agro-viewer/config.js` — layer/source configuration

## AI Workflow

This repo is worked on with two agents — use whichever fits the task:

**Claude Code** (you are here) — multi-file edits, refactoring, new viewers, debugging. All context is in this CLAUDE.md. Slash commands available:
- `/deploy` — push and deploy to Vercel production
- `/capture` — write a session summary to the exobrain inbox
- `/new-example` — scaffold a new viewer directory
- `/improve` — review the backlog and start a focused improvement session

**Hermes** — conversation, lookup, quick questions about patterns or PDOK. Has `maps-that-matter` skills installed with project context and coding patterns. Good for: "what's the basemap URL for dark mode?", "what's on the P1 backlog?", "how does CBS suppression work?".

**When to capture**: after any session where something non-obvious was learned or decided — run `/capture`. Skip pure bug fixes already documented here.

---

## Known Issues / Improvement Backlog

Deep audit completed 2026-04-08. Items marked ✅ are done. When editing any app, fix relevant issues for that app too.

---

### P1 — High value

**✅ Shareable URL + export** — `vraag-de-kaart` *(done 2026-05-10)*
- URL encodes current query, SQL, metric, color scale, viewport — shareable/bookmarkable
- Share button (clipboard), CSV download, GeoJSON download (via h3.cellToBoundary)

**✅ Timeseries chart** — `vraag-de-kaart` *(done 2026-05-10)*
- Chart.js line chart appears after each result — nationwide average for the queried metric, 2018–2023
- CBS-suppressed values filtered; tooltip uses formatValue; also restores on shared URL load

**Biodiversiteit viewer** — new viewer
- Visualize kruidendiversiteit data as H3 hexagons
- Connects to [[project-kruidendiversiteit-zh]] in exobrain (Wageningen research)
- Pattern: same datacube approach as vraag-de-kaart, new Parquet file

---

### ✅ Done
- Meta descriptions, Open Graph tags, favicon on all 12 apps
- "← Maps That Matter" home link on all 12 apps
- `console.log` removed from production code (population-3d, groundheight, explorer-3d)
- DuckDB loader unified into `/shared/duckdb-loader.js`; inline duplicates removed from explorer-3d and vraag-de-kaart
- `URL.createObjectURL()` blob URL revoked after worker load in duckdb-loader.js
- Debounce raised 500ms → 800ms in multi-criteria-analysis catalog search
- `role="dialog" aria-modal="true" aria-labelledby="..."` added to agro-viewer API key modal and pdok-viewer welcome modal
- `aria-label` added to gebiedsviewer + multi-criteria-analysis layer search inputs, pdok-viewer question input + submit button
- `aria-label` added to gebiedsviewer zoom/basemap icon buttons
- CSS spinner added to all loading states: population-3d, groundheight, explorer-3d, geluid-groen-viewer, multi-criteria-analysis, schiedam-bos, som-viewer
- Empty state message added to population-3d and explorer-3d (shown when filters return 0 results)
- Friendly HTML error messages across all apps (population-3d, groundheight, geluid-groen-viewer, multi-criteria-analysis, schiedam-bos, som-viewer, vraag-de-kaart, agro-viewer)
- `alert()` replaced with inline error card in agro-viewer WMS layer add flow
- Year filter max derived dynamically from data in population-3d and explorer-3d (no longer hardcoded to 2023)
- WMS GetCapabilities cached in-memory in agro-viewer and multi-criteria-analysis
- Colorblind ⚠/✓ icons added to geluid-groen-viewer stat cards
- Units added to explorer-3d column labels (€, m³, kWh, km, m NAP, dB)
- Legend ranges updated in population-3d (actual thresholds: <5, 5–25, 25–55, 55–165, ≥165 inwoners)
- `api/proxy.js`: added `AbortSignal.timeout(20000)`; error response no longer leaks raw JS error
- `shared/duckdb-loader.js`: table name sanitized before SQL interpolation; re-init edge case fixed (`this.db && this.conn`)
- `agro-viewer`: NSO credentials persisted to `sessionStorage` (survive tab refresh, cleared on tab close); `alert()` in credential modal replaced with inline error; `modal-error` paragraph added to modal HTML
- `som-viewer`: story overlay now closable with Escape key and arrow key navigation; cards scroll on small/short screens
- `api/search-wms.js`: CDATA sections now handled correctly in XML text extraction
- `agro-viewer`: WMS capabilities cache keyed on base service URL (not full proxy URL); search results keyboard accessible (`role=button`, `tabindex=0`, Enter/Space handler); debounce raised to 800ms
- `pdok-viewer`: panel drag now clamped to viewport bounds (can't drag off right/bottom edge)
- `population-3d` + `groundheight`: fullscreen button hidden on browsers without Fullscreen API (iOS Safari)
- `geluid-groen-viewer`: `aria-label` added to warn stat cards for screen readers
- `population-3d`: `COLOR_THRESHOLDS` extracted as single source of truth; legend now accurate (was missing 55–100 bucket, mislabeling 55–165)
- `multi-criteria-analysis`: heatmap legend now shows real min/max weighted score computed from loaded data
- `vraag-de-kaart`: "mogelijk niet volledig" hint shown in result count when result set hits 100-row default cap
- `shared/deckgl-utils.js`: tooltip `createTooltip()` now HTML-escapes all interpolated values (label, color, displayValue)
- `pdok-viewer`: "?" button added to panel header to re-open welcome modal (previously once dismissed via localStorage it was gone forever)
- `blog-h3-examples`: verified `aria-label` already present on all share buttons (no change needed)
- `pdok-viewer`: `loadAllPages()` now has `catch` block — shows user-friendly message instead of unhandled promise rejection
- Audited all async functions for unhandled rejections: gebiedsviewer, vraag-de-kaart, pdok-viewer all have proper try/catch (verified 2026-04-07)
- `multi-criteria-analysis/js/wms-layer.js` + `agro-viewer/app.js`: WMS tile errors now surface as ⚠ badge + red border on layer card
- `multi-criteria-analysis/js/app.js`: `alert()` replaced with inline auto-hiding error div for addWmsLayer failures
- `agro-viewer/app.js`: verified no `alert()` calls remain in WMS layer flow (was already using inline modal error from prior session)
- `population-3d`: play button now shows current/max year during animation (e.g. "⏸ 2022 / 2023")
- `shared/duckdb-loader.js`: streaming progress using response.body reader when Content-Length available (10→80% during download instead of jumping at fixed points)
- `shared/mca-criteria.js` created; `gebiedsviewer/js/app.js` and `multi-criteria-analysis/config.js` now reference it instead of defining their own copies
- `shared/deckgl-utils.js` createTooltip(): HTML-escapes all interpolated values; tooltip is XSS-safe (verified 2026-04-07)
- `ask-map.js` SQL safety: frontend (`vraag-de-kaart/index.html` lines 784–791) independently validates SQL before DuckDB execution; risk acceptable in WASM sandbox context
- `agro-viewer`: NSO satellite layers moved to `VIZ_CONFIG.nsoLayers` in config.js; `<select>` populated dynamically at init — no more hardcoded HTML options
- `population-3d` + `groundheight`: removed "Click to Activate" overlay (~160 lines CSS/HTML/JS each); map controller now starts enabled immediately

---

### P2 — Medium (code quality / maintainability)

**✅ WMS layer creation consolidated** — `shared/wms-layer.js` *(done 2026-05-10)*
- Standard WMS implementation moved to `/shared/wms-layer.js`; multi-criteria-analysis and agro-viewer both load from there.
- `gebiedsviewer/js/wms-layer.js` kept separate (ArcGIS MapServer export endpoint, different protocol).

**✅ Large monolithic files split** — `multi-criteria-analysis`, `gebiedsviewer`, `som-viewer`, `vraag-de-kaart` *(done 2026-05-11)*
- multi-criteria-analysis: split into csw-search.js, wms.js, search.js, ui.js, app.js
- gebiedsviewer: already split (state.js, layers.js, rendering.js, catalog.js, interactions.js, tables.js, app.js) — confirmed 2026-05-11
- som-viewer: split into css/style.css + js/config.js, render.js, trajectory.js, legend.js, story.js, controls.js, app.js
- vraag-de-kaart: split into css/style.css + js/config.js, render.js, wms.js, ui.js, autocomplete.js, permalink.js, app.js

---

### P3 — Low (nice-to-have)

**✅ URL state** — `multi-criteria-analysis` *(done 2026-05-10)*
- Tab, viewport, MCA weights, active WMS layers, satellite mode all persisted to URL hash.
- Restored on load without re-fetching GetCapabilities (saved layer data includes url/layer/title/publisher/bbox).

**✅ URL state** — `gebiedsviewer` *(done 2026-05-10 earlier)*
- Active tab + MCA weights + layer list + map position persisted to URL hash.



**Colorblind palettes not validated** — all apps
- Blue/orange/red/green color scales not tested for protanopia/deuteranopia. Test with Color Oracle tool.

---

### Template for new apps / when fixing existing ones
When adding meta/OG tags to any app, use this pattern (swap in the app-specific values):
```html
<meta name="description" content="…one sentence description…" />
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://www.mapsthatmatter.io/APP-SLUG" />
<meta property="og:title" content="APP TITLE — Maps That Matter" />
<meta property="og:description" content="…one sentence description…" />
<meta property="og:image" content="https://www.mapsthatmatter.io/assets/thijs.jpg" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="APP TITLE" />
<meta name="twitter:description" content="…one sentence description…" />
<meta name="twitter:image" content="https://www.mapsthatmatter.io/assets/thijs.jpg" />
```

---

@CLAUDE.local.md
