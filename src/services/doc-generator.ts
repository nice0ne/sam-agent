import JSZip from 'jszip';
import { saveVfsFile } from './vfs';
import { triggerBlobDownload } from './archive';

export interface DocumentCallout {
  type?: 'info' | 'warning' | 'tip' | 'quote';
  title?: string;
  text: string;
}

export interface DocumentTable {
  headers: string[];
  rows: string[][];
}

export interface DocumentSection {
  title?: string;
  level?: 1 | 2 | 3;
  paragraphs?: string[];
  bulletPoints?: string[];
  callout?: DocumentCallout;
  table?: DocumentTable;
  html?: string;
}

export interface DocumentSpec {
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  organization?: string;
  theme?: 'corporate' | 'modern' | 'academic' | 'minimal' | 'executive';
  summary?: string;
  sections?: DocumentSection[];
  content?: string; // Optional Markdown or HTML raw body
  metadata?: Record<string, string>;
}

export interface DocThemeStyles {
  name: string;
  fontFamily: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  borderColor: string;
  headerBg: string;
  calloutBg: string;
}

export const DOC_THEMES: Record<string, DocThemeStyles> = {
  corporate: {
    name: 'Corporate Blue',
    fontFamily: "'Calibri', 'Segoe UI', Arial, sans-serif",
    primaryColor: '#1e3a8a', // Blue 900
    secondaryColor: '#2563eb', // Blue 600
    textColor: '#1e293b', // Slate 800
    borderColor: '#cbd5e1', // Slate 300
    headerBg: '#f8fafc',
    calloutBg: '#eff6ff',
  },
  modern: {
    name: 'Modern Slate',
    fontFamily: "'Segoe UI', 'Inter', -apple-system, sans-serif",
    primaryColor: '#0f172a', // Slate 900
    secondaryColor: '#0284c7', // Sky 600
    textColor: '#334155', // Slate 700
    borderColor: '#e2e8f0', // Slate 200
    headerBg: '#f1f5f9',
    calloutBg: '#f0fdf4',
  },
  academic: {
    name: 'Academic Serif',
    fontFamily: "'Times New Roman', 'Georgia', serif",
    primaryColor: '#18181b', // Zinc 900
    secondaryColor: '#4b5563', // Gray 600
    textColor: '#27272a', // Zinc 800
    borderColor: '#d4d4d8', // Zinc 300
    headerBg: '#fafafa',
    calloutBg: '#faf5ff',
  },
  executive: {
    name: 'Executive Crimson',
    fontFamily: "'Georgia', 'Calibri', serif",
    primaryColor: '#881337', // Rose 900
    secondaryColor: '#9f1239', // Rose 800
    textColor: '#1c1917', // Stone 900
    borderColor: '#e7e5e4', // Stone 200
    headerBg: '#fff1f2',
    calloutBg: '#fff7ed',
  },
  minimal: {
    name: 'Clean Minimal',
    fontFamily: "'Inter', -apple-system, sans-serif",
    primaryColor: '#111827', // Gray 900
    secondaryColor: '#4b5563', // Gray 600
    textColor: '#374151', // Gray 700
    borderColor: '#e5e7eb', // Gray 200
    headerBg: '#f9fafb',
    calloutBg: '#f3f4f6',
  },
};

function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
 * Normalizes loose agent inputs into a structured DocumentSpec
 */
