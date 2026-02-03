#!/bin/bash

# Trading Journal - Database Reset Script
# macOS only

APP_DATA_DIR="$HOME/Library/Application Support/com.nemesis.trading-journal"

echo "═══════════════════════════════════════════════════════"
echo "  Trading Journal - Database Reset"
echo "═══════════════════════════════════════════════════════"
echo ""

# Check if directory exists
if [ ! -d "$APP_DATA_DIR" ]; then
    echo "✓ No data found. Database is already clean."
    exit 0
fi

# Show what will be deleted
echo "The following will be deleted:"
echo ""
ls -lh "$APP_DATA_DIR"
echo ""

# Ask for confirmation
read -p "⚠️  Are you sure you want to delete ALL data? (yes/no): " confirmation

if [ "$confirmation" != "yes" ]; then
    echo ""
    echo "❌ Cancelled. No data was deleted."
    exit 1
fi

# Delete the directory
rm -rf "$APP_DATA_DIR"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database reset complete!"
    echo ""
    echo "Next time you open Trading Journal, a fresh database will be created."
else
    echo ""
    echo "❌ Error: Failed to delete data directory."
    exit 1
fi
