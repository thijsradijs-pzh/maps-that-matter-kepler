// config.js
const VIZ_CONFIG = {
  title: 'ZH-PLG MCA Dashboard',
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

  // --- 3D STAVEN LAAG (Zonder Lighting) ---
  createLayer: (data, weights) => {
    return VIZ_CONFIG.criteria.map((c, index) => {
      return {
        id: `mca-stack-${index}`,
        data: data,
        extruded: true,
        pickable: true,
        elevationScale: 150,
        getHexagon: d => d.h3,
        coverage: 0.9,
        
        getFillColor: d => {
            const weight = weights[c.weightKey] || 0;
            const value = Number(d[c.key]) || 0;
            if (weight === 0 || value === 0) return [0, 0, 0, 0];
            return [...c.color, 255]; 
        },
        
        // VERWIJDERD: material property is weggehaald voor snelheid

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
        
        transitions: { 
            getElevation: 600, 
            getFillColor: 600 
        }
      };
    }).reverse();
  },

  // --- BOUNDARY ---
  createBoundaryLayer: (allH3Indices) => {
    const polygon = h3.h3SetToMultiPolygon(allH3Indices, true);
    return {
      id: 'region-boundary',
      data: [{
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates: polygon }
      }],
      stroked: true,
      filled: false,
      lineWidthMinPixels: 2,
      getLineColor: [80, 80, 80],
      getLineWidth: 2
    };
  },

  // --- HEATMAP ---
  createHeatmapLayer: (data, weights) => {
    return {
      id: 'mca-heatmap',
      data: data,
      getPosition: d => {
        const [lat, lng] = h3.h3ToGeo(d.h3);
        return [lng, lat];
      },
      getWeight: d => {
        let sum = 0;
        VIZ_CONFIG.criteria.forEach(c => {
           sum += (Number(d[c.key]) || 0) * (weights[c.weightKey] || 0);
        });
        return sum;
      },
      radiusPixels: 30,
      intensity: 1.5,
      threshold: 0.1,
      aggregation: 'SUM',
      colorRange: [
        [65, 182, 196],
        [127, 205, 187],
        [199, 233, 180],
        [237, 248, 177],
        [253, 187, 132],
        [227, 74, 51]
      ],
      updateTriggers: {
        getWeight: Object.values(weights)
      }
    };
  },

  // --- TOOLTIP ---
  tooltip: (info) => {
    const d = info.object;
    if (!d || !d.h3) return null;

    const currentW = window.currentWeights || {};
    let totalScore = 0;
    const scores = VIZ_CONFIG.criteria.map(c => {
      const w = currentW[c.weightKey] !== undefined ? currentW[c.weightKey] : 2;
      const val = Number(d[c.key]) || 0;
      const score = val * w;
      totalScore += score;
      return { ...c, score, val, w };
    });
    scores.sort((a, b) => b.score - a.score);

    return {
      style: {
        backgroundColor: '#fff',
        boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
        border: '1px solid #ddd',
        borderRadius: '6px',
        padding: '0',
        color: '#333',
        fontFamily: "'Segoe UI', Roboto, sans-serif",
        zIndex: 1000,
        pointerEvents: 'none'
      },
      html: `
        <div style="min-width: 240px;">
          <div style="background: #f8f9fa; padding: 12px 15px; border-bottom: 1px solid #eee; border-radius: 6px 6px 0 0;">
            <b style="color:#007ac2; font-size:14px;">Gebiedsanalyse</b><br/>
            <small style="color:#666; font-size:11px;">H3 Index: ${d.h3}</small><br/>
            <div style="margin-top:5px; font-size:12px;">Totale Score: <b>${totalScore}</b></div>
          </div>
          <div style="padding: 10px 15px;">
            ${scores.map(s => {
              const percentage = Math.min((s.score / 10) * 100, 100);
              return `
              <div style="margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; font-size: 12px;">
                <span style="width: 100px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color: ${s.val ? '#333' : '#aaa'};">
                  ${s.label} <span style="color:#ccc; font-size:10px;">(x${s.w})</span>
                </span>
                <div style="flex: 1; height: 6px; background: #f0f0f0; border-radius: 3px; margin: 0 10px; position: relative;">
                   <div style="
                      width: ${s.val === 0 ? 0 : percentage}%; 
                      height: 100%; 
                      background: rgb(${s.color.join(',')}); 
                      border-radius: 3px;
                      transition: width 0.3s;
                   "></div>
                </div>
                <span style="font-weight: 600; width: 20px; text-align: right; color: #555;">${s.score}</span>
              </div>
              `;
            }).join('')}
          </div>
        </div>
      `
    };
  }
};