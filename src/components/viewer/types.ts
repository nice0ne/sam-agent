export type ViewerType =
  | 'html'
  | 'markdown'
  | 'csv'
  | 'image'
  | 'json'
  | 'mermaid'
  | 'zip'
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

  // 4. Image
  if (
    m.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|ico|svg|bmp)$/i.test(p)
  ) {
    return 'image';
  }

  // 5. JSON
  if (p.endsWith('.json') || m === 'application/json') {
    return 'json';
  }

  // 6. Mermaid Diagrams
  if (
    p.endsWith('.mmd') ||
    p.endsWith('.mermaid') ||
    (content && /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline)\b/m.test(content))
  ) {
    return 'mermaid';
  }

  // 7. ZIP Archives
  if (
    p.endsWith('.zip') ||
    m === 'application/zip' ||
    m === 'application/x-zip-compressed'
  ) {
    return 'zip';
  }

  // Default fallback
  return 'code';
}
