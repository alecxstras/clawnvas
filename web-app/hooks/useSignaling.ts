'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { SignalMessage } from '@/types';

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL || 'ws://localhost:3001';

interface UseSignalingOptions {
  nodeId?: string;
  token?: string;
  onMessage?: (msg: SignalMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useSignaling({
  nodeId,
  token,
  onMessage,
  onConnect,
  onDisconnect,
}: UseSignalingOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${SIGNALING_URL}/signal`);

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      onConnect?.();

      // Send initial message based on token type
      if (token && nodeId) {
        // Determine if owner or viewer based on token structure
        // Owner tokens start with 'owner_', viewer tokens start with 'viewer_'
        if (token.startsWith('owner_')) {
          ws.send(JSON.stringify({
            type: 'publish',
            nodeId,
            ownerToken: token,
          }));
        } else {
          console.log('[Signaling] Sending join message as viewer');
          ws.send(JSON.stringify({
            type: 'join',
            nodeId,
            viewerToken: token,
          }));
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg: SignalMessage = JSON.parse(event.data);

        // Log heartbeats for debugging signaling loop
        if (msg.type === 'heartbeat') {
          console.log('[Heartbeat] received from desktop:', msg);
        }

        onMessage?.(msg);
      } catch (err) {
        console.error('Failed to parse signal message:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      onDisconnect?.();
    };

    ws.onerror = (err) => {
      setError('WebSocket error');
      console.error('Signaling error:', err);
    };

    wsRef.current = ws;
  }, [nodeId, token, onMessage, onConnect, onDisconnect]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  const send = useCallback((msg: SignalMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return { isConnected, error, connect, disconnect, send };
}
