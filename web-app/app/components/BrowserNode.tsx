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
import { NodeStatus } from '@/types';
import { revokeNode } from '@/lib/canvas';

// Desktop Helper URL
const DESKTOP_HELPER_URL = 'http://localhost:3002';

// Shape type definition
type BrowserNodeShape = TLBaseShape<
  'browser-node',
  {
    w: number;
    h: number;
    nodeId: string;
    ownerToken: string;
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
      ownerToken: '',
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

  override onClick(shape: BrowserNodeShape) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('browser-node-click', { 
        detail: { nodeId: shape.props.nodeId, ownerToken: shape.props.ownerToken }
      }));
    }
  }

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

// Component implementation - SIMPLIFIED: uses HTTP frame streaming
function BrowserNodeComponent({ shape }: { shape: BrowserNodeShape }) {
  const { nodeId, title, w, h, ownerToken } = shape.props;
  const [localStatus, setLocalStatus] = useState<NodeStatus>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connectBtnRef = useRef<HTMLButtonElement>(null);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Attach click handler to button via ref
  useEffect(() => {
    const btn = connectBtnRef.current;
    if (!btn || localStatus !== 'idle') return;

    const handleClick = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      handleConnect();
    };

    btn.addEventListener('click', handleClick);
    return () => btn.removeEventListener('click', handleClick);
  }, [nodeId, ownerToken, localStatus]);

  // Listen for connect event from Canvas (right-click menu)
  useEffect(() => {
    const handleConnectEvent = (e: CustomEvent) => {
      if (e.detail.nodeId === nodeId) {
        console.log('[BrowserNode] Received connect event from Canvas');
        // Start streaming immediately
        setLocalStatus('live');
      }
    };
    
    window.addEventListener('browser-node-connect', handleConnectEvent as EventListener);
    return () => window.removeEventListener('browser-node-connect', handleConnectEvent as EventListener);
  }, [nodeId]);

  // Start polling for frames when live
  useEffect(() => {
    if (localStatus === 'live') {
      // Poll for new frame every 100ms
      frameIntervalRef.current = setInterval(() => {
        // Add timestamp to prevent caching
        setFrameUrl(`${DESKTOP_HELPER_URL}/frame/${nodeId}?t=${Date.now()}`);
      }, 100);
    } else {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      setFrameUrl(null);
    }

    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
    };
  }, [localStatus, nodeId]);

  const handleConnect = useCallback(async () => {
    if (!nodeId || !ownerToken) {
      alert('Missing node data. Please recreate the session.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // First test if Desktop Helper is reachable
      console.log('[Connect] Testing Desktop Helper...');
      const testRes = await fetch(`${DESKTOP_HELPER_URL}/test`, { 
        method: 'GET',
        mode: 'cors'
      });
      if (!testRes.ok) {
        throw new Error(`Desktop Helper not responding: ${testRes.status}`);
      }
      console.log('[Connect] Desktop Helper is running');

      // Tell Desktop Helper to open browser window
      console.log('[Connect] Creating browser window...');
      const response = await fetch(`${DESKTOP_HELPER_URL}/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId,
          ownerToken,
          title: `Browser Session - ${nodeId.slice(0, 8)}`,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      console.log('[Connect] Window created, starting stream...');
      // Success! Window is open, now start showing frames
      setLocalStatus('live');
      
    } catch (err) {
      console.error('Connect failed:', err);
      setError(`Cannot connect to Desktop Helper. Is it running on port 3002? Error: ${(err as Error).message}`);
      setLocalStatus('idle');
    } finally {
      setIsLoading(false);
    }
  }, [nodeId, ownerToken]);

  const handleStop = useCallback(async () => {
    if (!nodeId) return;
    try {
      await revokeNode(nodeId);
      setLocalStatus('offline');
    } catch (err) {
      console.error('Failed to stop:', err);
    }
  }, [nodeId]);

  const statusColors = {
    idle: 'bg-gray-400',
    connecting: 'bg-blue-400',
    live: 'bg-green-500 animate-pulse',
    offline: 'bg-red-400',
  };

  return (
    <HTMLContainer style={{ width: w, height: h, pointerEvents: 'all' }}>
      <div className="w-full h-full bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${statusColors[localStatus]}`} />
            <span className="text-sm font-medium text-gray-700 truncate max-w-[120px]">
              {title}
            </span>
          </div>
          {localStatus === 'live' && (
            <span className="text-xs text-gray-500">Live</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 relative bg-gray-900 overflow-hidden">
          {localStatus === 'live' && frameUrl ? (
            <img
              src={frameUrl}
              alt="Browser Stream"
              className="w-full h-full object-contain"
              style={{ imageRendering: 'auto' }}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              {isLoading ? (
                <>
                  <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mb-2" />
                  <span className="text-sm">Opening browser...</span>
                </>
              ) : error ? (
                <>
                  <div className="text-4xl mb-2">⚠️</div>
                  <span className="text-sm text-red-400">{error}</span>
                  <button
                    onClick={handleConnect}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
                  >
                    Retry
                  </button>
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
                    ref={connectBtnRef}
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

export default BrowserNodeUtil;
