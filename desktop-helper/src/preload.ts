import { contextBridge, ipcRenderer } from 'electron';

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  createSession: (params: { nodeId: string; ownerToken: string; title: string }) =>
    ipcRenderer.invoke('create-session', params),
  stopSession: (params: { nodeId: string }) =>
    ipcRenderer.invoke('stop-session', params),
  getSessions: () => ipcRenderer.invoke('get-sessions'),
});
