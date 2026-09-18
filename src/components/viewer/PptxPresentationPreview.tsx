import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import {
  Presentation,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Download,
  List,
  Copy,
  Check,
  AlertCircle,
  LoaderCircle,
  Palette,
  FileText,
  Layers,
  MessageSquare,
  Sparkles,
  BarChart2,
  Columns,
  Play,
  RotateCcw,
} from 'lucide-react';
import { triggerBlobDownload } from '../../services/archive';
import { getVfsFile } from '../../services/vfs';

export interface PptxPresentationPreviewProps {
  content: string;
  filePath?: string;
  mimeType?: string;
}

export interface PptxSlideData {
  slideNum: number;
  totalSlides: number;
  title: string;
  subtitle?: string;
  body?: string;
  bulletPoints?: string[];
  keyStat?: { value: string; label: string };
  twoColumn?: { left: string[]; right: string[] };
  layout?: 'title' | 'content' | 'two-column' | 'stat' | 'conclusion';
  notes?: string;
  author?: string;
  date?: string;
}

export type PresentationThemeKey =
  | 'corporate-blue'
  | 'modern-dark'
  | 'vibrant-emerald'
  | 'minimal-light'
  | 'sunset-warm'
  | 'royal-purple'
  | 'midnight-oled';

interface ThemeDefinition {
  name: string;
  bg: string;
  stageBg: string;
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentSubtle: string;
  isDark: boolean;
}

const THEME_DEFS: Record<PresentationThemeKey, ThemeDefinition> = {
  'corporate-blue': {
    name: 'Corporate Blue',
    bg: '#0F172A',
    stageBg: '#F8FAFC',
    cardBg: '#FFFFFF',
    cardBorder: '#E2E8F0',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    accent: '#1D4ED8',
    accentSubtle: '#DBEAFE',
    isDark: false,
  },
  'modern-dark': {
    name: 'Modern Dark',
    bg: '#0B0F19',
    stageBg: '#0F172A',
    cardBg: '#1E293B',
    cardBorder: '#334155',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    accent: '#38BDF8',
    accentSubtle: '#0369A1',
    isDark: true,
  },
  'vibrant-emerald': {
    name: 'Vibrant Emerald',
    bg: '#042F2E',
    stageBg: '#064E3B',
    cardBg: '#065F46',
    cardBorder: '#047857',
    textPrimary: '#ECFDF5',
    textSecondary: '#A7F3D0',
    accent: '#34D399',
    accentSubtle: '#065F46',
    isDark: true,
  },
  'minimal-light': {
    name: 'Minimal Light',
    bg: '#F4F4F5',
    stageBg: '#FFFFFF',
    cardBg: '#F8FAFC',
    cardBorder: '#E4E4E7',
    textPrimary: '#18181B',
    textSecondary: '#71717A',
    accent: '#2563EB',
    accentSubtle: '#EFF6FF',
    isDark: false,
  },
  'sunset-warm': {
    name: 'Sunset Warm',
    bg: '#451A03',
    stageBg: '#FFFBEB',
    cardBg: '#FFFFFF',
    cardBorder: '#FDE68A',
    textPrimary: '#451A03',
    textSecondary: '#92400E',
    accent: '#EA580C',
    accentSubtle: '#FFEDD5',
    isDark: false,
  },
  'royal-purple': {
    name: 'Royal Purple',
    bg: '#0F0B24',
    stageBg: '#1E1B4B',
    cardBg: '#312E81',
    cardBorder: '#4338CA',
    textPrimary: '#FAF5FF',
    textSecondary: '#C084FC',
    accent: '#A855F7',
    accentSubtle: '#581C87',
    isDark: true,
  },
  'midnight-oled': {
    name: 'Midnight OLED',
    bg: '#000000',
    stageBg: '#000000',
    cardBg: '#111111',
    cardBorder: '#27272A',
    textPrimary: '#FFFFFF',
    textSecondary: '#A1A1AA',
    accent: '#00E5FF',
    accentSubtle: '#083344',
    isDark: true,
  },
};

/**
 * Format raw byte size into human-readable representation
 */
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Decodes content (Base64 data URL, raw Base64 string, or binary char string) into Uint8Array.
 */
