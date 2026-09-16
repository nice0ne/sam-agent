import pptxgen from 'pptxgenjs';
import { saveVfsFile } from './vfs';

export interface SlideSpec {
  title: string;
  subtitle?: string;
  bulletPoints?: string[];
  body?: string;
  keyStat?: { value: string; label: string };
  twoColumn?: { left: string[]; right: string[] };
  layout?: 'title' | 'content' | 'two-column' | 'stat' | 'conclusion';
  notes?: string;
}

export interface ThemeColors {
  name: string;
  bg: string;
  cardBg: string;
  text: string;
  mutedText: string;
  primary: string;
  accent: string;
  border: string;
  fontFace?: string;
  isDark?: boolean;
}

export type PresetThemeName =
  | 'modern-dark'
  | 'corporate-blue'
  | 'vibrant-emerald'
  | 'minimal-light'
  | 'sunset-warm'
  | 'royal-purple'
  | 'midnight-oled'
  | 'elegant-cream';

export interface PresentationSpec {
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  theme?: PresetThemeName;
  customTheme?: Partial<ThemeColors>;
  fontFamily?: string;
  slides: SlideSpec[];
}

export const THEMES: Record<PresetThemeName, ThemeColors> = {
  'modern-dark': {
    name: 'Modern Dark',
    bg: '0F172A', // Slate 900
    cardBg: '1E293B', // Slate 800
    text: 'F8FAFC',
    mutedText: '94A3B8',
    primary: '38BDF8', // Sky 400
    accent: '818CF8', // Indigo 400
    border: '334155',
    fontFace: 'Arial',
    isDark: true,
  },
  'corporate-blue': {
    name: 'Corporate Blue',
    bg: 'F8FAFC', // Slate 50
    cardBg: 'FFFFFF',
    text: '0F172A',
    mutedText: '64748B',
    primary: '1D4ED8', // Blue 700
    accent: '0284C7', // Sky 600
    border: 'E2E8F0',
    fontFace: 'Calibri',
    isDark: false,
  },
  'vibrant-emerald': {
    name: 'Vibrant Emerald',
    bg: '064E3B', // Emerald 900
    cardBg: '065F46', // Emerald 800
    text: 'ECFDF5',
    mutedText: 'A7F3D0',
    primary: '34D399', // Emerald 400
    accent: '6EE7B7',
    border: '047857',
    fontFace: 'Segoe UI',
    isDark: true,
  },
  'minimal-light': {
    name: 'Minimal Light',
    bg: 'FFFFFF',
    cardBg: 'F4F4F5',
    text: '18181B',
    mutedText: '71717A',
    primary: '2563EB',
    accent: '4F46E5',
    border: 'E4E4E7',
    fontFace: 'Inter',
    isDark: false,
  },
  'sunset-warm': {
    name: 'Sunset Warm',
    bg: 'FFFBEB', // Amber 50
    cardBg: 'FFFFFF',
    text: '451A03', // Amber 950
    mutedText: '92400E', // Amber 800
    primary: 'EA580C', // Orange 600
    accent: 'D97706', // Amber 600
    border: 'FDE68A',
    fontFace: 'Georgia',
    isDark: false,
  },
  'royal-purple': {
    name: 'Royal Purple',
    bg: '1E1B4B', // Indigo 950
    cardBg: '312E81', // Indigo 900
    text: 'FAF5FF',
    mutedText: 'C084FC', // Purple 400
    primary: 'A855F7', // Purple 500
    accent: 'E879F9', // Fuchsia 400
    border: '4338CA',
    fontFace: 'Segoe UI',
    isDark: true,
  },
  'midnight-oled': {
    name: 'Midnight OLED',
    bg: '000000', // Pure Black
    cardBg: '111111',
    text: 'FFFFFF',
    mutedText: '888888',
    primary: '00E5FF', // Electric Cyan
    accent: 'FF007F', // Neon Magenta
    border: '222222',
    fontFace: 'Helvetica',
    isDark: true,
  },
  'elegant-cream': {
    name: 'Elegant Cream',
    bg: 'FDFBF7', // Luxury Warm Cream
    cardBg: 'FFFFFF',
    text: '292524', // Warm Stone 800
    mutedText: '78716C',
    primary: '0F766E', // Deep Teal
    accent: 'B45309', // Warm Bronze
    border: 'E7E5E4',
    fontFace: 'Georgia',
    isDark: false,
  },
};

