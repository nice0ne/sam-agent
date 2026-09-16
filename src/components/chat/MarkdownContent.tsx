import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, ExternalLink, Download, FileCode } from 'lucide-react';

interface MarkdownContentProps {
  content: string;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = React.memo(({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);

  const handleCopyCode = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 1800);
  };

  return (
    <div ref={containerRef} className="markdown-content text-xs leading-relaxed text-foreground select-text space-y-2.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children }) => <h1 className="text-sm font-bold text-foreground mt-3 mb-1 border-b border-border/60 pb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xs font-bold text-foreground mt-2.5 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xs font-semibold text-foreground mt-2 mb-0.5">{children}</h3>,
          
          // Paragraphs & Lists
          p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed text-foreground/95">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-outside pl-4 space-y-1 mb-2 text-foreground/90">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-outside pl-4 space-y-1 mb-2 text-foreground/90">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/60 bg-muted/30 pl-3 py-1 my-2 rounded-r text-muted-foreground italic">
              {children}
            </blockquote>
          ),

          // Tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-border">
              <table className="w-full text-[11px] text-left border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/70 text-foreground font-semibold border-b border-border">{children}</thead>,
          th: ({ children }) => <th className="px-2.5 py-1.5 font-semibold text-foreground">{children}</th>,
          td: ({ children }) => <td className="px-2.5 py-1.5 border-t border-border/50 text-foreground/90">{children}</td>,

          // Code block & inline code
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const lang = match ? match[1] : '';
            const codeText = String(children).replace(/\n$/, '');

            if (match || codeText.includes('\n')) {
              const codeIdx = Math.abs(codeText.length * 31 + codeText.charCodeAt(0));
              const isCopied = copiedCodeIdx === codeIdx;

              return (
                <div className="relative group my-2.5 rounded-xl border border-border bg-card/80 overflow-hidden shadow-xs">
                  <div className="flex items-center justify-between px-3 py-1 bg-muted/60 border-b border-border text-[11px] text-muted-foreground font-mono">
                    <span className="font-semibold uppercase tracking-wider text-[10px] text-primary">{lang || 'CODE'}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(codeText, codeIdx)}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-muted"
                      title="Copy code"
                    >
                      {isCopied ? (
                        <>
                          <Check className="size-3 text-emerald-400" />
                          <span className="text-emerald-400 text-[10px]">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span className="text-[10px]">Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3 overflow-x-auto text-[11px] font-mono text-foreground leading-relaxed bg-background/50">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              );
            }

            return (
              <code className="bg-muted/80 text-primary border border-border/50 px-1.5 py-0.5 rounded-md text-[11px] font-mono break-all" {...props}>
                {children}
              </code>
            );
          },

          // Links
          a({ href, children, ...props }) {
            if (href?.startsWith('dobrowser://')) {
              const filePath = href.replace('dobrowser://', '');
              const fileName = filePath.split('/').pop() || filePath;
              return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 my-0.5 rounded-md border border-border bg-muted/50 text-xs font-mono align-middle">
                  <FileCode className="size-3.5 text-primary" />
                  <span className="font-medium text-foreground">{fileName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?path=${encodeURIComponent(filePath)}`) });
                    }}
                    className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Open in Viewer"
                  >
                    <ExternalLink className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      chrome.runtime.sendMessage({ type: 'VFS_DOWNLOAD', path: filePath });
                    }}
                    className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Download file"
                  >
                    <Download className="size-3" />
                  </button>
                </span>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!window.confirm(`Open link in new tab?\n\n${href}`)) {
                    e.preventDefault();
                  }
                }}
                className="text-primary underline font-medium hover:opacity-80"
                {...props}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
