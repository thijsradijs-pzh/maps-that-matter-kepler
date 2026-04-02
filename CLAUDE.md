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
- `blog-h3-examples/` — Static article page ("From Hexagons to Foresight"), not a map app

### Shared Utilities (`/shared/`)
- `deckgl-utils.js` — Color scales, color mapping functions, Carto basemap layer factory
- `duckdb-loader.js` — DuckDB WASM integration for in-browser data loading

### Backend (`/api/`)
Vercel serverless functions used as CORS proxies:
- `proxy.js` — Generic proxy for external WMS/geospatial services
- `agro-proxy.js` — Agricultural data cube proxy
- `search-ngr.js` — Dutch National Geo Register (NGR) search

### Routing (`vercel.json`)
Clean URL rewrites map `/example-name` → `/example-name/index.html`. CORS headers (`X-Frame-Options: ALLOWALL`, `Access-Control-Allow-Origin: *`) enable iframe embedding in Substack posts.

When adding a new example, a rewrite rule must also be added to `vercel.json`:
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
- **H3 hexagons**: Most aggregations use H3 resolution 7–8 via `h3.js` loaded from CDN
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

## Example: Agro Viewer
Key files:
- `agro-viewer/index.html` — entry point
- `agro-viewer/app.js` — main application logic (560 lines): handles WMS layers, NGR search, satellite toggle, Deck.gl rendering
- `agro-viewer/config.js` — layer/source configuration
