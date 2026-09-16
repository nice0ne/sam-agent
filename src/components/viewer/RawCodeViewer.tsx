import React, { useState } from 'react';
import { Copy, Check, WrapText } from 'lucide-react';

export interface RawCodeViewerProps {
  content: string;
}

export const RawCodeViewer: React.FC<RawCodeViewerProps> = ({ content }) => {
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);

  const lines = content.split(/\r?\n/);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Sub-toolbar */}
      <div className="h-10 px-4 border-b border-border/80 bg-muted/40 flex items-center justify-between gap-2 shrink-0 select-none text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px]">
            {lines.length} {lines.length === 1 ? 'line' : 'lines'}
          </span>
          <span className="text-border">•</span>
          <span className="font-mono text-[11px]">
            {new Blob([content]).size} bytes
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWordWrap(!wordWrap)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer border ${
              wordWrap
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted border-transparent'
            }`}
            title="Toggle word wrap"
          >
            <WrapText className="w-3.5 h-3.5" />
            <span>Wrap</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title="Copy all code"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Viewer with Sticky Line Numbers Gutter */}
      <div className="flex-1 overflow-auto bg-card font-mono text-xs select-text">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-muted/40 transition-colors group">
                {/* Sticky Line Number Gutter */}
                <td
                  className="sticky left-0 z-10 w-14 min-w-14 px-3 py-0.5 text-right select-none text-muted-foreground/50 group-hover:text-muted-foreground bg-card group-hover:bg-muted/40 border-r border-border/40 font-mono text-[11px] leading-5 align-top"
                >
                  {idx + 1}
                </td>
                {/* Code Content */}
                <td
                  className={`px-4 py-0.5 text-foreground/90 font-mono leading-5 align-top ${
                    wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
                  }`}
                >
                  {line || '\n'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RawCodeViewer;
