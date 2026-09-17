import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Copy,
  Check,
  Eye,
  Code,
  Grid,
  Sun,
  Moon,
  AlertCircle,
  RefreshCw,
  Image,
  RotateCcw,
  WrapText,
} from 'lucide-react';
import { triggerBlobDownload } from '../../services/archive';

export interface SvgInspectorPreviewProps {
  content: string;
  filePath?: string;
}

interface SvgMetadata {
  width: string | null;
  height: string | null;
  viewBox: string | null;
  numericWidth: number | null;
  numericHeight: number | null;
  formattedBadge: string;
}

type BackgroundMode = 'checkerboard' | 'dark' | 'light';

function parseSvgInfo(svgContent: string): {
  isValid: boolean;
  error?: string;
  metadata?: SvgMetadata;
  cleanSvg?: string;
} {
  const trimmed = svgContent.trim();
  if (!trimmed) {
    return { isValid: false, error: 'SVG content is empty or blank.' };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'image/svg+xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return {
        isValid: false,
        error: parserError.textContent || 'Malformed SVG syntax detected by XML parser.',
      };
    }

    const svgEl = doc.querySelector('svg');
    if (!svgEl) {
      return {
        isValid: false,
        error: 'No root <svg> element found in the document.',
      };
    }

    // Remove any potentially hazardous script tags for safe display
    doc.querySelectorAll('script').forEach((s) => s.remove());

    const widthAttr = svgEl.getAttribute('width');
    const heightAttr = svgEl.getAttribute('height');
    const viewBoxAttr = svgEl.getAttribute('viewBox');

    let numW: number | null = null;
    let numH: number | null = null;

    if (widthAttr) {
      const parsed = parseFloat(widthAttr);
      if (!isNaN(parsed) && parsed > 0) numW = parsed;
    }
    if (heightAttr) {
      const parsed = parseFloat(heightAttr);
      if (!isNaN(parsed) && parsed > 0) numH = parsed;
    }

    let viewBoxW: number | null = null;
    let viewBoxH: number | null = null;
    if (viewBoxAttr) {
      const parts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && !isNaN(parts[2]) && !isNaN(parts[3]) && parts[2] > 0 && parts[3] > 0) {
        viewBoxW = parts[2];
        viewBoxH = parts[3];
      }
    }

    const effectiveW = numW ?? viewBoxW;
    const effectiveH = numH ?? viewBoxH;

    // Build badge string, e.g. "512 × 512 px (viewBox: 0 0 512 512)"
    let formattedBadge = '';
    if (numW && numH) {
      formattedBadge = `${numW} × ${numH} px${viewBoxAttr ? ` (viewBox: ${viewBoxAttr})` : ''}`;
    } else if (viewBoxW && viewBoxH && viewBoxAttr) {
      formattedBadge = `${viewBoxW} × ${viewBoxH} px (viewBox: ${viewBoxAttr})`;
    } else if (viewBoxAttr) {
      formattedBadge = `viewBox: ${viewBoxAttr}`;
    } else {
      formattedBadge = 'Scalable Vector (SVG)';
    }

    return {
      isValid: true,
      metadata: {
        width: widthAttr,
        height: heightAttr,
        viewBox: viewBoxAttr,
        numericWidth: effectiveW,
        numericHeight: effectiveH,
        formattedBadge,
      },
      cleanSvg: svgEl.outerHTML,
    };
  } catch (err: any) {
    return {
      isValid: false,
      error: err?.message || 'Unexpected error while parsing SVG document.',
    };
  }
}

/**
 * Basic XML indent formatter for readable source view.
 */
