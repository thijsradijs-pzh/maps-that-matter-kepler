# 🚀 Getting Started

Welcome! This guide will get you from zero to deployed in 10 minutes.

## 📋 Prerequisites

- Git installed
- Node.js installed (for Vercel CLI)
- A GitHub account
- A Vercel account (free tier is fine)

## 🏃 Quick Start (5 minutes)

### 1. Upload to GitHub

```bash
cd kepler-examples
git init
git add .
git commit -m "Initial commit: Kepler.gl examples"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/kepler-maps.git
git push -u origin main
```

### 2. Deploy to Vercel

**Option A: Using Vercel Dashboard (Easiest)**
1. Go to https://vercel.com
2. Click "Add New Project"
3. Import your GitHub repository
4. Click "Deploy" (no configuration needed!)
5. Done! Your maps are live at `your-project.vercel.app`

**Option B: Using Vercel CLI**
```bash
npm i -g vercel
cd kepler-examples
vercel --prod
```

### 3. Test Your Deployment

Visit: `https://your-project.vercel.app/year-population/`

### 4. Add Custom Domain (Optional)

1. In Vercel dashboard → Settings → Domains
2. Add `maps.mapsthatmatter.io`
3. Add DNS records as instructed
4. Wait for SSL (automatic)

## 🎯 What You Have Now

✅ One working example: `year-population`
✅ Clean URLs for iframe embedding
✅ Free Carto basemap (no token needed)
✅ Ready to add more examples

## 📝 Next Steps

### Add a Second Example

1. **Create the example:**
   ```bash
   ./new-example.sh
   ```
   
2. **Follow the prompts** - it will ask for:
   - Example name (e.g., "age-distribution")
   - Data file
   - Config file
   - Dataset ID

3. **Test it:**
   ```bash
   open age-distribution/index.html
   ```

4. **Deploy:**
   ```bash
   git add .
   git commit -m "Add age-distribution example"
   git push
   # Vercel auto-deploys on push!
   ```

### Embed in Substack

Copy this code into your Substack post (in HTML mode):

```html
<iframe 
  src="https://your-project.vercel.app/year-population" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px; margin: 20px 0;">
</iframe>
```

## 📚 Documentation Overview

| File | Purpose |
|------|---------|
| `README.md` | Full documentation and project overview |
| `CHEATSHEET.md` | Quick reference for common tasks |
| `SUBSTACK_GUIDE.md` | Complete embedding guide with examples |
| `deploy.sh` | Interactive deployment script |
| `new-example.sh` | Create new examples easily |

## 🎓 Example Workflow

Let's say you want to add a map showing age distribution:

1. **Export config from Kepler.gl**
   - Go to https://kepler.gl/demo
   - Load your data
   - Style it how you want
   - Export as JSON → save to `config/age-dist.json`

2. **Note the dataset ID**
   - Open `config/age-dist.json`
   - Find: `"dataId": ["xyz123"]`
   - Remember "xyz123"

3. **Create the example**
   ```bash
   ./new-example.sh
   ```
   - Name: `age-distribution`
   - Data: Use existing `subset.csv`
   - Config: `age-dist.json`
   - Dataset ID: `xyz123`
   - Label: `Age Distribution Map`

4. **Test locally**
   ```bash
   open age-distribution/index.html
   ```

5. **Deploy**
   ```bash
   git add .
   git commit -m "Add age distribution map"
   git push
   ```

6. **Embed in blog**
   ```html
   <iframe src="https://your-project.vercel.app/age-distribution" 
     width="100%" height="600" frameborder="0"
     style="border: 1px solid #ddd; border-radius: 4px;">
   </iframe>
   ```

## 🎨 Customization Ideas

### Different Basemaps

Edit your config JSON:
```json
{
  "mapStyle": {
    "styleType": "light-matter"  // Try: dark-matter, voyager
  }
}
```

### Different Heights

Change in iframe:
```html
height="800"  <!-- Taller for complex maps -->
height="400"  <!-- Shorter for simple maps -->
```

### Custom Styling

Add to iframe style:
```html
style="border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"
```

## 🔧 Troubleshooting

### Maps not loading after deployment
- Wait 2-3 minutes for Vercel build
- Check Vercel deployment logs
- Verify file paths are correct

### "Dataset not found" error
- Ensure `datasetId` in HTML matches `dataId` in config
- Check browser console (F12) for exact error

### Want to update an existing map
1. Edit the config in `config/`
2. Or edit the data in `data/`
3. Commit and push - auto-deploys!

## 🌟 Pro Tips

1. **Keep URLs short**: Use concise folder names
2. **Test before push**: Open HTML files locally
3. **Use git branches**: Test changes before main
4. **Monitor Vercel**: Free tier = 100GB bandwidth/month
5. **Backup configs**: Keep copies of working configs

## 📞 Need Help?

- Kepler.gl docs: https://docs.kepler.gl/
- Vercel docs: https://vercel.com/docs
- Substack support: help.substack.com

## ✅ Checklist

Before your first blog post with embedded maps:

- [ ] Deployed to Vercel
- [ ] Tested on desktop browser
- [ ] Tested on mobile device
- [ ] Custom domain configured (optional)
- [ ] Iframe code ready
- [ ] Example works in Substack preview
- [ ] Post is ready to publish!

## 🎉 You're Ready!

Your Kepler.gl mapping infrastructure is now set up. Every new visualization is just:
1. Export config from Kepler
2. Run `./new-example.sh`
3. Push to GitHub
4. Embed in Substack

Happy mapping! 🗺️
