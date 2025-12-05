// config.js - Population Over Time (3D)
const VIZ_CONFIG = {
  
  // Basic info
  title: '🗺️ Population Over Time',
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
      key: 'year',
      label: 'Year',
      min: 2018,
      max: 2023,
      step: 1,
      default: 2022,
      format: (val) => val,
      filterFn: (d, val) => Math.round(d.year_int) === val
    }
  ],
  

  
  // Legend configuration
  legend: [
    {
      title: 'Color: Population Density',
      items: [
        { color: '#4C0035', label: 'Low' },
        { color: '#B72F15', label: 'Medium' },
        { color: '#EF9100', label: 'High' },
        { color: '#FFC300', label: 'Very High' }
      ]
    },
    {
      title: 'Height: Building Fraction',
      description: 'Taller hexagons = more built-up area'
    }
  ],
  
  // Statistics to display
  stats: [
    {
      label: 'About this view',
      calculate: data => {
        // Try to derive the current year from the filtered data
        if (!data || data.length === 0) {
          return null;
        }

        // Adjust this field name if needed:
        const sample = data[0];
        const year = sample.year_int || sample.year || null;

        return year;
      },
      format: year => {
        if (!year) {
          return (
            'You are looking at a relative index (0–255) for population ' +
            'and built-up area. Darker, taller hexagons represent relatively higher values.'
          );
        }

        return (
          `You are looking at a relative index (0–255) for population ` +
          `and built-up area. Darker, taller hexagons represent relatively higher values in ${year}.`
        );
      }
    }
  ],
  
  // Layer creation function
  createLayer: (data, filters) => {
    return {
      id: 'population-3d',
      data,
      getHexagon: d => d.h3_id,

      // 🎨 Color: more defined at lower values, tuned for Positron
      getFillColor: d => {
        const pop = d.aantal_inwoners_sum ?? 0;
        const built = d.bebouwing_in_primair_bebouwd_gebied_fraction ?? 0;

        // 🔕 Don't show hex if either inhabitants OR built-up is 0
        // (still in data, just invisible)
        if (pop <= 0 || built <= 0) {
          return [0, 0, 0, 0]; // fully transparent
        }

        // Pop is 0–255 but we don't show that number, only use it internally
        const v = pop;

        // More nuance in the lower range – soft blues on Positron
        if (v < 32)   return [239, 246, 255];  // almost white
        if (v < 64)   return [222, 235, 247];
        if (v < 96)   return [198, 219, 239];
        if (v < 128)  return [158, 202, 225];
        if (v < 192)  return [107, 174, 214];
        return [33, 113, 181];                // darkest, still not too harsh
      },

      // 🏙 Elevation: also hide hexes with no signal
      getElevation: d => {
        const pop = d.aantal_inwoners_sum ?? 0;
        const built = d.bebouwing_in_primair_bebouwd_gebied_fraction ?? 0;

        if (pop <= 0 || built <= 0) {
          return 0; // flat / invisible (combined with transparent color)
        }

        return built * 1500; // keep your existing scale
      }
    };
  },

  
  // Tooltip function
  tooltip: (object) => {

    
    return DeckGLUtils.createTooltip(object, [
      { 
        key: 'aantal_inwoners_sum', 
        label: 'Population', 
        color: '#0066cc',
      },
      { 
        key: 'bebouwing_in_primair_bebouwd_gebied_fraction', 
        label: 'Built-up Area', 
        color: '#ff6600',
      },
      { key: 'year_int', label: 'Year' }
    ]);
  }
};
