#!/bin/bash
# Deploy naar Vercel. Zonder argument een preview, met --production naar productie.
set -e
cd "$(dirname "$0")"

if [ ! -f vercel.json ]; then
    echo "❌ vercel.json niet gevonden"
    exit 1
fi

if [ "$1" = "--production" ] || [ "$1" = "--prod" ]; then
    echo "🚀 Productie-deploy…"
    npx vercel --prod --yes
else
    echo "🚀 Preview-deploy…"
    npx vercel --yes
fi
