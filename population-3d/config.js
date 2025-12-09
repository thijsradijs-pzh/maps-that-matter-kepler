// config.js - Population Visualization (3D with Time Series)
const VIZ_CONFIG = {
  
  // Basic info
  title: '👥 Population Over Time',
  dataUrl: '/data/subset.csv',
  h3Field: 'h3_id',
  basemap: 'dark',
  excludeEmpty: 'aantal_inwoners_sum',
  
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
      key: 'year',
      label: 'Year',
      min: 2018,
      max: 2023,
      step: 1,
      default: 2023,
      format: (val) => val.toString(),
      filterFn: (d, val) => {
        return parseInt(d.year_int) === val;
      }
    }
  ],
  
  // Tooltip configuration
  tooltip: (d) => {
    const pop = parseInt(d.aantal_inwoners_sum);
    const year = parseInt(d.year_int);
    const built = parseFloat(d.bebouwing_in_primair_bebouwd_gebied_fraction);
    
    return {
      html: `
        <div style="background: rgba(0, 0, 0, 0.9); color: white; padding: 12px; border-radius: 4px; box-shadow: 0 2px 12px rgba(0,0,0,0.3);">
          <strong style="color: #7BCCC4;">Year:</strong> ${year}<br>
          <strong style="color: #7BCCC4;">Population:</strong> ${pop.toLocaleString()}<br>
          ${!isNaN(built) ? `<strong style="color: #7BCCC4;">Built Area:</strong> ${(built * 100).toFixed(1)}%` : ''}
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
      title: 'Color: Population Density',
      items: [
        { color: 'rgb(237, 248, 251)', label: 'Very low (< 10)' },
        { color: 'rgb(204, 236, 230)', label: 'Low (10 - 50)' },
        { color: 'rgb(153, 216, 201)', label: 'Medium (50 - 100)' },
        { color: 'rgb(102, 194, 164)', label: 'High (100 - 200)' },
        { color: 'rgb(44, 162, 95)', label: 'Very high (200 - 500)' },
        { color: 'rgb(0, 109, 70)', label: 'Extremely high (> 500)' }
      ]
    },
    {
      title: 'Height: Population Count',
      description: 'Taller hexagons = more people living in that area'
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
      label: 'Total population',
      calculate: data => {
        if (!data || data.length === 0) return 0;
        return data.reduce((sum, d) => sum + (parseInt(d.aantal_inwoners_sum) || 0), 0);
      },
      format: total => total.toLocaleString()
    },
    {
      label: 'Average per hexagon',
      calculate: data => {
        if (!data || data.length === 0) return 0;
        const total = data.reduce((sum, d) => sum + (parseInt(d.aantal_inwoners_sum) || 0), 0);
        return total / data.length;
      },
      format: avg => Math.round(avg).toLocaleString()
    }
  ],
  
  // Layer creation function
  createLayer: (data, filters) => {
    return {
      id: 'population-3d',
      data: data,
      extruded: true,
      elevationScale: 50,
      getHexagon: d => d.h3_id,

      // Color based on population density with gradient
      getFillColor: d => {
        const pop = parseInt(d.aantal_inwoners_sum);
        if (isNaN(pop) || pop === 0) return [0, 0, 0, 0];
        
        // Graduated color scale for population
        if (pop < 10)   return [237, 248, 251, 180];  // very light
        if (pop < 50)   return [204, 236, 230, 200];  // light
        if (pop < 100)  return [153, 216, 201, 220];  // medium-light
        if (pop < 200)  return [102, 194, 164, 240];  // medium
        if (pop < 500)  return [44, 162, 95, 255];    // dark
        return [0, 109, 70, 255];                      // darkest
      },

      // Height based on population count
      getElevation: d => {
        const pop = parseInt(d.aantal_inwoners_sum);
        if (isNaN(pop)) return 0;
        // Use log scale for better visualization of varying population sizes
        return Math.log10(pop + 1) * 100;
      }
    };
  }
};
