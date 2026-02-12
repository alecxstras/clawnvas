import { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { nodes } from './routes';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

interface Client {
  ws: WebSocket;
  nodeId?: string;
  type?: 'publisher' | 'viewer';
  token?: string;
}

const clients = new Map<WebSocket, Client>();

export function createWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/signal',
  });

  wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket connection');
    clients.set(ws, { ws });

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);
        handleMessage(ws, data);
      } catch (err) {
        console.error('Invalid message:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      handleDisconnect(ws);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });

  return wss;
}

function handleMessage(ws: WebSocket, data: any) {
  const client = clients.get(ws);
  if (!client) return;

  switch (data.type) {
    case 'publish':
      handlePublish(ws, client, data);
      break;
    case 'join':
      handleJoin(ws, client, data);
      break;
    case 'offer':
    case 'answer':
    case 'ice':
      relayMessage(ws, data);
      break;
    case 'ping':
      handlePing(ws, client);
      break;
    case 'heartbeat':
      handleHeartbeat(ws, client, data);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

function handlePublish(ws: WebSocket, client: Client, data: { nodeId: string; ownerToken: string }) {
  try {
    const decoded = jwt.verify(data.ownerToken, JWT_SECRET) as any;
    if (decoded.type !== 'owner' || decoded.nodeId !== data.nodeId) {
      throw new Error('Invalid token');
    }

    client.nodeId = data.nodeId;
    client.type = 'publisher';
    client.token = data.ownerToken;

    console.log(`Publisher registered for node: ${data.nodeId}`);
    ws.send(JSON.stringify({ type: 'connected', role: 'publisher' }));
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid owner token' }));
  }
}

function handleJoin(ws: WebSocket, client: Client, data: { nodeId: string; viewerToken: string }) {
  try {
    const decoded = jwt.verify(data.viewerToken, JWT_SECRET) as any;
    if (decoded.type !== 'viewer' || decoded.nodeId !== data.nodeId) {
      throw new Error('Invalid token');
    }

    const node = nodes.get(data.nodeId);
    if (!node || node.status === 'revoked') {
      ws.send(JSON.stringify({ type: 'error', message: 'Node not available' }));
      return;
    }

    if (node.viewerCount >= 3) {
      ws.send(JSON.stringify({ type: 'error', message: 'Max viewers reached' }));
      return;
    }

    node.viewerCount++;

    client.nodeId = data.nodeId;
    client.type = 'viewer';
    client.token = data.viewerToken;

    console.log(`Viewer joined node: ${data.nodeId} (${node.viewerCount} viewers)`);
    ws.send(JSON.stringify({ type: 'connected', role: 'viewer' }));

    // Notify publisher
    broadcastToNode(data.nodeId, { type: 'viewer-count', nodeId: data.nodeId, count: node.viewerCount }, 'publisher');

    // Notify publisher of new viewer
    broadcastToNode(data.nodeId, { type: 'join', viewerToken: data.viewerToken }, 'publisher');
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid viewer token' }));
  }
}

function relayMessage(ws: WebSocket, data: any) {
  const client = clients.get(ws);
  if (!client || !client.nodeId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not registered' }));
    return;
  }

  // Relay to all clients on the same node (excluding sender)
  const targetType = client.type === 'publisher' ? 'viewer' : 'publisher';
  broadcastToNode(client.nodeId, data, targetType, ws);
}

function broadcastToNode(nodeId: string, message: any, targetType?: 'publisher' | 'viewer', excludeWs?: WebSocket) {
  for (const [ws, client] of clients.entries()) {
    if (client.nodeId === nodeId && ws !== excludeWs) {
      if (!targetType || client.type === targetType) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      }
    }
  }
}

function handlePing(ws: WebSocket, client: Client) {
  // Simple ping/pong for connection keepalive
  ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
}

function handleHeartbeat(ws: WebSocket, client: Client, data: { nodeId: string; payload?: any }) {
  // Broadcast heartbeat from publisher to all viewers of the node
  // This validates the full signaling loop: Desktop -> Server -> Web App
  if (!client.nodeId || client.type !== 'publisher') {
    ws.send(JSON.stringify({ type: 'error', message: 'Only publishers can send heartbeats' }));
    return;
  }

  console.log(`[Heartbeat] from ${client.nodeId}:`, data.payload || 'ping');

  // Broadcast to all viewers of this node
  broadcastToNode(client.nodeId, {
    type: 'heartbeat',
    nodeId: client.nodeId,
    timestamp: Date.now(),
    payload: data.payload,
  }, 'viewer');
}

function handleDisconnect(ws: WebSocket) {
  const client = clients.get(ws);
  if (client && client.nodeId && client.type === 'viewer') {
    const node = nodes.get(client.nodeId);
    if (node) {
      node.viewerCount = Math.max(0, node.viewerCount - 1);
      broadcastToNode(client.nodeId, {
        type: 'viewer-count',
        nodeId: client.nodeId,
        count: node.viewerCount,
      }, 'publisher');
    }
  }
  clients.delete(ws);
  console.log('Client disconnected');
}
