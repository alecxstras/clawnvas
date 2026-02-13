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

const DESKTOP_HELPER_URL = 'http://localhost:3002';

type BrowserNodeShape = TLBaseShape<
  'browser-node',
  {
    w: number;
    h: number;
    nodeId: string;
    title: string;
  }
>;

export class BrowserNodeUtil extends ShapeUtil<BrowserNodeShape> {
  static override type = 'browser-node' as const;

  getDefaultProps(): BrowserNodeShape['props'] {
    return {
      w: 400,
      h: 300,
      nodeId: '',
      title: 'Browser',
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

function BrowserNodeComponent({ shape }: { shape: BrowserNodeShape }) {
  const { nodeId, title, w, h } = shape.props;
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleConnect = useCallback(async () => {
    console.log('[Connect] Starting...');
    setIsLoading(true);
    setError(null);

    try {
      // Test Desktop Helper first
      console.log('[Connect] Testing Desktop Helper...');
      const testRes = await fetch(`${DESKTOP_HELPER_URL}/test`);
      if (!testRes.ok) throw new Error('Desktop Helper not running');
      console.log('[Connect] Desktop Helper OK');

      // Create browser window
      console.log('[Connect] Creating window...');
      const res = await fetch(`${DESKTOP_HELPER_URL}/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId,
          ownerToken: 'test',
          title: `Browser - ${nodeId.slice(0, 8)}`,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      console.log('[Connect] Window created, starting stream...');
      setIsConnected(true);
    } catch (err) {
      console.error('[Connect] Failed:', err);
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [nodeId]);

  // Poll for frames when connected
  useEffect(() => {
    console.log('[Effect] isConnected changed:', isConnected);
    if (isConnected) {
      console.log('[Effect] Starting frame polling...');
      intervalRef.current = setInterval(() => {
        const url = `${DESKTOP_HELPER_URL}/frame/${nodeId}?t=${Date.now()}`;
        setFrameUrl(url);
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setFrameUrl(null);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isConnected, nodeId]);

  return (
    <HTMLContainer style={{ width: w, height: h, pointerEvents: 'all' }}>
      <div className="w-full h-full bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
          <span className="text-sm font-medium text-gray-700 truncate">{title}</span>
          {isConnected && <span className="text-xs text-green-500">● Live</span>}
        </div>

        {/* Content */}
        <div className="flex-1 relative bg-gray-900">
          {isConnected && frameUrl ? (
            <img
              src={frameUrl}
              alt="Browser Stream"
              className="w-full h-full object-contain"
              onError={(e) => console.error('[Img] Failed to load:', e)}
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
                  <span className="text-sm text-red-400 text-center px-4">{error}</span>
                  <button
                    onClick={handleConnect}
                    className="mt-2 px-3 py-1 bg-blue-500 text-white text-xs rounded"
                  >
                    Retry
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm mb-2">Browser Session</span>
                  <button
                    onClick={handleConnect}
                    className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
                  >
                    Connect
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </HTMLContainer>
  );
}

export default BrowserNodeUtil;
