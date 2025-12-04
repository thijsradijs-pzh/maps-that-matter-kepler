# 🗺️ Kepler.gl Multi-Example Deployment System
## Project Overview & Architecture

**Created for:** Maps That Matter blog (mapsthatmatter.substack.com)  
**Purpose:** Deploy multiple interactive Kepler.gl visualizations with clean URLs for iframe embedding  
**Deploy to:** Vercel (free tier)  
**Current domain:** maps.mapsthatmatter.io

---

## 🎯 What This Solves

### Before
- Single hardcoded visualization
- Difficult to add new examples
- No easy way to maintain multiple maps
- Complex embedding process

### After
✅ **Easy to add new examples** - just run `./new-example.sh`  
✅ **Clean URLs** - each example at `/example-name/`  
✅ **Ready for embedding** - copy-paste iframe code  
✅ **Scalable** - add unlimited examples  
✅ **Free basemap** - no Mapbox token required  
✅ **Auto-deployment** - push to GitHub, deploys automatically

---

## 📁 Complete Project Structure

```
kepler-examples/
│
├── 📄 README.md                 # Complete documentation
├── 📄 GETTING_STARTED.md        # Quick start guide (start here!)
├── 📄 CHEATSHEET.md            # Quick reference for common tasks
├── 📄 SUBSTACK_GUIDE.md        # Comprehensive embedding guide
├── 📄 PROJECT_OVERVIEW.md      # This file
│
├── 🔧 vercel.json               # Deployment configuration
├── 🔧 .gitignore                # Git ignore rules
├── 🚀 deploy.sh                 # Interactive deployment script
├── 🚀 new-example.sh            # Create new examples easily
│
├── 📂 year-population/          # Example 1 (ready to use!)
│   └── index.html               # Loads data/subset.csv + config
│
├── 📂 data/                     # All CSV data files
│   └── subset.csv               # Your H3 hexagon population data
│
└── 📂 config/                   # All Kepler.gl configurations
    └── year_example.json        # Config for year-population example
```

---

## 🏗️ Architecture

### How It Works

1. **Directory-based routing**: Each example is a folder with index.html
2. **Shared resources**: All examples use data/ and config/ folders
3. **Static hosting**: Pure HTML/CSS/JS, no server needed
4. **CDN libraries**: React, Redux, Kepler.gl loaded from CDN
5. **Free basemap**: Carto basemaps (no API key required)

### URL Structure

```
https://maps.mapsthatmatter.io/
│
├── /year-population/          → year-population/index.html
├── /age-distribution/         → age-distribution/index.html
├── /urban-density/            → urban-density/index.html
└── /any-example-name/         → any-example-name/index.html
```

### Data Flow

```
User visits URL
    ↓
Vercel serves index.html
    ↓
HTML loads from CDN:
  - React, Redux, styled-components
  - Kepler.gl
    ↓
JavaScript fetches:
  - CSV data from data/
  - JSON config from config/
    ↓
Kepler.gl renders map
```

---

## 🔑 Key Files Explained

### `index.html` (in each example folder)

The main file that loads and displays your map. Key sections:

```javascript
// CONFIG - customize these values
const CONFIG = {
  dataFile: '../data/subset.csv',           // Path to your CSV
  configFile: '../config/year_example.json', // Path to Kepler config
  datasetId: '-g1xquc',                      // Must match config!
  datasetLabel: 'Population Over Time'       // Display name
};
```

### `vercel.json`

Configures deployment:
- Enables iframe embedding
- Sets up CORS headers
- Handles URL routing
- Redirects / to default example

### `deploy.sh`

Interactive script for deployment:
- Checks project structure
- Validates required files
- Deploys to preview or production
- Shows deployment status

### `new-example.sh`

Creates new examples quickly:
- Prompts for all required info
- Generates configured index.html
- Shows next steps
- Validates input

---

## 🎓 Usage Workflows

### Workflow 1: Quick Deploy (First Time)

```bash
# 1. Upload to GitHub
git init
git add .
git commit -m "Initial commit"
git push

# 2. Deploy to Vercel
./deploy.sh  # or use Vercel dashboard

# 3. Done! Maps are live
```

### Workflow 2: Add New Visualization

