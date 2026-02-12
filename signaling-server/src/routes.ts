import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const TOKEN_EXPIRY = '15m';

// In-memory store (replace with Redis in production)
const nodes = new Map<string, {
  nodeId: string;
  projectId: string;
  ownerToken: string;
  status: 'active' | 'revoked';
  viewerCount: number;
  createdAt: Date;
}>();

// Create a new node
router.post('/nodes', (req, res) => {
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId required' });
  }

  const nodeId = uuidv4();
  const ownerToken = jwt.sign(
    { type: 'owner', nodeId, projectId },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  nodes.set(nodeId, {
    nodeId,
    projectId,
    ownerToken,
    status: 'active',
    viewerCount: 0,
    createdAt: new Date(),
  });

  res.json({ nodeId, ownerToken });
});

// Get viewer token
router.post('/nodes/:nodeId/viewer-token', (req, res) => {
  const { nodeId } = req.params;
  const node = nodes.get(nodeId);

  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }

  if (node.status === 'revoked') {
    return res.status(403).json({ error: 'Node has been revoked' });
  }

  if (node.viewerCount >= 3) {
    return res.status(403).json({ error: 'Max viewers reached' });
  }

  const viewerToken = jwt.sign(
    { type: 'viewer', nodeId, projectId: node.projectId },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  res.json({ viewerToken });
});

// Revoke node
router.post('/nodes/:nodeId/revoke', (req, res) => {
  const { nodeId } = req.params;
  const node = nodes.get(nodeId);

  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }

  node.status = 'revoked';
  res.json({ success: true });
});

// Get node info (for debugging)
router.get('/nodes/:nodeId', (req, res) => {
  const { nodeId } = req.params;
  const node = nodes.get(nodeId);

  if (!node) {
    return res.status(404).json({ error: 'Node not found' });
  }

  res.json({
    nodeId: node.nodeId,
    projectId: node.projectId,
    status: node.status,
    viewerCount: node.viewerCount,
    createdAt: node.createdAt,
  });
});

export { router as default, nodes };
