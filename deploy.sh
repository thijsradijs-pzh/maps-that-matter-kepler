#!/bin/bash
# Quick deployment script for Vercel

echo "🚀 Maps That Matter - Kepler.gl Deployment Script"
echo "=================================================="
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null
then
    echo "⚠️  Vercel CLI not found. Installing..."
    npm i -g vercel
fi

echo "📦 Project structure:"
tree -L 2 -I 'node_modules|.git'

echo ""
echo "🔍 Checking files..."

# Check if required directories exist
if [ ! -d "data" ]; then
    echo "❌ Error: 'data' directory not found"
    exit 1
fi

if [ ! -d "config" ]; then
    echo "❌ Error: 'config' directory not found"
    exit 1
fi

if [ ! -f "vercel.json" ]; then
    echo "❌ Error: 'vercel.json' not found"
    exit 1
fi

echo "✅ All required files present"
echo ""

# Count examples
example_count=$(find . -maxdepth 1 -type d -name "*-*" | wc -l)
echo "📊 Found $example_count example(s)"

echo ""
echo "Choose deployment option:"
echo "1) Preview deployment (test before going live)"
echo "2) Production deployment"
echo "3) Cancel"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo "🚀 Deploying to preview..."
        vercel
        ;;
    2)
        echo "🚀 Deploying to production..."
        vercel --prod
        ;;
    3)
        echo "👋 Cancelled"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Test your deployment URL"
echo "2. Embed in Substack using iframe"
echo "3. Share your interactive maps!"
