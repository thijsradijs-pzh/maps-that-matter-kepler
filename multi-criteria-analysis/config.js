// config.js - Stacked MCA Analysis (Strong 3D & Vibrant Colors)
const VIZ_CONFIG = {
  title: '📊 Stacked MCA Analysis',
  dataUrl: '/data/h3_binary_matrix.csv', 
  h3Field: 'h3',
  basemap: 'positron',
  
  initialView: {
    longitude: 4.48, latitude: 51.90, zoom: 9.5, pitch: 55, bearing: 10
  },

  // A more professional, distinct color palette
  criteria: [
    { key: 'verzilting', label: 'Verzilting', color: [0, 204, 150], weightKey: 'w_verzilting' },      // Teal
    { key: 'bodemdaling', label: 'Bodemdaling', color: [255, 102, 102], weightKey: 'w_bodemdaling' }, // Soft Red
    { key: 'wateroverlast', label: 'Wateroverlast', color: [25, 118, 210], weightKey: 'w_wateroverlast' }, // Deep Blue
    { key: 'boerenlandvogels', label: 'Boerenlandvogels', color: [255, 160, 0], weightKey: 'w_boerenlandvogels' }, // Amber
    { key: 'peilgebieden', label: 'Peilgebieden', color: [171, 71, 188], weightKey: 'w_peilgebieden' } // Purple
  ],
  
  filters: [
    { key: 'w_verzilting', label: 'Verzilting Weight', min: 0, max: 5, step: 1, default: 1, format: (v) => v, filterFn: () => true },
    { key: 'w_bodemdaling', label: 'Bodemdaling Weight', min: 0, max: 5, step: 1, default: 1, format: (v) => v, filterFn: () => true },
    { key: 'w_wateroverlast', label: 'Wateroverlast Weight', min: 0, max: 5, step: 1, default: 1, format: (v) => v, filterFn: () => true },
    { key: 'w_boerenlandvogels', label: 'Boerenlandvogels Weight', min: 0, max: 5, step: 1, default: 1, format: (v) => v, filterFn: () => true },
    { key: 'w_peilgebieden', label: 'Peilgebieden Weight', min: 0, max: 5, step: 1, default: 1, format: (v) => v, filterFn: () => true }
  ],

  createLayer: (data, weights) => {
    return VIZ_CONFIG.criteria.map((c, index) => {
      return {
        id: `mca-stack-${index}`,
        data: data,
        extruded: true,
        elevationScale: 300, // INCREASED for stronger height difference
        getHexagon: d => d.h3,
        getFillColor: [...c.color, 255],
        
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
    }).reverse(); 
  },

  tooltip: (info) => {
    const d = info.object;
    if (!d) return null;
    return {
      html: `
        <div style="padding: 10px; background: white; color: black; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
          <strong style="font-size: 14px;">H3: ${d.h3}</strong><br/><hr style="margin: 8px 0; border: 0; border-top: 1px solid #eee;"/>
          <div style="color: rgb(0, 204, 150)">Verzilting: ${d.verzilting == '1' ? 'Active' : 'None'}</div>
          <div style="color: rgb(255, 102, 102)">Bodemdaling: ${d.bodemdaling == '1' ? 'Active' : 'None'}</div>
          <div style="color: rgb(25, 118, 210)">Wateroverlast: ${d.wateroverlast == '1' ? 'Active' : 'None'}</div>
          <div style="color: rgb(255, 160, 0)">Boerenlandvogels: ${d.boerenlandvogels == '1' ? 'Active' : 'None'}</div>
          <div style="color: rgb(171, 71, 188)">Peilgebieden: ${d.peilgebieden == '1' ? 'Active' : 'None'}</div>
        </div>
      `
    };
  }
};
