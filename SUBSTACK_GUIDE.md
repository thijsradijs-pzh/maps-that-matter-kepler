# Embedding Kepler.gl Maps in Substack

Complete guide for embedding your interactive Kepler.gl maps in Substack posts.

## 📝 Quick Reference

### Basic Iframe Code
```html
<iframe 
  src="https://maps.mapsthatmatter.io/year-population" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px;">
</iframe>
```

## 🎨 Embedding Styles

### 1. Simple Embed (Recommended for Most Posts)

```html
<iframe 
  src="https://maps.mapsthatmatter.io/year-population" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px; margin: 20px 0;">
</iframe>
```

**Use when:** Default choice for most blog posts

---

### 2. Tall Map (For Complex Visualizations)

```html
<iframe 
  src="https://maps.mapsthatmatter.io/year-population" 
  width="100%" 
  height="800" 
  frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px;">
</iframe>
```

**Use when:** Map needs more vertical space for controls/legend

---

### 3. Responsive Embed (Auto-adjusts to Screen Size)

```html
<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; margin: 20px 0;">
  <iframe 
    src="https://maps.mapsthatmatter.io/year-population" 
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 1px solid #ddd; border-radius: 4px;"
    frameborder="0">
  </iframe>
</div>
```

**Use when:** You want a 16:9 aspect ratio that scales on mobile

**Note:** Change `padding-bottom` to adjust aspect ratio:
- `75%` = 4:3 ratio
- `66.67%` = 3:2 ratio
- `56.25%` = 16:9 ratio

---

### 4. Full-Width with Shadow (Professional Look)

```html
<iframe 
  src="https://maps.mapsthatmatter.io/year-population" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); margin: 30px 0;">
</iframe>
```

**Use when:** You want a polished, modern appearance

---

### 5. With Caption and Description

```html
<div style="margin: 30px 0;">
  <iframe 
    src="https://maps.mapsthatmatter.io/year-population" 
    width="100%" 
    height="600" 
    frameborder="0"
    style="border: 1px solid #ddd; border-radius: 4px;">
  </iframe>
  <p style="text-align: center; color: #666; font-size: 14px; margin-top: 10px; font-style: italic;">
    Interactive map showing population distribution over time in the Netherlands. 
    <strong>Tip:</strong> Click and drag to pan, scroll to zoom.
  </p>
</div>
```

**Use when:** You want to guide readers on how to interact with the map

---

### 6. Side-by-Side Comparison (Two Maps)

```html
<div style="display: flex; gap: 10px; margin: 20px 0; flex-wrap: wrap;">
  <div style="flex: 1; min-width: 300px;">
    <iframe 
      src="https://maps.mapsthatmatter.io/year-population" 
      width="100%" 
      height="500" 
      frameborder="0"
      style="border: 1px solid #ddd; border-radius: 4px;">
    </iframe>
    <p style="text-align: center; color: #666; font-size: 13px; margin-top: 5px;">
      2018 Population
    </p>
  </div>
  <div style="flex: 1; min-width: 300px;">
    <iframe 
      src="https://maps.mapsthatmatter.io/other-example" 
      width="100%" 
      height="500" 
      frameborder="0"
      style="border: 1px solid #ddd; border-radius: 4px;">
    </iframe>
    <p style="text-align: center; color: #666; font-size: 13px; margin-top: 5px;">
      2024 Population
    </p>
  </div>
</div>
```

**Use when:** Comparing two visualizations

---

### 7. Compact Embed (For Quick Reference)

```html
<iframe 
  src="https://maps.mapsthatmatter.io/year-population" 
  width="100%" 
  height="400" 
  frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px;">
</iframe>
```

**Use when:** Limited space or supplementary visualization

---

## 🎯 Substack-Specific Tips

### Adding to Your Post

1. **Switch to HTML mode** in the Substack editor
2. **Paste the iframe code** where you want the map
3. **Switch back to regular mode** to continue writing

### Mobile Optimization

Substack automatically makes your posts mobile-friendly, but test your embeds:
- Keep height between 400-600px for mobile
- Avoid very wide fixed-width containers
- Use responsive embeds for best mobile experience

### Loading Time

Add context before the map so readers have something to read while it loads:

```
As you can see in the interactive map below, population density 
varies significantly across different regions...

[MAP IFRAME HERE]

The visualization reveals several interesting patterns...
```

## 🔗 URL Structure

Your maps follow this pattern:
```
https://maps.mapsthatmatter.io/[example-name]/
```

Examples:
- `https://maps.mapsthatmatter.io/year-population/`
- `https://maps.mapsthatmatter.io/age-distribution/`
- `https://maps.mapsthatmatter.io/urban-density/`

## ✨ Customization Options

### Adjust Height
Change the `height` attribute:
```html
height="500"  <!-- shorter -->
height="800"  <!-- taller -->
```

### Remove Border
```html
style="border: none; border-radius: 4px;"
```

### Add Background Color
```html
style="border: 1px solid #ddd; border-radius: 4px; background: #f5f5f5;"
```

### Center with Max Width
```html
<div style="max-width: 900px; margin: 30px auto;">
  <iframe 
    src="https://maps.mapsthatmatter.io/year-population" 
    width="100%" 
    height="600" 
    frameborder="0"
    style="border: 1px solid #ddd; border-radius: 4px;">
  </iframe>
</div>
```

## 📱 Testing Checklist

Before publishing, test:
- [ ] Map loads correctly on desktop
- [ ] Map is responsive on mobile
- [ ] Controls are accessible
- [ ] No horizontal scrolling
- [ ] Height provides good viewing experience
- [ ] Caption is readable

## 🐛 Troubleshooting

### Map Doesn't Load
- Check the URL is correct
- Verify example is deployed to Vercel
- Check browser console for errors

### Map is Cut Off
- Increase iframe height
- Check for conflicting CSS

### Controls Not Working
- Ensure iframe is large enough
- Check that X-Frame-Options allows embedding

## 💡 Best Practices

1. **Context First**: Always introduce the map before embedding
2. **Guide Interaction**: Tell readers what to look for
3. **Appropriate Size**: Match height to map complexity
4. **Mobile-Friendly**: Test on different devices
5. **Performance**: Keep data files reasonable in size
6. **Accessibility**: Provide text alternatives for key insights

## 🎓 Example Blog Post Structure

```markdown
# From Chaos to Clarity: Visualizing Population Data

Over the past few years, I've been collecting population data 
across different regions. What I found surprised me.

[Intro text continues...]

## The Visualization

Below is an interactive map you can explore yourself. Try zooming 
in to your region and using the time slider to see changes over time:

<iframe src="https://maps.mapsthatmatter.io/year-population" 
  width="100%" height="600" frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px; margin: 20px 0;">
</iframe>

As you can see, the patterns reveal...

[Rest of post...]
```

## 🔗 Quick Copy Codes

Replace `year-population` with your example name:

**Basic:**
```html
<iframe src="https://maps.mapsthatmatter.io/year-population" width="100%" height="600" frameborder="0" style="border: 1px solid #ddd; border-radius: 4px;"></iframe>
```

**Professional:**
```html
<iframe src="https://maps.mapsthatmatter.io/year-population" width="100%" height="600" frameborder="0" style="border: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); margin: 30px 0;"></iframe>
```

**Responsive:**
```html
<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; margin: 20px 0;"><iframe src="https://maps.mapsthatmatter.io/year-population" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 1px solid #ddd; border-radius: 4px;" frameborder="0"></iframe></div>
```
