#!/bin/bash
# Starts the Compilot Node.js server in the background

# Resolve the absolute path of the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Navigate to the directory
cd "$SCRIPT_DIR"

# Start the server in the background and redirect output to startup.log
node server.js > startup.log 2>&1 &
SERVER_PID=$!

echo "Compilot server started in the background (PID: $SERVER_PID)."
echo "Access the application at: http://localhost:3003"
echo "Logs are being written to: $SCRIPT_DIR/startup.log"
