import { defineContentScript } from 'wxt/sandbox';

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
    __ict_speech_recognition?: any;
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    let recognition: any = null;
    let accumulatedFinal = '';

    const stopRecognition = () => {
      if (recognition) {
        try {
          recognition.abort();
        } catch {}
        recognition = null;
      }
      accumulatedFinal = '';
    };

    const startRecognition = (lang = 'id-ID') => {
      stopRecognition();

      const SpeechRecognitionClass =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognitionClass) {
        chrome.runtime.sendMessage({
          type: 'VOICE_BRIDGE_ERROR',
          error: 'Google Web Speech API tidak didukung di tab ini.',
        }).catch(() => {});
        return;
      }

      try {
        recognition = new SpeechRecognitionClass();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = lang;

        recognition.onstart = () => {
          chrome.runtime.sendMessage({
            type: 'VOICE_BRIDGE_STARTED',
          }).catch(() => {});
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
            accumulatedFinal = accumulatedFinal
              ? `${accumulatedFinal} ${newlyFinal.trim()}`
              : newlyFinal.trim();
          }

          const fullCombined = (
            accumulatedFinal + (currentInterim ? ' ' + currentInterim : '')
          ).trim();

          chrome.runtime.sendMessage({
            type: 'VOICE_BRIDGE_RESULT',
            text: fullCombined,
            interim: currentInterim,
            isFinal: !!newlyFinal,
          }).catch(() => {});
        };

        recognition.onerror = (event: any) => {
          const err = event.error || '';
          console.warn('[speech-bridge] Error:', err);

          let msg = 'Terjadi kendala pengenalan suara.';
          if (err === 'not-allowed') {
            msg = 'Izin mikrofon diperlukan pada halaman web ini. Klik ikon mic/kamera di address bar untuk mengizinkan.';
          } else if (err === 'no-speech') {
            // keep listening
            return;
          }

          chrome.runtime.sendMessage({
            type: 'VOICE_BRIDGE_ERROR',
            error: msg,
          }).catch(() => {});
        };

        recognition.onend = () => {
          chrome.runtime.sendMessage({
            type: 'VOICE_BRIDGE_ENDED',
            finalText: accumulatedFinal,
          }).catch(() => {});
        };

        recognition.start();
        window.__ict_speech_recognition = recognition;
      } catch (err: any) {
        console.warn('[speech-bridge] Failed to start:', err);
        chrome.runtime.sendMessage({
          type: 'VOICE_BRIDGE_ERROR',
          error: err.message || 'Gagal memulai speech recognition.',
        }).catch(() => {});
      }
    };

    // Listen to control messages from Sidepanel
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'START_PAGE_SPEECH') {
        startRecognition(message.lang || 'id-ID');
        sendResponse({ success: true });
        return true;
      } else if (message?.type === 'STOP_PAGE_SPEECH') {
        stopRecognition();
        sendResponse({ success: true });
        return true;
      }
    });
  },
});