export function normalizeDocumentSpec(input: any): DocumentSpec {
  if (!input || typeof input !== 'object') {
    return {
      title: 'Generated Document',
      sections: [{ paragraphs: [String(input || '')] }],
    };
  }

  const spec = input.spec || input.doc || input.document || input;

  const title = spec.title || spec.name || 'Dokumen Laporan';
  const subtitle = spec.subtitle || spec.description || '';
  const author = spec.author || spec.creator || 'SAM-Agent';
  const date =
    spec.date ||
    new Date().toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  const organization = spec.organization || spec.company || '';
  const theme = spec.theme in DOC_THEMES ? spec.theme : 'corporate';
  const summary = spec.summary || spec.executiveSummary || '';

  let sections: DocumentSection[] = [];

  if (Array.isArray(spec.sections) && spec.sections.length > 0) {
    sections = spec.sections.map((s: any) => ({
      title: s.title || '',
      level: s.level || 2,
      paragraphs: Array.isArray(s.paragraphs)
        ? s.paragraphs
        : s.content && typeof s.content === 'string'
        ? s.content.split('\n\n').filter(Boolean)
        : s.text
        ? [s.text]
        : [],
      bulletPoints: Array.isArray(s.bulletPoints) ? s.bulletPoints : s.bullets || [],
      callout: s.callout,
      table: s.table,
      html: s.html,
    }));
  } else if (spec.content && typeof spec.content === 'string') {
    // Parse markdown content into structured sections
    const rawLines = spec.content.split('\n');
    let currentSection: DocumentSection = { title: '', paragraphs: [] };

    for (const raw of rawLines) {
      const line = raw.trim();
      if (line.startsWith('# ')) {
        // Main title already handled or becomes Section 1
        if (currentSection.paragraphs && currentSection.paragraphs.length > 0) {
          sections.push(currentSection);
        }
        currentSection = { title: line.replace(/^#\s+/, ''), level: 1, paragraphs: [] };
      } else if (line.startsWith('## ')) {
        if (currentSection.paragraphs && currentSection.paragraphs.length > 0) {
          sections.push(currentSection);
        }
        currentSection = { title: line.replace(/^##\s+/, ''), level: 2, paragraphs: [] };
      } else if (line.startsWith('### ')) {
        if (currentSection.paragraphs && currentSection.paragraphs.length > 0) {
          sections.push(currentSection);
        }
        currentSection = { title: line.replace(/^###\s+/, ''), level: 3, paragraphs: [] };
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        if (!currentSection.bulletPoints) currentSection.bulletPoints = [];
        currentSection.bulletPoints.push(line.replace(/^[-*]\s+/, ''));
      } else if (line.length > 0) {
        if (!currentSection.paragraphs) currentSection.paragraphs = [];
        currentSection.paragraphs.push(line);
      }
    }
    if (
      currentSection.title ||
      (currentSection.paragraphs && currentSection.paragraphs.length > 0) ||
      (currentSection.bulletPoints && currentSection.bulletPoints.length > 0)
    ) {
      sections.push(currentSection);
    }
  }

  if (sections.length === 0) {
    sections = [
      {
        title: 'Ringkasan Eksekutif',
        level: 2,
        paragraphs: [summary || 'Dokumen berhasil diproses dan disusun oleh SAM-Agent.'],
      },
    ];
  }

  return {
    title,
    subtitle,
    author,
    date,
    organization,
    theme,
    summary,
    sections,
    content: spec.content,
    metadata: spec.metadata,
  };
}

/**
 * Generates an MSO Word HTML document string.
 * This format conforms to Microsoft Office HTML specification:
 * - Word opens it natively in Print Layout view as an editable .doc document
 * - Web browsers render it as an elegant A4 document page preview
 */
export function generateDocHtml(specInput: DocumentSpec): string {
  const spec = normalizeDocumentSpec(specInput);
  const theme = DOC_THEMES[spec.theme || 'corporate'] || DOC_THEMES.corporate;

  const sectionsHtml = (spec.sections || [])
    .map((s, idx) => {
      let html = '';

      // Section Heading
      if (s.title) {
        const headingTag = s.level === 1 ? 'h1' : s.level === 3 ? 'h3' : 'h2';
        html += `<${headingTag} class="doc-heading doc-heading-${s.level || 2}">${escapeHtml(s.title)}</${headingTag}>\n`;
      }

      // Paragraphs
      if (s.paragraphs && s.paragraphs.length > 0) {
        for (const p of s.paragraphs) {
          if (p.trim()) {
            html += `<p class="doc-p">${escapeHtml(p.trim())}</p>\n`;
          }
        }
      }

      // Bullet Points
      if (s.bulletPoints && s.bulletPoints.length > 0) {
        html += '<ul class="doc-ul">\n';
        for (const bp of s.bulletPoints) {
          html += `  <li class="doc-li">${escapeHtml(bp)}</li>\n`;
        }
        html += '</ul>\n';
      }

      // Callout Box
      if (s.callout && s.callout.text) {
        html += `
<div class="doc-callout doc-callout-${s.callout.type || 'info'}">
  ${s.callout.title ? `<div class="doc-callout-title">${escapeHtml(s.callout.title)}</div>` : ''}
  <div class="doc-callout-text">${escapeHtml(s.callout.text)}</div>
</div>\n`;
      }

      // Data Table
      if (s.table && s.table.headers && s.table.headers.length > 0) {
        html += '<table class="doc-table">\n<thead>\n  <tr>\n';
        for (const h of s.table.headers) {
          html += `    <th>${escapeHtml(h)}</th>\n`;
        }
        html += '  </tr>\n</thead>\n<tbody>\n';
        for (const row of s.table.rows || []) {
          html += '  <tr>\n';
          for (const cell of row) {
            html += `    <td>${escapeHtml(cell)}</td>\n`;
          }
          html += '  </tr>\n';
        }
        html += '</tbody>\n</table>\n';
      }

      // Raw HTML block
      if (s.html) {
        html += `<div class="doc-custom-html">${s.html}</div>\n`;
      }

      return html;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(spec.title)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page Section1 {
      size: 595.3pt 841.9pt; /* Standard A4 size: 210mm x 297mm */
      margin: 72pt 72pt 72pt 72pt; /* 1 inch margins */
      mso-header-margin: 36pt;
      mso-footer-margin: 36pt;
      mso-paper-source: 0;
    }

    div.Section1 {
      page: Section1;
      max-width: 820px;
      margin: 0 auto;
      padding: 48px 56px;
      background: #ffffff;
      box-sizing: border-box;
      min-height: 1050px;
    }

    body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      font-family: ${theme.fontFamily};
      font-size: 11pt;
      line-height: 1.6;
      color: ${theme.textColor};
      -webkit-font-smoothing: antialiased;
    }

    /* Print styling */
    @media print {
      body { background: transparent; padding: 0; }
      div.Section1 { max-width: 100%; margin: 0; padding: 0; box-shadow: none; border: none; }
    }

    /* Title Block */
    .doc-header-block {
      border-bottom: 2pt solid ${theme.primaryColor};
      padding-bottom: 18pt;
      margin-bottom: 24pt;
    }

    .doc-title {
      font-size: 26pt;
      font-weight: 700;
      color: ${theme.primaryColor};
      margin: 0 0 6pt 0;
      line-height: 1.25;
      letter-spacing: -0.02em;
    }

    .doc-subtitle {
      font-size: 13pt;
      font-weight: 400;
      color: #64748b;
      margin: 0 0 12pt 0;
      line-height: 1.4;
    }

    .doc-meta-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 16pt;
      font-size: 9.5pt;
      color: #64748b;
      font-weight: 500;
    }

    .doc-meta-item strong {
      color: ${theme.textColor};
    }

    /* Summary Box */
    .doc-summary-card {
      background-color: ${theme.calloutBg};
      border-left: 4pt solid ${theme.secondaryColor};
      border-radius: 4pt;
      padding: 14pt 18pt;
      margin: 18pt 0 24pt 0;
    }

    .doc-summary-title {
      font-size: 11pt;
      font-weight: 700;
      color: ${theme.primaryColor};
      margin-bottom: 6pt;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .doc-summary-text {
      font-size: 10.5pt;
      line-height: 1.6;
      margin: 0;
      color: ${theme.textColor};
    }

    /* Headings */
    h1.doc-heading-1 {
      font-size: 18pt;
      font-weight: 700;
      color: ${theme.primaryColor};
      margin: 22pt 0 8pt 0;
      border-bottom: 1pt solid ${theme.borderColor};
      padding-bottom: 4pt;
      page-break-after: avoid;
    }

    h2.doc-heading-2 {
      font-size: 14pt;
      font-weight: 700;
      color: ${theme.primaryColor};
      margin: 18pt 0 6pt 0;
      page-break-after: avoid;
    }

    h3.doc-heading-3 {
      font-size: 12pt;
      font-weight: 600;
      color: ${theme.secondaryColor};
      margin: 14pt 0 4pt 0;
      page-break-after: avoid;
    }

    /* Paragraphs */
    p.doc-p {
      margin: 0 0 10pt 0;
      text-align: justify;
      text-justify: inter-word;
      line-height: 1.65;
    }

    /* Lists */
    ul.doc-ul, ol.doc-ol {
      margin: 0 0 12pt 0;
      padding-left: 20pt;
    }

    li.doc-li {
      margin-bottom: 4pt;
      line-height: 1.55;
    }

    /* Callout */
    .doc-callout {
      background-color: ${theme.headerBg};
      border-left: 3.5pt solid ${theme.secondaryColor};
      border-radius: 4pt;
      padding: 10pt 14pt;
      margin: 14pt 0;
    }

    .doc-callout-title {
      font-weight: 700;
      font-size: 10pt;
      color: ${theme.primaryColor};
      margin-bottom: 4pt;
    }

    .doc-callout-text {
      font-size: 10pt;
      margin: 0;
    }

    /* Table */
    table.doc-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16pt 0;
      font-size: 10pt;
    }

    table.doc-table th {
      background-color: ${theme.headerBg};
      color: ${theme.primaryColor};
      font-weight: 700;
      text-align: left;
      padding: 8pt 10pt;
      border: 1pt solid ${theme.borderColor};
    }

    table.doc-table td {
      padding: 7pt 10pt;
      border: 1pt solid ${theme.borderColor};
      vertical-align: top;
    }

    table.doc-table tr:nth-child(even) td {
      background-color: #fafbfc;
    }

    /* Footer */
    .doc-footer-block {
      margin-top: 36pt;
      padding-top: 12pt;
      border-top: 1pt solid ${theme.borderColor};
      display: flex;
      justify-content: space-between;
      font-size: 9pt;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="Section1">
    <!-- Header / Title -->
    <div class="doc-header-block">
      <h1 class="doc-title">${escapeHtml(spec.title)}</h1>
      ${spec.subtitle ? `<div class="doc-subtitle">${escapeHtml(spec.subtitle)}</div>` : ''}
      <div class="doc-meta-bar">
        <div class="doc-meta-item">Penulis: <strong>${escapeHtml(spec.author || 'SAM-Agent')}</strong></div>
        <div class="doc-meta-item">Tanggal: <strong>${escapeHtml(spec.date || '')}</strong></div>
        ${spec.organization ? `<div class="doc-meta-item">Organisasi: <strong>${escapeHtml(spec.organization)}</strong></div>` : ''}
      </div>
    </div>

    <!-- Executive Summary if present -->
    ${
      spec.summary
        ? `<div class="doc-summary-card">
        <div class="doc-summary-title">Ringkasan Eksekutif</div>
        <p class="doc-summary-text">${escapeHtml(spec.summary)}</p>
      </div>`
        : ''
    }

    <!-- Content Sections -->
    <div class="doc-body-sections">
      ${sectionsHtml}
    </div>

    <!-- Document Footer -->
    <div class="doc-footer-block">
      <div>Disusun secara otomatis oleh <strong>SAM-Agent</strong> • Dokumen Rahasia / Internal</div>
      <div>Halaman 1</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Builds a native OpenXML `.docx` file using JSZip.
 * Output is fully compliant with ISO/IEC 29500 (OpenXML) and can be opened by Microsoft Word and docx-preview.
 */
export async function generateDocxBlob(specInput: DocumentSpec): Promise<Blob> {
  const spec = normalizeDocumentSpec(specInput);
  const zip = new JSZip();

  // 1. [Content_Types].xml
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
  );

  // 2. _rels/.rels
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  // 3. word/_rels/document.xml.rels
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );

  // 4. word/styles.xml
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:lang w:val="en-US"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr>
      <w:spacing w:after="160" w:line="276" w:lineRule="auto"/>
    </w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="360" w:after="140"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:color w:val="1E3A8A"/>
      <w:sz w:val="36"/>
      <w:szCs w:val="36"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="240" w:after="100"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:color w:val="2563EB"/>
      <w:sz w:val="28"/>
      <w:szCs w:val="28"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="180" w:after="80"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:color w:val="334155"/>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="0" w:after="160"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:color w:val="1E3A8A"/>
      <w:sz w:val="52"/>
      <w:szCs w:val="52"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="0" w:after="240"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:color w:val="64748B"/>
      <w:sz w:val="26"/>
      <w:szCs w:val="26"/>
    </w:rPr>
  </w:style>
</w:styles>`
  );

  // 5. Build word/document.xml content
  let docXmlBody = '';

  // Title
  docXmlBody += `
<w:p>
  <w:pPr><w:pStyle w:val="Title"/></w:pPr>
  <w:r><w:t>${escapeXml(spec.title)}</w:t></w:r>
</w:p>`;

  // Subtitle
  if (spec.subtitle) {
    docXmlBody += `
<w:p>
  <w:pPr><w:pStyle w:val="Subtitle"/></w:pPr>
  <w:r><w:t>${escapeXml(spec.subtitle)}</w:t></w:r>
</w:p>`;
  }

  // Metadata Line (Author & Date)
  docXmlBody += `
<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
    <w:spacing w:after="360"/>
  </w:pPr>
  <w:r>
    <w:rPr><w:color w:val="64748B"/><w:sz w:val="20"/></w:rPr>
    <w:t>${escapeXml(spec.author || 'SAM-Agent')} • ${escapeXml(spec.date || '')}${spec.organization ? ` • ${escapeXml(spec.organization)}` : ''}</w:t>
  </w:r>
</w:p>`;

  // Executive Summary Box
  if (spec.summary) {
    docXmlBody += `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="9360" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="none"/>
      <w:left w:val="single" w:sz="24" w:space="0" w:color="2563EB"/>
      <w:bottom w:val="none"/>
      <w:right w:val="none"/>
    </w:tblBorders>
    <w:shd w:val="clear" w:color="auto" w:fill="EFF6FF"/>
  </w:tblPr>
  <w:tr>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="9360" w:type="dxa"/>
        <w:tcMar><w:top w:w="160"/><w:left w:w="240"/><w:bottom w:w="160"/><w:right w:w="240"/></w:tcMar>
      </w:tcPr>
      <w:p>
        <w:pPr><w:spacing w:after="80"/></w:pPr>
        <w:r>
          <w:rPr><w:b/><w:color w:val="1E3A8A"/><w:sz w:val="22"/></w:rPr>
          <w:t>RINGKASAN EKSEKUTIF</w:t>
        </w:r>
      </w:p>
      <w:p>
        <w:pPr><w:spacing w:after="0"/></w:pPr>
        <w:r><w:t>${escapeXml(spec.summary)}</w:t></w:r>
      </w:p>
    </w:tc>
  </w:tr>
</w:tbl>
<w:p><w:pPr><w:spacing w:after="240"/></w:pPr></w:p>`;
  }

  // Sections
  for (const s of spec.sections || []) {
    if (s.title) {
      const styleId = s.level === 1 ? 'Heading1' : s.level === 3 ? 'Heading3' : 'Heading2';
      docXmlBody += `
<w:p>
  <w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>
  <w:r><w:t>${escapeXml(s.title)}</w:t></w:r>
</w:p>`;
    }

    if (s.paragraphs) {
      for (const p of s.paragraphs) {
        if (p.trim()) {
          docXmlBody += `
<w:p>
  <w:pPr><w:spacing w:after="160"/></w:pPr>
  <w:r><w:t>${escapeXml(p.trim())}</w:t></w:r>
</w:p>`;
        }
      }
    }

    if (s.bulletPoints) {
      for (const bp of s.bulletPoints) {
        docXmlBody += `
<w:p>
  <w:pPr>
    <w:ind w:left="400" w:hanging="200"/>
    <w:spacing w:after="100"/>
  </w:pPr>
  <w:r><w:t>•   ${escapeXml(bp)}</w:t></w:r>
</w:p>`;
      }
    }

    if (s.callout && s.callout.text) {
      docXmlBody += `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="9360" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="none"/>
      <w:left w:val="single" w:sz="18" w:space="0" w:color="0284C7"/>
      <w:bottom w:val="none"/>
      <w:right w:val="none"/>
    </w:tblBorders>
    <w:shd w:val="clear" w:color="auto" w:fill="F8FAFC"/>
  </w:tblPr>
  <w:tr>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="9360" w:type="dxa"/>
        <w:tcMar><w:top w:w="120"/><w:left w:w="200"/><w:bottom w:w="120"/><w:right w:w="200"/></w:tcMar>
      </w:tcPr>
      ${
        s.callout.title
          ? `<w:p><w:r><w:rPr><w:b/><w:color w:val="0F172A"/></w:rPr><w:t>${escapeXml(s.callout.title)}</w:t></w:r></w:p>`
          : ''
      }
      <w:p><w:r><w:t>${escapeXml(s.callout.text)}</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
</w:tbl>
<w:p><w:pPr><w:spacing w:after="160"/></w:pPr></w:p>`;
    }

    if (s.table && s.table.headers && s.table.headers.length > 0) {
      docXmlBody += `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="9360" w:type="dxa"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tr>
    ${s.table.headers
      .map(
        (h) => `
    <w:tc>
      <w:tcPr>
        <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
        <w:tcMar><w:top w:w="120"/><w:left w:w="140"/><w:bottom w:w="120"/><w:right w:w="140"/></w:tcMar>
      </w:tcPr>
      <w:p><w:r><w:rPr><w:b/><w:color w:val="1E3A8A"/></w:rPr><w:t>${escapeXml(h)}</w:t></w:r></w:p>
    </w:tc>`
      )
      .join('')}
  </w:tr>
  ${(s.table.rows || [])
    .map(
      (row) => `
  <w:tr>
    ${row
      .map(
        (cell) => `
    <w:tc>
      <w:tcPr>
        <w:tcMar><w:top w:w="100"/><w:left w:w="140"/><w:bottom w:w="100"/><w:right w:w="140"/></w:tcMar>
      </w:tcPr>
      <w:p><w:r><w:t>${escapeXml(cell)}</w:t></w:r></w:p>
    </w:tc>`
      )
      .join('')}
  </w:tr>`
    )
    .join('')}
</w:tbl>
<w:p><w:pPr><w:spacing w:after="200"/></w:pPr></w:p>`;
    }
  }

  // Section Properties: A4 Page Dimensions (11906 x 16838 dxa) and 1-inch margins (1440 dxa)
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${docXmlBody}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  zip.file('word/document.xml', documentXml);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

/**
 * Creates and saves document artifacts into VFS:
 * 1. /workspace/<cleanTitle>.doc (MSO Word HTML format - double clickable in MS Word)
 * 2. /workspace/<cleanTitle>.docx (Native OpenXML binary format via JSZip)
 * 3. /workspace/<cleanTitle>.html (Web document view)
 */
export async function createDocArtifact(
  specInput: any,
  baseName?: string
): Promise<{ docPath: string; docxPath: string; htmlPath: string; docxBlob: Blob }> {
  const spec = normalizeDocumentSpec(specInput);
  const cleanTitle = (baseName || spec.title || 'dokumen')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'dokumen';

  const docFilename = `${cleanTitle}.doc`;
  const docxFilename = `${cleanTitle}.docx`;
  const htmlFilename = `${cleanTitle}.html`;

  const docPath = `/workspace/${docFilename}`;
  const docxPath = `/workspace/${docxFilename}`;
  const htmlPath = `/workspace/${htmlFilename}`;

  // 1. Generate MSO Word HTML content
  const htmlContent = generateDocHtml(spec);

  // Save .doc (application/msword) into VFS
  await saveVfsFile(docPath, htmlContent, 'application/msword;charset=utf-8');

  // Save .html view into VFS
  await saveVfsFile(htmlPath, htmlContent, 'text/html;charset=utf-8');

  // 2. Generate native .docx OpenXML binary
  const docxBlob = await generateDocxBlob(spec);

  const base64DocxUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(docxBlob);
  });

  // Save .docx into VFS
  await saveVfsFile(
    docxPath,
    base64DocxUrl,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );

  return {
    docPath,
    docxPath,
    htmlPath,
    docxBlob,
  };
}
