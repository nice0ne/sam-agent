import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { renderAsync } from 'docx-preview';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
import { db } from '../../services/db';
import {
  generateDocxBlob,
  generateDocHtml,
  normalizeDocumentSpec,
} from '../../services/doc-generator';

export interface WordDocumentPreviewProps {
  content: string;
  filePath?: string;
}

export type WordDocType = 'docx' | 'word-html' | 'markdown-doc' | 'binary-doc';

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
 * Tests whether a given text snippet has HTML markup.
 */
function isHtmlLike(text: string): boolean {
  if (!text || text.length < 5) return false;
  const lower = text.trim().toLowerCase();

  if (
    lower.startsWith('<!doctype html') ||
    lower.startsWith('<html') ||
    lower.includes('<body') ||
    lower.includes('<head>') ||
    lower.includes('urn:schemas-microsoft-com:office:word') ||
    lower.includes('<w:worddocument') ||
    lower.includes('mso-')
  ) {
    return true;
  }

  // Common tags in HTML bodies
  if (
    (lower.includes('<p>') || lower.includes('<p ')) &&
    (lower.includes('<h1>') || lower.includes('<h2>') || lower.includes('<div>') || lower.includes('<table>') || lower.includes('<br'))
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
    if (isHtmlLike(trimmed)) {
      return trimmed;
    }
  }

  // 2. Decode bytes as UTF-8 text and check
  if (bytes && bytes.length > 0) {
    try {
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const trimmed = decoded.trim();
      if (isHtmlLike(trimmed)) {
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
 * - 'docx': OpenXML ZIP document (.docx)
 * - 'word-html': HTML document with Word/MSO styling (.doc / .html)
 * - 'markdown-doc': Formatted markdown or plain text (renders as styled document page)
 * - 'binary-doc': Legacy binary OLE Compound document (.doc)
 */
function resolveWordDocType(
  filePath: string | undefined,
  bytes: Uint8Array,
  wordHtml: string | null,
  rawContent: string
): WordDocType {
  // 1. OpenXML ZIP magic signature (PK\x03\x04)
  if (isDocxZipBytes(bytes)) {
    return 'docx';
  }

  // 2. Legacy OLE Compound Binary signature (D0 CF 11 E0)
  if (isOleBinaryBytes(bytes)) {
    return 'binary-doc';
  }

  // 3. HTML markup identified
  if (wordHtml !== null || isHtmlLike(rawContent)) {
    return 'word-html';
  }

  // 4. If neither zip nor binary nor html, it's markdown or plain text
  return 'markdown-doc';
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
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Decode binary data & detect format
  const { buffer, bytes } = useMemo(() => decodeContentToArrayBuffer(content), [content]);

  // Extract Word HTML if present
  const wordHtml = useMemo(() => extractWordHtml(content, bytes), [content, bytes]);

  // Determine document subtype
  const docType = useMemo(
    () => resolveWordDocType(filePath, bytes, wordHtml, content),
    [filePath, bytes, wordHtml, content]
  );

  // Extract readable text fragments if legacy binary DOC
  const extractedLines = useMemo(() => {
    if (docType !== 'binary-doc' || bytes.length === 0) return [];
    return extractReadableTextFromLegacyDoc(bytes);
  }, [docType, bytes]);

  // Clean HTML for iframe preview (strip <script> tags for safe rendering)
  const sanitizedWordHtml = useMemo(() => {
    if (!wordHtml && docType !== 'word-html') return '';
    const rawHtml = wordHtml || content;
    // Strip scripts to adhere strictly to MV3 safety
    const clean = rawHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // If it doesn't already have HTML document tags, wrap into MSO Word HTML
    if (!clean.toLowerCase().includes('<html')) {
      return generateDocHtml({
        title: filePath?.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Dokumen',
        sections: [{ html: clean }],
      });
    }

    return clean;
  }, [wordHtml, docType, content, filePath]);

  // Derived file name
  const fileName = useMemo(() => {
    if (filePath) {
      const clean = filePath.replace(/\\/g, '/');
      const name = clean.split('/').pop();
      if (name) return name;
    }
    if (docType === 'word-html') return 'document.doc';
    if (docType === 'binary-doc') return 'document.doc';
    if (docType === 'markdown-doc') return 'document.doc';
    return 'document.docx';
  }, [filePath, docType]);

  const baseFileName = useMemo(() => fileName.replace(/\.[^.]+$/, ''), [fileName]);

  // Derived title from HTML title tag or Markdown header
  const documentTitle = useMemo(() => {
    if (wordHtml) {
      const titleMatch = wordHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        return titleMatch[1].trim();
      }
    }
    if (docType === 'markdown-doc') {
      const firstHeading = content.match(/^#\s+([^\n\r]+)/m);
      if (firstHeading && firstHeading[1]) {
        return firstHeading[1].trim();
      }
    }
    return null;
  }, [wordHtml, docType, content]);

  // Handle export to native .docx (OpenXML)
  const handleDownloadDocx = useCallback(async () => {
    try {
      setIsExporting(true);

      // 1. If currently viewing a real .docx binary, download directly
      if (docType === 'docx') {
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        triggerBlobDownload(blob, `${baseFileName}.docx`);
        return;
      }

      // 2. Check if a companion .docx file already exists in VFS
      if (baseFileName) {
        try {
          const companionRecord = await db.files.get(`/workspace/${baseFileName}.docx`);
          if (companionRecord?.content) {
            const { buffer: compBuffer, bytes: compBytes } = decodeContentToArrayBuffer(companionRecord.content);
            if (isDocxZipBytes(compBytes)) {
              const blob = new Blob([compBuffer], {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              });
              triggerBlobDownload(blob, `${baseFileName}.docx`);
              return;
            }
          }
        } catch (_) {}
      }

      // 3. Compile from current HTML / Markdown content into real OpenXML
      const rawHtml = sanitizedWordHtml || (docType === 'word-html' ? content : '');
      const spec = normalizeDocumentSpec({
        title: documentTitle || baseFileName,
        content: docType === 'markdown-doc' ? content : undefined,
        sections: rawHtml ? [{ html: rawHtml }] : undefined,
      });
      const blob = await generateDocxBlob(spec);
      triggerBlobDownload(blob, `${baseFileName}.docx`);
    } catch (err) {
      console.error('Failed to download Word .docx:', err);
    } finally {
      setIsExporting(false);
    }
  }, [docType, buffer, baseFileName, documentTitle, content, sanitizedWordHtml]);

  // Handle export to Word .doc (MSO Word HTML format)
  const handleDownloadDoc = useCallback(() => {
    try {
      let htmlToSave = '';
      if (docType === 'word-html') {
        htmlToSave = sanitizedWordHtml || content;
      } else if (docType === 'markdown-doc') {
        htmlToSave = generateDocHtml({
          title: documentTitle || baseFileName,
          content,
        });
      } else if (docType === 'binary-doc') {
        const blob = new Blob([buffer], { type: 'application/msword' });
        triggerBlobDownload(blob, `${baseFileName}.doc`);
        return;
      } else {
        htmlToSave = generateDocHtml({
          title: documentTitle || baseFileName,
          content: 'Dokumen diekspor dari SAM-Agent.',
        });
      }

      const blob = new Blob([htmlToSave], { type: 'application/msword;charset=utf-8' });
      triggerBlobDownload(blob, `${baseFileName}.doc`);
    } catch (err) {
      console.error('Failed to download Word .doc:', err);
    }
  }, [docType, sanitizedWordHtml, content, documentTitle, baseFileName, buffer]);

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

  const handleCopyText = () => {
    let textToCopy = '';
    if (docType === 'markdown-doc') {
      textToCopy = content;
    } else if (docType === 'binary-doc') {
      textToCopy = extractedLines.join('\n\n');
    } else if (iframeRef.current?.contentDocument) {
      textToCopy = iframeRef.current.contentDocument.body?.innerText || '';
    } else {
      textToCopy = content;
    }

    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
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
              <span
                className="font-semibold text-foreground truncate max-w-[220px] sm:max-w-[340px]"
                title={documentTitle || fileName}
              >
                {documentTitle || fileName}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase shrink-0 ${
                  docType === 'word-html'
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                    : docType === 'markdown-doc'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : docType === 'binary-doc'
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'bg-primary/15 text-primary'
                }`}
              >
                {docType === 'word-html'
                  ? 'Word MSO (.doc)'
                  : docType === 'markdown-doc'
                  ? 'Word Document'
                  : docType === 'binary-doc'
                  ? 'Word 97-2003'
                  : 'DOCX'}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-2">
              <span>{formatBytes(bytes.length || content.length)}</span>
              <span>•</span>
              <span className="truncate max-w-[180px] font-mono text-[10px]">{fileName}</span>
            </div>
          </div>
        </div>

        {/* Right: Controls & Download */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* View Mode Switcher (Document Preview vs Source) */}
          {(docType === 'word-html' || docType === 'markdown-doc') && (
            <div className="flex items-center bg-muted/60 rounded-lg p-0.5 border border-border/50 mr-1">
              <button
                type="button"
                onClick={() => setViewTab('document')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  viewTab === 'document'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Visual Document Preview"
              >
                <Eye className="w-3.5 h-3.5 text-primary" />
                <span>Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setViewTab('source')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  viewTab === 'source'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Source Code View"
              >
                <Code className="w-3.5 h-3.5" />
                <span>Source</span>
              </button>
            </div>
          )}

          {/* Zoom Controls for Visual Views */}
          {viewTab === 'document' && docType !== 'binary-doc' && (
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

          {/* Print Button */}
          {viewTab === 'document' && docType !== 'binary-doc' && (
            <button
              type="button"
              onClick={handlePrint}
              className="p-1.5 rounded-lg border border-border/50 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              title="Print Document (or Save as PDF)"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Copy Text Button */}
          <button
            type="button"
            onClick={handleCopyText}
            className="p-1.5 rounded-lg border border-border/50 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            title="Copy Text Content"
          >
            {copiedText ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Reload Button for DOCX */}
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

          {/* Export to Word .doc (MSO Word HTML) */}
          <button
            type="button"
            onClick={handleDownloadDoc}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium cursor-pointer transition-colors"
            title="Download Word Document (.doc format)"
          >
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
            <span>.doc</span>
          </button>

          {/* Primary Export: Download Word .docx */}
          <button
            type="button"
            onClick={handleDownloadDocx}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium cursor-pointer transition-colors shadow-xs disabled:opacity-50"
            title="Export to Microsoft Word (.docx format)"
          >
            {isExporting ? (
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Export DOCX</span>
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
                    onClick={handleDownloadDocx}
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

        {/* 1. Word HTML Visual Document Preview */}
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
                title="Word Document Preview"
              />
            </div>
          </div>
        )}

        {/* 2. Markdown / Plain Text Styled Document Preview */}
        {docType === 'markdown-doc' && viewTab === 'document' && (
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
            <div className="shadow-lg bg-white text-slate-900 rounded-sm border border-border/50 p-10 sm:p-14 min-h-[1050px] box-border">
              {/* Document Header Bar */}
              <div className="border-b-2 border-blue-900 pb-4 mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-blue-900 leading-tight mb-2">
                  {documentTitle || baseFileName}
                </h1>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-medium">
                  <span>Dokumen Word • Disusun oleh SAM-Agent</span>
                  <span>•</span>
                  <span>{new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              </div>

              {/* Rendered Markdown Body */}
              <div className="space-y-4 text-xs sm:text-sm text-slate-800 leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-blue-950 [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:border-b [&_h1]:border-slate-200 [&_h1]:pb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-blue-900 [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-blue-800 [&_h3]:mt-4 [&_h3]:mb-1 [&_p]:leading-relaxed [&_p]:text-justify [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_blockquote]:border-l-4 [&_blockquote]:border-blue-500 [&_blockquote]:bg-blue-50/60 [&_blockquote]:p-3 [&_blockquote]:rounded-r [&_blockquote]:italic [&_table]:w-full [&_table]:border-collapse [&_table]:my-4 [&_th]:bg-slate-100 [&_th]:text-blue-900 [&_th]:font-semibold [&_th]:p-2.5 [&_th]:text-left [&_th]:border [&_th]:border-slate-300 [&_td]:border [&_td]:border-slate-300 [&_td]:p-2.5 [&_tr:nth-child(even)_td]:bg-slate-50">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              </div>

              {/* Document Footer */}
              <div className="border-t border-slate-200 mt-12 pt-4 flex justify-between items-center text-[10px] text-slate-400">
                <span>Disusun otomatis oleh SAM-Agent</span>
                <span>Halaman 1</span>
              </div>
            </div>
          </div>
        )}

        {/* 3. Raw Source Code View (HTML or Markdown) */}
        {(docType === 'word-html' || docType === 'markdown-doc') && viewTab === 'source' && (
          <div className="w-full max-w-4xl mx-auto bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/40 text-xs">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-blue-500" />
                <span className="font-semibold text-foreground">Document Source</span>
                <span className="text-[11px] text-muted-foreground">({content.length} characters)</span>
              </div>
              <button
                type="button"
                onClick={handleCopyText}
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
                    <span>Copy Source</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-4 font-mono text-xs text-foreground bg-muted/20 overflow-auto max-h-[680px] leading-relaxed whitespace-pre-wrap select-text">
              {content}
            </pre>
          </div>
        )}

        {/* 4. Modern DOCX Container */}
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

        {/* 5. Legacy Word 97-2003 View */}
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
                    Dokumen ini disimpan dalam format biner Microsoft Word 97-2003 (.doc). Anda dapat melihat teks yang diekstraksi di bawah ini atau mengunduh file untuk membukanya di Microsoft Word.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadDoc}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium cursor-pointer transition-colors shadow-xs"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download File Word (.doc)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadDocx}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium cursor-pointer transition-colors"
                    >
                      <Download className="w-4 h-4 text-muted-foreground" />
                      <span>Export to DOCX</span>
                    </button>
                  </div>
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
                    onClick={handleCopyText}
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
                    <p className="text-xs">Tidak ada fragmen teks yang dapat diekstrak dari file biner ini.</p>
                    <p className="text-[11px] mt-1 text-muted-foreground/70">
                      Gunakan tombol unduh di atas untuk membuka file di Microsoft Word.
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
