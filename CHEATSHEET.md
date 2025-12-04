# Quick Reference Cheat Sheet

## 🚀 Common Commands

### Deploy to Vercel
```bash
./deploy.sh
# or manually:
vercel --prod
```

### Create New Example
```bash
./new-example.sh
```

### Test Locally
```bash
# Open any index.html in your browser
open year-population/index.html
# or
python3 -m http.server 8000
# Then visit: http://localhost:8000/year-population/
```

## 📁 File Structure

```
kepler-examples/
├── year-population/          # Example 1
│   └── index.html
├── another-example/          # Example 2
│   └── index.html
├── data/                     # All CSV data files
│   ├── subset.csv
│   └── other-data.csv
├── config/                   # All Kepler configs
│   ├── year_example.json
│   └── other-config.json
├── vercel.json              # Deployment config
├── deploy.sh                # Deploy script
├── new-example.sh           # Create example script
└── README.md                # Full documentation
```

## 🔧 Important Dataset ID Matching

Your HTML must match your Kepler config:

**In your HTML:**
```javascript
datasetId: '-g1xquc'  // ← This
```

**In your config JSON:**
```json
{
  "filters": [{
    "dataId": ["-g1xquc"]  // ← Must match this
  }],
  "layers": [{
    "config": {
      "dataId": "-g1xquc"  // ← And this
    }
  }]
}
```

## 🎨 Basemap Options (Free!)

In your Kepler config, change `styleType`:

```json
{
  "mapStyle": {
    "styleType": "dark-matter"  // ← Change this
  }
}
```

Options:
- `dark-matter` (dark theme)
- `light-matter` (light theme)  
- `voyager` (balanced colors)

## 📊 Exporting Kepler Config

1. Open https://kepler.gl/demo
2. Load your CSV data
3. Configure visualization
4. Click **Share** (top right)
5. **Export Map** → **JSON**
6. Save to `config/your-name.json`
7. Note the `dataId` values in the JSON!

## 🔗 URL Format

```
https://maps.mapsthatmatter.io/[folder-name]/
```

Examples:
- `/year-population/` → year-population folder
- `/age-distribution/` → age-distribution folder

## 📝 Substack Embed Code

**Quick copy:**
```html
<iframe src="https://maps.mapsthatmatter.io/year-population" 
  width="100%" height="600" frameborder="0" 
  style="border: 1px solid #ddd; border-radius: 4px;">
</iframe>
```

## ⚡ Quick Workflow

### Adding a New Map Visualization

1. **Export config from Kepler.gl**
   ```bash
   # Save to: config/my-viz.json
   ```

2. **Create new example**
   ```bash
   ./new-example.sh
   # Follow the prompts
   ```

3. **Test locally**
   ```bash
   open my-viz/index.html
   ```

4. **Deploy**
   ```bash
   ./deploy.sh
   # Choose option 2 for production
   ```

5. **Get embed code**
   ```
   https://maps.mapsthatmatter.io/my-viz/
   ```

## 🐛 Common Issues

### "Dataset not found"
→ Check datasetId matches dataId in config

### Map doesn't load
→ Verify file paths in HTML:
```javascript
dataFile: '../data/subset.csv',
configFile: '../config/year_example.json',
```

### Wrong colors/style
→ Re-export config from Kepler.gl

### Data doesn't show
→ Check CSV column names match config

## 💾 Data File Tips

**Good:**
- Aggregated data (not raw points)
- H3 hexagons instead of coordinates
- Under 5MB
- Clean column names (no spaces)

**Bad:**
- Millions of individual points
- Large file sizes (>10MB)
- Special characters in column names
- Missing or null values

## 📏 Recommended Sizes

### For Blog Posts
- Height: 600px (standard)
- Height: 800px (detailed)
- Height: 400px (compact)

### For Mobile
- Height: 400-500px
- Always use width: 100%
- Test on actual devices

## 🎯 Performance Tips

1. **Aggregate data** before uploading
2. **Use H3 hexagons** level 6-8
3. **Keep configs simple** - fewer layers = faster
4. **Test locally first** before deploying
5. **Monitor Vercel usage** (100GB free/month)

## 📞 Support

- Issues: Check console logs in browser (F12)
- Kepler.gl docs: https://docs.kepler.gl/
- Vercel docs: https://vercel.com/docs

## 🔑 Key Files to Never Delete

- `vercel.json` - routing config
- `data/` folder - your data
- `config/` folder - your visualizations

## 🌟 Example Names (Good)

✅ Use dashes:
- `year-population`
- `age-distribution`
- `urban-density`

❌ Avoid:
- `Year Population` (spaces)
- `year_population` (underscores are OK but dashes preferred)
- `YearPopulation` (camelCase)
