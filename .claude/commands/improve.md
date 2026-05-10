Review the backlog in CLAUDE.md and guide an improvement session.

Steps:
1. Read ~/maps-that-matter-kepler/CLAUDE.md — specifically the P1, P2, and P3 sections.
2. List the open P1 items clearly, then P2, then P3.
3. Ask which area to focus on, or whether to pick the highest-value item automatically.
4. Once direction is confirmed, start on the chosen item:
   - For `vraag-de-kaart` shareable URL: read `vraag-de-kaart/index.html` first, then plan the URL encoding approach.
   - For `vraag-de-kaart` timeseries chart: read the existing chart infrastructure (if any) in `vraag-de-kaart/index.html` before proposing.
   - For a new viewer: run `bash new-example.sh` with a proposed slug, then build from the Deck.gl bare canvas pattern.
   - For P2 refactors: read the target file in full before proposing a split — gebiedsviewer/js/app.js is ~1900 lines, plan the refactor before touching anything.
5. Always show a diff or plan before modifying files.
6. After the session, remind to run `/capture` to write an exobrain inbox note.
