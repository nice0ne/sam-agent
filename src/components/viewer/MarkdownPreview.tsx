import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { Copy, Check, AlertCircle } from 'lucide-react';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
});

export interface MarkdownPreviewProps {
  content: string;
}

const MermaidBlock: React.FC<{ code: string }> = ({ code }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const renderDiagram = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        const { svg: renderedSvg } = await mermaid.render(id, code.trim());
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Failed to render Mermaid diagram');
        }
      }
    };

    renderDiagram();
    return () => {
      isMounted = false;
    };
  }, [code]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (error) {
    return (
      <div className="p-4 my-3 border border-destructive/40 bg-destructive/10 rounded-xl text-destructive text-xs font-mono select-text">
        <div className="flex items-center gap-2 font-semibold mb-2">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <span>Mermaid Syntax Error</span>
        </div>
        <p className="text-muted-foreground text-[11px] mb-2">{error}</p>
        <pre className="p-2.5 bg-background/80 rounded-lg overflow-x-auto whitespace-pre border border-destructive/20 text-[11px] leading-relaxed">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div className="relative group my-4 rounded-xl border border-border bg-card/60 p-4 transition-all">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] flex items-center gap-1 shadow-xs cursor-pointer z-10"
        title="Copy diagram source"
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-emerald-500 font-medium">Copied</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
            <span>Copy source</span>
          </>
        )}
      </button>
      <div
        ref={containerRef}
        className="flex justify-center overflow-x-auto select-none py-2 [&>svg]:max-w-full [&>svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
};

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content }) => {
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);

  const handleCopyCode = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeIdx(idx);
    setTimeout(() => setCopiedCodeIdx(null), 1800);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-8 select-text">
      <div className="markdown-content text-sm leading-relaxed text-foreground space-y-3">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Headings
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold text-foreground mt-6 mb-3 border-b border-border/80 pb-2">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-bold text-foreground mt-5 mb-2.5 border-b border-border/50 pb-1.5">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-base font-semibold text-foreground mt-4 mb-2">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-sm font-semibold text-foreground mt-3 mb-1.5">
                {children}
              </h4>
            ),

            // Paragraphs & Lists
            p: ({ children }) => (
              <p className="mb-2 leading-relaxed text-foreground/95">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-outside pl-5 space-y-1 mb-3 text-foreground/90">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-outside pl-5 space-y-1 mb-3 text-foreground/90">{children}</ol>
            ),
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,

            // Blockquotes
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-primary/70 bg-muted/40 pl-4 py-2 my-3 rounded-r-lg text-muted-foreground italic">
                {children}
              </blockquote>
            ),

            // Horizontal Rule
            hr: () => <hr className="my-6 border-border" />,

            // Tables
            table: ({ children }) => (
              <div className="overflow-x-auto my-4 rounded-xl border border-border shadow-xs">
                <table className="w-full text-xs text-left border-collapse">{children}</table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-muted/80 text-foreground font-semibold border-b border-border">{children}</thead>
            ),
            th: ({ children }) => (
              <th className="px-3.5 py-2.5 font-semibold text-foreground">{children}</th>
            ),
            td: ({ children }) => (
              <td className="px-3.5 py-2 border-t border-border/50 text-foreground/90">{children}</td>
            ),

            // Code & Mermaid
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              const lang = match ? match[1] : '';
              const codeText = String(children).replace(/\n$/, '');

              if (lang === 'mermaid') {
                return <MermaidBlock code={codeText} />;
              }

              if (match || codeText.includes('\n')) {
                const codeIdx = Math.abs(codeText.length * 31 + codeText.charCodeAt(0));
                const isCopied = copiedCodeIdx === codeIdx;

                return (
                  <div className="relative group my-3 rounded-xl border border-border bg-card/80 overflow-hidden shadow-xs">
                    <div className="flex items-center justify-between px-3.5 py-1.5 bg-muted/60 border-b border-border text-[11px] text-muted-foreground font-mono">
                      <span className="font-semibold uppercase tracking-wider text-[10px] text-primary">
                        {lang || 'CODE'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyCode(codeText, codeIdx)}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-muted text-[11px]"
                        title="Copy code"
                      >
                        {isCopied ? (
                          <>
                            <Check className="size-3 text-emerald-500" />
                            <span className="text-emerald-500 text-[10px] font-medium">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span className="text-[10px]">Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-3.5 overflow-x-auto text-xs font-mono text-foreground leading-relaxed bg-background/50">
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  </div>
                );
              }

              return (
                <code
                  className="bg-muted/80 text-primary border border-border/50 px-1.5 py-0.5 rounded-md text-xs font-mono break-all"
                  {...props}
                >
                  {children}
                </code>
              );
            },

            // Links
            a: ({ href, children, ...props }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 font-medium hover:opacity-80 transition-opacity"
                {...props}
              >
                {children}
              </a>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default MarkdownPreview;
