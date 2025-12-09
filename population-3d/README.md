# Population 3D Visualization

Interactive 3D visualization of population data over time using H3 hexagons.

## Features

- 🗺️ **Interactive 3D Map** - Explore population density in 3D
- ⏱️ **Time Series** - Slider to view data from 2018-2023
- 🎨 **Color Coding** - Population density shown by color
- 📊 **Real-time Stats** - See total population and averages
- 🖱️ **Click to Activate** - Prevents accidental scrolling
- 🖥️ **Fullscreen Mode** - Immersive exploration

## Data Fields

- `h3_id` - H3 hexagon identifier
- `year_int` - Year (2018-2023)
- `aantal_inwoners_sum` - Population count
- `bebouwing_in_primair_bebouwd_gebied_fraction` - Built area fraction

## Color Scale

- Very light: < 10 people
- Light: 10-50 people
- Medium: 50-100 people
- High: 100-200 people
- Very high: 200-500 people
- Extremely high: > 500 people

## Height Scale

Hexagon height represents population count (logarithmic scale for better visualization).

## Usage

1. Open `index.html` in a browser
2. Click "Activate Map" to start interacting
3. Use the year slider to see population changes over time
4. Hover over hexagons for detailed information
5. Click fullscreen button for immersive view

## Files

- `index.html` - Main visualization page
- `config.js` - Configuration and data settings
- `README.md` - This file

## Data Source

Population data aggregated to H3 resolution 9 hexagons.

---

**Enhanced with Click-to-Activate and Fullscreen features**
