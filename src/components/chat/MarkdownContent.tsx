import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, ExternalLink, Download, FileCode } from 'lucide-react';

interface MarkdownContentProps {
  content: string;
  isUser?: boolean;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = React.memo(({ content, isUser = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);

  const handleCopyCode = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 1800);
  };

  return (
    <div
      ref={containerRef}
      className={`markdown-content text-xs leading-relaxed select-text space-y-2.5 ${
        isUser ? 'text-white' : 'text-foreground'
      }`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className={`text-sm font-bold mt-3 mb-1 border-b pb-1 ${isUser ? 'text-white border-white/20' : 'text-foreground border-border/60'}`}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className={`text-xs font-bold mt-2.5 mb-1 ${isUser ? 'text-white' : 'text-foreground'}`}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className={`text-xs font-semibold mt-2 mb-0.5 ${isUser ? 'text-white' : 'text-foreground'}`}>
              {children}
            </h3>
          ),
          
          // Paragraphs & Lists
          p: ({ children }) => (
            <p className={`mb-1.5 last:mb-0 leading-relaxed ${isUser ? 'text-white' : 'text-foreground/95'}`}>
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className={`list-disc list-outside pl-4 space-y-1 mb-2 ${isUser ? 'text-white/95' : 'text-foreground/90'}`}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className={`list-decimal list-outside pl-4 space-y-1 mb-2 ${isUser ? 'text-white/95' : 'text-foreground/90'}`}>
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className={`border-l-2 pl-3 py-1 my-2 rounded-r italic ${isUser ? 'border-white/50 bg-white/10 text-white/90' : 'border-primary/60 bg-muted/30 text-muted-foreground'}`}>
              {children}
            </blockquote>
          ),

          // Tables
          table: ({ children }) => (
            <div className={`overflow-x-auto my-3 rounded-lg border ${isUser ? 'border-white/25' : 'border-border'}`}>
              <table className="w-full text-[11px] text-left border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className={`${isUser ? 'bg-white/15 text-white border-b border-white/20' : 'bg-muted/70 text-foreground font-semibold border-b border-border'}`}>
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className={`px-2.5 py-1.5 font-semibold ${isUser ? 'text-white' : 'text-foreground'}`}>{children}</th>
          ),
          td: ({ children }) => (
            <td className={`px-2.5 py-1.5 ${isUser ? 'border-t border-white/15 text-white/95' : 'border-t border-border/50 text-foreground/90'}`}>{children}</td>
          ),

          // Code block & inline code
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const lang = match ? match[1] : '';
            const codeText = String(children).replace(/\n$/, '');

            if (match || codeText.includes('\n')) {
              const codeIdx = Math.abs(codeText.length * 31 + codeText.charCodeAt(0));
              const isCopied = copiedCodeIdx === codeIdx;

              return (
                <div className={`relative group my-2.5 rounded-xl border overflow-hidden shadow-xs ${isUser ? 'border-white/20 bg-black/30' : 'border-border bg-card/80'}`}>
                  <div className={`flex items-center justify-between px-3 py-1 border-b text-[11px] font-mono ${isUser ? 'bg-white/10 border-white/15 text-white/80' : 'bg-muted/60 border-border text-muted-foreground'}`}>
                    <span className={`font-semibold uppercase tracking-wider text-[10px] ${isUser ? 'text-blue-200' : 'text-primary'}`}>{lang || 'CODE'}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(codeText, codeIdx)}
                      className={`inline-flex items-center gap-1 transition-colors cursor-pointer px-1.5 py-0.5 rounded ${isUser ? 'hover:bg-white/20 text-white/80 hover:text-white' : 'hover:text-foreground hover:bg-muted'}`}
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
                  <pre className={`p-3 overflow-x-auto text-[11px] font-mono leading-relaxed ${isUser ? 'text-white/95 bg-black/20' : 'text-foreground bg-background/50'}`}>
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              );
            }

            return (
              <code className={`${isUser ? 'bg-white/20 text-white border border-white/30' : 'bg-muted/80 text-primary border border-border/50'} px-1.5 py-0.5 rounded-md text-[11px] font-mono break-all`} {...props}>
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
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 my-0.5 rounded-md border text-xs font-mono align-middle ${isUser ? 'border-white/25 bg-white/15 text-white' : 'border-border bg-muted/50 text-foreground'}`}>
                  <FileCode className={`size-3.5 ${isUser ? 'text-blue-200' : 'text-primary'}`} />
                  <span className="font-medium">{fileName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?path=${encodeURIComponent(filePath)}`) });
                    }}
                    className={`p-1 rounded cursor-pointer ${isUser ? 'hover:bg-white/20 text-white/80 hover:text-white' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
                    title="Open in Viewer"
                  >
                    <ExternalLink className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      chrome.runtime.sendMessage({ type: 'VFS_DOWNLOAD', path: filePath });
                    }}
                    className={`p-1 rounded cursor-pointer ${isUser ? 'hover:bg-white/20 text-white/80 hover:text-white' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
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
                className={`${isUser ? 'text-blue-100 hover:text-white' : 'text-primary hover:opacity-80'} underline font-medium`}
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
