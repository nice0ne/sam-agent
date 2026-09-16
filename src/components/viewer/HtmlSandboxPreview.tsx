import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Monitor,
  Tablet,
  Smartphone,
  Maximize2,
  RotateCw,
  Sun,
  Moon,
  Grid,
  ExternalLink,
} from 'lucide-react';
import { getVfsFile, saveVfsFile, listVfsFiles } from '../../services/vfs';

export interface HtmlSandboxPreviewProps {
  htmlContent: string;
  filePath?: string;
  onOpenNewTab?: () => void;
}

type ViewportMode = 'full' | 'desktop' | 'tablet' | 'mobile';
type CanvasBg = 'light' | 'dark' | 'grid';

export const HtmlSandboxPreview: React.FC<HtmlSandboxPreviewProps> = ({
  htmlContent,
  filePath,
  onOpenNewTab,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [viewport, setViewport] = useState<ViewportMode>('full');
  const [canvasBg, setCanvasBg] = useState<CanvasBg>('light');
  const [renderKey, setRenderKey] = useState(0);
  const isReadyRef = useRef(false);

  // Send HTML to sandbox when ready or content changes
  const sendHtmlToSandbox = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'render', html: htmlContent }, '*');
    }
  }, [htmlContent]);

  useEffect(() => {
    if (isReadyRef.current) {
      sendHtmlToSandbox();
    }
  }, [htmlContent, sendHtmlToSandbox, renderKey]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        if (data.type === 'sandbox-ready') {
          setIsReady(true);
          isReadyRef.current = true;
          sendHtmlToSandbox();
          return;
        }

        // Handle VFS operations relayed by sandbox-render.html
        if (data.type === 'FS_READ_REQUEST') {
          try {
            const file = await getVfsFile(data.path);
            iframeRef.current?.contentWindow?.postMessage(
              { type: 'FS_READ_RESPONSE', id: data.id, success: true, content: file?.content || '' },
              '*'
            );
          } catch (err: any) {
            iframeRef.current?.contentWindow?.postMessage(
              { type: 'FS_READ_RESPONSE', id: data.id, success: false, error: err?.message || 'Failed to read file' },
              '*'
            );
          }
        } else if (data.type === 'FS_WRITE_REQUEST') {
          try {
            await saveVfsFile(data.path, data.content);
            iframeRef.current?.contentWindow?.postMessage(
              { type: 'FS_WRITE_RESPONSE', id: data.id, success: true },
              '*'
            );
          } catch (err: any) {
            iframeRef.current?.contentWindow?.postMessage(
              { type: 'FS_WRITE_RESPONSE', id: data.id, success: false, error: err?.message || 'Failed to write file' },
              '*'
            );
          }
        } else if (data.type === 'FS_LIST_REQUEST') {
          try {
            const entries = await listVfsFiles(data.path || '/');
            iframeRef.current?.contentWindow?.postMessage(
              { type: 'FS_LIST_RESPONSE', id: data.id, success: true, entries: entries.map((e) => e.path) },
              '*'
            );
          } catch (err: any) {
            iframeRef.current?.contentWindow?.postMessage(
              { type: 'FS_LIST_RESPONSE', id: data.id, success: false, error: err?.message || 'Failed to list files' },
              '*'
            );
          }
        } else if (data.type === 'FS_EXISTS_REQUEST') {
          try {
            const file = await getVfsFile(data.path);
            iframeRef.current?.contentWindow?.postMessage(
              { type: 'FS_EXISTS_RESPONSE', id: data.id, success: true, exists: !!file },
              '*'
            );
          } catch (err: any) {
            iframeRef.current?.contentWindow?.postMessage(
              { type: 'FS_EXISTS_RESPONSE', id: data.id, success: false, error: err?.message || 'Failed to check file existence' },
              '*'
            );
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [sendHtmlToSandbox]);

  const handleReload = () => {
    isReadyRef.current = false;
    setIsReady(false);
    setRenderKey((k) => k + 1);
  };

  const handleOpenDirectTab = () => {
    if (onOpenNewTab) {
      onOpenNewTab();
      return;
    }
    try {
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      if (typeof chrome !== 'undefined' && chrome?.tabs?.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank');
      }
    } catch (err) {
      console.error('Failed to open HTML in new tab:', err);
    }
  };

  // Get viewport dimensions
  const getViewportStyle = () => {
    switch (viewport) {
      case 'desktop':
        return { width: '1200px', maxWidth: '100%', height: '100%' };
      case 'tablet':
        return { width: '768px', maxWidth: '100%', height: '100%' };
      case 'mobile':
        return { width: '375px', maxWidth: '100%', height: '100%' };
      case 'full':
      default:
        return { width: '100%', height: '100%' };
    }
  };

  // Canvas background style
  const getCanvasBgClass = () => {
    switch (canvasBg) {
      case 'dark':
        return 'bg-[#0f172a]';
      case 'grid':
        return 'bg-[#f8fafc] dark:bg-[#090d16] bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px]';
      case 'light':
      default:
        return 'bg-slate-100 dark:bg-slate-900/60';
    }
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-background">
      {/* Sandbox Sub-Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/60 backdrop-blur-sm text-xs select-none shrink-0">
        {/* Left: Viewport Controls */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-muted-foreground mr-1 hidden sm:inline">
            Viewport:
          </span>
          <div className="flex items-center p-0.5 rounded-lg bg-muted border border-border/50">
            <button
              type="button"
              onClick={() => setViewport('full')}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                viewport === 'full' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Full Width (Responsive)"
            >
              <Maximize2 className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewport('desktop')}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                viewport === 'desktop' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Desktop Viewport (1200px)"
            >
              <Monitor className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewport('tablet')}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                viewport === 'tablet' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Tablet Viewport (768px)"
            >
              <Tablet className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewport('mobile')}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                viewport === 'mobile' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Mobile Viewport (375px)"
            >
              <Smartphone className="size-3.5" />
            </button>
          </div>

          <span className="text-[10px] font-mono text-muted-foreground ml-1.5 hidden md:inline">
            {viewport === 'full' ? '100% Full' : viewport === 'desktop' ? '1200px' : viewport === 'tablet' ? '768px' : '375px'}
          </span>
        </div>

        {/* Right: Canvas Bg & Open in Browser Tab */}
        <div className="flex items-center gap-2">
          {/* Canvas Background toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-muted border border-border/50">
            <button
              type="button"
              onClick={() => setCanvasBg('light')}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                canvasBg === 'light' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Light Canvas Background"
            >
              <Sun className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCanvasBg('dark')}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                canvasBg === 'dark' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Dark Canvas Background"
            >
              <Moon className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCanvasBg('grid')}
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                canvasBg === 'grid' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Grid Pattern Background"
            >
              <Grid className="size-3.5" />
            </button>
          </div>

          {/* Reload sandbox */}
          <button
            type="button"
            onClick={handleReload}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title="Reload sandbox preview"
          >
            <RotateCw className="size-3.5" />
          </button>

          {/* Open in full browser tab */}
          <button
            type="button"
            onClick={handleOpenDirectTab}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-[11px] font-medium transition-all cursor-pointer shadow-xs active:scale-95"
            title="Open HTML in a native Chrome browser tab"
          >
            <ExternalLink className="size-3" />
            <span>Open in Tab</span>
          </button>
        </div>
      </div>

      {/* Sandbox Canvas Area */}
      <div className={`flex-1 min-h-0 overflow-auto flex items-center justify-center p-0 transition-colors ${getCanvasBgClass()}`}>
        <div
          style={getViewportStyle()}
          className={`h-full transition-all duration-200 bg-white ${
            viewport !== 'full' ? 'shadow-2xl border-x border-border/80 my-auto' : ''
          }`}
        >
          <iframe
            key={renderKey}
            ref={iframeRef}
            src={chrome.runtime.getURL('sandbox-render.html')}
            className="w-full h-full border-none bg-white"
            title="Web Artifact Sandbox"
          />
        </div>
      </div>
    </div>
  );
};
