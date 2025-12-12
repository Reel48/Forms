#!/bin/bash

# Favicon Generation Script
# This script helps generate favicons from your logo
# Requires ImageMagick: brew install imagemagick (macOS) or apt-get install imagemagick (Linux)

LOGO_FILE="public/logo-dark.png"
OUTPUT_DIR="public"

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "❌ ImageMagick is not installed."
    echo "Install it with: brew install imagemagick (macOS) or apt-get install imagemagick (Linux)"
    exit 1
fi

# Check if logo file exists
if [ ! -f "$LOGO_FILE" ]; then
    echo "❌ Logo file not found: $LOGO_FILE"
    echo "Please ensure logo-dark.png exists in the public directory"
    exit 1
fi

echo "🔄 Generating favicons from $LOGO_FILE..."

# Create favicons
convert "$LOGO_FILE" -resize 16x16 "$OUTPUT_DIR/favicon-16x16.png"
echo "✅ Created favicon-16x16.png"

convert "$LOGO_FILE" -resize 32x32 "$OUTPUT_DIR/favicon-32x32.png"
echo "✅ Created favicon-32x32.png"

convert "$LOGO_FILE" -resize 180x180 "$OUTPUT_DIR/apple-touch-icon.png"
echo "✅ Created apple-touch-icon.png"

convert "$LOGO_FILE" -resize 192x192 "$OUTPUT_DIR/favicon-192x192.png"
echo "✅ Created favicon-192x192.png"

convert "$LOGO_FILE" -resize 512x512 "$OUTPUT_DIR/favicon-512x512.png"
echo "✅ Created favicon-512x512.png"

# Create OG image (1200x630) with centered logo
convert "$LOGO_FILE" -resize 800x800 -gravity center -extent 1200x630 -background "#000000" "$OUTPUT_DIR/og-image.png"
echo "✅ Created og-image.png (1200x630)"

echo ""
echo "✨ All favicons generated successfully!"
echo "📝 Note: You may want to manually adjust og-image.png to add text or improve the design"
echo "📝 Note: favicon.svg needs to be created manually or converted from your logo"


