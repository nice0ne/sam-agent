import React, { useState } from 'react';
import { Copy, Check, FileText, Eye } from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';
import { ToolCallCard } from './ToolCallCard';
import type { ThreadMessage } from '../../types/agent';

interface MessageBubbleProps {
  message: ThreadMessage;
  isWaiting?: boolean;
  hostedModel?: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isWaiting = false, hostedModel = '' }) => {
  const [isCopied, setIsCopied] = useState(false);

  // Extract all text content from the message parts for copying
  const fullTextContent = message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join('\n\n');

  const handleCopy = () => {
    if (!fullTextContent) return;
    navigator.clipboard.writeText(fullTextContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const isUser = message.role === 'user';

  return (
    <div className={`group relative flex w-full my-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`relative max-w-[88%] rounded-2xl px-4 py-3 shadow-2xs transition-all select-text ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-xs shadow-xs border border-primary/20'
            : 'bg-card border border-border text-foreground rounded-tl-xs shadow-xs w-full'
        } ${isWaiting ? 'animate-streaming-glow' : ''}`}
      >
        {isWaiting ? (
          <div className="flex items-center gap-2.5 py-1 text-xs text-muted-foreground select-none">
            <div className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-primary animate-typing-dot-1" />
              <span className="size-2 rounded-full bg-primary animate-typing-dot-2" />
              <span className="size-2 rounded-full bg-primary animate-typing-dot-3" />
            </div>
            <span className="text-[11px] font-mono tracking-tight text-foreground/75">
              Thinking with {hostedModel}...
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {message.parts.map((part, pIdx) => {
              if (part.type === 'text') {
                return <MarkdownContent key={pIdx} content={part.text} />;
              }
              if (part.type === 'file') {
                const isImg =
                  part.mediaType?.startsWith('image/') ||
                  /\.(png|jpe?g|webp|gif|svg)$/i.test(part.filename || '');
                return (
                  <div
                    key={pIdx}
                    className={`my-1.5 p-2.5 rounded-xl border max-w-sm ${
                      isUser
                        ? 'bg-black/15 border-white/20 text-primary-foreground'
                        : 'bg-muted/60 border-border text-foreground'
                    }`}
                  >
                    {isImg ? (
                      <div className="space-y-1.5">
                        <img
                          src={part.url}
                          alt={part.filename || 'Attached image'}
                          className="max-h-56 max-w-full rounded-lg object-contain bg-black/20 border border-white/10"
                        />
                        <div className="flex items-center justify-between text-[11px] font-mono opacity-80">
                          <span className="truncate max-w-[180px]">{part.filename || 'image'}</span>
                          {part.size && <span>{Math.round(part.size / 1024) || 1} KB</span>}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`p-1.5 rounded-lg shrink-0 ${
                              isUser ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                            }`}
                          >
                            <FileText className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{part.filename || 'Document'}</p>
                            <p className="text-[10px] font-mono opacity-70">
                              {part.size ? `${Math.round(part.size / 1024) || 1} KB` : 'Attached file'}
                            </p>
                          </div>
                        </div>
                        {part.url && (
                          <button
                            type="button"
                            onClick={() => {
                              if (part.url.startsWith('data:')) {
                                const w = window.open('');
                                w?.document.write(
                                  `<iframe src="${part.url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
                                );
                              } else {
                                chrome?.tabs?.create?.({
                                  url: `viewer.html?path=/workspace/uploads/${encodeURIComponent(
                                    part.filename || ''
                                  )}`,
                                });
                              }
                            }}
                            className={`p-1 rounded-md transition-colors cursor-pointer shrink-0 ${
                              isUser
                                ? 'hover:bg-white/20 text-white'
                                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                            title="View file"
                          >
                            <Eye className="size-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              }
              if (part.type === 'tool-call') {
                return <ToolCallCard key={part.toolCallId || pIdx} toolPart={part} />;
              }
              if (part.type === 'reasoning') {
                return (
                  <details key={pIdx} className="my-2 text-xs text-muted-foreground border-l-2 border-primary/60 bg-primary/5 rounded-r-lg p-2.5">
                    <summary className="cursor-pointer font-medium text-primary hover:text-primary/80 select-none flex items-center gap-1.5">
                      <span>Reasoning Process</span>
                    </summary>
                    <div className="mt-1.5 text-foreground/85 leading-relaxed italic whitespace-pre-wrap pl-1">{part.text}</div>
                  </details>
                );
              }
              return null;
            })}
          </div>
        )}

        {/* Copy Button Toolbar on Hover (for assistant messages or user messages with text) */}
        {!isWaiting && fullTextContent && (
          <div
            className={`absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 ${
              isUser ? 'text-primary-foreground/80 hover:text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <button
              type="button"
              onClick={handleCopy}
              className={`p-1 rounded-md transition-colors cursor-pointer text-[10px] flex items-center gap-1 backdrop-blur-xs ${
                isUser
                  ? 'bg-black/20 hover:bg-black/30'
                  : 'bg-muted/80 hover:bg-muted border border-border/60 shadow-2xs'
              }`}
              title="Copy message content"
            >
              {isCopied ? (
                <>
                  <Check className="size-3 text-emerald-400" />
                  <span className="text-[10px] text-emerald-400 font-mono">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  <span className="text-[10px] font-mono">Copy</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
