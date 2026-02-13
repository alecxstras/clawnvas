import { BrowserWindow, desktopCapturer } from 'electron';

// Simplified Session using HTTP frame streaming instead of WebRTC
export interface Session {
  id: string;
  nodeId: string;
  window: BrowserWindow;
  windowId: number;
  lastFrame: Buffer | null;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private frameInterval: NodeJS.Timeout | null = null;

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

    // Inject browser UI with webview
    window.webContents.executeJavaScript(`
      document.open();
      document.write(\`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1a1a1a; }
            .toolbar { 
              display: flex; 
              padding: 10px; 
              background: #2a2a2a; 
              border-bottom: 1px solid #333;
              gap: 10px;
            }
            input { 
              flex: 1; 
              padding: 8px 12px; 
              border: 1px solid #444; 
              border-radius: 4px; 
              background: #1a1a1a;
              color: #fff;
              font-size: 14px;
            }
            button { 
              padding: 8px 16px; 
              background: #3b82f6; 
              color: white; 
              border: none; 
              border-radius: 4px; 
              cursor: pointer;
              font-size: 14px;
            }
            button:hover { background: #2563eb; }
            #content { width: 100%; height: calc(100vh - 50px); }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <input type="text" id="url" placeholder="Enter URL (e.g., example.com)" />
            <button id="go">Go</button>
          </div>
          <webview id="content" src="https://example.com" style="width:100%;height:calc(100vh - 50px);"></webview>
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

    window.show();
    window.focus();

    console.log(`[Session] Window ${windowId} loaded and ready`);

    // Store session
    const session: Session = {
      id: nodeId,
      nodeId,
      window,
      windowId,
      lastFrame: null,
    };

    this.sessions.set(nodeId, session);

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
      return null;
    }

    try {
      const image = await session.window.webContents.capturePage();
      return image.toPNG();
    } catch (err) {
      console.error('[Capture] Failed:', err);
      return null;
    }
  }

  getLatestFrame(nodeId: string): Buffer | null {
    const session = this.sessions.get(nodeId);
    return session?.lastFrame || null;
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
