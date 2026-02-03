#!/bin/bash

echo "=== Quick Linux Build Test (No GUI) ==="
echo ""
echo "This script only tests if the app builds on Linux."
echo "It won't run the GUI - that's better tested on real Linux hardware."
echo ""

# Build Docker image
echo "Building Docker image (this may take 5-10 minutes)..."
docker build --platform linux/amd64 -f Dockerfile.test -t trading-journal-linux-test . 2>&1 | tee docker-build.log

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Docker build failed. Check docker-build.log for details."
    exit 1
fi

echo ""
echo "✅ Docker image built successfully!"
echo ""
echo "Testing build inside container..."
docker run --platform linux/amd64 --rm \
    -v "$(pwd)":/host-app \
    trading-journal-linux-test \
    bash -c "
        cd /host-app && \
        echo '=== Installing dependencies ===' && \
        npm install && \
        echo '' && \
        echo '=== Building Tauri app ===' && \
        npm run tauri:build && \
        echo '' && \
        if [ -f 'src-tauri/target/release/trading-journal' ]; then
            echo '✅ Build successful!' && \
            ls -lh src-tauri/target/release/trading-journal && \
            echo '' && \
            echo 'Binary size:' && \
            du -h src-tauri/target/release/trading-journal
        else
            echo '❌ Build failed - binary not found'
            exit 1
        fi
    " 2>&1 | tee build-test.log

BUILD_STATUS=$?

echo ""
echo "=== Build Result ==="
if [ $BUILD_STATUS -eq 0 ]; then
    # Double-check that the binary actually exists
    docker run --platform linux/amd64 --rm \
        -v "$(pwd)":/host-app \
        trading-journal-linux-test \
        bash -c "test -f /host-app/src-tauri/target/release/trading-journal"

    if [ $? -eq 0 ]; then
        echo "✅ Linux build test PASSED!"
        echo ""
        echo "The app builds successfully on Linux (Ubuntu 22.04)."
        echo "For GUI testing, please use a real Linux machine or VM."
        echo ""
        echo "Built binary location: src-tauri/target/release/trading-journal"
    else
        echo "❌ Linux build test FAILED!"
        echo "Build command succeeded but binary was not created."
        echo "Check build-test.log for details."
        exit 1
    fi
else
    echo "❌ Linux build test FAILED!"
    echo ""
    echo "Check build-test.log for details."
    echo ""
    echo "Common issues:"
    echo "- Missing system dependencies (check Dockerfile.test)"
    echo "- TypeScript compilation errors"
    echo "- Rust compilation errors"
    exit 1
fi
