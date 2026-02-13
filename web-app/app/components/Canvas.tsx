'use client';

import { useCallback, useState } from 'react';
import { Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { BrowserNodeUtil } from './BrowserNode';

const shapeUtils = [BrowserNodeUtil];

export default function Canvas() {
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateBrowserNode = useCallback(async () => {
    setIsCreating(true);
    try {
      const editor = (window as any).__tldraw_editor;
      if (!editor) return;

      const nodeId = crypto.randomUUID();
      const { x, y } = editor.inputs.currentPagePoint;

      editor.createShape({
        type: 'browser-node',
        x: x - 200,
        y: y - 150,
        props: {
          w: 400,
          h: 300,
          nodeId,
          title: 'Browser Session',
        },
      });
      
      console.log('Created browser node:', nodeId);
    } catch (err) {
      console.error('Failed:', err);
      alert('Failed to create browser session');
    } finally {
      setIsCreating(false);
    }
  }, []);

  return (
    <div className="tldraw__editor">
      <Tldraw
        shapeUtils={shapeUtils}
        onMount={(editor) => {
          (window as any).__tldraw_editor = editor;
        }}
      >
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={handleCreateBrowserNode}
            disabled={isCreating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : '+ Add Browser'}
          </button>
        </div>
      </Tldraw>
    </div>
  );
}
