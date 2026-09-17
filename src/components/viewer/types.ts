export type ViewerType =
  | 'html'
  | 'markdown'
  | 'csv'
  | 'image'
  | 'json'
  | 'mermaid'
  | 'zip'
  | 'svg'
  | 'audio'
  | 'log'
  | 'code';

/**
 * Resolves the appropriate viewer preview type based on file path, MIME type, and optional content sniff.
 */
export function resolveViewerType(
  path: string,
  mimeType?: string,
  content?: string
): ViewerType {
  const p = (path || '').toLowerCase();
  const m = (mimeType || '').toLowerCase();

  // 1. HTML
  if (
    p.endsWith('.html') ||
    p.endsWith('.htm') ||
    m === 'text/html' ||
    m === 'application/xhtml+xml'
  ) {
    return 'html';
  }

  // 2. Markdown
  if (p.endsWith('.md') || p.endsWith('.markdown') || m === 'text/markdown') {
    return 'markdown';
  }

  // 3. CSV
  if (p.endsWith('.csv') || m === 'text/csv') {
    return 'csv';
  }

  // 4. SVG (check before general image)
  if (p.endsWith('.svg') || m === 'image/svg+xml') {
    return 'svg';
  }

  // 5. Image
  if (
    m.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|ico|bmp)$/i.test(p)
  ) {
    return 'image';
  }

  // 6. Audio
  if (
    m.startsWith('audio/') ||
    /\.(mp3|wav|ogg|m4a|aac|flac|weba)$/i.test(p)
  ) {
    return 'audio';
  }

  // 7. JSON
  if (p.endsWith('.json') || m === 'application/json') {
    return 'json';
  }

  // 8. Mermaid Diagrams
  if (
    p.endsWith('.mmd') ||
    p.endsWith('.mermaid') ||
    (content && /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline)\b/m.test(content))
  ) {
    return 'mermaid';
  }

  // 9. ZIP Archives
  if (
    p.endsWith('.zip') ||
    m === 'application/zip' ||
    m === 'application/x-zip-compressed'
  ) {
    return 'zip';
  }

  // 10. Log Files
  if (p.endsWith('.log') || /\.(log\.[0-9]+|log\.txt)$/i.test(p)) {
    return 'log';
  }

  // Default fallback
  return 'code';
}
