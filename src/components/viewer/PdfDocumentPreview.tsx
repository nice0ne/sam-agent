import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  ExternalLink,
  Download,
  AlertCircle,
  LoaderCircle,
  Check,
} from 'lucide-react';
import { triggerBlobDownload } from '../../services/archive';

export interface PdfDocumentPreviewProps {
  content: string;
  filePath?: string;
  mimeType?: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Safely decodes base64 data URLs, raw base64, or binary strings into a PDF Blob.
 */
function createPdfBlob(content: string, mimeType?: string): Blob {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('PDF document content is empty.');
  }

  const targetMime = mimeType || 'application/pdf';

  // 1. Data URL check (e.g. data:application/pdf;base64,...)
  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.*)$/s);
  if (dataUrlMatch) {
    const base64Data = dataUrlMatch[2].replace(/\s/g, '');
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Uint8Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([byteNumbers], { type: targetMime });
  }

  // 2. Raw base64 string
  try {
    const cleanBase64 = trimmed.replace(/\s/g, '');
    if (/^[A-Za-z0-9+/=]+$/.test(cleanBase64) && cleanBase64.length % 4 === 0) {
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      return new Blob([byteNumbers], { type: targetMime });
    }
  } catch {
    // If base64 decode fails, proceed to binary conversion fallback
  }

  // 3. Fallback: Raw binary string
  const byteNumbers = new Uint8Array(trimmed.length);
  for (let i = 0; i < trimmed.length; i++) {
    byteNumbers[i] = trimmed.charCodeAt(i) & 0xff;
  }
  return new Blob([byteNumbers], { type: targetMime });
}

export const PdfDocumentPreview: React.FC<PdfDocumentPreviewProps> = ({
  content,
  filePath,
  mimeType,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDownloaded, setIsDownloaded] = useState<boolean>(false);

  // Extract human-friendly file name
  const fileName = useMemo(() => {
    if (filePath) {
      const cleanPath = filePath.replace(/\\/g, '/');
      const name = cleanPath.split('/').pop();
      if (name) return name;
    }
    return 'document.pdf';
  }, [filePath]);

  // Ensure download filename has .pdf extension
  const downloadFileName = useMemo(() => {
    if (fileName.toLowerCase().endsWith('.pdf')) {
      return fileName;
    }
    return `${fileName}.pdf`;
  }, [fileName]);

  // Compute file size indicator text
  const fileSizeText = useMemo(() => {
    if (pdfBlob && pdfBlob.size > 0) {
      return formatBytes(pdfBlob.size);
    }
    if (content.startsWith('data:')) {
      const base64Data = content.split(',')[1] || '';
      return formatBytes(Math.round(base64Data.length * 0.75));
    }
    if (content.length > 0 && !content.startsWith('http') && !content.startsWith('blob:')) {
      return formatBytes(content.length);
    }
    return null;
  }, [pdfBlob, content]);

  // Handle data decoding and memory management
  useEffect(() => {
    if (!content || !content.trim()) {
      setBlobUrl(null);
      setPdfBlob(null);
      setError('PDF document content is empty or unavailable.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    let createdUrl: string | null = null;

    try {
      // If content is already a blob URL or remote URL, use directly
      if (
        content.startsWith('blob:') ||
        content.startsWith('http://') ||
        content.startsWith('https://')
      ) {
        setBlobUrl(content);
        fetch(content)
          .then((res) => res.blob())
          .then((b) => setPdfBlob(b))
          .catch((err) => console.warn('Could not fetch blob from URL:', err));
        setIsLoading(false);
        return;
      }

      const blob = createPdfBlob(content, mimeType);
      if (blob.size === 0) {
        throw new Error('Decoded PDF file is empty (0 bytes).');
      }

      createdUrl = URL.createObjectURL(blob);
      setPdfBlob(blob);
      setBlobUrl(createdUrl);
      setIsLoading(false);
    } catch (err: unknown) {
      console.error('Failed to prepare PDF document:', err);
      const msg = err instanceof Error ? err.message : 'Failed to decode PDF document.';
      setError(msg);
      setPdfBlob(null);
      setBlobUrl(null);
      setIsLoading(false);
    }

    // Cleanup object URL to prevent memory leaks
    return () => {
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [content, mimeType]);

  // Open in full-sized Chrome tab
  const handleOpenInNewTab = useCallback(() => {
    if (!blobUrl) return;
    try {
      if (typeof chrome !== 'undefined' && chrome?.tabs?.create) {
        chrome.tabs.create({ url: blobUrl });
      } else {
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Failed to open PDF in new tab:', err);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
    }
  }, [blobUrl]);

  // Download PDF file locally
  const handleDownload = useCallback(() => {
    if (!pdfBlob && !blobUrl) return;

    try {
      if (pdfBlob) {
        triggerBlobDownload(pdfBlob, downloadFileName);
      } else if (blobUrl) {
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = downloadFileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }
      setIsDownloaded(true);
      setTimeout(() => setIsDownloaded(false), 2000);
    } catch (err) {
      console.error('Failed to download PDF:', err);
    }
  }, [pdfBlob, blobUrl, downloadFileName]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background select-none">
      {/* Top Header Toolbar */}
      <header className="h-11 px-3.5 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between gap-3 shrink-0 z-10 shadow-xs">
        {/* Left: Filename, Size, and PDF badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 shrink-0 shadow-xs">
            <FileText className="size-3.5" />
          </div>
          <div className="min-w-0 flex items-center gap-2">
            <span
              className="text-xs font-semibold text-foreground truncate max-w-[180px] sm:max-w-xs md:max-w-md"
              title={filePath || fileName}
            >
              {fileName}
            </span>
            {fileSizeText && (
              <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted border border-border/50 shrink-0">
                {fileSizeText}
              </span>
            )}
            <span className="hidden sm:inline-flex text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 shrink-0">
              PDF
            </span>
          </div>
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Open in New Tab Button */}
          <button
            type="button"
            onClick={handleOpenInNewTab}
            disabled={!blobUrl || !!error}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/80 hover:bg-muted text-xs font-medium text-foreground transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            title="Open PDF directly in a browser tab"
          >
            <ExternalLink className="size-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">Open in New Tab</span>
          </button>

          {/* Download PDF Button */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={(!pdfBlob && !blobUrl) || !!error}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            title="Download PDF document"
          >
            {isDownloaded ? (
              <>
                <Check className="size-3.5" />
                <span>Downloaded</span>
              </>
            ) : (
              <>
                <Download className="size-3.5" />
                <span>Download PDF</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content / Viewer Area */}
      <div className="flex-1 w-full min-h-0 bg-muted/20 relative overflow-hidden flex items-center justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <LoaderCircle className="size-8 animate-spin text-primary mb-3" />
            <p className="text-xs font-medium">Preparing PDF document preview...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-4 text-destructive shadow-sm">
              <AlertCircle className="size-6" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Unable to Preview PDF
            </h3>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              {error}
            </p>
            {filePath && (
              <span className="text-[11px] font-mono text-muted-foreground px-2.5 py-1 rounded-md bg-muted border border-border">
                {filePath}
              </span>
            )}
          </div>
        ) : blobUrl ? (
          <embed
            type="application/pdf"
            src={blobUrl}
            className="w-full h-full border-0"
          />
        ) : null}
      </div>
    </div>
  );
};

export default PdfDocumentPreview;
