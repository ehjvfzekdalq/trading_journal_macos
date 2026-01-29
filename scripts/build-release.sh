#!/bin/bash

# Trading Journal - Release Build Script
# This script builds distributable installers for macOS

set -e  # Exit on error

echo "======================================"
echo "Trading Journal - Release Build"
echo "======================================"
echo ""

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "❌ Error: This script must be run on macOS"
  echo "For Windows builds, use GitHub Actions or build on a Windows machine"
  exit 1
fi

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "📦 Building version: $VERSION"
echo ""

# Check dependencies
echo "🔍 Checking dependencies..."
if ! command -v node &> /dev/null; then
  echo "❌ Error: Node.js is not installed"
  exit 1
fi

if ! command -v cargo &> /dev/null; then
  echo "❌ Error: Rust is not installed"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo "❌ Error: npm is not installed"
  exit 1
fi

echo "✅ All dependencies found"
echo ""

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/
rm -rf src-tauri/target/release/bundle/
echo "✅ Clean complete"
echo ""

# Install dependencies
echo "📥 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Build frontend
echo "🔨 Building frontend..."
npm run build
echo "✅ Frontend built"
echo ""

# Detect architecture
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
  ARCH_NAME="Apple Silicon (M1/M2/M3)"
  TARGET="aarch64-apple-darwin"
elif [[ "$ARCH" == "x86_64" ]]; then
  ARCH_NAME="Intel"
  TARGET="x86_64-apple-darwin"
else
  echo "❌ Error: Unknown architecture: $ARCH"
  exit 1
fi

echo "🖥️  Detected architecture: $ARCH_NAME"
echo ""

# Ask user which build to create
echo "Select build type:"
echo "1) Current architecture only ($ARCH_NAME) - faster build"
echo "2) Universal binary (both Intel and Apple Silicon) - slower build"
echo "3) Both architectures separately"
read -p "Enter choice (1-3): " BUILD_CHOICE
echo ""

case $BUILD_CHOICE in
  1)
    echo "🔨 Building for $ARCH_NAME..."
    npm run tauri build
    ;;
  2)
    echo "🔨 Building universal binary..."
    npm run tauri build -- --target universal-apple-darwin
    ;;
  3)
    echo "🔨 Building for Apple Silicon..."
    npm run tauri build -- --target aarch64-apple-darwin
    echo ""
    echo "🔨 Building for Intel..."
    npm run tauri build -- --target x86_64-apple-darwin
    ;;
  *)
    echo "❌ Invalid choice"
    exit 1
    ;;
esac

echo ""
echo "✅ Build complete!"
echo ""

# Show output files
echo "======================================"
echo "📦 Build Artifacts:"
echo "======================================"
echo ""

if [ -d "src-tauri/target/release/bundle/dmg" ]; then
  echo "DMG files:"
  ls -lh src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || echo "  (none found)"
  echo ""
fi

if [ -d "src-tauri/target/release/bundle/macos" ]; then
  echo "App bundles:"
  ls -lh src-tauri/target/release/bundle/macos/*.app 2>/dev/null || echo "  (none found)"
  echo ""
fi

echo "======================================"
echo "📋 Next Steps:"
echo "======================================"
echo ""
echo "1. Test the installer:"
echo "   open src-tauri/target/release/bundle/dmg/"
echo ""
echo "2. Distribute to testers:"
echo "   - Upload DMG to cloud storage (Google Drive, Dropbox, etc.)"
echo "   - Or create GitHub release with: git tag v$VERSION && git push origin v$VERSION"
echo ""
echo "3. Send installation instructions:"
echo "   - Include INSTALLATION.md"
echo "   - Include TESTING_CHECKLIST.md"
echo ""
echo "✨ Build script finished!"
