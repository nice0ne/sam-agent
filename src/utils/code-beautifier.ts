/**
 * Universal In-Browser Code Formatter & Beautifier
 * Supports: JSON, HTML, CSS, JavaScript, TypeScript, JSX, TSX, SVG
 */

export interface FormatResult {
  formatted: string;
  changed: boolean;
  error?: string;
}

/**
 * Formats JSON with 2-space indentation.
 */
function formatJson(code: string): FormatResult {
  try {
    const parsed = JSON.parse(code);
    const formatted = JSON.stringify(parsed, null, 2);
    return {
      formatted: formatted + '\n',
      changed: formatted.trim() !== code.trim(),
    };
  } catch (err: any) {
    return {
      formatted: code,
      changed: false,
      error: `JSON syntax error: ${err?.message || 'Invalid JSON'}`,
    };
  }
}

/**
 * Formats CSS rules and blocks.
 */
function formatCss(code: string): FormatResult {
  try {
    let clean = code.replace(/\r\n/g, '\n').trim();
    clean = clean.replace(/\s+/g, ' ');
    clean = clean.replace(/\{\s*/g, ' {\n');
    clean = clean.replace(/\s*\}\s*/g, '\n}\n\n');
    clean = clean.replace(/;\s*/g, ';\n');

    const lines = clean.split('\n');
    let indentLevel = 0;
    const indentStr = '  ';
    const resultLines: string[] = [];

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (resultLines.length > 0 && resultLines[resultLines.length - 1] !== '') {
          resultLines.push('');
        }
        continue;
      }

      if (line.startsWith('}')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      let formattedLine = line;
      if (line.includes(':') && !line.startsWith('@') && !line.startsWith('/*')) {
        const colonIdx = line.indexOf(':');
        const prop = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim();
        formattedLine = `${prop}: ${val}`;
      }

      resultLines.push(indentStr.repeat(indentLevel) + formattedLine);

      if (line.endsWith('{')) {
        indentLevel++;
      }
    }

    const formatted = resultLines.join('\n').trim() + '\n';
    return {
      formatted,
      changed: formatted !== code,
    };
  } catch (err: any) {
    return { formatted: code, changed: false, error: err?.message };
  }
}

/**
 * Formats HTML, SVG, and XML documents.
 */
function formatHtml(code: string): FormatResult {
  try {
    const voidTags = new Set([
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr', '!doctype'
    ]);

    const tokens: string[] = [];
    let idx = 0;
    const len = code.length;

    while (idx < len) {
      if (code[idx] === '<') {
        const endTag = code.indexOf('>', idx);
        if (endTag === -1) {
          tokens.push(code.slice(idx));
          break;
        }
        tokens.push(code.slice(idx, endTag + 1));
        idx = endTag + 1;
      } else {
        const nextTag = code.indexOf('<', idx);
        const text = nextTag === -1 ? code.slice(idx) : code.slice(idx, nextTag);
        const trimmed = text.trim();
        if (trimmed) {
          tokens.push(trimmed);
        }
        idx = nextTag === -1 ? len : nextTag;
      }
    }

    let indentLevel = 0;
    const indentStr = '  ';
    const outputLines: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token.startsWith('<!--')) {
        outputLines.push(indentStr.repeat(indentLevel) + token);
        continue;
      }

      if (token.startsWith('</')) {
        indentLevel = Math.max(0, indentLevel - 1);
        outputLines.push(indentStr.repeat(indentLevel) + token);
        continue;
      }

      if (token.startsWith('<')) {
        const match = token.match(/^<([a-zA-Z0-9_\-!]+)/);
        const tagName = match ? match[1].toLowerCase() : '';
        const isSelfClosing = token.endsWith('/>') || voidTags.has(tagName);

        if (
          !isSelfClosing &&
          i + 2 < tokens.length &&
          !tokens[i + 1].startsWith('<') &&
          tokens[i + 2] === `</${tagName}>`
        ) {
          outputLines.push(
            indentStr.repeat(indentLevel) + token + tokens[i + 1] + tokens[i + 2]
          );
          i += 2;
          continue;
        }

        outputLines.push(indentStr.repeat(indentLevel) + token);
        if (!isSelfClosing) {
          indentLevel++;
        }
        continue;
      }

      outputLines.push(indentStr.repeat(indentLevel) + token);
    }

    const formatted = outputLines.join('\n').trim() + '\n';
    return {
      formatted,
      changed: formatted !== code,
    };
  } catch (err: any) {
    return { formatted: code, changed: false, error: err?.message };
  }
}

/**
 * Formats JavaScript, TypeScript, and JSX.
 */
function formatJavaScript(code: string): FormatResult {
  try {
    const lines = code.replace(/\r\n/g, '\n').split('\n');
    let indentLevel = 0;
    const indentStr = '  ';
    const formattedLines: string[] = [];

    for (let rawLine of lines) {
      const trimmed = rawLine.trim();

      if (!trimmed) {
        if (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') {
          formattedLines.push('');
        }
        continue;
      }

      let leadingClosers = 0;
      for (const char of trimmed) {
        if (char === '}' || char === ')' || char === ']') {
          leadingClosers++;
        } else {
          break;
        }
      }

      const activeIndent = Math.max(0, indentLevel - (leadingClosers > 0 ? 1 : 0));
      formattedLines.push(indentStr.repeat(activeIndent) + trimmed);

      let openBraces = 0;
      let closeBraces = 0;
      let inString: string | null = null;

      for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        const prev = i > 0 ? trimmed[i - 1] : '';

        if ((ch === '"' || ch === "'" || ch === '`') && prev !== '\\') {
          if (inString === ch) {
            inString = null;
          } else if (!inString) {
            inString = ch;
          }
        }

        if (!inString) {
          if (ch === '{' || ch === '(' || ch === '[') openBraces++;
          if (ch === '}' || ch === ')' || ch === ']') closeBraces++;
        }
      }

      indentLevel = Math.max(0, indentLevel + openBraces - closeBraces);
    }

    const formatted = formattedLines.join('\n').trim() + '\n';
    return {
      formatted,
      changed: formatted !== code,
    };
  } catch (err: any) {
    return { formatted: code, changed: false, error: err?.message };
  }
}

/**
 * Main beautifier entry point that auto-detects language and formats content.
 */
export function beautifyCode(code: string, filePathOrLang = ''): FormatResult {
  if (!code || !code.trim()) {
    return { formatted: code, changed: false };
  }

  const ext = filePathOrLang.includes('.')
    ? filePathOrLang.split('.').pop()?.toLowerCase() || ''
    : filePathOrLang.toLowerCase();

  switch (ext) {
    case 'json':
      return formatJson(code);

    case 'html':
    case 'htm':
    case 'svg':
    case 'xml':
      return formatHtml(code);

    case 'css':
    case 'scss':
    case 'less':
      return formatCss(code);

    case 'js':
    case 'mjs':
    case 'cjs':
    case 'ts':
    case 'mts':
    case 'cts':
    case 'jsx':
    case 'tsx':
      return formatJavaScript(code);

    default:
      const trimmed = code.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        const jsonRes = formatJson(code);
        if (!jsonRes.error) return jsonRes;
      }
      if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
        return formatHtml(code);
      }

      const cleaned = code
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.trimEnd())
        .join('\n')
        .trim() + '\n';

      return { formatted: cleaned, changed: cleaned !== code };
  }
}
