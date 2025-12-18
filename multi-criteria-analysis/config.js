// config.js - Multi-Criteria Analysis (Stacked 3D Bars)
const VIZ_CONFIG = {
  title: '📊 Stacked MCA Analysis',
  dataUrl: '/data/h3_binary_matrix.csv', 
  h3Field: 'h3',
  basemap: 'positron',
  
  initialView: {
    longitude: 4.48, latitude: 51.90, zoom: 9.5, pitch: 55, bearing: 10
  },

  // Definitions for our segments
  criteria: [
    { key: 'verzilting', label: 'Verzilting', color: [31, 119, 180], weightKey: 'w_verzilting' },
    { key: 'bodemdaling', label: 'Bodemdaling', color: [255, 127, 14], weightKey: 'w_bodemdaling' },
    { key: 'wateroverlast', label: 'Wateroverlast', color: [44, 160, 44], weightKey: 'w_wateroverlast' },
    { key: 'boerenlandvogels', label: 'Boerenlandvogels', color: [214, 39, 40], weightKey: 'w_boerenlandvogels' },
    { key: 'peilgebieden', label: 'Peilgebieden', color: [148, 103, 189], weightKey: 'w_peilgebieden' }
  ],
  
  filters: [
    { key: 'w_verzilting', label: 'Verzilting Weight', min: 0, max: 5, step: 1, default: 1, format: (v) => v, filterFn: () => true },
    { key: 'w_bodemdaling', label: 'Bodemdaling Weight', min: 0, max: 5, step: 1, default: 1, format: (v) => v, filterFn: () => true },
    { key: 'w_wateroverlast', label: 'Wateroverlast Weight', min: 0, max: 5, step: 1, default: 1, format: (v) => v, filterFn: () => true },
    { key: 'w_boerenlandvogels', label: 'Boerenlandvogels Weight', min: 0, max: 5, step: 1, default: 1, format: (v) => v, filterFn: () => true },
    { key: 'w_peilgebieden', label: 'Peilgebieden Weight', min: 0, max: 5, step: 1, default: 1, format: (v) => v, filterFn: () => true }
  ],

  // Returns an array of 5 layer configs, one for each "stack" segment
  createLayer: (data, weights) => {
    // We create the layers from the bottom up.
    // To ensure they stack properly in 3D, we draw the tallest sums first.
    return VIZ_CONFIG.criteria.map((c, index) => {
      return {
        id: `mca-stack-${index}`,
        data: data,
        extruded: true,
        elevationScale: 150,
        getHexagon: d => d.h3,
        getFillColor: [...c.color, 255],
        
        // Elevation is the cumulative sum up to this criteria
        getElevation: d => {
          let sum = 0;
          for (let i = 0; i <= index; i++) {
            const crit = VIZ_CONFIG.criteria[i];
            sum += (Number(d[crit.key]) || 0) * (weights[crit.weightKey] || 0);
          }
          return sum;
        },

        updateTriggers: {
          getElevation: [weights.w_verzilting, weights.w_bodemdaling, weights.w_wateroverlast, weights.w_boerenlandvogels, weights.w_peilgebieden]
        }
      };
    }).reverse(); // Reverse so the tallest layers are rendered first (bottom of stack)
  },

  tooltip: (info) => {
    const d = info.object;
    if (!d) return null;
    return {
      html: `
        <div style="padding: 10px; background: white; color: black; border-radius: 4px;">
          <strong>H3: ${d.h3}</strong><br/><hr/>
          <div style="color: #1f77b4">Verzilting: ${d.verzilting}</div>
          <div style="color: #ff7f0e">Bodemdaling: ${d.bodemdaling}</div>
          <div style="color: #2ca02c">Wateroverlast: ${d.wateroverlast}</div>
          <div style="color: #d62728">Boerenlandvogels: ${d.boerenlandvogels}</div>
          <div style="color: #9467bd">Peilgebieden: ${d.peilgebieden}</div>
        </div>
      `
    };
  }
};
