import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseSpeechRecognitionOptions {
  lang?: string;
  onResult?: (transcript: string, isFinal?: boolean) => void;
}

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  resetTranscript: () => void;
  openPopupFallback: () => void;
}

export function useSpeechRecognition({
  lang = 'id-ID',
  onResult,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);
  const accumulatedFinalRef = useRef('');
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // Check if Web Speech API is supported in this browser context
  const isSupported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Listen to messages from fallback popup (if opened as alternative)
  useEffect(() => {
    const handleMessage = (msg: any) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'VOICE_TRANSCRIPT_FINAL') {
        const text = msg.text || '';
        setTranscript(text);
        onResultRef.current?.(text, true);
        setIsListening(false);
        setInterimTranscript('');
      } else if (msg.type === 'VOICE_TRANSCRIPT_UPDATE') {
        const text = msg.text || '';
        setTranscript(text);
        onResultRef.current?.(text, msg.isFinal);
      } else if (msg.type === 'VOICE_TRANSCRIPT_INTERIM') {
        setInterimTranscript(msg.interimText || '');
      }
    };

    chrome.runtime?.onMessage?.addListener(handleMessage);
    return () => {
      chrome.runtime?.onMessage?.removeListener(handleMessage);
    };
  }, []);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    setIsListening(false);
    setInterimTranscript('');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  const startListening = useCallback(async () => {
    setError(null);
    setInterimTranscript('');
    accumulatedFinalRef.current = '';

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setError('Web Speech API tidak didukung di browser ini.');
      return;
    }

    // Direct microphone permission check & prompt in Sidepanel
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release audio stream immediately; we only need to verify and trigger Chrome permission prompt
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch (permErr: any) {
      console.warn('[useSpeechRecognition] getUserMedia check:', permErr);
      if (
        permErr?.name === 'NotAllowedError' ||
        permErr?.name === 'PermissionDeniedError' ||
        permErr?.message?.includes('Permission')
      ) {
        setError('Izin mikrofon diperlukan. Klik "Beri Izin Mic" untuk mengizinkan akses.');
        return;
      }
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
        setIsListening(true);
        shouldListenRef.current = true;
        setError(null);
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let newlyFinal = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const text = item[0]?.transcript || '';
          if (item.isFinal) {
            newlyFinal += text + ' ';
          } else {
            currentInterim += text;
          }
        }

        if (newlyFinal) {
          accumulatedFinalRef.current = accumulatedFinalRef.current
            ? `${accumulatedFinalRef.current} ${newlyFinal.trim()}`
            : newlyFinal.trim();
        }

        const combined = (
          accumulatedFinalRef.current + (currentInterim ? ' ' + currentInterim : '')
        ).trim();

        setTranscript(combined);
        setInterimTranscript(currentInterim);
        onResultRef.current?.(combined, !!newlyFinal);
      };

      recognition.onerror = (event: any) => {
        const err = event.error || '';
        if (err === 'no-speech') {
          // Normal pause during listening, ignore
          return;
        }
        if (err === 'not-allowed') {
          setError('Akses mikrofon ditolak oleh browser. Klik "Beri Izin Mic" untuk mengizinkan.');
          shouldListenRef.current = false;
          setIsListening(false);
          return;
        }
        if (err === 'audio-capture') {
          setError('Perangkat mikrofon tidak ditemukan.');
          shouldListenRef.current = false;
          setIsListening(false);
          return;
        }
        console.warn('[useSpeechRecognition] Recognition error:', err);
        setError(`Kendala suara: ${err}`);
      };

      recognition.onend = () => {
        // If listening mode is still active, automatically reconnect for continuous speech
        if (shouldListenRef.current) {
          try {
            recognition.start();
          } catch {
            setIsListening(false);
            shouldListenRef.current = false;
          }
        } else {
          setIsListening(false);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      shouldListenRef.current = true;
      setIsListening(true);
    } catch (err: any) {
      console.error('[useSpeechRecognition] Start error:', err);
      setError(err.message || 'Gagal memulai mikrofon langsung di sidepanel.');
      setIsListening(false);
      shouldListenRef.current = false;
    }
  }, [lang]);

  const toggleListening = useCallback(() => {
    if (isListening || shouldListenRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const resetTranscript = useCallback(() => {
    accumulatedFinalRef.current = '';
    setTranscript('');
    setInterimTranscript('');
  }, []);

  const openPopupFallback = useCallback(() => {
    chrome.windows?.create?.({
      url: chrome.runtime.getURL('voice-popup.html'),
      type: 'popup',
      width: 400,
      height: 460,
      focused: true,
    });
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    error,
    startListening,
    stopListening,
    toggleListening,
    resetTranscript,
    openPopupFallback,
  };
}
