// config.js - Interactive Data Explorer (3D) - Parquet Version
const VIZ_CONFIG = {
  
  // Basic info
  title: '🔍 Data Explorer',
  dataUrl: '/data/volledige_tijdreeks_met_namen.parquet',
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
  
  // Default selections
  defaults: {
    year: 2023,
    heightColumn: 'aantal_inwoners_sum',
    colorColumn: 'groundheight'
  },
  
  // Column groups for dropdowns
  columnGroups: {
    population: {
      label: 'Population',
      columns: [
        { value: 'aantal_inwoners_sum', label: 'Population Total' },
        { value: 'aantal_mannen_sum', label: 'Population Male' },
        { value: 'aantal_vrouwen_sum', label: 'Population Female' },
        { value: 'aantal_inwoners_0_tot_15_jaar_sum', label: 'Age 0-15' },
        { value: 'aantal_inwoners_15_tot_25_jaar_sum', label: 'Age 15-25' },
        { value: 'aantal_inwoners_25_tot_45_jaar_sum', label: 'Age 25-45' },
        { value: 'aantal_inwoners_45_tot_65_jaar_sum', label: 'Age 45-65' },
        { value: 'aantal_inwoners_65_jaar_en_ouder_sum', label: 'Age 65+' },
        { value: 'aantal_geboorten_sum', label: 'Births' }
      ]
    },
    housing: {
      label: 'Housing',
      columns: [
        { value: 'aantal_woningen_sum', label: 'Total Dwellings' },
        { value: 'aantal_part_huishoudens_sum', label: 'Households' },
        { value: 'aantal_eenpersoonshuishoudens_sum', label: 'Single Person Households' },
        { value: 'aantal_meergezins_woningen_sum', label: 'Multi-family Dwellings' },
        { value: 'aantal_huurwoningen_in_bezit_woningcorporaties_sum', label: 'Social Housing' },
        { value: 'gemiddelde_woz_waarde_woning_area_weighted_average', label: 'Avg Property Value (WOZ)' },
        { value: 'gemiddeld_gasverbruik_woning_area_weighted_average', label: 'Avg Gas Usage' },
        { value: 'gemiddeld_elektriciteitsverbruik_woning_area_weighted_average', label: 'Avg Electricity Usage' }
      ]
    },
    demographics: {
      label: 'Demographics',
      columns: [
        { value: 'mediaan_inkomen_huishouden_area_weighted_average', label: 'Median Income' },
        { value: 'percentage_nederlandse_achtergrond_area_weighted_average', label: '% Dutch Background' },
        { value: 'percentage_niet_westerse_migr_achtergr_area_weighted_average', label: '% Non-Western Background' },
        { value: 'percentage_westerse_migr_achtergr_area_weighted_average', label: '% Western Background' },
        { value: 'gemiddelde_huishoudensgrootte_area_weighted_average', label: 'Avg Household Size' },
        { value: 'percentage_koopwoningen_area_weighted_average', label: '% Owner-occupied' },
        { value: 'percentage_huurwoningen_area_weighted_average', label: '% Rental' }
      ]
    },
    amenities: {
      label: 'Amenities',
      columns: [
        { value: 'grote_supermarkt_aantal_binnen_1_km_max', label: 'Supermarkets <1km' },
        { value: 'grote_supermarkt_aantal_binnen_3_km_max', label: 'Supermarkets <3km' },
        { value: 'dichtstbijzijnde_grote_supermarkt_afstand_in_km_min', label: 'Distance to Supermarket' },
        { value: 'dichtstbijzijnde_huisartsenpraktijk_afstand_in_km_min', label: 'Distance to GP' },
        { value: 'dichtstbijzijnde_basisonderwijs_afstand_in_km_min', label: 'Distance to Primary School' },
        { value: 'dichtstbijzijnde_treinstation_afstand_in_km_min', label: 'Distance to Train Station' },
        { value: 'dichtstbijzijnde_oprit_hoofdverkeersweg_afstand_in_km_min', label: 'Distance to Highway' },
        { value: 'cafe_aantal_binnen_1_km_max', label: 'Cafes <1km' },
        { value: 'restaurant_aantal_binnen_1_km_max', label: 'Restaurants <1km' }
      ]
    },
    landuse: {
      label: 'Land Use',
      columns: [
        { value: 'bebouwing_in_primair_bebouwd_gebied_fraction', label: 'Built-up Area (Primary)' },
        { value: 'wegen_en_spoorwegen_fraction', label: 'Roads & Railways' },
        { value: 'gras_in_primair_bebouwd_gebied_fraction', label: 'Grass (Urban)' },
        { value: 'loofbos_fraction', label: 'Deciduous Forest' },
        { value: 'naaldbos_fraction', label: 'Coniferous Forest' },
        { value: 'agrarisch_gras_fraction', label: 'Agricultural Grass' },
        { value: 'zoet_water_fraction', label: 'Freshwater' },
        { value: 'natuurgraslanden_fraction', label: 'Natural Grasslands' }
      ]
    },
    environment: {
      label: 'Environment',
      columns: [
        { value: 'groundheight', label: 'Ground Height' },
        { value: 'geluid_lden', label: 'Noise Level (LDEN)' },
        { value: 'groenklasse', label: 'Green Class' },
        { value: 'soortenrijkdomsklasse', label: 'Species Richness' },
        { value: 'hitte', label: 'Heat' },
        { value: 'waterberging', label: 'Water Storage' },
        { value: 'lichtemissie', label: 'Light Emission' }
      ]
    }
  },
  
  // Filters (year slider)
  filters: [
    {
      key: 'year',
      label: 'Year',
      min: 2018,
      max: 2023,
      step: 1,
      default: 2023,
      format: (val) => val,
      filterFn: (d, val) => Math.round(d.year_int) === val
    }
  ],
  
  // Get all columns as flat array
  getAllColumns: function() {
    const cols = [];
    for (const groupKey in this.columnGroups) {
      cols.push(...this.columnGroups[groupKey].columns);
    }
    return cols;
  },
  
  // Get column label
  getColumnLabel: function(value) {
    const allCols = this.getAllColumns();
    const col = allCols.find(c => c.value === value);
    return col ? col.label : value;
  },
  
  // Dynamic tooltip based on selected columns
  createTooltip: function(heightCol, colorCol) {
    return (d) => {
      const year = d.year_int || '?';
      const heightVal = parseFloat(d[heightCol]);
      const colorVal = parseFloat(d[colorCol]);
      const heightLabel = this.getColumnLabel(heightCol);
      const colorLabel = this.getColumnLabel(colorCol);
      
      return {
        html: `
          <div style="background: rgba(0, 0, 0, 0.9); color: white; padding: 12px; border-radius: 4px; box-shadow: 0 2px 12px rgba(0,0,0,0.3);">
            <strong style="color: #7BCCC4;">Year:</strong> ${year}<br>
            <strong style="color: #7BCCC4;">${heightLabel}:</strong> ${!isNaN(heightVal) ? heightVal.toFixed(2) : 'N/A'}<br>
            <strong style="color: #7BCCC4;">${colorLabel}:</strong> ${!isNaN(colorVal) ? colorVal.toFixed(2) : 'N/A'}
          </div>
        `,
        style: {
          fontSize: '12px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }
      };
    };
  },
  
  // Dynamic layer creation based on selected columns
  createLayer: (data, filters, heightCol, colorCol) => {
    // Calculate statistics for color scaling
    const values = data.map(d => parseFloat(d[colorCol])).filter(v => !isNaN(v) && v > 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    
    // Calculate height statistics
    const heightValues = data.map(d => parseFloat(d[heightCol])).filter(v => !isNaN(v) && v > 0);
    const heightMax = Math.max(...heightValues);
    
    return {
      id: 'explorer-3d',
      data: data,
      extruded: true,
      elevationScale: 50,
      getHexagon: d => d.h3_id,
      
      // Dynamic color based on selected column
      getFillColor: d => {
        const val = parseFloat(d[colorCol]);
        if (isNaN(val) || val === 0) return [200, 200, 200, 100]; // Gray for missing/zero
        
        // Normalize to 0-1 range
        const normalized = (val - min) / range;
        
        // Blue-purple gradient
        if (normalized < 0.2)  return [237, 248, 251, 180];
        if (normalized < 0.4)  return [179, 205, 227, 200];
        if (normalized < 0.6)  return [140, 150, 198, 220];
        if (normalized < 0.8)  return [136, 86, 167, 240];
        return [129, 15, 124, 255];
      },
      
      // Dynamic height based on selected column
      getElevation: d => {
        const val = parseFloat(d[heightCol]);
        if (isNaN(val) || val === 0) return 0;
        // Normalize height (0-1 range relative to max)
        return (val / heightMax) * 100;
      }
    };
  }
};
