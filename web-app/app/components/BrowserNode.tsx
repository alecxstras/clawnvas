'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  TLBaseShape,
  ShapeUtil,
  HTMLContainer,
  TLOnResizeHandler,
  resizeBox,
  Geometry2d,
  Rectangle2d,
} from '@tldraw/tldraw';
import { SignalMessage, NodeStatus } from '@/types';
import { useSignaling } from '@/hooks/useSignaling';
import { useWebRTC } from '@/hooks/useWebRTC';
import { getViewerToken, revokeNode } from '@/lib/canvas';

// Shape type definition
type BrowserNodeShape = TLBaseShape<
  'browser-node',
  {
    w: number;
    h: number;
    nodeId: string;
    ownerId: string;
    title: string;
    status: NodeStatus;
    viewerCount: number;
    createdAt: number;
  }
>;

// Shape util for tldraw
export class BrowserNodeUtil extends ShapeUtil<BrowserNodeShape> {
  static override type = 'browser-node' as const;

  getDefaultProps(): BrowserNodeShape['props'] {
    return {
      w: 400,
      h: 300,
      nodeId: '',
      ownerId: '',
      title: 'Browser Session',
      status: 'idle',
      viewerCount: 0,
      createdAt: Date.now(),
    };
  }

  getBounds(shape: BrowserNodeShape) {
    return {
      x: shape.x,
      y: shape.y,
      w: shape.props.w,
      h: shape.props.h,
    };
  }

  getGeometry(shape: BrowserNodeShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: false,
    });
  }

  canResize = () => true;
  canBind = () => false;
  canEdit = () => false;

  onResize: TLOnResizeHandler<BrowserNodeShape> = (shape, info) => {
    return resizeBox(shape, info);
  };

  component(shape: BrowserNodeShape) {
    return <BrowserNodeComponent shape={shape} />;
  }

  indicator(shape: BrowserNodeShape) {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        stroke="#3b82f6"
        strokeWidth={2}
        fill="none"
      />
    );
  }
}