```bash
# 1. Export config from Kepler.gl
# Save to config/my-viz.json

# 2. Create example
./new-example.sh
# Answer prompts

# 3. Test locally
open my-viz/index.html

# 4. Deploy
git add .
git commit -m "Add my-viz"
git push
```

### Workflow 3: Update Existing Map

```bash
# 1. Edit config or data
vim config/year_example.json

# 2. Test locally
open year-population/index.html

# 3. Deploy
git add .
git commit -m "Update year-population"
git push
```

### Workflow 4: Embed in Blog

```html
<!-- Copy this into Substack (HTML mode) -->
<iframe 
  src="https://maps.mapsthatmatter.io/year-population" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px;">
</iframe>
```

---

## 🔧 Configuration Details

### Dataset ID Matching (CRITICAL!)

The dataset ID must match between HTML and config:

**In HTML:**
```javascript
datasetId: '-g1xquc'
```

**In config JSON:**
```json
{
  "filters": [{ "dataId": ["-g1xquc"] }],
  "layers": [{ "config": { "dataId": "-g1xquc" } }]
}
```

**How to find it:**
1. Open your config JSON
2. Search for `"dataId"`
3. Use that exact value in your HTML

### Basemap Options (All Free!)

Change in config JSON:
```json
{
  "mapStyle": {
    "styleType": "dark-matter"  // Options below
  }
}
```

Available:
- `dark-matter` - Dark theme (current)
- `light-matter` - Light theme
- `voyager` - Balanced colors

### File Paths

Examples use relative paths:
```javascript
dataFile: '../data/subset.csv',      // Up one level, into data/
configFile: '../config/year.json'    // Up one level, into config/
```

---

## 📊 Current Example: year-population

**Purpose:** Visualize population data over time using H3 hexagons

**Data:** `data/subset.csv`
- Columns: h3_id, year_int, aantal_inwoners_sum, etc.
- Format: CSV with H3 hex IDs
- Coverage: Netherlands region

**Config:** `config/year_example.json`
- Layer type: hexagonId
- Color scheme: Global Warming (sequential)
- Filter: Year range slider (2018-2019)
- Base style: Carto dark-matter

**Features:**
- Interactive time slider
- Hexagon coloring by population
- Zoom and pan controls
- Tooltip with detailed data
- Responsive design

---

## 🚀 Deployment Options

### Option 1: Vercel (Recommended)

**Advantages:**
- Free tier generous (100GB/month)
- Auto-deploy on git push
- Custom domains
- SSL certificates
- Fast global CDN
- Zero configuration

**Steps:**
1. Connect GitHub repo
2. Click deploy
3. Done!

### Option 2: GitHub Pages

**Advantages:**
- Free unlimited
- Simple setup
- GitHub integration

**Steps:**
1. Enable in repo settings
2. Deploy from main branch
3. Access at username.github.io/repo

### Option 3: Netlify

**Advantages:**
- Free tier
- Similar to Vercel
- Good for testing

**Steps:**
1. Connect repo
2. Auto-deploy on push
3. Custom domain support

---

## 📈 Scaling Considerations

### Performance

**Current setup handles:**
- ✅ 10-20 examples easily
- ✅ Data files up to 5MB each
- ✅ Thousands of hexagons per map
- ✅ Multiple simultaneous users

**Optimization tips:**
- Keep data files under 5MB
- Use H3 aggregation (not raw points)
- Minimize number of layers
- Use efficient color scales

### Bandwidth

**Vercel free tier:**
- 100GB per month
- ~50,000 map loads/month (estimate)
- More than enough for blog use

**If you exceed:**
- Upgrade to Pro ($20/month)
- Or switch to GitHub Pages (unlimited)

### Maintenance

**Easy updates:**
- Change data: edit CSV, push
- Change style: edit config, push
- Add example: run script, push
- No server management needed!

---

## 🎨 Customization Guide

### Visual Styling

**Change colors in config:**
```json
{
  "visConfig": {
    "colorRange": {
      "colors": ["#color1", "#color2", ...]
    }
  }
}
```

**Change map view:**
```json
{
  "mapState": {
    "latitude": 52.0,
    "longitude": 4.5,
    "zoom": 10
  }
}
```

