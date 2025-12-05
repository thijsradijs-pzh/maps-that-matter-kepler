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

  // Create Carto basemap layer
  createBasemap(style = 'positron') {
    const {TileLayer, BitmapLayer} = deck;
    
    const baseUrls = {
      dark: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      light: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      voyager: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
    };

    return new TileLayer({
      id: 'basemap',
      data: [
        baseUrls[style].replace('a.', 'a.'),
        baseUrls[style].replace('a.', 'b.'),
        baseUrls[style].replace('a.', 'c.')
      ],
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
    let html = '<div style="font-family: sans-serif;">';
    
    fields.forEach(field => {
      const value = object[field.key];
      if (value !== undefined && value !== null) {
        const displayValue = field.format ? field.format(value) : value;
        const color = field.color || 'white';
        html += `<strong style="color: ${color};">${field.label}:</strong> ${displayValue}<br/>`;
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
