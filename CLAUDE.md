# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collection of standalone interactive geospatial visualizations built with Kepler.gl and Deck.gl, deployed to Vercel. Each visualization is a self-contained HTML/JS/CSS application with no build process — all dependencies are loaded from CDNs.

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
- `blog-h3-examples/` — Static article page ("From Hexagons to Foresight"), not a map app

### Shared Utilities (`/shared/`)
- `deckgl-utils.js` — Color scales, color mapping functions, Carto basemap layer factory
- `duckdb-loader.js` — DuckDB WASM integration for in-browser data loading

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
- **H3 hexagons**: Most aggregations use H3 resolution 7–8 via `h3.js` loaded from CDN. Exceptions: pdok-viewer and vraag-de-kaart use resolution 9 (~174m hexagons) for CBS 100m grid data.
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

## Known Issues / Improvement Backlog

Deep audit completed 2026-04-08. Items marked ✅ are done. When editing any app, fix relevant issues for that app too.

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

---

### P2 — Medium (code quality / maintainability)

**WMS layer creation duplicated** — `multi-criteria-analysis/js/wms-layer.js` vs `gebiedsviewer/js/wms-layer.js`
- The two implementations differ (standard WMS vs ArcGIS MapServer export endpoint). Partial consolidation possible but not a true dedup. Note: agro-viewer already loads MCA's wms-layer.js directly.

**Large monolithic files** — `multi-criteria-analysis/js/app.js` (~600 lines), `gebiedsviewer/js/app.js` (~1900 lines)
- Gebiedsviewer warrants a refactor plan before touching. Multi-criteria-analysis could split into wms.js, search.js, mca.js.

---

### P3 — Low (nice-to-have)

**URL state not persisted** — `gebiedsviewer`, `multi-criteria-analysis`
- Tab switches, weights, active WMS layers lost on page refresh. Store in URL hash. (gebiedsviewer already stores map position + layer list; missing: active tab, MCA weights.)

**"Click to Activate" pattern inconsistent** — `population-3d`, `groundheight` only
- Either remove (simplifies code) or apply consistently across all apps. Currently confuses new visitors.

**Stale satellite dates** — `agro-viewer` sidebar
- "2024 - Mei", "2023 - Zomer" hardcoded. Query NSO capabilities or make configurable via config.js.

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
