import { BrowserWindow } from 'electron';

export interface Session {
  id: string;
  nodeId: string;
  window: BrowserWindow;
  windowId: number;
  lastFrame: Buffer | null;
}

// Simple browser UI as data URL
const BROWSER_UI = `
data:text/html,<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
      background: #1a1a1a;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .toolbar { 
      display: flex; 
      padding: 8px 12px; 
      background: #2a2a2a; 
      border-bottom: 1px solid #444;
      gap: 8px;
      align-items: center;
    }
    input { 
      flex: 1; 
      padding: 8px 12px; 
      border: 1px solid #555; 
      border-radius: 6px; 
      background: #1a1a1a;
      color: #fff;
      font-size: 14px;
      outline: none;
    }
    input:focus { border-color: #3b82f6; }
    button { 
      padding: 8px 16px; 
      background: #3b82f6; 
      color: white; 
      border: none; 
      border-radius: 6px; 
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }
    button:hover { background: #2563eb; }
    #content { 
      flex: 1; 
      width: 100%; 
      border: none;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <input type="text" id="url" placeholder="Enter URL (e.g., google.com)" value="https://example.com" />
    <button onclick="go()">Go</button>
  </div>
  <webview id="content" src="https://example.com" autosize="on" style="width:100%;height:100%;"></webview>
  <script>
    function go() {
      var url = document.getElementById('url').value.trim();
      if (!url) return;
      if (!url.startsWith('http')) url = 'https://' + url;
      document.getElementById('content').src = url;
    }
    document.getElementById('url').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') go();
    });
  </script>
</body>
</html>
`;

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  async createSession(nodeId: string, ownerToken: string, title: string): Promise<Session> {
    console.log(`[Session] Creating window for node ${nodeId}`);

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

    // Load the browser UI
    try {
      await window.loadURL(BROWSER_UI);
      console.log(`[Session] Window ${windowId} loaded`);
    } catch (err) {
      console.error('[Session] Failed to load UI:', err);
      throw err;
    }

    window.show();
    window.focus();

    // Store session
    const session: Session = {
      id: nodeId,
      nodeId,
      window,
      windowId,
      lastFrame: null,
    };

    this.sessions.set(nodeId, session);
    console.log(`[Session] Session ${nodeId} ready`);

    // Handle window close
    window.on('closed', () => {
      this.sessions.delete(nodeId);
      console.log(`[Session] ${nodeId} stopped`);
    });

    return session;
  }

  async captureFrame(nodeId: string): Promise<Buffer | null> {
    const session = this.sessions.get(nodeId);
    if (!session || !session.window || session.window.isDestroyed()) {
      console.log('[Capture] Session not found or window destroyed');
      return null;
    }

    try {
      const image = await session.window.webContents.capturePage();
      const buffer = image.toPNG();
      console.log(`[Capture] Frame captured: ${buffer.length} bytes`);
      return buffer;
    } catch (err) {
      console.error('[Capture] Failed:', err);
      return null;
    }
  }

  storeFrame(nodeId: string, frame: Buffer): void {
    const session = this.sessions.get(nodeId);
    if (session) {
      session.lastFrame = frame;
    }
  }

  async stopSession(nodeId: string): Promise<void> {
    const session = this.sessions.get(nodeId);
    if (session) {
      if (!session.window.isDestroyed()) {
        session.window.close();
      }
      this.sessions.delete(nodeId);
    }
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}
