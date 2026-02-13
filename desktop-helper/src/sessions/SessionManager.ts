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
        webviewTag: true,
        webSecurity: false,
        allowRunningInsecureContent: true,
      },
    });

    const windowId = window.id;
    console.log(`[Session] Created window ${windowId} for node ${nodeId}`);

    // Load browser interface
    window.loadURL('about:blank');
    
    // Set up browser UI via executeJavaScript
    window.webContents.executeJavaScript(`
      document.open();
      document.write(\`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: system-ui, sans-serif; overflow: hidden; }
            #bar { display: flex; padding: 10px; background: #333; border-bottom: 1px solid #555; }
            #url { flex: 1; padding: 10px; border: none; border-radius: 4px; font-size: 14px; }
            #go { margin-left: 10px; padding: 10px 20px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
            #go:hover { background: #0052a3; }
            #content { width: 100%; height: calc(100vh - 60px); border: none; }
          </style>
        </head>
        <body>
          <div id="bar">
            <input type="text" id="url" placeholder="Enter URL (e.g., example.com)..." value="https://example.com">
            <button id="go" onclick="go()">Go</button>
          </div>
          <webview id="content" src="https://example.com" style="width:100%;height:calc(100vh - 60px);"></webview>
          <script>
            function go() {
              var url = document.getElementById('url').value.trim();
              if (!url) return;
              if (url.indexOf('http') !== 0) url = 'https://' + url;
              document.getElementById('content').src = url;
            }
            document.getElementById('url').addEventListener('keypress', function(e) {
              if (e.key === 'Enter') go();
            });
          </script>
        </body>
        </html>
      \`);
      document.close();
    `);

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
      console.log('[Signaling] ========== CONNECTED TO SERVER ==========');
      console.log('[Signaling] Publishing as node:', nodeId);
      socket.emit('publish', { nodeId, ownerToken });
    });

    socket.on('connect_error', (err: any) => {
      console.error('[Signaling] Connection error:', err.message);
    });

    socket.on('disconnect', (reason: string) => {
      console.log('[Signaling] Disconnected:', reason);
    });

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
      console.log('[Signaling] ========== VIEWER JOINING ==========');
      console.log('[Signaling] Viewer token:', data.viewerToken);
      console.log('[Signaling] Setting up WebRTC...');
      // Viewer is ready - set up WebRTC with desktop capture
      await this.setupWebRTC(session);
    });

    socket.on('answer', async (data: { sdp: RTCSessionDescriptionInit }) => {
      console.log('[Signaling] ========== RECEIVED ANSWER ==========');
      if (session.pc) {
        console.log('[WebRTC] Setting remote description (answer)...');
        await session.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.log('[WebRTC] Remote description set successfully');
      } else {
        console.error('[WebRTC] No peer connection when answer received!');
      }
    });

    socket.on('ice', async (data: { candidate: RTCIceCandidateInit }) => {
      console.log('[Signaling] Received ICE candidate from viewer');
      if (session.pc) {
        try {
          await session.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log('[WebRTC] ICE candidate added');
        } catch (err) {
          console.error('[WebRTC] Failed to add ICE candidate:', err);
        }
      } else {
        console.error('[WebRTC] No peer connection when ICE received!');
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
      console.log('[WebRTC] ========== SETTING UP WEBRTC ==========');

      // Create peer connection first
      console.log('[WebRTC] Creating RTCPeerConnection...');
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      });

      session.pc = pc;

      // Log connection state changes
      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE state changed:', pc.iceConnectionState);
      };

      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state changed:', pc.connectionState);
      };

      pc.onicegatheringstatechange = () => {
        console.log('[WebRTC] ICE gathering state:', pc.iceGatheringState);
      };

      pc.onicecandidateerror = (event: any) => {
        console.error('[WebRTC] ICE candidate error:', event.errorText, 'code:', event.errorCode);
      };

      // Handle ICE candidates - TRICKLE ICE: send as they arrive
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('[WebRTC] Sending ICE candidate to viewer:', event.candidate.candidate.substring(0, 50) + '...');
          session.socket.emit('ice', {
            nodeId: session.nodeId,
            candidate: event.candidate.toJSON(),
          });
        } else {
          console.log('[WebRTC] ICE gathering complete (null candidate)');
        }
      };

      // Get desktop capture stream
      console.log('[WebRTC] Getting desktop capture stream...');
      const stream = await this.startCapture(session);
      session.stream = stream;
      console.log('[WebRTC] Got stream with', stream.getTracks().length, 'tracks');

      // Add tracks to peer connection
      console.log('[WebRTC] Adding tracks to peer connection...');
      session.stream.getTracks().forEach((track, i) => {
        console.log(`[WebRTC] Adding track ${i}:`, track.kind, track.label, 'enabled:', track.enabled);
        const sender = pc.addTrack(track, session.stream!);
        console.log('[WebRTC] Track added, sender created:', sender);
      });

      // Create and send offer
      console.log('[WebRTC] Creating offer...');
      const offer = await pc.createOffer();
      console.log('[WebRTC] Offer created, setting local description...');
      await pc.setLocalDescription(offer);
      console.log('[WebRTC] Local description set');

      console.log('[WebRTC] Sending offer to signaling server...');
      session.socket.emit('offer', {
        nodeId: session.nodeId,
        sdp: offer,
      });
      console.log('[WebRTC] ========== OFFER SENT ==========');

    } catch (error) {
      console.error('[WebRTC] ========== SETUP FAILED ==========');
      console.error('[WebRTC] Error:', error);
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
        
        // Fallback: try to capture entire screen
        const screenSource = sources.find(s => s.name === 'Entire Screen' || s.name.includes('Screen'));
        if (screenSource) {
          console.log('[Capture] Falling back to entire screen capture');
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: screenSource.id,
                minWidth: 1280,
                maxWidth: 1920,
                minHeight: 720,
                maxHeight: 1080,
                maxFrameRate: 30,
              },
            },
          } as any);
          console.log('[Capture] Screen capture started (fallback)');
          return stream;
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
      
      // Log track info for debugging
      stream.getVideoTracks().forEach((track, i) => {
        console.log(`[Capture] Track ${i}: ${track.label}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
      });
      
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
