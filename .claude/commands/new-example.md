Scaffold a new visualization example in maps-that-matter. Argument: $ARGUMENTS (optional example name in kebab-case).

Steps:
1. If no name given in $ARGUMENTS, ask for: example name (kebab-case), one-sentence description, tech approach (Deck.gl bare canvas or Kepler.gl). Default to Deck.gl bare canvas.
2. Read CLAUDE.md to understand current patterns before writing any code.
3. Create `[name]/index.html` following the appropriate template:
   - Deck.gl: bare `new Deck({...})` on a canvas — no React. Include basemap, H3HexagonLayer placeholder, tooltip, home link, meta/OG tags per the template in CLAUDE.md.
   - Kepler.gl: only if explicitly requested. React/Redux via CDN, JSON config-driven.
4. Add rewrite rule to vercel.json: `{ "source": "/[name]", "destination": "/[name]/index.html" }`
5. Add a project card to root index.html in the appropriate position (match the existing card format).
6. Add the new example to the Current examples list in CLAUDE.md.

Follow all patterns in CLAUDE.md exactly. Do not mix Deck.gl and Kepler.gl in one file.
