import React, { useMemo, useCallback } from 'react';
import CodeMirror, { ViewUpdate, Extension, EditorView } from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { CursorPosition } from './types';

export interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
  path: string;
  theme?: 'dark' | 'light';
  onCursorChange?: (cursor: CursorPosition) => void;
  className?: string;
  readOnly?: boolean;
}

const customEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: '"Fira Code", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    lineHeight: '1.6',
  },
  '.cm-content': {
    fontFamily: 'inherit',
    padding: '10px 0',
  },
  '.cm-line': {
    padding: '0 12px',
  },
  '.cm-gutters': {
    fontFamily: 'inherit',
    fontSize: '11px',
    borderRight: '1px solid var(--border, rgba(120, 120, 120, 0.15))',
    backgroundColor: 'transparent',
    color: 'var(--muted-foreground, #888)',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(120, 120, 120, 0.08)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(120, 120, 120, 0.12)',
    color: 'var(--foreground, #fff)',
    fontWeight: '600',
  },
});

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  value,
  onChange,
  path,
  theme,
  onCursorChange,
  className,
  readOnly = false,
}) => {
  // Map file extension to language support extension
  const languageExtensions = useMemo<Extension[]>(() => {
    const ext = path.includes('.') ? path.split('.').pop()?.toLowerCase() || '' : '';
    switch (ext) {
      case 'js':
      case 'mjs':
      case 'jsx':
        return [javascript({ jsx: true })];
      case 'ts':
      case 'tsx':
        return [javascript({ typescript: true, jsx: true })];
      case 'html':
      case 'htm':
        return [html()];
      case 'css':
        return [css()];
      case 'json':
        return [json()];
      case 'md':
      case 'markdown':
        return [markdown()];
      case 'py':
        return [python()];
      default:
        return [];
    }
  }, [path]);

  // Combine language extensions and editor base styling
  const extensions = useMemo<Extension[]>(() => {
    return [...languageExtensions, customEditorTheme];
  }, [languageExtensions]);

  // Determine dark or light theme
  const editorTheme = useMemo(() => {
    if (theme === 'light') {
      return 'light';
    }
    if (theme === 'dark') {
      return oneDark;
    }
    // Auto-detect based on document root class if not explicitly set
    const isDark = typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : true;
    return isDark ? oneDark : 'light';
  }, [theme]);

  // Handle cursor and selection change tracking
  const handleUpdate = useCallback(
    (viewUpdate: ViewUpdate) => {
      if (!onCursorChange) return;
      if (viewUpdate.selectionSet || viewUpdate.docChanged) {
        const main = viewUpdate.state.selection.main;
        const line = viewUpdate.state.doc.lineAt(main.head);
        const column = main.head - line.from + 1;
        const selectionLength = Math.abs(main.to - main.from);
        onCursorChange({
          line: line.number,
          column,
          selectionLength,
        });
      }
    },
    [onCursorChange]
  );

  const handleCreateEditor = useCallback(
    (view: EditorView) => {
      if (!onCursorChange) return;
      const main = view.state.selection.main;
      const line = view.state.doc.lineAt(main.head);
      const column = main.head - line.from + 1;
      const selectionLength = Math.abs(main.to - main.from);
      onCursorChange({
        line: line.number,
        column,
        selectionLength,
      });
    },
    [onCursorChange]
  );

  return (
    <div className={`h-full w-full overflow-hidden font-mono text-xs ${className || ''}`}>
      <CodeMirror
        value={value}
        height="100%"
        className="h-full w-full"
        theme={editorTheme}
        extensions={extensions}
        readOnly={readOnly}
        editable={!readOnly}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightSpecialChars: true,
          history: true,
          foldGutter: true,
          drawSelection: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          syntaxHighlighting: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          crosshairCursor: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          defaultKeymap: true,
          searchKeymap: true,
          historyKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true,
        }}
        onChange={onChange}
        onUpdate={handleUpdate}
        onCreateEditor={handleCreateEditor}
      />
    </div>
  );
};

export default CodeMirrorEditor;
