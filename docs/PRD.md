# tldraw Browser Canvas — Product Requirements Document

## 1. Objective

Enable users to create live, isolated browser sessions from a desktop helper and display them as resizable nodes inside a collaborative tldraw canvas.

### V1 Deliverables
- [ ] Create sandbox browser session from web app
- [ ] Display live video stream inside a custom tldraw shape
- [ ] Allow limited viewers (P2P, max 3)
- [ ] Allow session owner to stop stream

### V1 Explicitly NOT Included
- Remote control
- Structured DOM extraction  
- Artifact persistence
- SFU/media server

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              WEB APP                                     │
│                         (tldraw-based canvas)                            │
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │  BrowserNode    │    │  BrowserNode    │    │  BrowserNode    │     │
│  │  Shape (live)   │    │  Shape (idle)   │    │  Shape (live)   │     │
│  │  ┌───────────┐  │    │                 │    │  ┌───────────┐  │     │
│  │  │ <video>   │  │    │   [Connect]    │    │  │ <video>   │  │     │
│  │  │  Stream   │  │    │                 │    │  │  Stream   │  │     │
│  │  └───────────┘  │    │                 │    │  └───────────┘  │     │
│  └────────┬────────┘    └─────────────────┘    └────────┬────────┘     │
│           │                                              │              │
│           │          WebSocket Signaling                 │              │
│           └──────────────────┬───────────────────────────┘              │
│                              │                                          │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SIGNALING SERVER                                 │
│                    (WebRTC offer/answer exchange)                        │
│                                                                          │
│  Endpoints:                                                              │
│  - POST /nodes                    → Create new node                      │
│  - POST /nodes/:id/viewer-token   → Get viewer JWT                     │
│  - POST /nodes/:id/revoke         → Stop session                       │
│  - WS /signal                     → WebRTC signaling                   │
│                                                                          │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                           │  WebRTC PeerConnection
                           │  (P2P - max 3 viewers per node)
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        DESKTOP HELPER (Electron)                         │
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │ Chromium Window │    │ Chromium Window │    │ Chromium Window │     │
│  │ (Node: abc-123) │    │ (Node: def-456) │    │ (Node: ghi-789) │     │
│  │                 │    │                 │    │                 │     │
│  │  ┌───────────┐  │    │  ┌───────────┐  │    │  ┌───────────┐  │     │
│  │  │ Browser   │  │    │  │ Browser   │  │    │  │ Browser   │  │     │
│  │  │ Session   │  │    │  │ Session   │  │    │  │ Session   │  │     │
│  │  └───────────┘  │    │  └───────────┘  │    │  └───────────┘  │     │
│  │                 │    │                 │    │                 │     │
│  │  Capturing      │    │  Capturing      │    │  Capturing      │     │
│  │  viewport at    │    │  viewport at    │    │  viewport at    │     │
│  │  15-30fps       │    │  15-30fps       │    │  15-30fps       │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│                                                                          │
│  Responsibilities:                                                       │
│  - One BrowserWindow per node                                            │
│  - Stream viewport via WebRTC                                            │
│  - Connect to signaling server                                           │
│  - Stop session when revoked                                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Components

### 3.1 Web App (tldraw-based canvas)

**Framework:** Next.js + tldraw

**Key Features:**
- Custom `BrowserNode` shape type
- Right-click context menu: "Add Browser Session"
- WebSocket connection to signaling server
- Video element attachment for streams

**BrowserNode Shape Properties:**
```typescript
interface BrowserNodeShape {
  id: string;
  type: 'browser-node';
  x: number;
  y: number;
  w: number;
  h: number;
  nodeId: string;
  ownerId: string;
  title: string;
  status: 'idle' | 'connecting' | 'live' | 'offline';
  viewerCount: number;
  createdAt: number;
}
```

### 3.2 Desktop Helper (Electron)

**Framework:** Electron + TypeScript

**Key Features:**
- One `BrowserWindow` per active node
- Each window runs isolated Chromium session
- `getUserMedia` capture of window contents
- WebRTC peer connection to viewers

**Window Behavior:**
- Headful (visible) for V1
- Window title matches node title
- Auto-close when session revoked
- 720p max capture resolution

