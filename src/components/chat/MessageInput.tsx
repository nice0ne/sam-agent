import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Square,
  Paperclip,
  Globe,
  MousePointerClick,
  Code,
  Sparkles,
  RotateCw,
  FileText,
  FileSpreadsheet,
  Presentation,
  CheckCircle2,
  AlertCircle,
  Mic,
  MicOff,
  X,
} from 'lucide-react';
import { getActiveTab, isRestrictedUrl } from '../../services/page-reader';
import { QuickPromptChips } from './QuickPromptChips';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { detectMimeType } from '../../services/vfs';
import { isOfficeDocument, extractOfficeText, getOfficeDocType } from '../../services/office-parser';
import type { AttachedFilePayload } from '../../types/agent';

interface MessageInputProps {
  onSend: (prompt: string, files?: AttachedFilePayload[], includePageContext?: boolean) => void;
  onStop: () => void;
  isStreaming?: boolean;
}

interface ActiveTabSummary {
  id?: number;
  title: string;
  url: string;
  favIconUrl?: string;
  isRestricted: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({ onSend, onStop, isStreaming = false }) => {
  const [text, setText] = useState('');
  const [includePageContext, setIncludePageContext] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTabSummary | null>(null);
  const [isRefreshingTab, setIsRefreshingTab] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [showQuickPrompts, setShowQuickPrompts] = useState(false);
  const baseTextRef = useRef('');

  // Attached Files State & Ref
  const [attachedFiles, setAttachedFiles] = useState<AttachedFilePayload[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: AttachedFilePayload[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const isOffice = isOfficeDocument(file.name);
      const officeType = isOffice ? getOfficeDocType(file.name) : undefined;
      const isText =
        !isOffice &&
        (file.type.startsWith('text/') ||
        /\.(txt|md|markdown|csv|json|js|ts|tsx|jsx|py|html|css|yaml|yml|log|xml)$/i.test(file.name));

      let extractedText: string | undefined;
      let wordCount: number | undefined;

      if (isOffice) {
        try {
          const parsedDoc = await extractOfficeText(file, file.name);
          extractedText = parsedDoc.text;
          wordCount = parsedDoc.wordCount;
        } catch (parseErr) {
          console.warn('[MessageInput] Failed to extract text from Office document:', file.name, parseErr);
        }
      }

      try {
        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          if (isText) {
            reader.readAsText(file);
          } else {
            reader.readAsDataURL(file);
          }
        });

        newItems.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type || detectMimeType(file.name),
          content,
          isImage,
          isPdf,
          isOfficeDoc: isOffice,
          officeType: officeType === 'unknown' ? undefined : officeType,
          extractedText,
          wordCount,
        });
      } catch (err) {
        console.warn('[MessageInput] Failed to read file:', file.name, err);
      }
    }

    setAttachedFiles((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachedFile = (id?: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Speech Recognition Hook (Google Web Speech API directly in Sidepanel)
  const {
    isListening,
    interimTranscript,
    isSupported: isSpeechSupported,
    error: speechError,
    toggleListening,
    stopListening,
    openPopupFallback,
  } = useSpeechRecognition({
    onResult: (transcriptText) => {
      const base = baseTextRef.current;
      setText(base ? `${base} ${transcriptText}` : transcriptText);
    },
  });

  const handleToggleListening = () => {
    if (!isListening) {
      baseTextRef.current = text.trim();
    }
    toggleListening();
  };

  // Function to query currently active tab
  const fetchActiveTab = useCallback(async () => {
    setIsRefreshingTab(true);
    try {
      const tab = await getActiveTab();
      if (tab) {
        const url = tab.url || '';
        const title = tab.title || '';
        const favIconUrl = tab.favIconUrl || '';
        const isRestricted = isRestrictedUrl(url);

        setActiveTab({
          id: tab.id,
          title,
          url,
          favIconUrl,
          isRestricted,
        });
      } else {
        setActiveTab(null);
      }
    } catch (err) {
      console.warn('[MessageInput] Failed to query tab:', err);
    } finally {
      setTimeout(() => setIsRefreshingTab(false), 300);
    }
  }, []);

  // Poll / listen to tab updates & focus changes
  useEffect(() => {
    fetchActiveTab();

    const handleTabActivated = () => fetchActiveTab();
    const handleTabUpdated = (_: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status === 'complete' || changeInfo.title || changeInfo.url) {
        fetchActiveTab();
      }
    };
    const handleWindowFocus = () => fetchActiveTab();

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.onActivated?.addListener(handleTabActivated);
      chrome.tabs.onUpdated?.addListener(handleTabUpdated);
    }
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.onActivated?.removeListener(handleTabActivated);
        chrome.tabs.onUpdated?.removeListener(handleTabUpdated);
      }
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [fetchActiveTab]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim() || attachedFiles.length > 0) {
        const promptToSend = text.trim() || 'Please analyze the attached document(s)/file(s).';
        baseTextRef.current = '';
        stopListening();
        onSend(promptToSend, attachedFiles.length > 0 ? attachedFiles : undefined, includePageContext);
        setText('');
        setAttachedFiles([]);
      }
    }
  };

  // Format domain for clean display
  const getDomain = (urlStr: string) => {
    try {
      const u = new URL(urlStr);
      return u.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-1.5">
      {/* Collapsible Quick Prompts Carousel (only when explicitly toggled on) */}
      {showQuickPrompts && !isListening && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-150 pb-1">
          <QuickPromptChips
            onSelectPrompt={(prompt) => {
              setText(prompt);
              setShowQuickPrompts(false);
            }}
          />
        </div>
      )}

      {/* Voice Listening & Interim Transcript Banner */}
      {isListening && (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span className="font-medium text-[11px] truncate">
              {interimTranscript ? `"${interimTranscript}"` : 'Mendengarkan bahasa Indonesia... Silakan bicara'}
            </span>
          </div>
          <button
            type="button"
            onClick={stopListening}
            className="text-[10px] font-semibold underline hover:opacity-80 shrink-0 ml-2 cursor-pointer"
          >
            Selesai
          </button>
        </div>
      )}

      {/* Voice Error Banner */}
      {speechError && (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="size-3.5 shrink-0" />
            <span className="text-[11px] truncate">{speechError}</span>
          </div>
          <button
            type="button"
            onClick={openPopupFallback}
            className="text-[10px] font-semibold underline hover:opacity-80 shrink-0 ml-2 cursor-pointer"
          >
            Beri Izin Mic
          </button>
        </div>
      )}

      {/* Main Input Box */}
      <div className="relative rounded-xl border border-border bg-card/90 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 shadow-xs transition-all">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelection}
          multiple
          className="hidden"
          accept=".txt,.md,.markdown,.csv,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.xml,.yaml,.yml,.log,.pdf,.png,.jpg,.jpeg,.webp,.gif,.svg,.docx,.xlsx,.pptx,.doc,.xls,.ppt"
        />

        {/* Attached Files Preview Bar */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-1.5 border-b border-border/40 max-h-28 overflow-y-auto">
            {attachedFiles.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/80 border border-border text-xs text-foreground max-w-xs group animate-in fade-in zoom-in-95"
              >
                {f.isImage ? (
                  <img src={f.content} alt={f.name} className="size-4 rounded object-cover" />
                ) : f.officeType === 'docx' ? (
                  <FileText className="size-3.5 text-blue-400 shrink-0" />
                ) : f.officeType === 'xlsx' ? (
                  <FileSpreadsheet className="size-3.5 text-emerald-400 shrink-0" />
                ) : f.officeType === 'pptx' ? (
                  <Presentation className="size-3.5 text-orange-400 shrink-0" />
                ) : (
                  <FileText className="size-3.5 text-primary shrink-0" />
                )}
                <span className="truncate max-w-[120px] text-[11px] font-medium">{f.name}</span>
                {f.wordCount !== undefined && f.wordCount > 0 ? (
                  <span className="text-[10px] text-emerald-500/90 font-mono shrink-0">
                    ({f.wordCount} words)
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                    ({Math.round(f.size / 1024) || 1} KB)
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachedFile(f.id)}
                  className="text-muted-foreground hover:text-foreground p-0.5 rounded-sm ml-0.5 cursor-pointer"
                  title="Remove file"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isListening
              ? 'Mendengarkan ucapan suara Anda...'
              : attachedFiles.length > 0
              ? 'Add instructions for the attached file(s) or press Send...'
              : activeTab && !activeTab.isRestricted && includePageContext
              ? `Ask about "${activeTab.title.slice(0, 25)}..." or instruct automation`
              : 'Ask SAM-Agent or instruct browser automation...'
          }
          rows={1}
          className="w-full resize-none bg-transparent px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none max-h-36 leading-relaxed"
        />

        <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-border/40 text-xs">
          <div className="flex items-center gap-1">
            {/* Attach Document/File Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`p-1 rounded-md transition-colors cursor-pointer relative ${
                attachedFiles.length > 0
                  ? 'text-primary bg-primary/10 border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title="Attach document or file (TXT, CSV, JSON, PDF, Image, etc.)"
            >
              <Paperclip className="size-3.5" />
              {attachedFiles.length > 0 && (
                <span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">
                  {attachedFiles.length}
                </span>
              )}
            </button>

            {/* Toggle Read Active Page Context */}
            <button
              type="button"
              onClick={() => {
                if (!activeTab?.isRestricted) {
                  setIncludePageContext(!includePageContext);
                }
              }}
              disabled={activeTab?.isRestricted}
              className={`px-1.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                activeTab?.isRestricted
                  ? 'opacity-35 cursor-not-allowed text-muted-foreground'
                  : includePageContext
                  ? 'text-primary bg-primary/10 border border-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title={
                activeTab?.isRestricted
                  ? 'Internal browser tab (Context unavailable)'
                  : includePageContext
                  ? `Read Page Context: ON (${activeTab?.title?.slice(0, 25) || 'Page'}...)`
                  : 'Read Page Context: OFF'
              }
            >
              <Globe className="size-3.5" />
              <span className="text-[10px] hidden xs:inline font-medium">
                {activeTab?.isRestricted ? 'Restricted' : includePageContext ? 'Page Context' : 'No Page'}
              </span>
            </button>

            {/* Toggle Quick Prompt Suggestions */}
            <button
              type="button"
              onClick={() => setShowQuickPrompts(!showQuickPrompts)}
              className={`px-1.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                showQuickPrompts
                  ? 'text-amber-500 bg-amber-500/15 border border-amber-500/25'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title={showQuickPrompts ? 'Hide quick prompts' : 'Show quick prompt ideas'}
            >
              <Sparkles className="size-3.5" />
              <span className="text-[10px] hidden xs:inline font-medium">Prompts</span>
            </button>

            {/* Google Web Speech Mic Button */}
            {isSpeechSupported && (
              <button
                type="button"
                onClick={handleToggleListening}
                className={`p-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                  isListening
                    ? 'text-rose-500 bg-rose-500/15 animate-pulse ring-1 ring-rose-500/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                title={isListening ? 'Stop voice recording' : 'Bicara dengan Mikrofon (Google Web Speech)'}
              >
                {isListening ? (
                  <>
                    <MicOff className="size-3.5 text-rose-500" />
                    <span className="text-[10px] font-medium text-rose-500 pr-0.5 hidden xs:inline">Listening</span>
                  </>
                ) : (
                  <Mic className="size-3.5" />
                )}
              </button>
            )}
          </div>

          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="flex items-center gap-1 px-2.5 py-1 bg-destructive text-destructive-foreground hover:opacity-90 rounded-lg text-xs font-medium cursor-pointer shadow-xs active:scale-95 transition-all"
            >
              <Square className="size-3" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (text.trim() || attachedFiles.length > 0) {
                  const promptToSend = text.trim() || 'Please analyze the attached document(s)/file(s).';
                  baseTextRef.current = '';
                  stopListening();
                  onSend(promptToSend, attachedFiles.length > 0 ? attachedFiles : undefined, includePageContext);
                  setText('');
                  setAttachedFiles([]);
                }
              }}
              disabled={!text.trim() && attachedFiles.length === 0}
              className="flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed rounded-lg text-xs font-medium cursor-pointer shadow-xs active:scale-95 transition-all"
            >
              <Send className="size-3" />
              <span>Send</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
