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
      min: 0,
      max: 1,
      step: 0.01,
      default: 0.3,
      format: (val) => val.toFixed(2),
      filterFn: (d, val) => {
        const gh = parseFloat(d.groundheight) || 0;
        // Show hexagons where groundheight is greater than or equal to the slider value
        return gh >= val;
      }
    }
  ],
  
  // Legend configuration
  legend: [
    {
      title: 'Color: Ground Height',
      items: [
        { color: '#F0F9E8', label: 'Very low (< 0.2)' },
        { color: '#CCEBC5', label: 'Low (0.2 - 0.4)' },
        { color: '#A8DDB5', label: 'Medium (0.4 - 0.6)' },
        { color: '#7BCCC4', label: 'High (0.6 - 0.8)' },
        { color: '#43A2CA', label: 'Very high (> 0.8)' }
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
      label: 'About this view',
      calculate: data => {
        if (!data || data.length === 0) {
          return { visible: 0, avgHeight: 0 };
        }
        const visible = data.length;
        const avgHeight = data.reduce((sum, d) => sum + (parseFloat(d.groundheight) || 0), 0) / visible;
        return { visible, avgHeight };
      },
      format: result => {
        if (!result || result.visible === 0) {
          return 'Use the slider to filter hexagons by ground height. Higher values show areas with greater elevation.';
        }
        return (
          `Showing ${result.visible.toLocaleString()} hexagons with average ground height of ${result.avgHeight.toFixed(2)}.`
        );
      }
    }
  ],
  
  // Layer creation function
  createLayer: (data, filters) => {
    return {
      id: 'groundheight-3d',
      data: data,
      extruded: true,
      elevationScale: 2000,
      getHexagon: d => d.h3_id,

      // Color based on ground height value
      getFillColor: d => {
        const gh = parseFloat(d.groundheight) || 0;
        
        if (gh === 0) return [0, 0, 0, 0];  // transparent for no data
        
        // Green-blue gradient for ground height
        if (gh < 0.2)  return [240, 249, 232, 200];  // very light green
        if (gh < 0.4)  return [204, 235, 197, 220];  // light green
        if (gh < 0.6)  return [168, 221, 181, 240];  // medium green
        if (gh < 0.8)  return [123, 204, 196, 255];  // teal
        return [67, 162, 202, 255];                   // blue
      },

      // Height based on ground height value
      getElevation: d => {
        const gh = parseFloat(d.groundheight) || 0;
        return gh;  // elevationScale will make this visible
      }
    };
  }
};