### 3.3 Signaling Server

**Framework:** Node.js + WebSocket (ws library)

**Responsibilities:**
- JWT token generation/validation
- WebRTC signaling relay (offer/answer/ICE)
- Session lifecycle management
- Viewer count enforcement (max 3)

**API Endpoints:**

```typescript
// POST /nodes
Request: { projectId: string }
Response: { nodeId: string, ownerToken: string }

// POST /nodes/:id/viewer-token
Response: { viewerToken: string }

// POST /nodes/:id/revoke
Response: { success: true }
```

**WebSocket Protocol:**
```typescript
type SignalMessage =
  | { type: 'publish', nodeId: string, ownerToken: string }
  | { type: 'join', nodeId: string, viewerToken: string }
  | { type: 'offer', nodeId: string, sdp: RTCSessionDescription }
  | { type: 'answer', nodeId: string, sdp: RTCSessionDescription }
  | { type: 'ice', nodeId: string, candidate: RTCIceCandidate }
  | { type: 'revoke', nodeId: string }
  | { type: 'viewer-count', nodeId: string, count: number }
```

---

## 4. User Flows

### 4.1 Create Browser Session

1. User right-clicks on canvas
2. Selects "Add Browser Session"
3. Web app calls `POST /nodes`
4. Backend returns `nodeId` + `ownerToken`
5. BrowserNode shape created on canvas
6. Web app signals desktop helper via local protocol/WS
7. Desktop helper opens new Chromium window
8. Helper connects to signaling server as publisher
9. Node status → "live"

### 4.2 View Stream

1. Viewer clicks on BrowserNode
2. Web app calls `POST /nodes/:id/viewer-token`
3. Backend returns `viewerToken`
4. Viewer connects to signaling WS
5. Sends `join` message
6. WebRTC P2P connection established
7. Stream renders in node's `<video>` element
8. Viewer count increments

### 4.3 Stop Session

1. Owner clicks "Stop" button on node
2. Web app calls `POST /nodes/:id/revoke`
3. Backend invalidates future viewer tokens
4. Signaling server sends `revoke` to helper
5. Helper closes Chromium window, stops capture
6. Node status → "offline"

---

## 5. Security Model (V1)

- Projects are invite-only
- All tokens short-lived (15 min expiry)
- `ownerToken` required to publish stream
- `viewerToken` required to join stream
- Revoke invalidates future connections (existing stay)
- No stream persistence/recording
- Max 3 viewers per node (enforced server-side)

---

## 6. Technical Constraints

| Constraint | Value |
|------------|-------|
| Max viewers per node | 3 |
| Stream resolution | 720p max |
| Frame rate | 15-30 fps target |
| Token expiry | 15 minutes |
| Idle timeout | 30 minutes auto-stop |
| P2P only | No SFU/media server in V1 |

---

## 7. File Structure

```
tldraw-browser-canvas/
├── web-app/                 # Next.js + tldraw
│   ├── app/
│   ├── components/
│   │   ├── BrowserNode.tsx
│   │   └── Canvas.tsx
│   ├── hooks/
│   │   ├── useSignaling.ts
│   │   └── useWebRTC.ts
│   └── lib/
│       └── tldraw-config.ts
│
├── desktop-helper/          # Electron app
│   ├── src/
│   │   ├── main.ts
│   │   ├── preload.ts
│   │   └── sessions/
│   │       ├── SessionManager.ts
│   │       └── BrowserWindow.ts
│   └── package.json
│
├── signaling-server/        # Node.js WebSocket server
│   ├── src/
│   │   ├── server.ts
│   │   ├── routes.ts
│   │   ├── websocket.ts
│   │   └── auth.ts
│   └── package.json
│
└── docs/
    └── PRD.md
```

---

## 8. Success Metrics

- Nodes created per project per day
- Average active session duration
- % of sessions with at least one viewer
- % of sessions reused

---

## 9. Future Phases (Post-V1)

- Offscreen rendering (no visible window)
- Remote control (input forwarding)
- Structured telemetry/DOM extraction
- Artifact persistence
- Multi-session clustering
- Agent API for automation

---

*Document Version: 1.0*
*Last Updated: 2026-02-12*
*Status: Ready for Development*
