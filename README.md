# Maps That Matter

Losse, interactieve kaartviewers over Nederlandse geodata, live op
[maps.mapsthatmatter.io](https://maps.mapsthatmatter.io). Elke viewer is een
zelfstandige HTML/JS/CSS-app zonder build-stap; bibliotheken komen van een CDN.
De volledige projectdocumentatie staat in [`CLAUDE.md`](CLAUDE.md).

## Viewers

| route | wat |
|---|---|
| `/fenologie-gebieden` | Tien jaar Sentinel-2 NDVI per pixel binnen de Natura 2000-grens (Nieuwkoop, Coepelduynen). Pipeline en methodiek: [`fenologie/README.md`](fenologie/README.md) |
| `/pdok-viewer` | PDOK-luchtfoto's 2016–2026 op een tijdlijn, plus elke PDOK-WFS als laag |
| `/gebiedsviewer` | WMS-lagen van Provincie Zuid-Holland in zes thema's, met MCA |
| `/vraag-de-kaart` | Vragen in gewone taal over een H3-datacube (DuckDB WASM) |
| `/vraag-de-kennisgraaf` | Chat-ingang tot 5.824 datasets uit het Nationaal Georegister |
| `/kennisgraaf-viewer` | Dezelfde datasets als force-directed graaf |
| `/blog-h3-examples` | Artikel "From Hexagons to Foresight" |

`/population-3d` en `/groundheight` staan alleen nog online als embed voor het
artikel. `/fenologie` stuurt door naar `/fenologie-gebieden`.

## Lokaal draaien

```bash
python3 -m http.server 8080
```

De `api/`-functies (proxies, AI, openEO) draaien alleen op Vercel of met
`vercel dev`.

## Deployen

```bash
bash deploy.sh               # preview
bash deploy.sh --production  # productie
```

Een nieuwe viewer heeft een rewrite in `vercel.json` nodig en een kaart op de
landingspagina (`index.html`).
