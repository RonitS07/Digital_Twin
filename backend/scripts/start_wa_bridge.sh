#!/bin/bash
cd "$(dirname "$0")/../mcp/servers/whatsapp_bridge"

if [ ! -d "node_modules" ]; then
    echo "Installing WhatsApp bridge dependencies..."
    npm install
fi

# Kill any process already on port 3001
EXISTING_PID=$(lsof -ti:3001 2>/dev/null)
if [ -n "$EXISTING_PID" ]; then
    echo "[WA Bridge] Killing existing process on port 3001 (PID: $EXISTING_PID)..."
    kill -9 $EXISTING_PID 2>/dev/null
    sleep 1
fi

# Kill orphaned Puppeteer/Chrome processes holding the session lock
CHROME_PIDS=$(ps aux | grep -E ".wwebjs_auth/session" | grep -v grep | awk '{print $2}')
if [ -n "$CHROME_PIDS" ]; then
    echo "[WA Bridge] Cleaning up orphaned browser processes..."
    echo "$CHROME_PIDS" | xargs -r kill -9 2>/dev/null
    sleep 1
fi

# Remove Chrome SingletonLock if it exists
find .wwebjs_auth/session -name "SingletonLock" -delete 2>/dev/null

echo "Starting WhatsApp bridge on port 3001..."
node index.js