/**
 * Resolve effective theme colors with support for preset and custom overrides
 */
export function resolveTheme(spec: PresentationSpec): ThemeColors {
  const presetKey = spec.theme && THEMES[spec.theme] ? spec.theme : 'modern-dark';
  const base = THEMES[presetKey];

  if (!spec.customTheme) {
    return {
      ...base,
      fontFace: spec.fontFamily || base.fontFace,
    };
  }

  const cleanHex = (color?: string, fallback = '000000') => {
    if (!color) return fallback;
    return color.replace(/^#/, '').trim().toUpperCase();
  };

  return {
    name: spec.customTheme.name || `${base.name} (Custom)`,
    bg: spec.customTheme.bg ? cleanHex(spec.customTheme.bg, base.bg) : base.bg,
    cardBg: spec.customTheme.cardBg ? cleanHex(spec.customTheme.cardBg, base.cardBg) : base.cardBg,
    text: spec.customTheme.text ? cleanHex(spec.customTheme.text, base.text) : base.text,
    mutedText: spec.customTheme.mutedText ? cleanHex(spec.customTheme.mutedText, base.mutedText) : base.mutedText,
    primary: spec.customTheme.primary ? cleanHex(spec.customTheme.primary, base.primary) : base.primary,
    accent: spec.customTheme.accent ? cleanHex(spec.customTheme.accent, base.accent) : base.accent,
    border: spec.customTheme.border ? cleanHex(spec.customTheme.border, base.border) : base.border,
    fontFace: spec.customTheme.fontFace || spec.fontFamily || base.fontFace,
    isDark: spec.customTheme.isDark !== undefined ? spec.customTheme.isDark : base.isDark,
  };
}

/**
 * Generate a standard Microsoft PowerPoint (.pptx) binary Blob from presentation specification
 */
export async function generatePptxBlob(spec: PresentationSpec): Promise<Blob> {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.title = spec.title;
  pres.author = spec.author || 'SAM-Agent';

  const theme = resolveTheme(spec);
  const fontFace = theme.fontFace || 'Arial';

  // 1. Title Slide
  const titleSlide = pres.addSlide();
  titleSlide.background = { color: theme.bg };

  // Decorative accent bar
  titleSlide.addShape(pres.ShapeType.rect, {
    x: 0.8,
    y: 1.8,
    w: 0.15,
    h: 2.8,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
  });

  // Main title
  titleSlide.addText(spec.title, {
    x: 1.2,
    y: 1.8,
    w: 11.0,
    h: 1.6,
    fontSize: 40,
    fontFace,
    bold: true,
    color: theme.primary,
    valign: 'middle',
  });

  // Subtitle / Description
  if (spec.subtitle) {
    titleSlide.addText(spec.subtitle, {
      x: 1.2,
      y: 3.5,
      w: 11.0,
      h: 0.9,
      fontSize: 20,
      fontFace,
      color: theme.mutedText,
    });
  }

  // Footer metadata on title slide
  const dateStr = spec.date || new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  titleSlide.addText(`${spec.author || 'SAM-Agent'} • ${dateStr}`, {
    x: 1.2,
    y: 6.2,
    w: 10.0,
    h: 0.4,
    fontSize: 12,
    fontFace,
    color: theme.mutedText,
  });

  // 2. Content Slides
  for (let i = 0; i < spec.slides.length; i++) {
    const s = spec.slides[i];
    const slide = pres.addSlide();
    slide.background = { color: theme.bg };

    // Slide Header: Title
    slide.addText(s.title, {
      x: 0.8,
      y: 0.5,
      w: 11.5,
      h: 0.8,
      fontSize: 28,
      fontFace,
      bold: true,
      color: theme.primary,
    });

    // Subtitle if available
    if (s.subtitle) {
      slide.addText(s.subtitle, {
        x: 0.8,
        y: 1.3,
        w: 11.5,
        h: 0.4,
        fontSize: 14,
        fontFace,
        color: theme.mutedText,
      });
    }

    // Header divider line
    slide.addShape(pres.ShapeType.line, {
      x: 0.8,
      y: 1.75,
      w: 11.5,
      h: 0,
      line: { color: theme.border, width: 1 },
    });

    // Slide Layout rendering
    const startY = s.subtitle ? 2.0 : 1.9;

    if (s.layout === 'stat' && s.keyStat) {
      // Big Stat callout card
      slide.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: startY,
        w: 4.5,
        h: 4.2,
        fill: { color: theme.cardBg },
        line: { color: theme.border, width: 1 },
        rectRadius: 0.15,
      });

      slide.addText(s.keyStat.value, {
        x: 1.0,
        y: startY + 0.8,
        w: 4.1,
        h: 1.5,
        fontSize: 54,
        fontFace,
        bold: true,
        color: theme.accent,
        align: 'center',
      });

      slide.addText(s.keyStat.label, {
        x: 1.0,
        y: startY + 2.4,
        w: 4.1,
        h: 0.8,
        fontSize: 16,
        fontFace,
        color: theme.mutedText,
        align: 'center',
      });

      // Side bullets or body
      if (s.bulletPoints && s.bulletPoints.length > 0) {
        const bulletItems = s.bulletPoints.map((bp) => ({
          text: bp,
          options: { fontSize: 16, color: theme.text, bullet: true, spaceAfter: 12 },
        }));
        slide.addText(bulletItems, {
          x: 5.8,
          y: startY,
          w: 6.5,
          h: 4.2,
          fontFace,
        });
      }
    } else if (s.layout === 'two-column' && s.twoColumn) {
      // Two-column layout
      slide.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: startY,
        w: 5.5,
        h: 4.2,
        fill: { color: theme.cardBg },
        line: { color: theme.border, width: 1 },
        rectRadius: 0.15,
      });
      const leftItems = s.twoColumn.left.map((bp) => ({
        text: bp,
        options: { fontSize: 15, color: theme.text, bullet: true, spaceAfter: 10 },
      }));
      slide.addText(leftItems, {
        x: 1.1,
        y: startY + 0.3,
        w: 4.9,
        h: 3.6,
        fontFace,
      });

      slide.addShape(pres.ShapeType.roundRect, {
        x: 6.8,
        y: startY,
        w: 5.5,
        h: 4.2,
        fill: { color: theme.cardBg },
        line: { color: theme.border, width: 1 },
        rectRadius: 0.15,
      });
      const rightItems = s.twoColumn.right.map((bp) => ({
        text: bp,
        options: { fontSize: 15, color: theme.text, bullet: true, spaceAfter: 10 },
      }));
      slide.addText(rightItems, {
        x: 7.1,
        y: startY + 0.3,
        w: 4.9,
        h: 3.6,
        fontFace,
      });
    } else {
      // Standard content card with bullets and body
      slide.addShape(pres.ShapeType.roundRect, {
        x: 0.8,
        y: startY,
        w: 11.5,
        h: 4.4,
        fill: { color: theme.cardBg },
        line: { color: theme.border, width: 1 },
        rectRadius: 0.15,
      });

      const textParts: any[] = [];
      if (s.body) {
        textParts.push({
          text: s.body,
          options: { fontSize: 17, color: theme.text, spaceAfter: 14 },
        });
      }
      if (s.bulletPoints) {
        s.bulletPoints.forEach((bp) => {
          textParts.push({
            text: bp,
            options: { fontSize: 16, color: theme.text, bullet: true, spaceAfter: 10 },
          });
        });
      }

      slide.addText(textParts, {
        x: 1.2,
        y: startY + 0.4,
        w: 10.7,
        h: 3.6,
        fontFace,
      });
    }

    // Slide footer (slide number & title)
    slide.addText(`${i + 1} / ${spec.slides.length}`, {
      x: 11.0,
      y: 6.6,
      w: 1.3,
      h: 0.3,
      fontSize: 10,
      fontFace,
      color: theme.mutedText,
      align: 'right',
    });

    if (s.notes) {
      slide.addNotes(s.notes);
    }
  }

  // Export as Blob
  const blobOutput = (await pres.write({ outputType: 'blob' })) as Blob;
  return blobOutput;
}

