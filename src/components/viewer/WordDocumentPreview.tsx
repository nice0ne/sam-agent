import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { renderAsync } from 'docx-preview';
import {
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  AlertCircle,
  LoaderCircle,
  RefreshCw,
  FileCode,
  Copy,
  Check,
  Eye,
  Code,
  Printer,
} from 'lucide-react';
import { triggerBlobDownload } from '../../services/archive';

export interface WordDocumentPreviewProps {
  content: string;
  filePath?: string;
}

export type WordDocType = 'docx' | 'word-html' | 'binary-doc';

/**
 * Format raw byte size into human-readable representation.
 */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Tests whether a given text snippet has Word HTML / MSO markup signatures.
 */
function isWordHtmlSnippet(text: string): boolean {
  if (!text || text.length < 10) return false;
  const lower = text.toLowerCase();

  // Microsoft Office / Word specific XML namespaces and tags
  if (
    lower.includes('urn:schemas-microsoft-com:office:word') ||
    lower.includes('urn:schemas-microsoft-com:office:office') ||
    lower.includes('<w:worddocument') ||
    lower.includes('xmlns:w=') ||
    lower.includes('xmlns:o=') ||
    lower.includes('mso-') ||
    lower.includes('<!--[if gte mso')
  ) {
    return true;
  }

  // HTML documents saved with Word extensions (.doc / .docx)
  if (
    (lower.startsWith('<!doctype html') || lower.startsWith('<html') || lower.includes('<head>') || lower.includes('<body>')) &&
    (lower.includes('size: a4') || lower.includes('margin:') || lower.includes('font-family:') || lower.includes('<table'))
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts Word HTML content if available, checking both raw content and decoded bytes.
 */
function extractWordHtml(content: string, bytes: Uint8Array): string | null {
  // 1. Direct check on content string
  if (content && typeof content === 'string') {
    const trimmed = content.trim();
    if (isWordHtmlSnippet(trimmed)) {
      return trimmed;
    }
  }

  // 2. Decode bytes as UTF-8 text and check
  if (bytes && bytes.length > 0) {
    try {
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const trimmed = decoded.trim();
      if (isWordHtmlSnippet(trimmed)) {
        return trimmed;
      }
    } catch {
      // Fall through
    }
  }

  return null;
}

/**
 * Decodes content (Base64 data URL, raw Base64, or binary string) into an ArrayBuffer and Uint8Array.
 */
function decodeContentToArrayBuffer(content: string): { buffer: ArrayBuffer; bytes: Uint8Array } {
  if (!content) {
    const empty = new Uint8Array(0);
    return { buffer: empty.buffer as ArrayBuffer, bytes: empty };
  }

  // 1. Base64 Data URL (e.g. data:...;base64,...)
  const dataUrlMatch = content.match(/^data:([^;]+);base64,(.*)$/s);
  if (dataUrlMatch) {
    try {
      const base64Data = dataUrlMatch[2].replace(/\s/g, '');
      const binaryStr = atob(base64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return { buffer: bytes.buffer as ArrayBuffer, bytes };
    } catch {
      // Fall through to other decoding methods
    }
  }

  // 2. Pure Base64 string check (ZIP magic PK.. is UEsDB in Base64; OLE magic is 0M8R4)
  const trimmed = content.trim();
  if (
    trimmed.startsWith('UEsDB') ||
    trimmed.startsWith('0M8R4') ||
    (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && trimmed.length % 4 === 0 && trimmed.length > 24)
  ) {
    try {
      const clean = trimmed.replace(/\s/g, '');
      const binaryStr = atob(clean);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return { buffer: bytes.buffer as ArrayBuffer, bytes };
    } catch {
      // Fall through
    }
  }

  // 3. Binary char string fallback (8-bit characters)
  const len = content.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = content.charCodeAt(i) & 0xff;
  }
  return { buffer: bytes.buffer as ArrayBuffer, bytes };
}

/**
 * Checks for ZIP archive magic bytes (0x50, 0x4B, 0x03, 0x04).
 */
function isDocxZipBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Checks for OLE Compound File Binary Format (CFBF) magic bytes (0xD0, 0xCF, 0x11, 0xE0).
 */
function isOleBinaryBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

/**
 * Resolves the specific Word document subtype:
 * - 'word-html': HTML document with MSO/Word headers or styling (.doc)
 * - 'docx': OpenXML ZIP document (.docx)
 * - 'binary-doc': Legacy binary OLE Compound document (.doc)
 */
function resolveWordDocType(
  filePath: string | undefined,
  bytes: Uint8Array,
  wordHtml: string | null
): WordDocType {
  // 1. If Word HTML markup was identified, it takes highest precedence for HTML .doc files
  if (wordHtml !== null) {
    return 'word-html';
  }

  // 2. OpenXML ZIP magic signature (PK\x03\x04)
  if (isDocxZipBytes(bytes)) {
    return 'docx';
  }

  // 3. Legacy OLE Compound Binary signature (D0 CF 11 E0)
  if (isOleBinaryBytes(bytes)) {
    return 'binary-doc';
  }

  // 4. File extension fallback
  if (filePath) {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.docx')) {
      return 'docx';
    }
    if (lower.endsWith('.doc')) {
      return 'binary-doc';
    }
  }

  return 'docx';
}

/**
 * Extracts readable plain-text lines from legacy binary .doc documents.
 */
function extractReadableTextFromLegacyDoc(bytes: Uint8Array): string[] {
  const extracted: string[] = [];

  // 1. Scan UTF-16LE characters (Word 97-2003 stores most body text as UTF-16LE)
  let utf16Buffer = '';
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9 || (code >= 160 && code <= 0xd7ff)) {
      utf16Buffer += String.fromCharCode(code);
    } else {
      if (utf16Buffer.trim().length >= 4) {
        extracted.push(utf16Buffer.trim());
      }
      utf16Buffer = '';
    }
  }
  if (utf16Buffer.trim().length >= 4) {
    extracted.push(utf16Buffer.trim());
  }

  // 2. Scan ASCII / 8-bit text fragments
  let asciiBuffer = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13 || byte === 9) {
      asciiBuffer += String.fromCharCode(byte);
    } else {
      if (asciiBuffer.trim().length >= 4) {
        extracted.push(asciiBuffer.trim());
      }
      asciiBuffer = '';
    }
  }
  if (asciiBuffer.trim().length >= 4) {
    extracted.push(asciiBuffer.trim());
  }

  // Filter internal OLE / compound binary artifacts
  const noisePatterns = [
    /^(bjbj|WordDocument|CompObj|SummaryInformation|DocumentSummaryInformation|Table|Data)/i,
    /^(Microsoft|MSWordDoc|Normal\.dotm?|Heading|Title|Default Paragraph Font)/i,
    /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-)/, // GUIDs
  ];

  const seen = new Set<string>();
  const cleanLines: string[] = [];

  for (const rawLine of extracted) {
    const line = rawLine.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
    if (line.length < 3) continue;
    if (noisePatterns.some((pattern) => pattern.test(line))) continue;
    if (!/[a-zA-Z0-9\u00C0-\u024F]/.test(line)) continue;
    if (!seen.has(line)) {
      seen.add(line);
      cleanLines.push(line);
    }
  }

  return cleanLines.slice(0, 200);
}

