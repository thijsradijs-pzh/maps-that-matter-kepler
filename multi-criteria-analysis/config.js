// config.js - Enhanced Stacked MCA Analysis
const VIZ_CONFIG = {
  title: '📊 Professional MCA Dashboard',
  dataUrl: 'h3_binary_matrix.csv', 
  h3Field: 'h3',
  basemap: 'positron',
  
  initialView: {
    longitude: 4.48, latitude: 51.90, zoom: 9.5, pitch: 45, bearing: 0
  },

  // Refined palette with better contrast
  criteria: [
    { key: 'verzilting', label: 'Verzilting', color: [0, 150, 136], weightKey: 'w_verzilting' },      // Teal
    { key: 'bodemdaling', label: 'Bodemdaling', color: [239, 83, 80], weightKey: 'w_bodemdaling' },   // Red
    { key: 'wateroverlast', label: 'Wateroverlast', color: [30, 136, 229], weightKey: 'w_wateroverlast' }, // Blue
    { key: 'boerenlandvogels', label: 'Boerenlandvogels', color: [255, 179, 0], weightKey: 'w_boerenlandvogels' }, // Amber
    { key: 'peilgebieden', label: 'Peilgebieden', color: [142, 68, 173], weightKey: 'w_peilgebieden' } // Purple
  ],
  
  filters: [
    { key: 'w_verzilting', label: 'Verzilting Weight', min: 0, max: 10, step: 1, default: 2 },
    { key: 'w_bodemdaling', label: 'Bodemdaling Weight', min: 0, max: 10, step: 1, default: 2 },
    { key: 'w_wateroverlast', label: 'Wateroverlast Weight', min: 0, max: 10, step: 1, default: 2 },
    { key: 'w_boerenlandvogels', label: 'Boerenlandvogels Weight', min: 0, max: 10, step: 1, default: 2 },
    { key: 'w_peilgebieden', label: 'Peilgebieden Weight', min: 0, max: 10, step: 1, default: 2 }
  ],

  createLayer: (data, weights) => {
    return VIZ_CONFIG.criteria.map((c, index) => {
      return {
        id: `mca-stack-${index}`,
        data: data,
        extruded: true,
        elevationScale: 150, // Adjusted for the 0-10 weight range
        getHexagon: d => d.h3,
        getFillColor: [...c.color, 210], // Slight transparency for better stacking look
        
        // Material for 3D lighting
        material: {
          ambient: 0.6,
          diffuse: 0.7,
          shininess: 32,
          specularColor: [60, 60, 60]
        },

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
        },

        // Animation: Makes the bars "grow" smoothly
        transitions: {
          getElevation: {
            duration: 600,
            easing: d3.easeCubicInOut // Note: ensure d3 is loaded or use default
          }
        }
      };
    }).reverse(); 
  },

  tooltip: (info) => {
    const d = info.object;
    if (!d) return null;
    return {
      html: `
        <div style="padding: 12px; font-family: sans-serif; min-width: 180px;">
          <b style="font-size: 1.1em; color: #333;">Hex Cell Analysis</b><br/>
          <small style="color: #888;">H3: ${d.h3}</small>
          <hr style="margin: 8px 0; border: 0; border-top: 1px solid #eee;"/>
          ${VIZ_CONFIG.criteria.map(c => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="color: rgb(${c.color.join(',')}); font-weight: bold;">● ${c.label}</span>
              <span>${d[c.key] == '1' ? 'Active' : '—'}</span>
            </div>
          `).join('')}
        </div>
      `
    };
  }
};
