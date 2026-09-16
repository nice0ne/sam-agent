import React, { useState, useMemo } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';

export interface ImagePreviewProps {
  content: string;
  mimeType?: string;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ content, mimeType = 'image/png' }) => {
  const [scale, setScale] = useState<number>(1);

  const imageSrc = useMemo(() => {
    if (!content) return '';
    if (content.startsWith('data:') || content.startsWith('blob:') || content.startsWith('http://') || content.startsWith('https://')) {
      return content;
    }

    // Handle raw SVG markup
    if (mimeType.includes('svg') || content.trim().startsWith('<svg')) {
      return `data:image/svg+xml;utf8,${encodeURIComponent(content)}`;
    }

    // Default base64 data URL
    return `data:${mimeType};base64,${content}`;
  }, [content, mimeType]);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 4));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.25));
  };

  const handleReset = () => {
    setScale(1);
  };

  const handleFit = () => {
    setScale(0.75);
  };

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
        <p className="text-sm font-medium">No Image Content</p>
        <p className="text-xs mt-1">Image data is empty or corrupted.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center p-8 overflow-auto bg-muted/20 select-none">
      {/* Floating Zoom Toolbar */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1 bg-card/90 backdrop-blur border border-border px-2 py-1 rounded-xl shadow-md">
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out"
          disabled={scale <= 0.25}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <span className="text-xs font-mono font-medium px-2 py-0.5 min-w-14 text-center text-foreground">
          {Math.round(scale * 100)}%
        </span>

        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In"
          disabled={scale >= 4}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="w-px h-4 bg-border mx-1" />

        <button
          type="button"
          onClick={handleReset}
          title="Reset Zoom (100%)"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={handleFit}
          title="Fit Size (75%)"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Image Display */}
      <div className="flex items-center justify-center min-w-full min-h-full">
        <img
          src={imageSrc}
          alt="Artifact Preview"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
          className="max-h-[82vh] max-w-[85vw] object-contain transition-transform duration-200 ease-out rounded-lg shadow-lg border border-border/80 bg-card"
        />
      </div>
    </div>
  );
};

export default ImagePreview;