export const WordDocumentPreview: React.FC<WordDocumentPreviewProps> = ({
  content,
  filePath,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState<number>(100);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderKey, setRenderKey] = useState<number>(0);
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [viewTab, setViewTab] = useState<'document' | 'source'>('document');
  const [iframeHeight, setIframeHeight] = useState<number>(1100);

  // Decode binary data & detect format
  const { buffer, bytes } = useMemo(() => decodeContentToArrayBuffer(content), [content]);

  // Extract Word HTML if present
  const wordHtml = useMemo(() => extractWordHtml(content, bytes), [content, bytes]);

  // Determine document subtype
  const docType = useMemo(
    () => resolveWordDocType(filePath, bytes, wordHtml),
    [filePath, bytes, wordHtml]
  );

  // Extract readable text fragments if legacy binary DOC
  const extractedLines = useMemo(() => {
    if (docType !== 'binary-doc' || bytes.length === 0) return [];
    return extractReadableTextFromLegacyDoc(bytes);
  }, [docType, bytes]);

  // Clean HTML for iframe preview (strip <script> tags for safe rendering)
  const sanitizedWordHtml = useMemo(() => {
    if (!wordHtml) return '';
    // Strip scripts to adhere strictly to MV3 safety
    return wordHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }, [wordHtml]);

  // Derived file name
  const fileName = useMemo(() => {
    if (filePath) {
      const clean = filePath.replace(/\\/g, '/');
      const name = clean.split('/').pop();
      if (name) return name;
    }
    if (docType === 'word-html') return 'document.doc';
    if (docType === 'binary-doc') return 'document.doc';
    return 'document.docx';
  }, [filePath, docType]);

  // Derived title from HTML title tag if available
  const documentTitle = useMemo(() => {
    if (wordHtml) {
      const titleMatch = wordHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        return titleMatch[1].trim();
      }
    }
    return null;
  }, [wordHtml]);

  // Handle file download
  const handleDownload = useCallback(() => {
    try {
      let mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      let blob: Blob;

      if (docType === 'word-html') {
        mimeType = 'application/msword;charset=utf-8';
        blob = new Blob([wordHtml || content], { type: mimeType });
      } else if (docType === 'binary-doc') {
        mimeType = 'application/msword';
        blob = new Blob([buffer], { type: mimeType });
      } else {
        blob = new Blob([buffer], { type: mimeType });
      }

      triggerBlobDownload(blob, fileName);
    } catch (err) {
      console.error('Failed to download Word document:', err);
    }
  }, [docType, wordHtml, content, buffer, fileName]);

  // Zoom controls
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 15, 200));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 15, 40));
  };

  const handleResetZoom = () => {
    setZoom(100);
  };

  const handleFitToWidth = () => {
    if (viewportRef.current) {
      const availableWidth = viewportRef.current.clientWidth - 48;
      if (availableWidth > 0) {
        const calculatedZoom = Math.round((availableWidth / 850) * 100);
        setZoom(Math.min(Math.max(calculatedZoom, 40), 200));
      }
    }
  };

  const handleRetry = () => {
    setRenderKey((k) => k + 1);
  };

  const handleCopyExtractedText = () => {
    if (extractedLines.length === 0) return;
    navigator.clipboard.writeText(extractedLines.join('\n\n'));
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleCopyHtmlSource = () => {
    if (!wordHtml) return;
    navigator.clipboard.writeText(wordHtml);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
      } catch (err) {
        console.error('Print failed:', err);
      }
    } else {
      window.print();
    }
  };

  // Adjust iframe height when content loads
  const handleIframeLoad = () => {
    setIsLoading(false);
    try {
      if (iframeRef.current?.contentDocument) {
        const doc = iframeRef.current.contentDocument;
        const bodyHeight = doc.body?.scrollHeight || 0;
        const htmlHeight = doc.documentElement?.scrollHeight || 0;
        const calculated = Math.max(bodyHeight, htmlHeight, 1000);
        setIframeHeight(calculated + 40);
      }
    } catch {
      setIframeHeight(1200);
    }
  };

  // Render modern .docx using docx-preview
  useEffect(() => {
    if (docType !== 'docx') {
      setIsLoading(false);
      setRenderError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setRenderError(null);

    const renderDocumentAsync = async () => {
      try {
        if (!containerRef.current) {
          return;
        }

        containerRef.current.innerHTML = '';

        if (!buffer || buffer.byteLength === 0) {
          throw new Error('Word document content is empty or corrupted.');
        }

        await renderAsync(buffer, containerRef.current, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
        });

        if (isMounted) {
          setIsLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('docx-preview render error:', err);
          setRenderError(err?.message || 'Failed to parse and render Word document (.docx).');
          setIsLoading(false);
        }
      }
    };

    renderDocumentAsync();

    return () => {
      isMounted = false;
    };
  }, [buffer, docType, renderKey]);

  return (
    <div className="flex flex-col h-full w-full bg-card overflow-hidden select-text text-foreground">
      {/* Top Header & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-card text-xs shrink-0">
        {/* Left: Document Info & Badges */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground truncate max-w-[260px] sm:max-w-[360px]" title={documentTitle || fileName}>
                {documentTitle || fileName}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase shrink-0 ${
                  docType === 'word-html'
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                    : docType === 'binary-doc'
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {docType === 'word-html'
                  ? 'Word HTML (.doc)'
                  : docType === 'binary-doc'
                  ? 'Word 97-2003 (.doc)'
                  : 'DOCX'}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
              <span>{formatBytes(bytes.length || content.length)}</span>
              {documentTitle && (
                <>
                  <span>•</span>
                  <span className="truncate max-w-[180px] font-mono text-[10px]">{fileName}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Controls & Download */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Word HTML View Mode Switcher (Document vs Source) */}
          {docType === 'word-html' && (
            <div className="flex items-center bg-muted/60 rounded-lg p-0.5 border border-border/50 mr-1">
              <button
                type="button"
                onClick={() => setViewTab('document')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  viewTab === 'document'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Document View"
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Document</span>
              </button>
              <button
                type="button"
                onClick={() => setViewTab('source')}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  viewTab === 'source'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="HTML Source"
              >
                <Code className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">HTML</span>
              </button>
            </div>
          )}

          {/* Zoom Controls for Visual Views */}
          {((docType === 'docx' && !renderError) || (docType === 'word-html' && viewTab === 'document')) && (
            <div className="flex items-center bg-muted/60 rounded-lg p-0.5 border border-border/50">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 40}
                className="p-1.5 rounded-md hover:bg-background text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="px-2 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-background rounded-md cursor-pointer transition-colors"
                title="Reset Zoom to 100%"
              >
                {zoom}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 200}
                className="p-1.5 rounded-md hover:bg-background text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleFitToWidth}
                className="p-1.5 rounded-md hover:bg-background text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title="Fit to Width"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Print Button for Word HTML */}
          {docType === 'word-html' && viewTab === 'document' && (
            <button
              type="button"
              onClick={handlePrint}
              className="p-1.5 rounded-lg border border-border/50 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              title="Print Document (or Save as PDF)"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Refresh Document */}
          {docType === 'docx' && !renderError && (
            <button
              type="button"
              onClick={handleRetry}
              className="p-1.5 rounded-lg border border-border/50 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              title="Reload Document"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="w-[1px] h-4 bg-border mx-1" />

          {/* Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium cursor-pointer transition-colors shadow-xs"
            title="Download Word File"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Word File</span>
          </button>
        </div>
      </div>

      {/* Main Preview Body */}
      <div
        ref={viewportRef}
        className="relative flex-1 overflow-auto p-4 sm:p-8 bg-muted/30 flex justify-center items-start min-h-0"
      >
        {/* Loading Overlay */}
        {isLoading && docType === 'docx' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/85 backdrop-blur-xs z-20 gap-3">
            <LoaderCircle className="w-8 h-8 animate-spin text-primary" />
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">
              Rendering Word document...
            </span>
          </div>
        )}

        {/* Error State Banner */}
        {renderError && !isLoading && (
          <div className="w-full max-w-xl mx-auto my-auto p-6 bg-card border border-destructive/30 rounded-xl shadow-lg">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-destructive/10 text-destructive shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-foreground mb-1">
                  Unable to Render Word Document
                </h4>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  {renderError}
                </p>
                <div className="p-2.5 bg-muted/50 rounded-lg text-xs font-mono text-muted-foreground mb-4 space-y-1">
                  <div><span className="text-foreground/70 font-medium">File:</span> {fileName}</div>
                  <div><span className="text-foreground/70 font-medium">Size:</span> {formatBytes(bytes.length)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium cursor-pointer transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Render</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Word File</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 1. Word HTML (.doc) Visual Document Preview */}
        {docType === 'word-html' && viewTab === 'document' && (
          <div
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out',
              width: '100%',
              maxWidth: '850px',
            }}
            className="transition-transform"
          >
            <div className="shadow-lg bg-white rounded-sm border border-border/50 overflow-hidden">
              <iframe
                ref={iframeRef}
                key={`word-html-${renderKey}`}
                srcDoc={sanitizedWordHtml}
                sandbox="allow-same-origin"
                onLoad={handleIframeLoad}
                style={{
                  width: '100%',
                  height: `${iframeHeight}px`,
                  border: 'none',
                  display: 'block',
                  backgroundColor: '#ffffff',
                }}
                title="Word HTML Document Preview"
              />
            </div>
          </div>
        )}

        {/* 2. Word HTML (.doc) Raw Source Code View */}
        {docType === 'word-html' && viewTab === 'source' && (
          <div className="w-full max-w-4xl mx-auto bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40 text-xs">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-blue-500" />
                <span className="font-semibold text-foreground">Word HTML Source</span>
                <span className="text-[11px] text-muted-foreground">({sanitizedWordHtml.length} characters)</span>
              </div>
              <button
                type="button"
                onClick={handleCopyHtmlSource}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-[11px] font-medium cursor-pointer transition-colors"
              >
                {copiedText ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-500">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy HTML</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 font-mono text-xs text-foreground bg-muted/20 overflow-auto max-h-[680px] leading-relaxed whitespace-pre-wrap select-text">
              {sanitizedWordHtml}
            </pre>
          </div>
        )}

        {/* 3. Modern DOCX Container */}
        {docType === 'docx' && !renderError && (
          <div
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out',
              width: '100%',
              maxWidth: '850px',
            }}
            className="transition-transform"
          >
            <div
              ref={containerRef}
              className="shadow-md bg-white text-black min-h-[800px] max-w-[850px] mx-auto p-12 rounded-sm border border-border/40 [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-0 [&_.docx-wrapper]:w-full [&_.docx-wrapper>section.docx]:bg-transparent [&_.docx-wrapper>section.docx]:shadow-none [&_.docx-wrapper>section.docx]:mb-8 [&_.docx-wrapper>section.docx]:max-w-full overflow-hidden"
            />
          </div>
        )}

        {/* 4. Legacy Word 97-2003 View */}
        {docType === 'binary-doc' && !isLoading && (
          <div className="w-full max-w-3xl mx-auto space-y-6">
            {/* Informative Card */}
            <div className="p-5 bg-card border border-border/80 rounded-xl shadow-sm">
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      Legacy Word 97-2003 Document (.doc)
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300">
                      Binary Format
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    This file is stored in Microsoft Word 97-2003 binary format (.doc). In-browser interactive rendering is optimized for modern Office Open XML documents (.docx) and Word HTML documents. You can inspect the extracted text fragments below or download the file to view its full layout in Microsoft Word, LibreOffice, or Google Docs.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium cursor-pointer transition-colors shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Word File</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Extracted Text Content */}
            <div className="bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Extracted Text Preview</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-medium">
                    {extractedLines.length} {extractedLines.length === 1 ? 'paragraph' : 'paragraphs'}
                  </span>
                </div>
                {extractedLines.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyExtractedText}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-[11px] font-medium cursor-pointer transition-colors"
                  >
                    {copiedText ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-500">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="p-6 max-h-[600px] overflow-y-auto space-y-3 font-sans text-xs leading-relaxed text-foreground select-text">
                {extractedLines.length > 0 ? (
                  extractedLines.map((line, idx) => (
                    <p key={idx} className="text-foreground/90 whitespace-pre-wrap">
                      {line}
                    </p>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-xs">No readable plain text fragments could be extracted from this binary file.</p>
                    <p className="text-[11px] mt-1 text-muted-foreground/70">
                      Please use the download button above to open the file in Microsoft Word.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
