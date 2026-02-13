'use client';

import { useCallback, useState, useRef } from 'react';
import {
  Tldraw,
  TLUiOverrides,
  TLComponents,
  menuItem,
  DefaultKeyboardShortcutsDialog,
  DefaultKeyboardShortcutsDialogContent,
  DefaultMainMenu,
  DefaultMainMenuContent,
  DefaultStylePanel,
  DefaultContextMenu,
  DefaultContextMenuContent,
} from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { BrowserNodeUtil } from './BrowserNode';
import { createNode, getViewerToken } from '@/lib/canvas';

// Desktop Helper HTTP endpoint
const DESKTOP_HELPER_URL = 'http://localhost:3002';

// Extend tldraw with our custom shape
const shapeUtils = [BrowserNodeUtil];

// Custom UI overrides
const uiOverrides: TLUiOverrides = {
  tools: (editor, tools) => {
    return {
      ...tools,
      'browser-node': {
        id: 'browser-node',
        label: 'Browser Session',
        icon: 'globe',
        kbd: 'b',
        onSelect: () => {
          editor.setCurrentTool('browser-node');
        },
      },
    };
  },
};

// Custom components
const components: TLComponents = {
  MainMenu: () => (
    <DefaultMainMenu>
      <DefaultMainMenuContent />
    </DefaultMainMenu>
  ),
  KeyboardShortcutsDialog: DefaultKeyboardShortcutsDialog,
  KeyboardShortcutsDialogContent: DefaultKeyboardShortcutsDialogContent,
  StylePanel: DefaultStylePanel,
  ContextMenu: (props) => {
    const editor = (window as any).__tldraw_editor;
    const selectedShapes = editor?.getSelectedShapes() || [];
    const isBrowserNode = selectedShapes.length === 1 && selectedShapes[0]?.type === 'browser-node';
    const selectedShape = isBrowserNode ? selectedShapes[0] : null;
    
    return (
      <DefaultContextMenu {...props}>
        <DefaultContextMenuContent />
        {selectedShape && selectedShape.props.status === 'idle' && (
          <div 
            className="tlui-menu__item" 
            onClick={async () => {
              console.log('[ContextMenu] Opening browser for:', selectedShape.props.nodeId);
              try {
                const response = await fetch(`${DESKTOP_HELPER_URL}/create-session`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    nodeId: selectedShape.props.nodeId,
                    ownerToken: selectedShape.props.ownerToken,
                    title: `Browser Session - ${selectedShape.props.nodeId.slice(0, 8)}`,
                  }),
                });
                
                if (!response.ok) {
                  const text = await response.text();
                  throw new Error(`HTTP ${response.status}: ${text}`);
                }
                
                await response.json();
                
                // Just trigger the connect event - BrowserNode handles the stream
                window.dispatchEvent(new CustomEvent('browser-node-connect', {
                  detail: { nodeId: selectedShape.props.nodeId }
                }));
              } catch (err) {
                console.error('[ContextMenu] Failed:', err);
                if (err instanceof TypeError && err.message.includes('fetch')) {
                  alert('Failed to connect to Desktop Helper.\n\nMake sure:\n1. Desktop Helper is running (Terminal 3)\n2. Check console for errors');
                } else {
                  alert('Failed: ' + (err as Error).message);
                }
              }
            }}
            style={{ 
              padding: '8px 12px', 
              cursor: 'pointer',
              borderTop: '1px solid #e5e7eb',
              fontSize: '14px'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            🌐 Open Browser
          </div>
        )}
      </DefaultContextMenu>
    );
  },
};

export default function Canvas() {
  const [isCreating, setIsCreating] = useState(false);

  const lastSelectedId = useRef<string | null>(null);
  const selectedBrowserNode = useRef<any>(null);

  const handleMount = useCallback((editor: any) => {
    // Store editor reference globally for shape access
    (window as any).__tldraw_editor = editor;

    // Add custom context menu item for creating browser nodes
    editor.registerExternalAssetHandler('browser-node', async () => {
      return null;
    });

    // Track selected browser nodes for context menu
    editor.on('change', (event: any) => {
      const selectedShapes = editor.getSelectedShapes();
      if (selectedShapes.length === 1 && selectedShapes[0]?.type === 'browser-node') {
        const shape = selectedShapes[0];
        if (shape.id !== lastSelectedId.current) {
          lastSelectedId.current = shape.id;
          selectedBrowserNode.current = shape;
          console.log('[Canvas] Selected browser node:', shape.props.nodeId);
        }
      } else if (selectedShapes.length === 0) {
        lastSelectedId.current = null;
        selectedBrowserNode.current = null;
      }
    });
  }, []);

  const handleCreateBrowserNode = useCallback(async () => {
    setIsCreating(true);
    try {
      // Get the editor instance
      const editor = (window as any).__tldraw_editor;
      if (!editor) return;

      // 1. Create node on signaling server
      const { nodeId, ownerToken } = await createNode('default-project');
      console.log('Created node on server:', nodeId);

      // 2. Get pointer position and create the shape (no browser window yet)
      const { x, y } = editor.inputs.currentPagePoint;

      editor.createShape({
        type: 'browser-node',
        x: x - 200,
        y: y - 150,
        props: {
          w: 400,
          h: 300,
          nodeId,
          ownerToken, // Store token for Connect button
          ownerId: 'current-user',
          title: 'Browser Session',
          status: 'idle',
          viewerCount: 0,
          createdAt: Date.now(),
        },
      });

      console.log('Browser node created successfully - click Connect to open browser');
      
    } catch (err) {
      console.error('Failed to create browser node:', err);
      alert('Failed to create browser session');
    } finally {
      setIsCreating(false);
    }
  }, []);

  return (
    <div className="tldraw__editor">
      <Tldraw
        shapeUtils={shapeUtils}
        overrides={uiOverrides}
        components={components}
        onMount={(editor) => {
          handleMount(editor);
        }}
      >
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={handleCreateBrowserNode}
            disabled={isCreating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isCreating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <span className="text-lg">+</span>
                Add Browser Session
              </>
            )}
          </button>
        </div>
      </Tldraw>
    </div>
  );
}