function decodeContentToUint8Array(content: string): Uint8Array {
  if (!content) return new Uint8Array(0);

  // 1. Data URL prefix (e.g. data:...;base64,...)
  const dataUrlMatch = content.match(/^data:[^;]+;base64,(.*)$/s);
  if (dataUrlMatch) {
    try {
      const base64Data = dataUrlMatch[1].trim();
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes;
    } catch {
      // Fallback below
    }
  }

  // 2. Raw Base64 string check (ZIP magic PK.. is UEsDB in Base64)
  const trimmed = content.trim();
  if (trimmed.startsWith('UEsDB') || /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
    try {
      const binaryStr = atob(trimmed);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes;
    } catch {
      // Fallback below
    }
  }

  // 3. Binary character string fallback
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    bytes[i] = content.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Extract slides directly from OpenXML PowerPoint container (ppt/slides/slide*.xml)
 */
async function parsePptxFromOpenXml(bytes: Uint8Array): Promise<PptxSlideData[]> {
  const zip = await JSZip.loadAsync(bytes);
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      return numA - numB;
    });

  if (slideEntries.length === 0) {
    return [];
  }

  const slides: PptxSlideData[] = [];
  const parser = new DOMParser();

  for (let i = 0; i < slideEntries.length; i++) {
    const slideName = slideEntries[i];
    const xmlText = await zip.file(slideName)?.async('string');
    if (!xmlText) continue;

    const doc = parser.parseFromString(xmlText, 'application/xml');
    const shapeEls = Array.from(doc.getElementsByTagName('p:sp'));

    let title = '';
    let subtitle = '';
    const paragraphs: string[] = [];
    let keyStat: { value: string; label: string } | undefined;

    for (const shape of shapeEls) {
      const ph = shape.getElementsByTagName('p:ph')[0];
      const phType = ph ? ph.getAttribute('type') || '' : '';

      // Collect all text from text runs <a:t>
      const textNodes = Array.from(shape.getElementsByTagName('a:t'));
      const fullShapeText = textNodes.map((t) => t.textContent || '').join('').trim();
      if (!fullShapeText) continue;

      if (phType === 'title' || phType === 'ctrTitle') {
        if (!title) title = fullShapeText;
      } else if (phType === 'subTitle') {
        if (!subtitle) subtitle = fullShapeText;
      } else {
        // Collect paragraphs <a:p>
        const pEls = Array.from(shape.getElementsByTagName('a:p'));
        for (const p of pEls) {
          const pText = Array.from(p.getElementsByTagName('a:t'))
            .map((t) => t.textContent || '')
            .join('')
            .trim();
          if (pText) {
            paragraphs.push(pText);
          }
        }
      }
    }

    // If no title placeholder found, first paragraph or text serves as title
    if (!title && paragraphs.length > 0) {
      title = paragraphs.shift()!;
    }
    if (!title) {
      title = `Slide ${i + 1}`;
    }

    // Check for stat indicators in paragraphs (e.g. "+85%", "10x", "$5M")
    if (paragraphs.length >= 2) {
      const statCandidate = paragraphs[0];
      if (/^[+$€¥£]?\d+([.,]\d+)?(%|x|k|m|b)?$/i.test(statCandidate.trim())) {
        keyStat = {
          value: statCandidate.trim(),
          label: paragraphs[1],
        };
        paragraphs.splice(0, 2);
      }
    }

    // Slide notes
    let notes: string | undefined;
    const slideNum = i + 1;
    const notesEntry = zip.file(`ppt/notesSlides/notesSlide${slideNum}.xml`);
    if (notesEntry) {
      try {
        const notesXml = await notesEntry.async('string');
        const notesDoc = parser.parseFromString(notesXml, 'application/xml');
        const notesTexts = Array.from(notesDoc.getElementsByTagName('a:t'))
          .map((t) => t.textContent || '')
          .join(' ')
          .trim();
        if (notesTexts) notes = notesTexts;
      } catch (_) {}
    }

    // Determine layout
    let layout: PptxSlideData['layout'] = 'content';
    if (i === 0 && (subtitle || paragraphs.length === 0)) {
      layout = 'title';
    } else if (keyStat) {
      layout = 'stat';
    }

    slides.push({
      slideNum: i + 1,
      totalSlides: slideEntries.length,
      title,
      subtitle: subtitle || undefined,
      bulletPoints: paragraphs.length > 0 ? paragraphs : undefined,
      keyStat,
      layout,
      notes,
    });
  }

  return slides;
}