function formatXml(xml: string): string {
  try {
    const PADDING = '  ';
    const reg = /(>)(<)(\/*)/g;
    const formatted = xml.trim().replace(reg, '$1\r\n$2$3');
    let pad = 0;
    return formatted
      .split('\r\n')
      .map((node) => {
        let indent = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
          indent = 0;
        } else if (node.match(/^<\/\w/)) {
          if (pad !== 0) {
            pad -= 1;
          }
        } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
          indent = 1;
        } else {
          indent = 0;
        }

        const padding = new Array(pad + 1).join(PADDING);
        pad += indent;
        return padding + node;
      })
      .join('\n');
  } catch {
    return xml;
  }
}

export const SvgInspectorPreview: React.FC<SvgInspectorPreviewProps> = ({
  content,
  filePath,
}) => {
  // View mode switcher: "Visual Canvas" vs "XML Source"
  const [viewMode, setViewMode] = useState<'canvas' | 'source'>('canvas');

  // Background mode: checkerboard vs dark vs light
  const [bgMode, setBgMode] = useState<BackgroundMode>('checkerboard');

  // Pan & Zoom state for Visual Canvas
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  // Action status indicators
  const [copied, setCopied] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [parseRetryKey, setParseRetryKey] = useState<number>(0);

  // Source tab state
  const [wordWrap, setWordWrap] = useState<boolean>(false);
  const [formatSource, setFormatSource] = useState<boolean>(true);

  // Parse SVG info
  const parsedSvg = useMemo(() => {
    return parseSvgInfo(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, parseRetryKey]);

  // Clean filename without directory and extension
  const baseFilename = useMemo(() => {
    if (filePath) {
      const parts = filePath.split('/');
      const last = parts[parts.length - 1];
      if (last) {
        return last.replace(/\.[^/.]+$/, '');
      }
    }
    return 'vector-graphic';
  }, [filePath]);

  // Source lines
  const sourceCode = useMemo(() => {
    if (!content) return '';
    return formatSource ? formatXml(content) : content;
  }, [content, formatSource]);

  const sourceLines = useMemo(() => {
    return sourceCode.split(/\r?\n/);
  }, [sourceCode]);

  // Mouse wheel zoom centered on cursor
  useEffect(() => {
    if (viewMode !== 'canvas') return;
    const el = viewportRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;

      setZoom((prevZoom) => {
        const nextZoom = Math.min(Math.max(0.2, Number((prevZoom * zoomFactor).toFixed(3))), 5.0);
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
  }, [viewMode]);

  // Mouse drag panning across canvas
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left mouse click only
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

  // Zoom controls
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 5.0));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.2));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleFit = useCallback(() => {
    if (!viewportRef.current) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const viewportRect = viewportRef.current.getBoundingClientRect();
    const w = parsedSvg.metadata?.numericWidth || 512;
    const h = parsedSvg.metadata?.numericHeight || 512;

    if (w > 0 && h > 0) {
      const padding = 64;
      const availW = Math.max(100, viewportRect.width - padding);
      const availH = Math.max(100, viewportRect.height - padding);
      const fitScale = Math.min(availW / w, availH / h, 2.0);
      const clampedFit = Math.min(Math.max(0.2, Number(fitScale.toFixed(2))), 5.0);
      setZoom(clampedFit);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [parsedSvg.metadata]);

  // Export & Copy actions
  const handleCopySvg = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy SVG to clipboard:', err);
    }
  };

  const handleDownloadSvg = () => {
    if (!content) return;
    const filename = `${baseFilename}.svg`;
    const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' });
    triggerBlobDownload(blob, filename);
  };

  const handleExportPng = async () => {
    if (!content) return;
    setIsExporting(true);
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      if (!svgEl) {
        throw new Error('No root <svg> found for PNG export');
      }

      const width = parsedSvg.metadata?.numericWidth || 512;
      const height = parsedSvg.metadata?.numericHeight || 512;
      const scale = 2; // 2x DPI resolution

      // Ensure root svg has xmlns and explicit dimensions
      if (!svgEl.getAttribute('xmlns')) {
        svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      }
      svgEl.setAttribute('width', String(width));
      svgEl.setAttribute('height', String(height));

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgEl);

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not obtain canvas 2D rendering context');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new window.Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(e);
        };
        img.src = url;
      });

      canvas.toBlob((blob) => {
        if (blob) {
          const filename = `${baseFilename}.png`;
          triggerBlobDownload(blob, filename);
        }
      }, 'image/png');
    } catch (err) {
      console.error('Failed to export SVG as PNG:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background select-none">
      {/* Top Header Bar */}
      <header className="h-11 px-3.5 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between gap-3 shrink-0 select-none z-10 shadow-xs">
        {/* Left: Mode Switcher & Metadata Badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Dual-View Mode Switcher */}
          <div className="flex items-center p-0.5 rounded-lg bg-muted border border-border/60 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('canvas')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'canvas'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Visual Canvas"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Visual Canvas</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('source')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'source'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="XML Source"
            >
              <Code className="w-3.5 h-3.5" />
              <span>XML Source</span>
            </button>
          </div>

          {/* Header Metadata Badge */}
          {parsedSvg.metadata?.formattedBadge && (
            <div
              className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/70 border border-border/50 text-[11px] font-mono text-muted-foreground truncate max-w-xs md:max-w-md"
              title="SVG Metadata: Dimensions & ViewBox"
            >
              <span className="text-foreground/90 font-medium">
                {parsedSvg.metadata.formattedBadge}
              </span>
            </div>
          )}
        </div>

        {/* Right: Background Mode Switcher & Export Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Background Mode Switcher (Canvas Mode only) */}
          {viewMode === 'canvas' && (
            <div className="flex items-center p-0.5 rounded-lg bg-muted border border-border/60 shrink-0">
              <button
                type="button"
                onClick={() => setBgMode('checkerboard')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  bgMode === 'checkerboard'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Checkerboard pattern (Transparency grid)"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setBgMode('dark')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  bgMode === 'dark'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Dark background (bg-slate-950)"
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setBgMode('light')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  bgMode === 'light'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Light background (bg-white)"
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="w-px h-4 bg-border mx-0.5" />

          {/* Copy SVG Action */}
          <button
            type="button"
            onClick={handleCopySvg}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/70 hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-xs active:scale-95"
            title="Copy SVG code to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Copy SVG</span>
              </>
            )}
          </button>

          {/* Export PNG Action */}
          <button
            type="button"
            onClick={handleExportPng}
            disabled={!parsedSvg.isValid || isExporting}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/70 hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs active:scale-95"
            title="Export as PNG at 2x resolution"
          >
            {isExporting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <Image className="w-3.5 h-3.5" />
            )}
            <span className="hidden md:inline">Export PNG</span>
          </button>

          {/* Download SVG Action */}
          <button
            type="button"
            onClick={handleDownloadSvg}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-medium transition-all cursor-pointer shadow-xs active:scale-95"
            title="Download raw SVG file"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Download SVG</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {viewMode === 'canvas' ? (
          /* ================= VISUAL CANVAS TAB ================= */
          parsedSvg.isValid ? (
            <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
              {/* Floating Zoom & Fit Toolbar */}
              <div className="absolute top-4 right-4 z-20 flex items-center gap-1 bg-card/90 backdrop-blur-md border border-border px-2 py-1 rounded-xl shadow-md">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  disabled={zoom <= 0.2}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  title="Reset to 100%"
                  className="text-xs font-mono font-medium px-2 py-0.5 min-w-14 text-center text-foreground hover:bg-muted rounded-md transition-colors cursor-pointer"
                >
                  {Math.round(zoom * 100)}%
                </button>

                <button
                  type="button"
                  onClick={handleZoomIn}
                  title="Zoom In"
                  disabled={zoom >= 5.0}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-border mx-0.5" />

                <button
                  type="button"
                  onClick={handleReset}
                  title="Reset View (100%)"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleFit}
                  title="Fit to Screen"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Interactive Pan & Zoom Canvas */}
              <div
                ref={viewportRef}
                onMouseDown={handleMouseDown}
                className={`w-full h-full flex items-center justify-center overflow-hidden transition-colors ${
                  isDragging ? 'cursor-grabbing' : 'cursor-grab'
                } ${
                  bgMode === 'dark'
                    ? 'bg-slate-950'
                    : bgMode === 'light'
                    ? 'bg-white'
                    : 'bg-muted/20'
                }`}
                style={
                  bgMode === 'checkerboard'
                    ? {
                        backgroundImage: `
                          linear-gradient(45deg, rgba(128, 128, 128, 0.15) 25%, transparent 25%),
                          linear-gradient(-45deg, rgba(128, 128, 128, 0.15) 25%, transparent 25%),
                          linear-gradient(45deg, transparent 75%, rgba(128, 128, 128, 0.15) 75%),
                          linear-gradient(-45deg, transparent 75%, rgba(128, 128, 128, 0.15) 75%)
                        `,
                        backgroundSize: '20px 20px',
                        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                      }
                    : undefined
                }
              >
                <div
                  ref={diagramRef}
                  className={`inline-block origin-center ${
                    isDragging ? '' : 'transition-transform duration-75 ease-out'
                  } [&>svg]:max-w-none [&>svg]:h-auto`}
                  style={{
                    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                    transformOrigin: 'center center',
                    width: parsedSvg.metadata?.numericWidth
                      ? `${parsedSvg.metadata.numericWidth}px`
                      : undefined,
                    height: parsedSvg.metadata?.numericHeight
                      ? `${parsedSvg.metadata.numericHeight}px`
                      : undefined,
                  }}
                  dangerouslySetInnerHTML={{ __html: parsedSvg.cleanSvg || content }}
                />
              </div>

              {/* Bottom Hint */}
              <div className="absolute bottom-3 left-3 pointer-events-none text-[11px] text-muted-foreground/70 bg-card/70 backdrop-blur-xs px-2.5 py-1 rounded-md border border-border/50 select-none">
                Scroll to zoom · Drag to pan
              </div>
            </div>
          ) : (
            /* Graceful Fallback Alert Card */
            <div className="flex flex-col items-center justify-center h-full p-6 text-center select-text bg-muted/10">
              <div className="max-w-md w-full p-5 border border-destructive/40 bg-destructive/10 rounded-2xl text-left shadow-lg">
                <div className="flex items-center gap-2.5 font-semibold text-sm text-destructive mb-2">
                  <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                  <span>Malformed SVG Document</span>
                </div>
                <p className="text-muted-foreground text-xs font-mono leading-relaxed break-words mb-4">
                  {parsedSvg.error || 'The SVG content contains syntax errors or missing tags.'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode('source')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>Inspect XML Source</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setParseRetryKey((k) => k + 1)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-medium transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Parsing</span>
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          /* ================= XML SOURCE TAB ================= */
          <div className="flex flex-col h-full overflow-hidden bg-background">
            {/* Source sub-toolbar */}
            <div className="h-9 px-4 border-b border-border/80 bg-muted/40 flex items-center justify-between gap-2 shrink-0 select-none text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px]">
                  {sourceLines.length} {sourceLines.length === 1 ? 'line' : 'lines'}
                </span>
                <span className="text-border">•</span>
                <span className="font-mono text-[11px]">
                  {new Blob([content]).size} bytes
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFormatSource(!formatSource)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
                    formatSource
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted border-transparent'
                  }`}
                  title="Toggle XML pretty formatting"
                >
                  <span>Format XML</span>
                </button>

                <button
                  type="button"
                  onClick={() => setWordWrap(!wordWrap)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
                    wordWrap
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted border-transparent'
                  }`}
                  title="Toggle word wrap"
                >
                  <WrapText className="w-3.5 h-3.5" />
                  <span>Wrap</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopySvg}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  title="Copy XML source"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-500 font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Code Viewer with Sticky Line Numbers */}
            <div className="flex-1 overflow-auto bg-card font-mono text-xs select-text">
              <table className="w-full border-collapse">
                <tbody>
                  {sourceLines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-muted/40 transition-colors group">
                      <td className="sticky left-0 z-10 w-12 min-w-12 px-3 py-0.5 text-right select-none text-muted-foreground/50 group-hover:text-muted-foreground bg-card group-hover:bg-muted/40 border-r border-border/40 font-mono text-[11px] leading-5 align-top">
                        {idx + 1}
                      </td>
                      <td
                        className={`px-4 py-0.5 text-foreground/90 font-mono leading-5 align-top ${
                          wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
                        }`}
                      >
                        {line || '\n'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SvgInspectorPreview;
