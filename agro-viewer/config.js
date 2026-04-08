const VIZ_CONFIG = {
  initialView: {
    longitude: 5.6,
    latitude: 52.1,
    zoom: 8,
    pitch: 0,
    bearing: 0
  },
  basemap: 'positron',

  // NSO satellite layers — update here when new imagery is available
  nsoLayers: [
    { value: 'Pleiades-NEO-2024-5-RGB', label: '2024 - Mei (30cm Pleiades)' },
    { value: 'SuperView-2023-RGB',      label: '2023 - Zomer (50cm SuperView)' },
    { value: 'HogeResolutie-2022-RGB',  label: '2022 - Zomer' },
  ],

  colors: {
    default: [0, 122, 194, 200],
    highlight: [227, 0, 27, 200]
  }
};