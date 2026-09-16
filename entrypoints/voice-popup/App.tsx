import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Check, X, Globe, AlertCircle, Sparkles } from 'lucide-react';

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export const App: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [lang, setLang] = useState<'id-ID' | 'en-US'>('id-ID');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  // Initialize and start recognition
  const startRecognition = useCallback(() => {
    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setError('Google Web Speech API is not supported in this browser.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;

      recognition.onstart = () => {
        setIsRecording(true);
        setError(null);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let finalStr = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const text = item[0]?.transcript || '';
          if (item.isFinal) {
            finalStr += text + ' ';
          } else {
            interim += text;
          }
        }

        if (finalStr) {
          setTranscript((prev) => {
            const next = prev ? `${prev} ${finalStr.trim()}` : finalStr.trim();
            // Send live update to sidepanel
            chrome.runtime.sendMessage({
              type: 'VOICE_TRANSCRIPT_UPDATE',
              text: next,
              isFinal: true,
            }).catch(() => {});
            return next;
          });
        }

        setInterimText(interim);
        if (interim) {
          chrome.runtime.sendMessage({
            type: 'VOICE_TRANSCRIPT_INTERIM',
            interimText: interim,
          }).catch(() => {});
        }
      };

      recognition.onerror = (event: any) => {
        const errType = event.error || '';
        console.warn('[voice-popup] Recognition error:', errType);
        if (errType === 'not-allowed') {
          setError('Akses mikrofon ditolak oleh browser. Pastikan Anda mengklik "Allow" pada prompt Chrome.');
        } else if (errType === 'no-speech') {
          // Keep listening
        } else {
          setError(`Speech error: ${errType}`);
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err: any) {
      console.warn('[voice-popup] Failed to start recognition:', err);
      setError(err.message || 'Gagal memulai rekaman suara.');
    }
  }, [lang]);

  // Request audio permission and start immediately on mount
  useEffect(() => {
    const initAudio = async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          // Request mic permission first to ensure Chrome displays prompt if needed
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          for (const track of stream.getTracks()) track.stop();
        }
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          setError('Izin mikrofon belum diberikan. Silakan pilih "Allow" saat Chrome meminta izin.');
          return;
        }
      }
      startRecognition();
    };

    initAudio();

    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {}
    };
  }, [startRecognition]);

  const handleFinish = () => {
    try {
      recognitionRef.current?.stop();
    } catch {}

    const finalText = (transcript + (interimText ? ' ' + interimText : '')).trim();
    if (finalText) {
      chrome.runtime.sendMessage({
        type: 'VOICE_TRANSCRIPT_FINAL',
        text: finalText,
      }).catch(() => {});
    }
    window.close();
  };

  const handleCancel = () => {
    try {
      recognitionRef.current?.abort();
    } catch {}
    chrome.runtime.sendMessage({
      type: 'VOICE_TRANSCRIPT_CANCELLED',
    }).catch(() => {});
    window.close();
  };

  const toggleRecording = () => {
    if (isRecording) {
      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsRecording(false);
    } else {
      startRecognition();
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-between p-5 bg-background text-foreground select-none">
      {/* Header with Language Switcher */}
      <div className="w-full flex items-center justify-between border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
            <Mic className="size-4" />
          </div>
          <span className="text-xs font-semibold tracking-tight">Voice Dictation</span>
        </div>

        {/* Language selector */}
        <div className="flex items-center bg-muted/70 p-0.5 rounded-lg border border-border/40 text-[11px]">
          <button
            type="button"
            onClick={() => {
              setLang('id-ID');
              setTimeout(() => startRecognition(), 100);
            }}
            className={`px-2 py-0.5 rounded-md font-medium transition-all ${
              lang === 'id-ID'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            ID
          </button>
          <button
            type="button"
            onClick={() => {
              setLang('en-US');
              setTimeout(() => startRecognition(), 100);
            }}
            className={`px-2 py-0.5 rounded-md font-medium transition-all ${
              lang === 'en-US'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            EN
          </button>
        </div>
      </div>

      {/* Center Wave & Live Transcript Display */}
      <div className="w-full flex-1 flex flex-col items-center justify-center my-4 space-y-4">
        {/* Pulsing Mic Visualizer */}
        <div className="relative flex items-center justify-center cursor-pointer" onClick={toggleRecording}>
          {isRecording && (
            <>
              <span className="absolute size-24 rounded-full bg-rose-500/15 animate-ping duration-1000" />
              <span className="absolute size-20 rounded-full bg-rose-500/20 animate-pulse duration-700" />
            </>
          )}
          <div
            className={`size-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
              isRecording
                ? 'bg-rose-500 text-white shadow-rose-500/30'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {isRecording ? <Mic className="size-7 animate-bounce" /> : <MicOff className="size-7" />}
          </div>
        </div>

        <p className="text-xs font-medium text-muted-foreground">
          {isRecording ? 'Mendengarkan... Silakan bicara' : 'Rekaman dijeda. Klik mic untuk lanjut'}
        </p>

        {/* Live Transcript Box */}
        <div className="w-full min-h-24 max-h-36 overflow-y-auto rounded-xl border border-border/70 bg-card/80 p-3 text-xs leading-relaxed text-foreground text-left shadow-inner">
          {transcript || interimText ? (
            <p className="space-x-1">
              <span>{transcript}</span>
              {interimText && <span className="text-muted-foreground italic font-light">"{interimText}"</span>}
            </p>
          ) : (
            <p className="text-muted-foreground/60 italic text-center pt-5">
              Ucapan suara Anda akan muncul di sini secara langsung...
            </p>
          )}
        </div>

        {error && (
          <div className="w-full p-2.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-start gap-2 text-left">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="w-full flex items-center gap-2 pt-2 border-t border-border/50">
        <button
          type="button"
          onClick={handleCancel}
          className="flex-1 py-2 px-3 border border-border rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
        >
          <X className="size-3.5" />
          <span>Batal</span>
        </button>

        <button
          type="button"
          onClick={handleFinish}
          className="flex-2 py-2 px-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-xs font-semibold shadow-md active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <Check className="size-4" />
          <span>Selesai & Masukkan ke Chat</span>
        </button>
      </div>
    </div>
  );
};
