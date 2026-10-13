import { defineContentScript } from 'wxt/sandbox';
import { createShadowRootUi } from 'wxt/client';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RecorderHUD } from './RecorderHUD';
import { computeSelectorCascade } from './selector-generator';
import { RecordedAction, RecordingStatus } from './types';

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  cssInjectionMode: 'manual',

  async main(ctx) {
    let status: RecordingStatus = 'recording';
    let actions: RecordedAction[] = [];
    const initialUrl = window.location.href;
    let inputDebounceTimer: number | null = null;
    let activeInputTarget: HTMLInputElement | HTMLTextAreaElement | null = null;
    let containerEl: HTMLElement | null = null;
    let updateHudState: ((newStatus: RecordingStatus, newCount: number) => void) | null = null;

    // Load any existing state from session storage (e.g. after full page navigation)
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        const stored = await chrome.storage.session.get(['active_workflow_recording']);
        if (stored?.active_workflow_recording) {
          const session = stored.active_workflow_recording;
          if (Array.isArray(session.actions)) {
            actions = session.actions;
          }
          if (session.status) {
            status = session.status;
          }
        }
      }
    } catch (_) {}

    const syncSession = async () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.session) {
          await chrome.storage.session.set({
            active_workflow_recording: {
              status,
              actions,
              initialUrl,
              lastUpdated: Date.now(),
            },
          });
        }
      } catch (_) {}
    };

    const addAction = (action: RecordedAction) => {
      if (status !== 'recording') return;
      actions.push(action);
      updateHudState?.(status, actions.length);
      syncSession();

      try {
        chrome.runtime.sendMessage({
          type: 'WORKFLOW_RECORDING_STEP',
          stepCount: actions.length,
          action,
        });
      } catch (_) {}
    };

    // Helper: Checks if event target is inside the recorder HUD
    const isInsideHud = (el: EventTarget | null): boolean => {
      if (!el || !containerEl) return false;
      return containerEl.contains(el as Node);
    };

    // 1. Click Listener (capture phase)
    const handleClick = (e: MouseEvent) => {
      if (status !== 'recording') return;
      const target = e.target as HTMLElement | null;
      if (!target || isInsideHud(target)) return;

      // Flush any pending text input before recording click
      if (inputDebounceTimer && activeInputTarget) {
        window.clearTimeout(inputDebounceTimer);
        flushActiveInput();
      }

      const cascade = computeSelectorCascade(target);
      addAction({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'click',
        target: cascade,
        timestamp: Date.now(),
        url: window.location.href,
      });
    };

    // 2. Input / Text Filling Listener
    const flushActiveInput = () => {
      if (!activeInputTarget) return;
      const val = activeInputTarget.value;
      const cascade = computeSelectorCascade(activeInputTarget);

      // Avoid logging empty inputs unless intended
      addAction({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'fill',
        target: cascade,
        value: val,
        timestamp: Date.now(),
        url: window.location.href,
      });
      activeInputTarget = null;
      inputDebounceTimer = null;
    };

    const handleInput = (e: Event) => {
      if (status !== 'recording') return;
      const target = e.target as HTMLElement | null;
      if (!target || isInsideHud(target)) return;

      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        // Skip password field values or mark them
        activeInputTarget = target;
        if (inputDebounceTimer) {
          window.clearTimeout(inputDebounceTimer);
        }
        inputDebounceTimer = window.setTimeout(() => {
          flushActiveInput();
        }, 350);
      }
    };

    // 3. Dropdowns & Checkboxes Listener
    const handleChange = (e: Event) => {
      if (status !== 'recording') return;
      const target = e.target as HTMLElement | null;
      if (!target || isInsideHud(target)) return;

      if (target instanceof HTMLSelectElement) {
        const cascade = computeSelectorCascade(target);
        addAction({
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'select',
          target: cascade,
          value: target.value,
          timestamp: Date.now(),
          url: window.location.href,
        });
      } else if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) {
        const cascade = computeSelectorCascade(target);
        addAction({
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'toggle',
          target: cascade,
          checked: target.checked,
          timestamp: Date.now(),
          url: window.location.href,
        });
      }
    };

    // 4. Navigation & URL Change Detection
    let lastUrl = window.location.href;
    const checkUrlChange = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        addAction({
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'navigate',
          target: { tagName: 'body', selectors: ['body'] },
          value: currentUrl,
          timestamp: Date.now(),
          url: currentUrl,
        });
      }
    };

    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      setTimeout(checkUrlChange, 100);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      setTimeout(checkUrlChange, 100);
    };

    window.addEventListener('popstate', checkUrlChange);
    window.addEventListener('hashchange', checkUrlChange);

    // Attach DOM event listeners with capture phase
    window.addEventListener('click', handleClick, true);
    window.addEventListener('input', handleInput, true);
    window.addEventListener('change', handleChange, true);

    const cleanupListeners = () => {
      window.removeEventListener('click', handleClick, true);
      window.removeEventListener('input', handleInput, true);
      window.removeEventListener('change', handleChange, true);
      window.removeEventListener('popstate', checkUrlChange);
      window.removeEventListener('hashchange', checkUrlChange);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };

    // Mount Shadow DOM UI
    const ui = await createShadowRootUi(ctx, {
      name: 'sam-workflow-recorder',
      position: 'modal',
      zIndex: 2147483647,
      anchor: 'body',
      isolateEvents: false,

      onMount(container) {
        containerEl = container;
        const root = ReactDOM.createRoot(container);

        function HUDWrapper() {
          const [hudStatus, setHudStatus] = React.useState<RecordingStatus>(status);
          const [hudCount, setHudCount] = React.useState<number>(actions.length);

          React.useEffect(() => {
            updateHudState = (s, c) => {
              setHudStatus(s);
              setHudCount(c);
            };
            return () => {
              updateHudState = null;
            };
          }, []);

          const handlePauseToggle = () => {
            const next = hudStatus === 'recording' ? 'paused' : 'recording';
            status = next;
            setHudStatus(next);
            syncSession();
          };

          const handleFinish = async () => {
            if (inputDebounceTimer && activeInputTarget) {
              window.clearTimeout(inputDebounceTimer);
              flushActiveInput();
            }

            cleanupListeners();
            try {
              if (typeof chrome !== 'undefined' && chrome.storage?.session) {
                await chrome.storage.session.remove(['active_workflow_recording']);
              }
              await chrome.runtime.sendMessage({
                type: 'WORKFLOW_RECORDING_FINISH',
                actions,
                initialUrl,
              });
            } catch (_) {}

            ui.remove();
          };

          const handleCancel = async () => {
            cleanupListeners();
            try {
              if (typeof chrome !== 'undefined' && chrome.storage?.session) {
                await chrome.storage.session.remove(['active_workflow_recording']);
              }
              await chrome.runtime.sendMessage({
                type: 'WORKFLOW_RECORDING_CANCEL',
              });
            } catch (_) {}

            ui.remove();
          };

          return (
            <RecorderHUD
              status={hudStatus}
              stepCount={hudCount}
              onPauseToggle={handlePauseToggle}
              onFinish={handleFinish}
              onCancel={handleCancel}
            />
          );
        }

        root.render(<HUDWrapper />);
        return root;
      },
      onRemove(root) {
        cleanupListeners();
        root?.unmount();
      },
    });

    ui.mount();
  },
});
