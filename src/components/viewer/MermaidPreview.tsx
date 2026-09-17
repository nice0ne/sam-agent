import React, { useEffect, useRef, useState, useCallback } from 'react';
import mermaid from 'mermaid';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Image,
  RotateCcw,
} from 'lucide-react';
import { triggerBlobDownload } from '../../services/archive';

export interface MermaidPreviewProps {
  content: string;
  filePath?: string;
}

export const MermaidPreview: React.FC<MermaidPreviewProps> = ({ content, filePath }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);

  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedSvg, setCopiedSvg] = useState<boolean>(false);
  const [renderTrigger, setRenderTrigger] = useState<number>(0);

  // Pan & Zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  // Track dark mode changes
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      setIsDark(dark);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Render Mermaid diagram
  useEffect(() => {
    let isMounted = true;

    const renderDiagram = async () => {
      setIsLoading(true);
      setError(null);

      const cleanContent = content
        .trim()
        .replace(/^```(?:mermaid)?\r?\n?/i, '')
        .replace(/\r?\n?```$/i, '')
        .trim();

      if (!cleanContent) {
        if (isMounted) {
          setSvg('');
          setIsLoading(false);
        }
        return;
      }

      const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'default';
      mermaid.initialize({
        startOnLoad: false,
        theme,
        securityLevel: 'loose',
        fontFamily: 'inherit',
      });

      const id = `mermaid-render-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      try {
        const { svg: renderedSvg } = await mermaid.render(id, cleanContent);
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
          setIsLoading(false);
        }
      } catch (err: any) {
        // Clean up any stray error elements created by Mermaid in document
        const stray = document.querySelectorAll(
          `[id^="dmermaid-render-"], [id^="${id}"], [id^="d${id}"]`
        );
        stray.forEach((el) => el.remove());

        if (isMounted) {
          setError(err?.message || 'Failed to render Mermaid diagram. Please check your syntax.');
          setIsLoading(false);
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [content, isDark, renderTrigger]);

  // Mouse wheel zoom centered at cursor
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;

      setZoom((prevZoom) => {
        const nextZoom = Math.min(Math.max(0.2, Number((prevZoom * zoomFactor).toFixed(3))), 5);
        if (nextZoom === prevZoom) return prevZoom;

        const ratio = nextZoom / prevZoom;
        setPan((prevPan) => ({
          x: mouseX - (mouseX - prevPan.x) * ratio,
          y: mouseY - (mouseY - prevPan.y) * ratio,
        }));

        return nextZoom;
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Mouse drag panning across window
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left mouse button only
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Toolbar Actions
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 5));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.2));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleFit = useCallback(() => {
    if (!viewportRef.current || !diagramRef.current) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const viewportRect = viewportRef.current.getBoundingClientRect();
    const svgEl = diagramRef.current.querySelector('svg');
    if (!svgEl) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    let svgW = svgEl.viewBox?.baseVal?.width || svgEl.clientWidth || 600;
    let svgH = svgEl.viewBox?.baseVal?.height || svgEl.clientHeight || 400;

    if (svgW > 0 && svgH > 0) {
      const padding = 64;
      const availW = Math.max(100, viewportRect.width - padding);
      const availH = Math.max(100, viewportRect.height - padding);
      const fitScale = Math.min(availW / svgW, availH / svgH, 1.5);
      const clampedFit = Math.min(Math.max(0.2, Number(fitScale.toFixed(2))), 5);
      setZoom(clampedFit);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, []);

  const getBaseFilename = (): string => {
    if (filePath) {
      const parts = filePath.split('/');
      const last = parts[parts.length - 1];
      if (last) {
        return last.replace(/\.[^/.]+$/, '');
      }
    }
    return 'mermaid-diagram';
  };

  const handleCopySvg = () => {
    if (!svg) return;
    navigator.clipboard.writeText(svg);
    setCopiedSvg(true);
    setTimeout(() => setCopiedSvg(false), 2000);
  };

  const handleExportSvg = () => {
    if (!svg) return;
    const filename = `${getBaseFilename()}.svg`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    triggerBlobDownload(blob, filename);
  };

  const handleExportPng = async () => {
    if (!svg) return;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svg, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      if (!svgEl) return;

      let width = 800;
      let height = 600;

      if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width > 0) {
        width = svgEl.viewBox.baseVal.width;
        height = svgEl.viewBox.baseVal.height;
      } else {
        const wAttr = parseFloat(svgEl.getAttribute('width') || '');
        const hAttr = parseFloat(svgEl.getAttribute('height') || '');
        if (!isNaN(wAttr) && wAttr > 0) width = wAttr;
        if (!isNaN(hAttr) && hAttr > 0) height = hAttr;
      }

      const scale = 2; // 2x DPI
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dark = document.documentElement.classList.contains('dark');
      ctx.fillStyle = dark ? '#18181b' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const img = new window.Image();
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = (err) => {
          URL.revokeObjectURL(url);
          reject(err);
        };
        img.src = url;
      });

      canvas.toBlob((blob) => {
        if (blob) {
          const filename = `${getBaseFilename()}.png`;
          triggerBlobDownload(blob, filename);
        }
      }, 'image/png');
    } catch (err) {
      console.error('Failed to export diagram as PNG:', err);
    }
  };

  // Syntax error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center select-text bg-muted/10">
        <div className="max-w-xl w-full p-5 border border-destructive/40 bg-destructive/10 rounded-2xl text-left shadow-lg">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 font-semibold text-sm text-destructive">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <span>Mermaid Syntax Error</span>
            </div>
            <button
              type="button"
              onClick={() => setRenderTrigger((t) => t + 1)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive font-medium transition-colors cursor-pointer"
              title="Retry rendering diagram"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>

          <p className="text-muted-foreground text-xs mb-3 font-mono leading-relaxed break-words">
            {error}
          </p>

          <div className="relative">
            <div className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mb-1.5">
              Diagram Source:
            </div>
            <pre className="p-3 bg-background/90 rounded-xl overflow-x-auto whitespace-pre border border-destructive/20 text-xs font-mono leading-relaxed max-h-64 text-foreground selection:bg-destructive/30">
              {content}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!content.trim()) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
        <p className="text-sm font-medium">Empty Mermaid Diagram</p>
        <p className="text-xs mt-1">Diagram content is empty or contains only whitespace.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-muted/15 select-none flex items-center justify-center">
      {/* Floating Control Toolbar */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1 bg-card/90 backdrop-blur-md border border-border px-2 py-1 rounded-xl shadow-md">
        {/* Zoom Out */}
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out"
          disabled={zoom <= 0.2}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        {/* Zoom Level Readout / Click to Reset */}
        <button
          type="button"
          onClick={handleReset}
          title="Reset to 100%"
          className="text-xs font-mono font-medium px-2 py-0.5 min-w-14 text-center text-foreground hover:bg-muted rounded-md transition-colors cursor-pointer"
        >
          {Math.round(zoom * 100)}%
        </button>

        {/* Zoom In */}
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In"
          disabled={zoom >= 5}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Reset (100%) */}
        <button
          type="button"
          onClick={handleReset}
          title="Reset View (100%)"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Fit to Viewport */}
        <button
          type="button"
          onClick={handleFit}
          title="Fit to Screen"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Copy SVG code */}
        <button
          type="button"
          onClick={handleCopySvg}
          title="Copy SVG code"
          disabled={!svg}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1"
        >
          {copiedSvg ? (
            <Check className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Export SVG */}
        <button
          type="button"
          onClick={handleExportSvg}
          title="Export as SVG"
          disabled={!svg}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        {/* Export PNG */}
        <button
          type="button"
          onClick={handleExportPng}
          title="Export as PNG (2x DPI)"
          disabled={!svg}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Image className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/50 backdrop-blur-xs gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground/60" />
          <span className="text-xs font-medium text-muted-foreground">Rendering diagram...</span>
        </div>
      )}

      {/* Interactive Pan & Zoom Canvas */}
      <div
        ref={viewportRef}
        onMouseDown={handleMouseDown}
        className={`w-full h-full flex items-center justify-center overflow-hidden ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div
          ref={diagramRef}
          className={`inline-block origin-center ${
            isDragging ? '' : 'transition-transform duration-75 ease-out'
          } [&>svg]:max-w-none [&>svg]:h-auto`}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {/* Bottom Hint */}
      <div className="absolute bottom-3 left-3 pointer-events-none text-[11px] text-muted-foreground/60 bg-card/60 backdrop-blur-xs px-2.5 py-1 rounded-md border border-border/40 select-none">
        Scroll to zoom · Drag to pan
      </div>
    </div>
  );
};
