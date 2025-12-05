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
  
  // Filters (interactive controls) - will be updated dynamically with actual data range
  filters: [
    {
      key: 'groundheight',
      label: 'Ground Height',
      min: -10,  // Will be updated from actual data
      max: 10,   // Will be updated from actual data
      step: 0.1,
      default: null,  // Will be set to 30th percentile
      format: (val) => val.toFixed(2),
      filterFn: (d, val) => {
        const gh = parseFloat(d.groundheight);
        if (isNaN(gh)) return false;
        // Show hexagons where groundheight is greater than or equal to the slider value
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
          <strong style="color: #43A2CA;">Ground Height:</strong> ${gh.toFixed(3)}
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
      description: 'Colors based on actual data distribution. Lighter = lower values, Darker = higher values'
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
          return { visible: 0, avgHeight: 0, minHeight: 0, maxHeight: 0 };
        }
        const values = data.map(d => parseFloat(d.groundheight)).filter(v => !isNaN(v));
        const visible = values.length;
        const avgHeight = values.reduce((sum, v) => sum + v, 0) / visible;
        const minHeight = Math.min(...values);
        const maxHeight = Math.max(...values);
        return { visible, avgHeight, minHeight, maxHeight };
      },
      format: result => {
        if (!result || result.visible === 0) {
          return 'Use the slider to filter hexagons by ground height. Higher values show areas with greater elevation.';
        }
        return (
          `Showing ${result.visible.toLocaleString()} hexagons | ` +
          `Avg: ${result.avgHeight.toFixed(2)} | ` +
          `Range: ${result.minHeight.toFixed(2)} - ${result.maxHeight.toFixed(2)}`
        );
      }
    }
  ],
  
  // Layer creation function
  createLayer: (data, filters) => {
    // Calculate min/max from actual data for color scaling
    const values = data.map(d => parseFloat(d.groundheight)).filter(v => !isNaN(v));
    
    if (values.length === 0) {
      return {
        id: 'groundheight-3d',
        data: [],
        extruded: false,
        getHexagon: d => d.h3_id,
        getFillColor: [0, 0, 0, 0],
        getElevation: 0
      };
    }
    
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal;
    
    // Calculate percentiles for better color distribution
    const sortedValues = [...values].sort((a, b) => a - b);
    const p20 = sortedValues[Math.floor(sortedValues.length * 0.2)];
    const p40 = sortedValues[Math.floor(sortedValues.length * 0.4)];
    const p60 = sortedValues[Math.floor(sortedValues.length * 0.6)];
    const p80 = sortedValues[Math.floor(sortedValues.length * 0.8)];
    
    return {
      id: 'groundheight-3d',
      data: data,
      extruded: true,
      elevationScale: 50,  // Adjust this to make hexagons taller/shorter
      getHexagon: d => d.h3_id,

      // Color based on ground height value using actual data distribution
      getFillColor: d => {
        const gh = parseFloat(d.groundheight);
        
        if (isNaN(gh)) return [0, 0, 0, 0];  // transparent for no data
        
        // Green-blue gradient based on percentiles
        if (gh < p20)  return [240, 249, 232, 200];  // very light green
        if (gh < p40)  return [204, 235, 197, 220];  // light green
        if (gh < p60)  return [168, 221, 181, 240];  // medium green
        if (gh < p80)  return [123, 204, 196, 255];  // teal
        return [67, 162, 202, 255];                   // blue
      },

      // Height based on actual ground height value (normalized to reasonable scale)
      getElevation: d => {
        const gh = parseFloat(d.groundheight);
        if (isNaN(gh)) return 0;
        
        // Normalize to 0-1 range based on data, then scale
        const normalized = range > 0 ? (gh - minVal) / range : 0;
        return normalized;  // elevationScale will make this visible
      }
    };
  }
};
