'use client';

import { useCallback, useState } from 'react';
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
  ContextMenu: (props) => (
    <DefaultContextMenu {...props}>
      <DefaultContextMenuContent />
    </DefaultContextMenu>
  ),
};

export default function Canvas() {
  const [isCreating, setIsCreating] = useState(false);

  const handleMount = useCallback((editor: any) => {
    // Add custom context menu item for creating browser nodes
    editor.registerExternalAssetHandler('browser-node', async () => {
      return null;
    });

    // Listen for right-click to add custom menu
    editor.on('event', (event: any) => {
      if (event?.name === 'pointer_down' && event.info?.button === 2) {
        // Right-click - will show context menu
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
          (window as any).__tldraw_editor = editor;
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
