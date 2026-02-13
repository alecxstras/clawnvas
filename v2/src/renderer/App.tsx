import { useCallback, useState } from 'react';
import { Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { BrowserNodeUtil } from './BrowserNodeUtil';

const shapeUtils = [BrowserNodeUtil];

function App() {
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateBrowser = useCallback(() => {
    setIsCreating(true);
    try {
      const editor = (window as any).__tldraw_editor;
      if (!editor) return;

      const { x, y } = editor.inputs.currentPagePoint;
      
      editor.createShape({
        type: 'browser-node',
        x: x - 200,
        y: y - 150,
        props: {
          w: 500,
          h: 400,
          url: 'https://example.com',
        },
      });
    } finally {
      setIsCreating(false);
    }
  }, []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Tldraw
        shapeUtils={shapeUtils}
        onMount={(editor) => {
          (window as any).__tldraw_editor = editor;
        }}
      >
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 1000 }}>
          <button
            onClick={handleCreateBrowser}
            disabled={isCreating}
            style={{
              padding: '10px 20px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {isCreating ? 'Creating...' : '+ Add Browser'}
          </button>
        </div>
      </Tldraw>
    </div>
  );
}

export default App;
