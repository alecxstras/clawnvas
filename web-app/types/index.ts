// Browser node status
export type NodeStatus = 'idle' | 'connecting' | 'live' | 'offline';

// Browser node shape for tldraw
export interface BrowserNodeShape {
  id: string;
  type: 'browser-node';
  x: number;
  y: number;
  props: {
    w: number;
    h: number;
    nodeId: string;
    ownerId: string;
    title: string;
    status: NodeStatus;
    viewerCount: number;
    createdAt: number;
  };
}

// API response types
export interface CreateNodeResponse {
  nodeId: string;
  ownerToken: string;
}

export interface ViewerTokenResponse {
  viewerToken: string;
}

// WebSocket signaling messages
export type SignalMessage =
  | { type: 'publish'; nodeId: string; ownerToken: string }
  | { type: 'join'; nodeId: string; viewerToken: string }
  | { type: 'offer'; nodeId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; nodeId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; nodeId: string; candidate: RTCIceCandidateInit }
  | { type: 'revoke'; nodeId: string }
  | { type: 'viewer-count'; nodeId: string; count: number }
  | { type: 'heartbeat'; nodeId: string; timestamp: number; payload?: any }
  | { type: 'capture-error'; nodeId: string; error: string }
  | { type: 'ping' }
  | { type: 'pong'; timestamp: number }
  | { type: 'error'; message: string };

// WebRTC types
export interface PeerConnection {
  pc: RTCPeerConnection;
  stream?: MediaStream;
  nodeId: string;
}
