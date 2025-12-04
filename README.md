# Maps That Matter - Kepler.gl Examples on Vercel

Deploy multiple interactive Kepler.gl visualizations with clean URLs for iframe embedding in blog posts.

## 🚀 Quick Start

### Current Examples
- **Year Population**: [/year-population](https://maps.mapsthatmatter.io/year-population)

## 📁 Project Structure

```
/
├── year-population/
│   └── index.html          # First example
├── data/
│   └── subset.csv          # Shared or example-specific data
├── config/
│   └── year_example.json   # Kepler.gl configurations
├── vercel.json             # Routing configuration
└── README.md               # This file
```

## ✨ Adding a New Example

### Option 1: Quick Clone Method

1. **Copy an existing example directory:**
```bash
cp -r year-population/ my-new-example/
```

2. **Update the EXAMPLES object in `my-new-example/index.html`:**
```javascript
const EXAMPLES = {
  'my-new-example': {
    dataFile: 'data/my-data.csv',        // ← Your new data file
    configFile: 'config/my-config.json',  // ← Your new config
    datasetId: 'unique-id-123',           // ← Match your Kepler config
    datasetLabel: 'My Awesome Map'        // ← Display name
  }
};
```

3. **Add your data and config files:**
   - Place CSV in `data/my-data.csv`
   - Export Kepler config and save to `config/my-config.json`

4. **Commit and deploy:**
```bash
git add .
git commit -m "Add my-new-example visualization"
git push
```

### Option 2: Using Shared Data with Different Configs

If you want multiple visualizations of the same dataset:

1. Create new directory: `population-by-age/`
2. Copy `index.html` from existing example
3. Point to same data but different config:
```javascript
const EXAMPLES = {
  'population-by-age': {
    dataFile: 'data/subset.csv',              // ← Same data
    configFile: 'config/age-breakdown.json',  // ← Different config
    datasetId: 'qkkkoy',
    datasetLabel: 'Population by Age Group'
  }
};
```

## 📤 Exporting Kepler.gl Config

1. Open Kepler.gl and load your data
2. Configure your visualization (layers, filters, colors, etc.)
3. Click the **Share** button (top right)
4. Click **Export Map** → **Export current map**
5. Choose **JSON** format
6. Save to `config/your-example-name.json`

⚠️ **Important:** Make sure the `dataId` in your config matches the `datasetId` in your HTML!

## 🔧 Deployment

### Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Or deploy to production
vercel --prod
```

### Using Vercel Dashboard

1. Connect your GitHub repo to Vercel
2. Auto-deploys on every push to main branch
3. Preview deployments for pull requests

## 📝 Embedding in Substack

### Basic Embed

```html
<iframe 
  src="https://maps.mapsthatmatter.io/year-population" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px;">
</iframe>
```

### Responsive Embed

```html
<div style="position: relative; padding-bottom: 75%; height: 0; overflow: hidden;">
  <iframe 
    src="https://maps.mapsthatmatter.io/year-population" 
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 1px solid #ddd; border-radius: 4px;"
    frameborder="0">
  </iframe>
</div>
```

### With Caption

```html
<div style="margin: 2em 0;">
  <iframe 
    src="https://maps.mapsthatmatter.io/year-population" 
    width="100%" 
    height="600" 
    frameborder="0"
    style="border: 1px solid #ddd; border-radius: 4px;">
  </iframe>
  <p style="text-align: center; color: #666; font-size: 0.9em; margin-top: 0.5em;">
    Interactive map showing population distribution over time. Zoom and pan to explore.
  </p>
</div>
```

## 🎨 Basemap Options

Current setup uses **Carto Dark Matter** (free, no token required).

Other free options you can use:
- `light-matter` - Carto Light theme
- `voyager` - Carto Voyager theme

To change, edit the `styleType` in your config JSON:
```json
{
  "config": {
    "mapStyle": {
      "styleType": "light-matter"
    }
  }
}
```

## 🐛 Troubleshooting

### Map not loading
- Check browser console for errors
- Verify data and config file paths are correct
- Ensure `datasetId` matches `dataId` in config

### Data not showing
- Verify CSV format matches Kepler.gl expectations
- Check that column names in config match CSV headers
- Ensure H3 hex IDs are valid

### Wrong dataset ID error
- Export config from Kepler.gl again
- Check the `dataId` field in filters/layers
- Update `datasetId` in HTML to match

## 📚 Resources

- [Kepler.gl Documentation](https://docs.kepler.gl/)
- [H3 Hexagons](https://h3geo.org/)
- [Your Blog](https://mapsthatmatter.substack.com/)

## 💡 Tips

1. **Keep data files small** - Use aggregated data, not raw points
2. **Use H3 hexagons** - Better performance than individual points
3. **Test locally first** - Open HTML files in browser before deploying
4. **Version your configs** - Keep backups of working configurations
5. **Descriptive names** - Use clear directory names for easy embedding

## Example URL Structure

```
https://maps.mapsthatmatter.io/
├── year-population/          # Population over time
├── age-distribution/         # Age breakdown
├── urban-density/            # Urban vs rural density
└── growth-patterns/          # Population growth trends
```

Each is accessible at: `https://maps.mapsthatmatter.io/example-name/`
