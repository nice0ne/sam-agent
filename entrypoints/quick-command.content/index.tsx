import { defineContentScript } from 'wxt/sandbox';
import { createShadowRootUi } from 'wxt/client';
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { Search, Sparkles, X } from 'lucide-react';

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime', // Injected on-demand via background.js command
  cssInjectionMode: 'manual',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'ict-quick-command',
      position: 'modal',
      zIndex: 2147483647,
      anchor: 'body',
      isolateEvents: ['keydown', 'keyup', 'keypress'],

      onMount(container) {
        const root = ReactDOM.createRoot(container);
        root.render(
          <QuickCommandModal
            onClose={() => ui.remove()}
            onSubmit={(prompt) => {
              chrome.runtime.sendMessage({
                type: 'QUICK_COMMAND_SUBMIT',
                prompt,
              });
              ui.remove();
            }}
          />
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});

function QuickCommandModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (prompt: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 flex items-start justify-center pt-24 bg-black/50 backdrop-blur-xs font-sans">
      <div className="w-full max-w-xl bg-card text-card-foreground border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center px-4 py-3 border-b border-border gap-2.5">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && prompt.trim()) {
                e.preventDefault();
                onSubmit(prompt.trim());
              }
            }}
            placeholder="Ask SAM-Agent or describe an automation task..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-3 py-2 bg-muted/40 text-[11px] font-mono text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Sparkles className="size-3 text-primary" /> Press Enter to send to Sidepanel
          </span>
          <span>ESC to dismiss</span>
        </div>
      </div>
    </div>
  );
}
