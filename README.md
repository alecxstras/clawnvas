# tldraw Browser Canvas

Live browser sessions as resizable nodes in a collaborative tldraw canvas.

## Overview

This project enables users to create isolated browser sessions from a desktop helper app and display them as resizable, interactive nodes inside a tldraw canvas. Multiple users can view these sessions via P2P WebRTC streaming.

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│   Web App   │◄──────────────────►│ Signaling Server│
│  (tldraw)   │                    │   (Node.js)     │
└──────┬──────┘                    └────────┬────────┘
       │                                     │
       │ WebRTC (P2P)                        │
       │                                     │
       ▼                                     ▼
┌─────────────┐                       ┌─────────────┐
│   Viewers   │                       │   Desktop   │
│  (in canvas)│                       │   Helper    │
└─────────────┘                       │  (Electron) │
                                      └──────┬──────┘
                                             │
                                             │ Capture
                                             ▼
                                      ┌─────────────┐
                                      │  Chromium   │
                                      │   Window    │
                                      └─────────────┘
```

## Quick Start

### 1. Install Dependencies

```bash
npm run install:all
```

### 2. Configure Environment

Create `.env` files:

**signaling-server/.env:**
```
PORT=3001
JWT_SECRET=your-secret-key-here
```

**web-app/.env.local:**
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SIGNALING_URL=ws://localhost:3001
```

### 3. Start Development Servers

Terminal 1 - Signaling Server:
```bash
npm run dev:server
```

Terminal 2 - Web App:
```bash
npm run dev:web
```

Terminal 3 - Desktop Helper:
```bash
npm run dev:desktop
```

### 4. Usage

1. Open http://localhost:3000 in your browser
2. Click "Add Browser Session" to create a new node
3. The desktop helper will open a Chromium window
4. Other users can click the node to view the stream
5. Max 3 concurrent viewers per node

## Project Structure

```
tldraw-browser-canvas/
├── docs/
│   └── PRD.md              # Product requirements
├── signaling-server/       # WebSocket + REST API
│   ├── src/
│   │   ├── server.ts       # Express server
│   │   ├── routes.ts       # REST endpoints
│   │   └── websocket.ts    # WebSocket handlers
│   └── package.json
├── web-app/                # Next.js + tldraw
│   ├── app/
│   │   ├── components/
│   │   │   ├── Canvas.tsx  # Main canvas
│   │   │   └── BrowserNode.tsx  # Custom shape
│   │   ├── hooks/
│   │   │   ├── useSignaling.ts
│   │   │   └── useWebRTC.ts
│   │   └── lib/
│   │       └── canvas.ts
│   └── package.json
└── desktop-helper/         # Electron app
    ├── src/
    │   ├── main.ts         # Entry point
    │   ├── preload.ts      # IPC bridge
    │   └── sessions/
    │       └── SessionManager.ts
    └── package.json
```

## API Endpoints

### REST

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/nodes` | Create new browser session |
| POST | `/nodes/:id/viewer-token` | Get viewer token |
| POST | `/nodes/:id/revoke` | Stop session |
| GET | `/health` | Health check |

### WebSocket

Connect to `ws://localhost:3001/signal`

Messages:
- `publish` - Register as publisher (desktop)
- `join` - Register as viewer
- `offer` - WebRTC offer
- `answer` - WebRTC answer
- `ice` - ICE candidate
- `viewer-count` - Viewer count update

## Security (V1)

- All tokens expire after 15 minutes
- Max 3 viewers per node
- Owner token required to publish
- Viewer token required to join
- Revoke invalidates future connections
- No stream persistence

## Roadmap

### V1 (Current)
- [x] Basic WebRTC streaming
- [x] Desktop capture
- [x] P2P viewing (max 3)
- [x] Session lifecycle

### Future
- [ ] Offscreen rendering
- [ ] Remote control
- [ ] DOM telemetry
- [ ] Artifact persistence
- [ ] SFU for larger audiences

## License

MIT
