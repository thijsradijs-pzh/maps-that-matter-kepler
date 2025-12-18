// config.js - Naadloos Gestapelde MCA Analyse
const VIZ_CONFIG = {
  title: '📊 Professional MCA Dashboard',
  dataUrl: '/data/h3_binary_matrix.csv', 
  h3Field: 'h3',
  basemap: 'positron',
  
  initialView: {
    longitude: 4.48, latitude: 51.90, zoom: 9.5, pitch: 45, bearing: 0
  },

  criteria: [
    { key: 'verzilting', label: 'Verzilting', color: [0, 150, 136], weightKey: 'w_verzilting' },
    { key: 'bodemdaling', label: 'Bodemdaling', color: [239, 83, 80], weightKey: 'w_bodemdaling' },
    { key: 'wateroverlast', label: 'Wateroverlast', color: [30, 136, 229], weightKey: 'w_wateroverlast' },
    { key: 'boerenlandvogels', label: 'Boerenlandvogels', color: [255, 179, 0], weightKey: 'w_boerenlandvogels' },
    { key: 'peilgebieden', label: 'Peilgebieden', color: [142, 68, 173], weightKey: 'w_peilgebieden' }
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
        
        // --- STYLING ---
        coverage: 0.95,        // Iets ruimte tussen de kolommen voor contrast
        wireframe: false,      // VERWIJDERT DE WITTE RANDEN
        getFillColor: [...c.color, 255], // 100% ondoorzichtig voor strakke scheiding
        
        material: {
          ambient: 1.0,        // Zorgt dat de kleuren overal gelijk en fel zijn
          diffuse: 0.0,
          shininess: 0
        },

        // DE TRUC: Bereken de cumulatieve hoogte (deze laag + alles eronder)
        getElevation: d => {
          let sum = 0;
          for (let i = 0; i <= index; i++) {
            const crit = VIZ_CONFIG.criteria[i];
            sum += (Number(d[crit.key]) || 0) * (weights[crit.weightKey] || 0);
          }
          return sum;
        },

        updateTriggers: {
          getElevation: Object.values(weights)
        },

        transitions: {
          getElevation: 600
        }
      };
    }).reverse(); // CRUCIAAL: Teken de langste staaf eerst, de kortere staven dekken de basis af.
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
