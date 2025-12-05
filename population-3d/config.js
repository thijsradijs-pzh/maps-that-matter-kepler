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
      title: 'Color: Population (relative)',
      items: [
        { color: '#EFF6FF', label: 'Very low' },
        { color: '#DEEBF7', label: 'Low' },
        { color: '#C6DBEF', label: 'Medium' },
        { color: '#6BAED6', label: 'High' },
        { color: '#2171B5', label: 'Very high' }
      ]
    },
    {
      title: 'Height: Building Fraction',
      description: 'Taller hexagons = relatively more built-up area'
    }
  ],
  
  // Statistics to display (narrative only, no raw numbers)
  stats: [
    {
      label: 'About this view',
      calculate: data => {
        if (!data || data.length === 0) {
          return null;
        }
        const sample = data[0];
        const year = sample.year_int || sample.year || null;
        return year;
      },
      format: year => {
        if (!year) {
          return (
            'This map shows relative differences between hexagons. ' +
            'Darker, taller hexagons indicate relatively higher values.'
          );
        }

        return (
          `This map shows relative differences between hexagons in ${year}. ` +
          'Darker, taller hexagons indicate relatively higher values.'
        );
      }
    }
  ],
  
  // Layer creation function
  createLayer: (data, filters) => {
    // Helper: does this hex have *any* signal?
    const hasAnyValue = (d) => {
      const pop = d.aantal_inwoners_sum || 0;
      const beb = d.bebouwing_in_primair_bebouwd_gebied_fraction || 0;
      return pop > 0 || beb > 0;
    };

    return {
      id: 'population-3d',
      data: data,
      extruded: true,
      elevationScale: 1000,
      getHexagon: d => d.h3_id,

      // If both values 0 → fully transparent
      // Use subtle blue ramp tuned for Positron
      getFillColor: d => {
        if (!hasAnyValue(d)) return [0, 0, 0, 0];  // rgba, alpha = 0

        const pop = d.aantal_inwoners_sum || 0;
        const v = Math.max(0, Math.min(255, pop)); // clamp 0–255

        if (v < 32)   return [239, 246, 255];  // very very light
        if (v < 64)   return [222, 235, 247];
        if (v < 96)   return [198, 219, 239];
        if (v < 128)  return [158, 202, 225];
        if (v < 192)  return [107, 174, 214];
        return [33, 113, 181];                 // darkest, still not screaming
      },

      // If both 0 → flat
      getElevation: d => {
        if (!hasAnyValue(d)) return 0;
        return (d.bebouwing_in_primair_bebouwd_gebied_fraction || 0) * 0.01;
        // elevationScale above will make this visible
      }
    };
  }
};
