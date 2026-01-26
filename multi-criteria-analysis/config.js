// config.js
const VIZ_CONFIG = {
  title: '📊 Professional MCA Dashboard',
  dataUrl: '/data/h3_binary_matrix.csv', 
  h3Field: 'h3',
  basemap: 'positron', // of 'dark' voor mooi heatmap contrast
  
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

  // --- BESTAANDE 3D STAVEN ---
  createLayer: (data, weights) => {
    return VIZ_CONFIG.criteria.map((c, index) => {
      return {
        id: `mca-stack-${index}`,
        data: data,
        extruded: true,
        pickable: true,
        elevationScale: 150,
        getHexagon: d => d.h3,
        coverage: 0.95,
        wireframe: false,
        
        // Transparant fix van vorige stap
        getFillColor: d => {
            const weight = weights[c.weightKey] || 0;
            const value = Number(d[c.key]) || 0;
            if (weight === 0 || value === 0) return [0, 0, 0, 0];
            return [...c.color, 255]; 
        },
        
        material: { ambient: 1.0, diffuse: 0.0, shininess: 0 },

        getElevation: d => {
          let sum = 0;
          for (let i = 0; i <= index; i++) {
            const crit = VIZ_CONFIG.criteria[i];
            sum += (Number(d[crit.key]) || 0) * (weights[crit.weightKey] || 0);
          }
          return sum;
        },

        updateTriggers: {
          getElevation: Object.values(weights),
          getFillColor: Object.values(weights)
        },
        transitions: { getElevation: 600, getFillColor: 600 }
      };
    }).reverse();
  },

  // --- NIEUW: CONTOURLIJN (BOUNDARY) ---
  createBoundaryLayer: (allH3Indices) => {
    // Magie: H3 berekent zelf de omtrek van de set hexagoon-ID's
    const polygon = h3.h3SetToMultiPolygon(allH3Indices, true);
    
    // Vormen naar GeoJSON
    const geoJsonData = {
      type: 'Feature',
      geometry: {
        type: 'MultiPolygon',
        coordinates: polygon
      }
    };

    return {
      id: 'region-boundary',
      data: [geoJsonData],
      stroked: true,
      filled: false,
      lineWidthMinPixels: 3,
      getLineColor: [50, 50, 50], // Donkergrijze rand
      getLineWidth: 3
    };
  },

  // --- NIEUW: HEATMAP ---
  createHeatmapLayer: (data, weights) => {
    return {
      id: 'mca-heatmap',
      data: data,
      // Heatmap heeft coördinaten nodig, geen H3 index. We rekenen dit 'on the fly' om.
      getPosition: d => {
        const [lat, lng] = h3.h3ToGeo(d.h3);
        return [lng, lat];
      },
      // De intensiteit is de som van alle gewogen criteria
      getWeight: d => {
        let sum = 0;
        VIZ_CONFIG.criteria.forEach(c => {
           sum += (Number(d[c.key]) || 0) * (weights[c.weightKey] || 0);
        });
        return sum;
      },
      radiusPixels: 40,
      intensity: 1,
      threshold: 0.05,
      aggregation: 'SUM',
      updateTriggers: {
        getWeight: Object.values(weights)
      }
    };
  },

  tooltip: (info) => {
    /* (Dezelfde tooltip code als je al had) */
    const d = info.object;
    if (!d || !d.h3) return null; // Check of d.h3 bestaat, anders is het misschien de boundary
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
