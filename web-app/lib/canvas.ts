// API client
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function createNode(projectId: string): Promise<{ nodeId: string; ownerToken: string }> {
  const res = await fetch(`${API_URL}/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) throw new Error('Failed to create node');
  return res.json();
}

export async function getViewerToken(nodeId: string): Promise<{ viewerToken: string }> {
  const res = await fetch(`${API_URL}/nodes/${nodeId}/viewer-token`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to get viewer token');
  return res.json();
}

export async function revokeNode(nodeId: string): Promise<void> {
  const res = await fetch(`${API_URL}/nodes/${nodeId}/revoke`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to revoke node');
}
