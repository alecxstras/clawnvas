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
import { createNode } from '@/lib/canvas';

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
            onClick={() => {
              console.log('[ContextMenu] Opening browser for:', selectedShape.props.nodeId);
              fetch(`${DESKTOP_HELPER_URL}/create-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  nodeId: selectedShape.props.nodeId,
                  ownerToken: selectedShape.props.ownerToken,
                  title: `Browser Session - ${selectedShape.props.nodeId.slice(0, 8)}`,
                }),
              })
                .then(res => {
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  return res.json();
                })
                .then(() => getViewerToken(selectedShape.props.nodeId))
                .then(({ viewerToken }) => {
                  editor.updateShape({
                    id: selectedShape.id,
                    type: 'browser-node',
                    props: {
                      ...selectedShape.props,
                      status: 'connecting',
                    },
                  });
                  window.dispatchEvent(new CustomEvent('browser-node-connect', {
                    detail: { nodeId: selectedShape.props.nodeId, viewerToken }
                  }));
                })
                .catch(err => {
                  console.error('[ContextMenu] Failed:', err);
                  alert('Failed: ' + err.message);
                });
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

  const handleMount = useCallback((editor: any) => {
    // Store editor reference globally for shape access
    (window as any).__tldraw_editor = editor;

    // Add custom context menu item for creating browser nodes
    editor.registerExternalAssetHandler('browser-node', async () => {
      return null;
    });

    // Listen for change events to detect selection changes
    editor.on('change', (event: any) => {
      const selectedShapes = editor.getSelectedShapes();
      
      // Check if we have exactly one shape selected and it's different from last time
      if (selectedShapes.length === 1 && selectedShapes[0]?.type === 'browser-node') {
        const shape = selectedShapes[0];
        
        // Only trigger if this is a new selection
        if (shape.id !== lastSelectedId.current && shape?.props?.status === 'idle') {
          lastSelectedId.current = shape.id;
          console.log('[Canvas] Selected browser node:', shape.props.nodeId);
          console.log('[Canvas] Opening browser for node:', shape.props.nodeId);
          
          // Open browser window via desktop helper
          fetch(`${DESKTOP_HELPER_URL}/create-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nodeId: shape.props.nodeId,
              ownerToken: shape.props.ownerToken,
              title: `Browser Session - ${shape.props.nodeId.slice(0, 8)}`,
            }),
          })
            .then(res => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.json();
            })
            .then(() => {
              console.log('[Canvas] Browser window opened, getting viewer token...');
              return getViewerToken(shape.props.nodeId);
            })
            .then(({ viewerToken }) => {
              console.log('[Canvas] Got viewer token, updating shape...');
              editor.updateShape({
                id: shape.id,
                type: 'browser-node',
                props: {
                  ...shape.props,
                  status: 'connecting',
                  viewerToken,
                },
              });
              window.dispatchEvent(new CustomEvent('browser-node-connect', {
                detail: { nodeId: shape.props.nodeId, viewerToken }
              }));
            })
            .catch(err => {
              console.error('[Canvas] Failed:', err);
              alert('Failed: ' + err.message);
            });
        }
      } else if (selectedShapes.length === 0) {
        // Reset when nothing selected
        lastSelectedId.current = null;
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
