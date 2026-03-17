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
Each visualization lives in its own directory (`population-3d/`, `agro-viewer/`, `multi-criteria-analysis/`, etc.) as a standalone app. The `/shared/` directory holds utilities reused across examples.

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

- **Basemaps**: Always use Carto (no API key needed). Options: `dark-matter`, `light`, `voyager`
- **H3 hexagons**: Most aggregations use H3 resolution 7–8 via `h3.js` loaded from CDN
- **Deck.gl layers**: Prefer `H3HexagonLayer`, `ScatterplotLayer`, `BitmapLayer` for raster imagery
- **Two rendering approaches**: Kepler.gl examples embed a full React/Redux stack (loaded from CDN) inside a `<div id="app">` and drive it with a JSON config exported from the Kepler.gl UI. Deck.gl examples use bare canvas rendering with no React — they instantiate `new Deck({...})` directly. Don't mix the two in one file.
- **Multi-criteria analysis**: `/multi-criteria-analysis/` has its own JS modules (`js/app.js`, `js/csw-search.js`, `js/wms-layer.js`)

## Example: Agro Viewer
The most complex example. Key files:
- `agro-viewer/index.html` — entry point
- `agro-viewer/app.js` — main application logic (560 lines): handles WMS layers, NGR search, satellite toggle, Deck.gl rendering
- `agro-viewer/config.js` — layer/source configuration
