// config.js - Population Over Time (3D)

// Single source of truth for color thresholds — used by both legend and getFillColor
const COLOR_THRESHOLDS = [
  { max: 5,        rgb: [239, 246, 255], hex: '#EFF6FF', label: '< 5' },
  { max: 25,       rgb: [222, 235, 247], hex: '#DEEBF7', label: '5 – 25' },
  { max: 55,       rgb: [198, 219, 239], hex: '#C6DBEF', label: '25 – 55' },
  { max: 100,      rgb: [158, 202, 225], hex: '#9ECAE1', label: '55 – 100' },
  { max: 165,      rgb: [107, 174, 214], hex: '#6BAED6', label: '100 – 165' },
  { max: Infinity, rgb: [33,  113, 181], hex: '#2171B5', label: '≥ 165' },
];

const VIZ_CONFIG = {
  
  // Basic info
  title: '🗺️ Population vs Built-up Over Time',
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
      title: 'Color: Population (inwoners/hexagoon)',
      items: COLOR_THRESHOLDS.map(t => ({ color: t.hex, label: t.label }))
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
        if (!hasAnyValue(d)) return [0, 0, 0, 0];
        const v = Math.max(0, d.aantal_inwoners_sum || 0);
        const t = COLOR_THRESHOLDS.find(t => v < t.max);
        return t ? t.rgb : COLOR_THRESHOLDS[COLOR_THRESHOLDS.length - 1].rgb;
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
