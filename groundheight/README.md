# Ground Height Visualization 🏔️

A 3D hexagonal map visualization that filters and displays ground height data from your dataset.

## Features

- **Interactive Slider**: Filter hexagons by ground height value (range: 0.0 to 1.0)
- **Default Value**: Set to 0.3 by default
- **3D Visualization**: Hexagons are colored and elevated based on ground height values
- **Auto-rotate**: Optional camera rotation for better viewing angles
- **Real-time Statistics**: Shows count of visible hexagons and average ground height

## How It Works

The visualization uses the `groundheight` column from `data/subset.csv` to:
- **Color**: Green-to-blue gradient (lighter = lower, darker = higher)
- **Height**: Taller hexagons represent higher ground height values
- **Filter**: Only shows hexagons where ground height >= slider value

## Files

- `index.html` - Main visualization page
- `config.js` - Configuration for data, colors, and behavior

## Setup

1. Make sure you have a `data/subset.csv` file with:
   - `h3_id` column (hexagon identifiers)
   - `groundheight` column (values between 0 and 1)

2. Place the `groundheight` folder in your project structure:
   ```
   your-project/
   ├── data/
   │   └── subset.csv
   ├── shared/
   │   └── deckgl-utils.js
   └── groundheight/
       ├── index.html
       └── config.js
   ```

3. Open `index.html` in a web browser (or serve via a local web server)

## Customization

Edit `config.js` to customize:
- Slider range (min/max values)
- Default value
- Color scheme
- Initial camera position
- Elevation scaling

## Color Legend

- Very light green: < 0.2
- Light green: 0.2 - 0.4
- Medium green: 0.4 - 0.6
- Teal: 0.6 - 0.8
- Blue: > 0.8

## Controls

- **Slider**: Adjust minimum ground height to display
- **Auto-rotate**: Toggle automatic camera rotation
- **Mouse**: Click and drag to rotate, scroll to zoom

Enjoy exploring your ground height data! 🗺️
