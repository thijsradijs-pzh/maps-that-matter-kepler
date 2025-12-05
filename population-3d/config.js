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
    // Get min/max for color scaling (only where population > 0)
    const populations = data
      .map(d => d.aantal_inwoners_sum)
      .filter(p => p > 0);
    const minPop = populations.length > 0 ? Math.min(...populations) : 0;
    const maxPop = populations.length > 0 ? Math.max(...populations) : 100;

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

      // If both 0 → fully transparent
      getFillColor: d => {
        const v = d.aantal_inwoners_sum ?? 0;   // use your normalized inhabitants field
        return DeckGLUtils.getColorFromScale(v, 'populationOnLight');
      },

      // If both 0 → flat
      getElevation: d => {
        if (!hasAnyValue(d)) return 0;
        return (d.bebouwing_in_primair_bebouwd_gebied_fraction || 0) * 0.01;
        // or your new scale: * 0.01 etc.
      },

      updateTriggers: {
        getFillColor: [filters.year, minPop, maxPop],
        getElevation: [filters.year]
      }
    };
  },

  
  // Tooltip function
  tooltip: (object) => {
    const buildingFraction = (object.bebouwing_in_primair_bebouwd_gebied_fraction || 0);
    const buildingPercent = (buildingFraction * 100).toFixed(1);
    
    return DeckGLUtils.createTooltip(object, [
      { 
        key: 'aantal_inwoners_sum', 
        label: 'Population', 
        color: '#0066cc',
        format: (v) => DeckGLUtils.formatNumber(v)
      },
      { 
        key: 'bebouwing_in_primair_bebouwd_gebied_fraction', 
        label: 'Built-up Area', 
        color: '#ff6600',
        format: (v) => `${(v * 100).toFixed(1)}%`
      },
      { key: 'year_int', label: 'Year' },
      { 
        key: 'aantal_mannen_sum', 
        label: 'Men',
        format: (v) => DeckGLUtils.formatNumber(v)
      },
      { 
        key: 'aantal_vrouwen_sum', 
        label: 'Women',
        format: (v) => DeckGLUtils.formatNumber(v)
      }
    ]);
  }
};
