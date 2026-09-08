#!/bin/bash
# Starts the ComPilot Portable server offline

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

if command -v node >/dev/null 2>&1; then
    NODE_CMD="node"
elif [ -f "$SCRIPT_DIR/node" ]; then
    NODE_CMD="$SCRIPT_DIR/node"
else
    echo "[ERROR] Node.js is not found on PATH and no local node binary was found."
    exit 1
fi

echo "Starting ComPilot Offline Server at http://localhost:3003 ..."

# Try to open default browser
if command -v xdg-open >/dev/null 2>&1; then
    (sleep 1 && xdg-open http://localhost:3003) &
elif command -v open >/dev/null 2>&1; then
    (sleep 1 && open http://localhost:3003) &
fi

"$NODE_CMD" server.js
