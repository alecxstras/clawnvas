# Signaling Handshake Implementation

## What Was Added

### 1. Server (signaling-server/src/websocket.ts)
- **`ping`/`pong` handlers** - Basic connectivity test
- **`heartbeat` handler** - Desktop sends heartbeat every 5s, server broadcasts to viewers
- Heartbeat validates: Desktop → Server → Web App signaling loop

### 2. Desktop Helper (desktop-helper/src/sessions/SessionManager.ts)
- Sends heartbeat every 5 seconds after connecting
- Includes window title and current URL in payload
- Clears interval on session stop

### 3. Web App (web-app/app/components/BrowserNode.tsx)
- Displays heartbeat status in node header
- Shows "● Xs ago" when heartbeats are flowing
- Logs heartbeats to console for debugging

### 4. Test Script (scripts/test-signaling.ts)
- Standalone test that validates the full signaling loop
- No UI needed - just REST API and WebSocket testing

## Quick Test

```bash
# Terminal 1: Start server
cd signaling-server
npm install
npm run dev

# Terminal 2: Run test script (from project root)
cd ..
npx ts-node scripts/test-signaling.ts
```

Expected output:
```
🧪 Testing signaling handshake...

1️⃣ Creating node via REST API...
✅ Node created: abc-123...

2️⃣ Connecting desktop (publisher) via WebSocket...
✅ Desktop WebSocket connected
✅ Desktop registered as publisher

...

6️⃣ Testing heartbeat flow (Desktop -> Server -> Web App)...
✅ Heartbeat received by web app!

🎉 All signaling tests passed!
```

## Next Step: Mock WebRTC

Once signaling works, update desktop-helper to send a mock WebRTC offer with a webcam stream instead of heartbeats. This validates SDP exchange before touching desktop capture.