export const PptxPresentationPreview: React.FC<PptxPresentationPreviewProps> = ({
  content,
  filePath,
  mimeType,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [slides, setSlides] = useState<PptxSlideData[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [selectedTheme, setSelectedTheme] = useState<PresentationThemeKey>('corporate-blue');
  const [viewMode, setViewMode] = useState<'slides' | 'outline'>('slides');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [copiedOutline, setCopiedOutline] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const thumbnailListRef = useRef<HTMLDivElement>(null);

  // Decode binary data
  const rawBytes = useMemo(() => decodeContentToUint8Array(content), [content]);
  const formattedSize = useMemo(() => formatBytes(rawBytes.byteLength), [rawBytes]);
  const filename = useMemo(() => {
    if (!filePath) return 'presentation.pptx';
    return filePath.split('/').pop() || 'presentation.pptx';
  }, [filePath]);

  // Load slides: Try companion HTML first, fallback to native OpenXML extraction
  useEffect(() => {
    let isCancelled = false;

    async function loadPresentation() {
      setLoading(true);
      setError(null);

      try {
        let loadedSlides: PptxSlideData[] = [];
        let detectedTheme: PresentationThemeKey = 'corporate-blue';

        // 1. Try companion HTML in VFS if available
        if (filePath && filePath.toLowerCase().endsWith('.pptx')) {
          const companionHtmlPath = filePath.replace(/\.pptx$/i, '.html');
          try {
            const companionFile = await getVfsFile(companionHtmlPath);
            if (companionFile?.content) {
              const slidesMatch = companionFile.content.match(
                /const\s+slides\s*=\s*(\[[\s\S]*?\]);\s*(?:let\s+currentIndex|function)/m
              );
              if (slidesMatch && slidesMatch[1]) {
                const parsed = JSON.parse(slidesMatch[1]);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  loadedSlides = parsed.map((s: any, idx: number) => ({
                    slideNum: idx + 1,
                    totalSlides: parsed.length,
                    title: s.title || `Slide ${idx + 1}`,
                    subtitle: s.subtitle || undefined,
                    body: s.body || undefined,
                    bulletPoints: s.bulletPoints || undefined,
                    keyStat: s.keyStat || undefined,
                    twoColumn: s.twoColumn || undefined,
                    layout: s.type || s.layout || (idx === 0 ? 'title' : 'content'),
                    notes: s.notes || undefined,
                    author: s.author || undefined,
                    date: s.date || undefined,
                  }));

                  // Check if theme was in HTML
                  const themeMatch = companionFile.content.match(
                    /data-theme="([a-z-]+)"/i
                  );
                  if (themeMatch && themeMatch[1] && (themeMatch[1] in THEME_DEFS)) {
                    detectedTheme = themeMatch[1] as PresentationThemeKey;
                  }
                }
              }
            }
          } catch (_) {
            // Companion check failed, proceed to OpenXML
          }
        }

        // 2. If companion HTML didn't produce slides, parse directly from .pptx OpenXML container
        if (loadedSlides.length === 0 && rawBytes.byteLength > 0) {
          const openXmlSlides = await parsePptxFromOpenXml(rawBytes);
          if (openXmlSlides.length > 0) {
            loadedSlides = openXmlSlides;
          }
        }

        // 3. Fallback if empty
        if (loadedSlides.length === 0) {
          loadedSlides = [
            {
              slideNum: 1,
              totalSlides: 1,
              title: filename.replace(/\.pptx$/i, ''),
              subtitle: 'Presentasi PowerPoint',
              layout: 'title',
              bulletPoints: ['Gunakan tombol download untuk menyimpan file presentasi ini.'],
            },
          ];
        }

        if (!isCancelled) {
          setSlides(loadedSlides);
          setSelectedTheme(detectedTheme);
          setCurrentSlideIndex(0);
          setLoading(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(`Gagal memuat presentasi: ${err.message || 'Format PPTX tidak valid'}`);
          setLoading(false);
        }
      }
    }

    loadPresentation();

    return () => {
      isCancelled = true;
    };
  }, [filePath, rawBytes, filename]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if inside an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        setCurrentSlideIndex((prev) => Math.min(prev + 1, slides.length - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentSlideIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentSlideIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setCurrentSlideIndex(slides.length - 1);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length]);

  // Auto-scroll active thumbnail into view
  useEffect(() => {
    if (thumbnailListRef.current) {
      const activeEl = thumbnailListRef.current.querySelector(`[data-slide-index="${currentSlideIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentSlideIndex]);

  // Fullscreen handlers
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Download PPTX
  const handleDownload = useCallback(() => {
    if (rawBytes.byteLength === 0) return;
    const blob = new Blob([rawBytes as any], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    triggerBlobDownload(blob, filename);
  }, [rawBytes, filename]);

  // Copy outline
  const handleCopyOutline = useCallback(() => {
    if (slides.length === 0) return;
    const text = slides
      .map((s, i) => {
        let lines = [`Slide ${i + 1}: ${s.title}`];
        if (s.subtitle) lines.push(`  Subtitle: ${s.subtitle}`);
        if (s.keyStat) lines.push(`  Stat: ${s.keyStat.value} - ${s.keyStat.label}`);
        if (s.bulletPoints) {
          lines = lines.concat(s.bulletPoints.map((bp) => `  • ${bp}`));
        }
        if (s.twoColumn) {
          lines.push(`  [Column 1]`);
          lines = lines.concat(s.twoColumn.left.map((bp) => `    • ${bp}`));
          lines.push(`  [Column 2]`);
          lines = lines.concat(s.twoColumn.right.map((bp) => `    • ${bp}`));
        }
        if (s.notes) lines.push(`  Notes: ${s.notes}`);
        return lines.join('\n');
      })
      .join('\n\n');

    navigator.clipboard.writeText(text);
    setCopiedOutline(true);
    setTimeout(() => setCopiedOutline(false), 2000);
  }, [slides]);

  const theme = THEME_DEFS[selectedTheme] || THEME_DEFS['corporate-blue'];
  const currentSlide = slides[currentSlideIndex] || slides[0];

  // Render loading state
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-muted-foreground gap-3">
        <LoaderCircle className="size-8 text-primary animate-spin" />
        <span className="text-xs font-mono font-medium">Memproses presentasi PowerPoint...</span>
      </div>
    );
  }

  // Render error state
  if (error || slides.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto">
        <div className="size-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mb-4">
          <AlertCircle className="size-7" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">Gagal Membaca File PowerPoint</h3>
        <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
          {error || 'File presentasi tidak memiliki slide yang dapat dibaca.'}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors cursor-pointer shadow-xs"
          >
            <Download className="size-3.5" />
            Download .pptx ({formattedSize})
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex flex-col h-full w-full overflow-hidden select-text transition-colors duration-200 ${
        isFullscreen ? 'bg-black text-white' : 'bg-background text-foreground'
      }`}
    >
      {/* 1. Header Toolbar */}
      <div className="h-13 px-4 flex items-center justify-between border-b border-border/80 bg-card/60 backdrop-blur-sm shrink-0 gap-3 z-10">
        {/* Left: Presentation Info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 shrink-0">
            <Presentation className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-foreground truncate max-w-md">
              {slides[0]?.title || filename}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5">
              <span>{slides.length} Slide{slides.length > 1 ? 's' : ''}</span>
              <span>•</span>
              <span>{formattedSize}</span>
              <span>•</span>
              <span className="capitalize">{theme.name}</span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* View Mode Toggle: Slides vs Outline */}
          <div className="flex items-center p-0.5 rounded-lg bg-muted border border-border">
            <button
              type="button"
              onClick={() => setViewMode('slides')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'slides'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Tampilan Slide Presentasi"
            >
              <Play className="size-3" />
              <span>Slides</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('outline')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'outline'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Tampilan Outline Dokumen"
            >
              <List className="size-3" />
              <span>Outline</span>
            </button>
          </div>

          {/* Theme Dropdown */}
          <div className="relative flex items-center">
            <select
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value as PresentationThemeKey)}
              className="appearance-none bg-muted hover:bg-muted/80 border border-border rounded-lg pl-7 pr-6 py-1 text-xs font-medium text-foreground cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-primary transition-colors"
            >
              {Object.entries(THEME_DEFS).map(([key, def]) => (
                <option key={key} value={key}>
                  {def.name}
                </option>
              ))}
            </select>
            <Palette className="size-3.5 text-muted-foreground absolute left-2 pointer-events-none" />
          </div>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={isFullscreen ? 'Keluar Fullscreen (Esc)' : 'Tampilan Fullscreen (F)'}
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>

          {/* Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium transition-colors cursor-pointer shadow-xs"
            title="Download file PowerPoint (.pptx) asli"
          >
            <Download className="size-3.5" />
            <span>Download .pptx</span>
          </button>
        </div>
      </div>

      {/* 2. Main Body: Slides Mode vs Outline Mode */}
      {viewMode === 'outline' ? (
        /* Outline Mode */
        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              Outline Presentasi ({slides.length} Slides)
            </h2>
            <button
              type="button"
              onClick={handleCopyOutline}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer"
            >
              {copiedOutline ? (
                <>
                  <Check className="size-3.5 text-emerald-500" />
                  <span className="text-emerald-500">Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="size-3.5 text-muted-foreground" />
                  <span>Salin Semua Teks</span>
                </>
              )}
            </button>
          </div>

          <div className="space-y-4">
            {slides.map((s, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setCurrentSlideIndex(idx);
                  setViewMode('slides');
                }}
                className="p-4 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors cursor-pointer group shadow-xs"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-mono font-medium text-foreground">
                      Slide {idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      {s.title}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider">
                    {s.layout || 'content'}
                  </span>
                </div>

                {s.subtitle && (
                  <p className="text-xs text-muted-foreground mb-2 italic">
                    {s.subtitle}
                  </p>
                )}

                {s.keyStat && (
                  <div className="inline-flex items-baseline gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary mb-2">
                    <span className="text-lg font-bold">{s.keyStat.value}</span>
                    <span className="text-xs font-medium">{s.keyStat.label}</span>
                  </div>
                )}

                {s.bulletPoints && s.bulletPoints.length > 0 && (
                  <ul className="space-y-1 my-2">
                    {s.bulletPoints.map((bp, bpIdx) => (
                      <li key={bpIdx} className="text-xs text-foreground/90 flex items-start gap-2">
                        <span className="text-primary font-bold leading-relaxed">•</span>
                        <span>{bp}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {s.twoColumn && (
                  <div className="grid grid-cols-2 gap-3 my-2 pt-2 border-t border-border/50">
                    <div className="p-2.5 rounded-lg bg-muted/40 text-xs">
                      <div className="font-semibold text-muted-foreground mb-1">Kolom Kiri</div>
                      <ul className="space-y-1">
                        {s.twoColumn.left.map((item, lIdx) => (
                          <li key={lIdx} className="text-foreground/90 flex items-start gap-1.5">
                            <span className="text-primary">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-2.5 rounded-lg bg-muted/40 text-xs">
                      <div className="font-semibold text-muted-foreground mb-1">Kolom Kanan</div>
                      <ul className="space-y-1">
                        {s.twoColumn.right.map((item, rIdx) => (
                          <li key={rIdx} className="text-foreground/90 flex items-start gap-1.5">
                            <span className="text-primary">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {s.notes && (
                  <div className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <MessageSquare className="size-3 shrink-0" />
                    <span>Catatan: {s.notes}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Slides Mode: Stage & Sidebar */
        <div className="flex-1 flex overflow-hidden relative">
          {/* Slide Thumbnails Sidebar */}
          {sidebarOpen && (
            <div
              ref={thumbnailListRef}
              className="w-56 border-r border-border/80 bg-card/40 flex flex-col shrink-0 overflow-y-auto p-3 gap-2.5 select-none"
            >
              <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground px-1 pb-1">
                <span>Slides ({slides.length})</span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="hover:text-foreground text-[10px] cursor-pointer"
                  title="Tutup Panel Samping"
                >
                  Tutup
                </button>
              </div>

              {slides.map((s, idx) => {
                const isActive = idx === currentSlideIndex;
                return (
                  <div
                    key={idx}
                    data-slide-index={idx}
                    onClick={() => setCurrentSlideIndex(idx)}
                    className={`p-2 rounded-lg border transition-all cursor-pointer group text-left ${
                      isActive
                        ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40'
                        : 'border-border/60 bg-card/60 hover:bg-muted/80 hover:border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                          isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="text-[9px] uppercase font-mono text-muted-foreground">
                        {s.layout || 'content'}
                      </span>
                    </div>
                    <div className="text-[11px] font-medium text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                      {s.title}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Center Presentation Stage */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden relative bg-muted/20">
            {/* Sidebar Toggle Button if closed */}
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-card/90 border border-border shadow-xs hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title="Buka Daftar Slide"
              >
                <Layers className="size-3.5" />
                <span>Slides ({slides.length})</span>
              </button>
            )}

            {/* 16:9 Presentation Canvas */}
            <div
              className="w-full max-w-5xl rounded-2xl border shadow-xl flex flex-col overflow-hidden transition-all duration-300 relative"
              style={{
                aspectRatio: '16 / 9',
                backgroundColor: theme.stageBg,
                borderColor: theme.cardBorder,
                color: theme.textPrimary,
              }}
            >
              {/* Slide Content by Layout */}
              <div className="flex-1 p-6 md:p-10 flex flex-col justify-between overflow-hidden">
                {currentSlide.layout === 'title' ? (
                  /* Layout: Title Slide */
                  <div className="flex-1 flex flex-col justify-center">
                    <div
                      className="border-l-4 md:border-l-6 pl-4 md:pl-6"
                      style={{ borderColor: theme.accent }}
                    >
                      <h1
                        className="text-2xl md:text-4xl lg:text-5xl font-extrabold tracking-tight mb-3 md:mb-5 leading-tight"
                        style={{ color: theme.accent }}
                      >
                        {currentSlide.title}
                      </h1>
                      {currentSlide.subtitle && (
                        <p
                          className="text-base md:text-xl lg:text-2xl font-medium mb-6 md:mb-8 leading-snug"
                          style={{ color: theme.textSecondary }}
                        >
                          {currentSlide.subtitle}
                        </p>
                      )}
                      <div
                        className="text-xs md:text-sm font-medium flex items-center gap-3"
                        style={{ color: theme.textSecondary }}
                      >
                        <span>{currentSlide.author || 'SAM-Agent'}</span>
                        <span>•</span>
                        <span>{currentSlide.date || new Date().toLocaleDateString('id-ID')}</span>
                      </div>
                    </div>
                  </div>
                ) : currentSlide.layout === 'stat' && currentSlide.keyStat ? (
                  /* Layout: Stat Callout */
                  <div className="flex-1 flex flex-col">
                    {/* Header */}
                    <div className="mb-4 md:mb-6 pb-2 border-b" style={{ borderColor: theme.cardBorder }}>
                      <h2
                        className="text-xl md:text-3xl font-bold tracking-tight leading-tight"
                        style={{ color: theme.accent }}
                      >
                        {currentSlide.title}
                      </h2>
                      {currentSlide.subtitle && (
                        <p className="text-xs md:text-sm mt-1" style={{ color: theme.textSecondary }}>
                          {currentSlide.subtitle}
                        </p>
                      )}
                    </div>

                    {/* Stat Card + Context Content */}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-center">
                      {/* Big Metric Box */}
                      <div
                        className="md:col-span-5 p-6 md:p-8 rounded-xl border flex flex-col items-center justify-center text-center shadow-sm"
                        style={{
                          backgroundColor: theme.cardBg,
                          borderColor: theme.cardBorder,
                        }}
                      >
                        <div
                          className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-none mb-3"
                          style={{ color: theme.accent }}
                        >
                          {currentSlide.keyStat.value}
                        </div>
                        <div
                          className="text-xs md:text-sm lg:text-base font-semibold max-w-xs"
                          style={{ color: theme.textSecondary }}
                        >
                          {currentSlide.keyStat.label}
                        </div>
                      </div>

                      {/* Supporting Points */}
                      <div className="md:col-span-7 flex flex-col justify-center">
                        {currentSlide.bulletPoints && currentSlide.bulletPoints.length > 0 && (
                          <ul className="space-y-3 md:space-y-4">
                            {currentSlide.bulletPoints.map((bp, bpIdx) => (
                              <li
                                key={bpIdx}
                                className="flex items-start gap-3 text-sm md:text-lg font-medium leading-relaxed"
                              >
                                <span
                                  className="text-xl md:text-2xl leading-none font-bold select-none shrink-0"
                                  style={{ color: theme.accent }}
                                >
                                  •
                                </span>
                                <span>{bp}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                ) : currentSlide.layout === 'two-column' && currentSlide.twoColumn ? (
                  /* Layout: Two Column */
                  <div className="flex-1 flex flex-col">
                    {/* Header */}
                    <div className="mb-4 md:mb-6 pb-2 border-b" style={{ borderColor: theme.cardBorder }}>
                      <h2
                        className="text-xl md:text-3xl font-bold tracking-tight leading-tight"
                        style={{ color: theme.accent }}
                      >
                        {currentSlide.title}
                      </h2>
                      {currentSlide.subtitle && (
                        <p className="text-xs md:text-sm mt-1" style={{ color: theme.textSecondary }}>
                          {currentSlide.subtitle}
                        </p>
                      )}
                    </div>

                    {/* Columns */}
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                      {/* Left Column */}
                      <div
                        className="p-5 md:p-6 rounded-xl border shadow-xs flex flex-col"
                        style={{
                          backgroundColor: theme.cardBg,
                          borderColor: theme.cardBorder,
                        }}
                      >
                        <ul className="space-y-2.5 md:space-y-3">
                          {currentSlide.twoColumn.left.map((item, lIdx) => (
                            <li
                              key={lIdx}
                              className="flex items-start gap-2.5 text-xs md:text-base font-medium leading-relaxed"
                            >
                              <span
                                className="text-lg leading-none font-bold select-none shrink-0"
                                style={{ color: theme.accent }}
                              >
                                •
                              </span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Right Column */}
                      <div
                        className="p-5 md:p-6 rounded-xl border shadow-xs flex flex-col"
                        style={{
                          backgroundColor: theme.cardBg,
                          borderColor: theme.cardBorder,
                        }}
                      >
                        <ul className="space-y-2.5 md:space-y-3">
                          {currentSlide.twoColumn.right.map((item, rIdx) => (
                            <li
                              key={rIdx}
                              className="flex items-start gap-2.5 text-xs md:text-base font-medium leading-relaxed"
                            >
                              <span
                                className="text-lg leading-none font-bold select-none shrink-0"
                                style={{ color: theme.accent }}
                              >
                                •
                              </span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Layout: Standard Content Slide */
                  <div className="flex-1 flex flex-col">
                    {/* Header */}
                    <div className="mb-4 md:mb-6 pb-2 border-b" style={{ borderColor: theme.cardBorder }}>
                      <h2
                        className="text-xl md:text-3xl font-bold tracking-tight leading-tight"
                        style={{ color: theme.accent }}
                      >
                        {currentSlide.title}
                      </h2>
                      {currentSlide.subtitle && (
                        <p className="text-xs md:text-sm mt-1" style={{ color: theme.textSecondary }}>
                          {currentSlide.subtitle}
                        </p>
                      )}
                    </div>

                    {/* Content Card */}
                    <div
                      className="flex-1 p-5 md:p-7 rounded-xl border shadow-xs flex flex-col justify-center"
                      style={{
                        backgroundColor: theme.cardBg,
                        borderColor: theme.cardBorder,
                      }}
                    >
                      {currentSlide.body && (
                        <p className="text-sm md:text-lg mb-4 leading-relaxed font-medium">
                          {currentSlide.body}
                        </p>
                      )}

                      {currentSlide.bulletPoints && currentSlide.bulletPoints.length > 0 && (
                        <ul className="space-y-3 md:space-y-4">
                          {currentSlide.bulletPoints.map((bp, bpIdx) => (
                            <li
                              key={bpIdx}
                              className="flex items-start gap-3 text-sm md:text-lg font-medium leading-relaxed"
                            >
                              <span
                                className="text-xl md:text-2xl leading-none font-bold select-none shrink-0"
                                style={{ color: theme.accent }}
                              >
                                •
                              </span>
                              <span>{bp}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                {/* Canvas Footer Bar */}
                <div
                  className="mt-3 pt-2 flex items-center justify-between text-[11px] font-mono border-t border-transparent"
                  style={{ color: theme.textSecondary }}
                >
                  <span className="truncate max-w-sm">{filename.replace(/\.pptx$/i, '')}</span>
                  <span>
                    Slide {currentSlideIndex + 1} / {slides.length}
                  </span>
                </div>
              </div>

              {/* Speaker Notes Overlay */}
              {showNotes && currentSlide.notes && (
                <div
                  className="absolute bottom-0 inset-x-0 p-4 border-t backdrop-blur-md text-xs font-mono max-h-32 overflow-y-auto animate-in fade-in"
                  style={{
                    backgroundColor: theme.cardBg,
                    borderColor: theme.cardBorder,
                    color: theme.textPrimary,
                  }}
                >
                  <div className="font-bold flex items-center gap-1.5 mb-1 text-[10px] uppercase text-primary">
                    <MessageSquare className="size-3" /> Speaker Notes
                  </div>
                  {currentSlide.notes}
                </div>
              )}
            </div>

            {/* Previous Slide Floating Control (Desktop) */}
            <button
              type="button"
              disabled={currentSlideIndex === 0}
              onClick={() => setCurrentSlideIndex((prev) => Math.max(prev - 1, 0))}
              className="absolute left-6 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-card/80 border border-border shadow-md text-foreground hover:bg-card hover:scale-105 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer hidden md:flex items-center justify-center"
              title="Slide Sebelumnya (← / Panah Kiri)"
            >
              <ChevronLeft className="size-5" />
            </button>

            {/* Next Slide Floating Control (Desktop) */}
            <button
              type="button"
              disabled={currentSlideIndex === slides.length - 1}
              onClick={() => setCurrentSlideIndex((prev) => Math.min(prev + 1, slides.length - 1))}
              className="absolute right-6 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-card/80 border border-border shadow-md text-foreground hover:bg-card hover:scale-105 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer hidden md:flex items-center justify-center"
              title="Slide Berikutnya (→ / Panah Kanan)"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      )}

      {/* 3. Bottom Playback & Progress Bar */}
      <div className="h-12 px-4 border-t border-border/80 bg-card/70 backdrop-blur-sm flex items-center justify-between shrink-0 gap-4 select-none">
        {/* Prev / Next Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentSlideIndex === 0}
            onClick={() => setCurrentSlideIndex((prev) => Math.max(prev - 1, 0))}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border hover:bg-muted text-xs font-medium text-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ChevronLeft className="size-3.5" />
            <span>Prev</span>
          </button>
          <button
            type="button"
            disabled={currentSlideIndex === slides.length - 1}
            onClick={() => setCurrentSlideIndex((prev) => Math.min(prev + 1, slides.length - 1))}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer shadow-xs"
          >
            <span>Next</span>
            <ChevronRight className="size-3.5" />
          </button>
        </div>

        {/* Progress Bar & Slide Counter */}
        <div className="flex-1 max-w-md flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{
                width: `${((currentSlideIndex + 1) / slides.length) * 100}%`,
              }}
            />
          </div>
          <span className="text-xs font-mono font-medium text-muted-foreground shrink-0 min-w-16 text-center">
            {currentSlideIndex + 1} / {slides.length}
          </span>
        </div>

        {/* Extra Slide Controls */}
        <div className="flex items-center gap-2">
          {currentSlide?.notes && (
            <button
              type="button"
              onClick={() => setShowNotes((prev) => !prev)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                showNotes
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border hover:bg-muted text-muted-foreground hover:text-foreground'
              }`}
              title="Tampilkan Speaker Notes"
            >
              <MessageSquare className="size-3" />
              <span>Notes</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setCurrentSlideIndex(0)}
            className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Kembali ke Slide Pertama (Home)"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
