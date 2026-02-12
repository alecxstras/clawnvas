import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { SessionManager } from './sessions/SessionManager';

// macOS Screen Capture permissions (must be before app.ready)
app.commandLine.appendSwitch('enable-features', 'ScreenCaptureKit');
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');

// Keep reference to session manager
let sessionManager: SessionManager;

// Express HTTP server for web app to trigger window creation
const httpApp = express();

// CORS - allow web app to call desktop helper
httpApp.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false
}));

httpApp.use(express.json());

function createMainWindow() {
  // Create the main window (optional - could be tray-only)
  const mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load a simple status page
  mainWindow.loadURL('data:text/html,<h1>Browser Canvas Helper</h1><p>Running...</p>');

  // Hide to tray in production
  // mainWindow.hide();
}

app.whenReady().then(() => {
  createMainWindow();

  // Initialize session manager
  sessionManager = new SessionManager();

  // Start HTTP server for web app integration
  setupHttpServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setupHttpServer() {
  // POST /create-session - Web app calls this to open a browser window
  httpApp.post('/create-session', async (req, res) => {
    const { nodeId, ownerToken, title } = req.body;

    if (!nodeId) {
      return res.status(400).json({ error: 'nodeId required' });
    }

    console.log(`[HTTP] Creating window for session: ${nodeId}`);

    try {
      const session = await sessionManager.createSession(
        nodeId,
        ownerToken || 'local-test-token',
        title || 'Browser Session'
      );
      
      res.json({ 
        success: true, 
        nodeId: session.id,
        message: 'Window created and ready for WebRTC'
      });
    } catch (error) {
      console.error('[HTTP] Failed to create session:', error);
      res.status(500).json({ 
        error: 'Failed to create session',
        message: (error as Error).message 
      });
    }
  });

  // GET /health - Health check
  httpApp.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      activeSessions: sessionManager.getActiveSessions().length 
    });
  });

  // Start listening
  httpApp.listen(3002, () => {
    console.log('[DESKTOP] HTTP server listening on port 3002');
    console.log('[DESKTOP] POST http://localhost:3002/create-session');
  });
}

// IPC handlers for communication with renderer (fallback)
ipcMain.handle('create-session', async (event, { nodeId, ownerToken, title }) => {
  try {
    const session = await sessionManager.createSession(nodeId, ownerToken, title);
    return { success: true, sessionId: session.id };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('stop-session', async (event, { nodeId }) => {
  try {
    await sessionManager.stopSession(nodeId);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('get-sessions', () => {
  return sessionManager.getActiveSessions();
});