/**
 * Generate interactive HTML slide deck for live preview in viewer.html
 */
export function generateInteractiveHtmlSlides(spec: PresentationSpec, pptxDownloadName?: string): string {
  const theme = resolveTheme(spec);
  const isDark = theme.isDark !== false;
  const hex = (c: string) => (c.startsWith('#') ? c : `#${c}`);

  const colorBg = hex(theme.bg);
  const colorCard = hex(theme.cardBg);
  const colorText = hex(theme.text);
  const colorMuted = hex(theme.mutedText);
  const colorPrimary = hex(theme.primary);
  const colorAccent = hex(theme.accent);
  const colorBorder = hex(theme.border);
  const fontFace = theme.fontFace || 'Inter, system-ui, sans-serif';

  const slidesDataJson = JSON.stringify([
    {
      type: 'title',
      title: spec.title,
      subtitle: spec.subtitle || '',
      author: spec.author || 'SAM-Agent',
      date: spec.date || new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    },
    ...spec.slides.map((s, idx) => ({
      type: s.layout || 'content',
      slideNum: idx + 1,
      totalSlides: spec.slides.length,
      title: s.title,
      subtitle: s.subtitle || '',
      body: s.body || '',
      bulletPoints: s.bulletPoints || [],
      keyStat: s.keyStat,
      twoColumn: s.twoColumn,
    })),
  ]);

  return `<!DOCTYPE html>
<html lang="en" class="${isDark ? 'dark' : ''}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(spec.title)} - Presentation</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Georgia&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${fontFace}, 'Inter', system-ui, -apple-system, sans-serif;
      background: ${isDark ? '#090d16' : '#f1f5f9'};
      color: ${colorText};
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      height: 52px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid ${isDark ? '#1e293b' : '#e2e8f0'};
      background: ${isDark ? '#0f172a' : '#ffffff'};
      flex-shrink: 0;
    }
    .main-stage {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      position: relative;
    }
    .slide-canvas {
      width: 100%;
      max-width: 1080px;
      aspect-ratio: 16 / 9;
      background: ${colorCard};
      border: 1px solid ${colorBorder};
      border-radius: 16px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
      padding: 48px;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
      transition: all 0.25s ease;
    }
    .footer-bar {
      height: 56px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid ${isDark ? '#1e293b' : '#e2e8f0'};
      background: ${isDark ? '#0f172a' : '#ffffff'};
      flex-shrink: 0;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid ${isDark ? '#334155' : '#cbd5e1'};
      background: ${isDark ? '#1e293b' : '#ffffff'};
      color: inherit;
      transition: all 0.15s ease;
    }
    .btn:hover {
      background: ${isDark ? '#334155' : '#f8fafc'};
    }
    .btn-primary {
      background: ${colorPrimary};
      border-color: ${colorPrimary};
      color: #ffffff;
    }
    .btn-primary:hover { filter: brightness(0.9); }
    .progress-track {
      flex: 1;
      height: 4px;
      background: ${isDark ? '#334155' : '#e2e8f0'};
      margin: 0 20px;
      border-radius: 2px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: ${colorPrimary};
      transition: width 0.3s ease;
    }
    ul.bullets {
      margin-top: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      list-style-type: none;
    }
    ul.bullets li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      font-size: 18px;
      line-height: 1.5;
      color: ${colorText};
    }
    ul.bullets li::before {
      content: "•";
      color: ${colorAccent};
      font-size: 24px;
      line-height: 1;
    }
  </style>
</head>
<body>
  <header>
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="font-weight: 700; font-size: 14px; color: ${colorPrimary};">📽️ Presentation</span>
      <span style="font-size: 13px; color: ${isDark ? '#94a3b8' : '#64748b'};">${escapeHtml(spec.title)}</span>
      <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; background: ${colorBorder}; color: ${colorMuted}; font-weight: 600;">${escapeHtml(theme.name)}</span>
    </div>
    <div style="display: flex; align-items: center; gap: 8px;">
      ${
        pptxDownloadName
          ? `<a href="${encodeURI(pptxDownloadName)}" download class="btn btn-primary">⬇️ Download .PPTX</a>`
          : ''
      }
      <button class="btn" onclick="toggleFullscreen()">⛶ Fullscreen</button>
    </div>
  </header>

  <main class="main-stage">
    <div id="slideCanvas" class="slide-canvas">
      <!-- Slide content injected by JS -->
    </div>
  </main>

  <footer class="footer-bar">
    <button class="btn" onclick="prevSlide()">← Prev</button>
    <div class="progress-track">
      <div id="progressBar" class="progress-fill" style="width: 0%;"></div>
    </div>
    <span id="slideCounter" style="font-family: monospace; font-size: 13px; min-width: 80px; text-align: center;">1 / 1</span>
    <button class="btn btn-primary" onclick="nextSlide()">Next →</button>
  </footer>

  <script>
    const slides = ${slidesDataJson};
    let currentIndex = 0;

    function renderSlide(index) {
      const s = slides[index];
      const canvas = document.getElementById('slideCanvas');
      const counter = document.getElementById('slideCounter');
      const progress = document.getElementById('progressBar');

      counter.textContent = (index + 1) + ' / ' + slides.length;
      progress.style.width = (((index + 1) / slides.length) * 100) + '%';

      if (s.type === 'title') {
        canvas.innerHTML = \`
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center;">
            <div style="border-left: 6px solid ${colorPrimary}; padding-left: 24px;">
              <h1 style="font-size: 42px; font-weight: 800; line-height: 1.2; color: ${colorPrimary}; margin-bottom: 16px;">\${escapeXml(s.title)}</h1>
              \${s.subtitle ? \`<p style="font-size: 22px; color: ${colorMuted}; margin-bottom: 24px;">\${escapeXml(s.subtitle)}</p>\` : ''}
              <div style="font-size: 14px; color: ${colorMuted}; font-weight: 500;">
                \${escapeXml(s.author)} • \${escapeXml(s.date)}
              </div>
            </div>
          </div>
        \`;
        return;
      }

      let innerHtml = \`
        <div>
          <h2 style="font-size: 30px; font-weight: 700; color: ${colorPrimary}; margin-bottom: 6px;">\${escapeXml(s.title)}</h2>
          \${s.subtitle ? \`<p style="font-size: 15px; color: ${colorMuted};">\${escapeXml(s.subtitle)}</p>\` : ''}
          <hr style="margin: 16px 0 24px 0; border: none; border-top: 1px solid ${colorBorder};" />
        </div>
      \`;

      if (s.type === 'stat' && s.keyStat) {
        innerHtml += \`
          <div style="display: grid; grid-template-columns: 320px 1fr; gap: 32px; flex: 1; align-items: center;">
            <div style="background: ${colorBg}; border: 1px solid ${colorBorder}; border-radius: 14px; padding: 32px; text-align: center;">
              <div style="font-size: 56px; font-weight: 800; color: ${colorAccent}; line-height: 1;">\${escapeXml(s.keyStat.value)}</div>
              <div style="font-size: 16px; color: ${colorMuted}; margin-top: 12px;">\${escapeXml(s.keyStat.label)}</div>
            </div>
            <div>
              \${s.body ? \`<p style="font-size: 18px; line-height: 1.6; margin-bottom: 16px; color: ${colorText};">\${escapeXml(s.body)}</p>\` : ''}
              \${s.bulletPoints && s.bulletPoints.length > 0 ? \`
                <ul class="bullets">
                  \${s.bulletPoints.map(b => '<li><span>' + escapeXml(b) + '</span></li>').join('')}
                </ul>
              \` : ''}
            </div>
          </div>
        \`;
      } else if (s.type === 'two-column' && s.twoColumn) {
        innerHtml += \`
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; flex: 1;">
            <div style="background: ${colorBg}; border: 1px solid ${colorBorder}; border-radius: 12px; padding: 24px;">
              <ul class="bullets" style="margin-top: 0;">
                \${s.twoColumn.left.map(b => '<li><span>' + escapeXml(b) + '</span></li>').join('')}
              </ul>
            </div>
            <div style="background: ${colorBg}; border: 1px solid ${colorBorder}; border-radius: 12px; padding: 24px;">
              <ul class="bullets" style="margin-top: 0;">
                \${s.twoColumn.right.map(b => '<li><span>' + escapeXml(b) + '</span></li>').join('')}
              </ul>
            </div>
          </div>
        \`;
      } else {
        innerHtml += \`
          <div style="flex: 1;">
            \${s.body ? \`<p style="font-size: 19px; line-height: 1.6; margin-bottom: 20px; color: ${colorText};">\${escapeXml(s.body)}</p>\` : ''}
            \${s.bulletPoints && s.bulletPoints.length > 0 ? \`
              <ul class="bullets">
                \${s.bulletPoints.map(b => '<li><span>' + escapeXml(b) + '</span></li>').join('')}
              </ul>
            \` : ''}
          </div>
        \`;
      }

      canvas.innerHTML = innerHtml;
    }

    function nextSlide() {
      if (currentIndex < slides.length - 1) {
        currentIndex++;
        renderSlide(currentIndex);
      }
    }

    function prevSlide() {
      if (currentIndex > 0) {
        currentIndex--;
        renderSlide(currentIndex);
      }
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        nextSlide();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        prevSlide();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    });

    function escapeXml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    renderSlide(0);
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate both a standard .pptx binary and an interactive web slide deck,
 * saving both into VFS under /workspace/<baseName>.pptx and /workspace/<baseName>.html
 */
export async function createPresentationArtifact(
  spec: PresentationSpec,
  baseName?: string
): Promise<{ pptxPath: string; htmlPath: string; pptxBlob: Blob }> {
  const cleanTitle = (baseName || spec.title || 'presentation')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 36);

  const pptxFilename = `${cleanTitle}.pptx`;
  const pptxPath = `/workspace/${pptxFilename}`;
  const htmlPath = `/workspace/${cleanTitle}.html`;

  // 1. Generate PPTX binary Blob
  const pptxBlob = await generatePptxBlob(spec);

  // Convert blob to base64 Data URL for binary VFS storage
  const base64DataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(pptxBlob);
  });

  // Save .pptx into VFS
  await saveVfsFile(pptxPath, base64DataUrl, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

  // 2. Generate interactive HTML slides
  const htmlContent = generateInteractiveHtmlSlides(spec, pptxFilename);
  await saveVfsFile(htmlPath, htmlContent, 'text/html');

  return {
    pptxPath,
    htmlPath,
    pptxBlob,
  };
}
