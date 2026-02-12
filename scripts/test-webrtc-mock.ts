/**
 * WebRTC Mock Test Script
 * 
 * This validates the WebRTC handshake using webcam as stand-in for desktop capture.
 * Run this after the signaling test passes.
 * 
 * Usage:
 * 1. Start the signaling server: npm run dev:server
 * 2. Run this test: npx ts-node scripts/test-webrtc-mock.ts
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const WS_URL = process.env.WS_URL || 'ws://localhost:3001/signal';

// Simple RTCPeerConnection polyfill for Node.js testing
// In real test, this would run in browser environment
class MockRTCPeerConnection {
  private _localDescription: any = null;
  private _remoteDescription: any = null;
  private _iceCandidates: any[] = [];
  onicecandidate: ((event: any) => void) | null = null;
  ontrack: ((event: any) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  connectionState = 'new';

  async createOffer() {
    return {
      type: 'offer',
      sdp: 'v=0\r\nmock-sdp-offer',
    };
  }

  async createAnswer() {
    return {
      type: 'answer',
      sdp: 'v=0\r\nmock-sdp-answer',
    };
  }

  async setLocalDescription(desc: any) {
    this._localDescription = desc;
    console.log('[MockPC] Local description set:', desc.type);
  }

  async setRemoteDescription(desc: any) {
    this._remoteDescription = desc;
    console.log('[MockPC] Remote description set:', desc.type);
  }

  async addIceCandidate(candidate: any) {
    this._iceCandidates.push(candidate);
    console.log('[MockPC] ICE candidate added:', candidate.type || 'host');
  }

  addTrack(track: any, stream: any) {
    console.log('[MockPC] Track added:', track.kind);
  }

  close() {
    this.connectionState = 'closed';
    console.log('[MockPC] Connection closed');
  }
}

async function testWebRTC() {
  console.log('🧪 Testing WebRTC mock handshake...\n');

  // Step 1: Create a node via REST API
  console.log('1️⃣ Creating node via REST API...');
  const createRes = await fetch(`${API_URL}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'test-project' }),
  });

  if (!createRes.ok) {
    console.error('❌ Failed to create node:', await createRes.text());
    process.exit(1);
  }

  const { nodeId, ownerToken } = await createRes.json() as any;
  console.log(`✅ Node created: ${nodeId}\n`);

  // Step 2: Connect desktop (publisher) via WebSocket
  console.log('2️⃣ Connecting desktop (publisher) via WebSocket...');
  const desktopWs = new WebSocket(WS_URL);

  await new Promise<void>((resolve, reject) => {
    desktopWs.on('open', () => {
      desktopWs.send(JSON.stringify({
        type: 'publish',
        nodeId,
        ownerToken,
      }));
      resolve();
    });
    desktopWs.on('error', reject);
  });

  console.log('✅ Desktop connected and published\n');

  // Step 3: Get viewer token and connect web app
  console.log('3️⃣ Getting viewer token and connecting web app...');
  const viewerRes = await fetch(`${API_URL}/nodes/${nodeId}/viewer-token`, {
    method: 'POST',
  });
  const { viewerToken } = await viewerRes.json() as any;

  const webappWs = new WebSocket(WS_URL);
  
  await new Promise<void>((resolve, reject) => {
    webappWs.on('open', () => {
      webappWs.send(JSON.stringify({
        type: 'join',
        nodeId,
        viewerToken,
      }));
      resolve();
    });
    webappWs.on('error', reject);
  });

  console.log('✅ Web app connected as viewer\n');

  // Step 4: Simulate WebRTC handshake
  console.log('4️⃣ Simulating WebRTC handshake...\n');

  // Desktop creates offer
  console.log('   [Desktop] Creating peer connection...');
  const desktopPC = new MockRTCPeerConnection();
  
  console.log('   [Desktop] Creating offer...');
  const offer = await desktopPC.createOffer();
  await desktopPC.setLocalDescription(offer);
  
  console.log('   [Desktop] Sending offer to web app...');
  desktopWs.send(JSON.stringify({
    type: 'offer',
    nodeId,
    sdp: offer,
  }));

  // Web app receives offer and creates answer
  console.log('   [Web App] Waiting for offer...');
  const webappAnswer = await new Promise<any>((resolve) => {
    webappWs.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'offer') {
        console.log('   [Web App] Received offer, creating answer...');
        const webappPC = new MockRTCPeerConnection();
        webappPC.setRemoteDescription(msg.sdp);
        webappPC.createAnswer().then((answer) => {
          webappPC.setLocalDescription(answer);
          resolve(answer);
        });
      }
    });
  });

  // Web app sends answer
  console.log('   [Web App] Sending answer to desktop...');
  webappWs.send(JSON.stringify({
    type: 'answer',
    nodeId,
    sdp: webappAnswer,
  }));

  // Desktop receives answer
  console.log('   [Desktop] Waiting for answer...');
  await new Promise<void>((resolve) => {
    desktopWs.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'answer') {
        console.log('   [Desktop] Received answer');
        desktopPC.setRemoteDescription(msg.sdp);
        resolve();
      }
    });
  });

  // Step 5: Simulate ICE exchange
  console.log('\n5️⃣ Simulating ICE candidate exchange...\n');

  // Desktop sends ICE candidate
  const mockIceCandidate = {
    candidate: 'candidate:mock 1 udp 2130706431 192.168.1.1 5000 typ host',
    sdpMid: '0',
    sdpMLineIndex: 0,
  };

  console.log('   [Desktop] Sending ICE candidate...');
  desktopWs.send(JSON.stringify({
    type: 'ice',
    nodeId,
    candidate: mockIceCandidate,
  }));

  // Web app receives ICE candidate
  await new Promise<void>((resolve) => {
    webappWs.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ice') {
        console.log('   [Web App] Received ICE candidate');
        resolve();
      }
    });
  });

  console.log('\n🎉 WebRTC mock handshake test passed!');
  console.log('\nNext steps:');
  console.log('   - Test in real browser with actual RTCPeerConnection');
  console.log('   - Replace mock with getUserMedia({ video: true })');
  console.log('   - Test video rendering in BrowserNode component');
  console.log('   - Then integrate desktopCapturer for real screen sharing');

  // Cleanup
  desktopWs.close();
  webappWs.close();
  process.exit(0);
}

testWebRTC().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
