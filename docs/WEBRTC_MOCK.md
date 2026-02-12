# WebRTC Mock Implementation

## What Was Implemented

Mock WebRTC flow using webcam as stand-in for desktop capture. This validates the peer connection handshake before integrating Electron's desktopCapturer.

## Changes Made

### 1. Desktop Helper (SessionManager.ts)
- **New method: `setupMockWebRTC()`**
  - Uses `getUserMedia({ video: true })` to get webcam stream
  - Creates RTCPeerConnection with STUN server
  - Logs ICE connection state changes
  - Creates offer → sends to signaling server when viewer joins
  - Handles incoming answer and ICE candidates
  
- **Added connection state logging:**
  - `iceConnectionState` changes logged
  - `connectionState` changes logged
  - All WebRTC operations logged for debugging

### 2. Web App (useWebRTC.ts)
- **Enhanced logging:**
  - Peer connection creation logged
  - Track reception logged
  - ICE candidate generation logged
  - Connection state changes logged
  - Offer/answer exchange logged

### 3. Web App (BrowserNode.tsx)
- **Connection state display:**
  - Shows WebRTC connection state in footer during connection
  - Displays "checking", "connected", "completed", etc.
  - Automatically updates status to "live" when connected
  
- **Remote stream handling:**
  - Attaches stream to video element
  - Logs when stream is received
  - Logs when stream is attached to video

### 4. Signaling Server
- Already handles offer/answer/ice relay (no changes needed)

## Test Scripts

### 1. Signaling Test (from before)
```bash
npx ts-node scripts/test-signaling.ts
```

### 2. WebRTC Mock Test (new)
```bash
npx ts-node scripts/test-webrtc-mock.ts
```

## Validation Steps

1. **Start signaling server:**
```bash
cd signaling-server && npm run dev
```

2. **Run mock WebRTC test:**
```bash
npx ts-node scripts/test-webrtc-mock.ts
```

Expected output:
```
🧪 Testing WebRTC mock handshake...

1️⃣ Creating node via REST API...
✅ Node created: abc-123...

...

4️⃣ Simulating WebRTC handshake...
   [Desktop] Creating peer connection...
   [Desktop] Creating offer...
   [Desktop] Sending offer to web app...
   [Web App] Waiting for offer...
   [Web App] Received offer, creating answer...
   [Web App] Sending answer to desktop...
   [Desktop] Waiting for answer...
   [Desktop] Received answer

5️⃣ Simulating ICE candidate exchange...
   [Desktop] Sending ICE candidate...
   [Web App] Received ICE candidate

🎉 WebRTC mock handshake test passed!
```

3. **Test in browser:**
```bash
cd web-app && npm run dev
```
- Click "Add Browser Session"
- Open the desktop helper
- Click "Connect" on the node
- Should see: Connection state → checking → connected → completed
- Video element should show webcam feed

## Next: Real Desktop Capture

Once mock works, swap this in SessionManager.ts:

```typescript
// Replace this:
const stream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: false,
});

// With this:
const sources = await desktopCapturer.getSources({
  types: ['window'],
  thumbnailSize: { width: 1280, height: 720 },
});
const windowSource = sources.find(s => s.name.includes(session.nodeId.slice(0, 8)));
const stream = await navigator.mediaDevices.getUserMedia({
  audio: false,
  video: {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: windowSource.id,
      minWidth: 1280,
      maxWidth: 1280,
      minHeight: 720,
      maxHeight: 720,
    },
  } as any,
});
```

## Troubleshooting

**Issue:** ICE connection stays at "checking"  
**Fix:** Add to Electron main.ts:
```typescript
app.commandLine.appendSwitch('webrtc-ip-handling-policy', 'disable_non_proxied_udp');
```

**Issue:** No video in browser  
**Check:** Look for console logs - stream should be received and attached

**Issue:** Offer not received  
**Check:** Signaling server logs - viewer join should trigger join event