// Component implementation
function BrowserNodeComponent({ shape }: { shape: BrowserNodeShape }) {
  const { nodeId, title, status, viewerCount, w, h } = shape.props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [localStatus, setLocalStatus] = useState<NodeStatus>(status);
  const [localViewerCount, setLocalViewerCount] = useState(viewerCount);
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const [heartbeatData, setHeartbeatData] = useState<any>(null);
  const [webrtcState, setWebrtcState] = useState<string>('new');
  const [captureError, setCaptureError] = useState<string | null>(null);

  const handleRemoteStream = useCallback((stream: MediaStream) => {
    console.log('[WebRTC] Remote stream received:', stream.getVideoTracks()[0]?.label);
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      setLocalStatus('live');
      console.log('[WebRTC] Stream attached to video element');
    }
  }, []);

  const handleIceCandidate = useCallback((candidate: RTCIceCandidate) => {
    send({
      type: 'ice',
      nodeId,
      candidate: candidate.toJSON(),
    });
  }, [nodeId]);

  const { connectionState, handleOffer, addIceCandidate, close } = useWebRTC({
    nodeId,
    onRemoteStream: handleRemoteStream,
    onIceCandidate: handleIceCandidate,
  });

  // Update local status based on WebRTC connection state
  useEffect(() => {
    console.log('[BrowserNode] WebRTC state:', connectionState);
    if (connectionState === 'connected' || connectionState === 'completed') {
      setLocalStatus('live');
    } else if (connectionState === 'failed' || connectionState === 'closed') {
      setLocalStatus('offline');
    }
  }, [connectionState]);

  const handleSignalMessage = useCallback(async (msg: SignalMessage) => {
    if (msg.nodeId !== nodeId) return;

    switch (msg.type) {
      case 'offer':
        try {
          const answer = await handleOffer(msg.sdp);
          send({
            type: 'answer',
            nodeId,
            sdp: answer,
          });
        } catch (err) {
          console.error('Failed to handle offer:', err);
        }
        break;
      case 'ice':
        await addIceCandidate(msg.candidate);
        break;
      case 'viewer-count':
        setLocalViewerCount(msg.count);
        break;
      case 'heartbeat':
        // Signal loop validation: Desktop -> Server -> Web App
        setLastHeartbeat(Date.now());
        setHeartbeatData(msg.payload);
        console.log('[Heartbeat] Desktop helper is alive:', msg.payload);
        break;
      case 'capture-error':
        console.error('[Capture] Error from desktop:', msg.error);
        setCaptureError(msg.error);
        // Still show as connecting since we fallback to webcam
        break;
      case 'revoke':
        setLocalStatus('offline');
        close();
        break;
      case 'error':
        console.error('Signaling error:', msg.message);
        setLocalStatus('offline');
        break;
    }
  }, [nodeId, handleOffer, addIceCandidate, close]);

  const { isConnected, send, connect, disconnect } = useSignaling({
    nodeId,
    token: token || undefined,
    onMessage: handleSignalMessage,
  });

  const handleConnect = useCallback(async () => {
    if (!nodeId) return;
    setIsLoading(true);
    try {
      const { viewerToken } = await getViewerToken(nodeId);
      setToken(viewerToken);
      setLocalStatus('connecting');
      connect();
    } catch (err) {
      console.error('Failed to connect:', err);
      setLocalStatus('idle');
    } finally {
      setIsLoading(false);
    }
  }, [nodeId, connect]);

  const handleStop = useCallback(async () => {
    if (!nodeId) return;
    try {
      await revokeNode(nodeId);
      disconnect();
      close();
      setLocalStatus('offline');
    } catch (err) {
      console.error('Failed to stop:', err);
    }
  }, [nodeId, disconnect, close]);

  const statusColors = {
    idle: 'bg-gray-400',
    connecting: 'bg-blue-400',
    live: 'bg-green-500 animate-pulse',
    offline: 'bg-red-400',
  };

  return (
    <HTMLContainer
      style={{
        width: w,
        height: h,
        pointerEvents: 'all',
      }}
    >
      <div className="w-full h-full bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${statusColors[localStatus]}`} />
            <span className="text-sm font-medium text-gray-700 truncate max-w-[120px]">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Heartbeat indicator - shows signaling is working */}
            {lastHeartbeat && (
              <span
                className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded"
                title={heartbeatData ? `URL: ${heartbeatData.url}` : 'Signaling connected'}
              >
                ● {Math.round((Date.now() - lastHeartbeat) / 1000)}s ago
              </span>
            )}
            {localStatus === 'live' && (
              <span className="text-xs text-gray-500">
                {localViewerCount} viewing
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 relative bg-gray-900">
          {localStatus === 'live' ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              {isLoading ? (
                <>
                  <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mb-2" />
                  <span className="text-sm">Connecting...</span>
                  {captureError && (
                    <span className="text-xs text-amber-500 mt-2 max-w-[200px] text-center">
                      ⚠️ {captureError}
                    </span>
                  )}
                </>
              ) : localStatus === 'offline' ? (
                <>
                  <div className="text-4xl mb-2">📴</div>
                  <span className="text-sm">Session ended</span>
                </>
              ) : (
                <>
                  <div className="text-4xl mb-2">🌐</div>
                  <span className="text-sm mb-4">Browser session</span>
                  <button
                    onClick={handleConnect}
                    className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Connect
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">ID: {nodeId.slice(0, 8)}...</span>
            {localStatus === 'connecting' && connectionState !== 'new' && (
              <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                {connectionState}
              </span>
            )}
          </div>
          {localStatus === 'live' && (
            <button
              onClick={handleStop}
              className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
            >
              Stop
            </button>
          )}
        </div>
      </div>
    </HTMLContainer>
  );
}
