// config.js - Professional Stacked MCA Analysis (Clean Colors & Border Frame)
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
    // We sorteren de criteria zo dat de volgorde van stapelen logisch is
    return VIZ_CONFIG.criteria.map((c, index) => {
      return {
        id: `mca-stack-${index}`,
        data: data,
        extruded: true,
        pickable: true,
        elevationScale: 150, 
        getHexagon: d => d.h3,
        
        // --- DE VISUELE VERBETERING ---
        // 1. Breedte aanpassen: Hoe hoger de laag (index), hoe smaller de hexagon.
        // Laag 0 is 95% breed, laag 1 is 80%, laag 2 is 65%, etc.
        coverage: 0.95 - (index * 0.12), 

        // 2. Kleur & Helderheid: 
        // We gebruiken een hoge opacity (230) zodat de kleuren eruit springen.
        getFillColor: [...c.color, 230], 

        // 3. Draadframe (de witte randjes):
        // Dit is essentieel om de "treden" van de trap te accentueren.
        wireframe: true,
        getLineColor: [255, 255, 255, 100], // Iets fellere witte randjes
        lineWidthMinPixels: 1,
         
        // 4. Geen schaduw (Flat look):
        // Hierdoor blijft de zijkant exact dezelfde kleur als de bovenkant.
        material: {
          ambient: 1.0, 
          diffuse: 0.0,
          shininess: 0
        },

        // Bereken de hoogte: dit blijft de cumulatieve som
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
          getElevation: {
            duration: 800,
            easing: d3.easeCubicInOut
          }
        }
      };
    }).reverse(); // Reverse zorgt dat de onderste lagen als eerste getekend worden
  },

  tooltip: (info) => {
    const d = info.object;
    if (!d) return null;
    return {
      html: `
        <div style="padding: 12px; font-family: sans-serif; min-width: 180px; background: white; border-radius: 8px; color: #333; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
          <b style="font-size: 1.1em;">Hex Cell Analysis</b><br/>
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
