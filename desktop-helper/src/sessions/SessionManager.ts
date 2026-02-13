import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface Session {
  id: string;
  nodeId: string;
  window: BrowserWindow;
  windowId: number;
  lastFrame: Buffer | null;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  async createSession(nodeId: string, ownerToken: string, title: string): Promise<Session> {
    console.log(`[Session] Creating window for node ${nodeId}`);

    // Create browser window with navigation
    const window = new BrowserWindow({
      width: 1280,
      height: 720,
      title: title || `Browser Session - ${nodeId.slice(0, 8)}`,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
      },
    });

    const windowId = window.id;

    // Set up window with navigation
    this.setupBrowserWindow(window, nodeId);

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

  private setupBrowserWindow(window: BrowserWindow, nodeId: string) {
    // Load a simple HTML page with iframe-based browser
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Browser Session</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
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
    #frame { 
      flex: 1; 
      width: 100%; 
      border: none;
      background: white;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <input type="text" id="url" placeholder="Enter URL" value="https://example.com" />
    <button onclick="navigate()">Go</button>
  </div>
  <iframe id="frame" src="https://example.com" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>
  <script>
    const urlInput = document.getElementById('url');
    const frame = document.getElementById('frame');
    
    function navigate() {
      let url = urlInput.value.trim();
      if (!url) return;
      if (!url.startsWith('http')) url = 'https://' + url;
      frame.src = url;
    }
    
    urlInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') navigate();
    });
    
    // Update URL bar when iframe navigates
    frame.addEventListener('load', function() {
      try {
        urlInput.value = frame.contentWindow.location.href;
      } catch(e) {
        // Cross-origin, can't read URL
      }
    });
  </script>
</body>
</html>
    `;

    // Write to temp file and load
    const tempPath = path.join(os.tmpdir(), `browser-session-${nodeId}.html`);
    fs.writeFileSync(tempPath, htmlContent);
    
    window.loadFile(tempPath);
    window.show();
    window.focus();
  }

  async captureFrame(nodeId: string): Promise<Buffer | null> {
    const session = this.sessions.get(nodeId);
    if (!session || !session.window || session.window.isDestroyed()) {
      return null;
    }

    try {
      const image = await session.window.webContents.capturePage();
      const buffer = image.toPNG();
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
