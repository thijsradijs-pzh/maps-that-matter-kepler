// config.js - Naadloos Gestapelde MCA Analyse (Zonder witte randen)
const VIZ_CONFIG = {
  title: '📊 Professional MCA Dashboard',
  dataUrl: '/data/h3_binary_matrix.csv', 
  h3Field: 'h3',
  basemap: 'positron',
  
  initialView: {
    longitude: 4.48, latitude: 51.90, zoom: 9.5, pitch: 45, bearing: 0
  },

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
        pickable: true,
        elevationScale: 150,
        getHexagon: d => d.h3,
        
        // --- NAADLOZE LOOK ---
        coverage: 0.95,        // Iets minder dan 1 om de kolommen van elkaar gescheiden te houden
        wireframe: false,      // VERWIJDERT DE WITTE RANDEN
        getFillColor: [...c.color, 255], // 100% ondoorzichtig voor strakke scheiding
        
        // Gebruik flat shading zodat de kleuren puur blijven
        material: {
          ambient: 1.0, 
          diffuse: 0.0,
          shininess: 0
        },

        // Hoogte van alleen dit specifieke blokje
        getElevation: d => (Number(d[c.key]) || 0) * (weights[c.weightKey] || 0),
        
        // Starthoogte: de som van alle blokjes onder dit index
        getOffset: d => {
          let currentOffset = 0;
          for (let i = 0; i < index; i++) {
            const prevCrit = VIZ_CONFIG.criteria[i];
            currentOffset += (Number(d[prevCrit.key]) || 0) * (weights[prevCrit.weightKey] || 0);
          }
          return currentOffset;
        },

        updateTriggers: {
          getElevation: Object.values(weights),
          getOffset: Object.values(weights)
        },

        transitions: {
          getElevation: 600,
          getOffset: 600
        }
      };
    }); 
  },

  tooltip: (info) => {
    const d = info.object;
    if (!d) return null;
    return {
      html: `
        <div style="padding: 12px; font-family: sans-serif; min-width: 180px; background: white; border-radius: 8px; color: #333; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
          <b style="font-size: 1.1em;">Analyse Groene Hart</b><br/>
          <small style="color: #888;">H3 Index: ${d.h3}</small>
          <hr style="margin: 8px 0; border: 0; border-top: 1px solid #eee;"/>
          ${VIZ_CONFIG.criteria.map(c => `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; ${d[c.key] != '1' ? 'opacity:0.3' : ''}">
              <span style="color: rgb(${c.color.join(',')}); font-weight: bold;">● ${c.label}</span>
              <span>${d[c.key] == '1' ? 'Actief' : '—'}</span>
            </div>
          `).join('')}
        </div>
      `
    };
  }
};
