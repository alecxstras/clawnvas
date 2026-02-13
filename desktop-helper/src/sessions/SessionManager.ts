import { BrowserWindow, desktopCapturer } from 'electron';
import { io, Socket } from 'socket.io-client';

const SIGNALING_URL = process.env.SIGNALING_URL || 'http://localhost:3001';

interface Session {
  id: string;
  nodeId: string;
  window: BrowserWindow;
  windowId: number;
  socket: Socket;
  pc?: RTCPeerConnection;
  stream?: MediaStream;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  async createSession(nodeId: string, ownerToken: string, title: string): Promise<Session> {
    // Create visible browser window
    const window = new BrowserWindow({
      width: 1280,
      height: 720,
      title: title || `Browser Session - ${nodeId.slice(0, 8)}`,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const windowId = window.id;
    console.log(`[Session] Created window ${windowId} for node ${nodeId}`);

    // Load a simple browser interface with address bar
    const browserHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #bar { display: flex; padding: 10px; background: #f1f3f4; border-bottom: 1px solid #dadce0; align-items: center; }
    #url { flex: 1; padding: 8px 12px; border: 1px solid #dadce0; border-radius: 20px; font-size: 14px; outline: none; }
    #url:focus { border-color: #1a73e8; }
    #go { margin-left: 10px; padding: 8px 20px; background: #1a73e8; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    #go:hover { background: #1557b0; }
    #frame { width: 100%; height: calc(100vh - 60px); border: none; }
  </style>
</head>
<body>
  <div id="bar">
    <input type="text" id="url" placeholder="Enter URL..." value="https://www.google.com">
    <button id="go">Go</button>
  </div>
  <iframe id="frame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"></iframe>
  <script>
    const urlInput = document.getElementById('url');
    const goBtn = document.getElementById('go');
    const frame = document.getElementById('frame');
    
    function navigate() {
      let url = urlInput.value.trim();
      if (!url) return;
      if (!url.match(/^https?:\\/\\//)) url = 'https://' + url;
      frame.src = url;
    }
    
    goBtn.onclick = navigate;
    urlInput.onkeypress = (e) => { if (e.key === 'Enter') navigate(); };
    
    // Load initial page
    navigate();
  </script>
</body>
</html>`;
    
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(browserHTML)}`);

    // Ensure window is visible and focused
    window.show();
    window.focus();

    // Wait a moment for the window to fully render before capture
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log(`[Session] Window ${windowId} loaded and ready`);

    // Show dev tools for debugging (remove in production)
    // window.webContents.openDevTools();

    // Connect to signaling server using native WebSocket
    const socket = io(SIGNALING_URL, {
      path: '/signal',
    });

    const session: Session = {
      id: nodeId,
      nodeId,
      window,
      windowId,
      socket,
    };

    // Setup signaling handlers
    socket.on('connect', () => {
      console.log('[Signaling] Connected to server');
      socket.emit('publish', { nodeId, ownerToken });

      // Start heartbeat every 5 seconds to validate signaling loop
      const heartbeatInterval = setInterval(() => {
        if (session.socket.connected) {
          session.socket.emit('heartbeat', {
            nodeId,
            payload: {
              timestamp: Date.now(),
              windowTitle: window.getTitle(),
              url: window.webContents.getURL(),
            },
          });
        }
      }, 5000);

      // Store interval for cleanup
      (session as any).heartbeatInterval = heartbeatInterval;
    });

    socket.on('join', async (data: { viewerToken: string }) => {
      console.log('[Signaling] Viewer joining:', data.viewerToken);
      // Viewer is ready - set up WebRTC with desktop capture
      await this.setupWebRTC(session);
    });

    socket.on('answer', async (data: { sdp: RTCSessionDescriptionInit }) => {
      console.log('[Signaling] Received answer');
      if (session.pc) {
        await session.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.log('[WebRTC] Remote description set (answer)');
      }
    });

    socket.on('ice', async (data: { candidate: RTCIceCandidateInit }) => {
      if (session.pc) {
        await session.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    socket.on('revoke', () => {
      console.log('[Session] Revoked, stopping...');
      this.stopSession(nodeId);
    });

    // Handle window close
    window.on('closed', () => {
      this.stopSession(nodeId);
    });

    this.sessions.set(nodeId, session);
    return session;
  }

  private async setupWebRTC(session: Session): Promise<void> {
    try {
      console.log('[WebRTC] Setting up with desktop capture...');

      // Create peer connection first
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      });

      session.pc = pc;

      // Log connection state changes
      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE state:', pc.iceConnectionState);
      };

      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', pc.connectionState);
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          session.socket.emit('ice', {
            nodeId: session.nodeId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      // Get desktop capture stream
      const stream = await this.startCapture(session);
      session.stream = stream;

      // Add tracks to peer connection
      session.stream.getTracks().forEach((track) => {
        pc.addTrack(track, session.stream!);
        console.log('[WebRTC] Added track:', track.kind, track.label);
      });

      // Create and send offer
      console.log('[WebRTC] Creating offer...');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      session.socket.emit('offer', {
        nodeId: session.nodeId,
        sdp: offer,
      });
      console.log('[WebRTC] Offer sent');

    } catch (error) {
      console.error('[WebRTC] Setup failed:', error);
      // Notify web app of error
      session.socket.emit('capture-error', {
        nodeId: session.nodeId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  private async startCapture(session: Session): Promise<MediaStream> {
    try {
      console.log('[Capture] Getting desktop sources...');

      // Get all window sources
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 0, height: 0 },
      });

      // Debug: log all available sources
      console.log(`[Capture] Found ${sources.length} sources:`);
      sources.forEach((s) => {
        console.log(`  - "${s.name}" (ID: ${s.id})`);
      });

      // Match by nodeId in window title or by window ID
      const nodeIdShort = session.nodeId.slice(0, 8);
      const source = sources.find((s) => {
        const matchesNodeId = s.name.includes(nodeIdShort);
        const matchesTitle = s.name.includes('Browser Session');
        const matchesWindowId = s.id.includes(session.windowId.toString());
        return matchesNodeId || matchesTitle || matchesWindowId;
      });

      if (!source) {
        console.error('[Capture] Window not found in sources!');
        console.error(`[Capture] Looking for: "${session.nodeId}" or window ID ${session.windowId}`);
        
        // On macOS, screen recording permission might be denied
        if (process.platform === 'darwin') {
          console.error('[Capture] macOS: Ensure Screen Recording permission is granted to this app');
          console.error('[Capture] System Preferences → Security & Privacy → Screen Recording');
        }
        
        throw new Error('Window not found - check screen recording permissions');
      }

      console.log(`[Capture] Found source: ${source.name} (${source.id})`);

      // Get user media with desktop source
      console.log('[Capture] Starting getUserMedia with desktop source...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // @ts-ignore - Electron-specific API
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id,
            minWidth: 1280,
            maxWidth: 1920,
            minHeight: 720,
            maxHeight: 1080,
            maxFrameRate: 30,
          },
        },
      } as any);

      console.log('[Capture] Desktop capture started successfully');
      console.log(`[Capture] Stream has ${stream.getVideoTracks().length} video track(s)`);
      
      return stream;

    } catch (err) {
      const errorMsg = (err as Error).message;
      console.error('[Capture] Failed:', errorMsg);
      
      // Send error to web app
      session.socket.emit('capture-error', {
        nodeId: session.nodeId,
        error: errorMsg,
      });

      // Fallback to webcam with warning
      console.log('[Capture] Falling back to webcam');
      return navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }
  }

  async stopSession(nodeId: string): Promise<void> {
    const session = this.sessions.get(nodeId);
    if (!session) return;

    console.log(`[Session] Stopping ${nodeId}`);

    // Clear heartbeat interval
    if ((session as any).heartbeatInterval) {
      clearInterval((session as any).heartbeatInterval);
    }

    // Close peer connection
    session.pc?.close();

    // Stop stream tracks
    session.stream?.getTracks().forEach((track) => track.stop());

    // Close socket
    session.socket.disconnect();

    // Close window
    if (!session.window.isDestroyed()) {
      session.window.close();
    }

    this.sessions.delete(nodeId);
    console.log(`[Session] ${nodeId} stopped`);
  }

  getActiveSessions(): Array<{ nodeId: string; title: string }> {
    return Array.from(this.sessions.values()).map((s) => ({
      nodeId: s.nodeId,
      title: s.window.getTitle(),
    }));
  }
}
