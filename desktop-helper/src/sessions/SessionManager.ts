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

    // Load about:blank initially (user can navigate)
    await window.loadURL('about:blank');

    // Show dev tools for debugging (remove in production)
    window.webContents.openDevTools();

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
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 }, // No thumbnails needed
      });

      // Debug: log all available sources
      console.log('[Capture] Available sources:');
      sources.forEach((s) => {
        console.log(`  - ${s.name} (ID: ${s.id})`);
      });

      // Match by nodeId in window title or by window ID
      const nodeIdShort = session.nodeId.slice(0, 8);
      const source = sources.find((s) => {
        const matchesNodeId = s.name.includes(nodeIdShort);
        const matchesWindowId = s.id.includes(session.windowId.toString());
        return matchesNodeId || matchesWindowId;
      });

      if (!source) {
        console.warn('[Capture] Window not found, falling back to webcam');
        // Fallback to webcam for testing
        return navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      console.log(`[Capture] Found source: ${source.name}`);

      // Get user media with desktop source
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

      console.log('[Capture] Desktop capture started');
      return stream;

    } catch (err) {
      console.error('[Capture] Failed:', err);
      
      // Send error to web app
      session.socket.emit('capture-error', {
        nodeId: session.nodeId,
        error: (err as Error).message,
      });

      // Fallback to webcam
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