### Iframe Styling

**Basic:**
```html
style="border: 1px solid #ddd; border-radius: 4px;"
```

**Professional:**
```html
style="border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"
```

**Responsive:**
```html
width="100%" height="600"
```

---

## 🐛 Common Issues & Solutions

### Issue: Map doesn't load

**Possible causes:**
1. Wrong dataset ID
2. File paths incorrect
3. CSV format issues
4. Config JSON invalid

**Solutions:**
1. Check datasetId matches dataId in config
2. Verify paths use `../data/` and `../config/`
3. Validate CSV has correct columns
4. Validate JSON at jsonlint.com

### Issue: Wrong colors/style

**Solution:**
- Re-export config from Kepler.gl
- Ensure config file is correct
- Clear browser cache

### Issue: Data not showing

**Possible causes:**
1. Column names don't match
2. H3 IDs invalid
3. Data type mismatch

**Solutions:**
1. Check config references correct columns
2. Validate H3 IDs at h3geo.org
3. Ensure numeric columns are numbers

### Issue: Deployment fails

**Check:**
1. All files committed to git
2. vercel.json present
3. No syntax errors in HTML
4. Data files not too large (>50MB)

---

## 📚 Resources & References

### Documentation
- **Kepler.gl:** https://docs.kepler.gl/
- **Vercel:** https://vercel.com/docs
- **H3 Geo:** https://h3geo.org/
- **Carto Basemaps:** https://carto.com/basemaps/

### Your Blog
- **Substack:** https://mapsthatmatter.substack.com/
- **Example Post:** /p/from-chaos-to-clarity-how-a-geo-data

### Tools
- **Kepler.gl Demo:** https://kepler.gl/demo
- **JSON Validator:** https://jsonlint.com/
- **CSV Validator:** https://csvlint.io/

---

## 💡 Best Practices

### Data Preparation
1. **Aggregate before upload** - Don't use raw points
2. **Use H3 hexagons** - Level 6-8 for most use cases
3. **Keep files small** - Under 5MB ideal
4. **Clean column names** - No spaces or special chars

### Configuration
1. **Save working configs** - Backup before major changes
2. **Test locally first** - Open HTML before deploying
3. **Version control** - Use git branches for experiments
4. **Document changes** - Good commit messages

### Deployment
1. **Preview before prod** - Test with preview deployments
2. **Monitor usage** - Check Vercel analytics
3. **Test on mobile** - Always check responsive design
4. **Keep URLs stable** - Don't rename folders after sharing

### Embedding
1. **Add context** - Explain map before iframe
2. **Guide interaction** - Tell readers what to do
3. **Appropriate height** - Match to map complexity
4. **Test in Substack** - Preview before publishing

---

## 🎯 Next Steps

### Immediate
1. ✅ Deploy to Vercel
2. ✅ Test year-population example
3. ✅ Embed in first blog post
4. ✅ Share and get feedback

### Short-term
1. Add 2-3 more examples
2. Experiment with different basemaps
3. Try different visualization types
4. Document your process

### Long-term
1. Build library of visualizations
2. Create templates for common patterns
3. Share with community
4. Iterate based on reader feedback

---

## 📞 Support

**Issues?**
- Check CHEATSHEET.md for quick fixes
- Review GETTING_STARTED.md for basics
- Read Kepler.gl documentation
- Check Vercel deployment logs

**Questions?**
- Kepler.gl community
- Vercel support
- GitHub discussions

---

## ✨ Credits

**Built with:**
- Kepler.gl by Uber
- Vercel hosting
- Carto basemaps
- React, Redux
- H3 geospatial indexing

**Created for:**
Maps That Matter blog by [Your Name]

---

## 📝 Version History

**v1.0** - Initial release
- Single year-population example
- Complete documentation suite
- Deployment automation
- Substack integration ready

**Future versions:**
- Additional example templates
- Advanced filtering options
- Custom color schemes
- Multi-language support

---

## 🎉 You're All Set!

This system is now ready to power your interactive mapping blog. Everything you need is documented, and adding new examples is as simple as running a script.

**Happy mapping! 🗺️**

---

*For the latest updates and examples, visit: https://maps.mapsthatmatter.io*
