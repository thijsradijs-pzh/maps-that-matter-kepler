// shared/deckgl-utils.js
// Reusable deck.gl components and utilities

const DeckGLUtils = {
  
  // Color scales
  colorScales: {
    globalWarming: [
      [76, 0, 53],      // #4C0035 - Low
      [136, 0, 48],     // #880030
      [183, 47, 21],    // #B72F15 - Medium
      [214, 97, 10],    // #D6610A
      [239, 145, 0],    // #EF9100 - High
      [255, 195, 0]     // #FFC300 - Very High
    ],
    
    blues: [
      [8, 48, 107],     // Dark blue
      [8, 81, 156],
      [33, 113, 181],
      [66, 146, 198],
      [107, 174, 214],
      [158, 202, 225]   // Light blue
    ],
    
    greens: [
      [0, 68, 27],      // Dark green
      [0, 109, 44],
      [35, 139, 69],
      [65, 171, 93],
      [116, 196, 118],
      [161, 217, 155]   // Light green
    ],
    populationOnLight: [
      [237, 248, 251],  // very light
      [204, 236, 230],
      [153, 216, 201],
      [102, 194, 164],
      [44, 162, 95],
      [0, 109, 70]      // darkest
    ]
  },

  // Get color from value and scale
  getColor(value, min, max, scale = 'globalWarming', alpha = 180) {
    const colorScale = this.colorScales[scale];
    if (!value || value === 0) return [...colorScale[0], alpha];
    
    const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const index = Math.min(Math.floor(normalized * colorScale.length), colorScale.length - 1);
    return [...colorScale[index], alpha];
  },
  
  // Map a 0–255 value to a color from a given scale
  getColorFromScale(value, scaleName) {
    const scale = this.colorScales[scaleName] || this.colorScales.populationOnLight;
    const v = Math.max(0, Math.min(255, value || 0));         // clamp 0–255
    const idx = Math.round((v / 255) * (scale.length - 1));   // 0..n-1
    return scale[idx];
  },


  /**
   * Ondergrondlaag: PDOK BRT Achtergrondkaart, open data en geen sleutel.
   *
   * CARTO is er op 2026-09-28 uit: basemaps.cartocdn.com vraagt sinds kort een
   * API-sleutel en levert anders een plaatshouder met "API KEY REQUIRED" --
   * bij HTTP 200, dus zonder foutmelding en zonder console-error.
   *
   * GEEN donkere ondergrond meer. BRT heeft die niet, en de keus is bewust om
   * er geen derde partij voor binnen te halen: één bron, geen sleutels, alles
   * open data van het Kadaster. 'dark' en 'dark-matter' geven daarom grijs.
   *
   * Let op voor wie dit later leest: `vraag-de-kaart` vroeg om 'dark-matter',
   * wat nooit in deze tabel stond, dus die viewer draaide allang op de lichte
   * kaart via de fallback. Voor hem verandert er dus niets. `population-3d` en
   * `groundheight` worden wel lichter; hun kleurschalen zijn op een donkere
   * ondergrond ontworpen en verdienen een herziening.
   *
   * (`gebiedsviewer` heeft zijn eigen laaglijst in js/rendering.js met een
   * ArcGIS-donker en een ArcGIS-satelliet. Die staan los van deze fabriek en
   * zijn hier niet aangeraakt.)
   */
  createBasemap(style = 'light') {
    const {TileLayer, BitmapLayer} = deck;

    const BRT = v =>
      `https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0/${v}/EPSG:3857/{z}/{x}/{y}.png`;

    const baseUrls = {
      // Grijs komt het dichtst bij Positron: neutraal, data blijft vooropstaan.
      light:         BRT('grijs'),
      positron:      BRT('grijs'),
      grijs:         BRT('grijs'),
      dark:          BRT('grijs'),
      'dark-matter': BRT('grijs'),
      // Voyager was de kleurige stratenkaart; dat is BRT standaard.
      voyager:       BRT('standaard'),
      standaard:     BRT('standaard'),
      pastel:        BRT('pastel'),
      water:         BRT('water'),
    };

    const url = baseUrls[style] || baseUrls.light;

    return new TileLayer({
      id: 'basemap',
      // PDOK kent geen a/b/c-subdomeinen zoals CARTO; één URL volstaat.
      data: url,
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: props => {
        const {bbox: {west, south, east, north}} = props.tile;
        return new BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [west, south, east, north]
        });
      },
      pickable: false
    });
  },


  // Create H3 hexagon layer
  createH3Layer(config) {
    const {H3HexagonLayer} = deck;
    
    const defaults = {
      id: 'h3-layer',
      pickable: true,
      wireframe: false,
      filled: true,
      extruded: false,
      elevationScale: 0,
      opacity: 0.8,
      getLineColor: [60, 60, 60, 100],
      getLineWidth: 1,
      lineWidthMinPixels: 0.5
    };

    return new H3HexagonLayer({...defaults, ...config});
  },

  // Load and parse CSV data
  async loadCSV(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load: ${response.status}`);
    const csvText = await response.text();
    
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (error) => reject(error)
      });
    });
  },

  // Format number with commas
  formatNumber(num) {
    return Math.round(num).toLocaleString();
  },

  // Create standard tooltip HTML
  createTooltip(object, fields) {
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let html = '<div style="font-family: sans-serif;">';

    fields.forEach(field => {
      const value = object[field.key];
      if (value !== undefined && value !== null) {
        const displayValue = field.format ? field.format(value) : value;
        const color = field.color || 'white';
        html += `<strong style="color: ${esc(color)};">${esc(field.label)}:</strong> ${esc(displayValue)}<br/>`;
      }
    });
    
    html += '</div>';
    
    return {
      html,
      style: {
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        fontSize: '12px',
        padding: '12px',
        borderRadius: '4px',
        maxWidth: '250px'
      }
    };
  }
};

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeckGLUtils;
}
