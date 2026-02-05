// config.js
const VIZ_CONFIG = {
  title: 'ZH-PLG MCA Dashboard',
  dataUrl: '/data/h3_binary_matrix.csv', 
  h3Field: 'h3',
  basemap: 'positron', // Dit is de standaard start-kaart (grijs)
  
  // Startpositie (Zuid-Holland)
  initialView: {
    longitude: 4.48, latitude: 51.90, zoom: 9.5, pitch: 45, bearing: 0
  },

  // De onderwerpen en hun basiskleuren
  criteria: [
    { key: 'verzilting', label: 'Verzilting', color: [0, 150, 136], weightKey: 'w_verzilting' },
    { key: 'bodemdaling', label: 'Bodemdaling', color: [239, 83, 80], weightKey: 'w_bodemdaling' },
    { key: 'wateroverlast', label: 'Wateroverlast', color: [30, 136, 229], weightKey: 'w_wateroverlast' },
    { key: 'boerenlandvogels', label: 'Boerenlandvogels', color: [255, 179, 0], weightKey: 'w_boerenlandvogels' },
    { key: 'peilgebieden', label: 'Peilgebieden', color: [142, 68, 173], weightKey: 'w_peilgebieden' }
  ],
  
  // De sliders instellingen
  filters: [
    { key: 'w_verzilting', label: 'Verzilting Weight', min: 0, max: 10, step: 1, default: 2 },
    { key: 'w_bodemdaling', label: 'Bodemdaling Weight', min: 0, max: 10, step: 1, default: 2 },
    { key: 'w_wateroverlast', label: 'Wateroverlast Weight', min: 0, max: 10, step: 1, default: 2 },
    { key: 'w_boerenlandvogels', label: 'Boerenlandvogels Weight', min: 0, max: 10, step: 1, default: 2 },
    { key: 'w_peilgebieden', label: 'Peilgebieden Weight', min: 0, max: 10, step: 1, default: 2 }
  ],

  // --- 3D STAVEN LAAG (Geoptimaliseerd: Geen schaduwen) ---
  createLayer: (data, weights) => {
    return VIZ_CONFIG.criteria.map((c, index) => {
      return {
        id: `mca-stack-${index}`,
        data: data,
        extruded: true,
        pickable: true, // Nodig voor tooltip
        elevationScale: 150, // Hoogte factor
        getHexagon: d => d.h3,
        coverage: 0.9, // Ruimte tussen hexjes
        
        // Kleur en Transparantie logica
        getFillColor: d => {
            const weight = weights[c.weightKey] || 0;
            const value = Number(d[c.key]) || 0;
            // Als gewicht of waarde 0 is, maak volledig transparant
            if (weight === 0 || value === 0) return [0, 0, 0, 0];
            return [...c.color, 255]; 
        },
        
        // PERFORMANCE FIX: 'material' is verwijderd voor snellere rendering (Flat Shading)

        // Stapel hoogte berekening
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
        
        // Smooth animaties als je aan een slider trekt
        transitions: { 
            getElevation: 600, 
            getFillColor: 600 
        }
      };
    }).reverse(); // Reverse zorgt dat de juiste laag bovenop ligt voor picking
  },

  // --- OMTREKLIJN (BOUNDARY) ---
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
      getLineColor: [80, 80, 80], // Donkergrijze rand
      getLineWidth: 2
    };
  },

  // --- HEATMAP LAAG ---
  createHeatmapLayer: (data, weights) => {
    return {
      id: 'mca-heatmap',
      data: data,
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
      radiusPixels: 30,
      intensity: 1.5,
      threshold: 0.1,   // Filtert ruis weg
      aggregation: 'SUM',
      
      // Professioneel kleurverloop (Matches de HTML legenda)
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

  // --- ESRI STIJL POPUP ---
  tooltip: (info) => {
    const d = info.object;
    if (!d || !d.h3) return null;

    // We proberen de sliders uit de window scope te lezen (die wordt geüpdatet in index.html)
    const currentW = window.currentWeights || {};

    // Bereken scores voor de grafiek
    let totalScore = 0;
    const scores = VIZ_CONFIG.criteria.map(c => {
      const w = currentW[c.weightKey] !== undefined ? currentW[c.weightKey] : 2;
      const val = Number(d[c.key]) || 0;
      const score = val * w;
      totalScore += score;
      return { ...c, score, val, w };
    });

    // Sorteren: hoogste invloed bovenaan
    scores.sort((a, b) => b.score - a.score);

    return {
      style: {
        backgroundColor: 'transparent', // Transparant omdat we de styling in HTML doen
        padding: 0,
        margin: 0,
        boxShadow: 'none',
        pointerEvents: 'none' // Voorkomt flikkeren als je eroverheen gaat
      },
      html: `
        <div style="
            width: 260px; 
            background: white; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.25); 
            font-family: 'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            border-radius: 2px;
            overflow: hidden;
            position: relative;
        ">
          <div style="background: #007ac2; padding: 10px 15px; color: white; display: flex; justify-content: space-between; align-items: center;">
            <b style="font-size:14px;">Informatie</b>
            <span style="font-size:16px;">&times;</span>
          </div>

          <div style="background: #f8f8f8; padding: 8px 15px; border-bottom: 1px solid #eee; color: #666; font-size: 11px;">
            Hexagon ID: <b>${d.h3}</b>
          </div>
          
          <div style="padding: 15px; max-height: 200px; overflow-y: auto;">
            <div style="margin-bottom: 10px; font-size: 13px; color: #333;">
              Totale MCA Score: <b style="color:#007ac2;">${totalScore}</b>
            </div>

            ${scores.map(s => {
              // Max breedte berekenen (arbitrair op max gewicht 10 * 1 = 10 -> 100%)
              const percentage = Math.min((s.score / 10) * 100, 100);
              
              // Alleen tonen als waarde relevant is
              if (s.val === 0) return '';
              
              return `
              <div style="margin-bottom: 6px; display: flex; align-items: center; font-size: 11px;">
                <div style="width: 90px; color: #555;">${s.label}</div>
                <div style="flex: 1; height: 6px; background: #eee; margin: 0 8px;">
                   <div style="width: ${percentage}%; height: 100%; background: rgb(${s.color.join(',')});"></div>
                </div>
                <div style="width: 20px; text-align: right; font-weight: bold; color: #333;">${s.score}</div>
              </div>
              `;
            }).join('')}
          </div>
          
          <div style="
            position: absolute; 
            bottom: -6px; 
            left: 50%; 
            margin-left: -6px; 
            width: 12px; 
            height: 12px; 
            background: white; 
            transform: rotate(45deg); 
            box-shadow: 2px 2px 2px rgba(0,0,0,0.1);
            z-index: -1;
          "></div>
        </div>
      `
    };
  }
};