'use client';

import { useRef, useState, useCallback } from 'react';
import { SignalMessage } from '@/types';

interface UseWebRTCOptions {
  nodeId: string;
  onRemoteStream?: (stream: MediaStream) => void;
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
}

export function useWebRTC({ nodeId, onRemoteStream, onIceCandidate }: UseWebRTCOptions) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');

  const createPeerConnection = useCallback(() => {
    console.log('[WebRTC] Creating peer connection...');
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // TURN server config would go here
      ],
    });

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state changed:', pc.connectionState);
      setConnectionState(pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE state changed:', pc.iceConnectionState);
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] Track received:', event.track.kind, event.track.id);
      if (event.streams[0]) {
        onRemoteStream?.(event.streams[0]);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] Generated ICE candidate:', event.candidate.type);
        onIceCandidate?.(event.candidate);
      }
    };

    pcRef.current = pc;
    return pc;
  }, [nodeId, onRemoteStream, onIceCandidate]);

  const createOffer = useCallback(async (): Promise<RTCSessionDescriptionInit> => {
    const pc = pcRef.current || createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }, [createPeerConnection]);

  const handleAnswer = useCallback(async (sdp: RTCSessionDescriptionInit) => {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }, []);

  const handleOffer = useCallback(async (sdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> => {
    console.log('[WebRTC] Received offer, creating answer...');
    const pc = pcRef.current || createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('[WebRTC] Remote description set (offer)');
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log('[WebRTC] Local description set (answer)');
    return answer;
  }, [createPeerConnection]);

  const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }, []);

  const close = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    setConnectionState('closed');
  }, []);

  return {
    connectionState,
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    close,
  };
}
