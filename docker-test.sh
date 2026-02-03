#!/bin/bash

echo "=== Testing Tauri App on Linux (via Docker) ==="
echo ""
echo "Note: This builds for linux/amd64 architecture"
echo "Building may take 5-10 minutes on first run..."
echo ""

# Build Docker image
echo "Building Docker image..."
docker build --platform linux/amd64 -f Dockerfile.test -t trading-journal-linux-test .

if [ $? -ne 0 ]; then
    echo "Failed to build Docker image"
    exit 1
fi

echo ""
echo "=== Running tests ==="
echo ""

# Run container with X11 forwarding (for GUI testing)
# Note: This requires XQuartz on macOS
docker run --rm -it \
    -e DISPLAY=host.docker.internal:0 \
    -v /tmp/.X11-unix:/tmp/.X11-unix \
    trading-journal-linux-test \
    bash -c "cd /app && npm run tauri:build && echo 'Build completed! Binary at: src-tauri/target/release/trading-journal'"

echo ""
echo "=== Done ==="
echo ""
echo "To run the built binary manually:"
echo "docker run --rm -it trading-journal-linux-test bash"
echo "Then: cd /app/src-tauri/target/release && ./trading-journal"
