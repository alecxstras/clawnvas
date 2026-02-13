import { useRef, useEffect, useState } from 'react';
import {
  TLBaseShape,
  ShapeUtil,
  HTMLContainer,
  TLOnResizeHandler,
  resizeBox,
  Geometry2d,
  Rectangle2d,
} from '@tldraw/tldraw';

type BrowserNodeShape = TLBaseShape<
  'browser-node',
  {
    w: number;
    h: number;
    url: string;
  }
>;

export class BrowserNodeUtil extends ShapeUtil<BrowserNodeShape> {
  static override type = 'browser-node' as const;

  getDefaultProps(): BrowserNodeShape['props'] {
    return {
      w: 500,
      h: 400,
      url: 'https://example.com',
    };
  }

  getGeometry(shape: BrowserNodeShape): Geometry2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: false,
    });
  }

  canResize = () => true;
  canBind = () => false;
  canEdit = () => false;

  onResize: TLOnResizeHandler<BrowserNodeShape> = (shape, info) => {
    return resizeBox(shape, info);
  };

  component(shape: BrowserNodeShape) {
    return <BrowserNodeComponent shape={shape} />;
  }

  indicator(shape: BrowserNodeShape) {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        stroke="#3b82f6"
        strokeWidth={2}
        fill="none"
      />
    );
  }
}

function BrowserNodeComponent({ shape }: { shape: BrowserNodeShape }) {
  const { w, h, url } = shape.props;
  const webviewRef = useRef<HTMLWebViewElement>(null);
  const [inputUrl, setInputUrl] = useState(url);

  const handleNavigate = () => {
    if (webviewRef.current) {
      let newUrl = inputUrl.trim();
      if (!newUrl.startsWith('http')) {
        newUrl = 'https://' + newUrl;
      }
      webviewRef.current.src = newUrl;
    }
  };

  return (
    <HTMLContainer style={{ width: w, height: h, pointerEvents: 'all' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        {/* Address Bar */}
        <div
          style={{
            height: 40,
            background: '#f1f1f1',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: 8,
            borderBottom: '1px solid #ddd',
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f' }} />
          </div>
          
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
            style={{
              flex: 1,
              border: '1px solid #ccc',
              background: '#fff',
              borderRadius: 16,
              padding: '4px 12px',
              fontSize: 13,
              outline: 'none',
            }}
          />
          
          <button
            onClick={handleNavigate}
            style={{
              padding: '4px 12px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Go
          </button>
        </div>

        {/* WebView */}
        <webview
          ref={webviewRef}
          src={url}
          style={{ flex: 1, width: '100%', border: 'none' }}
          allowpopups
        />
      </div>
    </HTMLContainer>
  );
}
