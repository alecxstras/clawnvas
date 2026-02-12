import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { SessionManager } from './sessions/SessionManager';

// Keep reference to session manager
let sessionManager: SessionManager;

function createWindow() {
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
  createWindow();

  // Initialize session manager
  sessionManager = new SessionManager();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for communication with renderer
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
