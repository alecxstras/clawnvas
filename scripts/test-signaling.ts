/**
 * Quick test script for signaling handshake
 * 
 * Usage:
 * 1. Start the signaling server: npm run dev:server
 * 2. Run this test: npx ts-node scripts/test-signaling.ts
 * 
 * This validates the basic WebSocket connectivity without needing the full app.
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const WS_URL = process.env.WS_URL || 'ws://localhost:3001/signal';

async function testSignaling() {
  console.log('🧪 Testing signaling handshake...\n');

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
  console.log(`✅ Node created: ${nodeId}`);
  console.log(`   Owner token: ${ownerToken.slice(0, 20)}...\n`);

  // Step 2: Connect desktop (publisher) via WebSocket
  console.log('2️⃣ Connecting desktop (publisher) via WebSocket...');
  const desktopWs = new WebSocket(WS_URL);

  await new Promise<void>((resolve, reject) => {
    desktopWs.on('open', () => {
      console.log('✅ Desktop WebSocket connected');
      desktopWs.send(JSON.stringify({
        type: 'publish',
        nodeId,
        ownerToken,
      }));
      resolve();
    });
    desktopWs.on('error', reject);
  });

  // Wait for connected message
  await new Promise<void>((resolve) => {
    desktopWs.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'connected') {
        console.log(`✅ Desktop registered as ${msg.role}\n`);
        resolve();
      }
    });
  });

  // Step 3: Get viewer token
  console.log('3️⃣ Getting viewer token...');
  const viewerRes = await fetch(`${API_URL}/nodes/${nodeId}/viewer-token`, {
    method: 'POST',
  });

  if (!viewerRes.ok) {
    console.error('❌ Failed to get viewer token:', await viewerRes.text());
    process.exit(1);
  }

  const { viewerToken } = await viewerRes.json() as any;
  console.log(`✅ Viewer token received: ${viewerToken.slice(0, 20)}...\n`);

  // Step 4: Connect web app (viewer) via WebSocket
  console.log('4️⃣ Connecting web app (viewer) via WebSocket...');
  const webappWs = new WebSocket(WS_URL);

  await new Promise<void>((resolve, reject) => {
    webappWs.on('open', () => {
      console.log('✅ Web app WebSocket connected');
      webappWs.send(JSON.stringify({
        type: 'join',
        nodeId,
        viewerToken,
      }));
      resolve();
    });
    webappWs.on('error', reject);
  });

  // Wait for connected message
  await new Promise<void>((resolve) => {
    webappWs.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'connected') {
        console.log(`✅ Web app registered as ${msg.role}\n`);
        resolve();
      }
    });
  });

  // Step 5: Test ping/pong
  console.log('5️⃣ Testing ping/pong...');
  desktopWs.send(JSON.stringify({ type: 'ping' }));

  await new Promise<void>((resolve) => {
    desktopWs.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'pong') {
        console.log(`✅ Pong received: ${msg.timestamp}\n`);
        resolve();
      }
    });
  });

  // Step 6: Test heartbeat flow
  console.log('6️⃣ Testing heartbeat flow (Desktop -> Server -> Web App)...');
  console.log('   Sending heartbeat from desktop...');

  const heartbeatPromise = new Promise<void>((resolve) => {
    webappWs.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'heartbeat') {
        console.log(`✅ Heartbeat received by web app!`);
        console.log(`   Timestamp: ${msg.timestamp}`);
        console.log(`   Payload:`, msg.payload);
        resolve();
      }
    });
  });

  desktopWs.send(JSON.stringify({
    type: 'heartbeat',
    nodeId,
    payload: { test: true, message: 'Hello from desktop!' },
  }));

  await heartbeatPromise;

  console.log('\n🎉 All signaling tests passed!');
  console.log('\nNext steps:');
  console.log('   - Integrate this flow into the actual Desktop Helper and Web App');
  console.log('   - Add WebRTC offer/answer exchange');
  console.log('   - Test with mock video stream');

  // Cleanup
  desktopWs.close();
  webappWs.close();
  process.exit(0);
}

testSignaling().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
