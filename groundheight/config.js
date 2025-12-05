// config.js - Ground Height Visualization (3D)
const VIZ_CONFIG = {
  
  // Basic info
  title: '🏔️ Ground Height Filter',
  dataUrl: '/data/subset.csv',
  h3Field: 'h3_id',
  basemap: 'positron',
  
  // Initial view state
  initialView: {
    longitude: 4.44,
    latitude: 51.99,
    zoom: 9.5,
    pitch: 50,
    bearing: 20,
    minZoom: 3,
    maxZoom: 15
  },
  
  // Filters (interactive controls)
  filters: [
    {
      key: 'groundheight',
      label: 'Ground Height',
      min: -10,
      max: 40,
      step: 0.5,
      default: 0,
      format: (val) => val.toFixed(1),
      filterFn: (d, val) => {
        const gh = parseFloat(d.groundheight);
        if (isNaN(gh)) return false;
        return gh >= val;
      }
    }
  ],
  
  // Tooltip configuration
  tooltip: (d) => {
    const gh = parseFloat(d.groundheight);
    if (isNaN(gh)) return null;
    
    return {
      html: `
        <div style="background: white; padding: 8px 12px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
          <strong style="color: #43A2CA;">Ground Height:</strong> ${gh.toFixed(2)}
        </div>
      `,
      style: {
        fontSize: '12px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }
    };
  },
  
  // Legend configuration
  legend: [
    {
      title: 'Color: Ground Height',
      items: [
        { color: '#F0F9E8', label: 'Very low (< 0)' },
        { color: '#CCEBC5', label: 'Low (0 - 10)' },
        { color: '#A8DDB5', label: 'Medium (10 - 20)' },
        { color: '#7BCCC4', label: 'High (20 - 30)' },
        { color: '#43A2CA', label: 'Very high (> 30)' }
      ]
    },
    {
      title: 'Height: Ground Height Value',
      description: 'Taller hexagons = higher ground height values'
    }
  ],
  
  // Statistics to display
  stats: [
    {
      label: 'Visible hexagons',
      calculate: data => {
        if (!data || data.length === 0) return 0;
        return data.length;
      },
      format: count => count.toLocaleString()
    },
    {
      label: 'Average height',
      calculate: data => {
        if (!data || data.length === 0) return 0;
        const values = data.map(d => parseFloat(d.groundheight)).filter(v => !isNaN(v));
        return values.reduce((sum, v) => sum + v, 0) / values.length;
      },
      format: avg => avg.toFixed(2)
    }
  ],
  
  // Layer creation function
  createLayer: (data, filters) => {
    return {
      id: 'groundheight-3d',
      data: data,
      extruded: true,
      elevationScale: 100,
      getHexagon: d => d.h3_id,

      // Color based on ground height value with fixed thresholds
      getFillColor: d => {
        const gh = parseFloat(d.groundheight);
        if (isNaN(gh)) return [0, 0, 0, 0];
        
        if (gh < 0)   return [240, 249, 232, 200];  // very light green
        if (gh < 10)  return [204, 235, 197, 220];  // light green
        if (gh < 20)  return [168, 221, 181, 240];  // medium green
        if (gh < 30)  return [123, 204, 196, 255];  // teal
        return [67, 162, 202, 255];                  // blue
      },

      // Height based on actual value (normalized to -10 to 40 range)
      getElevation: d => {
        const gh = parseFloat(d.groundheight);
        if (isNaN(gh)) return 0;
        // Normalize from -10 to 40 range to 0-1
        return (gh + 10) / 50;
      }
    };
  }
};
